import Phaser from 'phaser';
import abancayGrauData from '../../public/assets/data/levels/abancay_grau.json';
import javierPradoData from '../../public/assets/data/levels/javier_prado.json';
import vehiclesData from '../../public/assets/data/vehicles.json';

/**
 * Preloads level/vehicle data into the Phaser registry and generates procedural top-down sprites
 * for Combis, Cústers, Corredores, and ATU checkpoints.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  public preload(): void {
    // Store bundled JSON schemas in registry for instant synchronous access
    this.registry.set('vehiclesData', vehiclesData);
    this.registry.set('level:javier_prado', javierPradoData);
    this.registry.set('level:abancay_grau', abancayGrauData);

    this.generateProceduralTextures();
  }

  public create(): void {
    this.scene.start('MainMenuScene');
  }

  private generateProceduralTextures(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 });

    // 1. Combi Pirata (Compact white van with red/amber chicha stripe)
    gfx.clear();
    gfx.fillStyle(0xf8fafc, 1);
    gfx.fillRoundedRect(0, 0, 32, 18, 4);
    gfx.fillStyle(0xef4444, 1);
    gfx.fillRect(4, 2, 20, 3);
    gfx.fillRect(4, 13, 20, 3);
    gfx.fillStyle(0x1e293b, 1);
    gfx.fillRect(22, 3, 7, 12); // Windshield
    gfx.generateTexture('tex_combi_pirata', 32, 18);

    // 2. Cúster Chicha (Medium transit bus with green/yellow stripe)
    gfx.clear();
    gfx.fillStyle(0xfef08a, 1);
    gfx.fillRoundedRect(0, 0, 40, 20, 4);
    gfx.fillStyle(0x10b981, 1);
    gfx.fillRect(3, 2, 26, 4);
    gfx.fillRect(3, 14, 26, 4);
    gfx.fillStyle(0x0f172a, 1);
    gfx.fillRect(29, 3, 8, 14); // Windshield
    gfx.generateTexture('tex_custer_chicha', 40, 20);

    // 3. Corredor Azul (Formal blue metropolitan bus)
    gfx.clear();
    gfx.fillStyle(0x2563eb, 1);
    gfx.fillRoundedRect(0, 0, 48, 22, 4);
    gfx.fillStyle(0x93c5fd, 1);
    gfx.fillRect(4, 3, 32, 3);
    gfx.fillStyle(0x0f172a, 1);
    gfx.fillRect(37, 3, 8, 16); // Windshield
    gfx.generateTexture('tex_corredor_azul', 48, 22);

    gfx.destroy();
  }
}
