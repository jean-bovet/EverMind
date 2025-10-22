# IPC API Reference

## Overview

This document provides a complete reference for the Inter-Process Communication (IPC) API between the Renderer process (React UI) and Main process (Node.js backend) in the Evernote AI Importer Electron app.

## API Surface

The IPC API is exposed to the renderer via `window.electronAPI` through the preload script using `contextBridge`.

## Type Definitions

### Common Types

```typescript
interface ProcessFileOptions {
  debug?: boolean;
}

interface FileProgressData {
  filePath: string;
  status: 'extracting' | 'analyzing' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  result?: {
    title: string;
    description: string;
    tags: string[];
    noteUrl?: string;
  };
}

interface BatchProgressData {
  totalFiles: number;
  processed: number;
  currentFile?: string;
  status: 'scanning' | 'processing' | 'uploading' | 'complete';
}

interface DownloadProgressData {
  status: 'downloading' | 'installing' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
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

### `getSettings()`

Retrieves current application settings.

**Returns:** `Promise<Settings>`

**Example:**
```typescript
const settings = await window.electronAPI.getSettings();
console.log(settings.ollamaModel); // "mistral"
```

**Main Process Handler:**
```typescript
ipcMain.handle('get-settings', () => {
  return {
    ollamaModel: store.get('ollamaModel'),
    ollamaHost: store.get('ollamaHost'),
    ollamaTemperature: store.get('ollamaTemperature'),
  };
});
```

---

### `setSetting(key, value)`

Saves a single setting.

**Parameters:**
- `key: string` - Setting key
- `value: unknown` - Setting value

**Returns:** `Promise<boolean>`

**Example:**
```typescript
await window.electronAPI.setSetting('ollamaModel', 'llama3.1:8b');
```

**Main Process Handler:**
```typescript
ipcMain.handle('set-setting', (_event, key: string, value: unknown) => {
  store.set(key, value);
  return true;
});
```

## File Selection API

### `selectFiles()`

Opens native file picker for selecting files.

**Returns:** `Promise<string[]>` - Array of selected file paths

**Example:**
```typescript
const filePaths = await window.electronAPI.selectFiles();
// ["/Users/john/Documents/report.pdf", "/Users/john/Documents/notes.txt"]
```

**Main Process Handler:**
```typescript
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'markdown', 'docx'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.filePaths;
});
```

---

### `selectFolder()`

Opens native folder picker.

**Returns:** `Promise<string>` - Selected folder path

**Example:**
```typescript
const folderPath = await window.electronAPI.selectFolder();
// "/Users/john/Documents/Projects"
```

**Main Process Handler:**
```typescript
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});
```

## File Processing API

### `processFile(filePath, options)`

Processes a single file and uploads to Evernote.

**Parameters:**
- `filePath: string` - Absolute path to file
- `options: ProcessFileOptions` - Processing options

**Returns:** `Promise<ProcessResult>`

**Events Emitted:** `file-progress` (see Events section)

**Example:**
```typescript
const result = await window.electronAPI.processFile(
  '/Users/john/Documents/report.pdf',
  { debug: false }
);

