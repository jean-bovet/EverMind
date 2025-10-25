# Architecture Refactoring: Dependency Injection & Testability

> **Type:** Development Guide
> **Date:** October 2025
> **Status:** Completed

## Overview

This document describes the architectural refactoring that decoupled business logic from Electron IPC, enabling better testability, maintainability, and flexibility.

## Motivation

### Problems with Original Architecture

**1. Tight Coupling to Electron**
```typescript
// ❌ Before: Business logic directly depends on BrowserWindow
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null
): Promise<AnalysisResult> {
  // Business logic mixed with IPC
  mainWindow?.webContents.send('file-progress', {
    filePath,
    status: 'extracting',
    progress: 25
  });

  // More business logic...

  mainWindow?.webContents.send('file-progress', {
    filePath,
    status: 'complete',
    progress: 100
  });
}
```

**Issues:**
- Cannot test `analyzeFile()` without full Electron setup
- Business logic mixed with UI communication concerns
- Hard to reuse in CLI, web server, or other contexts
- Difficult to mock/stub for unit tests

**2. State Desynchronization**
```typescript
// ❌ Database and events could get out of sync
updateFileStatus(filePath, 'complete');  // Database update
deleteFile(filePath);                     // Database delete
mainWindow?.webContents.send('file-progress', {...});  // IPC event

// If IPC fails, UI shows wrong state!
```

**3. Testing Complexity**
```typescript
// ❌ Complex mocking required
const mockWindow = {
  webContents: {
    send: vi.fn()
  }
};

await analyzeFile(filePath, options, mockWindow);

// Can't easily verify what events were sent
expect(mockWindow.webContents.send).toHaveBeenCalled();
// But hard to check exact payloads and order
```

## Solution: Core Abstractions

### 1. ProgressReporter Interface

**Purpose:** Abstract progress reporting from Electron IPC

**Interface:**
```typescript
interface ProgressReporter {
  reportFileProgress(data: FileProgressData): void;
  reportFileRemoved(filePath: string): void;
  reportAugmentProgress(data: AugmentProgressData): void;
  reportBatchProgress(data: BatchProgressData): void;
}
```

**Implementations:**

**IPCProgressReporter (Production)**
```typescript
export class IPCProgressReporter implements ProgressReporter {
  constructor(private mainWindow: BrowserWindow | null) {}

  reportFileProgress(data: FileProgressData): void {
    this.mainWindow?.webContents.send('file-progress', data);
  }

  // ... other methods
}
```

**MockProgressReporter (Testing)**
```typescript
export class MockProgressReporter implements ProgressReporter {
  public fileProgressReports: FileProgressData[] = [];
  public fileRemovedReports: string[] = [];

  reportFileProgress(data: FileProgressData): void {
    this.fileProgressReports.push(data);
  }

  // Easy verification in tests
  getLastFileProgress(): FileProgressData | undefined {
    return this.fileProgressReports[this.fileProgressReports.length - 1];
  }

  getFileProgressFor(filePath: string): FileProgressData[] {
    return this.fileProgressReports.filter(r => r.filePath === filePath);
  }
}
```

**NullProgressReporter (CLI/Batch)**
```typescript
export class NullProgressReporter implements ProgressReporter {
  reportFileProgress(_data: FileProgressData): void {
    // Do nothing - useful for CLI or headless mode
  }
}
```

### 2. EventBus

**Purpose:** Centralized, type-safe event management

**Features:**
- Type-safe events (TypeScript enforces payload types)
- Event logging for debugging
- Subscribe/unsubscribe with cleanup
- Error handling in listeners

**Usage:**
```typescript
const eventBus = new EventBus({ enableLogging: true });

// Subscribe
const unsubscribe = eventBus.on('file-progress', (event) => {
  console.log(`File ${event.payload.filePath}: ${event.payload.status}`);
});

// Emit
eventBus.emit({
  type: 'file-progress',
  payload: { filePath, status, progress }
});

// Debugging
const recent = eventBus.getRecentEvents(10);
const count = eventBus.getListenerCount('file-progress');
```

### 3. FileStateManager

**Purpose:** Atomic database updates + event emission

**Problem Solved:**
```typescript
// ❌ Before: Can get out of sync
updateFileStatus(filePath, 'analyzing');
mainWindow?.webContents.send('file-progress', {...});
// If second call fails, UI shows wrong state!

// ✅ After: Always in sync
stateManager.updateStatus({
  filePath,
  status: 'analyzing',
  progress: 50,
  message: 'Analyzing...'
});
// Database AND event updated atomically
```

