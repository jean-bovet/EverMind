import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import NoteCard from './NoteCard';
import { parseRateLimitError } from '../../utils/rate-limit-helpers.js';
import { transformNoteMetadata } from '../../utils/note-helpers.js';
import type { NoteMetadata } from '../../utils/note-helpers.js';

interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}

const NoteAugmenter: React.FC = () => {
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [augmentingNote, setAugmentingNote] = useState<string | null>(null);
  const [augmentProgress, setAugmentProgress] = useState<{
    noteGuid: string;
    status: string;
    progress: number;
    message?: string;
  } | null>(null);
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

      // Clear any previous rate limit warnings when fetching new data
      setRateLimitWarning(null);

      try {
        const notesMetadata: NoteMetadata[] = await window.electronAPI.listNotesInNotebook(
          selectedNotebook,
          0,
          50
        );

        // Transform metadata into preview format
        // NOTE: We skip fetching note content to avoid triggering rate limits
        // Content preview is optional in NoteCard component
        return transformNoteMetadata(notesMetadata);
      } catch (err) {
        // Check if this is a rate limit error
        const rateLimitError = parseRateLimitError(err);
        if (rateLimitError) {
          setRateLimitWarning(rateLimitError);
        }
        throw err; // Re-throw to let React Query handle it
      }
    },
    enabled: selectedNotebook !== null
  });

  const loading = notebooksLoading || notesLoading;
  const error = notebooksError || notesError;

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

  // Subscribe to augmentation progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAugmentProgress((data) => {
      setAugmentProgress(data);

      // Check for rate limit errors in augmentation
      if (data.status === 'error' && data.error) {
        const rateLimitError = parseRateLimitError(data.error);
        if (rateLimitError) {
          setRateLimitWarning(rateLimitError);
        }
      }

      // When complete or error, refresh the note
      if (data.status === 'complete' || data.status === 'error') {
        setTimeout(() => {
          setAugmentingNote(null);
          setAugmentProgress(null);

          // Refresh notes to show updated augmentation status (only if successful)
          if (data.status === 'complete') {
            refetchNotes();
          }
        }, 2000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refetchNotes]);

  const handleNotebookChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const notebookGuid = event.target.value;
    setSelectedNotebook(notebookGuid);
  };

  const handleAugmentNote = async (noteGuid: string) => {
    setAugmentingNote(noteGuid);

    try {
      const result = await window.electronAPI.augmentNote(noteGuid);

      if (!result.success) {
        // No need to set error here, it's already displayed in progress
        setAugmentingNote(null);
      }
      // Success is handled by progress listener
    } catch (err) {
      console.error('Failed to augment note:', err);
      setAugmentingNote(null);
    }
  };

  // Format error message with rate limit handling
  const errorMessage = error ? (() => {
    const rateLimitError = parseRateLimitError(error);
    if (rateLimitError) {
      return rateLimitError;
    }
    return error instanceof Error ? error.message : String(error);
  })() : null;

  return (
    <div className="note-augmenter">
      <div className="note-augmenter-header">
        <h2>Augment Existing Notes</h2>
        <div className="notebook-selector">
          <label htmlFor="notebook-select">Notebook:</label>
          <select
            id="notebook-select"
            value={selectedNotebook || ''}
            onChange={handleNotebookChange}
            disabled={loading || notebooks.length === 0}
          >
            {notebooks.length === 0 && (
              <option value="">No notebooks found</option>
            )}
            {notebooks.map((notebook: Notebook) => (
              <option key={notebook.guid} value={notebook.guid}>
                {notebook.name}
                {notebook.defaultNotebook && ' (Default)'}
              </option>
            ))}
          </select>
          <button
            onClick={() => refetchNotes()}
            disabled={loading}
            className="refresh-button"
            title="Refresh notes"
          >
            🔄
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="error-message">
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      {rateLimitWarning && (
        <div className="rate-limit-warning">
          <div className="warning-content">
            <span className="warning-icon">⚠️</span>
            <div className="warning-text">
              <strong>Rate Limit Reached</strong>
              <p>{rateLimitWarning}</p>
            </div>
          </div>
          <button
            className="dismiss-button"
            onClick={() => setRateLimitWarning(null)}
            title="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}

      {augmentProgress && (
        <div className="augment-progress">
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${augmentProgress.progress}%` }}
            />
          </div>
          <p className="progress-message">
            {augmentProgress.message || augmentProgress.status}
          </p>
        </div>
      )}

      {loading && notes.length === 0 ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading notes...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <p>No notes found in this notebook.</p>
          {selectedNotebook && (
            <button onClick={() => refetchNotes()}>Refresh</button>
          )}
        </div>
      ) : (
        <div className="notes-list">
          {notes.map((note) => (
            <NoteCard
              key={note.guid}
              note={note}
              onAugment={handleAugmentNote}
              augmenting={augmentingNote === note.guid}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NoteAugmenter;
