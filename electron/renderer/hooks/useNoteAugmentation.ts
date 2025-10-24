/**
 * useNoteAugmentation Hook
 * Manages note augmentation state and IPC communication
 */

import { useState, useEffect } from 'react';
import { parseEvernoteError } from '../../utils/rate-limit-helpers.js';

interface AugmentProgress {
  progress: number;
  message?: string;
  error?: string;
}

interface AugmentProgressData {
  noteGuid: string;
  status: string;
  progress: number;
  message?: string;
  error?: string;
}

export function useNoteAugmentation(onComplete?: () => void, onRateLimitError?: (error: string) => void) {
  // Track which notes are being augmented and their progress
  const [augmentingNotes, setAugmentingNotes] = useState<Map<string, AugmentProgress>>(new Map());

  // Subscribe to augmentation progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAugmentProgress((data: AugmentProgressData) => {
      setAugmentingNotes(prev => {
        const newMap = new Map(prev);

        if (data.status === 'complete') {
          // Remove from augmenting map
          newMap.delete(data.noteGuid);

          // Trigger completion callback
          if (onComplete) {
            setTimeout(() => {
              onComplete();
            }, 1000);
          }
        } else if (data.status === 'error') {
          // Check for rate limit error
          const evernoteError = parseEvernoteError(data.error);
          if (evernoteError && onRateLimitError) {
            onRateLimitError(evernoteError);
          }

          // Update with error
          newMap.set(data.noteGuid, {
            progress: 0,
            error: data.error || 'Unknown error'
          });
        } else {
          // Update progress
          newMap.set(data.noteGuid, {
            progress: data.progress,
            message: data.message
          });
        }

        return newMap;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [onComplete, onRateLimitError]);

  const augmentNote = async (noteGuid: string) => {
    try {
      setAugmentingNotes(prev => {
        const newMap = new Map(prev);
        newMap.set(noteGuid, { progress: 0, message: 'Starting...' });
        return newMap;
      });

      await window.electronAPI.augmentNote(noteGuid);
    } catch (error) {
      console.error('Failed to augment note:', error);

      setAugmentingNotes(prev => {
        const newMap = new Map(prev);
        newMap.set(noteGuid, {
          progress: 0,
          error: error instanceof Error ? error.message : 'Failed to augment note'
        });
        return newMap;
      });
    }
  };

  return {
    augmentingNotes,
    augmentNote
  };
}
