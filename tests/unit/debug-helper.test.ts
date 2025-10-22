import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { saveDebugFile } from '../../electron/cli/debug-helper.js';

describe('debug-helper', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'debug-helper-test-'));
    testFilePath = path.join(tempDir, 'test-file.pdf');
    // Create a dummy file
    await fs.writeFile(testFilePath, 'dummy content', 'utf8');
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('saveDebugFile', () => {
    it('should save debug file with correct suffix', async () => {
      const content = 'This is debug content for testing';
      const suffix = 'extracted';

      await saveDebugFile(testFilePath, suffix, content);

      const expectedPath = path.join(tempDir, 'test-file-extracted.txt');
      const savedContent = await fs.readFile(expectedPath, 'utf8');

      expect(savedContent).toBe(content);
    });

    it('should save multiple debug files with different suffixes', async () => {
      const extractedContent = 'Extracted text content';
      const promptContent = 'AI prompt content';
      const responseContent = 'AI response content';

      await saveDebugFile(testFilePath, 'extracted', extractedContent);
      await saveDebugFile(testFilePath, 'prompt', promptContent);
      await saveDebugFile(testFilePath, 'response', responseContent);

      const extractedPath = path.join(tempDir, 'test-file-extracted.txt');
      const promptPath = path.join(tempDir, 'test-file-prompt.txt');
      const responsePath = path.join(tempDir, 'test-file-response.txt');

      expect(await fs.readFile(extractedPath, 'utf8')).toBe(extractedContent);
      expect(await fs.readFile(promptPath, 'utf8')).toBe(promptContent);
      expect(await fs.readFile(responsePath, 'utf8')).toBe(responseContent);
    });

    it('should handle files without extension', async () => {
      const noExtPath = path.join(tempDir, 'noextfile');
      await fs.writeFile(noExtPath, 'dummy', 'utf8');

      const content = 'Debug content for file without extension';
      await saveDebugFile(noExtPath, 'test', content);

      const expectedPath = path.join(tempDir, 'noextfile-test.txt');
      const savedContent = await fs.readFile(expectedPath, 'utf8');

      expect(savedContent).toBe(content);
    });

    it('should handle long content', async () => {
      const longContent = 'A'.repeat(100000); // 100KB of 'A's

      await saveDebugFile(testFilePath, 'longcontent', longContent);

      const expectedPath = path.join(tempDir, 'test-file-longcontent.txt');
      const savedContent = await fs.readFile(expectedPath, 'utf8');

      expect(savedContent).toBe(longContent);
      expect(savedContent.length).toBe(100000);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Hello\nWorld\r\n\tWith\x00Special\x1fCharacters™®€';

      await saveDebugFile(testFilePath, 'special', specialContent);

      const expectedPath = path.join(tempDir, 'test-file-special.txt');
      const savedContent = await fs.readFile(expectedPath, 'utf8');

      expect(savedContent).toBe(specialContent);
    });

    it('should not throw error if directory does not exist', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent', 'dir', 'file.pdf');

      // Should not throw - it should silently fail
      await expect(
        saveDebugFile(nonExistentPath, 'test', 'content')
      ).resolves.not.toThrow();
    });

    it('should overwrite existing debug file', async () => {
      const firstContent = 'First version of content';
      const secondContent = 'Second version of content';

      await saveDebugFile(testFilePath, 'overwrite', firstContent);
      await saveDebugFile(testFilePath, 'overwrite', secondContent);

      const expectedPath = path.join(tempDir, 'test-file-overwrite.txt');
      const savedContent = await fs.readFile(expectedPath, 'utf8');

      expect(savedContent).toBe(secondContent);
    });

    it('should handle UTF-8 encoded content', async () => {
      const utf8Content = 'Hello 世界 🌍 مرحبا Здравствуй';

      await saveDebugFile(testFilePath, 'utf8', utf8Content);

      const expectedPath = path.join(tempDir, 'test-file-utf8.txt');
      const savedContent = await fs.readFile(expectedPath, 'utf8');

      expect(savedContent).toBe(utf8Content);
    });
  });
});