if (result.success) {
  console.log('Uploaded:', result.noteUrl);
} else {
  console.error('Failed:', result.error);
}
```

**Main Process Implementation:**
```typescript
ipcMain.handle('process-file', async (_event, filePath: string, options: any) => {
  return await processFile(filePath, options, mainWindow);
});
```

**Process Flow:**
1. Extract content from file
2. Analyze with AI
3. Filter tags
4. Upload to Evernote
5. Emit progress events throughout

---

### `processBatch(folderPath, options)`

Processes all supported files in a folder.

**Parameters:**
- `folderPath: string` - Absolute path to folder
- `options: ProcessFileOptions` - Processing options

**Returns:** `Promise<void>`

**Events Emitted:**
- `batch-progress` (overall progress)
- `file-progress` (per-file progress)

**Example:**
```typescript
await window.electronAPI.processBatch(
  '/Users/john/Documents/ImportFolder',
  { debug: false }
);
```

**Main Process Implementation:**
```typescript
ipcMain.handle('process-batch', async (_event, folderPath: string, options: any) => {
  return await processBatch(folderPath, options, mainWindow);
});
```

## Database Management API

### `clearAllFiles()`

Clears all files from the SQLite database queue.

**Returns:** `Promise<{ success: boolean; deletedCount: number }>`

**Example:**
```typescript
const result = await window.electronAPI.clearAllFiles();
console.log(`Deleted ${result.deletedCount} files`);
```

**Main Process Implementation:**
```typescript
ipcMain.handle('clear-all-files', async () => {
  const deletedCount = deleteAllFiles();
  return { success: true, deletedCount };
});
```

**Use Cases:**
- "Clear All" button in UI
- Reset queue for fresh start
- Remove all pending/failed files

**Note:** This deletes ALL files from the database, including completed uploads. Use with caution.

---

### `getAllFiles()`

Retrieves all files from the database queue.

**Returns:** `Promise<FileRecord[]>`

**Example:**
```typescript
const files = await window.electronAPI.getAllFiles();
console.log(`Found ${files.length} files in queue`);

// Convert to UI format using mapper
import { mapDbRecordsToFileItems } from '../utils/db-to-ui-mapper';
const uiFiles = mapDbRecordsToFileItems(files);
```

**Main Process Implementation:**
```typescript
ipcMain.handle('get-all-files', async () => {
  const files = getAllFiles();
  return files;
});
```

**Use Cases:**
- Load files from database on app startup
- Display file queue in UI
- Synchronize UI state with database

**Return Type:**
```typescript
interface FileRecord {
  id: number;
  file_path: string;
  title: string | null;
  description: string | null;
  tags: string | null;  // JSON string
  status: FileStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  last_attempt_at: string | null;
  retry_after: number | null;
  uploaded_at: string | null;
  note_url: string | null;
}
```

**Integration Example:**
```typescript
// In App.tsx
useEffect(() => {
  loadFilesFromDatabase();
}, []);

const loadFilesFromDatabase = async () => {
  const dbRecords = await window.electronAPI.getAllFiles();
  const fileItems = mapDbRecordsToFileItems(dbRecords);
  setFiles(fileItems);
};
```

## Ollama API

### `checkOllamaInstallation()`

Checks if Ollama is installed and running.

**Returns:** `Promise<OllamaStatus>`

**Example:**
```typescript
const status = await window.electronAPI.checkOllamaInstallation();

if (status.running) {
  console.log('Ollama is running');
  console.log('Available models:', status.models);
} else if (status.installed) {
  console.log('Ollama installed but not running');
} else {
  console.log('Ollama not installed');
}
```

**Main Process Handler:**
```typescript
ipcMain.handle('check-ollama', async () => {
  return await ollamaDetector.checkInstallation();
});
```

---

### `installOllama()`

Guides user to install Ollama (opens download page).

**Returns:** `Promise<boolean>` - true if user clicked Download

**Example:**
```typescript
const userWantsToInstall = await window.electronAPI.installOllama();

if (userWantsToInstall) {
  // Download page opened, show instructions
  console.log('User is installing Ollama');
}
```

**Main Process Handler:**
```typescript
ipcMain.handle('install-ollama', async () => {
  return await ollamaDetector.promptInstall();
});
```

**User Experience:**
1. Shows info dialog about Ollama
2. Opens official download page in browser
3. Shows platform-specific installation instructions
4. Returns true if user clicked "Download"

---

### `checkOllamaModel(modelName)`

Checks if a specific model is installed.

**Parameters:**
- `modelName: string` - Model name (e.g., "mistral", "llama3.1:8b")

**Returns:** `Promise<boolean>`

**Example:**
```typescript
const hasMistral = await window.electronAPI.checkOllamaModel('mistral');

