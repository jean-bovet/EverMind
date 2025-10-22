import { useState, useEffect, useRef } from 'react';
import DropZone from './components/DropZone';
import FileQueue from './components/FileQueue';
import Settings from './components/Settings';
import WelcomeWizard from './components/WelcomeWizard';
import StatusBar from './components/StatusBar';
import NoteAugmenter from './components/NoteAugmenter';
import { ProcessingScheduler } from '../utils/processing-scheduler.js';
import {
  updateFileFromIPCMessage,
  addFiles,
  updateFileStatus,
  type FileProgressData
} from '../utils/file-state-reducer.js';
import type { FileItem } from '../utils/processing-scheduler.js';
import { mapDbRecordsToFileItems } from '../utils/db-to-ui-mapper.js';
import type { FileRecord } from '../database/queue-db.js';

// Configuration for concurrent processing
const CONCURRENT_STAGE1 = 3; // Max concurrent analyses

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  location?: string;
  models?: string[];
}

type View = 'import' | 'augment';

function App() {
  const [activeView, setActiveView] = useState<View>('import');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const processingRef = useRef(false);
  const scheduler = useRef(new ProcessingScheduler(CONCURRENT_STAGE1));

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  // Load files from database on mount
  useEffect(() => {
    loadFilesFromDatabase();
  }, []);

  const loadFilesFromDatabase = async () => {
    try {
      const dbRecords = await window.electronAPI.getAllFiles() as FileRecord[];
      const fileItems = mapDbRecordsToFileItems(dbRecords);
      setFiles(fileItems);
    } catch (error) {
      console.error('Failed to load files from database:', error);
    }
  };

  const checkOllamaStatus = async () => {
    const status = await window.electronAPI.checkOllamaInstallation();
    setOllamaStatus(status);

    // Show welcome wizard if Ollama not installed
    if (!status.installed) {
      setShowWelcome(true);
    }
  };

  // Subscribe to file progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileProgress((data: FileProgressData) => {
      setFiles(prev => {
        // Use pure function to update file state
        const updated = updateFileFromIPCMessage(prev, data);

        // Log if file not found (for debugging)
        if (updated === prev) {
          console.warn(`IPC update for unknown file: ${data.filePath}`);
          console.warn('Available files:', prev.map(f => f.path));
        }

        return updated;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-process pending files
  useEffect(() => {
    processNextPendingFiles();
  }, [files]);

  const handleFilesAdded = (filePaths: string[]) => {
    // Use pure function to add files
    setFiles(prev => addFiles(prev, filePaths));
  };

  // Process next pending files (up to CONCURRENT_STAGE1 at once)
  const processNextPendingFiles = async () => {
    // Prevent multiple simultaneous calls
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // Use pure function to determine which files to process
      const toProcess = scheduler.current.getFilesToProcess(files);

      for (const file of toProcess) {
        processFileStage1(file.path);
      }
    } finally {
      processingRef.current = false;
    }
  };

  // Stage 1: Analyze file (don't await - runs concurrently)
  const processFileStage1 = async (filePath: string) => {
    try {
      // Don't manually update status - let IPC messages be the single source of truth
      // The main process will send status updates starting immediately

      // Call Stage 1: Extract + Analyze
      const result = await window.electronAPI.analyzeFile(filePath, {});

      if (result.success && result.jsonPath) {
        // Queue for upload (Stage 2)
        await window.electronAPI.queueUpload(result.jsonPath, filePath);
      } else if (!result.success) {
        // Analysis failed but didn't throw - IPC should have sent error status
        // Log for debugging in case IPC message was missed
        console.warn(`Analysis failed for ${filePath}:`, result.error);
      }

    } catch (error) {
      // This catches exceptions during the IPC call itself
      console.error('Error in Stage 1:', error);
      // Fallback: update state if IPC message didn't get through
      setFiles(prev => updateFileStatus(
        prev,
        filePath,
        'error',
        error instanceof Error ? error.message : 'Unknown error'
      ));
    }
  };

  const handleClearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'complete'));
  };

  const handleClearAll = async () => {
    // Clear database first
    await window.electronAPI.clearAllFiles();
    // Then clear UI state
    setFiles([]);
  };

  return (
    <div className="app">
      {/* Title bar area for macOS traffic lights */}
      <div className="title-bar" />

      {/* Main content */}
      <div className="main-content">
        {showWelcome ? (
          <WelcomeWizard
            onComplete={() => {
              setShowWelcome(false);
              checkOllamaStatus();
            }}
            onSkip={() => setShowWelcome(false)}
          />
        ) : (
          <>
            {/* Header */}
            <header className="app-header">
              <h1>Evernote AI Importer</h1>
              <button
                className="settings-button"
                onClick={() => setShowSettings(true)}
                aria-label="Settings"
              >
                ⚙️
              </button>
            </header>

            {/* Navigation Tabs */}
            <div className="nav-tabs">
              <button
                className={`nav-tab ${activeView === 'import' ? 'active' : ''}`}
                onClick={() => setActiveView('import')}
              >
                📁 Import Files
              </button>
              <button
                className={`nav-tab ${activeView === 'augment' ? 'active' : ''}`}
                onClick={() => setActiveView('augment')}
              >
                🤖 Augment Notes
              </button>
            </div>

            {/* View Content */}
            {activeView === 'import' ? (
              <>
                {/* Drop zone */}
                <DropZone
                  onFilesAdded={handleFilesAdded}
                  disabled={false}
                />

                {/* File queue */}
                {files.length > 0 && (
                  <FileQueue
                    files={files}
                    onClearCompleted={handleClearCompleted}
                    onClearAll={handleClearAll}
                  />
                )}
              </>
            ) : (
              <NoteAugmenter />
            )}

            {/* Status bar */}
            <StatusBar ollamaStatus={ollamaStatus} />
          </>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onOllamaStatusChange={checkOllamaStatus}
        />
      )}
    </div>
  );
}

export default App;
