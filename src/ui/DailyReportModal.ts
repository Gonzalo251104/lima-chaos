import Phaser from 'phaser';
import { DailyFinancialReport } from '../simulation/economy/EconomyManager';

/**
 * Renders the End-of-Day Profit & Loss summary modal ("Liquidación del Día") inside HudScene.
 */
export class DailyReportModal {
  private readonly scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public show(
    dayNumber: number,
    report: DailyFinancialReport,
    targetDailyProfit: number,
    onNextDay: () => void,
  ): void {
    this.hide();

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    const backdrop = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0x030712, 0.78)
      .setInteractive();

    const cardWidth = 520;
    const cardHeight = 420;
    const cardBg = this.scene.add
      .rectangle(width / 2, height / 2, cardWidth, cardHeight, 0x111827, 0.98)
      .setStrokeStyle(2, 0xf59e0b);

    const metTarget = report.netOperatingProfit >= targetDailyProfit;
    const statusBadgeText = metTarget
      ? '¡META CUMPLIDA! ("¡Habla bien, chofer!")'
      : 'META NO ALCANZADA ("Falta hacer más vueltas")';
    const statusColor = metTarget ? '#22c55e' : '#f87171';

    const title = this.scene.add
      .text(width / 2, height / 2 - 170, `LIQUIDACIÓN DEL DÍA #${dayNumber}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#fbbf24',
      })
      .setOrigin(0.5);

    const subtitle = this.scene.add
      .text(width / 2, height / 2 - 135, statusBadgeText, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: statusColor,
      })
      .setOrigin(0.5);

    const rows: Array<[string, string, string]> = [
      ['Pasajeros Transportados:', `${report.passengersServed} pasajeros`, '#e5e7eb'],
      ['Pasajeros Aburridos (Cola):', `${report.passengersAbandoned}`, '#9ca3af'],
      ['Ingresos por Pasajes ("Chinas" / "Directo"):', `+ S/ ${report.fareRevenue.toFixed(2)}`, '#4ade80'],
      ['Gasto de Combustible (GNV / Diesel):', `- S/ ${report.fuelExpenses.toFixed(2)}`, '#f87171'],
      ['Papeletas Operativo ATU:', `- S/ ${report.finesPaid.toFixed(2)}`, '#ef4444'],
      [
        `Utilidad Operativa Neta (Meta: S/ ${targetDailyProfit}):`,
        `S/ ${report.netOperatingProfit.toFixed(2)}`,
        metTarget ? '#22c55e' : '#fbbf24',
      ],
      ['Caja Disponible para Mañana:', `S/ ${report.endingCash.toFixed(2)}`, '#38bdf8'],
    ];

    const rowObjects: Phaser.GameObjects.GameObject[] = [];
    rows.forEach(([label, value, color], idx) => {
      const yPos = height / 2 - 90 + idx * 32;
      const lblText = this.scene.add
        .text(width / 2 - 225, yPos, label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: '#d1d5db',
        })
        .setOrigin(0, 0.5);

      const valText = this.scene.add
        .text(width / 2 + 225, yPos, value, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color,
        })
        .setOrigin(1, 0.5);

      rowObjects.push(lblText, valText);
    });

    const nextDayBtnBg = this.scene.add
      .rectangle(width / 2, height / 2 + 160, 280, 44, 0x10b981)
      .setStrokeStyle(1.5, 0x34d399)
      .setInteractive({ useHandCursor: true });

    const nextDayBtnLabel = this.scene.add
      .text(width / 2, height / 2 + 160, '¡Salir a Ruta! (Día Siguiente 05:00)', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#064e3b',
      })
      .setOrigin(0.5);

    nextDayBtnBg.on('pointerover', () => nextDayBtnBg.setFillStyle(0x34d399));
    nextDayBtnBg.on('pointerout', () => nextDayBtnBg.setFillStyle(0x10b981));
    nextDayBtnBg.on('pointerdown', () => {
      this.hide();
      onNextDay();
    });

    this.container = this.scene.add.container(0, 0, [
      backdrop,
      cardBg,
      title,
      subtitle,
      ...rowObjects,
      nextDayBtnBg,
      nextDayBtnLabel,
    ]);
    this.container.setDepth(1000);
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
