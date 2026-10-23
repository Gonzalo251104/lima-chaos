import {
  EdgeId,
  LevelData,
  PathfindingVehicleContext,
  RoadEdge,
  RoadNode,
} from './GraphTypes';

/**
 * Directed multigraph representing Lima avenues, intersections, bus stops, and auxiliary bypass roads.
 * Computes dynamic BPR (Bureau of Public Roads) quadratic congestion weights and ATU checkpoint penalties.
 */
export class RoadGraph {
  public static readonly ATU_EVASION_PENALTY = 9999;
  public static readonly BPR_ALPHA = 2.5;

  private readonly nodes: Map<string, RoadNode> = new Map();
  private readonly edges: Map<string, RoadEdge> = new Map();
  private readonly adjacency: Map<string, RoadEdge[]> = new Map();
  private readonly edgeVehicleCounts: Map<string, number> = new Map();
  private readonly activeAtuCheckpoints: Set<string> = new Set();
  private maxBaseSpeedKmh: number = 50;

  constructor(levelData?: LevelData) {
    if (levelData) {
      this.loadFromLevelData(levelData);
    }
  }

  /**
   * Populates the road graph from a level data definition.
   */
  public loadFromLevelData(levelData: LevelData): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
    this.edgeVehicleCounts.clear();
    this.activeAtuCheckpoints.clear();
    this.maxBaseSpeedKmh = 1;

    for (const node of levelData.nodes) {
      this.addNode(node);
    }
    for (const edge of levelData.edges) {
      this.addEdge(edge);
    }
  }

  public addNode(node: RoadNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
  }

  public addEdge(edge: RoadEdge): void {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) {
      throw new Error(
        `Cannot add edge '${edge.id}': endpoints '${edge.from}' -> '${edge.to}' must exist in graph.`,
      );
    }
    this.edges.set(edge.id, edge);
    this.edgeVehicleCounts.set(edge.id, 0);
    const outgoing = this.adjacency.get(edge.from);
    if (outgoing) {
      outgoing.push(edge);
    } else {
      this.adjacency.set(edge.from, [edge]);
    }
    if (edge.baseSpeedKmh > this.maxBaseSpeedKmh) {
      this.maxBaseSpeedKmh = edge.baseSpeedKmh;
    }
  }

  public getNode(nodeId: string): RoadNode | undefined {
    return this.nodes.get(nodeId);
  }

  public getAllNodes(): RoadNode[] {
    return Array.from(this.nodes.values());
  }

  public getBusStopNodes(): RoadNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === 'BUS_STOP');
  }

  public getEdge(edgeId: EdgeId): RoadEdge | undefined {
    return this.edges.get(edgeId);
  }

  public getAllEdges(): RoadEdge[] {
    return Array.from(this.edges.values());
  }

  public getOutgoingEdges(nodeId: string): readonly RoadEdge[] {
    return this.adjacency.get(nodeId) ?? [];
  }

  public getMaxBaseSpeedKmh(): number {
    return this.maxBaseSpeedKmh;
  }

  /**
   * Increments the active vehicle occupancy counter on the given edge.
   */
  public enterEdge(edgeId: EdgeId): void {
    const current = this.edgeVehicleCounts.get(edgeId) ?? 0;
    this.edgeVehicleCounts.set(edgeId, current + 1);
  }

  /**
   * Decrements the active vehicle occupancy counter on the given edge.
   */
  public leaveEdge(edgeId: EdgeId): void {
    const current = this.edgeVehicleCounts.get(edgeId) ?? 0;
    this.edgeVehicleCounts.set(edgeId, Math.max(0, current - 1));
  }

  /**
   * Explicitly sets the active vehicle count on an edge (useful for tests and external congestion spikes).
   */
  public setVehicleCountOnEdge(edgeId: EdgeId, count: number): void {
    if (!this.edges.has(edgeId)) {
      throw new Error(`Unknown edge '${edgeId}'`);
    }
    this.edgeVehicleCounts.set(edgeId, Math.max(0, Math.floor(count)));
  }

  /**
   * Returns the current number of vehicles traversing the given edge.
   */
  public getVehicleCountOnEdge(edgeId: EdgeId): number {
    return this.edgeVehicleCounts.get(edgeId) ?? 0;
  }

  /**
   * Returns the congestion ratio (N_e / C_e) for the given edge.
   */
  public getEdgeCongestionRatio(edgeId: EdgeId): number {
    const edge = this.edges.get(edgeId);
    if (!edge || edge.capacity <= 0) {
      return 0;
    }
    const count = this.getVehicleCountOnEdge(edgeId);
    return count / edge.capacity;
  }

  /**
   * Computes the quadratic BPR congestion multiplier:
   * 1 + 2.5 * (N_e / C_e)^2
   */
  public getCongestionMultiplier(edgeId: EdgeId): number {
    const ratio = this.getEdgeCongestionRatio(edgeId);
    return 1 + RoadGraph.BPR_ALPHA * ratio * ratio;
  }

  /**
   * Activates or clears an ATU inspection checkpoint on a specific edge.
   */
  public setAtuCheckpoint(edgeId: EdgeId, active: boolean): void {
    if (!this.edges.has(edgeId)) {
      throw new Error(`Unknown edge '${edgeId}'`);
    }
    if (active) {
      this.activeAtuCheckpoints.add(edgeId);
    } else {
      this.activeAtuCheckpoints.delete(edgeId);
    }
  }

  /**
   * Checks whether an edge currently has an active ATU checkpoint.
   */
  public hasAtuCheckpoint(edgeId: EdgeId): boolean {
    return this.activeAtuCheckpoints.has(edgeId);
  }

  /**
   * Returns all edge IDs that currently have an active ATU checkpoint.
   */
  public getActiveAtuCheckpoints(): string[] {
    return Array.from(this.activeAtuCheckpoints);
  }

  /**
   * Dynamic A* Edge Cost Formula:
   * Cost(e, v) = (L_e / (S_e * M_v)) * (1 + 2.5 * (N_e / C_e)^2) + P_ATU(e, v)
   */
  public calculateEdgeCost(
    edge: RoadEdge,
    vehicleContext: PathfindingVehicleContext,
  ): number {
    const effectiveSpeed = Math.max(0.1, edge.baseSpeedKmh * vehicleContext.speedMultiplier);
    const baseTraversalCost = edge.lengthMeters / effectiveSpeed;
    const congestionFactor = this.getCongestionMultiplier(edge.id);

    const atuPenalty =
      this.hasAtuCheckpoint(edge.id) &&
      !vehicleContext.hasLegalPermit &&
      vehicleContext.evadeAtuCheckpoints
        ? RoadGraph.ATU_EVASION_PENALTY
        : 0;

    return baseTraversalCost * congestionFactor + atuPenalty;
  }

  /**
   * Computes the instantaneous traversal speed in meters per second (m/s) along an edge,
   * accounting for both the vehicle speed multiplier and the BPR congestion slowdown.
   */
  public getEffectiveSpeedMetersPerSec(
    edgeId: EdgeId,
    vehicleSpeedMultiplier: number,
  ): number {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      return 0;
    }
    const freeFlowMetersPerSec =
      (edge.baseSpeedKmh * vehicleSpeedMultiplier * 1000) / 3600;
    const congestionMultiplier = this.getCongestionMultiplier(edgeId);
    return freeFlowMetersPerSec / congestionMultiplier;
  }
}
