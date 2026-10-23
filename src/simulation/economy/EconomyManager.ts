import { EventBus } from '../../core/EventBus';

export interface DailyFinancialReport {
  readonly startingCash: number;
  readonly endingCash: number;
  readonly fareRevenue: number;
  readonly fuelExpenses: number;
  readonly finesPaid: number;
  readonly overflowPenalties: number;
  readonly capitalSpent: number;
  readonly netOperatingProfit: number;
  readonly passengersServed: number;
  readonly passengersAbandoned: number;
}

/**
 * Manages player cash balance, daily revenue, operating costs (fuel, ATU fines, overflow penalties),
 * and fleet capital expenditures.
 * Pure TypeScript — zero Phaser dependencies.
 */
export class EconomyManager {
  private cash: number;
  private startingDayCash: number;
  private fareRevenue: number = 0;
  private fuelExpenses: number = 0;
  private finesPaid: number = 0;
  private overflowPenalties: number = 0;
  private capitalSpent: number = 0;
  private passengersServed: number = 0;
  private passengersAbandoned: number = 0;
  private readonly eventBus?: EventBus;

  constructor(startingCash: number, eventBus?: EventBus) {
    this.cash = startingCash;
    this.startingDayCash = startingCash;
    this.eventBus = eventBus;
  }

  public getCash(): number {
    return Number(this.cash.toFixed(2));
  }

  /**
   * Credits passenger fare revenue to the player's cash balance.
   */
  public recordFare(amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.cash += amount;
    this.fareRevenue += amount;
    this.passengersServed += 1;
    this.eventBus?.emit('economy:updated', {
      cash: this.getCash(),
      delta: amount,
      reason: 'FARE',
    });
  }

  /**
   * Deducts fuel consumption cost based on distance traveled and fuel cost per kilometer.
   */
  public deductFuelCost(distanceMeters: number, fuelCostPerKm: number, multiplier: number = 1.0): number {
    const cost = (distanceMeters / 1000) * fuelCostPerKm * multiplier;
    if (cost <= 0) {
      return 0;
    }
    this.cash -= cost;
    this.fuelExpenses += cost;
    return cost;
  }

  /**
   * Deducts an ATU checkpoint fine from the player's cash balance.
   */
  public applyAtuFine(amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.cash -= amount;
    this.finesPaid += amount;
    this.eventBus?.emit('economy:updated', {
      cash: this.getCash(),
      delta: -amount,
      reason: 'FINE',
    });
  }

  /**
   * Applies a penalty when a bus stop overflows or a passenger abandons the queue out of frustration.
   */
  public recordPassengerAbandoned(penaltyAmount: number = 0): void {
    this.passengersAbandoned += 1;
    if (penaltyAmount > 0) {
      this.cash -= penaltyAmount;
      this.overflowPenalties += penaltyAmount;
      this.eventBus?.emit('economy:updated', {
        cash: this.getCash(),
        delta: -penaltyAmount,
        reason: 'OVERFLOW_PENALTY',
      });
    }
  }

  /**
   * Attempts to purchase a vehicle or upgrade. Returns true if the player has sufficient funds.
   */
  public spendCapital(cost: number, reason: 'PURCHASE' | 'UPGRADE' = 'PURCHASE'): boolean {
    if (cost < 0 || this.cash < cost) {
      return false;
    }
    this.cash -= cost;
    this.capitalSpent += cost;
    this.eventBus?.emit('economy:updated', {
      cash: this.getCash(),
      delta: -cost,
      reason,
    });
    return true;
  }

  /**
   * Returns a snapshot of the current day's Profit & Loss statement.
   */
  public getDailyReport(): DailyFinancialReport {
    const netOperatingProfit =
      this.fareRevenue - this.fuelExpenses - this.finesPaid - this.overflowPenalties;

    return {
      startingCash: Number(this.startingDayCash.toFixed(2)),
      endingCash: this.getCash(),
      fareRevenue: Number(this.fareRevenue.toFixed(2)),
      fuelExpenses: Number(this.fuelExpenses.toFixed(2)),
      finesPaid: Number(this.finesPaid.toFixed(2)),
      overflowPenalties: Number(this.overflowPenalties.toFixed(2)),
      capitalSpent: Number(this.capitalSpent.toFixed(2)),
      netOperatingProfit: Number(netOperatingProfit.toFixed(2)),
      passengersServed: this.passengersServed,
      passengersAbandoned: this.passengersAbandoned,
    };
  }

  /**
   * Resets daily P&L accumulators for the start of a new operating day while preserving cash.
   */
  public resetDailyCounters(): void {
    this.startingDayCash = this.cash;
    this.fareRevenue = 0;
    this.fuelExpenses = 0;
    this.finesPaid = 0;
    this.overflowPenalties = 0;
    this.capitalSpent = 0;
    this.passengersServed = 0;
    this.passengersAbandoned = 0;
  }
}
