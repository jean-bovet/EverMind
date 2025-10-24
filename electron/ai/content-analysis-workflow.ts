/**
 * Content Analysis Workflow
 *
 * Shared workflow class that encapsulates the common AI analysis pipeline
 * used by both file upload and note augmentation flows.
 */

import crypto from 'crypto';
import { analyzeContent, type AIAnalysisResult } from './ai-analyzer.js';
import { tagCache } from '../evernote/tag-cache.js';
import { filterExistingTags } from '../evernote/tag-validator.js';
import {
  getCachedNoteAnalysis,
  saveNoteAnalysisCache,
  type NoteCacheRecord
} from '../database/queue-db.js';

export interface AnalysisOptions {
  /** Enable debug output */
  debug?: boolean;
  /** Use cache for note augmentation (default: false) */
  useCache?: boolean;
  /** Source file path for debug output */
  sourceFilePath?: string;
}

export interface AnalysisResult {
  /** AI-generated title */
  title: string;
  /** AI-generated description */
  description: string;
  /** Filtered, valid tags that exist in Evernote */
  tags: string[];
  /** Content hash (MD5) for cache validation */
  contentHash: string;
  /** True if result came from cache */
  fromCache?: boolean;
}

/**
 * Content Analysis Workflow
 * Encapsulates the shared AI analysis pipeline
 */
export class ContentAnalysisWorkflow {
  /**
   * Analyze content with AI and filter tags
   *
   * @param content - Text content to analyze
   * @param title - Original title (filename or note title)
   * @param contentType - Type of content ('file' or 'note')
   * @param sourceId - Identifier for caching (file path or note guid)
   * @param options - Analysis options
   * @returns Analysis result with filtered tags
   */
  async analyze(
    content: string,
    title: string,
    contentType: 'file' | 'note',
    sourceId: string,
    options: AnalysisOptions = {}
  ): Promise<AnalysisResult> {
    // Step 1: Get cached tags (no network call!)
    const availableTags = tagCache.getTags();

    // Step 2: Calculate content hash for cache validation
    const contentHash = this.calculateContentHash(content);

    // Step 3: Check cache if enabled (only for note augmentation)
    if (options.useCache && contentType === 'note') {
      const cached = this.checkCache(sourceId, contentHash);
      if (cached) {
        console.log('  ✓ Using cached AI analysis');

        // Filter cached tags to ensure only valid tags are returned
        // This handles cases where tags may have been deleted from Evernote since caching
        const cachedTags = JSON.parse(cached.ai_tags);
        const { valid: validCachedTags } = filterExistingTags(cachedTags, availableTags);

        return {
          title: cached.ai_title,
          description: cached.ai_description,
          tags: validCachedTags,
          contentHash,
          fromCache: true
        };
      }
    }

    // Step 4: Run AI analysis
    const aiResult = await analyzeContent(
      content,
      title,
      contentType,
      availableTags,
      options.debug || false,
      options.sourceFilePath || null
    );

    // Step 5: Filter tags to only include existing Evernote tags
    const { valid: validTags } = filterExistingTags(aiResult.tags, availableTags);

    // Step 6: Save to cache if note augmentation
    // IMPORTANT: Save the filtered result with valid tags only
    if (contentType === 'note') {
      const filteredResult = {
        title: aiResult.title,
        description: aiResult.description,
        tags: validTags  // Save filtered tags, not raw AI tags
      };
      saveNoteAnalysisCache(sourceId, filteredResult, contentHash);
    }

    return {
      title: aiResult.title,
      description: aiResult.description,
      tags: validTags,
      contentHash,
      fromCache: false
    };
  }

  /**
   * Calculate MD5 hash of content
   * @param content - Text content
   * @returns MD5 hash as hex string
   */
  private calculateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Check if there's a valid cached analysis for this content
   * @param sourceId - Note GUID
   * @param contentHash - Content hash to validate cache
   * @returns Cached analysis or null if not found/expired/invalid
   */
  private checkCache(sourceId: string, contentHash: string): NoteCacheRecord | null {
    const cached = getCachedNoteAnalysis(sourceId, contentHash);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    if (Date.now() >= cached.expires_at) {
      return null;
    }

    return cached;
  }
}

// Export singleton instance for convenience
export const contentAnalysisWorkflow = new ContentAnalysisWorkflow();
