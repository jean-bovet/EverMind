# SQLite Database Queue

> **Type:** Feature
> **Last Updated:** October 2025
> **Status:** Implemented

## What It Is

The app uses a SQLite database to manage the file processing queue and note augmentation cache. This provides fast queries, reliable state persistence, and centralized data management.

## Database Location

```
macOS:   ~/Library/Application Support/evermind/queue.db
Linux:   ~/.config/evermind/queue.db
Windows: %APPDATA%/evermind/queue.db
```

Determined by: `app.getPath('userData')` in Electron

## Schema Overview

**Tables:**

**`files`** - File processing queue
- `file_path` (UNIQUE) - Original file path
- `title`, `description`, `tags` - AI analysis results
- `status` - pending, extracting, analyzing, ready-to-upload, uploading, rate-limited, complete, error
- `progress` - 0-100 percentage
- `error_message` - Error details if failed
- `created_at`, `last_attempt_at`, `uploaded_at` - Timestamps
- `retry_after` - Unix timestamp (ms) when to retry
- `note_url` - Evernote note URL after upload

**`notes`** - Augmented notes tracking
- `note_guid` (UNIQUE) - Evernote note GUID
- `title`, `description`, `tags` - AI analysis results
- `augmented_at` - When note was augmented
- `content_hash` - MD5 hash for caching
- Indexes on `note_guid` and `content_hash` for fast lookups

**Full schema:** `electron/database/schema.sql`

## Database Module API

**File:** `electron/database/queue-db.ts`

**Initialization:**
- `initDatabase(dbPath, force?)` - Initialize with automatic migrations
- `closeDatabase()` - Clean shutdown

**File Operations:**
- `addFile(filePath)` - Add to queue
- `getFile(filePath)` - Retrieve file record
- `getAllFiles()` - Get all files
- `getFilesByStatus(status)` - Filter by status
- `deleteFile(filePath)` - Remove from queue
- `deleteCompletedFiles()` - Clean up successful uploads
- `deleteAllFiles()` - Clear entire queue

**Status Updates:**
- `updateFileStatus(path, status, progress, message?)`
- `updateFileAnalysis(path, title, description, tags)`
- `updateFileUpload(path, noteUrl)`
- `updateFileError(path, errorMessage)`
- `updateRetryInfo(path, retryAfterMs)`

**Note Operations:**
- `saveNoteAnalysisCache(noteGuid, analysis, contentHash)`
- `getCachedNoteAnalysis(contentHash)` - Get cached AI results
- `getAllAugmentedNotes()` - List augmented notes
- `refreshNoteFromEvernote(noteGuid, noteData)` - Update from Evernote

**Smart Retries:**
- `getPendingRetries()` - Files ready to retry (passed retry_after time)
- `getFilesReadyToUpload()` - Files in ready-to-upload status

## Benefits

### Performance
- **Fast Queries:** Indexed lookups for efficient status filtering
- **Atomic Operations:** ACID guarantees prevent data corruption
- **AI Analysis Caching:** Results cached by content hash (24hr TTL)

### Reliability
- **Unique Constraints:** Prevents duplicate file paths
- **Transaction Support:** Multiple updates in single transaction
- **Automatic Migrations:** Schema versioning built-in

### User Experience
- **Persistent State:** Queue survives app restarts
- **Centralized View:** Single database for all queue data
- **Better Error Handling:** Detailed error messages and retry logic

### Developer Experience
- **Type-Safe:** Full TypeScript definitions
- **Testable:** In-memory database for testing
- **Maintainable:** Clear separation of concerns

## Integration with UI

### Database-to-UI Mapping

**File:** `electron/utils/db-to-ui-mapper.ts`

Maps database records to UI-friendly format:

```typescript
interface UnifiedItem {
  type: 'file' | 'note';
  id: string;  // file_path or note_guid
  title: string;
  description?: string;
  tags?: string[];
  status: string;
  progress?: number;
  createdAt: string;
  noteUrl?: string;
  isAugmented?: boolean;
  augmentedDate?: string;
}
```