if (!hasMistral) {
  console.log('Mistral not installed, need to download');
}
```

**Main Process Handler:**
```typescript
ipcMain.handle('check-ollama-model', async (_event, modelName: string) => {
  return await ollamaDetector.hasModel(modelName);
});
```

---

### `downloadModel(modelName)`

Downloads a model via Ollama.

**Parameters:**
- `modelName: string` - Model to download

**Returns:** `Promise<boolean>` - true if successful

**Events Emitted:** `model-download-progress`

**Example:**
```typescript
// Subscribe to progress
const unsubscribe = window.electronAPI.onModelDownloadProgress((data) => {
  console.log(`Progress: ${data.progress}%`);
  if (data.status === 'complete') {
    console.log('Download complete!');
  }
});

// Start download
await window.electronAPI.downloadModel('mistral');

// Cleanup listener
unsubscribe();
```

**Main Process Handler:**
```typescript
ipcMain.handle('download-model', async (_event, modelName: string) => {
  return new Promise((resolve, reject) => {
    ollamaDetector.downloadModel(modelName, (progress, status) => {
      mainWindow?.webContents.send('model-download-progress', {
        status: progress < 100 ? 'downloading' : 'complete',
        progress,
        message: status
      });
    })
    .then(() => resolve(true))
    .catch(reject);
  });
});
```

## Evernote API

### `authenticateEvernote()`

Starts Evernote OAuth authentication flow.

**Returns:** `Promise<boolean>` - true if successful

**Example:**
```typescript
await window.electronAPI.authenticateEvernote();
// OAuth flow starts in browser
// User authorizes app
// Token saved automatically
```

**Main Process Handler:**
```typescript
ipcMain.handle('authenticate-evernote', async () => {
  return await authenticate();
});
```

**Authentication Flow:**
1. Opens browser to Evernote OAuth page
2. User logs in and authorizes
3. User enters verification code in CLI
4. Token saved to `.evernote-token`

---

### `checkEvernoteAuth()`

Checks if user is authenticated with Evernote.

**Returns:** `Promise<boolean>`

**Example:**
```typescript
const isAuthenticated = await window.electronAPI.checkEvernoteAuth();

if (!isAuthenticated) {
  // Show "Connect Evernote" button
}
```

**Main Process Handler:**
```typescript
ipcMain.handle('check-evernote-auth', async () => {
  return await hasToken();
});
```

---

### `logoutEvernote()`

Removes Evernote authentication token.

**Returns:** `Promise<void>`

**Example:**
```typescript
await window.electronAPI.logoutEvernote();
console.log('Logged out from Evernote');
```

**Main Process Handler:**
```typescript
ipcMain.handle('logout-evernote', async () => {
  return await removeToken();
});
```

---

### `listEvernoteTags()`

Fetches all tags from Evernote account.

**Returns:** `Promise<string[]>`

**Example:**
```typescript
const tags = await window.electronAPI.listEvernoteTags();
// ["work", "personal", "finance", "2024", ...]
```

**Main Process Handler:**
```typescript
ipcMain.handle('list-evernote-tags', async () => {
  return await listTags();
});
```

---

## Note Augmentation API

> **See also:** [note-augmentation-feature.md](./note-augmentation-feature.md) for complete implementation details.

### `listNotebooks()`

Fetches all notebooks from Evernote account.

**Returns:** `Promise<Notebook[]>`

**Type:**
```typescript
interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}
```

**Example:**
```typescript
const notebooks = await window.electronAPI.listNotebooks();
// [
//   { guid: "nb-1", name: "Documents", defaultNotebook: true },
//   { guid: "nb-2", name: "Work", defaultNotebook: false }
// ]
```

**Main Process Handler:**
```typescript
ipcMain.handle('list-notebooks', async () => {
  return await listNotebooks();
});
```

---

### `listNotesInNotebook(notebookGuid, offset?, limit?)`

Fetches notes from a specific notebook with pagination.

**Parameters:**
- `notebookGuid: string` - Notebook GUID
- `offset?: number` - Starting index (default: 0)
- `limit?: number` - Max notes to return (default: 50)

**Returns:** `Promise<NoteMetadata[]>`

**Type:**
```typescript
interface NoteMetadata {
  guid: string;
  title?: string;
  created?: number;  // Unix timestamp
  updated?: number;  // Unix timestamp
  tagGuids?: string[];
  attributes?: {
    applicationData?: Record<string, string>;
  };
}
```

**Example:**
```typescript
const notes = await window.electronAPI.listNotesInNotebook('nb-1', 0, 50);
// Returns first 50 notes from notebook

