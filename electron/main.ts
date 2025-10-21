import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Store from 'electron-store';
import { getOllamaDetector } from './ollama-detector.js';
import { processFile, processBatch, analyzeFile } from './file-processor.js';
import { hasToken, authenticate, removeToken } from '../src/oauth-helper.js';
import { listTags } from '../src/evernote-client.js';
import { UploadWorker } from './upload-worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize settings store
const store = new Store({
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    ollamaModel: 'mistral',
    ollamaHost: 'http://localhost:11434',
    ollamaTemperature: 0.0,
  }
});

let mainWindow: BrowserWindow | null = null;

// Initialize upload worker
const uploadWorker = new UploadWorker(null);

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  // Get saved window bounds or use defaults
  const bounds = store.get('windowBounds') as { width: number; height: number };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false // Don't show until ready
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Update upload worker with new window reference
  uploadWorker.setMainWindow(mainWindow);

  // Save window bounds on resize/move
  mainWindow.on('resize', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', { width: bounds.width, height: bounds.height });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Start upload worker
  uploadWorker.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return {
    ollamaModel: store.get('ollamaModel'),
    ollamaHost: store.get('ollamaHost'),
    ollamaTemperature: store.get('ollamaTemperature'),
  };
});

ipcMain.handle('set-setting', (_event, key: string, value: unknown) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Supported Files', extensions: ['pdf', 'txt', 'md', 'markdown', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'] },
      { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'markdown', 'docx'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  return result.filePaths;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });

  return result.filePaths[0];
});

// Ollama IPC handlers
const ollamaDetector = getOllamaDetector();

ipcMain.handle('check-ollama', async () => {
  return await ollamaDetector.checkInstallation();
});

ipcMain.handle('install-ollama', async () => {
  return await ollamaDetector.promptInstall();
});

ipcMain.handle('check-ollama-model', async (_event, modelName: string) => {
  return await ollamaDetector.hasModel(modelName);
});

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
    .catch((error) => {
      mainWindow?.webContents.send('model-download-progress', {
        status: 'error',
        progress: 0,
        error: error.message
      });
      reject(error);
    });
  });
});

// Evernote IPC handlers
ipcMain.handle('authenticate-evernote', async () => {
  return await authenticate();
});

ipcMain.handle('check-evernote-auth', async () => {
  return await hasToken();
});

ipcMain.handle('logout-evernote', async () => {
  return await removeToken();
});

ipcMain.handle('list-evernote-tags', async () => {
  return await listTags();
});

// File processing IPC handlers
ipcMain.handle('process-file', async (_event, filePath: string, options: any) => {
  return await processFile(filePath, options, mainWindow);
});

ipcMain.handle('process-batch', async (_event, folderPath: string, options: any) => {
  return await processBatch(folderPath, options, mainWindow);
});

// Stage 1: Analyze file (extract + AI)
ipcMain.handle('analyze-file', async (_event, filePath: string, options: any) => {
  return await analyzeFile(filePath, options, mainWindow);
});

// Add file to upload queue
ipcMain.handle('queue-upload', async (_event, jsonPath: string, originalFilePath: string) => {
  uploadWorker.addToQueue(jsonPath, originalFilePath);
  return { success: true };
});

// Get upload queue status
ipcMain.handle('get-upload-queue', async () => {
  return uploadWorker.getQueueStatus();
});

// Cleanup on app quit
app.on('before-quit', () => {
  uploadWorker.stop();
  ollamaDetector.cleanup();
});

// Export for cleanup
export { mainWindow };
