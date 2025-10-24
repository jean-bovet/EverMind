/**
 * Tag Cache Service
 *
 * Singleton service that manages Evernote tags in memory.
 * Tags are fetched once on app startup for optimal performance.
 */

import { listTags } from './client.js';

class TagCache {
  private tags: string[] = [];
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the tag cache by fetching tags from Evernote.
   * Can be called multiple times safely - will only fetch once.
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this.fetchTags();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Internal method to fetch tags from Evernote
   */
  private async fetchTags(): Promise<void> {
    try {
      console.log('TagCache: Fetching Evernote tags...');
      this.tags = await listTags();
      this.initialized = true;
      console.log(`TagCache: Cached ${this.tags.length} tags`);
    } catch (error) {
      console.error('TagCache: Failed to fetch tags:', error);
      // Set empty array on error so we don't block the app
      this.tags = [];
      this.initialized = true;
      throw error;
    }
  }

  /**
   * Get cached tags. Returns empty array if not initialized.
   * @returns Array of tag names
   */
  getTags(): string[] {
    if (!this.initialized) {
      console.warn('TagCache: getTags() called before initialization');
    }
    return [...this.tags]; // Return copy to prevent external modification
  }

  /**
   * Check if the cache has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Refresh the tag cache by fetching latest tags from Evernote.
   * Useful if tags have been added/modified during the session.
   * @returns Promise that resolves when refresh is complete
   */
  async refresh(): Promise<void> {
    console.log('TagCache: Refreshing tags...');
    this.initialized = false;
    await this.fetchTags();
  }

  /**
   * Clear the cache (primarily for testing)
   */
  clear(): void {
    this.tags = [];
    this.initialized = false;
    this.initializationPromise = null;
  }
}

// Export singleton instance
export const tagCache = new TagCache();
