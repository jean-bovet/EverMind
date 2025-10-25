/**
 * Unit tests for EventBus
 *
 * Demonstrates centralized event management and type-safe event handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, type FileProgressEvent, type FileRemovedEvent } from '../../../electron/core/event-bus.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus({ enableLogging: true });
  });

  describe('Event Subscription', () => {
    it('should subscribe to events', () => {
      const listener = vi.fn();
      eventBus.on('file-progress', listener);

      expect(eventBus.getListenerCount('file-progress')).toBe(1);
    });

    it('should unsubscribe from events using returned function', () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.on('file-progress', listener);

      unsubscribe();

      expect(eventBus.getListenerCount('file-progress')).toBe(0);
    });

    it('should unsubscribe from events using off method', () => {
      const listener = vi.fn();
      eventBus.on('file-progress', listener);

      eventBus.off('file-progress', listener);

      expect(eventBus.getListenerCount('file-progress')).toBe(0);
    });

    it('should support multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.on('file-progress', listener1);
      eventBus.on('file-progress', listener2);

      expect(eventBus.getListenerCount('file-progress')).toBe(2);
    });
  });

  describe('Event Emission', () => {
    it('should emit events to subscribers', () => {
      const listener = vi.fn();
      eventBus.on('file-progress', listener);

      const event: FileProgressEvent = {
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      };

      eventBus.emit(event);

      expect(listener).toHaveBeenCalledWith(event);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit to multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.on('file-progress', listener1);
      eventBus.on('file-progress', listener2);

      const event: FileProgressEvent = {
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      };

      eventBus.emit(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('should not emit to wrong event type subscribers', () => {
      const fileProgressListener = vi.fn();
      const fileRemovedListener = vi.fn();

      eventBus.on('file-progress', fileProgressListener);
      eventBus.on('file-removed', fileRemovedListener);

      const event: FileProgressEvent = {
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      };

      eventBus.emit(event);

      expect(fileProgressListener).toHaveBeenCalled();
      expect(fileRemovedListener).not.toHaveBeenCalled();
    });
  });

  describe('Once Subscription', () => {
    it('should automatically unsubscribe after first event', () => {
      const listener = vi.fn();
      eventBus.once('file-progress', listener);

      const event: FileProgressEvent = {
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      };

      eventBus.emit(event);
      eventBus.emit(event);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Logging', () => {
    it('should log emitted events', () => {
      const event: FileProgressEvent = {
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      };

      eventBus.emit(event);

      const recentEvents = eventBus.getRecentEvents();
      expect(recentEvents).toHaveLength(1);
      expect(recentEvents[0]).toEqual(event);
    });

    it('should limit log size', () => {
      const smallBus = new EventBus({ maxLogSize: 2 });

      smallBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file1.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      smallBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file2.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      smallBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file3.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      const recentEvents = smallBus.getRecentEvents();
      expect(recentEvents).toHaveLength(2);
      expect(recentEvents[0].payload.filePath).toBe('/test/file2.pdf');
      expect(recentEvents[1].payload.filePath).toBe('/test/file3.pdf');
    });

    it('should filter events by type', () => {
      eventBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      eventBus.emit({
        type: 'file-removed',
        payload: { filePath: '/test/file.pdf' }
      });

      eventBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file2.pdf',
          status: 'complete',
          progress: 100
        }
      });

      const progressEvents = eventBus.getEventsByType<FileProgressEvent>('file-progress');
      expect(progressEvents).toHaveLength(2);

      const removedEvents = eventBus.getEventsByType<FileRemovedEvent>('file-removed');
      expect(removedEvents).toHaveLength(1);
    });

    it('should clear event log', () => {
      eventBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      eventBus.clearLog();

      expect(eventBus.getRecentEvents()).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should catch errors in event listeners', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      eventBus.on('file-progress', errorListener);
      eventBus.on('file-progress', goodListener);

      eventBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      // Error listener should have been called
      expect(errorListener).toHaveBeenCalled();

      // Good listener should still have been called
      expect(goodListener).toHaveBeenCalled();

      // Error should have been logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('should clear all listeners and log', () => {
      const listener = vi.fn();
      eventBus.on('file-progress', listener);

      eventBus.emit({
        type: 'file-progress',
        payload: {
          filePath: '/test/file.pdf',
          status: 'analyzing',
          progress: 50
        }
      });

      eventBus.clearAll();

      expect(eventBus.getListenerCount('file-progress')).toBe(0);
      expect(eventBus.getRecentEvents()).toHaveLength(0);
    });
  });
});