### IPC Integration

**Main Process (`electron/main.ts`):**
- `getAllItems()` - Returns unified list of files and notes
- `markFilesAsCompleted()` - Hides completed files from UI
- `refreshNotes()` - Updates augmented notes from Evernote

**Renderer Process:**
- Subscribes to `file-progress` events
- Updates local state with progress
- Periodic refresh for status changes

## Auto-Processing

### ProcessingScheduler

**File:** `electron/processing/processing-scheduler.ts`

Automatically processes pending files in background:

**Features:**
- Monitors database for files in "pending" status
- Processes files one at a time (prevents overwhelming system)
- Respects rate limits (checks `retry_after`)
- Emits progress events via IPC
- Can be started/stopped programmatically

**Usage:**
```typescript
const scheduler = ProcessingScheduler.getInstance();
scheduler.start();  // Begins auto-processing
scheduler.stop();   // Stops processing
```

**Integration:** Started automatically when main window opens, stopped on app quit.

## Caching Strategy

### AI Analysis Cache

**Key:** MD5 hash of note content
**Duration:** 24 hours (configurable via `NOTE_CACHE_HOURS` env var)

**Benefits:**
- Skip re-analysis for unchanged content
- Faster re-augmentation of notes
- Reduces Ollama API calls

**Cache Hit Example:**
1. User augments a note → AI analysis cached
2. User re-augments same note within 24h → Cache hit, instant results
3. After 24h → Cache miss, re-analyzes with fresh AI

### Tag Cache

**Service:** `electron/evernote/tag-cache.ts`

Separate from SQLite, tags stored in memory:
- Fetched once at app startup
- Used for tag filtering during analysis
- Can be manually refreshed

## Testing

See [Testing Strategy](../03-development/testing-strategy.md) for comprehensive coverage.

**Unit Tests (32 tests):**
- File CRUD operations
- Status transitions
- Retry logic
- Note caching
- Tag filtering
- Query performance

**Key Test Scenarios:**
- Concurrent file additions
- Retry time calculations
- Cache expiry
- Database migrations
- Error handling

**Test Database:** Uses `:memory:` database for fast, isolated tests.

## Performance Metrics

**Query Performance:**
- Get all files: <1ms for 1000 files
- Get files by status: <1ms with index
- Add/update file: <1ms
- Get pending retries: <1ms with index

**Cache Performance:**
- Cache hit: <1ms (vs ~30s AI analysis)
- Cache miss: Full AI analysis time
- Hit rate: ~70% for re-augmentation scenarios

**Database Size:**
- ~1KB per file record
- ~2KB per note record (with cached analysis)
- 1000 files + 100 notes ≈ 1.2MB database

## Known Limitations

- **SQLite File Locking:** Single writer at a time (not an issue for Electron single-process writes)
- **Cache TTL:** Fixed 24-hour expiry (configurable via env var, but no per-record TTL)
- **No Cloud Sync:** Database is local-only

## Future Enhancements

- **Cloud backup** - Optional sync to cloud storage
- **Statistics dashboard** - Processing metrics and analytics
- **Custom TTL** - Per-note cache expiry settings
- **Export** - Export queue data to CSV/JSON
- **Batch operations** - Bulk status updates, retries

## Source Files

**Database:**
- `electron/database/queue-db.ts` - Database operations
- `electron/database/schema.sql` - Schema definition

**Utilities:**
- `electron/utils/db-to-ui-mapper.ts` - UI data transformation
- `electron/processing/processing-scheduler.ts` - Auto-processing logic

**Tests:**
- `tests/unit/queue-db.test.ts` - Comprehensive test suite (32 tests)

**Dependencies:**
- `better-sqlite3` - Synchronous SQLite bindings for Node.js (fast, reliable, no async complexity)
