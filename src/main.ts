import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CityMapScene } from './scenes/CityMapScene';
import { HudScene } from './scenes/HudScene';
import { MainMenuScene } from './scenes/MainMenuScene';

export const GAME_TITLE = 'LimaCaos: Combi Tycoon';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  title: GAME_TITLE,
  width: 1280,
  height: 720,
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MainMenuScene, CityMapScene, HudScene],
};

// Only instantiate Phaser.Game when running in a browser DOM environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  new Phaser.Game(gameConfig);
}
