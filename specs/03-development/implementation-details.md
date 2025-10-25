# Implementation Details

> **Type:** Development Guide
> **Last Updated:** October 2025

This document provides technical implementation notes for key systems. For complete implementations, refer to the source code.

## File Extraction

### Supported Formats

**PDF** (`pdf-parse` v2.4.3)
- Extracts plain text from all pages
- Uses pdf.js under the hood
- Requires resource cleanup via `destroy()`
- **Source:** `electron/extractors/file-extractor.ts`

**Word Documents** (`mammoth` v1.11.0)
- Parses .docx (not legacy .doc)
- Extracts raw text, formatting lost
- **Source:** `electron/extractors/file-extractor.ts`

**Text Files**
- Direct UTF-8 file reading for .txt, .md, .markdown
- No parsing or transformation needed

**Images** (`tesseract.js` v6.0.1)
- OCR for PNG, JPG, GIF, BMP, TIFF
- English language only
- Typically 30-60 seconds per image
- **Source:** `electron/extractors/file-extractor.ts`

## AI Analysis

### Ollama Integration

**Library:** `ollama` v0.6.0

**Key Concepts:**
- Default model: Mistral (multilingual support)
- Content truncated to 4000 chars to prevent token limits
- Prompt includes existing tags when available
- Response parsed as JSON

**Source Files:**
- `electron/ai/ai-analyzer.ts` - Main analysis logic
- `electron/ai/ollama-manager.ts` - Service management
- `electron/utils/ai-response-parser.ts` - Response parsing

### Ollama Service Management

**Detection Strategy:**
1. Check API endpoint (`http://localhost:11434/api/tags`)
2. If API fails, check CLI (`which ollama`)
3. Search common installation paths

**Auto-start:** Spawns `ollama serve` as detached process if not running

**Model Downloads:** Automatic on first use (models 2-7GB)

## Core Abstractions

### Overview

The application uses dependency injection and interface-based design to decouple business logic from Electron IPC. This enables:
- **Testability:** Business logic testable without Electron
- **Flexibility:** Can swap IPC with WebSockets, HTTP, CLI, etc.
- **Type Safety:** Full TypeScript interfaces
- **Maintainability:** Clear separation of concerns

**Source:** `electron/core/` directory

### ProgressReporter Interface

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
1. **IPCProgressReporter** - Production (sends via Electron IPC)
2. **MockProgressReporter** - Testing (captures events for verification)
3. **NullProgressReporter** - No-op (CLI or batch mode)

**Usage Pattern:**
```typescript
// Before: Tight coupling
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null  // ❌ Electron dependency
): Promise<AnalysisResult>

// After: Decoupled
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  reporter: ProgressReporter  // ✅ Interface dependency
): Promise<AnalysisResult>
```

**Benefits:**
- Can test `analyzeFile()` without Electron
- Can use same logic in CLI, web server, etc.
- Mock reporter captures all events for verification

**Source:** `electron/core/progress-reporter.ts`

### EventBus

**Purpose:** Centralized, type-safe event management for in-process communication

**Features:**
- Type-safe events (TypeScript enforces correct payload types)
- Event logging for debugging
- Error handling in listeners
- Subscribe/unsubscribe with cleanup functions
- One-time subscriptions (`once`)

**Event Types:**
```typescript
type AppEvent =
  | FileProgressEvent
  | FileRemovedEvent
  | AugmentProgressEvent
  | BatchProgressEvent
  | StateUpdatedEvent;
```

**Usage:**
```typescript
// Subscribe
const unsubscribe = eventBus.on('file-progress', (event) => {
  console.log(`Progress: ${event.payload.progress}%`);
});

// Emit
eventBus.emit({
  type: 'file-progress',
  payload: { filePath, status, progress }
});

// Unsubscribe
unsubscribe();
```

**Debugging:**
```typescript
// Get recent events
const recent = eventBus.getRecentEvents(10);

// Get events by type
const progressEvents = eventBus.getEventsByType('file-progress');

// Check listener count
const count = eventBus.getListenerCount('file-progress');
```

**Source:** `electron/core/event-bus.ts`

### StateManager

**Purpose:** Atomic database updates + event emission to ensure UI and database always in sync

**Problem It Solves:**

Previously, database updates and event emissions were separate:
```typescript
// ❌ Old: Can get out of sync
updateFileStatus(filePath, 'analyzing');  // Database
mainWindow?.webContents.send('file-progress', {...});  // IPC
// If IPC fails, UI is out of sync with database!
```

**Solution:**

StateManager combines both atomically:
```typescript
// ✅ New: Always in sync
stateManager.updateStatus({
  filePath,
  status: 'analyzing',
  progress: 50,
  message: 'Analyzing content...'
});
// Database updated AND event emitted in single operation
```

**API:**
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

**Benefits:**
- Single source of truth for state
- No orphaned state
- Transactional consistency
- All state changes go through one path

**Source:** `electron/core/state-manager.ts`

### Dependency Injection

**Main Process Setup:**
```typescript
// Initialize abstractions
const progressReporter = new IPCProgressReporter(mainWindow);
const uploadWorker = new UploadWorker(progressReporter);

// Inject into IPC handlers
ipcMain.handle('analyze-file', async (_, filePath, options) => {
  return await analyzeFile(filePath, options, progressReporter);
});

ipcMain.handle('augment-note', async (_, noteGuid) => {
  return await augmentNote(noteGuid, progressReporter);
});
```

