import type { VehicleAgent } from '../entities/VehicleAgent';
import { BoardingState } from './BoardingState';
import { InspectedState } from './InspectedState';
import { OvertakingState } from './OvertakingState';
import { VehicleSimulationContext, VehicleState } from './VehicleState';

/**
 * Default movement state along a directed road edge.
 * Evaluates BPR congestion speed, intersection traffic lights, rival "Correteo" triggers,
 * and ATU checkpoint inspections.
 */
export class CruisingState implements VehicleState {
  public readonly name = 'CRUISING' as const;

  public enter(vehicle: VehicleAgent, context: VehicleSimulationContext): void {
    if (!vehicle.getCurrentEdge()) {
      vehicle.departCurrentStop(context);
    }
  }

  public update(
    vehicle: VehicleAgent,
    deltaSec: number,
    context: VehicleSimulationContext,
  ): void {
    const edge = vehicle.getCurrentEdge();
    if (!edge) {
      vehicle.departCurrentStop(context);
      return;
    }

    // Check if player/AI enabled "Correteo" and a rival vehicle is on the same edge
    if (vehicle.isCorreteoEnabled()) {
      const rivals = context.getVehiclesOnEdge(edge.id, vehicle.id);
      if (rivals.length > 0) {
        vehicle.changeState(new OvertakingState(rivals[0]!.id), context);
        return;
      }
    }

    const speedMetersPerSec = context.graph.getEffectiveSpeedMetersPerSec(
      edge.id,
      vehicle.archetype.speedMultiplier,
    );
    vehicle.advanceAlongEdge(speedMetersPerSec * deltaSec, 1.0, context);

    if (vehicle.hasReachedEndOfEdge()) {
      // Check ATU checkpoint before leaving edge
      if (
        context.graph.hasAtuCheckpoint(edge.id) &&
        !vehicle.archetype.hasLegalPermit &&
        !vehicle.hasBeenInspectedOnCurrentEdge()
      ) {
        vehicle.changeState(new InspectedState(), context);
        return;
      }

      // Check traffic light at destination intersection
      const trafficLight = context.trafficLights.get(edge.to);
      if (trafficLight && !trafficLight.canProceed()) {
        return;
      }

      const arrivedAtStop = vehicle.completeEdgeTraversal(context);
      if (arrivedAtStop) {
        vehicle.changeState(new BoardingState(), context);
      }
    }
  }

  public exit(_vehicle: VehicleAgent, _context: VehicleSimulationContext): void {
    // No cleanup required on exit
  }
}
