# Auto-Processing Pipeline with Two-Stage Architecture

**Status:** ✅ Implemented (commits: cd734cc, 19fd105, cfb0b62)

**Related Specs:**
- [SQLite Database Migration](./sqlite-database-migration.md) - Storage backend implementation
- [Testing Strategy](./testing-strategy.md) - Test coverage for this feature

## Overview

Transform the file processing to automatically start on drop with two independent processing stages that can run concurrently.

## Implementation Notes

This specification has been fully implemented with one major enhancement:

**SQLite Database Backend** - Instead of using `.evernote.json` files as described in section 3, we implemented a SQLite database to store all file metadata and queue state. See [sqlite-database-migration.md](./sqlite-database-migration.md) for complete details.

Key differences from this spec:
- No `.evernote.json` files created (all data in SQLite database)
- Upload worker queries database instead of scanning filesystem
- All file state transitions tracked in centralized database
- Better performance and reliability than JSON-based approach

## Current Architecture

```
Drop files → Queue → Click "Process" → [Extract → Analyze → Upload] (sequential, blocking)
```

**Problems:**
- User must manually click "Process" button
- All operations are sequential and blocking
- No concurrency - processes one file completely before next
- Rate limits block entire pipeline

## New Architecture

```
Drop files → Auto-start → [Stage 1: Extract + Analyze] (concurrent, 2-3 files at once)
                       ↓
                       [Stage 2: Upload] (sequential, independent worker)
                       ↓
                       Complete
```

**Benefits:**
- Auto-starts processing on drop
- Stage 1 can process multiple files concurrently
- Stage 2 handles retries/rate limits independently
- Pipeline doesn't block on rate limits

---

## File States

Update file status to reflect both stages:

```typescript
type FileStatus =
  | 'pending'           // Waiting to start Stage 1
  | 'extracting'        // Stage 1: Extracting text from file
  | 'analyzing'         // Stage 1: AI analysis in progress
  | 'ready-to-upload'   // Stage 1 complete, waiting for upload slot
  | 'uploading'         // Stage 2: Currently uploading to Evernote
  | 'rate-limited'      // Stage 2: Waiting for rate limit to clear
  | 'retrying'          // Stage 2: Retrying after failure
  | 'complete'          // Successfully uploaded
  | 'error';            // Failed at any stage
```

---

## UI Mockup

### Complete Interface

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Evernote AI Importer                                          ⚙️   │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         ┌────────────────┐                          │
│                         │                │                          │
│                         │       📁       │                          │
│                         │                │                          │
│                    Drop files here       │                          │
│                                          │                          │
│              Drag and drop your files    │                          │
│                   to get started         │                          │
│                         │                │                          │
│                         └────────────────┘                          │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  9 files in queue                          [Clear Completed] [Clear All]│
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 report.pdf                                    🤖 Analyzing...│ │
│  │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 45%           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 invoice.pdf                                 📄 Extracting... │ │
│  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 25%           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 contract.pdf                             ⏸️ Ready to upload  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 notes.txt                                      ⬆️ Uploading...│ │
│  │ ██████████████████████████████████████████████░░ 90%           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 summary.pdf                               ⏱️ Rate limited    │ │
│  │ Waiting 45s before retry...                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 photo.png                                         ⏳ Pending │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 diagram.png                                      🔄 Retrying │ │
│  │ Upload failed - retrying in 5s...                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 presentation.pdf                                 ✅ Complete │ │
│  │                                                                │ │
│  │ Q3 2024 Sales Presentation                                    │ │
│  │ Comprehensive sales presentation for Q3 2024 showing...       │ │
│  │                                                                │ │
│  │ 🏷️ sales | presentations | 2024 | q3                         │ │
│  │                                                                │ │
│  │ View in Evernote →                                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📄 corrupted.pdf                                      ❌ Error  │ │
│  │ Failed to extract content: File is corrupted or encrypted     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  ✓ Ollama: Running | 3 models                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Key UI Elements

**Drop Zone (Top Section)**
- Always visible
- Files auto-process immediately when dropped
- No manual "Process" button needed

