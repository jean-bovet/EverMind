import { promises as fs } from 'fs';
import path from 'path';

/**
 * Save debug output to file
 * @param sourceFilePath - Path to the original file being processed
 * @param suffix - Suffix for debug file (e.g., 'extracted', 'prompt', 'response')
 * @param content - Content to save
 */
export async function saveDebugFile(
  sourceFilePath: string,
  suffix: string,
  content: string
): Promise<void> {
  try {
    const dir = path.dirname(sourceFilePath);
    const basename = path.basename(sourceFilePath, path.extname(sourceFilePath));
    const debugFilePath = path.join(dir, `${basename}-${suffix}.txt`);

    await fs.writeFile(debugFilePath, content, 'utf8');
    // Silently save debug files - status shown at start of processing
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Warning: Failed to save debug file (${suffix}): ${errorMessage}`);
  }
}
