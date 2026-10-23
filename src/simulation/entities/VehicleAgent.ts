import { CruisingState } from '../fsm/CruisingState';
import {
  VehicleSimulationContext,
  VehicleState,
  VehicleStateName,
} from '../fsm/VehicleState';
import {
  PathfindingVehicleContext,
  RoadEdge,
  RouteDefinition,
  StopId,
  VehicleArchetype,
} from '../graph/GraphTypes';
import { RoadGraph } from '../graph/RoadGraph';
import { Passenger } from './Passenger';

/**
 * Autonomous transit vehicle agent traversing the Lima road graph.
 * Managed by a 4-state Finite State Machine (Cruising, Boarding, Overtaking, Inspected).
 * Pure TypeScript — zero Phaser dependencies.
 */
export class VehicleAgent {
  public static readonly COBRADOR_UPGRADE_MULTIPLIER = 0.6; // "Garganta de Lata": -40% boarding time

  public readonly id: string;
  public readonly archetype: VehicleArchetype;
  public readonly isPlayerOwned: boolean;

  private route: RouteDefinition;
  private currentNodeId: string;
  private targetStopIndex: number;
  private plannedEdges: RoadEdge[] = [];
  private currentEdgeIndex: number = 0;
  private distanceOnCurrentEdgeMeters: number = 0;
  private inspectedOnCurrentEdge: boolean = false;

  private readonly passengers: Passenger[] = [];
  private correteoEnabled: boolean = false;
  private hasCobradorUpgrade: boolean = false;
  private currentState: VehicleState;

  constructor(params: {
    id: string;
    archetype: VehicleArchetype;
    route: RouteDefinition;
    isPlayerOwned?: boolean;
    initialState?: VehicleState;
  }) {
    if (params.route.stopIds.length < 2) {
      throw new Error(`Route '${params.route.id}' must contain at least 2 stops`);
    }
    this.id = params.id;
    this.archetype = params.archetype;
    this.route = params.route;
    this.isPlayerOwned = params.isPlayerOwned ?? true;
    this.currentNodeId = params.route.stopIds[0]!;
    this.targetStopIndex = 1;
    this.currentState = params.initialState ?? new CruisingState();
  }

  /**
   * Advances the vehicle's active FSM state by deltaSec seconds.
   */
  public update(deltaSec: number, context: VehicleSimulationContext): void {
    this.currentState.update(this, deltaSec, context);
  }

  /**
   * Transitions the vehicle to a new FSM state, invoking exit() and enter() lifecycle hooks.
   */
  public changeState(newState: VehicleState, context: VehicleSimulationContext): void {
    const previousStateName = this.currentState.name;
    this.currentState.exit(this, context);
    this.currentState = newState;
    context.eventBus?.emit('vehicle:state-changed', {
      vehicleId: this.id,
      previousState: previousStateName,
      newState: newState.name,
    });
    this.currentState.enter(this, context);
  }

  public getStateName(): VehicleStateName {
    return this.currentState.name;
  }

  public getCurrentNodeId(): string {
    return this.currentNodeId;
  }

  public getCurrentEdge(): RoadEdge | undefined {
    return this.plannedEdges[this.currentEdgeIndex];
  }

  public getDistanceOnCurrentEdgeMeters(): number {
    return this.distanceOnCurrentEdgeMeters;
  }

  public getEdgeProgressRatio(): number {
    const edge = this.getCurrentEdge();
    if (!edge || edge.lengthMeters <= 0) {
      return 0;
    }
    return Math.min(1, this.distanceOnCurrentEdgeMeters / edge.lengthMeters);
  }