const moreNotes = await window.electronAPI.listNotesInNotebook('nb-1', 50, 50);
// Returns next 50 notes (pagination)
```

**Main Process Handler:**
```typescript
ipcMain.handle('list-notes-in-notebook', async (_event, notebookGuid, offset, limit) => {
  return await listNotesInNotebook(notebookGuid, offset, limit);
});
```

---

### `getNoteContent(noteGuid)`

Fetches complete note with full content and resources.

**Parameters:**
- `noteGuid: string` - Note GUID

**Returns:** `Promise<Note>`

**Type:**
```typescript
interface Note {
  guid: string;
  title?: string;
  content?: string;  // ENML format
  resources?: Resource[];  // Attachments
  attributes?: NoteAttributes;
  created?: number;
  updated?: number;
}
```

**Example:**
```typescript
const note = await window.electronAPI.getNoteContent('note-123');
console.log(note.title);
console.log(note.content);  // ENML XML
console.log(note.resources?.length);  // Number of attachments
```

**Main Process Handler:**
```typescript
ipcMain.handle('get-note-content', async (_event, noteGuid) => {
  return await getNoteWithContent(noteGuid);
});
```

---

### `augmentNote(noteGuid)`

Augments an existing note with AI analysis.

**Parameters:**
- `noteGuid: string` - Note GUID to augment

**Returns:** `Promise<AugmentationResult>`

**Type:**
```typescript
interface AugmentationResult {
  success: boolean;
  error?: string;
  noteUrl?: string;
}
```

**Example:**
```typescript
const result = await window.electronAPI.augmentNote('note-123');

if (result.success) {
  console.log('Note augmented! View at:', result.noteUrl);
} else {
  console.error('Augmentation failed:', result.error);
}
```

**Main Process Handler:**
```typescript
ipcMain.handle('augment-note', async (_event, noteGuid) => {
  return await augmentNote(noteGuid, mainWindow);
});
```

**Process:**
1. Fetches note from Evernote
2. Extracts text from ENML content
3. Extracts text from attachments (PDF, images via OCR)
4. Analyzes combined text with Ollama AI
5. Appends AI analysis to note content
6. Updates note in Evernote with:
   - Augmented content
   - Metadata (aiAugmented: "true", aiAugmentedDate: timestamp)

**Progress Events:**
Emits `augment-progress` events during processing. See `onAugmentProgress()`.

---

## Event Listeners

### `onFileProgress(callback)`

Listens to file processing progress events.

**Parameters:**
- `callback: (data: FileProgressData) => void`

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = window.electronAPI.onFileProgress((data) => {
  console.log(`File: ${data.filePath}`);
  console.log(`Status: ${data.status}`);
  console.log(`Progress: ${data.progress}%`);

  if (data.status === 'complete' && data.result) {
    console.log('Title:', data.result.title);
    console.log('Tags:', data.result.tags);
  }

  if (data.status === 'error') {
    console.error('Error:', data.error);
  }
});

// Later: cleanup
unsubscribe();
```

