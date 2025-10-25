import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import UnifiedList from './components/UnifiedList';
import Settings from './components/Settings';
import WelcomeWizard from './components/WelcomeWizard';
import StatusBar from './components/StatusBar';
import { SearchableNotebookSelector } from './components/SearchableNotebookSelector';
import {
  mergeNotesAndFiles,
  updateItemProgress,
  type UnifiedItem,
} from '../utils/unified-item-helpers.js';
import { useFileProcessing } from './hooks/useFileProcessing.js';
import { useNotebooks } from './hooks/useNotebooks.js';
import { useNoteAugmentation } from './hooks/useNoteAugmentation.js';
import { useOllamaStatus } from './hooks/useOllamaStatus.js';

function App() {
  const [showSettings, setShowSettings] = useState(false);

  // Use custom hooks for state management
  const { ollamaStatus, showWelcome, setShowWelcome, checkOllamaStatus } = useOllamaStatus();

  const {
    notebooks,
    selectedNotebook,
    setSelectedNotebook,
    notes,
    notesLoading,
    notebooksLoading,
    refetchNotes,
    rateLimitWarning,
    setRateLimitWarning
  } = useNotebooks();

  const { files, addFiles, retryFile, reloadFiles } = useFileProcessing(() => {
    // Callback when file upload completes - refresh notes list
    refetchNotes();
  });

  const { augmentingNotes, augmentNote } = useNoteAugmentation(
    () => {
      // Callback when augmentation completes - refresh notes list
      refetchNotes();
    },
    (error: string) => {
      // Callback when rate limit error occurs
      setRateLimitWarning(error);
    }
  );

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

  // Handlers
  const handleFilesAdded = (filePaths: string[]) => {
    addFiles(filePaths);
  };

  const handleAugmentNote = async (noteGuid: string) => {
    augmentNote(noteGuid);
  };

  const handleRetryFile = async (filePath: string) => {
    await retryFile(filePath);
  };

  const handleNotebookChange = (notebookGuid: string) => {
    setSelectedNotebook(notebookGuid);
  };

  const handleClearCompleted = async () => {
    try {
      const result = await window.electronAPI.clearCompletedFiles();
      if (result.success) {
        await reloadFiles();
      }
    } catch (error) {
      console.error('Failed to clear completed files:', error);
    }
  };

  // Count completed files for clear button
  const completedCount = files.filter(f => f.status === 'complete').length;

  // Determine loading state
  const loading = notebooksLoading || notesLoading;

  return (
    <div className="app">
      <div className="title-bar">
        <div className="title-bar-controls">
          <label htmlFor="notebook-select" className="notebook-label">Notebook:</label>
          <SearchableNotebookSelector
            notebooks={notebooks}
            selectedNotebook={selectedNotebook}
            onNotebookChange={handleNotebookChange}
            disabled={notebooks.length === 0}
          />
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
              error={null}
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
          onRefreshNotes={refetchNotes}
          notesLoading={notesLoading}
          completedCount={completedCount}
          onClearCompleted={handleClearCompleted}
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
