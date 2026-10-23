import type { VehicleAgent } from '../entities/VehicleAgent';
import { BoardingState } from './BoardingState';
import { CruisingState } from './CruisingState';
import { VehicleSimulationContext, VehicleState } from './VehicleState';

/**
 * Triggered when an informal vehicle (hasLegalPermit === false) hits an active ATU checkpoint.
 * Detains the vehicle for a fixed inspection delay and deducts the ATU fine from player cash.
 */
export class InspectedState implements VehicleState {
  public static readonly DEFAULT_INSPECTION_DURATION_SEC = 15;

  public readonly name = 'INSPECTED' as const;
  private remainingInspectionSec: number;

  constructor(inspectionDurationSec: number = InspectedState.DEFAULT_INSPECTION_DURATION_SEC) {
    this.remainingInspectionSec = inspectionDurationSec;
  }

  public enter(vehicle: VehicleAgent, context: VehicleSimulationContext): void {
    vehicle.markInspectedOnCurrentEdge();
    const edge = vehicle.getCurrentEdge();
    const fineAmount = vehicle.archetype.atuFineAmount;

    if (vehicle.isPlayerOwned && fineAmount > 0 && edge) {
      context.economy.applyAtuFine(fineAmount);
      context.eventBus?.emit('atu:fine-issued', {
        vehicleId: vehicle.id,
        edgeId: edge.id,
        amount: fineAmount,
      });
    }
  }

  public update(
    vehicle: VehicleAgent,
    deltaSec: number,
    context: VehicleSimulationContext,
  ): void {
    this.remainingInspectionSec = Math.max(0, this.remainingInspectionSec - deltaSec);
    if (this.remainingInspectionSec > 0) {
      return;
    }

    const edge = vehicle.getCurrentEdge();
    if (edge) {
      const trafficLight = context.trafficLights.get(edge.to);
      if (trafficLight && !trafficLight.canProceed()) {
        return;
      }
    }

    const arrivedAtStop = vehicle.completeEdgeTraversal(context);
    if (arrivedAtStop) {
      vehicle.changeState(new BoardingState(), context);
    } else {
      vehicle.changeState(new CruisingState(), context);
    }
  }

  public exit(_vehicle: VehicleAgent, _context: VehicleSimulationContext): void {
    this.remainingInspectionSec = 0;
  }
}
