/**
 * File state machine to ensure only valid state transitions occur
 */

export type FileStatus =
  | 'pending'
  | 'extracting'
  | 'analyzing'
  | 'ready-to-upload'
  | 'uploading'
  | 'rate-limited'
  | 'retrying'
  | 'complete'
  | 'error';

interface StateTransition {
  from: FileStatus;
  to: FileStatus;
  timestamp: number;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  'pending': ['extracting', 'error'],
  'extracting': ['analyzing', 'error'],
  'analyzing': ['ready-to-upload', 'error'],
  'ready-to-upload': ['uploading', 'error'],
  'uploading': ['complete', 'rate-limited', 'retrying', 'error'],
  'rate-limited': ['uploading', 'error'],
  'retrying': ['uploading', 'error'],
  'complete': [], // Terminal state
  'error': []     // Terminal state
};

export class FileStateMachine {
  private currentState: FileStatus;
  private history: StateTransition[];

  constructor(initialState: FileStatus = 'pending') {
    this.currentState = initialState;
    this.history = [{
      from: initialState,
      to: initialState,
      timestamp: Date.now()
    }];
  }

  /**
   * Get current state
   */
  getState(): FileStatus {
    return this.currentState;
  }

  /**
   * Set new state (with validation)
   */
  setState(newState: FileStatus): void {
    if (this.currentState === newState) {
      return; // No change
    }

    if (!this.isValidTransition(this.currentState, newState)) {
      throw new Error(
        `Invalid state transition: ${this.currentState} -> ${newState}`
      );
    }

    this.history.push({
      from: this.currentState,
      to: newState,
      timestamp: Date.now()
    });

    this.currentState = newState;
  }

  /**
   * Check if a transition is valid
   */
  isValidTransition(from: FileStatus, to: FileStatus): boolean {
    const validTargets = VALID_TRANSITIONS[from];
    return validTargets.includes(to);
  }

  /**
   * Get transition history (for debugging)
   */
  getHistory(): StateTransition[] {
    return [...this.history];
  }

  /**
   * Check if state is terminal (no more transitions allowed)
   */
  isTerminal(): boolean {
    return VALID_TRANSITIONS[this.currentState].length === 0;
  }

  /**
   * Reset to initial state
   */
  reset(initialState: FileStatus = 'pending'): void {
    this.currentState = initialState;
    this.history = [{
      from: initialState,
      to: initialState,
      timestamp: Date.now()
    }];
  }
}
