/**
 * Traffic signal controller at an INTERSECTION node.
 * Cycles deterministically through GREEN -> YELLOW -> RED phases.
 * Pure TypeScript — zero Phaser dependencies.
 */

export type TrafficLightPhase = 'GREEN' | 'YELLOW' | 'RED';

export class TrafficLight {
  public readonly intersectionNodeId: string;
  public readonly cycleDurationSec: number;
  private elapsedSec: number;

  constructor(intersectionNodeId: string, cycleDurationSec: number = 25, initialOffsetSec: number = 0) {
    this.intersectionNodeId = intersectionNodeId;
    this.cycleDurationSec = Math.max(5, cycleDurationSec);
    this.elapsedSec = initialOffsetSec % this.cycleDurationSec;
  }

  /**
   * Advances the signal timer by deltaSec seconds.
   */
  public tick(deltaSec: number): void {
    this.elapsedSec = (this.elapsedSec + deltaSec) % this.cycleDurationSec;
  }

  /**
   * Phase distribution within each cycle:
   * - [0.00, 0.50): GREEN
   * - [0.50, 0.60): YELLOW
   * - [0.60, 1.00): RED
   */
  public getPhase(): TrafficLightPhase {
    const ratio = this.elapsedSec / this.cycleDurationSec;
    if (ratio < 0.5) {
      return 'GREEN';
    }
    if (ratio < 0.6) {
      return 'YELLOW';
    }
    return 'RED';
  }

  /**
   * Returns true if vehicles approaching the intersection are allowed to cross.
   */
  public canProceed(): boolean {
    return this.getPhase() !== 'RED';
  }

  /**
   * Explicitly sets the phase timer (useful for deterministic unit tests).
   */
  public setPhase(phase: TrafficLightPhase): void {
    if (phase === 'GREEN') {
      this.elapsedSec = 0;
    } else if (phase === 'YELLOW') {
      this.elapsedSec = this.cycleDurationSec * 0.52;
    } else {
      this.elapsedSec = this.cycleDurationSec * 0.7;
    }
  }
}
