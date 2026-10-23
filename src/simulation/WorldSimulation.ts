import { EventBus } from '../core/EventBus';
import { GameClock } from '../core/GameClock';
import { Random } from '../core/Random';
import { DailyFinancialReport, EconomyManager } from './economy/EconomyManager';
import { FareCalculator } from './economy/FareCalculator';
import { BusStopNode } from './entities/BusStopNode';
import { Passenger } from './entities/Passenger';
import { TrafficLight } from './entities/TrafficLight';
import { VehicleAgent } from './entities/VehicleAgent';
import { BoardingState } from './fsm/BoardingState';
import { VehicleSimulationContext } from './fsm/VehicleState';
import {
  LevelData,
  RouteDefinition,
  StopId,
  VehicleArchetype,
} from './graph/GraphTypes';
import { Pathfinder } from './graph/Pathfinder';
import { RoadGraph } from './graph/RoadGraph';

export interface WorldSimulationConfig {
  readonly levelData: LevelData;
  readonly seed?: number;
  readonly gameMinutesPerRealSecond?: number;
  readonly eventBus?: EventBus;
  readonly enableDynamicAtuCheckpoints?: boolean;
}

/**
 * Top-level deterministic simulation orchestrator for LimaCaos: Combi Tycoon.
 * Coordinates GameClock, RoadGraph, Pathfinder, Passenger spawning, TrafficLights,
 * ATU Checkpoints, Rival AI Combis, EconomyManager, and VehicleAgent FSMs.
 * Pure TypeScript — zero Phaser dependencies.
 */
export class WorldSimulation {
  public static readonly COBRADOR_UPGRADE_COST = 150;
  public static readonly ATU_CHECKPOINT_DURATION_MIN = 180; // 3 in-game hours
  public static readonly ATU_SPAWN_INTERVAL_MIN = 210; // Checks every 3.5 in-game hours

  public readonly levelData: LevelData;
  public readonly eventBus: EventBus;
  public readonly random: Random;
  public readonly clock: GameClock;
  public readonly graph: RoadGraph;
  public readonly pathfinder: Pathfinder;
  public readonly economy: EconomyManager;

  private readonly busStops: Map<StopId, BusStopNode> = new Map();
  private readonly trafficLights: Map<string, TrafficLight> = new Map();
  private readonly routes: Map<string, RouteDefinition> = new Map();
  private readonly vehicles: Map<string, VehicleAgent> = new Map();
  private readonly spawnAccumulators: Map<StopId, number> = new Map();
  private readonly activeAtuTimersMin: Map<string, number> = new Map();

  private nextPassengerSeq: number = 1;
  private nextVehicleSeq: number = 1;
  private dayEndedEmitted: boolean = false;
  private dynamicAtuEnabled: boolean;
  private atuSpawnCooldownMin: number = 150;
  private rivalRebalanceTimerMin: number = 120;

  private readonly vehicleContext: VehicleSimulationContext;

  constructor(config: WorldSimulationConfig) {
    this.levelData = config.levelData;
    this.eventBus = config.eventBus ?? new EventBus();
    this.random = new Random(config.seed ?? 1337);
    this.clock = new GameClock(config.gameMinutesPerRealSecond ?? 1.0);
    this.graph = new RoadGraph(config.levelData);
    this.pathfinder = new Pathfinder(this.graph);
    this.economy = new EconomyManager(config.levelData.startingCash, this.eventBus);
    this.dynamicAtuEnabled = config.enableDynamicAtuCheckpoints ?? false;

    for (const node of config.levelData.nodes) {
      if (node.type === 'BUS_STOP') {
        this.busStops.set(node.id, new BusStopNode(node));
        this.spawnAccumulators.set(node.id, 0);
      } else if (node.type === 'INTERSECTION' && node.trafficLightCycleSec) {
        this.trafficLights.set(
          node.id,
          new TrafficLight(node.id, node.trafficLightCycleSec),
        );
      }
    }

    this.vehicleContext = {
      graph: this.graph,
      pathfinder: this.pathfinder,
      busStops: this.busStops,
      trafficLights: this.trafficLights,
      economy: this.economy,
      eventBus: this.eventBus,
      getVehiclesOnEdge: (edgeId: string, excludeVehicleId?: string) => {
        const result: VehicleAgent[] = [];
        for (const v of this.vehicles.values()) {
          if (v.id !== excludeVehicleId && v.getCurrentEdge()?.id === edgeId) {
            result.push(v);
          }
        }
        return result;
      },
    };
  }

