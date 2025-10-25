/**
 * useFileProcessing Hook
 * Manages file processing state, IPC communication, and scheduling
 */

import { useState, useRef, useEffect } from 'react';
import { ProcessingScheduler } from '../../utils/processing-scheduler.js';
import {
  updateFileFromIPCMessage,
  addFiles as addFilesToState,
  updateFileStatus,
  removeFileByPath,
  type FileProgressData
} from '../../utils/file-state-reducer.js';
import type { FileItem } from '../../utils/processing-scheduler.js';
import { mapDbRecordsToFileItems } from '../../utils/db-to-ui-mapper.js';
import type { FileRecord } from '../../database/queue-db.js';

const CONCURRENT_STAGE1 = 3; // Max concurrent analyses

export function useFileProcessing(onFileComplete?: () => void) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const processingRef = useRef(false);
  const scheduler = useRef(new ProcessingScheduler(CONCURRENT_STAGE1));

  // Load files from database on mount
  useEffect(() => {
    loadFilesFromDatabase();
  }, []);

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

      // When a file upload completes, trigger callback to refresh notes
      if (data.status === 'complete' && onFileComplete) {
        setTimeout(() => {
          onFileComplete();
        }, 1500);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onFileComplete]);

  // Subscribe to file removal events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileRemovedFromQueue((data: { filePath: string }) => {
      setFiles(prev => removeFileByPath(prev, data.filePath));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Process pending files whenever files array changes
  useEffect(() => {
    processNextPendingFiles();
  }, [files]);

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

  const loadFilesFromDatabase = async () => {
    try {
      const dbRecords = await window.electronAPI.getAllFiles() as FileRecord[];
      const fileItems = mapDbRecordsToFileItems(dbRecords);
      setFiles(fileItems);
    } catch (error) {
      console.error('Failed to load files from database:', error);
    }
  };

  const addFiles = (filePaths: string[]) => {
    setFiles(prev => addFilesToState(prev, filePaths));
  };

  const retryFile = (filePath: string) => {
    // Reset file to pending status and it will be auto-processed
    setFiles(prev => updateFileStatus(prev, filePath, 'pending'));
  };

  return {
    files,
    addFiles,
    retryFile,
    reloadFiles: loadFilesFromDatabase
  };
}
