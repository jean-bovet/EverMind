import React, { useState, useEffect } from 'react';
import NoteCard from './NoteCard';
import { enmlToPlainText } from '../../enml-parser.js';

interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}

interface NoteMetadata {
  guid: string;
  title?: string;
  created?: number;
  updated?: number;
  tagGuids?: string[];
  attributes?: {
    applicationData?: Record<string, string>;
  };
}

interface NotePreview {
  guid: string;
  title: string;
  contentPreview: string;
  created: number;
  updated: number;
  tags: string[];
  isAugmented: boolean;
  augmentedDate?: string;
  thumbnailUrl?: string;
}

const NoteAugmenter: React.FC = () => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [augmentingNote, setAugmentingNote] = useState<string | null>(null);
  const [augmentProgress, setAugmentProgress] = useState<{
    noteGuid: string;
    status: string;
    progress: number;
    message?: string;
  } | null>(null);

  // Load notebooks on mount
  useEffect(() => {
    loadNotebooks();
  }, []);

  // Subscribe to augmentation progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAugmentProgress((data) => {
      setAugmentProgress(data);

      // When complete or error, refresh the note
      if (data.status === 'complete' || data.status === 'error') {
        setTimeout(() => {
          setAugmentingNote(null);
          setAugmentProgress(null);

          // Refresh notes to show updated augmentation status
          if (selectedNotebook) {
            loadNotes(selectedNotebook);
          }
        }, 2000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedNotebook]);

  const loadNotebooks = async () => {
    setLoading(true);
    setError(null);

    try {
      const notebookList = await window.electronAPI.listNotebooks();
      setNotebooks(notebookList);

      // Auto-select default notebook if exists
      const defaultNotebook = notebookList.find((nb: Notebook) => nb.defaultNotebook);
      if (defaultNotebook) {
        setSelectedNotebook(defaultNotebook.guid);
        loadNotes(defaultNotebook.guid);
      } else if (notebookList.length > 0) {
        setSelectedNotebook(notebookList[0].guid);
        loadNotes(notebookList[0].guid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notebooks');
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async (notebookGuid: string) => {
    setLoading(true);
    setError(null);

    try {
      const notesMetadata: NoteMetadata[] = await window.electronAPI.listNotesInNotebook(
        notebookGuid,
        0,
        50
      );

      // Transform metadata into preview format
      const notePreviews: NotePreview[] = await Promise.all(
        notesMetadata.map(async (meta) => {
          // Get full note content for preview
          let contentPreview = '';
          try {
            const fullNote = await window.electronAPI.getNoteContent(meta.guid!);
            if (fullNote.content) {
              const plainText = enmlToPlainText(fullNote.content);
              contentPreview = plainText.substring(0, 200);
            }
          } catch (err) {
            console.warn(`Failed to load preview for note ${meta.guid}:`, err);
          }

          // Check augmentation status
          const isAugmented = meta.attributes?.applicationData?.['aiAugmented'] === 'true';
          const augmentedDate = meta.attributes?.applicationData?.['aiAugmentedDate'];

          return {
            guid: meta.guid!,
            title: meta.title || 'Untitled',
            contentPreview,
            created: meta.created || Date.now(),
            updated: meta.updated || Date.now(),
            tags: [], // TODO: Resolve tag names from tagGuids
            isAugmented,
            augmentedDate
          };
        })
      );

      setNotes(notePreviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const handleNotebookChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const notebookGuid = event.target.value;
    setSelectedNotebook(notebookGuid);
    loadNotes(notebookGuid);
  };

  const handleAugmentNote = async (noteGuid: string) => {
    setAugmentingNote(noteGuid);

    try {
      const result = await window.electronAPI.augmentNote(noteGuid);

      if (!result.success) {
        setError(result.error || 'Failed to augment note');
        setAugmentingNote(null);
      }
      // Success is handled by progress listener
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to augment note');
      setAugmentingNote(null);
    }
  };

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
            {notebooks.map((notebook) => (
              <option key={notebook.guid} value={notebook.guid}>
                {notebook.name}
                {notebook.defaultNotebook && ' (Default)'}
              </option>
            ))}
          </select>
          <button
            onClick={loadNotebooks}
            disabled={loading}
            className="refresh-button"
            title="Refresh notebooks"
          >
            🔄
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)}>✕</button>
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
            <button onClick={() => loadNotes(selectedNotebook)}>Refresh</button>
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
