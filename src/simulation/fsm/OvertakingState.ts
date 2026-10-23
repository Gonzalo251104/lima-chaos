import type { VehicleAgent } from '../entities/VehicleAgent';
import { BoardingState } from './BoardingState';
import { CruisingState } from './CruisingState';
import { InspectedState } from './InspectedState';
import { VehicleSimulationContext, VehicleState } from './VehicleState';

/**
 * "Correteo" state: boosts vehicle speed by +30% to overtake rival vehicles on the same edge
 * before reaching the next bus stop, at the cost of +45% fuel consumption.
 */
export class OvertakingState implements VehicleState {
  public static readonly CORRETEO_SPEED_BOOST = 1.3;
  public static readonly CORRETEO_FUEL_MULTIPLIER = 1.45;

  public readonly name = 'OVERTAKING' as const;
  private readonly rivalVehicleId: string;

  constructor(rivalVehicleId: string = 'rival') {
    this.rivalVehicleId = rivalVehicleId;
  }

  public enter(vehicle: VehicleAgent, context: VehicleSimulationContext): void {
    const edge = vehicle.getCurrentEdge();
    if (edge) {
      context.eventBus?.emit('vehicle:correteo-started', {
        vehicleId: vehicle.id,
        rivalVehicleId: this.rivalVehicleId,
        edgeId: edge.id,
      });
    }
  }

  public update(
    vehicle: VehicleAgent,
    deltaSec: number,
    context: VehicleSimulationContext,
  ): void {
    const edge = vehicle.getCurrentEdge();
    if (!edge) {
      vehicle.changeState(new CruisingState(), context);
      return;
    }

    if (!vehicle.isCorreteoEnabled()) {
      vehicle.changeState(new CruisingState(), context);
      return;
    }

    const baseSpeedMetersPerSec = context.graph.getEffectiveSpeedMetersPerSec(
      edge.id,
      vehicle.archetype.speedMultiplier,
    );
    const boostedSpeed = baseSpeedMetersPerSec * OvertakingState.CORRETEO_SPEED_BOOST;

    vehicle.advanceAlongEdge(
      boostedSpeed * deltaSec,
      OvertakingState.CORRETEO_FUEL_MULTIPLIER,
      context,
    );

    if (vehicle.hasReachedEndOfEdge()) {
      if (
        context.graph.hasAtuCheckpoint(edge.id) &&
        !vehicle.archetype.hasLegalPermit &&
        !vehicle.hasBeenInspectedOnCurrentEdge()
      ) {
        vehicle.changeState(new InspectedState(), context);
        return;
      }

      const trafficLight = context.trafficLights.get(edge.to);
      if (trafficLight && !trafficLight.canProceed()) {
        return;
      }

      const arrivedAtStop = vehicle.completeEdgeTraversal(context);
      if (arrivedAtStop) {
        vehicle.changeState(new BoardingState(), context);
      } else {
        vehicle.changeState(new CruisingState(), context);
      }
    }
  }

  public exit(_vehicle: VehicleAgent, _context: VehicleSimulationContext): void {
    // No cleanup needed
  }
}