**File Queue (Middle Section)**
- Single list showing all files with their current status
- Each file card displays:
  - File icon and name
  - Current status with emoji indicator
  - Progress bar (for active operations)
  - Status messages (e.g., retry countdowns)
  - Full results (for completed files)
  - Error details (for failed files)

**File Status Examples:**

1. **🤖 Analyzing** (45%)
   - Stage 1: AI analysis in progress
   - Shows progress bar

2. **📄 Extracting** (25%)
   - Stage 1: Text extraction
   - Shows progress bar

3. **⏸️ Ready to upload**
   - Stage 1 complete, waiting for upload slot
   - No progress bar

4. **⬆️ Uploading** (90%)
   - Stage 2: Currently uploading to Evernote
   - Shows progress bar

5. **⏱️ Rate limited**
   - Stage 2: Waiting for rate limit to clear
   - Shows countdown message

6. **⏳ Pending**
   - Queued, waiting to start Stage 1
   - No progress bar

7. **🔄 Retrying**
   - Stage 2: Upload failed, retrying
   - Shows retry countdown

8. **✅ Complete**
   - Successfully uploaded
   - Shows: title, description, tags, Evernote link

9. **❌ Error**
   - Failed at any stage
   - Shows error message

**Actions (Top Right)**
- **Clear Completed**: Remove successfully uploaded files
- **Clear All**: Clear entire queue

**Status Bar (Bottom)**
- Shows Ollama status and available models

---

## Implementation Plan

### 1. Split File Processing (file-processor.ts)

**Current:** Single `processFile()` function does everything

**New:** Split into two functions

```typescript
// Stage 1: Extract text and analyze with AI
async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null
): Promise<AnalysisResult> {
  // 1. Extract file content
  // 2. Fetch Evernote tags
  // 3. Analyze with AI
  // 4. Filter tags
  // 5. Save to JSON (*.evernote.json)
  // Return: { title, description, tags, jsonPath }
}

// Stage 2: Upload from JSON to Evernote
async function uploadFile(
  jsonPath: string,
  mainWindow: BrowserWindow | null
): Promise<UploadResult> {
  // 1. Load from JSON
  // 2. Upload to Evernote (uses existing uploadNoteFromJSON)
  // 3. Handle rate limits
  // 4. Handle retries with exponential backoff
  // Return: { success, noteUrl, error, rateLimitDuration }
}
```

### 2. Processing Queue Manager (App.tsx)

**Remove:** "Process" button - processing starts automatically

**Add:** Auto-processing on file drop

```typescript
const handleFilesAdded = (filePaths: string[]) => {
  const newFiles: FileItem[] = filePaths.map(path => ({
    path,
    name: path.split('/').pop() || path,
    status: 'pending',
    progress: 0
  }));

  setFiles(prev => [...prev, ...newFiles]);

  // Auto-start processing
  startProcessing(newFiles);
};
```

**Add:** Concurrent Stage 1 processing

```typescript
// Process up to 3 files concurrently in Stage 1
const CONCURRENT_ANALYSIS = 3;

async function processNextPendingFiles() {
  const pending = files.filter(f => f.status === 'pending');
  const processing = files.filter(f =>
    f.status === 'extracting' || f.status === 'analyzing'
  );

  // Start new files if we have capacity
  const available = CONCURRENT_ANALYSIS - processing.length;
  const toProcess = pending.slice(0, available);

  for (const file of toProcess) {
    processFileStage1(file.path); // Don't await - concurrent
  }
}

async function processFileStage1(filePath: string) {
  try {
    updateFileStatus(filePath, 'extracting');

    // Call Stage 1: Extract + Analyze
    const result = await window.electronAPI.analyzeFile(filePath, {});

    // Mark as ready for upload
    updateFileStatus(filePath, 'ready-to-upload');
    updateFileData(filePath, result);

  } catch (error) {
    updateFileStatus(filePath, 'error');
    updateFileError(filePath, error.message);
  }
}
```

### 3. Upload Worker (main.ts or new upload-worker.ts)

**Add:** Background worker for Stage 2

