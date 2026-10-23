/**
 * Core data structures and interfaces for the Lima road graph, vehicles, and transit routes.
 * Pure TypeScript — zero Phaser dependencies.
 */

export type NodeType = 'BUS_STOP' | 'INTERSECTION';
export type StopId = string;
export type EdgeId = string;

export interface RoadNode {
  readonly id: string;
  readonly name: string;
  readonly type: NodeType;
  readonly x: number;
  readonly y: number;
  readonly baseSpawnRatePerMin?: number;
  readonly trafficLightCycleSec?: number;
}

export interface RoadEdge {
  readonly id: EdgeId;
  readonly from: string;
  readonly to: string;
  readonly lengthMeters: number;
  readonly baseSpeedKmh: number;
  readonly capacity: number;
  readonly isAuxiliary: boolean;
}

export interface VehicleArchetype {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly capacity: number;
  readonly speedMultiplier: number;
  readonly boardingSecondsPerPassenger: number;
  readonly fuelCostPerKm: number;
  readonly hasLegalPermit: boolean;
  readonly atuFineAmount: number;
}

export interface PathfindingVehicleContext {
  readonly speedMultiplier: number;
  readonly hasLegalPermit: boolean;
  readonly evadeAtuCheckpoints: boolean;
}

export interface RouteDefinition {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly stopIds: readonly StopId[];
  readonly evadeAtuCheckpoints: boolean;
}

export interface LevelData {
  readonly id: string;
  readonly name: string;
  readonly startingCash: number;
  readonly targetDailyProfit: number;
  readonly nodes: readonly RoadNode[];
  readonly edges: readonly RoadEdge[];
}

export interface PathResult {
  readonly nodes: readonly string[];
  readonly edges: readonly RoadEdge[];
  readonly totalCost: number;
  readonly totalDistanceMeters: number;
}
