import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
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
  createNoteItem,
  updateItemProgress,
  type UnifiedItem,
} from '../utils/unified-item-helpers.js';
import { transformNoteMetadata } from '../utils/note-helpers.js';
import type { NoteMetadata } from '../utils/note-helpers.js';
import { formatErrorForDisplay } from '../utils/rate-limit-helpers.js';

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

  // Note augmentation state - track which notes are being augmented and their progress
  const [augmentingNotes, setAugmentingNotes] = useState<Map<string, { progress: number, message?: string, error?: string }>>(new Map());

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
        const evernoteError = parseEvernoteError(err);
        if (evernoteError) {
          setRateLimitWarning(evernoteError);
        }
        throw err;
      }
    },
    enabled: selectedNotebook !== null
  });

  // Merge files and notes into unified items, then apply augmentation progress
  let unifiedItems: UnifiedItem[] = mergeNotesAndFiles(notes, files);

  // Apply augmentation progress to notes that are being augmented
  unifiedItems = unifiedItems.map(item => {
    if (item.type === 'note' && item.noteGuid) {
      const augmentProgress = augmentingNotes.get(item.noteGuid);
      if (augmentProgress) {
        // If there's an error, show error state
        if (augmentProgress.error) {
          return {
            ...item,
            status: 'error' as const,
            error: augmentProgress.error,
            progress: 0
          };
        }
        // Otherwise show progress
        return updateItemProgress(item, augmentProgress.progress, augmentProgress.message);
      }
    }
    return item;
  });

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
      // Update augmentation progress for the note
      if (data.status === 'error' && data.error) {
        // Error - show inline in the note row
        setAugmentingNotes(prev => new Map(prev).set(data.noteGuid, {
          progress: 0,
          message: 'Failed',
          error: data.error
        }));
      } else if (data.status !== 'complete') {
        // Still processing - update progress
        setAugmentingNotes(prev => new Map(prev).set(data.noteGuid, {
          progress: data.progress,
          message: data.message
        }));
      } else {
        // Complete - remove from augmenting notes
        setAugmentingNotes(prev => {
          const next = new Map(prev);
          next.delete(data.noteGuid);
          return next;
        });
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
    // Mark note as processing immediately
    setAugmentingNotes(prev => new Map(prev).set(noteGuid, {
      progress: 0,
      message: 'Starting augmentation...'
    }));

    try {
      await window.electronAPI.augmentNote(noteGuid);
    } catch (err) {
      console.error('Failed to augment note:', err);
      // Remove from augmenting notes on error
      setAugmentingNotes(prev => {
        const next = new Map(prev);
        next.delete(noteGuid);
        return next;
      });
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
    const evernoteError = parseEvernoteError(error);
    if (evernoteError) {
      return evernoteError;
    }
    return error instanceof Error ? error.message : String(error);
  })() : null;

  return (
    <div className="app">
      <div className="title-bar">
        <div className="title-bar-controls">
          <label htmlFor="notebook-select" className="notebook-label">Notebook:</label>
          <select
            id="notebook-select"
            className="notebook-select"
            value={selectedNotebook || ''}
            onChange={(e) => handleNotebookChange(e.target.value)}
            disabled={notebooks.length === 0}
          >
            {notebooks.length === 0 ? (
              <option value="">Loading...</option>
            ) : (
              notebooks.map((notebook) => (
                <option key={notebook.guid} value={notebook.guid}>
                  {notebook.name}
                  {notebook.defaultNotebook ? ' (Default)' : ''}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

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
            {rateLimitWarning && (
              <div className="rate-limit-warning">
                <span className="warning-icon">
                  <AlertTriangle size={20} />
                </span>
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
          </>
        )}
      </div>

      {!showWelcome && (
        <StatusBar
          ollamaStatus={ollamaStatus}
          onSettingsClick={() => setShowSettings(true)}
        />
      )}

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
