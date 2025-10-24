import { BrowserWindow } from 'electron';
import { getNoteWithContent, updateNote } from './client.js';
import { enmlToPlainText, prependToEnml, appendToEnml, createAIAnalysisEnml } from './enml-parser.js';
import { contentAnalysisWorkflow } from '../ai/content-analysis-workflow.js';
import { extractFileContent } from '../processing/file-extractor.js';
import { clearNoteAnalysisCache } from '../database/queue-db.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { parseEvernoteError } from '../utils/rate-limit-helpers.js';

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
    console.log(`\n=== Starting note augmentation for ${noteGuid} ===`);

    // Step 1: Fetch Note (10%)
    sendProgress({ status: 'fetching', progress: 10, message: 'Fetching note from Evernote...' });
    console.log('  Fetching note from Evernote...');

    const note = await getNoteWithContent(noteGuid);
    console.log(`  ✓ Note fetched: "${note.title}"`);

    if (!note.content) {
      throw new Error('Note has no content');
    }

    // Step 2: Extract Text (20%)
    sendProgress({ status: 'extracting', progress: 20, message: 'Extracting text from note...' });
    console.log('  Extracting text from note...');

    // Convert ENML to plain text
    let extractedText = enmlToPlainText(note.content);
    console.log(`  ✓ Extracted ${extractedText.length} characters from note content`);

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

    // Step 3: AI Analysis with Workflow (25-75%)
    sendProgress({ status: 'analyzing', progress: 25, message: 'Analyzing content with AI...' });

    // Use shared workflow for AI analysis (handles caching, tag filtering, etc.)
    const analysisResult = await contentAnalysisWorkflow.analyze(
      extractedText,
      note.title || 'Untitled',
      'note',
      noteGuid,
      { useCache: true, debug: false }
    );

    // Update progress based on cache hit/miss
    if (analysisResult.fromCache) {
      console.log('  ✓ Using cached AI analysis');
      sendProgress({ status: 'analyzing', progress: 70, message: 'Using cached analysis' });
    } else {
      console.log('  ✓ AI analysis complete');
      sendProgress({ status: 'analyzing', progress: 70, message: 'AI analysis complete' });
    }

    // Output AI analysis results for debugging
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📊 AI Analysis Results:');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Title (Summary): ${analysisResult.title}`);
    console.log(`  Description: ${analysisResult.description}`);
    console.log(`  Valid Tags: [${analysisResult.tags.join(', ')}]`);
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 4: Build Augmented Content (85%)
    sendProgress({ status: 'building', progress: 85, message: 'Building augmented note...' });
    console.log('  Building augmented note...');

    const aiAnalysisEnml = createAIAnalysisEnml(analysisResult, new Date().toISOString());
    const augmentedContent = prependToEnml(note.content, aiAnalysisEnml);
    console.log(`  ✓ Built augmented content (${augmentedContent.length} bytes)`);

    // Step 5: Update Note (95%)
    sendProgress({ status: 'uploading', progress: 95, message: 'Updating note in Evernote...' });
    console.log('  Updating note in Evernote...');

    const updatedNote = await updateNote(
      noteGuid,
      augmentedContent,
      {
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: new Date().toISOString()
        }
      },
      analysisResult.title,  // Update title to AI summary
      analysisResult.tags    // Add valid tags
    );

    // Step 6: Complete (100%)
    const noteUrl = `${endpoint}/Home.action#n=${updatedNote.guid}`;

    // Clear cache after successful upload
    clearNoteAnalysisCache(noteGuid);
    console.log('  ✓ Cleared analysis cache');

    console.log(`  ✓ Note augmented successfully!`);
    console.log(`  Note URL: ${noteUrl}\n`);

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

    // Format error for console display (user-friendly if Evernote error)
    const formattedError = parseEvernoteError(error) || errorMessage;
    console.error(`  ✗ Augmentation failed: ${formattedError}\n`);

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
    isAugmented: attributes['aiAugmented'] === 'true',
    augmentedDate: attributes['aiAugmentedDate']
  };
}