  /**
   * Computes the 2D world coordinates (x, y) of the vehicle for rendering.
   */
  public getInterpolatedPosition(graph: RoadGraph): { x: number; y: number } {
    const edge = this.getCurrentEdge();
    if (!edge) {
      const node = graph.getNode(this.currentNodeId);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    }
    const fromNode = graph.getNode(edge.from);
    const toNode = graph.getNode(edge.to);
    if (!fromNode || !toNode) {
      return { x: 0, y: 0 };
    }
    const t = this.getEdgeProgressRatio();
    return {
      x: fromNode.x + (toNode.x - fromNode.x) * t,
      y: fromNode.y + (toNode.y - fromNode.y) * t,
    };
  }

  public getRoute(): RouteDefinition {
    return this.route;
  }

  public setRoute(newRoute: RouteDefinition): void {
    if (newRoute.stopIds.length < 2) {
      throw new Error('Route must have at least 2 stops');
    }
    this.route = newRoute;
    this.targetStopIndex = 0;
  }

  public getPathfindingContext(): PathfindingVehicleContext {
    return {
      speedMultiplier: this.archetype.speedMultiplier,
      hasLegalPermit: this.archetype.hasLegalPermit,
      evadeAtuCheckpoints: this.route.evadeAtuCheckpoints,
    };
  }

  /**
   * Plans the dynamic A* path from currentNodeId to the next stop in route.stopIds
   * and enters the first edge of the path.
   */
  public departCurrentStop(context: VehicleSimulationContext): void {
    const targetStopId = this.route.stopIds[this.targetStopIndex]!;
    if (this.currentNodeId === targetStopId) {
      this.targetStopIndex = (this.targetStopIndex + 1) % this.route.stopIds.length;
    }

    const nextStopId = this.route.stopIds[this.targetStopIndex]!;
    const pathResult = context.pathfinder.findShortestPath(
      this.currentNodeId,
      nextStopId,
      this.getPathfindingContext(),
    );

    if (!pathResult || pathResult.edges.length === 0) {
      this.plannedEdges = [];
      this.currentEdgeIndex = 0;
      this.distanceOnCurrentEdgeMeters = 0;
      return;
    }

    this.plannedEdges = [...pathResult.edges];
    this.currentEdgeIndex = 0;
    this.distanceOnCurrentEdgeMeters = 0;
    this.inspectedOnCurrentEdge = false;
    context.graph.enterEdge(this.plannedEdges[0]!.id);
  }

  /**
   * Moves the vehicle forward along its current edge and deducts fuel expenses if player-owned.
   */
  public advanceAlongEdge(
    deltaMeters: number,
    fuelMultiplier: number,
    context: VehicleSimulationContext,
  ): void {
    const edge = this.getCurrentEdge();
    if (!edge || deltaMeters <= 0) {
      return;
    }
    const remainingMeters = Math.max(0, edge.lengthMeters - this.distanceOnCurrentEdgeMeters);
    const actualMetersMoved = Math.min(deltaMeters, remainingMeters);
    this.distanceOnCurrentEdgeMeters += actualMetersMoved;

    if (this.isPlayerOwned && actualMetersMoved > 0) {
      context.economy.deductFuelCost(
        actualMetersMoved,
        this.archetype.fuelCostPerKm,
        fuelMultiplier,
      );
    }
  }

  public hasReachedEndOfEdge(): boolean {
    const edge = this.getCurrentEdge();
    if (!edge) {
      return false;
    }
    return this.distanceOnCurrentEdgeMeters >= edge.lengthMeters - 1e-6;
  }

