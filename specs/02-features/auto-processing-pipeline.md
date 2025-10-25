# Auto-Processing Pipeline

> **Type:** Feature
> **Last Updated:** October 2025
> **Status:** Implemented

**Related:** [SQLite Database](./sqlite-database.md), [Testing Strategy](../03-development/testing-strategy.md)

## What It Is

The auto-processing pipeline automatically processes files when you drop them into the app, using a two-stage architecture that enables concurrent processing and maximizes throughput.

## Architecture

### Two-Stage Processing

```
Drop files → Auto-start Processing
                  ↓
          [Stage 1: Extract + Analyze]
          - Concurrent (2-3 files at once)
          - Extract text from file
          - AI analysis with Ollama
                  ↓
          [Stage 2: Upload]
          - Sequential (one at a time)
          - Independent worker
          - Upload to Evernote
                  ↓
              Complete
```

**Key Benefits:**
- Files process automatically on drop (no manual trigger)
- Stage 1 runs concurrently (multiple files analyzed simultaneously)
- Stage 2 runs independently (handles retries/rate limits)
- Pipeline continues even when uploads rate-limited
- All state tracked in SQLite database

## File States

```typescript
type FileStatus =
  | 'pending'          // Waiting to start Stage 1
  | 'extracting'       // Stage 1: Extracting text
  | 'analyzing'        // Stage 1: AI analysis in progress
  | 'ready-to-upload'  // Stage 1 complete, waiting for upload slot
  | 'uploading'        // Stage 2: Currently uploading
  | 'rate-limited'     // Stage 2: Waiting for rate limit to clear
  | 'retrying'         // Stage 2: Retrying after failure
  | 'complete'         // Successfully uploaded
  | 'error';           // Failed at any stage
```

**State Transitions:**
- `pending` → `extracting` → `analyzing` → `ready-to-upload` → `uploading` → `complete`
- Rate limit: `uploading` → `rate-limited` → (wait) → `uploading` → `complete`
- Error: Any state → `error` (can retry from error)

## Components

### ProcessingScheduler

**Purpose:** Manages Stage 1 processing (extract + analyze)

**File:** `electron/processing/processing-scheduler.ts`

**Responsibilities:**
- Monitors database for files in 'pending' status
- Spawns concurrent processing tasks (max 2-3)
- Limits concurrency to prevent overwhelming system
- Emits progress events via IPC

**Lifecycle:**
```typescript
const scheduler = ProcessingScheduler.getInstance();
scheduler.start();  // Auto-processes pending files
scheduler.stop();   // Stops processing
```

**Started automatically** when main window opens.

### UploadWorker

**Purpose:** Manages Stage 2 uploads (Evernote API)

**File:** `electron/processing/upload-worker.ts` (conceptual - functionality in queue-db.ts)

**Responsibilities:**
- Monitors for files in 'ready-to-upload' status
- Uploads one file at a time (sequential)
- Handles rate limits (waits specified duration)
- Retries on transient errors
- Updates database with results

**Rate Limit Handling:**
- Evernote returns error code 19 with `rateLimitDuration`
- Worker stores `retry_after` timestamp in database
- Waits until timestamp before retrying
- User sees countdown in UI

## UI Integration

### File List Display

**Shows:**
- File name and type icon
- Current status (extracting, analyzing, uploading, etc.)
- Progress bar (0-100%)
- Status message (e.g., "Analyzing with AI...")
- Error messages if failed
- Action buttons (Retry, View Note)

**Updates:**
- Real-time via IPC events (`file-progress`)
- Progress bar animates smoothly
- Status changes reflect immediately

### Action Buttons

**"Clear Completed":**
- Removes files with status 'complete' from UI
- Database keeps records (not deleted, just hidden)
- Useful for decluttering after batch processing

**"Retry":**
- Appears on files with status 'error'
- Resets state to 'pending'
- Scheduler picks up and reprocesses

**"View Note":**
- Appears on completed files
- Opens Evernote note in browser
- Uses stored `note_url` from database

## Concurrency Control

### Stage 1 Limits

**Max Concurrent:** 2-3 files

**Rationale:**
- File extraction: I/O bound (can parallelize)
- AI analysis: CPU/GPU intensive (limit to prevent slowdown)
- 2-3 is sweet spot for most systems

**Implementation:**
```typescript
const MAX_CONCURRENT = 3;
let activeProcessing = 0;

while (pendingFiles.length > 0 && activeProcessing < MAX_CONCURRENT) {
  activeProcessing++;
  processFile(pendingFiles.shift()).finally(() => activeProcessing--);
}
```

### Stage 2 Limits

**Max Concurrent:** 1 file

**Rationale:**
- Evernote rate limits (avoid hitting limits faster)
- Simpler error handling
- Predictable behavior

**Sequential Processing:**
- Upload one file completely before starting next
- Wait for rate limits before continuing
- Ensures reliable uploads

## Error Handling

### Transient Errors

**Examples:**
- Network timeout
- Evernote API temporary unavailable
- Rate limit (error code 19)

