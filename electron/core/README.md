# Core Abstractions

This directory contains core abstractions that decouple business logic from Electron IPC, enabling better testability and modularity.

## Overview

### Problem

Previously, business logic was tightly coupled to Electron's `BrowserWindow` and IPC:

```typescript
// ❌ Old approach - tightly coupled
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null  // Electron dependency!
): Promise<AnalysisResult> {
  mainWindow?.webContents.send('file-progress', {...});  // Direct IPC call

  // Business logic...

  mainWindow?.webContents.send('file-progress', {...});  // More IPC
}
```

**Problems:**
- Can't test without Electron
- Business logic mixed with UI communication
- Hard to reuse in different contexts (CLI, web, etc.)
- Difficult to mock/stub

### Solution

We've introduced three core abstractions:

1. **ProgressReporter** - Abstract progress reporting
2. **EventBus** - Centralized event management
3. **StateManager** - Atomic state updates + events

```typescript
// ✅ New approach - decoupled
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  reporter: ProgressReporter  // Interface, not BrowserWindow!
): Promise<AnalysisResult> {
  reporter.reportFileProgress({
    filePath,
    status: 'extracting',
    progress: 25
  });

  // Business logic...

  reporter.reportFileProgress({
    filePath,
    status: 'complete',
    progress: 100
  });
}
```

**Benefits:**
- Testable without Electron
- Clear separation of concerns
- Easy to mock/stub
- Can use in CLI, web, or other contexts

## ProgressReporter

### Purpose

Abstract interface for reporting progress. Business logic depends on the interface, not Electron IPC.

### Implementations

