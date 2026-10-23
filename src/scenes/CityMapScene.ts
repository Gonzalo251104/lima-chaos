import Phaser from 'phaser';
import {
  LevelData,
  RoadEdge,
  RouteDefinition,
  VehicleArchetype,
} from '../simulation/graph/GraphTypes';
import { VehicleAgent } from '../simulation/entities/VehicleAgent';
import { WorldSimulation } from '../simulation/WorldSimulation';
import {
  getCongestionHeatmapColor,
  RoutePainter,
  TRANSIT_LINE_PRESETS,
} from '../ui/RoutePainter';

interface VehicleVisualBundle {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  badgeText: Phaser.GameObjects.Text;
  stateLabel: Phaser.GameObjects.Text;
}

interface StopVisualBundle {
  hitCircle: Phaser.GameObjects.Arc;
  nameLabel: Phaser.GameObjects.Text;
  queueBadge: Phaser.GameObjects.Text;
}

/**
 * Renders the Lima avenue road network, dynamic congestion heatmaps (Green -> Yellow -> Deep Red),
 * BusStopNode passenger queues with shrinking patience rings, traffic lights, ATU checkpoints,
 * Rival AI Combis, and interactive drag-to-connect route painting.
 */
export class CityMapScene extends Phaser.Scene {
  private simulation!: WorldSimulation;
  private routePainter!: RoutePainter;
  private speedMultiplier: number = 1;

  private roadGraphics!: Phaser.GameObjects.Graphics;
  private routeGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  private readonly stopVisuals: Map<string, StopVisualBundle> = new Map();
  private readonly vehicleVisuals: Map<string, VehicleVisualBundle> = new Map();
  private readonly atuLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  constructor() {
    super({ key: 'CityMapScene' });
  }

  public create(data?: { levelId?: string }): void {
    const levelId = data?.levelId ?? 'javier_prado';
    const levelData =
      (this.registry.get(`level:${levelId}`) as LevelData | undefined) ??
      (this.registry.get('level:javier_prado') as LevelData);
    const vehiclesData = this.registry.get('vehiclesData') as VehicleArchetype[];

    this.stopVisuals.clear();
    this.vehicleVisuals.clear();
    this.atuLabels.clear();
    this.speedMultiplier = 1;

    this.simulation = new WorldSimulation({
      levelData,
      seed: 2026,
      gameMinutesPerRealSecond: 1.0,
      enableDynamicAtuCheckpoints: true,
    });
    this.routePainter = new RoutePainter(this.simulation);

    this.drawBackgroundGrid();
    this.roadGraphics = this.add.graphics().setDepth(10);
    this.routeGraphics = this.add.graphics().setDepth(20);
    this.overlayGraphics = this.add.graphics().setDepth(30);

    this.setupInitialRoutesAndFleet(levelData, vehiclesData);
    this.createNodeVisuals();
    this.setupPointerRoutePainting();

    // Launch HUD overlay scene in parallel
    this.scene.launch('HudScene', {
      simulation: this.simulation,
      routePainter: this.routePainter,
      cityScene: this,
    });
  }

  public update(_time: number, deltaMs: number): void {
    if (this.speedMultiplier > 0 && !this.simulation.clock.isDayOver()) {
      const scaledDelta = Math.min(deltaMs, 100) * this.speedMultiplier;
      this.simulation.tick(scaledDelta);
    }

    this.renderRoadNetwork();
    this.renderRoutesAndPainterPreview();
    this.renderDynamicEntities();
  }

  public setSimulationSpeed(multiplier: number): void {
    this.speedMultiplier = Math.max(0, multiplier);
  }

  public getSimulationSpeed(): number {
    return this.speedMultiplier;
  }

  public getSimulation(): WorldSimulation {
    return this.simulation;
  }

