import { EventBus } from '../../core/EventBus';
import { EconomyManager } from '../economy/EconomyManager';
import { BusStopNode } from '../entities/BusStopNode';
import { TrafficLight } from '../entities/TrafficLight';
import type { VehicleAgent } from '../entities/VehicleAgent';
import { Pathfinder } from '../graph/Pathfinder';
import { RoadGraph } from '../graph/RoadGraph';

export type VehicleStateName = 'CRUISING' | 'BOARDING' | 'OVERTAKING' | 'INSPECTED';

export interface VehicleSimulationContext {
  readonly graph: RoadGraph;
  readonly pathfinder: Pathfinder;
  readonly busStops: ReadonlyMap<string, BusStopNode>;
  readonly trafficLights: ReadonlyMap<string, TrafficLight>;
  readonly economy: EconomyManager;
  readonly eventBus?: EventBus;
  getVehiclesOnEdge(edgeId: string, excludeVehicleId?: string): readonly VehicleAgent[];
}

/**
 * Finite State Machine (FSM) state contract for VehicleAgent.
 * Pure TypeScript — zero Phaser dependencies.
 */
export interface VehicleState {
  readonly name: VehicleStateName;
  enter(vehicle: VehicleAgent, context: VehicleSimulationContext): void;
  update(vehicle: VehicleAgent, deltaSec: number, context: VehicleSimulationContext): void;
  exit(vehicle: VehicleAgent, context: VehicleSimulationContext): void;
}
