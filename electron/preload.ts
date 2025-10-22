import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // File utilities
  getPathForFile: (file: File) => webUtils.getPathForFile(file),


  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set-setting', key, value),

  // File selection
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // File processing
  processFile: (filePath: string, options: ProcessFileOptions) =>
    ipcRenderer.invoke('process-file', filePath, options),
  processBatch: (folderPath: string, options: ProcessFileOptions) =>
    ipcRenderer.invoke('process-batch', folderPath, options),

  // Stage 1: Analyze file
  analyzeFile: (filePath: string, options: ProcessFileOptions) =>
    ipcRenderer.invoke('analyze-file', filePath, options),

  // Queue file for upload
  queueUpload: (jsonPath: string, originalFilePath: string) =>
    ipcRenderer.invoke('queue-upload', jsonPath, originalFilePath),

  // Get upload queue status
  getUploadQueue: () =>
    ipcRenderer.invoke('get-upload-queue'),

  // Database management
  clearAllFiles: () =>
    ipcRenderer.invoke('clear-all-files'),
  getAllFiles: () =>
    ipcRenderer.invoke('get-all-files'),
  verifyAndCleanup: () =>
    ipcRenderer.invoke('verify-and-cleanup'),

  // Ollama management
  checkOllamaInstallation: () => ipcRenderer.invoke('check-ollama'),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  checkOllamaModel: (modelName: string) => ipcRenderer.invoke('check-ollama-model', modelName),
  downloadModel: (modelName: string) => ipcRenderer.invoke('download-model', modelName),

  // Evernote authentication
  authenticateEvernote: () => ipcRenderer.invoke('authenticate-evernote'),
  checkEvernoteAuth: () => ipcRenderer.invoke('check-evernote-auth'),
  logoutEvernote: () => ipcRenderer.invoke('logout-evernote'),
  listEvernoteTags: () => ipcRenderer.invoke('list-evernote-tags'),

  // Note augmentation
  listNotebooks: () => ipcRenderer.invoke('list-notebooks'),
  listNotesInNotebook: (notebookGuid: string, offset?: number, limit?: number) =>
    ipcRenderer.invoke('list-notes-in-notebook', notebookGuid, offset, limit),
  getNoteContent: (noteGuid: string) =>
    ipcRenderer.invoke('get-note-content', noteGuid),
  augmentNote: (noteGuid: string) =>
    ipcRenderer.invoke('augment-note', noteGuid),

  // Event listeners
  onFileProgress: (callback: (data: FileProgressData) => void) => {
    const subscription = (_event: unknown, data: FileProgressData) => callback(data);
    ipcRenderer.on('file-progress', subscription);
    return () => ipcRenderer.removeListener('file-progress', subscription);
  },

  onBatchProgress: (callback: (data: BatchProgressData) => void) => {
    const subscription = (_event: unknown, data: BatchProgressData) => callback(data);
    ipcRenderer.on('batch-progress', subscription);
    return () => ipcRenderer.removeListener('batch-progress', subscription);
  },

  onOllamaDownloadProgress: (callback: (data: DownloadProgressData) => void) => {
    const subscription = (_event: unknown, data: DownloadProgressData) => callback(data);
    ipcRenderer.on('ollama-download-progress', subscription);
    return () => ipcRenderer.removeListener('ollama-download-progress', subscription);
  },

  onModelDownloadProgress: (callback: (data: DownloadProgressData) => void) => {
    const subscription = (_event: unknown, data: DownloadProgressData) => callback(data);
    ipcRenderer.on('model-download-progress', subscription);
    return () => ipcRenderer.removeListener('model-download-progress', subscription);
  },

  onAugmentProgress: (callback: (data: AugmentProgressData) => void) => {
    const subscription = (_event: unknown, data: AugmentProgressData) => callback(data);
    ipcRenderer.on('augment-progress', subscription);
    return () => ipcRenderer.removeListener('augment-progress', subscription);
  }
};

// Type definitions for the API
export interface ProcessFileOptions {
  debug?: boolean;
}

export interface FileProgressData {
  filePath: string;
  status: 'pending' | 'extracting' | 'analyzing' | 'ready-to-upload' | 'uploading' | 'rate-limited' | 'retrying' | 'complete' | 'error';
  progress: number;
  message?: string;
  error?: string;
  jsonPath?: string;
  result?: {
    title?: string;
    description?: string;
    tags?: string[];
    noteUrl?: string;
  };
}

export interface BatchProgressData {
  totalFiles: number;
  processed: number;
  currentFile?: string;
  status: 'scanning' | 'processing' | 'uploading' | 'complete';
}

export interface DownloadProgressData {
  status: 'downloading' | 'installing' | 'complete' | 'error';
  progress: number;
  message?: string;
  error?: string;
}

export interface AugmentProgressData {
  noteGuid: string;
  status: 'fetching' | 'extracting' | 'analyzing' | 'building' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  noteUrl?: string;
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript type augmentation for window object
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
