import Phaser from 'phaser';
import { LevelData } from '../simulation/graph/GraphTypes';

/**
 * Main menu and Lima corridor selector ("Javier Prado" vs "Abancay - Grau").
 */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  public create(): void {
    const { width, height } = this.scale;

    // Urban dark background grid
    const bgGrid = this.add.graphics();
    bgGrid.fillStyle(0x0b1120, 1);
    bgGrid.fillRect(0, 0, width, height);
    bgGrid.lineStyle(1, 0x1e293b, 0.5);
    for (let x = 0; x < width; x += 48) {
      bgGrid.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 48) {
      bgGrid.lineBetween(0, y, width, y);
    }

    this.add
      .text(width / 2, 110, 'LIMACAOS: COMBI TYCOON', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#fbbf24',
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        160,
        '« ¡Sube sube, pie derecho! Avanza al fondo que hay sitio... »',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          fontStyle: 'italic',
          color: '#94a3b8',
        },
      )
      .setOrigin(0.5);

    const javierPrado = this.registry.get('level:javier_prado') as LevelData;
    const abancayGrau = this.registry.get('level:abancay_grau') as LevelData;

    this.createLevelCard(
      width / 2 - 240,
      height / 2 + 20,
      javierPrado,
      'Nivel 1: Vía Expresa / Auxiliar, Trébol y Operativos ATU',
      0x10b981,
    );

    this.createLevelCard(
      width / 2 + 240,
      height / 2 + 20,
      abancayGrau,
      'Nivel 2: Caos en Congreso, Mesa Redonda y Estación Grau',
      0xf59e0b,
    );

    this.add
      .text(
        width / 2,
        height - 45,
        'Tip: Arrastra el mouse de un Paradero a otro en el mapa para trazar o modificar tus rutas.',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#64748b',
        },
      )
      .setOrigin(0.5);
  }

  private createLevelCard(
    x: number,
    y: number,
    level: LevelData,
    description: string,
    accentColor: number,
  ): void {
    const cardWidth = 420;
    const cardHeight = 250;

    const card = this.add
      .rectangle(x, y, cardWidth, cardHeight, 0x111827, 0.95)
      .setStrokeStyle(2, accentColor)
      .setInteractive({ useHandCursor: true });

    const title = this.add
      .text(x, y - 80, level.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '21px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(0.5);

    const desc = this.add
      .text(x, y - 30, description, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#cbd5e1',
        align: 'center',
        wordWrap: { width: cardWidth - 40 },
      })
      .setOrigin(0.5);

    const stats = this.add
      .text(
        x,
        y + 25,
        `Capital Inicial: S/ ${level.startingCash}   |   Meta Diaria: +S/ ${level.targetDailyProfit}`,
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#38bdf8',
        },
      )
      .setOrigin(0.5);

    const playBtn = this.add
      .rectangle(x, y + 80, 220, 40, accentColor)
      .setInteractive({ useHandCursor: true });

    const playText = this.add
      .text(x, y + 80, '¡Salir a Hacer Ruta!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#030712',
      })
      .setOrigin(0.5);

    const startGame = () => {
      this.scene.start('CityMapScene', { levelId: level.id });
    };

    card.on('pointerover', () => card.setFillStyle(0x1e293b, 1));
    card.on('pointerout', () => card.setFillStyle(0x111827, 0.95));
    card.on('pointerdown', startGame);
    playBtn.on('pointerdown', startGame);

    void title;
    void desc;
    void stats;
    void playText;
  }
}
