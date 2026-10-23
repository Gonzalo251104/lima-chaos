import { StopId } from '../graph/GraphTypes';

/**
 * Represents a commuter waiting at a Lima bus stop or riding aboard a transit vehicle.
 * Pure TypeScript — zero Phaser dependencies.
 */
export class Passenger {
  public readonly id: string;
  public readonly originStopId: StopId;
  public readonly destinationStopId: StopId;
  public readonly fareAmount: number;
  public readonly maxPatienceSec: number;
  private remainingPatienceSec: number;

  constructor(params: {
    id: string;
    originStopId: StopId;
    destinationStopId: StopId;
    fareAmount: number;
    maxPatienceSec?: number;
  }) {
    this.id = params.id;
    this.originStopId = params.originStopId;
    this.destinationStopId = params.destinationStopId;
    this.fareAmount = params.fareAmount;
    this.maxPatienceSec = params.maxPatienceSec ?? 90;
    this.remainingPatienceSec = this.maxPatienceSec;
  }

  /**
   * Decrements waiting patience by deltaSec. Returns true if patience has run out.
   */
  public tickPatience(deltaSec: number): boolean {
    this.remainingPatienceSec = Math.max(0, this.remainingPatienceSec - deltaSec);
    return this.remainingPatienceSec <= 0;
  }

  public getRemainingPatienceSec(): number {
    return this.remainingPatienceSec;
  }

  /**
   * Returns normalized patience in the range [0, 1].
   */
  public getPatienceRatio(): number {
    if (this.maxPatienceSec <= 0) {
      return 0;
    }
    return this.remainingPatienceSec / this.maxPatienceSec;
  }

  public isExpired(): boolean {
    return this.remainingPatienceSec <= 0;
  }
}
