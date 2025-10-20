import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';

export interface FileExtractionResult {
  text: string;
  fileType: string;
  fileName: string;
}

/**
 * Check if extracted text is insufficient (too short or empty)
 * @param text - Text to validate
 * @returns True if text is insufficient
 */
function isTextInsufficient(text: string): boolean {
  const cleaned = text.trim();

  // Empty or very short text
  if (cleaned.length < 10) {
    return true;
  }

  return false;
}

/**
 * Extract text content from various file types
 * @param filePath - Path to the file
 */
export async function extractFileContent(filePath: string): Promise<FileExtractionResult> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  try {
    switch (ext) {
      case '.pdf':
        return await extractPDF(filePath, fileName);

      case '.txt':
      case '.md':
      case '.markdown':
        return await extractText(filePath, fileName);

      case '.docx':
        return await extractWord(filePath, fileName);

      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.bmp':
      case '.tiff':
        return await extractImage(filePath, fileName);

      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract content from ${fileName}: ${errorMessage}`);
  }
}

/**
 * Extract text from PDF files
 */
async function extractPDF(filePath: string, fileName: string): Promise<FileExtractionResult> {
  const dataBuffer = await fs.readFile(filePath);

  // Initialize PDF parser with buffer
  const parser = new PDFParse({ data: dataBuffer });

  try {
    // Extract text from PDF (disable page markers by using simple newlines)
    const result = await parser.getText({ pageJoiner: '\n\n' });
    const extractedText = result.text.trim();

    // Check if extracted text is meaningful
    const needsOCR = isTextInsufficient(extractedText);

    if (needsOCR) {
      console.log('  Insufficient text found in PDF, attempting OCR...');
      const ocrText = await extractPDFWithOCR(filePath, fileName);

      if (isTextInsufficient(ocrText)) {
        throw new Error('PDF contains no extractable text or recognizable content');
      }

      return {
        text: ocrText,
        fileType: 'pdf',
        fileName: fileName,
      };
    }

    return {
      text: extractedText,
      fileType: 'pdf',
      fileName: fileName,
    };
  } finally {
    // Clean up parser resources
    await parser.destroy();
  }
}

/**
 * Extract text from PDF using OCR (for scanned/image-based PDFs)
 */
async function extractPDFWithOCR(filePath: string, _fileName: string): Promise<string> {
  console.log('  Converting PDF pages to images for OCR...');

  // Create temporary directory for page images
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-ocr-'));

  try {
    // Load PDF using pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const dataBuffer = await fs.readFile(filePath);

    // Load the PDF document (convert Buffer to Uint8Array)
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
    const pdfDocument = await loadingTask.promise;

    const numPages = pdfDocument.numPages;
    console.log(`  Processing ${numPages} page(s) with OCR...`);

    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      process.stdout.write(`\r  OCR Progress: Page ${pageNum}/${numPages}...`);

      // Get the page
      const page = await pdfDocument.getPage(pageNum);

      // Get viewport with 2x scale for better OCR accuracy
      const viewport = page.getViewport({ scale: 2.0 });

      // Create canvas with page dimensions
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      // Render page to canvas - pass context as any to avoid type issues with pdfjs-dist
      try {
        await (page.render as any)({ canvasContext: context, viewport }).promise;
      } catch (renderError) {
        const errorMessage = renderError instanceof Error ? renderError.message : 'Unknown error';
        throw new Error(`Failed to render PDF page ${pageNum}: ${errorMessage}`);
      }

      // Save canvas to temporary PNG file
      const tempImagePath = path.join(tmpDir, `page-${pageNum}.png`);
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(tempImagePath, buffer);

      // Run Tesseract OCR on the saved image file
      const { data } = await Tesseract.recognize(tempImagePath, 'eng');
      pageTexts.push(data.text);

      // Cleanup page
      page.cleanup();
    }

    console.log('\n'); // New line after progress

    // Cleanup PDF document
    await pdfDocument.destroy();

    // Combine text from all pages
    const combinedText = pageTexts.join('\n\n--- Page Break ---\n\n');

    return combinedText;
  } finally {
    // Clean up temporary directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Warning: Failed to clean up temporary files: ${errorMessage}`);
    }
  }
}

/**
 * Extract text from plain text files
 */
async function extractText(filePath: string, fileName: string): Promise<FileExtractionResult> {
  const text = await fs.readFile(filePath, 'utf8');

  return {
    text: text,
    fileType: 'text',
    fileName: fileName,
  };
}

/**
 * Extract text from Word documents
 */
async function extractWord(filePath: string, fileName: string): Promise<FileExtractionResult> {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
    fileType: 'docx',
    fileName: fileName,
  };
}

/**
 * Extract text from images using OCR
 */
async function extractImage(filePath: string, fileName: string): Promise<FileExtractionResult> {
  console.log('Performing OCR on image... This may take a moment.');

  const { data } = await Tesseract.recognize(filePath, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  console.log('\n'); // New line after progress

  return {
    text: data.text,
    fileType: 'image',
    fileName: fileName,
  };
}
