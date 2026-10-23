/**
 * Deterministic seeded Pseudo-Random Number Generator (Mulberry32).
 * Ensures simulation runs are 100% reproducible across unit tests.
 */
export class Random {
  private state: number;

  constructor(seed: number = 1337) {
    this.state = seed >>> 0;
  }

  /**
   * Returns a deterministic float in the range [0, 1).
   */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministic float in the range [min, max).
   */
  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a deterministic integer in the inclusive range [min, max].
   */
  public nextInt(min: number, max: number): number {
    const lower = Math.ceil(min);
    const upper = Math.floor(max);
    return Math.floor(this.next() * (upper - lower + 1)) + lower;
  }

  /**
   * Picks a random element from a non-empty readonly array.
   */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    const index = Math.floor(this.next() * items.length);
    return items[index]!;
  }
}
