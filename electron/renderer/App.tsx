import React, { useState, useEffect, useRef } from 'react';
import DropZone from './components/DropZone';
import FileQueue from './components/FileQueue';
import Settings from './components/Settings';
import WelcomeWizard from './components/WelcomeWizard';
import StatusBar from './components/StatusBar';

// Configuration for concurrent processing
const CONCURRENT_STAGE1 = 3; // Max concurrent analyses

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

interface FileItem {
  path: string;
  name: string;
  status: FileStatus;
  progress: number;
  message?: string;
  jsonPath?: string;    // Path to the .evernote.json file (for Stage 2)
  result?: {
    title: string;
    description: string;
    tags: string[];
    noteUrl?: string;
  };
  error?: string;
}

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  location?: string;
  models?: string[];
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const processingRef = useRef(false);

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

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
    const unsubscribe = window.electronAPI.onFileProgress((data) => {
      setFiles(prev => prev.map(file => {
        if (file.path === data.filePath) {
          // Update file with new status and data
          const updated: FileItem = {
            ...file,
            status: data.status,
            progress: data.progress,
            message: data.message
          };

          // Merge result data (keep existing data if not provided)
          if (data.result) {
            updated.result = {
              ...file.result,
              ...data.result
            } as typeof file.result;
          }

          if (data.error) {
            updated.error = data.error;
          }

          if (data.jsonPath) {
            updated.jsonPath = data.jsonPath;
          }

          return updated;
        }
        return file;
      }));
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
    const newFiles: FileItem[] = filePaths.map(path => ({
      path,
      name: path.split('/').pop() || path,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  // Process next pending files (up to CONCURRENT_STAGE1 at once)
  const processNextPendingFiles = async () => {
    // Prevent multiple simultaneous calls
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const pending = files.filter(f => f.status === 'pending');
      const processing = files.filter(f =>
        f.status === 'extracting' || f.status === 'analyzing'
      );

      // Start new files if we have capacity
      const available = CONCURRENT_STAGE1 - processing.length;
      const toProcess = pending.slice(0, available);

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
      // Mark as extracting
      setFiles(prev => prev.map(f =>
        f.path === filePath ? { ...f, status: 'extracting' as FileStatus } : f
      ));

      // Call Stage 1: Extract + Analyze
      const result = await window.electronAPI.analyzeFile(filePath, {});

      if (result.success && result.jsonPath) {
        // Queue for upload (Stage 2)
        await window.electronAPI.queueUpload(result.jsonPath, filePath);
      }

    } catch (error) {
      console.error('Error in Stage 1:', error);
      setFiles(prev => prev.map(f =>
        f.path === filePath
          ? {
              ...f,
              status: 'error' as FileStatus,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          : f
      ));
    }
  };

  const handleClearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'complete'));
  };

  const handleClearAll = () => {
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
