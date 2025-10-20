import { describe, it, expect } from 'vitest';
import path from 'path';
import { extractFileContent } from '../../src/file-extractor.js';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('file-extractor', () => {
  describe('extractFileContent', () => {
    it('should extract text from PDF file', async () => {
      const pdfPath = path.join(FIXTURES_DIR, '20250815_ne.ch.pdf');

      const result = await extractFileContent(pdfPath);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('fileType');
      expect(result).toHaveProperty('fileName');

      expect(result.fileType).toBe('pdf');
      expect(result.fileName).toBe('20250815_ne.ch.pdf');
      expect(result.text).toBeTruthy();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should extract text from another PDF file', async () => {
      const pdfPath = path.join(FIXTURES_DIR, 'Demi-Tarif_Audrey.pdf');

      const result = await extractFileContent(pdfPath);

      expect(result.fileType).toBe('pdf');
      expect(result.fileName).toBe('Demi-Tarif_Audrey.pdf');
      expect(result.text).toBeTruthy();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should extract text from DOCX file', async () => {
      const docxPath = path.join(FIXTURES_DIR, 'Fiche_Cuisson_Vapeur.docx');

      const result = await extractFileContent(docxPath);

      expect(result.fileType).toBe('docx');
      expect(result.fileName).toBe('Fiche_Cuisson_Vapeur.docx');
      expect(result.text).toBeTruthy();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it.skip('should extract text from PNG image using OCR', async () => {
      // Skip by default as OCR can be slow
      const imagePath = path.join(FIXTURES_DIR, 'Receipt_Sep_3_2025.png');

      const result = await extractFileContent(imagePath);

      expect(result.fileType).toBe('image');
      expect(result.fileName).toBe('Receipt_Sep_3_2025.png');
      expect(result.text).toBeTruthy();
      // OCR might produce some text, even if not perfect
      expect(result.text.length).toBeGreaterThanOrEqual(0);
    }, 60000); // OCR can take time

    it('should throw error for unsupported file type', async () => {
      const fakePath = path.join(FIXTURES_DIR, 'fake.xyz');

      await expect(extractFileContent(fakePath)).rejects.toThrow('Unsupported file type');
    });

    it('should throw error for non-existent file', async () => {
      const nonExistentPath = path.join(FIXTURES_DIR, 'does-not-exist.pdf');

      await expect(extractFileContent(nonExistentPath)).rejects.toThrow();
    });

    it('should return correct structure for all supported formats', async () => {
      const pdfPath = path.join(FIXTURES_DIR, '20250815_ne.ch.pdf');

      const result = await extractFileContent(pdfPath);

      // Verify the structure matches FileExtractionResult interface
      expect(result).toMatchObject({
        text: expect.any(String),
        fileType: expect.any(String),
        fileName: expect.any(String),
      });
    });

    it('should handle PDF with multiple pages', async () => {
      const pdfPath = path.join(FIXTURES_DIR, '20250815_ne.ch.pdf');

      const result = await extractFileContent(pdfPath);

      // Multi-page PDFs should have more text
      expect(result.text.length).toBeGreaterThan(100);
    });

    it('should extract meaningful content from PDF', async () => {
      const pdfPath = path.join(FIXTURES_DIR, '20250815_ne.ch.pdf');

      const result = await extractFileContent(pdfPath);

      // The text should contain some words/characters
      const words = result.text.trim().split(/\s+/);
      expect(words.length).toBeGreaterThan(5);
    });

    it('should extract meaningful content from DOCX', async () => {
      const docxPath = path.join(FIXTURES_DIR, 'Fiche_Cuisson_Vapeur.docx');

      const result = await extractFileContent(docxPath);

      // The text should contain some words/characters
      const words = result.text.trim().split(/\s+/);
      expect(words.length).toBeGreaterThan(5);
    });
  });
});
