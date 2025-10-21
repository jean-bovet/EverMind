import React, { useState, useEffect } from 'react';
import DropZone from './components/DropZone';
import FileQueue from './components/FileQueue';
import Settings from './components/Settings';
import WelcomeWizard from './components/WelcomeWizard';
import StatusBar from './components/StatusBar';

interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  progress: number;
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
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleFilesAdded = (filePaths: string[]) => {
    const newFiles: FileItem[] = filePaths.map(path => ({
      path,
      name: path.split('/').pop() || path,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleProcessFiles = async () => {
    setIsProcessing(true);

    // Subscribe to progress events
    const unsubscribe = window.electronAPI.onFileProgress((data) => {
      setFiles(prev => prev.map(file =>
        file.path === data.filePath
          ? {
              ...file,
              status: data.status === 'complete' ? 'complete' :
                      data.status === 'error' ? 'error' : 'processing',
              progress: data.progress,
              result: data.result,
              error: data.error
            }
          : file
      ));
    });

    // Process each file
    for (const file of files) {
      if (file.status === 'pending') {
        try {
          await window.electronAPI.processFile(file.path, {});
        } catch (error) {
          console.error('Error processing file:', error);
        }
      }
    }

    unsubscribe();
    setIsProcessing(false);
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
              disabled={isProcessing}
            />

            {/* File queue */}
            {files.length > 0 && (
              <FileQueue
                files={files}
                onProcess={handleProcessFiles}
                onClearCompleted={handleClearCompleted}
                onClearAll={handleClearAll}
                isProcessing={isProcessing}
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