**Progress Events:**
```typescript
// Extracting content
{ filePath, status: 'extracting', progress: 25, message: 'Extracting file content...' }

// Analyzing with AI
{ filePath, status: 'analyzing', progress: 50, message: 'Analyzing with AI...' }

// Uploading
{ filePath, status: 'uploading', progress: 75, message: 'Uploading to Evernote...' }

// Complete
{ filePath, status: 'complete', progress: 100, result: {...} }

// Error
{ filePath, status: 'error', progress: 0, error: 'Failed to extract text' }
```

**Preload Implementation:**
```typescript
onFileProgress: (callback: (data: FileProgressData) => void) => {
  const subscription = (_event: unknown, data: FileProgressData) => callback(data);
  ipcRenderer.on('file-progress', subscription);
  return () => ipcRenderer.removeListener('file-progress', subscription);
}
```

---

### `onBatchProgress(callback)`

Listens to batch processing progress.

**Parameters:**
- `callback: (data: BatchProgressData) => void`

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = window.electronAPI.onBatchProgress((data) => {
  console.log(`Processing ${data.processed}/${data.totalFiles} files`);

  if (data.currentFile) {
    console.log('Current file:', data.currentFile);
  }

  if (data.status === 'complete') {
    console.log('Batch complete!');
  }
});

// Later: cleanup
unsubscribe();
```

---

### `onOllamaDownloadProgress(callback)`

Listens to Ollama installation progress.

**Parameters:**
- `callback: (data: DownloadProgressData) => void`

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = window.electronAPI.onOllamaDownloadProgress((data) => {
  console.log(`${data.status}: ${data.progress}%`);

  if (data.message) {
    console.log(data.message);
  }

  if (data.status === 'error') {
    console.error('Download failed:', data.error);
  }
});
```

---

### `onModelDownloadProgress(callback)`

Listens to model download progress.

**Parameters:**
- `callback: (data: DownloadProgressData) => void`

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = window.electronAPI.onModelDownloadProgress((data) => {
  if (data.status === 'downloading') {
    setProgress(data.progress);
    setStatus(data.message || 'Downloading...');
  }

  if (data.status === 'complete') {
    console.log('Model downloaded!');
    unsubscribe();
  }
});
```

---

### `onAugmentProgress(callback)`

Listens to note augmentation progress events.

**Parameters:**
- `callback: (data: AugmentProgressData) => void`

**Type:**
```typescript
interface AugmentProgressData {
  noteGuid: string;
  status: 'fetching' | 'extracting' | 'analyzing' | 'building' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  noteUrl?: string;
}
```

**Returns:** `() => void` - Unsubscribe function

**Example:**
```typescript
const unsubscribe = window.electronAPI.onAugmentProgress((data) => {
  if (data.status === 'analyzing') {
    setProgress(data.progress);
    setStatus(data.message || 'Analyzing with AI...');
  }

  if (data.status === 'complete') {
    console.log('Note augmented! View at:', data.noteUrl);
    unsubscribe();
  }

  if (data.status === 'error') {
    console.error('Augmentation failed:', data.error);
    unsubscribe();
  }
});

await window.electronAPI.augmentNote('note-123');
```

**Progress Stages:**
1. **fetching** (10%) - Downloading note from Evernote
2. **extracting** (20%) - Extracting text from content and attachments
3. **analyzing** (30-70%) - AI analysis with Ollama
4. **building** (80%) - Building augmented content
5. **uploading** (90%) - Updating note in Evernote
6. **complete** (100%) - Augmentation successful
7. **error** (0%) - Augmentation failed

---

## Usage Patterns

### Pattern 1: Check and Process File

```typescript
// Check if ready
const ollamaStatus = await window.electronAPI.checkOllamaInstallation();
const isAuthenticated = await window.electronAPI.checkEvernoteAuth();

if (!ollamaStatus.running) {
  console.error('Ollama not running');
  return;
}

if (!isAuthenticated) {
  await window.electronAPI.authenticateEvernote();
}

// Process file with progress tracking
const unsubscribe = window.electronAPI.onFileProgress((data) => {
  updateUI(data);
});

await window.electronAPI.processFile('/path/to/file.pdf', {});