Create a worker that continuously monitors for files ready to upload:

```typescript
class UploadWorker {
  private isRunning = false;
  private queue: string[] = []; // JSON file paths

  start() {
    this.isRunning = true;
    this.processLoop();
  }

  stop() {
    this.isRunning = false;
  }

  addToQueue(jsonPath: string) {
    if (!this.queue.includes(jsonPath)) {
      this.queue.push(jsonPath);
    }
  }

  private async processLoop() {
    while (this.isRunning) {
      if (this.queue.length === 0) {
        // No files to upload, wait a bit
        await sleep(1000);
        continue;
      }

      const jsonPath = this.queue[0];

      try {
        mainWindow?.webContents.send('file-progress', {
          jsonPath,
          status: 'uploading',
          progress: 90
        });

        const result = await uploadFile(jsonPath, mainWindow);

        if (result.success) {
          // Success - remove from queue
          this.queue.shift();
          mainWindow?.webContents.send('file-progress', {
            jsonPath,
            status: 'complete',
            progress: 100,
            result: { noteUrl: result.noteUrl }
          });

        } else if (result.rateLimitDuration) {
          // Rate limited - wait and retry
          const waitMs = result.rateLimitDuration * 1000;
          mainWindow?.webContents.send('file-progress', {
            jsonPath,
            status: 'rate-limited',
            progress: 90,
            message: `Rate limited - retry in ${result.rateLimitDuration}s`
          });

          await sleep(waitMs);

        } else {
          // Other error - retry with exponential backoff
          mainWindow?.webContents.send('file-progress', {
            jsonPath,
            status: 'retrying',
            progress: 90,
            error: result.error?.message
          });

          await sleep(5000); // Wait 5s before retry
        }

      } catch (error) {
        // Critical error - remove from queue and mark as error
        this.queue.shift();
        mainWindow?.webContents.send('file-progress', {
          jsonPath,
          status: 'error',
          error: error.message
        });
      }
    }
  }
}

// Global upload worker instance
const uploadWorker = new UploadWorker();
uploadWorker.start();
```

### 4. IPC Communication Updates

**New IPC handlers (main.ts):**

```typescript
// Stage 1: Analyze file (extract + AI)
ipcMain.handle('analyze-file', async (_event, filePath: string, options: any) => {
  return await analyzeFile(filePath, options, mainWindow);
});

// Add file to upload queue
ipcMain.handle('queue-upload', async (_event, jsonPath: string) => {
  uploadWorker.addToQueue(jsonPath);
  return { success: true };
});

// Get upload queue status
ipcMain.handle('get-upload-queue', async () => {
  return {
    queueLength: uploadWorker.queue.length,
    currentFile: uploadWorker.queue[0] || null
  };
});
```

**Update progress events:**

```typescript
// Send progress for both stages
mainWindow?.webContents.send('file-progress', {
  filePath: string,           // Original file path
  jsonPath?: string,          // JSON path (for Stage 2)
  status: FileStatus,
  progress: number,           // 0-100
  stage: 1 | 2,              // Which stage
  message?: string,
  result?: AnalysisResult | UploadResult,
  error?: string
});
```

### 5. UI Updates (FileQueue.tsx)

**Remove:** "Process X files" button

**Update:** Show all files with individual status

