import Phaser from 'phaser';
import { VehicleArchetype } from '../simulation/graph/GraphTypes';
import { WorldSimulation } from '../simulation/WorldSimulation';
import { DailyReportModal } from '../ui/DailyReportModal';
import { FleetModal } from '../ui/FleetModal';
import { RoutePainter, TRANSIT_LINE_PRESETS } from '../ui/RoutePainter';
import { CityMapScene } from './CityMapScene';

interface HudSceneInitData {
  simulation: WorldSimulation;
  routePainter: RoutePainter;
  cityScene: CityMapScene;
}

/**
 * Parallel HUD overlay scene displaying cashflow, GameClock, Rush Hour status,
 * simulation speed controls (0x, 1x, 2x, 4x), transit line editor controls,
 * FleetModal shop/upgrades trigger, "Correteo" fleet toggle, and DailyReportModal.
 */
export class HudScene extends Phaser.Scene {
  private simulation!: WorldSimulation;
  private routePainter!: RoutePainter;
  private cityScene!: CityMapScene;
  private dailyReportModal!: DailyReportModal;
  private fleetModal!: FleetModal;

  private cashText!: Phaser.GameObjects.Text;
  private profitText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private rushHourBadge!: Phaser.GameObjects.Text;
  private activeLineText!: Phaser.GameObjects.Text;
  private evadeBtnLabel!: Phaser.GameObjects.Text;
  private correteoBtnLabel!: Phaser.GameObjects.Text;
  private fleetAssignText!: Phaser.GameObjects.Text;

  private fleetCorreteoActive: boolean = false;
  private unsubscribeDayEnded: (() => void) | null = null;

  constructor() {
    super({ key: 'HudScene' });
  }

  public create(data: HudSceneInitData): void {
    this.simulation = data.simulation;
    this.routePainter = data.routePainter;
    this.cityScene = data.cityScene;
    this.dailyReportModal = new DailyReportModal(this);
    this.fleetModal = new FleetModal(this);
    this.fleetCorreteoActive = false;

    if (this.unsubscribeDayEnded) {
      this.unsubscribeDayEnded();
    }

    this.createTopBar();
    this.createBottomRouteBar();

    this.unsubscribeDayEnded = this.simulation.eventBus.on('clock:day-ended', ({ dayNumber }) => {
      this.cityScene.setSimulationSpeed(0);
      this.fleetModal.hide();
      this.dailyReportModal.show(
        dayNumber,
        this.simulation.getDailyReport(),
        this.simulation.levelData.targetDailyProfit,
        () => {
          this.simulation.startNextDay();
          this.cityScene.setSimulationSpeed(1);
        },
      );
    });
  }

  public update(): void {
    if (!this.simulation) {
      return;
    }

    const report = this.simulation.getDailyReport();
    this.cashText.setText(`💰 Caja: S/ ${this.simulation.economy.getCash().toFixed(2)}`);
    this.profitText.setText(
      `📈 Neto Hoy: S/ ${report.netOperatingProfit.toFixed(2)} (Meta: S/ ${this.simulation.levelData.targetDailyProfit}) | Pax: ${report.passengersServed} | Rivales: ${this.simulation.getRivalVehicles().length}`,
    );

    const dayNum = this.simulation.clock.getDayNumber();
    const timeStr = this.simulation.clock.getFormattedTime();
    this.clockText.setText(`🗓️ Día ${dayNum}  |  🕒 ${timeStr}`);

    const isRush = this.simulation.clock.isRushHour();
    this.rushHourBadge.setVisible(isRush);

    const preset = this.routePainter.getActiveLinePreset();
    const currentRoute = this.simulation.getRoute(preset.id);
    const stopsSummary = currentRoute
      ? `${currentRoute.stopIds.length} paradas`
      : 'Sin trazar (arrastra entre paraderos)';
    this.activeLineText.setText(`Pincel Activo: ${preset.name} (${stopsSummary})`);
    this.activeLineText.setColor(preset.colorHex);

    const evadeOn = this.routePainter.isEvadeAtuEnabled(preset.id);
    this.evadeBtnLabel.setText(`Evadir ATU: ${evadeOn ? 'SÍ' : 'NO'}`);

    this.correteoBtnLabel.setText(
      `🔥 Correteo: ${this.fleetCorreteoActive ? 'ON' : 'OFF'}`,
    );

    const vehiclesSummary = this.simulation
      .getPlayerVehicles()
      .map((v) => `${v.id}${v.hasCobrador() ? '🗣️' : ''} → [${v.getRoute().name.split(':')[0]}]`)
      .join('  |  ');
    this.fleetAssignText.setText(`Tu Flota: ${vehiclesSummary}`);
  }

  private createTopBar(): void {
    const { width } = this.scale;

    this.add
      .rectangle(width / 2, 28, width, 56, 0x030712, 0.9)
      .setStrokeStyle(1, 0x1e293b);

    this.cashText = this.add
      .text(20, 18, '💰 Caja: S/ 500.00', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#4ade80',
      })
      .setOrigin(0, 0.5);