**Testing Setup:**
```typescript
// Use mock implementation
const reporter = new MockProgressReporter();
await analyzeFile(filePath, options, reporter);

// Verify events
expect(reporter.fileProgressReports).toHaveLength(3);
expect(reporter.getLastFileProgress()?.status).toBe('complete');
```

**Migration Notes:**
- All `BrowserWindow` parameters replaced with `ProgressReporter`
- 658 tests passing (including 23 new tests for abstractions)
- Zero breaking changes to UI or functionality

## Evernote Integration

### ENML (Evernote Markup Language)

XML-based format for note content. Key requirements:
- Strict XML escaping (& < > " ')
- DOCTYPE declaration required
- Resources referenced by MD5 hash

**Example structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <div>Description text...</div>
  <en-media type="application/pdf" hash="abc123..."/>
</en-note>
```

**Source:** `electron/evernote/enml-helpers.ts` (pure functions, 100% test coverage)

### Tag Management

**Validation Rules:**
- 1-100 characters
- No commas, control characters, or line separators
- Trimmed whitespace
- **Source:** `electron/evernote/tag-validator.ts`

**Tag Filtering:**
- AI tags matched against existing Evernote tags (case-insensitive)
- Only existing tags used (no new tag creation)
- Batch optimization: fetch tags once, reuse for all files

### Rate Limiting

**Evernote API Error Code 19:**
- Includes `rateLimitDuration` (seconds to wait)
- Queue system tracks retry times
- Automatic retry after duration expires

## Architecture Patterns

### Pure Helper Modules

**ENML Helpers** (`electron/evernote/enml-helpers.ts`)
- `createNoteContent()`, `getMimeType()`, `escapeXml()`, `createMD5Hash()`
- Pure functions, no side effects
- 100% test coverage

**Progress Helpers** (`electron/utils/progress-helpers.ts`)
- `getStageProgress()`, `getStageMessage()`, `createProgressData()`
- Centralizes progress calculation and formatting

**File State Reducer** (`electron/utils/file-state-reducer.ts`)
- `updateFileFromIPCMessage()`, `addFiles()`, `removeCompletedFiles()`
- Immutable state updates (Redux-style)

### React Custom Hooks

**File Processing Hook** (`electron/renderer/hooks/useFileProcessing.ts`)
- Manages file upload state and IPC subscriptions
- Auto-processing with ProcessingScheduler
- Provides `addFiles()`, `retryFile()`, `reloadFiles()`

**Notebooks Hook** (`electron/renderer/hooks/useNotebooks.ts`)
- Notebook selection and notes fetching
- React Query integration
- Auto-select default notebook

**Note Augmentation Hook** (`electron/renderer/hooks/useNoteAugmentation.ts`)
- Tracks augmentation progress for multiple notes
- Subscribes to `augment-progress` IPC events
- Handles completion/error callbacks

**Ollama Status Hook** (`electron/renderer/hooks/useOllamaStatus.ts`)
- Checks installation on mount
- Manages welcome wizard visibility

## Performance Optimizations

### Batch Tag Fetching
- **Before:** N API calls for N files
- **After:** 1 API call for entire batch
- **Improvement:** N× reduction in Evernote API calls

### Content Truncation
- Limit text to 4000 chars for AI analysis
- Prevents token limit errors
- Reduces processing time

### Ollama Process Reuse
- Start once, use multiple times
- Keeps model in memory
- Stop at end of session

## Error Handling

### Patterns Used

**Async/Await with Try-Catch:**
```typescript
try {
  const result = await operation();
} catch (error) {
  throw new Error(`Operation failed: ${error.message}`);
}
```

**Resource Cleanup:**
```typescript
try {
  const parser = new PDFParse({ data });
  return await parser.getText();
} finally {
  await parser.destroy();
}
```

**Process Signal Handling:**
- SIGINT, SIGTERM - Clean shutdown (stop Ollama if started by app)
- unhandledRejection - Log error and clean exit

**Source:** Various modules implement appropriate error handling patterns

## Testing

See [Testing Strategy](testing-strategy.md) for comprehensive test coverage details.

**Key modules with high coverage:**
- Core abstractions: 100% (23 tests)
  - ProgressReporter (9 tests)
  - EventBus (14 tests)
- ENML helpers: 100%
- Tag validator: 100%
- Progress helpers: 100%
- File state reducer: 100%
- Queue database: 90%+

**Architecture Testing Benefits:**

With the new abstractions, business logic can be tested without Electron:

```typescript
// Before: Hard to test
describe('analyzeFile', () => {
  it('should analyze file', async () => {
    const mockWindow = createComplexElectronMock(); // ❌ Complex
    await analyzeFile(filePath, options, mockWindow);
    // Can't easily verify IPC events were sent
  });
});

// After: Easy to test
describe('analyzeFile', () => {
  it('should analyze file', async () => {
    const reporter = new MockProgressReporter(); // ✅ Simple
    await analyzeFile(filePath, options, reporter);

    // Easy verification
    expect(reporter.fileProgressReports).toHaveLength(3);
    expect(reporter.fileProgressReports[0].status).toBe('extracting');
    expect(reporter.fileProgressReports[1].status).toBe('analyzing');
    expect(reporter.fileProgressReports[2].status).toBe('ready-to-upload');
  });
});
```

**Test Suite Results:**
- 26 test files
- 658 tests passing
- 1 test skipped
- 0 failures
