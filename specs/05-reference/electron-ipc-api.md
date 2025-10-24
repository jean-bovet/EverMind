# IPC API Reference

> **Type:** API Reference
> **Last Updated:** January 2025

Complete reference for the IPC API between Renderer (React UI) and Main process (Node.js). API exposed via `window.electronAPI` through the preload script.

## Type Definitions

```typescript
interface FileProgressData {
  filePath: string;
  status: 'extracting' | 'analyzing' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  result?: { title: string; description: string; tags: string[]; noteUrl?: string; };
}

interface AugmentProgressData {
  noteGuid: string;
  status: 'fetching' | 'extracting' | 'analyzing' | 'building' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  noteUrl?: string;
}

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  location?: string;
  models?: string[];
}

interface Settings {
  ollamaModel: string;
  ollamaHost: string;
  ollamaTemperature: number;
}
```

## Settings API

### `getSettings(): Promise<Settings>`
Retrieves current application settings.

### `setSetting(key: string, value: unknown): Promise<boolean>`
Saves a single setting value.

## File Selection API

### `selectFiles(): Promise<string[]>`
Opens native file picker dialog. Returns array of selected file paths.

**Filters:** Documents (pdf, txt, md, docx), Images (png, jpg, etc), All Files

### `selectFolder(): Promise<string>`
Opens native folder picker dialog. Returns selected folder path.

## File Processing API

### `processFile(filePath: string, options?: { debug?: boolean }): Promise<ProcessResult>`
Processes a single file and uploads to Evernote.

**Emits:** `file-progress` events during processing

### `processFolder(folderPath: string, options?: { debug?: boolean }): Promise<ProcessResult>`
Processes all supported files in folder recursively.

**Emits:** `file-progress` and `batch-progress` events

### `retryFile(filePath: string): Promise<void>`
Retries a failed file upload.

### `reprocessFile(filePath: string, options?: { debug?: boolean }): Promise<void>`
Reprocesses a file (clears cache and re-analyzes).

## Ollama API

### `checkOllamaStatus(): Promise<OllamaStatus>`
Checks Ollama installation and running status.

### `downloadOllamaModel(model: string): Promise<DownloadResult>`
Downloads an Ollama model.

**Emits:** `download-progress` events with progress percentage

### `openOllamaWebsite(): Promise<void>`
Opens Ollama download page in browser.

## Evernote API

### `authenticateEvernote(): Promise<string>`
Starts OAuth authentication flow. Returns access token on success.

**Opens:** Browser for OAuth authorization

### `checkEvernoteAuth(): Promise<boolean>`
Checks if valid Evernote token exists.

### `logoutEvernote(): Promise<void>`
Removes stored authentication token.

### `listNotebooks(): Promise<Notebook[]>`
Fetches all notebooks from Evernote.

```typescript
interface Notebook {
  guid: string;
  name: string;
}
```

### `fetchNotes(notebookGuid: string): Promise<NotePreview[]>`
Fetches notes from a specific notebook.

```typescript
interface NotePreview {
  guid: string;
  title: string;
  created: number;  // Unix timestamp
  updated: number;  // Unix timestamp
  contentPreview?: string;
  tags?: string[];
}
```

### `augmentNote(noteGuid: string): Promise<void>`
Augments an existing Evernote note with AI analysis.

**Emits:** `augment-progress` events during processing

## Database API

### `getAllItems(): Promise<UnifiedItem[]>`
Fetches all items (files and notes) from database.

```typescript
interface UnifiedItem {
  type: 'file' | 'note';
  id: string;  // file_path or note_guid
  title: string;
  description?: string;
  tags?: string[];
  status: string;
  createdAt: string;
  noteUrl?: string;
  isAugmented?: boolean;
  augmentedDate?: string;
}
```

### `markFilesAsCompleted(filePaths: string[]): Promise<void>`
Marks files as completed in database (hides from UI).

### `refreshNotes(): Promise<void>`
Refreshes augmented notes from Evernote.

## Events (IPC Listeners)

Events are subscribed via the `on*` functions exposed in `electronAPI`.

### `onFileProgress(callback: (data: FileProgressData) => void): () => void`
Listen to file processing progress. Returns cleanup function.

**Usage:**
```typescript
const cleanup = window.electronAPI.onFileProgress((data) => {
  console.log(`${data.filePath}: ${data.status} (${data.progress}%)`);
});
// Later: cleanup();
```

### `onBatchProgress(callback: (data: BatchProgressData) => void): () => void`
Listen to batch processing progress. Returns cleanup function.

### `onDownloadProgress(callback: (data: DownloadProgressData) => void): () => void`
Listen to model download progress. Returns cleanup function.

### `onAugmentProgress(callback: (data: AugmentProgressData) => void): () => void`
Listen to note augmentation progress. Returns cleanup function.

## Implementation Notes

**Context Isolation:** All IPC communication uses `contextBridge.exposeInMainWorld()` for security.

**Error Handling:** All API methods may throw errors. Use try-catch or `.catch()`.

**Progress Events:** All long-running operations emit progress events. Always subscribe before calling the operation.

**Cleanup:** Event listeners return cleanup functions. Always call them when unmounting components.

**Source Files:**
- `electron/main.ts` - IPC handlers implementation
- `electron/preload.ts` - API surface definition