  /**
   * Advances the entire world simulation by deltaMs milliseconds.
   */
  public tick(deltaMs: number): void {
    if (deltaMs <= 0 || this.clock.isDayOver()) {
      return;
    }

    const elapsedGameMinutes = this.clock.advance(deltaMs);
    const deltaSec = deltaMs / 1000;

    this.eventBus.emit('clock:tick', {
      totalMinutes: this.clock.getCurrentMinutes(),
      formattedTime: this.clock.getFormattedTime(),
      isRushHour: this.clock.isRushHour(),
      demandMultiplier: this.clock.getDemandMultiplier(),
    });

    // 1. Update intersection traffic lights
    for (const light of this.trafficLights.values()) {
      light.tick(deltaSec);
    }

    // 2. Update active ATU checkpoint timers & dynamic ATU spawner
    this.updateAtuCheckpoints(elapsedGameMinutes);

    // 3. Rebalance Rival AI routes periodically toward highest-demand stops
    this.updateRivalAiRoutes(elapsedGameMinutes);

    // 4. Spawn new passengers & tick waiting queues at bus stops
    this.updateBusStops(deltaSec);

    // 5. Update all vehicles via their Finite State Machines
    for (const vehicle of this.vehicles.values()) {
      vehicle.update(deltaSec, this.vehicleContext);
    }

    // 6. Emit end-of-day event if 23:00 was reached
    if (this.clock.isDayOver() && !this.dayEndedEmitted) {
      this.dayEndedEmitted = true;
      this.eventBus.emit('clock:day-ended', {
        dayNumber: this.clock.getDayNumber(),
      });
    }
  }

  public setDynamicAtuCheckpointsEnabled(enabled: boolean): void {
    this.dynamicAtuEnabled = enabled;
  }

  public isDynamicAtuCheckpointsEnabled(): boolean {
    return this.dynamicAtuEnabled;
  }

  /**
   * Registers or updates a transit route definition.
   */
  public registerRoute(route: RouteDefinition): void {
    this.routes.set(route.id, route);
  }

  public getRoute(routeId: string): RouteDefinition | undefined {
    return this.routes.get(routeId);
  }

  public getAllRoutes(): RouteDefinition[] {
    return Array.from(this.routes.values());
  }

  /**
   * Deploys a vehicle onto a registered route.
   * If purchaseVehicle is true and isPlayerOwned is true, deducts archetype.cost from cash.
   */
  public addVehicle(params: {
    id: string;
    archetype: VehicleArchetype;
    route: RouteDefinition;
    isPlayerOwned?: boolean;
    purchaseVehicle?: boolean;
  }): VehicleAgent | null {
    const isPlayerOwned = params.isPlayerOwned ?? true;
    if (isPlayerOwned && params.purchaseVehicle) {
      const paid = this.economy.spendCapital(params.archetype.cost, 'PURCHASE');
      if (!paid) {
        return null;
      }
    }

    this.registerRoute(params.route);
    const vehicle = new VehicleAgent({
      id: params.id,
      archetype: params.archetype,
      route: params.route,
      isPlayerOwned,
      initialState: new BoardingState(),
    });

    this.vehicles.set(vehicle.id, vehicle);
    vehicle.changeState(new BoardingState(), this.vehicleContext);
    return vehicle;
  }

  /**
   * Purchases a new player-owned vehicle and assigns it to the given route ID.
   */
  public purchasePlayerVehicle(
    archetype: VehicleArchetype,
    routeId: string,
  ): VehicleAgent | null {
    const route = this.routes.get(routeId) ?? this.getAllRoutes()[0];
    if (!route) {
      return null;
    }
    const id = `player_${archetype.id}_${this.nextVehicleSeq++}`;
    return this.addVehicle({
      id,
      archetype,
      route,
      isPlayerOwned: true,
      purchaseVehicle: true,
    });
  }

