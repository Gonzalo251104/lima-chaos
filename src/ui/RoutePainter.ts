import { RouteDefinition, StopId } from '../simulation/graph/GraphTypes';
import { WorldSimulation } from '../simulation/WorldSimulation';

export interface TransitLinePreset {
  readonly id: string;
  readonly name: string;
  readonly colorHex: string;
  readonly colorInt: number;
}

export const TRANSIT_LINE_PRESETS: readonly TransitLinePreset[] = [
  { id: 'line_red', name: 'Línea 1: Expreso Rojo', colorHex: '#ef4444', colorInt: 0xef4444 },
  { id: 'line_green', name: 'Línea 2: Ruta Verde', colorHex: '#10b981', colorInt: 0x10b981 },
  { id: 'line_blue', name: 'Línea 3: Corredor Azul', colorHex: '#3b82f6', colorInt: 0x3b82f6 },
];

/**
 * Computes a hexadecimal RGB color (0xRRGGBB) representing road edge congestion:
 * - 0.00 -> Green (0x22c55e)
 * - 0.50 -> Yellow/Amber (0xeab308)
 * - 1.00+ -> Deep Red (0xdc2626)
 */
export function getCongestionHeatmapColor(congestionRatio: number): number {
  const clamped = Math.max(0, Math.min(1, congestionRatio));
  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    const r = Math.round(0x22 + (0xea - 0x22) * t);
    const g = Math.round(0xc5 + (0xb3 - 0xc5) * t);
    const b = Math.round(0x5e + (0x08 - 0x5e) * t);
    return (r << 16) | (g << 8) | b;
  }
  const t = (clamped - 0.5) / 0.5;
  const r = Math.round(0xea + (0xdc - 0xea) * t);
  const g = Math.round(0xb3 + (0x26 - 0xb3) * t);
  const b = Math.round(0x08 + (0x26 - 0x08) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Interactive drag-to-connect controller for creating and modifying transit routes between Bus Stops.
 * Decoupled from Phaser rendering primitives so all route-painting gestures can be unit tested headlessly.
 */
export class RoutePainter {
  private readonly simulation: WorldSimulation;
  private activeLineIndex: number = 0;
  private isPainting: boolean = false;
  private draftStopIds: StopId[] = [];
  private pointerPosition: { x: number; y: number } = { x: 0, y: 0 };
  private evadeAtuByLine: Map<string, boolean> = new Map([
    ['line_red', true],
    ['line_green', true],
    ['line_blue', false],
  ]);

  constructor(simulation: WorldSimulation) {
    this.simulation = simulation;
  }

  public getActiveLinePreset(): TransitLinePreset {
    return TRANSIT_LINE_PRESETS[this.activeLineIndex]!;
  }

  public setActiveLineIndex(index: number): void {
    if (index >= 0 && index < TRANSIT_LINE_PRESETS.length) {
      this.activeLineIndex = index;
    }
  }

  public isEvadeAtuEnabled(lineId: string = this.getActiveLinePreset().id): boolean {
    return this.evadeAtuByLine.get(lineId) ?? true;
  }

  public toggleEvadeAtu(lineId: string = this.getActiveLinePreset().id): boolean {
    const next = !this.isEvadeAtuEnabled(lineId);
    this.evadeAtuByLine.set(lineId, next);

    const existingRoute = this.simulation.getRoute(lineId);
    if (existingRoute) {
      const updatedRoute: RouteDefinition = {
        ...existingRoute,
        evadeAtuCheckpoints: next,
      };
      this.simulation.registerRoute(updatedRoute);
      for (const vehicle of this.simulation.getAllVehicles()) {
        if (vehicle.getRoute().id === lineId) {
          vehicle.setRoute(updatedRoute);
        }
      }
    }
    return next;
  }

  public getIsPainting(): boolean {
    return this.isPainting;
  }

  public getDraftStopIds(): readonly StopId[] {
    return this.draftStopIds;
  }

  public getPointerPosition(): { x: number; y: number } {
    return this.pointerPosition;
  }

  /**
   * Starts a drag-to-connect gesture on a BUS_STOP node.
   */
  public startPaintingAtStop(stopId: StopId): boolean {
    const stop = this.simulation.getBusStop(stopId);
    if (!stop) {
      return false;
    }
    this.isPainting = true;
    this.draftStopIds = [stopId];
    this.pointerPosition = { x: stop.node.x, y: stop.node.y };
    return true;
  }

  /**
   * Updates the live drag cursor coordinates while painting a route.
   */
  public updatePointerPosition(x: number, y: number): void {
    this.pointerPosition = { x, y };
  }

  /**
   * Appends a bus stop to the active route draft when the player drags over it,
   * verifying that a directed road path exists from the previous stop.
   */
  public dragOverStop(stopId: StopId): boolean {
    if (!this.isPainting || this.draftStopIds.length === 0) {
      return false;
    }
    const stop = this.simulation.getBusStop(stopId);
    if (!stop) {
      return false;
    }
    const lastStopId = this.draftStopIds[this.draftStopIds.length - 1]!;
    if (lastStopId === stopId) {
      return false;
    }

    const path = this.simulation.pathfinder.findShortestPath(lastStopId, stopId);
    if (!path || path.edges.length === 0) {
      return false;
    }

    this.draftStopIds.push(stopId);
    return true;
  }

  /**
   * Completes the drag gesture, optionally closing the round-trip loop, registers the RouteDefinition
   * in WorldSimulation, and updates any vehicles assigned to this transit line.
   */
  public commitPaintedRoute(autoCompleteRoundTrip: boolean = true): RouteDefinition | null {
    if (!this.isPainting) {
      return null;
    }
    this.isPainting = false;

    if (this.draftStopIds.length < 2) {
      this.draftStopIds = [];
      return null;
    }

    const finalStopIds: StopId[] = [...this.draftStopIds];
    if (autoCompleteRoundTrip) {
      // Append stops in reverse order so the vehicle performs a continuous bidirectional loop
      for (let i = this.draftStopIds.length - 2; i >= 0; i--) {
        const returnCandidate = this.draftStopIds[i]!;
        const prev = finalStopIds[finalStopIds.length - 1]!;
        const returnPath = this.simulation.pathfinder.findShortestPath(prev, returnCandidate);
        if (returnPath && returnPath.edges.length > 0) {
          finalStopIds.push(returnCandidate);
        }
      }
    }

    const preset = this.getActiveLinePreset();
    const route: RouteDefinition = {
      id: preset.id,
      name: preset.name,
      color: preset.colorHex,
      stopIds: finalStopIds,
      evadeAtuCheckpoints: this.isEvadeAtuEnabled(preset.id),
    };

    this.simulation.registerRoute(route);
    for (const vehicle of this.simulation.getAllVehicles()) {
      if (vehicle.getRoute().id === route.id) {
        vehicle.setRoute(route);
      }
    }

    this.draftStopIds = [];
    return route;
  }

  public cancelPainting(): void {
    this.isPainting = false;
    this.draftStopIds = [];
  }

  /**
   * Assigns an existing vehicle in the fleet to a registered route.
   */
  public assignVehicleToRoute(vehicleId: string, routeId: string): boolean {
    const vehicle = this.simulation.getVehicle(vehicleId);
    const route = this.simulation.getRoute(routeId);
    if (!vehicle || !route) {
      return false;
    }
    vehicle.setRoute(route);
    return true;
  }
}