unsubscribe();
```

### Pattern 2: Model Setup

```typescript
// Check if model exists
const hasModel = await window.electronAPI.checkOllamaModel('mistral');

if (!hasModel) {
  // Download with progress
  const unsubscribe = window.electronAPI.onModelDownloadProgress((data) => {
    setDownloadProgress(data.progress);
    setDownloadStatus(data.message);
  });

  await window.electronAPI.downloadModel('mistral');

  unsubscribe();
}

// Save model preference
await window.electronAPI.setSetting('ollamaModel', 'mistral');
```

### Pattern 3: Batch Processing with UI Updates

```typescript
// Subscribe to both progress types
const fileUnsubscribe = window.electronAPI.onFileProgress((data) => {
  updateFileInQueue(data.filePath, data);
});

const batchUnsubscribe = window.electronAPI.onBatchProgress((data) => {
  updateBatchProgress(data.processed, data.totalFiles);
});

// Start batch processing
await window.electronAPI.processBatch('/path/to/folder', {});

// Cleanup
fileUnsubscribe();
batchUnsubscribe();
```

## Security Considerations

### Context Isolation

The API is exposed through `contextBridge.exposeInMainWorld()`, which ensures:
- Renderer process cannot access Node.js directly
- Only explicitly exposed functions are available
- No direct access to `ipcRenderer` from renderer

### Input Validation

All IPC handlers should validate inputs:

```typescript
ipcMain.handle('process-file', async (_event, filePath: string, options: any) => {
  // Validate filePath
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('Invalid file path');
  }

  // Resolve to absolute path
  const absolutePath = path.resolve(filePath);

  // Check file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error('File not found');
  }

  // Process file
  return await processFile(absolutePath, options, mainWindow);
});
```

## Error Handling

All IPC handlers return Promises, so errors can be caught:

```typescript
try {
  await window.electronAPI.processFile('/path/to/file.pdf', {});
} catch (error) {
  console.error('Processing failed:', error);
  showErrorToUser(error.message);
}
```

## Debugging

### Enable IPC Logging

In main process:
```typescript
ipcMain.on('*', (event, ...args) => {
  console.log('IPC Event:', event.sender.getURL(), args);
});
```

### Log from Renderer

```typescript
console.log('Calling processFile...');
await window.electronAPI.processFile('/path/to/file.pdf', {});
console.log('processFile completed');
```

## Type Safety

For full TypeScript support, create a type declaration file:

**File:** `electron/renderer/global.d.ts`

```typescript
import { ProcessFileOptions, FileProgressData, BatchProgressData, DownloadProgressData, OllamaStatus, Settings } from '../preload';

declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<Settings>;
      setSetting: (key: string, value: unknown) => Promise<boolean>;
      selectFiles: () => Promise<string[]>;
      selectFolder: () => Promise<string>;
      processFile: (filePath: string, options: ProcessFileOptions) => Promise<any>;
      processBatch: (folderPath: string, options: ProcessFileOptions) => Promise<void>;
      checkOllamaInstallation: () => Promise<OllamaStatus>;
      installOllama: () => Promise<boolean>;
      checkOllamaModel: (modelName: string) => Promise<boolean>;
      downloadModel: (modelName: string) => Promise<boolean>;
      authenticateEvernote: () => Promise<boolean>;
      checkEvernoteAuth: () => Promise<boolean>;
      logoutEvernote: () => Promise<void>;
      listEvernoteTags: () => Promise<string[]>;
      onFileProgress: (callback: (data: FileProgressData) => void) => () => void;
      onBatchProgress: (callback: (data: BatchProgressData) => void) => () => void;
      onOllamaDownloadProgress: (callback: (data: DownloadProgressData) => void) => () => void;
      onModelDownloadProgress: (callback: (data: DownloadProgressData) => void) => () => void;
    };
  }
}
```

Now TypeScript will autocomplete and type-check all IPC calls!
