/**
 * useNotebooks Hook
 * Manages notebook selection and fetching notes
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transformNoteMetadata } from '../../utils/note-helpers.js';
import type { NoteMetadata } from '../../utils/note-helpers.js';
import { parseEvernoteError } from '../../utils/rate-limit-helpers.js';

interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}

export function useNotebooks() {
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);

  // Fetch notebooks using React Query
  const {
    data: notebooks = [],
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

  return {
    notebooks,
    selectedNotebook,
    setSelectedNotebook,
    notes,
    notesLoading,
    notebooksLoading,
    refetchNotes,
    rateLimitWarning,
    setRateLimitWarning
  };
}