```tsx
<div className="file-list">
  {files.map((file, index) => (
    <div key={index} className={`file-item ${file.status}`}>
      <div className="file-item-header">
        <div className="file-item-name">{file.name}</div>
        <div className="file-item-status">
          {file.status === 'pending' && '⏳ Pending'}
          {file.status === 'extracting' && '📄 Extracting...'}
          {file.status === 'analyzing' && '🤖 Analyzing...'}
          {file.status === 'ready-to-upload' && '⏸️ Ready to upload'}
          {file.status === 'uploading' && '⬆️ Uploading...'}
          {file.status === 'rate-limited' && '⏱️ Rate limited'}
          {file.status === 'retrying' && '🔄 Retrying...'}
          {file.status === 'complete' && '✅ Complete'}
          {file.status === 'error' && '❌ Error'}
        </div>
      </div>

      {/* Progress bar for extracting/analyzing/uploading */}
      {['extracting', 'analyzing', 'uploading'].includes(file.status) && (
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${file.progress}%` }} />
        </div>
      )}

      {/* Status message */}
      {file.message && (
        <div className="file-message">{file.message}</div>
      )}

      {/* Results for complete files */}
      {file.status === 'complete' && file.result && (
        <div className="file-result">
          <strong>{file.result.title}</strong>
          <p>{file.result.description}</p>
          <div className="tags">
            {file.result.tags.map(tag => <span key={tag}>{tag}</span>)}
          </div>
          {file.result.noteUrl && (
            <a href={file.result.noteUrl} target="_blank">View in Evernote →</a>
          )}
        </div>
      )}

      {/* Error message */}
      {file.status === 'error' && file.error && (
        <div className="file-error">{file.error}</div>
      )}
    </div>
  ))}
</div>
```

### 6. Preload API Updates (preload.ts)

```typescript
const electronAPI = {
  // ... existing APIs ...

  // Stage 1: Analyze file
  analyzeFile: (filePath: string, options: ProcessFileOptions) =>
    ipcRenderer.invoke('analyze-file', filePath, options),

  // Queue file for upload
  queueUpload: (jsonPath: string) =>
    ipcRenderer.invoke('queue-upload', jsonPath),

  // Get upload queue status
  getUploadQueue: () =>
    ipcRenderer.invoke('get-upload-queue'),
};
```

---

## User Experience Flow

### Before (Current)

```
1. User drops files → Files added to queue
2. User clicks "Process 5 files" button
3. App processes files one by one
4. If rate limited, entire processing stops
5. User waits for everything to finish
```

### After (New)

```
1. User drops files → Processing starts immediately
2. Multiple files extract/analyze concurrently
3. Files upload in background, handling rate limits automatically
4. User can drop more files while others are processing
5. Smooth, continuous pipeline
```

---

## Error Handling

### Stage 1 Errors
- File not found
- Extraction failed
- AI analysis failed
- **Action:** Mark as error, don't add to upload queue

### Stage 2 Errors
- Upload failed (network error)
  - **Action:** Retry with exponential backoff
- Rate limited (429)
  - **Action:** Wait specified duration, then retry
- Already uploaded
  - **Action:** Mark as complete
- File deleted before upload
  - **Action:** Mark as error, remove from queue

---

## Configuration

```typescript
// Constants for tuning the pipeline
const CONCURRENT_STAGE1 = 3;           // Max concurrent analyses
const UPLOAD_RETRY_DELAY = 5000;       // 5s between retries
const MAX_UPLOAD_RETRIES = 3;          // Max retry attempts
const RATE_LIMIT_BUFFER = 2000;        // Add 2s buffer to rate limit wait
```

---

## Testing Plan

1. **Single file drop** - Should auto-start and complete
2. **Multiple files drop** - Should process 3 concurrently
3. **Drop while processing** - New files should queue and start
4. **Rate limit scenario** - Should pause upload, then resume
5. **Network error** - Should retry failed uploads
6. **Large batch** - Drop 20 files, verify smooth pipeline

---

## Migration Strategy

### Phase 1: Split Processing
- Create `analyzeFile()` and `uploadFile()` functions
- Keep existing sequential flow working
- Test thoroughly

### Phase 2: Add Upload Worker
- Create `UploadWorker` class
- Add IPC handlers
- Wire up to existing UI

### Phase 3: Auto-Processing
- Remove "Process" button
- Auto-start on file drop
- Add concurrent Stage 1 processing

### Phase 4: Polish
- Update UI with new states
- Add upload queue visibility
- Performance tuning

---

## Future Enhancements

- [ ] Pause/resume upload queue
- [ ] Prioritize certain files in queue
- [ ] Show estimated time remaining
- [ ] Background processing when app minimized
- [ ] Batch upload optimization (upload multiple files at once if API supports)
- [ ] Upload queue persistence (survive app restart)
- [ ] Smart retry with exponential backoff
