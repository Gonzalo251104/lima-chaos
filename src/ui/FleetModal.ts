import Phaser from 'phaser';
import { VehicleArchetype } from '../simulation/graph/GraphTypes';
import { WorldSimulation } from '../simulation/WorldSimulation';
import { RoutePainter } from './RoutePainter';

/**
 * Interactive Fleet Management & Upgrades modal ("Taller & Flota").
 * Allows players to buy Combis, Cústers, and Corredores, hire "Garganta de Lata" Cobrador upgrades (-40% boarding time),
 * and toggle "Correteo" per vehicle.
 */
export class FleetModal {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public show(
    simulation: WorldSimulation,
    routePainter: RoutePainter,
    archetypes: readonly VehicleArchetype[],
  ): void {
    this.hide();

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    const backdrop = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0x030712, 0.8)
      .setInteractive();

    const cardWidth = 760;
    const cardHeight = 520;
    const cardBg = this.scene.add
      .rectangle(width / 2, height / 2, cardWidth, cardHeight, 0x0f172a, 0.98)
      .setStrokeStyle(2, 0x38bdf8);

    const activePreset = routePainter.getActiveLinePreset();

    const title = this.scene.add
      .text(
        width / 2,
        height / 2 - 225,
        `🚐 SINDICATO DE TRANSPORTE — COMPRA Y MEJORAS (Caja: S/ ${simulation.economy.getCash().toFixed(2)})`,
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#38bdf8',
        },
      )
      .setOrigin(0.5);

    const shopHeader = this.scene.add
      .text(
        width / 2 - 340,
        height / 2 - 185,
        `1. Comprar Unidades Nuevas (Se asignarán a ${activePreset.name}):`,
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#fbbf24',
        },
      )
      .setOrigin(0, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [
      backdrop,
      cardBg,
      title,
      shopHeader,
    ];

    // 1. Vehicle Archetype Shop Cards
    archetypes.forEach((arch, idx) => {
      const cx = width / 2 - 235 + idx * 235;
      const cy = height / 2 - 115;
      const canAfford = simulation.economy.getCash() >= arch.cost;

      const box = this.scene.add
        .rectangle(cx, cy, 220, 105, 0x1e293b)
        .setStrokeStyle(1.5, canAfford ? 0x10b981 : 0x475569);

      const nameTxt = this.scene.add
        .text(cx, cy - 34, arch.name, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#f8fafc',
        })
        .setOrigin(0.5);

      const specsTxt = this.scene.add
        .text(
          cx,
          cy - 8,
          `Cap: ${arch.capacity} pax | Vel: x${arch.speedMultiplier}\nPermiso ATU: ${arch.hasLegalPermit ? 'Formal' : 'Pirata'}`,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            color: '#cbd5e1',
            align: 'center',
          },
        )
        .setOrigin(0.5);

      const buyBtn = this.scene.add
        .rectangle(cx, cy + 32, 180, 26, canAfford ? 0x10b981 : 0x334155)
        .setInteractive({ useHandCursor: canAfford });

      const buyLbl = this.scene.add
        .text(cx, cy + 32, `Comprar (S/ ${arch.cost})`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: canAfford ? '#022c22' : '#94a3b8',
        })
        .setOrigin(0.5);

      if (canAfford) {
        buyBtn.on('pointerdown', () => {
          simulation.purchasePlayerVehicle(arch, activePreset.id);
          this.show(simulation, routePainter, archetypes);
        });
      }

      children.push(box, nameTxt, specsTxt, buyBtn, buyLbl);
    });

    // 2. Existing Player Fleet & "Garganta de Lata" Cobrador Upgrades
    const fleetHeader = this.scene.add
      .text(
        width / 2 - 340,
        height / 2 - 35,
        '2. Tu Flota Activa — Contratar Cobrador "Garganta de Lata" (-40% tiempo de subida) y Correteo:',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#fbbf24',
        },
      )
      .setOrigin(0, 0.5);
    children.push(fleetHeader);

    const playerVehicles = simulation.getPlayerVehicles().slice(0, 5);
    playerVehicles.forEach((v, idx) => {
      const ry = height / 2 + 5 + idx * 38;

      const rowBg = this.scene.add
        .rectangle(width / 2, ry, 680, 32, 0x111827)
        .setStrokeStyle(1, 0x334155);

      const vInfo = this.scene.add
        .text(
          width / 2 - 325,
          ry,
          `${v.id} (${v.archetype.name}) — [${v.getRoute().name.split(':')[0]}]`,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            color: '#e2e8f0',
          },
        )
        .setOrigin(0, 0.5);

      // Correteo Toggle Button
      const isCorreteo = v.isCorreteoEnabled();
      const correteoBtn = this.scene.add
        .rectangle(width / 2 + 55, ry, 145, 24, isCorreteo ? 0xd97706 : 0x1e293b)
        .setStrokeStyle(1, 0xfbbf24)
        .setInteractive({ useHandCursor: true });

      const correteoLbl = this.scene.add
        .text(width / 2 + 55, ry, `🔥 Correteo: ${isCorreteo ? 'ON' : 'OFF'}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#fef08a',
        })
        .setOrigin(0.5);

      correteoBtn.on('pointerdown', () => {
        v.setCorreteoEnabled(!v.isCorreteoEnabled());
        this.show(simulation, routePainter, archetypes);
      });

      // Cobrador "Garganta de Lata" Upgrade Button
      const hasCobrador = v.hasCobrador();
      const canAffordCobrador =
        !hasCobrador &&
        simulation.economy.getCash() >= WorldSimulation.COBRADOR_UPGRADE_COST;

      const cobradorBtn = this.scene.add
        .rectangle(
          width / 2 + 235,
          ry,
          190,
          24,
          hasCobrador ? 0x065f46 : canAffordCobrador ? 0x2563eb : 0x334155,
        )
        .setInteractive({ useHandCursor: canAffordCobrador });

      const cobradorLbl = this.scene.add
        .text(
          width / 2 + 235,
          ry,
          hasCobrador
            ? '🗣️ Garganta de Lata: ACTIVO'
            : `🗣️ Cobrador (S/ ${WorldSimulation.COBRADOR_UPGRADE_COST})`,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#f8fafc',
          },
        )
        .setOrigin(0.5);

      if (canAffordCobrador) {
        cobradorBtn.on('pointerdown', () => {
          simulation.hireCobradorUpgrade(v.id);
          this.show(simulation, routePainter, archetypes);
        });
      }

      children.push(rowBg, vInfo, correteoBtn, correteoLbl, cobradorBtn, cobradorLbl);
    });

    const closeBtn = this.scene.add
      .rectangle(width / 2, height / 2 + 220, 200, 36, 0xef4444)
      .setInteractive({ useHandCursor: true });

    const closeLbl = this.scene.add
      .text(width / 2, height / 2 + 220, 'Cerrar Ventana', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    closeBtn.on('pointerdown', () => this.hide());
    children.push(closeBtn, closeLbl);

    this.container = this.scene.add.container(0, 0, children).setDepth(950);
  }

  public hide(): void {
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
  }

  public isVisible(): boolean {
    return this.container !== null;
  }
}