  /**
   * Hires the "Garganta de Lata" Cobrador upgrade for a player vehicle (-40% boarding time).
   */
  public hireCobradorUpgrade(
    vehicleId: string,
    cost: number = WorldSimulation.COBRADOR_UPGRADE_COST,
  ): boolean {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle || !vehicle.isPlayerOwned || vehicle.hasCobrador()) {
      return false;
    }
    const paid = this.economy.spendCapital(cost, 'UPGRADE');
    if (!paid) {
      return false;
    }
    vehicle.setCobradorUpgrade(true);
    return true;
  }

  /**
   * Toggles "Correteo" (+30% speed boost when overtaking rival vehicles) across all player vehicles.
   */
  public setFleetCorreteo(enabled: boolean): void {
    for (const vehicle of this.getPlayerVehicles()) {
      vehicle.setCorreteoEnabled(enabled);
    }
  }

  /**
   * Evaluates all BusStopNodes by current waiting queue + base spawn rate to construct
   * a competitive route targeting the highest-demand stops on the avenue.
   */
  public computeHighestDemandRoute(routeId: string = 'route_rival_ai'): RouteDefinition | null {
    const allStops = this.getAllBusStops();
    if (allStops.length < 2) {
      return null;
    }

    // Score each stop by current queue pressure + base demand rate
    const scored = [...allStops].sort((a, b) => {
      const scoreA = a.getQueueLength() * 3 + a.baseSpawnRatePerMin;
      const scoreB = b.getQueueLength() * 3 + b.baseSpawnRatePerMin;
      return scoreB - scoreA;
    });

    const topStopSet = new Set(
      scored.slice(0, Math.min(3, scored.length)).map((s) => s.id),
    );

    // Keep corridor stop ordering so directed paths exist between consecutive stops
    const orderedStops = allStops
      .filter((s) => topStopSet.has(s.id))
      .map((s) => s.id);

    if (orderedStops.length < 2) {
      return null;
    }

    const roundTrip: StopId[] = [...orderedStops];
    for (let i = orderedStops.length - 2; i >= 0; i--) {
      roundTrip.push(orderedStops[i]!);
    }

    return {
      id: routeId,
      name: 'Línea Pirata Rival',
      color: '#a855f7',
      stopIds: roundTrip,
      evadeAtuCheckpoints: true,
    };
  }

  /**
   * Spawns a Rival AI Combi that competes for passengers at the highest-demand stops.
   */
  public spawnRivalCombi(
    archetype: VehicleArchetype,
    customId?: string,
  ): VehicleAgent | null {
    const rivalRoute = this.computeHighestDemandRoute();
    if (!rivalRoute) {
      return null;
    }
    const id = customId ?? `rival_${this.nextVehicleSeq++}`;
    const rival = this.addVehicle({
      id,
      archetype,
      route: rivalRoute,
      isPlayerOwned: false,
      purchaseVehicle: false,
    });
    if (rival) {
      rival.setCorreteoEnabled(true);
    }
    return rival;
  }

  public getVehicle(vehicleId: string): VehicleAgent | undefined {
    return this.vehicles.get(vehicleId);
  }

  public getAllVehicles(): VehicleAgent[] {
    return Array.from(this.vehicles.values());
  }

  public getPlayerVehicles(): VehicleAgent[] {
    return Array.from(this.vehicles.values()).filter((v) => v.isPlayerOwned);
  }

  public getRivalVehicles(): VehicleAgent[] {
    return Array.from(this.vehicles.values()).filter((v) => !v.isPlayerOwned);
  }

  public getBusStop(stopId: StopId): BusStopNode | undefined {
    return this.busStops.get(stopId);
  }

  public getAllBusStops(): BusStopNode[] {
    return Array.from(this.busStops.values());
  }

  public getTrafficLight(intersectionId: string): TrafficLight | undefined {
    return this.trafficLights.get(intersectionId);
  }

  /**
   * Spawns a temporary ATU checkpoint on the specified edge for durationGameMinutes (default 180 = 3 in-game hours).
   */
  public spawnAtuCheckpoint(
    edgeId: string,
    durationGameMinutes: number = WorldSimulation.ATU_CHECKPOINT_DURATION_MIN,
  ): void {
    this.graph.setAtuCheckpoint(edgeId, true);
    this.activeAtuTimersMin.set(edgeId, durationGameMinutes);
    this.eventBus.emit('atu:checkpoint-spawned', {
      edgeId,
      durationMinutes: durationGameMinutes,
    });
  }

  public clearAtuCheckpoint(edgeId: string): void {
    if (this.graph.hasAtuCheckpoint(edgeId)) {
      this.graph.setAtuCheckpoint(edgeId, false);
      this.activeAtuTimersMin.delete(edgeId);
      this.eventBus.emit('atu:checkpoint-cleared', { edgeId });
    }
  }

  public getDailyReport(): DailyFinancialReport {
    return this.economy.getDailyReport();
  }

  /**
   * Starts the next operating day at 05:00 and resets daily P&L counters.
   */
  public startNextDay(): void {
    this.clock.startNextDay();
    this.economy.resetDailyCounters();
    this.dayEndedEmitted = false;
  }

  private updateAtuCheckpoints(elapsedGameMinutes: number): void {
    if (elapsedGameMinutes <= 0) {
      return;
    }
    for (const [edgeId, remainingMin] of this.activeAtuTimersMin.entries()) {
      const nextRemaining = remainingMin - elapsedGameMinutes;
      if (nextRemaining <= 0) {
        this.clearAtuCheckpoint(edgeId);
      } else {
        this.activeAtuTimersMin.set(edgeId, nextRemaining);
      }
    }

    if (this.dynamicAtuEnabled) {
      this.atuSpawnCooldownMin -= elapsedGameMinutes;
      if (this.atuSpawnCooldownMin <= 0) {
        this.atuSpawnCooldownMin = WorldSimulation.ATU_SPAWN_INTERVAL_MIN;
        const mainAvenueEdges = this.graph
          .getAllEdges()
          .filter((e) => !e.isAuxiliary && !this.graph.hasAtuCheckpoint(e.id));
        if (mainAvenueEdges.length > 0) {
          const chosenEdge = this.random.pick(mainAvenueEdges);
          this.spawnAtuCheckpoint(
            chosenEdge.id,
            WorldSimulation.ATU_CHECKPOINT_DURATION_MIN,
          );
        }
      }
    }
  }

  private updateRivalAiRoutes(elapsedGameMinutes: number): void {
    if (elapsedGameMinutes <= 0 || this.getRivalVehicles().length === 0) {
      return;
    }
    this.rivalRebalanceTimerMin -= elapsedGameMinutes;
    if (this.rivalRebalanceTimerMin <= 0) {
      this.rivalRebalanceTimerMin = 120;
      const updatedRoute = this.computeHighestDemandRoute();
      if (updatedRoute) {
        this.registerRoute(updatedRoute);
        for (const rival of this.getRivalVehicles()) {
          rival.setRoute(updatedRoute);
        }
      }
    }
  }

  private updateBusStops(deltaSec: number): void {
    const demandMultiplier = this.clock.getDemandMultiplier();
    const stopIds = Array.from(this.busStops.keys());

    for (const stop of this.busStops.values()) {
      // 1. Tick patience of currently waiting passengers
      const abandonedList = stop.tickWaitingQueue(deltaSec);
      for (const abandoned of abandonedList) {
        this.economy.recordPassengerAbandoned(0);
        this.eventBus.emit('passenger:abandoned', {
          passengerId: abandoned.id,
          stopId: stop.id,
        });
      }

      // 2. Accumulate deterministic passenger spawn progress
      const spawnsPerSec = (stop.baseSpawnRatePerMin / 60) * demandMultiplier;
      const previousAcc = this.spawnAccumulators.get(stop.id) ?? 0;
      let currentAcc = previousAcc + spawnsPerSec * deltaSec;

      while (currentAcc >= 1.0) {
        currentAcc -= 1.0;
        this.spawnSinglePassengerAtStop(stop, stopIds);
      }

      this.spawnAccumulators.set(stop.id, currentAcc);
    }
  }

  private spawnSinglePassengerAtStop(
    originStop: BusStopNode,
    allStopIds: readonly StopId[],
  ): void {
    const candidateDestinations = allStopIds.filter((id) => id !== originStop.id);
    if (candidateDestinations.length === 0) {
      return;
    }

    const destinationStopId = this.random.pick(candidateDestinations);
    const destNode = this.graph.getNode(destinationStopId);
    const originNode = originStop.node;

    const path = this.pathfinder.findShortestPath(originStop.id, destinationStopId);
    const distanceMeters = path
      ? path.totalDistanceMeters
      : destNode
        ? Math.hypot(destNode.x - originNode.x, destNode.y - originNode.y) * 3
        : 1500;

    const fareQuote = FareCalculator.calculateByDistance(distanceMeters);
    const passenger = new Passenger({
      id: `pax_${this.nextPassengerSeq++}`,
      originStopId: originStop.id,
      destinationStopId,
      fareAmount: fareQuote.amount,
      maxPatienceSec: 120,
    });

    originStop.enqueuePassenger(passenger);
    this.eventBus.emit('passenger:spawned', {
      passengerId: passenger.id,
      originStopId: originStop.id,
      destinationStopId,
    });

    if (originStop.isOverflowing()) {
      this.eventBus.emit('stop:overflow', {
        stopId: originStop.id,
        queueLength: originStop.getQueueLength(),
      });
    }
  }
}
