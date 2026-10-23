/**
 * Calculates Lima transit fares from "China" (S/ 0.50) to "Directo" (S/ 3.00)
 * based on travel distance in meters.
 * Pure TypeScript — zero Phaser dependencies.
 */

export interface FareQuote {
  readonly amount: number;
  readonly slangName: 'China' | 'Luca' | 'Luca China' | 'Dos Lucas' | 'Directo';
}

export class FareCalculator {
  public static readonly CHINA_FARE = 0.5;
  public static readonly LUCA_FARE = 1.0;
  public static readonly LUCA_CHINA_FARE = 1.5;
  public static readonly DOS_LUCAS_FARE = 2.0;
  public static readonly DIRECTO_FARE = 3.0;

  /**
   * Returns the fare amount and Peruvian slang label for a given travel distance in meters.
   */
  public static calculateByDistance(distanceMeters: number): FareQuote {
    if (distanceMeters <= 600) {
      return { amount: FareCalculator.CHINA_FARE, slangName: 'China' };
    }
    if (distanceMeters <= 1400) {
      return { amount: FareCalculator.LUCA_FARE, slangName: 'Luca' };
    }
    if (distanceMeters <= 2400) {
      return { amount: FareCalculator.LUCA_CHINA_FARE, slangName: 'Luca China' };
    }
    if (distanceMeters <= 3800) {
      return { amount: FareCalculator.DOS_LUCAS_FARE, slangName: 'Dos Lucas' };
    }
    return { amount: FareCalculator.DIRECTO_FARE, slangName: 'Directo' };
  }
}