**API:**
```typescript
class FileStateManager {
  constructor(
    private progressReporter: ProgressReporter,
    private eventBus?: EventBus
  ) {}

  addFile(filePath: string): void;
  updateStatus(update: FileStatusUpdate): void;
  updateProgress(filePath: string, progress: number, message?: string): void;
  updateResult(update: FileResultUpdate): void;
  setError(filePath: string, errorMessage: string): void;
  deleteFile(filePath: string): void;
}
```

## Refactoring Process

### Step 1: Create Core Abstractions

Created three new files in `electron/core/`:
- `progress-reporter.ts` - Interface + implementations
- `event-bus.ts` - Type-safe event system
- `state-manager.ts` - Atomic state updates

### Step 2: Update Function Signatures

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
  reporter: ProgressReporter  // ✅ Interface, not BrowserWindow
): Promise<AnalysisResult>
```

### Step 3: Replace IPC Calls

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

### Step 4: Update Main Process

**Initialize abstractions:**
```typescript
// main.ts
const progressReporter = new IPCProgressReporter(mainWindow);
const uploadWorker = new UploadWorker(progressReporter);
```

**Inject into IPC handlers:**
```typescript
ipcMain.handle('analyze-file', async (_, filePath, options) => {
  return await analyzeFile(filePath, options, progressReporter);
});

ipcMain.handle('augment-note', async (_, noteGuid) => {
  return await augmentNote(noteGuid, progressReporter);
});
```

### Step 5: Update Tests

**Before:**
```typescript
const mockWindow = createMockBrowserWindow();
await analyzeFile(filePath, options, mockWindow);
// Hard to verify events
```

**After:**
```typescript
const reporter = new MockProgressReporter();
await analyzeFile(filePath, options, reporter);

// Easy verification
expect(reporter.fileProgressReports).toHaveLength(3);
expect(reporter.fileProgressReports[0].status).toBe('extracting');
expect(reporter.fileProgressReports[1].status).toBe('analyzing');
expect(reporter.fileProgressReports[2].status).toBe('ready-to-upload');
```

## Files Modified

### New Files Created
- ✅ `electron/core/progress-reporter.ts` (223 lines)
- ✅ `electron/core/event-bus.ts` (181 lines)
- ✅ `electron/core/state-manager.ts` (219 lines)
- ✅ `electron/core/README.md` (documentation)
- ✅ `tests/unit/core/progress-reporter.test.ts` (9 tests)
- ✅ `tests/unit/core/event-bus.test.ts` (14 tests)

### Files Refactored
- ✅ `electron/processing/file-processor.ts`
  - Updated 4 functions: `analyzeFile()`, `uploadFile()`, `processFile()`, `processBatch()`
  - Removed `BrowserWindow` parameter, added `ProgressReporter`
  - Added `reportFileRemoved()` calls after `deleteFile()`

- ✅ `electron/processing/upload-worker.ts`
  - Constructor now takes `ProgressReporter` instead of `BrowserWindow`
  - Updated `setMainWindow()` → `setProgressReporter()`
  - All IPC calls replaced with reporter interface calls

- ✅ `electron/evernote/note-augmenter.ts`
  - `augmentNote()` now takes `ProgressReporter` instead of `BrowserWindow`
  - All progress updates go through reporter interface

- ✅ `electron/main.ts`
  - Created `IPCProgressReporter` instance
  - Passed reporter to all IPC handlers
  - Updated `UploadWorker` initialization

### Tests Updated
- ✅ `tests/unit/note-augmenter.test.ts`
  - Replaced `mockWindow` with `MockProgressReporter`
  - Updated 10 test cases

- ✅ `tests/unit/upload-worker.test.ts`
  - Replaced `mockWindow` with `MockProgressReporter`
  - Updated 5+ test assertions
  - Tests now verify captured events instead of mocking `webContents.send`

## Results

### Test Coverage

**Before Refactoring:**
- 635 tests passing
- Hard to test business logic without Electron
- Complex mocking required

**After Refactoring:**
- ✅ 658 tests passing (+23 new tests)
- ✅ 0 tests failing
- ✅ 1 test skipped
- Business logic fully testable without Electron
- Simple, clean test setup

**New Tests:**
- ProgressReporter: 9 tests (100% coverage)
- EventBus: 14 tests (100% coverage)

### Code Quality Improvements

**Separation of Concerns:**
- ✅ Business logic separated from UI communication
- ✅ Clear interface boundaries
- ✅ Single Responsibility Principle

**Testability:**
- ✅ Can test all business logic without Electron
- ✅ Simple mock implementations
- ✅ Easy to verify behavior

**Flexibility:**
- ✅ Can swap IPC with WebSockets, HTTP, CLI, etc.
- ✅ Can use same logic in different contexts
- ✅ No Electron dependency in core logic

**Type Safety:**
- ✅ Full TypeScript interfaces
- ✅ Compile-time type checking
- ✅ Better IDE autocomplete

### Breaking Changes

**None!** The refactoring is fully backward compatible:
- UI functionality unchanged
- All IPC events still work the same
- No changes to data structures
- No changes to database schema

## Benefits

### 1. Testability

**Before:**
```typescript
// ❌ Required complex Electron mocking
const mockWindow = {
  webContents: { send: vi.fn() }
};
```

**After:**
```typescript
// ✅ Simple mock implementation
const reporter = new MockProgressReporter();
```

### 2. Reusability

The same business logic can now be used in:
- Electron desktop app (IPCProgressReporter)
- CLI tools (NullProgressReporter)
- Web server (custom HTTP reporter)
- Batch processing (NullProgressReporter)
- Testing (MockProgressReporter)

### 3. Maintainability

- Clear interfaces make code easier to understand
- Single Responsibility Principle
- Easier to onboard new developers
- Better IDE support with TypeScript

### 4. Debuggability

**EventBus features:**
```typescript
// See recent events
const recent = eventBus.getRecentEvents(10);

