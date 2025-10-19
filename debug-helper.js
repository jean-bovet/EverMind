const fs = require('fs').promises;
const path = require('path');

/**
 * Save debug output to file
 * @param {string} sourceFilePath - Path to the original file being processed
 * @param {string} suffix - Suffix for debug file (e.g., 'extracted', 'prompt', 'response')
 * @param {string} content - Content to save
 * @returns {Promise<void>}
 */
async function saveDebugFile(sourceFilePath, suffix, content) {
  try {
    const dir = path.dirname(sourceFilePath);
    const basename = path.basename(sourceFilePath, path.extname(sourceFilePath));
    const debugFilePath = path.join(dir, `${basename}-${suffix}.txt`);

    await fs.writeFile(debugFilePath, content, 'utf8');
    console.log(`Debug: Saved ${suffix} to ${debugFilePath}`);
  } catch (error) {
    console.warn(`Warning: Failed to save debug file (${suffix}): ${error.message}`);
  }
}

module.exports = {
  saveDebugFile
};