  private drawBackgroundGrid(): void {
    const { width, height } = this.scale;
    const bg = this.add.graphics().setDepth(0);
    bg.fillStyle(0x0f172a, 1);
    bg.fillRect(0, 0, width, height);

    bg.lineStyle(1, 0x1e293b, 0.55);
    for (let x = 0; x < width; x += 40) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 40) {
      bg.lineBetween(0, y, width, y);
    }
  }

  private setupInitialRoutesAndFleet(
    levelData: LevelData,
    vehiclesData: VehicleArchetype[],
  ): void {
    const stopIds = levelData.nodes
      .filter((n) => n.type === 'BUS_STOP')
      .map((n) => n.id);

    if (stopIds.length < 2) {
      return;
    }

    // Build bidirectional stop sequence across all stops
    const roundTripStops = [...stopIds];
    for (let i = stopIds.length - 2; i >= 0; i--) {
      roundTripStops.push(stopIds[i]!);
    }

    const redPreset = TRANSIT_LINE_PRESETS[0]!;
    const defaultRoute: RouteDefinition = {
      id: redPreset.id,
      name: redPreset.name,
      color: redPreset.colorHex,
      stopIds: roundTripStops,
      evadeAtuCheckpoints: true,
    };
    this.simulation.registerRoute(defaultRoute);

    const combi = vehiclesData.find((v) => v.id === 'combi_pirata') ?? vehiclesData[0]!;
    const custer = vehiclesData.find((v) => v.id === 'custer_chicha') ?? combi;

    this.simulation.addVehicle({
      id: 'combi_1',
      archetype: combi,
      route: defaultRoute,
      isPlayerOwned: true,
    });
    this.simulation.addVehicle({
      id: 'combi_2',
      archetype: combi,
      route: defaultRoute,
      isPlayerOwned: true,
    });
    this.simulation.addVehicle({
      id: 'custer_1',
      archetype: custer,
      route: defaultRoute,
      isPlayerOwned: true,
    });

    // Spawn Rival AI Combis competing for the highest-demand stops
    this.simulation.spawnRivalCombi(combi, 'rival_1');
    this.simulation.spawnRivalCombi(combi, 'rival_2');
  }

  private createNodeVisuals(): void {
    for (const node of this.simulation.graph.getAllNodes()) {
      if (node.type === 'BUS_STOP') {
        const hitCircle = this.add
          .circle(node.x, node.y, 24, 0x1e293b, 1)
          .setStrokeStyle(3, 0x38bdf8)
          .setInteractive({ useHandCursor: true })
          .setDepth(35);

        const iconText = this.add
          .text(node.x, node.y, '🚏', { fontSize: '18px' })
          .setOrigin(0.5)
          .setDepth(36);
        void iconText;

        const nameLabel = this.add
          .text(node.x, node.y + 38, node.name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#f8fafc',
            backgroundColor: '#0f172acc',
            padding: { x: 6, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(36);

        const queueBadge = this.add
          .text(node.x, node.y + 58, 'Esperando: 0', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            color: '#94a3b8',
          })
          .setOrigin(0.5)
          .setDepth(36);

        hitCircle.on('pointerdown', () => {
          this.routePainter.startPaintingAtStop(node.id);
        });

        hitCircle.on('pointerover', () => {
          hitCircle.setStrokeStyle(4, 0xfbbf24);
          if (this.routePainter.getIsPainting()) {
            this.routePainter.dragOverStop(node.id);
          }
        });

        hitCircle.on('pointerout', () => {
          hitCircle.setStrokeStyle(3, 0x38bdf8);
        });

        this.stopVisuals.set(node.id, { hitCircle, nameLabel, queueBadge });
      } else if (node.type === 'INTERSECTION') {
        this.add
          .circle(node.x, node.y, 16, 0x334155, 1)
          .setStrokeStyle(2, 0x64748b)
          .setDepth(32);

        this.add
          .text(node.x, node.y + 28, node.name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            color: '#cbd5e1',
            backgroundColor: '#0f172aa0',
            padding: { x: 4, y: 1 },
          })
          .setOrigin(0.5)
          .setDepth(33);
      }
    }
  }

  private setupPointerRoutePainting(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.routePainter.getIsPainting()) {
        this.routePainter.updatePointerPosition(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointerup', () => {
      if (this.routePainter.getIsPainting()) {
        this.routePainter.commitPaintedRoute(true);
      }
    });
  }

  /**
   * Computes lane-offset start and end coordinates for a directed road edge
   * so main avenues, return avenues, and auxiliary bypass roads are clearly separated visually.
   */
  private getEdgeLaneEndpoints(edge: RoadEdge): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    midX: number;
    midY: number;
    angleRad: number;
  } {
    const from = this.simulation.graph.getNode(edge.from);
    const to = this.simulation.graph.getNode(edge.to);
    if (!from || !to) {
      return { x1: 0, y1: 0, x2: 0, y2: 0, midX: 0, midY: 0, angleRad: 0 };
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;

    let offsetPx = -12;
    if (edge.isAuxiliary) {
      offsetPx = -46;
    } else if (edge.id.includes('return')) {
      offsetPx = 14;
    }

    const x1 = from.x + nx * offsetPx;
    const y1 = from.y + ny * offsetPx;
    const x2 = to.x + nx * offsetPx;
    const y2 = to.y + ny * offsetPx;

    return {
      x1,
      y1,
      x2,
      y2,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
      angleRad: Math.atan2(y2 - y1, x2 - x1),
    };
  }

  private renderRoadNetwork(): void {
    this.roadGraphics.clear();

    for (const edge of this.simulation.graph.getAllEdges()) {
      const pts = this.getEdgeLaneEndpoints(edge);
      const congestionRatio = this.simulation.graph.getEdgeCongestionRatio(edge.id);
      const heatColor = getCongestionHeatmapColor(congestionRatio);
      const roadWidth = edge.isAuxiliary ? 8 : 13;

      this.roadGraphics.lineStyle(roadWidth + 4, 0x1e293b, 0.95);
      this.roadGraphics.lineBetween(pts.x1, pts.y1, pts.x2, pts.y2);

      this.roadGraphics.lineStyle(roadWidth, heatColor, edge.isAuxiliary ? 0.72 : 0.9);
      this.roadGraphics.lineBetween(pts.x1, pts.y1, pts.x2, pts.y2);

      const arrowSize = 6;
      const ax1 = pts.midX - Math.cos(pts.angleRad - 0.5) * arrowSize;
      const ay1 = pts.midY - Math.sin(pts.angleRad - 0.5) * arrowSize;
      const ax2 = pts.midX - Math.cos(pts.angleRad + 0.5) * arrowSize;
      const ay2 = pts.midY - Math.sin(pts.angleRad + 0.5) * arrowSize;
      this.roadGraphics.lineStyle(2, 0x0f172a, 0.85);
      this.roadGraphics.lineBetween(ax1, ay1, pts.midX, pts.midY);
      this.roadGraphics.lineBetween(ax2, ay2, pts.midX, pts.midY);

      const hasAtu = this.simulation.graph.hasAtuCheckpoint(edge.id);
      if (hasAtu) {
        this.roadGraphics.fillStyle(0xf97316, 1);
        this.roadGraphics.fillCircle(pts.midX, pts.midY, 10);
        this.roadGraphics.lineStyle(2, 0xfef08a, 1);
        this.roadGraphics.strokeCircle(pts.midX, pts.midY, 12);

        let label = this.atuLabels.get(edge.id);
        if (!label) {
          label = this.add
            .text(pts.midX, pts.midY - 22, '🚨 OPERATIVO ATU', {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '11px',
              fontStyle: 'bold',
              color: '#fef08a',
              backgroundColor: '#dc2626',
              padding: { x: 5, y: 2 },
            })
            .setOrigin(0.5)
            .setDepth(60);
          this.atuLabels.set(edge.id, label);
        } else {
          label.setPosition(pts.midX, pts.midY - 22);
          label.setVisible(true);
        }
      } else {
        const label = this.atuLabels.get(edge.id);
        if (label) {
          label.setVisible(false);
        }
      }
    }
  }

  private renderRoutesAndPainterPreview(): void {
    this.routeGraphics.clear();

    const routes = this.simulation.getAllRoutes();
    routes.forEach((route, routeIdx) => {
      const colorInt = Phaser.Display.Color.HexStringToColor(route.color).color;
      this.routeGraphics.lineStyle(3, colorInt, 0.85);

      for (let i = 0; i < route.stopIds.length - 1; i++) {
        const fromId = route.stopIds[i]!;
        const toId = route.stopIds[i + 1]!;
        const fromNode = this.simulation.graph.getNode(fromId);
        const toNode = this.simulation.graph.getNode(toId);
        if (fromNode && toNode) {
          const offset = (routeIdx - 1) * 4;
          this.routeGraphics.lineBetween(
            fromNode.x,
            fromNode.y + offset,
            toNode.x,
            toNode.y + offset,
          );
        }
      }
    });

    if (this.routePainter.getIsPainting()) {
      const draftStops = this.routePainter.getDraftStopIds();
      const preset = this.routePainter.getActiveLinePreset();
      this.routeGraphics.lineStyle(4, preset.colorInt, 1);

      for (let i = 0; i < draftStops.length - 1; i++) {
        const a = this.simulation.graph.getNode(draftStops[i]!);
        const b = this.simulation.graph.getNode(draftStops[i + 1]!);
        if (a && b) {
          this.routeGraphics.lineBetween(a.x, a.y, b.x, b.y);
        }
      }

      const lastStopId = draftStops[draftStops.length - 1];
      if (lastStopId) {
        const lastNode = this.simulation.graph.getNode(lastStopId);
        const ptr = this.routePainter.getPointerPosition();
        if (lastNode) {
          this.routeGraphics.lineStyle(3, preset.colorInt, 0.75);
          this.routeGraphics.lineBetween(lastNode.x, lastNode.y, ptr.x, ptr.y);
        }
      }
    }
  }

  private renderDynamicEntities(): void {
    this.overlayGraphics.clear();

    for (const node of this.simulation.graph.getAllNodes()) {
      if (node.type === 'INTERSECTION') {
        const light = this.simulation.getTrafficLight(node.id);
        if (light) {
          const phase = light.getPhase();
          const color =
            phase === 'GREEN'
              ? 0x22c55e
              : phase === 'YELLOW'
                ? 0xfacc15
                : 0xef4444;
          this.overlayGraphics.fillStyle(color, 1);
          this.overlayGraphics.fillCircle(node.x, node.y, 9);
        }
      }
    }

    for (const stop of this.simulation.getAllBusStops()) {
      const visual = this.stopVisuals.get(stop.id);
      const queue = stop.getWaitingPassengers();
      if (visual) {
        visual.queueBadge.setText(`Esperando: ${queue.length}/${stop.maxQueueCapacity}`);
        visual.queueBadge.setColor(stop.isOverflowing() ? '#ef4444' : '#94a3b8');
      }

      const maxVisibleDots = Math.min(queue.length, 16);
      for (let i = 0; i < maxVisibleDots; i++) {
        const passenger = queue[i]!;
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const ringLayer = Math.floor(i / 8);
        const orbitRadius = 35 + ringLayer * 14;
        const px = stop.node.x + Math.cos(angle) * orbitRadius;
        const py = stop.node.y + Math.sin(angle) * orbitRadius;

        const patienceRatio = passenger.getPatienceRatio();
        const ringColor =
          patienceRatio > 0.5
            ? 0x38bdf8
            : patienceRatio > 0.25
              ? 0xfacc15
              : 0xef4444;

        this.overlayGraphics.fillStyle(0xf8fafc, 1);
        this.overlayGraphics.fillCircle(px, py, 3.2);

        this.overlayGraphics.lineStyle(2, ringColor, 0.95);
        this.overlayGraphics.beginPath();
        this.overlayGraphics.arc(
          px,
          py,
          5.5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * patienceRatio,
          false,
        );
        this.overlayGraphics.strokePath();
      }
    }

    for (const vehicle of this.simulation.getAllVehicles()) {
      let bundle = this.vehicleVisuals.get(vehicle.id);
      if (!bundle) {
        bundle = this.createVehicleVisualBundle(vehicle);
        this.vehicleVisuals.set(vehicle.id, bundle);
      }

      const transform = this.computeVehicleScreenTransform(vehicle);
      bundle.container.setPosition(transform.x, transform.y);
      bundle.sprite.setRotation(transform.angleRad);

      const prefix = vehicle.isPlayerOwned
        ? vehicle.hasCobrador()
          ? '🗣️ '
          : ''
        : '🏴‍☠️ RIVAL ';
      bundle.badgeText.setText(
        `${prefix}${vehicle.getPassengerCount()}/${vehicle.archetype.capacity}`,
      );

      const state = vehicle.getStateName();
      if (state === 'BOARDING') {
        bundle.stateLabel.setText('¡Sube sube!');
        bundle.stateLabel.setColor('#4ade80');
        bundle.stateLabel.setVisible(true);
      } else if (state === 'OVERTAKING') {
        bundle.stateLabel.setText('🔥 ¡CORRETEO!');
        bundle.stateLabel.setColor('#fbbf24');
        bundle.stateLabel.setVisible(true);
      } else if (state === 'INSPECTED') {
        bundle.stateLabel.setText('🚓 PAPELETA ATU');
        bundle.stateLabel.setColor('#f87171');
        bundle.stateLabel.setVisible(true);
      } else if (vehicle.isPlayerOwned && vehicle.isCorreteoEnabled()) {
        bundle.stateLabel.setText('⚡ Correteo Listo');
        bundle.stateLabel.setColor('#fde047');
        bundle.stateLabel.setVisible(true);
      } else {
        bundle.stateLabel.setVisible(false);
      }
    }
  }

  private computeVehicleScreenTransform(vehicle: VehicleAgent): {
    x: number;
    y: number;
    angleRad: number;
  } {
    const edge = vehicle.getCurrentEdge();
    if (!edge) {
      const node = this.simulation.graph.getNode(vehicle.getCurrentNodeId());
      return { x: node?.x ?? 0, y: node?.y ?? 0, angleRad: 0 };
    }
    const pts = this.getEdgeLaneEndpoints(edge);
    const t = vehicle.getEdgeProgressRatio();
    return {
      x: pts.x1 + (pts.x2 - pts.x1) * t,
      y: pts.y1 + (pts.y2 - pts.y1) * t,
      angleRad: pts.angleRad,
    };
  }

  private createVehicleVisualBundle(vehicle: VehicleAgent): VehicleVisualBundle {
    const texKey =
      vehicle.archetype.id === 'corredor_azul'
        ? 'tex_corredor_azul'
        : vehicle.archetype.id === 'custer_chicha'
          ? 'tex_custer_chicha'
          : 'tex_combi_pirata';

    const sprite = this.add.image(0, 0, texKey);
    if (!vehicle.isPlayerOwned) {
      sprite.setTint(0xe879f9);
    } else {
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        vehicle.setCorreteoEnabled(!vehicle.isCorreteoEnabled());
      });
    }

    const badgeText = this.add
      .text(0, -18, `0/${vehicle.archetype.capacity}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: vehicle.isPlayerOwned ? '#f8fafc' : '#f5d0fe',
        backgroundColor: vehicle.isPlayerOwned ? '#0f172ad9' : '#4a044ed9',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5);

    const stateLabel = this.add
      .text(0, -33, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#4ade80',
        backgroundColor: '#030712cc',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    const container = this.add
      .container(0, 0, [sprite, badgeText, stateLabel])
      .setDepth(50);

    return { container, sprite, badgeText, stateLabel };
  }
}
