/**
 * Strictly typed Pub/Sub EventBus bridging the Pure TS Simulation Core and Phaser 3 UI.
 */
export interface SimulationEventMap {
  'clock:tick': {
    totalMinutes: number;
    formattedTime: string;
    isRushHour: boolean;
    demandMultiplier: number;
  };
  'clock:day-ended': {
    dayNumber: number;
  };
  'passenger:spawned': {
    passengerId: string;
    originStopId: string;
    destinationStopId: string;
  };
  'passenger:boarded': {
    passengerId: string;
    vehicleId: string;
    stopId: string;
    farePaid: number;
  };
  'passenger:alighted': {
    passengerId: string;
    vehicleId: string;
    stopId: string;
  };
  'passenger:abandoned': {
    passengerId: string;
    stopId: string;
  };
  'stop:overflow': {
    stopId: string;
    queueLength: number;
  };
  'vehicle:state-changed': {
    vehicleId: string;
    previousState: string;
    newState: string;
  };
  'vehicle:correteo-started': {
    vehicleId: string;
    rivalVehicleId: string;
    edgeId: string;
  };
  'atu:checkpoint-spawned': {
    edgeId: string;
    durationMinutes: number;
  };
  'atu:checkpoint-cleared': {
    edgeId: string;
  };
  'atu:fine-issued': {
    vehicleId: string;
    edgeId: string;
    amount: number;
  };
  'economy:updated': {
    cash: number;
    delta: number;
    reason: 'FARE' | 'FUEL' | 'FINE' | 'PURCHASE' | 'UPGRADE' | 'OVERFLOW_PENALTY';
  };
}

export type EventKey = keyof SimulationEventMap;
export type EventSearchHandler<K extends EventKey> = (payload: SimulationEventMap[K]) => void;

export class EventBus {
  private readonly listeners = new Map<EventKey, Set<(payload: never) => void>>();

  /**
   * Subscribes a listener to a typed simulation event.
   * Returns an unsubscribe callback.
   */
  public on<K extends EventKey>(event: K, handler: EventSearchHandler<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribes a listener from a typed simulation event.
   */
  public off<K extends EventKey>(event: K, handler: EventSearchHandler<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as (payload: never) => void);
    }
  }

  /**
   * Emits a typed simulation event to all registered listeners.
   */
  public emit<K extends EventKey>(event: K, payload: SimulationEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const handler of set) {
      (handler as EventSearchHandler<K>)(payload);
    }
  }

  /**
   * Clears all listeners across all events.
   */
  public clear(): void {
    this.listeners.clear();
  }
}