// See events by type
const progressEvents = eventBus.getEventsByType('file-progress');

// Check listener count
const count = eventBus.getListenerCount('file-progress');
```

### 5. State Consistency

StateManager ensures database and UI are always in sync:
```typescript
// ✅ Atomic operation
stateManager.updateStatus({
  filePath,
  status: 'complete',
  progress: 100
});
// Database updated AND event emitted together
```

## Migration Guide

For developers working on this codebase:

### Adding New Business Logic

**Do:**
```typescript
export async function newFeature(
  param: string,
  reporter: ProgressReporter  // ✅ Use ProgressReporter
): Promise<Result> {
  reporter.reportFileProgress({
    filePath: param,
    status: 'processing',
    progress: 50
  });
}
```

**Don't:**
```typescript
export async function newFeature(
  param: string,
  mainWindow: BrowserWindow | null  // ❌ Don't use BrowserWindow
): Promise<Result> {
  mainWindow?.webContents.send('file-progress', {...});  // ❌ No direct IPC
}
```

### Writing Tests

**Do:**
```typescript
describe('newFeature', () => {
  it('should work', async () => {
    const reporter = new MockProgressReporter();  // ✅ Use mock
    await newFeature(param, reporter);
    expect(reporter.fileProgressReports).toHaveLength(1);  // ✅ Verify
  });
});
```

**Don't:**
```typescript
describe('newFeature', () => {
  it('should work', async () => {
    const mockWindow = { webContents: { send: vi.fn() } };  // ❌ Complex
    await newFeature(param, mockWindow);
  });
});
```

### Adding New IPC Handlers

```typescript
// main.ts
ipcMain.handle('new-feature', async (_, param) => {
  return await newFeature(param, progressReporter);  // ✅ Inject reporter
});
```

## Future Improvements

### Potential Enhancements

1. **Use StateManager in file-processor.ts**
   - Currently `analyzeFile()` still calls database functions directly
   - Could use `StateManager` for atomic updates

2. **Extend EventBus usage**
   - Use EventBus for more internal events
   - Better debugging and monitoring

3. **Add HTTP Reporter**
   - For remote monitoring/dashboards
   - Send progress to web service

4. **CLI Support**
   - Use NullProgressReporter for CLI tools
   - Reuse all business logic

## Conclusion

The refactoring successfully:
- ✅ Decoupled business logic from Electron IPC
- ✅ Made all core functions testable without Electron (658 tests passing)
- ✅ Improved code quality and maintainability
- ✅ Enabled future flexibility (CLI, web, etc.)
- ✅ Zero breaking changes to functionality

All tests pass, no regressions introduced, and the codebase is now significantly more maintainable and testable.

## References

- [Core Abstractions Documentation](../../electron/core/README.md)
- [Implementation Details](./implementation-details.md#core-abstractions)
- [Electron Architecture](../01-architecture/electron-architecture.md#core-abstractions)
- [IPC API Reference](../05-reference/electron-ipc-api.md)