**Handling:**
- Mark as 'rate-limited' or 'retrying'
- Store retry timestamp
- Automatic retry after wait period
- User can see countdown

### Permanent Errors

**Examples:**
- File not found
- Invalid file format
- Evernote API authentication failed
- File too large

**Handling:**
- Mark as 'error'
- Store error message
- User sees error in UI
- Manual retry button available

**Error Messages:**
- Clear, user-friendly text
- Actionable (e.g., "File not found: check path")
- Logged for debugging

## Progress Reporting

### Progress Stages

| Stage | Progress Range | Message |
|-------|----------------|---------|
| Extracting | 0-30% | "Extracting text from file..." |
| Analyzing | 31-60% | "Analyzing with AI..." |
| Ready | 61-70% | "Ready to upload" |
| Uploading | 71-99% | "Uploading to Evernote..." |
| Complete | 100% | "Upload complete" |

**Implementation:** `electron/utils/progress-helpers.ts`

### IPC Events

**Event:** `file-progress`

**Data:**
```typescript
{
  filePath: string;
  status: FileStatus;
  progress: number;  // 0-100
  message?: string;
  error?: string;
  result?: {
    title: string;
    description: string;
    tags: string[];
    noteUrl: string;
  };
}
```

**Frequency:** Emitted on every state change or progress update

**Event:** `file-removed-from-queue`

**Data:**
```typescript
{
  filePath: string;
}
```

**When Emitted:** After a file is successfully uploaded to Evernote and removed from the database. This event signals the UI to remove the file from the displayed queue.

**Purpose:** Provides immediate UI feedback when completed files are cleaned up from the database, ensuring the UI stays synchronized with the database state.

## Database Integration

**Files Table:**
- Stores all file metadata
- Status tracking (pending → complete)
- Progress percentage (0-100)
- Retry information (`retry_after` timestamp)
- Error messages
- Note URL after upload

**Queries:**
- `getFilesByStatus('pending')` - Files awaiting processing
- `getFilesByStatus('ready-to-upload')` - Files ready for Stage 2
- `getPendingRetries()` - Files ready to retry (past retry_after time)
- `updateFileStatus(path, status, progress)` - Update file state

**Benefits:**
- Persistent state (survives app restart)
- Fast queries with indexes
- Atomic updates (no race conditions)
- Single source of truth

## Performance

**Typical Throughput:**
- PDF extraction: 1-2 seconds
- AI analysis: 5-10 seconds (depends on model/hardware)
- Upload: 2-5 seconds (depends on network/file size)
- **Total per file:** ~10-20 seconds

**Concurrent Processing:**
- 3 files extracting simultaneously: ~2 seconds
- 3 files analyzing simultaneously: ~10 seconds
- Sequential uploads: ~5 seconds each
- **3 files total:** ~15-20 seconds (vs 30-60 seconds sequential)

**Bottlenecks:**
- AI analysis (CPU-intensive)
- Evernote rate limits (external constraint)
- OCR for images (very slow: 30-60 seconds)

## Testing

See [Testing Strategy](../03-development/testing-strategy.md) for comprehensive coverage.

**Key Test Scenarios:**
- Auto-start on file drop
- Concurrent processing (multiple files)
- Rate limit handling (sequential retries)
- Error recovery (retry after failure)
- State persistence (app restart)
- Progress event emission

**Unit Tests:**
- ProcessingScheduler (10 tests)
- Queue database operations (32 tests)
- Progress helpers (15 tests)
- State transitions (8 tests)

**Integration Tests:**
- Full pipeline (drop → complete)
- Rate limit scenarios
- Concurrent file processing
- Error handling flows

## User Experience

**Automatic Processing:**
- No manual trigger needed
- Files process immediately on drop
- Progress visible in real-time
- Can drop more files while processing

**Clear Feedback:**
- Current status for each file
- Progress bars show completion
- Error messages actionable
- Completed files can be cleared

**Non-Blocking:**
- App remains responsive during processing
- Can interact with other files
- Can adjust settings while processing
- Can drop more files anytime

## Future Enhancements

- **Configurable concurrency** - User-adjustable Stage 1 limit
- **Priority queue** - Process important files first
- **Pause/resume** - Pause all processing, resume later
- **Batch operations** - Retry all failed files
- **Smart scheduling** - Process during idle time
- **Background processing** - Continue when window minimized

## Source Code

**Processing:**
- `electron/processing/processing-scheduler.ts` - Stage 1 scheduler
- `electron/processing/file-processor.ts` - File processing logic
- `electron/processing/upload-queue.ts` - Upload retry logic

**Utilities:**
- `electron/utils/progress-helpers.ts` - Progress calculation
- `electron/utils/db-to-ui-mapper.ts` - Database to UI mapping

**Database:**
- `electron/database/queue-db.ts` - Queue operations
- `electron/database/schema.sql` - Database schema

**IPC:**
- `electron/main.ts` - IPC handlers for processing
- `electron/preload.ts` - IPC API surface

**React:**
- `electron/renderer/hooks/useFileProcessing.ts` - Processing state hook
- `electron/renderer/components/UnifiedList.tsx` - File list UI
