/**
 * Manages the in-game daily clock (05:00 to 23:00 = 18 hours = 1080 game minutes)
 * and Lima rush hour demand multipliers:
 * - Morning Rush Hour: 07:00 - 09:00
 * - Evening Rush Hour: 17:30 - 20:00
 */
export class GameClock {
  public static readonly START_MINUTE = 5 * 60; // 05:00 (300 minutes from midnight)
  public static readonly END_MINUTE = 23 * 60; // 23:00 (1380 minutes from midnight)
  public static readonly MORNING_RUSH_START = 7 * 60; // 07:00
  public static readonly MORNING_RUSH_END = 9 * 60; // 09:00
  public static readonly EVENING_RUSH_START = 17 * 60 + 30; // 17:30
  public static readonly EVENING_RUSH_END = 20 * 60; // 20:00

  public static readonly RUSH_HOUR_MULTIPLIER = 2.25;
  public static readonly NORMAL_HOUR_MULTIPLIER = 1.0;

  private currentMinutes: number;
  private dayNumber: number;
  private readonly gameMinutesPerRealSecond: number;

  /**
   * @param gameMinutesPerRealSecond How many in-game minutes elapse per 1 real-time second at 1x speed.
   * Default is 1.0 (1 real second = 1 in-game minute, so an 18-hour day is 18 real minutes at 1x).
   */
  constructor(gameMinutesPerRealSecond: number = 1.0) {
    this.currentMinutes = GameClock.START_MINUTE;
    this.dayNumber = 1;
    this.gameMinutesPerRealSecond = gameMinutesPerRealSecond;
  }

  /**
   * Advances the clock by deltaMs milliseconds of simulation time.
   * Returns the elapsed in-game minutes during this tick.
   */
  public advance(deltaMs: number): number {
    if (this.isDayOver()) {
      return 0;
    }
    const deltaSeconds = deltaMs / 1000;
    const elapsedMinutes = deltaSeconds * this.gameMinutesPerRealSecond;
    const nextMinutes = Math.min(GameClock.END_MINUTE, this.currentMinutes + elapsedMinutes);
    const actualElapsed = nextMinutes - this.currentMinutes;
    this.currentMinutes = nextMinutes;
    return actualElapsed;
  }

  /**
   * Returns the current time in minutes from midnight (e.g. 300 = 05:00).
   */
  public getCurrentMinutes(): number {
    return this.currentMinutes;
  }

  /**
   * Sets the current time in minutes from midnight (clamped to [START_MINUTE, END_MINUTE]).
   */
  public setCurrentMinutes(minutes: number): void {
    this.currentMinutes = Math.max(
      GameClock.START_MINUTE,
      Math.min(GameClock.END_MINUTE, minutes),
    );
  }

  /**
   * Returns true if the current time falls within Morning (07:00-09:00) or Evening (17:30-20:00) Rush Hour.
   */
  public isRushHour(): boolean {
    const m = this.currentMinutes;
    const isMorningRush =
      m >= GameClock.MORNING_RUSH_START && m <= GameClock.MORNING_RUSH_END;
    const isEveningRush =
      m >= GameClock.EVENING_RUSH_START && m <= GameClock.EVENING_RUSH_END;
    return isMorningRush || isEveningRush;
  }

  /**
   * Returns the passenger spawn demand multiplier for the current time of day.
   */
  public getDemandMultiplier(): number {
    return this.isRushHour()
      ? GameClock.RUSH_HOUR_MULTIPLIER
      : GameClock.NORMAL_HOUR_MULTIPLIER;
  }

  /**
   * Returns true if the clock has reached 23:00 (end of operating day).
   */
  public isDayOver(): boolean {
    return this.currentMinutes >= GameClock.END_MINUTE;
  }

  /**
   * Resets the clock to 05:00 and increments the day counter.
   */
  public startNextDay(): void {
    this.currentMinutes = GameClock.START_MINUTE;
    this.dayNumber += 1;
  }

  /**
   * Returns the current day number (1-indexed).
   */
  public getDayNumber(): number {
    return this.dayNumber;
  }

  /**
   * Formats the current clock time as "HH:MM" (24-hour format).
   */
  public getFormattedTime(): string {
    const totalFloored = Math.floor(this.currentMinutes);
    const hours = Math.floor(totalFloored / 60);
    const mins = totalFloored % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
}
