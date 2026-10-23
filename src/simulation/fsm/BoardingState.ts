import type { VehicleAgent } from '../entities/VehicleAgent';
import { CruisingState } from './CruisingState';
import { VehicleSimulationContext, VehicleState } from './VehicleState';

/**
 * Handles passenger drop-off and FIFO boarding at a BusStopNode.
 * Respects vehicle capacity and per-passenger boarding duration (plus "Garganta de Lata" Cobrador upgrade).
 */
export class BoardingState implements VehicleState {
  public readonly name = 'BOARDING' as const;
  private boardingProgressSec: number = 0;

  public enter(vehicle: VehicleAgent, context: VehicleSimulationContext): void {
    this.boardingProgressSec = 0;
    // Immediately drop off passengers whose destination is this stop
    vehicle.alightPassengersAtCurrentStop(context);
  }

  public update(
    vehicle: VehicleAgent,
    deltaSec: number,
    context: VehicleSimulationContext,
  ): void {
    const stop = context.busStops.get(vehicle.getCurrentNodeId());
    if (!stop) {
      vehicle.departCurrentStop(context);
      vehicle.changeState(new CruisingState(), context);
      return;
    }

    const upcomingStops = vehicle.getUpcomingRouteStopSet();
    const secPerPassenger = vehicle.getEffectiveBoardingSecondsPerPassenger();

    this.boardingProgressSec += deltaSec;

    while (this.boardingProgressSec >= secPerPassenger) {
      if (!vehicle.hasAvailableCapacity() || !stop.hasMatchingPassenger(upcomingStops)) {
        break;
      }
      const nextPassenger = stop.dequeueNextMatchingPassenger(upcomingStops);
      if (!nextPassenger) {
        break;
      }
      vehicle.boardPassenger(nextPassenger, context);
      this.boardingProgressSec -= secPerPassenger;
    }

    // If vehicle is at full capacity or no more matching passengers are waiting, depart
    if (!vehicle.hasAvailableCapacity() || !stop.hasMatchingPassenger(upcomingStops)) {
      vehicle.departCurrentStop(context);
      vehicle.changeState(new CruisingState(), context);
    }
  }

  public exit(_vehicle: VehicleAgent, _context: VehicleSimulationContext): void {
    this.boardingProgressSec = 0;
  }
}