  /**
   * Completes traversal of the current edge, updates graph edge occupancy,
   * and returns true if the vehicle has arrived at a scheduled BUS_STOP on its route.
   */
  public completeEdgeTraversal(context: VehicleSimulationContext): boolean {
    const edge = this.getCurrentEdge();
    if (!edge) {
      return false;
    }

    context.graph.leaveEdge(edge.id);
    this.currentNodeId = edge.to;
    this.distanceOnCurrentEdgeMeters = 0;
    this.inspectedOnCurrentEdge = false;

    const scheduledStopId = this.route.stopIds[this.targetStopIndex]!;
    if (this.currentNodeId === scheduledStopId) {
      this.plannedEdges = [];
      this.currentEdgeIndex = 0;
      this.targetStopIndex = (this.targetStopIndex + 1) % this.route.stopIds.length;
      return true;
    }

    // Dynamically re-evaluate the optimal A* path from this intermediate intersection
    // so vehicles react in real time to newly spawned ATU checkpoints and congestion spikes.
    const dynamicPath = context.pathfinder.findShortestPath(
      this.currentNodeId,
      scheduledStopId,
      this.getPathfindingContext(),
    );
    if (dynamicPath && dynamicPath.edges.length > 0) {
      this.plannedEdges = [...dynamicPath.edges];
      this.currentEdgeIndex = 0;
      context.graph.enterEdge(this.plannedEdges[0]!.id);
      return false;
    }

    // Fallback: advance to the next edge in the previously planned path
    this.currentEdgeIndex += 1;
    const nextEdge = this.plannedEdges[this.currentEdgeIndex];
    if (nextEdge) {
      context.graph.enterEdge(nextEdge.id);
      return false;
    }

    this.departCurrentStop(context);
    return false;
  }

  /**
   * Drops off all onboard passengers whose destination matches currentNodeId.
   */
  public alightPassengersAtCurrentStop(context: VehicleSimulationContext): Passenger[] {
    const alighted: Passenger[] = [];
    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i]!;
      if (p.destinationStopId === this.currentNodeId) {
        alighted.push(p);
        this.passengers.splice(i, 1);
        context.eventBus?.emit('passenger:alighted', {
          passengerId: p.id,
          vehicleId: this.id,
          stopId: this.currentNodeId,
        });
      }
    }
    return alighted;
  }

  /**
   * Boards a single passenger onto the vehicle and collects their fare if player-owned.
   */
  public boardPassenger(passenger: Passenger, context: VehicleSimulationContext): boolean {
    if (!this.hasAvailableCapacity()) {
      return false;
    }
    this.passengers.push(passenger);
    if (this.isPlayerOwned) {
      context.economy.recordFare(passenger.fareAmount);
    }
    context.eventBus?.emit('passenger:boarded', {
      passengerId: passenger.id,
      vehicleId: this.id,
      stopId: this.currentNodeId,
      farePaid: passenger.fareAmount,
    });
    return true;
  }

  public getPassengers(): readonly Passenger[] {
    return this.passengers;
  }

  public getPassengerCount(): number {
    return this.passengers.length;
  }

  public hasAvailableCapacity(): boolean {
    return this.passengers.length < this.archetype.capacity;
  }

  /**
   * Returns the set of all stop IDs on the vehicle's route (excluding the current stop)
   * that waiting passengers can reach by boarding this vehicle.
   */
  public getUpcomingRouteStopSet(): ReadonlySet<StopId> {
    const set = new Set<StopId>();
    for (const stopId of this.route.stopIds) {
      if (stopId !== this.currentNodeId) {
        set.add(stopId);
      }
    }
    return set;
  }

  public isCorreteoEnabled(): boolean {
    return this.correteoEnabled;
  }

  public setCorreteoEnabled(enabled: boolean): void {
    this.correteoEnabled = enabled;
  }

  public hasCobrador(): boolean {
    return this.hasCobradorUpgrade;
  }

  public setCobradorUpgrade(enabled: boolean): void {
    this.hasCobradorUpgrade = enabled;
  }

  public getEffectiveBoardingSecondsPerPassenger(): number {
    const multiplier = this.hasCobradorUpgrade
      ? VehicleAgent.COBRADOR_UPGRADE_MULTIPLIER
      : 1.0;
    return this.archetype.boardingSecondsPerPassenger * multiplier;
  }

  public hasBeenInspectedOnCurrentEdge(): boolean {
    return this.inspectedOnCurrentEdge;
  }

  public markInspectedOnCurrentEdge(): void {
    this.inspectedOnCurrentEdge = true;
  }
}
