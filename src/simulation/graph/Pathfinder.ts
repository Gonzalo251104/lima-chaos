import { PathfindingVehicleContext, PathResult, RoadEdge } from './GraphTypes';
import { RoadGraph } from './RoadGraph';

interface OpenEntry {
  nodeId: string;
  fScore: number;
}

/**
 * Dynamic A* Pathfinder that evaluates real-time edge congestion and ATU checkpoint evasion penalties.
 * Pure TypeScript — zero Phaser dependencies.
 */
export class Pathfinder {
  private readonly graph: RoadGraph;

  constructor(graph: RoadGraph) {
    this.graph = graph;
  }

  /**
   * Finds the lowest-cost path between startNodeId and goalNodeId for the given vehicle context.
   * Returns null if no valid directed path exists.
   */
  public findShortestPath(
    startNodeId: string,
    goalNodeId: string,
    vehicleContext: PathfindingVehicleContext = {
      speedMultiplier: 1.0,
      hasLegalPermit: true,
      evadeAtuCheckpoints: false,
    },
  ): PathResult | null {
    const startNode = this.graph.getNode(startNodeId);
    const goalNode = this.graph.getNode(goalNodeId);

    if (!startNode || !goalNode) {
      return null;
    }

    if (startNodeId === goalNodeId) {
      return {
        nodes: [startNodeId],
        edges: [],
        totalCost: 0,
        totalDistanceMeters: 0,
      };
    }

    const openSet: OpenEntry[] = [
      {
        nodeId: startNodeId,
        fScore: this.estimateHeuristic(startNodeId, goalNodeId, vehicleContext),
      },
    ];
    const closedSet = new Set<string>();
    const gScore = new Map<string, number>();
    const cameFromEdge = new Map<string, RoadEdge>();

    gScore.set(startNodeId, 0);

    while (openSet.length > 0) {
      // Pop entry with lowest fScore
      openSet.sort((a, b) => a.fScore - b.fScore);
      const current = openSet.shift()!;

      if (current.nodeId === goalNodeId) {
        return this.reconstructPath(startNodeId, goalNodeId, cameFromEdge, gScore);
      }

      if (closedSet.has(current.nodeId)) {
        continue;
      }
      closedSet.add(current.nodeId);

      const currentG = gScore.get(current.nodeId) ?? Infinity;
      const outgoingEdges = this.graph.getOutgoingEdges(current.nodeId);

      for (const edge of outgoingEdges) {
        const neighborId = edge.to;
        if (closedSet.has(neighborId)) {
          continue;
        }

        const edgeCost = this.graph.calculateEdgeCost(edge, vehicleContext);
        const tentativeG = currentG + edgeCost;
        const previousBestG = gScore.get(neighborId) ?? Infinity;

        if (tentativeG < previousBestG) {
          cameFromEdge.set(neighborId, edge);
          gScore.set(neighborId, tentativeG);
          const fScore =
            tentativeG + this.estimateHeuristic(neighborId, goalNodeId, vehicleContext);

          const existingOpen = openSet.find((item) => item.nodeId === neighborId);
          if (existingOpen) {
            existingOpen.fScore = fScore;
          } else {
            openSet.push({ nodeId: neighborId, fScore });
          }
        }
      }
    }

    return null;
  }

  /**
   * Finds a multi-stop route path sequentially connecting an ordered list of stop IDs.
   * Returns the concatenated edges and nodes, or null if any segment is unreachable.
   */
  public findMultiStopPath(
    stopIds: readonly string[],
    vehicleContext: PathfindingVehicleContext,
  ): PathResult | null {
    if (stopIds.length === 0) {
      return null;
    }
    if (stopIds.length === 1) {
      return {
        nodes: [stopIds[0]!],
        edges: [],
        totalCost: 0,
        totalDistanceMeters: 0,
      };
    }

    const allNodes: string[] = [stopIds[0]!];
    const allEdges: RoadEdge[] = [];
    let totalCost = 0;
    let totalDistanceMeters = 0;

    for (let i = 0; i < stopIds.length - 1; i++) {
      const fromId = stopIds[i]!;
      const toId = stopIds[i + 1]!;
      const segment = this.findShortestPath(fromId, toId, vehicleContext);
      if (!segment) {
        return null;
      }
      for (let j = 1; j < segment.nodes.length; j++) {
        allNodes.push(segment.nodes[j]!);
      }
      allEdges.push(...segment.edges);
      totalCost += segment.totalCost;
      totalDistanceMeters += segment.totalDistanceMeters;
    }

    return {
      nodes: allNodes,
      edges: allEdges,
      totalCost,
      totalDistanceMeters,
    };
  }

  /**
   * Admissible Euclidean distance heuristic scaled by maximum theoretical road speed.
   */
  private estimateHeuristic(
    fromNodeId: string,
    toNodeId: string,
    vehicleContext: PathfindingVehicleContext,
  ): number {
    const fromNode = this.graph.getNode(fromNodeId);
    const toNode = this.graph.getNode(toNodeId);
    if (!fromNode || !toNode) {
      return 0;
    }
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const pixelDistance = Math.hypot(dx, dy);
    const maxSpeed = Math.max(
      1,
      this.graph.getMaxBaseSpeedKmh() * vehicleContext.speedMultiplier,
    );
    return pixelDistance / maxSpeed;
  }

  private reconstructPath(
    startNodeId: string,
    goalNodeId: string,
    cameFromEdge: Map<string, RoadEdge>,
    gScore: Map<string, number>,
  ): PathResult {
    const edges: RoadEdge[] = [];
    const nodes: string[] = [goalNodeId];
    let currentId = goalNodeId;
    let totalDistanceMeters = 0;

    while (currentId !== startNodeId) {
      const edge = cameFromEdge.get(currentId);
      if (!edge) {
        break;
      }
      edges.unshift(edge);
      nodes.unshift(edge.from);
      totalDistanceMeters += edge.lengthMeters;
      currentId = edge.from;
    }

    return {
      nodes,
      edges,
      totalCost: gScore.get(goalNodeId) ?? 0,
      totalDistanceMeters,
    };
  }
}
