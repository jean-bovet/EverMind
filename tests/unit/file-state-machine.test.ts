import { describe, it, expect, beforeEach } from 'vitest';
import { FileStateMachine, type FileStatus } from '../../electron/processing/file-state-machine.js';

describe('FileStateMachine', () => {
  let fsm: FileStateMachine;

  beforeEach(() => {
    fsm = new FileStateMachine();
  });

  describe('State Initialization', () => {
    it('should start with pending state by default', () => {
      expect(fsm.getState()).toBe('pending');
    });

    it('should allow custom initial state', () => {
      const customFsm = new FileStateMachine('extracting');
      expect(customFsm.getState()).toBe('extracting');
    });
  });

  describe('Valid State Transitions', () => {
    it('should allow pending → extracting', () => {
      expect(() => fsm.setState('extracting')).not.toThrow();
      expect(fsm.getState()).toBe('extracting');
    });

    it('should allow extracting → analyzing', () => {
      fsm.setState('extracting');
      expect(() => fsm.setState('analyzing')).not.toThrow();
      expect(fsm.getState()).toBe('analyzing');
    });

    it('should allow analyzing → ready-to-upload', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      expect(() => fsm.setState('ready-to-upload')).not.toThrow();
      expect(fsm.getState()).toBe('ready-to-upload');
    });

    it('should allow ready-to-upload → uploading', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      expect(() => fsm.setState('uploading')).not.toThrow();
      expect(fsm.getState()).toBe('uploading');
    });

    it('should allow uploading → complete', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      expect(() => fsm.setState('complete')).not.toThrow();
      expect(fsm.getState()).toBe('complete');
    });

    it('should allow uploading → rate-limited', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      expect(() => fsm.setState('rate-limited')).not.toThrow();
      expect(fsm.getState()).toBe('rate-limited');
    });

    it('should allow rate-limited → uploading', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      fsm.setState('rate-limited');
      expect(() => fsm.setState('uploading')).not.toThrow();
      expect(fsm.getState()).toBe('uploading');
    });

    it('should allow uploading → retrying', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      expect(() => fsm.setState('retrying')).not.toThrow();
      expect(fsm.getState()).toBe('retrying');
    });

    it('should allow retrying → uploading', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      fsm.setState('retrying');
      expect(() => fsm.setState('uploading')).not.toThrow();
      expect(fsm.getState()).toBe('uploading');
    });

    it('should allow any state → error', () => {
      const states: FileStatus[] = [
        'pending',
        'extracting',
        'analyzing',
        'ready-to-upload',
        'uploading',
        'rate-limited',
        'retrying'
      ];

      for (const state of states) {
        const testFsm = new FileStateMachine(state);
        expect(() => testFsm.setState('error')).not.toThrow();
        expect(testFsm.getState()).toBe('error');
      }
    });
  });

  describe('Invalid State Transitions', () => {
    it('should prevent pending → uploading', () => {
      expect(() => fsm.setState('uploading')).toThrow('Invalid state transition');
    });

    it('should prevent pending → complete', () => {
      expect(() => fsm.setState('complete')).toThrow('Invalid state transition');
    });

    it('should prevent extracting → uploading', () => {
      fsm.setState('extracting');
      expect(() => fsm.setState('uploading')).toThrow('Invalid state transition');
    });

    it('should prevent extracting → complete', () => {
      fsm.setState('extracting');
      expect(() => fsm.setState('complete')).toThrow('Invalid state transition');
    });

    it('should prevent analyzing → uploading', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      expect(() => fsm.setState('uploading')).toThrow('Invalid state transition');
    });

    it('should prevent ready-to-upload → complete', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      expect(() => fsm.setState('complete')).toThrow('Invalid state transition');
    });

    it('should prevent complete → any state', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      fsm.setState('complete');

      expect(() => fsm.setState('uploading')).toThrow('Invalid state transition');
      expect(() => fsm.setState('pending')).toThrow('Invalid state transition');
    });

    it('should prevent error → any state', () => {
      fsm.setState('error');

      expect(() => fsm.setState('pending')).toThrow('Invalid state transition');
      expect(() => fsm.setState('uploading')).toThrow('Invalid state transition');
      expect(() => fsm.setState('complete')).toThrow('Invalid state transition');
    });
  });

  describe('Transition History', () => {
    it('should track transition history', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');

      const history = fsm.getHistory();

      expect(history.length).toBe(4); // Initial + 3 transitions
      expect(history[0].from).toBe('pending');
      expect(history[0].to).toBe('pending');
      expect(history[1].from).toBe('pending');
      expect(history[1].to).toBe('extracting');
      expect(history[2].from).toBe('extracting');
      expect(history[2].to).toBe('analyzing');
      expect(history[3].from).toBe('analyzing');
      expect(history[3].to).toBe('ready-to-upload');
    });

    it('should include timestamps in history', () => {
      const before = Date.now();
      fsm.setState('extracting');
      const after = Date.now();

      const history = fsm.getHistory();
      const lastTransition = history[history.length - 1];

      expect(lastTransition.timestamp).toBeGreaterThanOrEqual(before);
      expect(lastTransition.timestamp).toBeLessThanOrEqual(after);
    });

    it('should not add to history if state unchanged', () => {
      fsm.setState('extracting');
      const historyLength = fsm.getHistory().length;

      fsm.setState('extracting'); // Same state

      expect(fsm.getHistory().length).toBe(historyLength);
    });
  });

  describe('Terminal States', () => {
    it('should recognize complete as terminal', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.setState('ready-to-upload');
      fsm.setState('uploading');
      fsm.setState('complete');

      expect(fsm.isTerminal()).toBe(true);
    });

    it('should recognize error as terminal', () => {
      fsm.setState('error');
      expect(fsm.isTerminal()).toBe(true);
    });

    it('should recognize non-terminal states', () => {
      expect(fsm.isTerminal()).toBe(false);

      fsm.setState('extracting');
      expect(fsm.isTerminal()).toBe(false);

      fsm.setState('analyzing');
      expect(fsm.isTerminal()).toBe(false);

      fsm.setState('ready-to-upload');
      expect(fsm.isTerminal()).toBe(false);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset to pending by default', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.reset();

      expect(fsm.getState()).toBe('pending');
      expect(fsm.getHistory().length).toBe(1);
    });

    it('should reset to custom state', () => {
      fsm.setState('extracting');
      fsm.setState('analyzing');
      fsm.reset('uploading');

      expect(fsm.getState()).toBe('uploading');
      expect(fsm.getHistory().length).toBe(1);
    });
  });

  describe('Validation Method', () => {
    it('should validate transitions without changing state', () => {
      expect(fsm.isValidTransition('pending', 'extracting')).toBe(true);
      expect(fsm.isValidTransition('pending', 'uploading')).toBe(false);
      expect(fsm.getState()).toBe('pending'); // State unchanged
    });

    it('should validate all error transitions', () => {
      const states: FileStatus[] = [
        'pending',
        'extracting',
        'analyzing',
        'ready-to-upload',
        'uploading'
      ];

      for (const state of states) {
        expect(fsm.isValidTransition(state, 'error')).toBe(true);
      }
    });
  });

  describe('Complete Pipeline Flow', () => {
    it('should allow complete successful pipeline', () => {
      expect(() => {
        fsm.setState('extracting');
        fsm.setState('analyzing');
        fsm.setState('ready-to-upload');
        fsm.setState('uploading');
        fsm.setState('complete');
      }).not.toThrow();

      expect(fsm.getState()).toBe('complete');
    });

    it('should allow pipeline with rate limit', () => {
      expect(() => {
        fsm.setState('extracting');
        fsm.setState('analyzing');
        fsm.setState('ready-to-upload');
        fsm.setState('uploading');
        fsm.setState('rate-limited');
        fsm.setState('uploading');
        fsm.setState('complete');
      }).not.toThrow();

      expect(fsm.getState()).toBe('complete');
    });

    it('should allow pipeline with retry', () => {
      expect(() => {
        fsm.setState('extracting');
        fsm.setState('analyzing');
        fsm.setState('ready-to-upload');
        fsm.setState('uploading');
        fsm.setState('retrying');
        fsm.setState('uploading');
        fsm.setState('complete');
      }).not.toThrow();

      expect(fsm.getState()).toBe('complete');
    });

    it('should allow early error exit', () => {
      expect(() => {
        fsm.setState('extracting');
        fsm.setState('error');
      }).not.toThrow();

      expect(fsm.getState()).toBe('error');
      expect(fsm.isTerminal()).toBe(true);
    });
  });
});