    this.profitText = this.add
      .text(20, 40, '📈 Neto Hoy: S/ 0.00', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#cbd5e1',
      })
      .setOrigin(0, 0.5);

    this.clockText = this.add
      .text(width / 2 - 40, 20, '🗓️ Día 1  |  🕒 05:00', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#fbbf24',
      })
      .setOrigin(0.5);

    this.rushHourBadge = this.add
      .text(width / 2 - 40, 41, '🔥 ¡HORA PUNTA! Demanda x2.25', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fef08a',
        backgroundColor: '#dc2626',
        padding: { x: 6, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    const speeds: Array<{ label: string; mult: number }> = [
      { label: '⏸ 0x', mult: 0 },
      { label: '▶ 1x', mult: 1 },
      { label: '⏩ 2x', mult: 2 },
      { label: '⚡ 4x', mult: 4 },
    ];

    speeds.forEach((spd, idx) => {
      const bx = width - 310 + idx * 58;
      const btn = this.add
        .rectangle(bx, 28, 52, 30, 0x1e293b)
        .setStrokeStyle(1, 0x475569)
        .setInteractive({ useHandCursor: true });

      this.add
        .text(bx, 28, spd.label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f8fafc',
        })
        .setOrigin(0.5);

      btn.on('pointerdown', () => {
        this.cityScene.setSimulationSpeed(spd.mult);
      });
    });

    const menuBtn = this.add
      .rectangle(width - 48, 28, 72, 30, 0x334155)
      .setStrokeStyle(1, 0x64748b)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(width - 48, 28, 'Menú', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5);

    menuBtn.on('pointerdown', () => {
      if (this.unsubscribeDayEnded) {
        this.unsubscribeDayEnded();
      }
      this.scene.stop('CityMapScene');
      this.scene.start('MainMenuScene');
    });
  }

  private createBottomRouteBar(): void {
    const { width, height } = this.scale;
    const barY = height - 42;

    this.add
      .rectangle(width / 2, barY, width, 84, 0x030712, 0.92)
      .setStrokeStyle(1, 0x1e293b);

    this.activeLineText = this.add
      .text(20, barY - 22, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ef4444',
      })
      .setOrigin(0, 0.5);

    this.fleetAssignText = this.add
      .text(20, barY + 22, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#94a3b8',
      })
      .setOrigin(0, 0.5);

    TRANSIT_LINE_PRESETS.forEach((preset, idx) => {
      const bx = 90 + idx * 170;
      const by = barY - 1;
      const btn = this.add
        .rectangle(bx, by, 160, 26, 0x111827)
        .setStrokeStyle(1.5, preset.colorInt)
        .setInteractive({ useHandCursor: true });

      this.add
        .text(bx, by, preset.name, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: preset.colorHex,
        })
        .setOrigin(0.5);

      btn.on('pointerdown', () => {
        this.routePainter.setActiveLineIndex(idx);
      });
    });

    // Fleet & Upgrades Modal Button ("Sindicato / Comprar")
    const fleetBtn = this.add
      .rectangle(620, barY - 1, 175, 26, 0x065f46)
      .setStrokeStyle(1.5, 0x34d399)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(620, barY - 1, '🛒 Flota y Cobradores', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ecfdf5',
      })
      .setOrigin(0.5);

    fleetBtn.on('pointerdown', () => {
      const archetypes = this.registry.get('vehiclesData') as VehicleArchetype[];
      this.fleetModal.show(this.simulation, this.routePainter, archetypes);
    });

    // Fleet-wide "Correteo" Toggle Button
    const correteoBtn = this.add
      .rectangle(795, barY - 1, 155, 26, 0x78350f)
      .setStrokeStyle(1, 0xfbbf24)
      .setInteractive({ useHandCursor: true });

    this.correteoBtnLabel = this.add
      .text(795, barY - 1, '🔥 Correteo: OFF', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fef08a',
      })
      .setOrigin(0.5);

    correteoBtn.on('pointerdown', () => {
      this.fleetCorreteoActive = !this.fleetCorreteoActive;
      this.simulation.setFleetCorreteo(this.fleetCorreteoActive);
    });

    // Toggle Evade ATU button
    const evadeBtn = this.add
      .rectangle(965, barY - 1, 165, 26, 0x1e293b)
      .setStrokeStyle(1, 0x38bdf8)
      .setInteractive({ useHandCursor: true });

    this.evadeBtnLabel = this.add
      .text(965, barY - 1, 'Evadir ATU: SÍ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#38bdf8',
      })
      .setOrigin(0.5);

    evadeBtn.on('pointerdown', () => {
      this.routePainter.toggleEvadeAtu();
    });

    // Spawn/Toggle ATU checkpoint on main avenue
    const atuTestBtn = this.add
      .rectangle(1155, barY - 1, 190, 26, 0x7f1d1d)
      .setStrokeStyle(1, 0xef4444)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(1155, barY - 1, '🚨 Operativo ATU', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fecaca',
      })
      .setOrigin(0.5);

    atuTestBtn.on('pointerdown', () => {
      const mainEdge =
        this.simulation.graph.getEdge('e2_main') ??
        this.simulation.graph.getEdge('ab_e2_main');
      if (mainEdge) {
        if (this.simulation.graph.hasAtuCheckpoint(mainEdge.id)) {
          this.simulation.clearAtuCheckpoint(mainEdge.id);
        } else {
          this.simulation.spawnAtuCheckpoint(mainEdge.id, 180);
        }
      }
    });
  }
}
