/**
 * Event Bus for Centralized Event Management
 *
 * Provides a type-safe event bus for internal application events.
 * This is separate from IPC events and is used for in-process communication.
 */

import type {
  FileProgressData,
  AugmentProgressData,
  BatchProgressData
} from './progress-reporter.js';

// Define all possible events
export interface FileProgressEvent {
  type: 'file-progress';
  payload: FileProgressData;
}

export interface FileRemovedEvent {
  type: 'file-removed';
  payload: { filePath: string };
}

export interface AugmentProgressEvent {
  type: 'augment-progress';
  payload: AugmentProgressData;
}

export interface BatchProgressEvent {
  type: 'batch-progress';
  payload: BatchProgressData;
}

export interface StateUpdatedEvent {
  type: 'state-updated';
  payload: {
    filePath: string;
    status: string;
    progress: number;
  };
}

// Union type of all events
export type AppEvent =
  | FileProgressEvent
  | FileRemovedEvent
  | AugmentProgressEvent
  | BatchProgressEvent
  | StateUpdatedEvent;

// Event listener type
type EventListener<T extends AppEvent = AppEvent> = (event: T) => void;

/**
 * Centralized event bus for application-wide events
 */
export class EventBus {
  private listeners: Map<string, Set<EventListener>> = new Map();
  private eventLog: AppEvent[] = [];
  private maxLogSize: number;

  constructor(options: { enableLogging?: boolean; maxLogSize?: number } = {}) {
    this.maxLogSize = options.maxLogSize || 100;

    // Initialize listener sets for each event type
    this.listeners.set('file-progress', new Set());
    this.listeners.set('file-removed', new Set());
    this.listeners.set('augment-progress', new Set());
    this.listeners.set('batch-progress', new Set());
    this.listeners.set('state-updated', new Set());
  }

  /**
   * Subscribe to events of a specific type
   * @returns Unsubscribe function
   */
  on<T extends AppEvent>(
    eventType: T['type'],
    listener: EventListener<T>
  ): () => void {
    const listeners = this.listeners.get(eventType);
    if (!listeners) {
      throw new Error(`Unknown event type: ${eventType}`);
    }

    listeners.add(listener as EventListener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener as EventListener);
    };
  }

  /**
   * Subscribe to an event once (automatically unsubscribes after first call)
   */
  once<T extends AppEvent>(
    eventType: T['type'],
    listener: EventListener<T>
  ): () => void {
    const wrappedListener: EventListener<T> = (event) => {
      listener(event);
      this.off(eventType, wrappedListener);
    };

    return this.on(eventType, wrappedListener);
  }

  /**
   * Unsubscribe from an event
   */
  off<T extends AppEvent>(
    eventType: T['type'],
    listener: EventListener<T>
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener as EventListener);
    }
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: AppEvent): void {
    // Add to event log
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Notify all listeners
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }
  }

  /**
   * Get recent events from the log
   */
  getRecentEvents(limit?: number): AppEvent[] {
    if (limit) {
      return this.eventLog.slice(-limit);
    }
    return [...this.eventLog];
  }

  /**
   * Get events of a specific type from the log
   */
  getEventsByType<T extends AppEvent>(eventType: T['type']): T[] {
    return this.eventLog.filter(e => e.type === eventType) as T[];
  }

  /**
   * Clear the event log
   */
  clearLog(): void {
    this.eventLog = [];
  }

  /**
   * Get count of active listeners for an event type
   */
  getListenerCount(eventType: string): number {
    return this.listeners.get(eventType)?.size || 0;
  }

  /**
   * Clear all listeners (useful for cleanup)
   */
  clearAll(): void {
    this.listeners.forEach(listeners => listeners.clear());
    this.eventLog = [];
  }
}

/**
 * Create a singleton event bus instance (optional pattern)
 */
let globalEventBus: EventBus | null = null;

export function getGlobalEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus({ enableLogging: true });
  }
  return globalEventBus;
}

export function setGlobalEventBus(eventBus: EventBus): void {
  globalEventBus = eventBus;
}
