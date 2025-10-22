import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import TopBar from './components/TopBar';
import UnifiedList from './components/UnifiedList';
import Settings from './components/Settings';
import WelcomeWizard from './components/WelcomeWizard';
import StatusBar from './components/StatusBar';
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
import {
  mergeNotesAndFiles,
  type UnifiedItem,
} from '../utils/unified-item-helpers.js';
import { transformNoteMetadata } from '../utils/note-helpers.js';
import type { NoteMetadata } from '../utils/note-helpers.js';
import { parseRateLimitError } from '../utils/rate-limit-helpers.js';

// Configuration for concurrent processing
const CONCURRENT_STAGE1 = 3; // Max concurrent analyses

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  location?: string;
  models?: string[];
}

interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}

function App() {
  // File processing state
  const [files, setFiles] = useState<FileItem[]>([]);
  const processingRef = useRef(false);
  const scheduler = useRef(new ProcessingScheduler(CONCURRENT_STAGE1));

  // Note management state
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);

  // Fetch notebooks using React Query
  const {
    data: notebooks = [],
    error: notebooksError,
    isLoading: notebooksLoading
  } = useQuery({
    queryKey: ['notebooks'],
    queryFn: async () => {
      return await window.electronAPI.listNotebooks();
    }
  });

  // Fetch notes for selected notebook using React Query
  const {
    data: notes = [],
    error: notesError,
    isLoading: notesLoading,
    refetch: refetchNotes
  } = useQuery({
    queryKey: ['notes', selectedNotebook],
    queryFn: async () => {
      if (!selectedNotebook) return [];

      setRateLimitWarning(null);

      try {
        const notesMetadata: NoteMetadata[] = await window.electronAPI.listNotesInNotebook(
          selectedNotebook,
          0,
          50
        );

        return transformNoteMetadata(notesMetadata);
      } catch (err) {
        const rateLimitError = parseRateLimitError(err);
        if (rateLimitError) {
          setRateLimitWarning(rateLimitError);
        }
        throw err;
      }
    },
    enabled: selectedNotebook !== null
  });

  // Merge files and notes into unified items
  const unifiedItems: UnifiedItem[] = mergeNotesAndFiles(notes, files);

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  // Load files from database on mount
  useEffect(() => {
    loadFilesFromDatabase();
  }, []);

  // Auto-select default notebook on mount
  useEffect(() => {
    if (notebooks.length > 0 && !selectedNotebook) {
      const defaultNotebook = notebooks.find((nb: Notebook) => nb.defaultNotebook);
      if (defaultNotebook) {
        setSelectedNotebook(defaultNotebook.guid);
      } else {
        setSelectedNotebook(notebooks[0]!.guid);
      }
    }
  }, [notebooks, selectedNotebook]);

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

    if (!status.installed) {
      setShowWelcome(true);
    }
  };

  // Subscribe to file progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileProgress((data: FileProgressData) => {
      setFiles(prev => {
        const updated = updateFileFromIPCMessage(prev, data);

        if (updated === prev) {
          console.warn(`IPC update for unknown file: ${data.filePath}`);
        }

        return updated;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to note augmentation progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAugmentProgress((data) => {
      // Check for rate limit errors
      if (data.status === 'error' && data.error) {
        const rateLimitError = parseRateLimitError(data.error);
        if (rateLimitError) {
          setRateLimitWarning(rateLimitError);
        }
      }

      // When complete or error, refresh the note
      if (data.status === 'complete' || data.status === 'error') {
        setTimeout(() => {
          // Refresh notes to show updated augmentation status
          if (data.status === 'complete') {
            refetchNotes();
          }
        }, 1500);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refetchNotes]);

  // Auto-process pending files
  useEffect(() => {
    processNextPendingFiles();
  }, [files]);

  const handleFilesAdded = (filePaths: string[]) => {
    setFiles(prev => addFiles(prev, filePaths));
  };

  const processNextPendingFiles = async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const toProcess = scheduler.current.getFilesToProcess(files);

      for (const file of toProcess) {
        processFileStage1(file.path);
      }
    } finally {
      processingRef.current = false;
    }
  };

  const processFileStage1 = async (filePath: string) => {
    try {
      const result = await window.electronAPI.analyzeFile(filePath, {});

      if (result.success && result.jsonPath) {
        await window.electronAPI.queueUpload(result.jsonPath, filePath);
      } else if (!result.success) {
        console.warn(`Analysis failed for ${filePath}:`, result.error);
      }
    } catch (error) {
      console.error('Error in Stage 1:', error);
      setFiles(prev => updateFileStatus(
        prev,
        filePath,
        'error',
        error instanceof Error ? error.message : 'Unknown error'
      ));
    }
  };

  const handleAugmentNote = async (noteGuid: string) => {
    try {
      await window.electronAPI.augmentNote(noteGuid);
    } catch (err) {
      console.error('Failed to augment note:', err);
    }
  };

  const handleRetryFile = (filePath: string) => {
    // Reset file to pending status and it will be auto-processed
    setFiles(prev => updateFileStatus(prev, filePath, 'pending'));
  };

  const handleNotebookChange = (notebookGuid: string) => {
    setSelectedNotebook(notebookGuid);
  };

  // Determine loading and error states
  const loading = notebooksLoading || notesLoading;
  const error = notebooksError || notesError;
  const errorMessage = error ? (() => {
    const rateLimitError = parseRateLimitError(error);
    if (rateLimitError) {
      return rateLimitError;
    }
    return error instanceof Error ? error.message : String(error);
  })() : null;

  return (
    <div className="app">
      <div className="title-bar" />

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
            <TopBar
              selectedNotebook={selectedNotebook}
              notebooks={notebooks}
              onNotebookChange={handleNotebookChange}
              onSettingsClick={() => setShowSettings(true)}
            />

            {rateLimitWarning && (
              <div className="rate-limit-warning">
                <span className="warning-icon">⚠️</span>
                <span className="warning-message">{rateLimitWarning}</span>
              </div>
            )}

            <UnifiedList
              items={unifiedItems}
              loading={loading}
              error={errorMessage}
              onAugmentNote={handleAugmentNote}
              onFilesDropped={handleFilesAdded}
              onRetryFile={handleRetryFile}
            />

            <StatusBar ollamaStatus={ollamaStatus} />
          </>
        )}
      </div>

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
