import { BrowserWindow } from 'electron';
import { getNoteWithContent, updateNote, listTags } from './client.js';
import { enmlToPlainText, prependToEnml, createAIAnalysisEnml } from './enml-parser.js';
import { analyzeContent } from '../ai/ai-analyzer.js';
import { extractFileContent } from '../processing/file-extractor.js';
import {
  getCachedNoteAnalysis,
  saveNoteAnalysisCache,
  clearNoteAnalysisCache
} from '../database/queue-db.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
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

    // Step 2.5: Calculate content hash for caching
    const contentHash = crypto.createHash('md5').update(extractedText).digest('hex');

    // Step 3: AI Analysis (30-70%)
    sendProgress({ status: 'analyzing', progress: 30, message: 'Analyzing content with AI...' });

    // Check cache first
    let aiResult;
    const cached = getCachedNoteAnalysis(noteGuid, contentHash);

    if (cached && Date.now() < cached.expires_at) {
      // Use cached analysis
      const cacheAge = Date.now() - new Date(cached.analyzed_at).getTime();
      const minutesAgo = Math.floor(cacheAge / 60000);
      console.log(`  ✓ Using cached AI analysis (from ${minutesAgo} minute(s) ago)`);

      aiResult = {
        title: cached.ai_title,
        description: cached.ai_description,
        tags: JSON.parse(cached.ai_tags)
      };

      sendProgress({ status: 'analyzing', progress: 70, message: 'Using cached analysis' });
    } else {
      // Run fresh AI analysis
      console.log('  Running fresh AI analysis...');

      aiResult = await analyzeContent(
        extractedText,
        note.title || 'Untitled',
        'note',
        [], // Don't restrict tags for note augmentation
        false, // debug
        null // sourceFilePath
      );

      // Save to cache immediately after analysis
      saveNoteAnalysisCache(noteGuid, aiResult, contentHash);
      console.log('  ✓ Saved AI analysis to cache');

      sendProgress({ status: 'analyzing', progress: 70, message: 'AI analysis complete' });
    }

    // Step 4: Get Available Tags (75%)
    sendProgress({ status: 'building', progress: 75, message: 'Fetching available tags...' });
    console.log('  Fetching available tags from Evernote...');

    const availableTags = await listTags();
    console.log(`  ✓ Found ${availableTags.length} available tags`);

    // Filter AI tags to only include ones that exist in Evernote
    const validTags = aiResult.tags.filter(tag => availableTags.includes(tag));
    console.log(`  ✓ Filtered to ${validTags.length} valid tags: ${validTags.join(', ')}`);

    // Step 5: Build Augmented Content (85%)
    sendProgress({ status: 'building', progress: 85, message: 'Building augmented note...' });
    console.log('  Building augmented note...');

    const aiAnalysisEnml = createAIAnalysisEnml(aiResult, new Date().toISOString());
    const augmentedContent = prependToEnml(note.content, aiAnalysisEnml);
    console.log(`  ✓ Built augmented content (${augmentedContent.length} bytes)`);

    // Step 6: Update Note (95%)
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
      aiResult.title,  // Update title to AI summary
      validTags        // Add valid tags
    );

    // Step 7: Complete (100%)
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
