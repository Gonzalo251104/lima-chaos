import { RoadNode, StopId } from '../graph/GraphTypes';
import { Passenger } from './Passenger';

/**
 * Manages the FIFO waiting queue and overflow state at a BUS_STOP node.
 * Pure TypeScript — zero Phaser dependencies.
 */
export class BusStopNode {
  public static readonly DEFAULT_MAX_QUEUE_CAPACITY = 25;

  public readonly node: RoadNode;
  public readonly maxQueueCapacity: number;
  private readonly queue: Passenger[] = [];

  constructor(node: RoadNode, maxQueueCapacity: number = BusStopNode.DEFAULT_MAX_QUEUE_CAPACITY) {
    if (node.type !== 'BUS_STOP') {
      throw new Error(`Node '${node.id}' is not of type BUS_STOP`);
    }
    this.node = node;
    this.maxQueueCapacity = maxQueueCapacity;
  }

  public get id(): StopId {
    return this.node.id;
  }

  public get name(): string {
    return this.node.name;
  }

  public get baseSpawnRatePerMin(): number {
    return this.node.baseSpawnRatePerMin ?? 10;
  }

  /**
   * Adds a new passenger to the back of the waiting queue.
   */
  public enqueuePassenger(passenger: Passenger): void {
    this.queue.push(passenger);
  }

  /**
   * Updates patience timers for all waiting passengers and removes any whose patience expired.
   * Returns the array of abandoned passengers removed during this tick.
   */
  public tickWaitingQueue(deltaSec: number): Passenger[] {
    const abandoned: Passenger[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const passenger = this.queue[i]!;
      if (passenger.tickPatience(deltaSec)) {
        abandoned.push(passenger);
        this.queue.splice(i, 1);
      }
    }
    return abandoned.reverse();
  }

  /**
   * Dequeues the first waiting passenger (FIFO) whose destination stop is included in reachableStopIds.
   * If reachableStopIds is omitted, dequeues the front passenger unconditionally.
   */
  public dequeueNextMatchingPassenger(
    reachableStopIds?: ReadonlySet<StopId>,
  ): Passenger | null {
    if (this.queue.length === 0) {
      return null;
    }
    if (!reachableStopIds) {
      return this.queue.shift() ?? null;
    }
    const index = this.queue.findIndex((p) => reachableStopIds.has(p.destinationStopId));
    if (index === -1) {
      return null;
    }
    const [passenger] = this.queue.splice(index, 1);
    return passenger ?? null;
  }

  /**
   * Checks if there is at least one waiting passenger whose destination matches reachableStopIds.
   */
  public hasMatchingPassenger(reachableStopIds?: ReadonlySet<StopId>): boolean {
    if (this.queue.length === 0) {
      return false;
    }
    if (!reachableStopIds) {
      return true;
    }
    return this.queue.some((p) => reachableStopIds.has(p.destinationStopId));
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getWaitingPassengers(): readonly Passenger[] {
    return this.queue;
  }

  public isOverflowing(): boolean {
    return this.queue.length > this.maxQueueCapacity;
  }
}
