import { BrowserWindow } from 'electron';
import { getNoteWithContent, updateNote } from './evernote-client.js';
import { enmlToPlainText, appendToEnml, createAIAnalysisEnml } from './enml-parser.js';
import { analyzeContent } from './ai-analyzer.js';
import { extractFileContent } from './file-extractor.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface AugmentationResult {
  success: boolean;
  error?: string;
  noteUrl?: string;
}

export interface AugmentProgressData {
  noteGuid: string;
  status: 'fetching' | 'extracting' | 'analyzing' | 'building' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  noteUrl?: string;
}

/**
 * Augment an existing Evernote note with AI analysis
 * @param noteGuid - GUID of the note to augment
 * @param mainWindow - Electron main window for progress updates
 * @returns Augmentation result
 */
export async function augmentNote(
  noteGuid: string,
  mainWindow: BrowserWindow | null
): Promise<AugmentationResult> {
  const endpoint = process.env['EVERNOTE_ENDPOINT'] || 'https://www.evernote.com';

  const sendProgress = (data: Partial<AugmentProgressData>) => {
    if (mainWindow) {
      mainWindow.webContents.send('augment-progress', {
        noteGuid,
        ...data
      });
    }
  };

  try {
    // Step 1: Fetch Note (10%)
    sendProgress({ status: 'fetching', progress: 10, message: 'Fetching note from Evernote...' });

    const note = await getNoteWithContent(noteGuid);

    if (!note.content) {
      throw new Error('Note has no content');
    }

    // Step 2: Extract Text (20%)
    sendProgress({ status: 'extracting', progress: 20, message: 'Extracting text from note...' });

    // Convert ENML to plain text
    let extractedText = enmlToPlainText(note.content);

    // Extract text from attachments (if any)
    if (note.resources && note.resources.length > 0) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evernote-augment-'));

      try {
        for (let i = 0; i < note.resources.length; i++) {
          const resource = note.resources[i];
          const fileName = resource.attributes?.fileName || `attachment-${i}`;

          // Only process supported file types
          const mimeType = resource.mime || '';
          if (
            mimeType.startsWith('image/') ||
            mimeType === 'application/pdf' ||
            mimeType.includes('document')
          ) {
            const tempFilePath = path.join(tempDir, fileName);

            // Write resource data to temp file
            if (resource.data?.body) {
              await fs.writeFile(tempFilePath, resource.data.body);

              // Extract text from file
              try {
                const extractionResult = await extractFileContent(tempFilePath);
                if (extractionResult.text && extractionResult.text.trim()) {
                  extractedText += `\n\n[Attachment: ${fileName}]\n${extractionResult.text}`;
                }
              } catch (error) {
                console.warn(`Failed to extract text from ${fileName}:`, error);
                // Continue with other attachments
              }
            }
          }
        }
      } finally {
        // Cleanup temp files
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }

    // Step 3: AI Analysis (30-70%)
    sendProgress({ status: 'analyzing', progress: 30, message: 'Analyzing content with AI...' });

    const aiResult = await analyzeContent(
      extractedText,
      note.title || 'Untitled',
      'note',
      [], // Don't restrict tags for note augmentation
      false, // debug
      null // sourceFilePath
    );

    sendProgress({ status: 'analyzing', progress: 70, message: 'AI analysis complete' });

    // Step 4: Build Augmented Content (80%)
    sendProgress({ status: 'building', progress: 80, message: 'Building augmented note...' });

    const aiAnalysisEnml = createAIAnalysisEnml(aiResult, new Date().toISOString());
    const augmentedContent = appendToEnml(note.content, aiAnalysisEnml);

    // Step 5: Update Note (90%)
    sendProgress({ status: 'uploading', progress: 90, message: 'Updating note in Evernote...' });

    const updatedNote = await updateNote(
      noteGuid,
      augmentedContent,
      {
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: new Date().toISOString()
        }
      }
    );

    // Step 6: Complete (100%)
    const noteUrl = `${endpoint}/Home.action#n=${updatedNote.guid}`;

    sendProgress({
      status: 'complete',
      progress: 100,
      message: 'Note augmented successfully',
      noteUrl
    });

    return {
      success: true,
      noteUrl
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    sendProgress({
      status: 'error',
      progress: 0,
      error: errorMessage
    });

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Build augmented content from original ENML and AI analysis
 * Pure function for testing
 */
export function buildAugmentedContent(
  originalEnml: string,
  aiResult: { title: string; description: string; tags: string[] }
): string {
  const aiAnalysisEnml = createAIAnalysisEnml(aiResult, new Date().toISOString());
  return appendToEnml(originalEnml, aiAnalysisEnml);
}

/**
 * Extract augmentation status from note attributes
 * Pure function for testing
 */
export function extractAugmentationStatus(
  attributes: Record<string, string>
): { isAugmented: boolean; augmentedDate?: string } {
  return {
    isAugmented: attributes.aiAugmented === 'true',
    augmentedDate: attributes.aiAugmentedDate
  };
}