1. **IPCProgressReporter** - Production (sends via Electron IPC)
2. **MockProgressReporter** - Testing (captures events for verification)
3. **NullProgressReporter** - No-op (useful for CLI or when progress isn't needed)

### Usage

**In Production:**
```typescript
import { IPCProgressReporter } from './core/progress-reporter.js';

const reporter = new IPCProgressReporter(mainWindow);

// Pass to business logic
await analyzeFile(filePath, options, reporter);
```

**In Tests:**
```typescript
import { MockProgressReporter } from './core/progress-reporter.js';

const reporter = new MockProgressReporter();

await analyzeFile(filePath, options, reporter);

// Verify progress was reported
expect(reporter.fileProgressReports).toHaveLength(3);
expect(reporter.getLastFileProgress()?.status).toBe('complete');
```

### API

```typescript
interface ProgressReporter {
  reportFileProgress(data: FileProgressData): void;
  reportFileRemoved(filePath: string): void;
  reportAugmentProgress(data: AugmentProgressData): void;
  reportBatchProgress(data: BatchProgressData): void;
}
```

## EventBus

### Purpose

Centralized, type-safe event management for in-process communication.

### Features

- Type-safe events (TypeScript ensures correct payload types)
- Event logging for debugging
- Error handling in listeners
- Subscribe/unsubscribe with cleanup functions
- One-time subscriptions (`once`)

### Usage

```typescript
import { EventBus } from './core/event-bus.js';

const eventBus = new EventBus({ enableLogging: true });

// Subscribe to events
const unsubscribe = eventBus.on('file-progress', (event) => {
  console.log(`Progress: ${event.payload.progress}%`);
});

// Emit events
eventBus.emit({
  type: 'file-progress',
  payload: {
    filePath: '/test/file.pdf',
    status: 'analyzing',
    progress: 50
  }
});

// Unsubscribe
unsubscribe();
```

### Event Types

```typescript
type AppEvent =
  | FileProgressEvent
  | FileRemovedEvent
  | AugmentProgressEvent
  | BatchProgressEvent
  | StateUpdatedEvent;
```

### Debugging

```typescript
// Get recent events
const recent = eventBus.getRecentEvents(10);

// Get events by type
const progressEvents = eventBus.getEventsByType('file-progress');

// Check listener count
const count = eventBus.getListenerCount('file-progress');
```

## StateManager

### Purpose

Ensures database state and event emissions are always synchronized. Provides a single source of truth for state updates.

### Problem It Solves

Previously, database updates and event emissions were separate:

```typescript
// ❌ Old approach - can get out of sync
updateFileStatus(filePath, 'analyzing');  // Database update
mainWindow?.webContents.send('file-progress', {...});  // IPC event
// If IPC fails, UI is out of sync with database!
```

### Solution

StateManager combines both atomically:

```typescript
// ✅ New approach - always in sync
stateManager.updateStatus({
  filePath,
  status: 'analyzing',
  progress: 50,
  message: 'Analyzing content...'
});
// Database updated AND event emitted in single operation
```

### Usage

```typescript
import { FileStateManager } from './core/state-manager.js';
import { IPCProgressReporter } from './core/progress-reporter.js';
import { EventBus } from './core/event-bus.js';

const reporter = new IPCProgressReporter(mainWindow);
const eventBus = new EventBus();
const stateManager = new FileStateManager(reporter, eventBus);

// Add file to queue
stateManager.addFile('/path/to/file.pdf');

// Update status and progress together
stateManager.updateStatus({
  filePath: '/path/to/file.pdf',
  status: 'analyzing',
  progress: 50,
  message: 'Analyzing with AI...'
});

// Update result after analysis
stateManager.updateResult({
  filePath: '/path/to/file.pdf',
  title: 'Document Title',
  description: 'AI-generated description',
  tags: ['tag1', 'tag2']
});

// Delete after upload
stateManager.deleteFile('/path/to/file.pdf');
```

### API

```typescript
class FileStateManager {
  addFile(filePath: string): void;
  updateStatus(update: FileStatusUpdate): void;
  updateProgress(filePath: string, progress: number, message?: string): void;
  updateResult(update: FileResultUpdate): void;
  setError(filePath: string, errorMessage: string): void;
  deleteFile(filePath: string): void;
}
```

## Migration Guide

### Step 1: Update Function Signatures

**Before:**
```typescript
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null
): Promise<AnalysisResult>
```

**After:**
```typescript
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  reporter: ProgressReporter
): Promise<AnalysisResult>
```

### Step 2: Replace IPC Calls

**Before:**
```typescript
mainWindow?.webContents.send('file-progress', {
  filePath,
  status: 'analyzing',
  progress: 50
});
```

**After:**
```typescript
reporter.reportFileProgress({
  filePath,
  status: 'analyzing',
  progress: 50
});
```

### Step 3: Use StateManager for Database Updates

**Before:**
```typescript
updateFileStatus(filePath, 'analyzing');
updateFileProgress(filePath, 50);
mainWindow?.webContents.send('file-progress', {...});
```

**After:**
```typescript
stateManager.updateStatusAndProgress(
  filePath,
  'analyzing',
  50,
  'Analyzing content...'
);
```

### Step 4: Update Tests

**Before:**
```typescript
// Hard to test without Electron
const mockWindow = createMockBrowserWindow();
await analyzeFile(filePath, options, mockWindow);
// Can't easily verify events were sent
```

**After:**
```typescript
// Easy to test
const reporter = new MockProgressReporter();
await analyzeFile(filePath, options, reporter);

// Verify progress was reported
expect(reporter.fileProgressReports).toHaveLength(3);
expect(reporter.getLastFileProgress()?.status).toBe('complete');
```

## Testing Examples

See `tests/unit/core/` for complete examples:

- `progress-reporter.test.ts` - MockProgressReporter usage
- `event-bus.test.ts` - EventBus usage patterns

### Example Test

```typescript
import { MockProgressReporter } from '../electron/core/progress-reporter.js';

describe('File Processing', () => {
  it('should report progress correctly', async () => {
    const reporter = new MockProgressReporter();

    await processFile('/test/file.pdf', reporter);

    expect(reporter.fileProgressReports).toHaveLength(3);
    expect(reporter.fileProgressReports[0].status).toBe('extracting');
    expect(reporter.fileProgressReports[1].status).toBe('analyzing');
    expect(reporter.fileProgressReports[2].status).toBe('complete');
  });
});
```

## Architecture Benefits

### Before

- **Tight coupling**: Business logic depends on Electron
- **Hard to test**: Need full Electron setup
- **State desync**: Database and events can get out of sync
- **Limited reusability**: Can't use in CLI or web contexts

### After

- **Loose coupling**: Business logic depends on interfaces
- **Easy to test**: Mock implementations for tests
- **Always in sync**: StateManager ensures consistency
- **Highly reusable**: Can use anywhere (CLI, web, desktop)

## Next Steps

1. Migrate `file-processor.ts` to use ProgressReporter
2. Migrate `upload-worker.ts` to use StateManager
3. Migrate `note-augmenter.ts` to use ProgressReporter
4. Update all tests to use mock implementations
5. Add integration tests with real Electron IPC

## Files

- `progress-reporter.ts` - Progress reporting abstraction
- `event-bus.ts` - Centralized event management
- `state-manager.ts` - Atomic state updates
- `README.md` - This file
