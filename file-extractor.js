const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const { createCanvas } = require('@napi-rs/canvas');

/**
 * Check if extracted text is insufficient (too short or empty)
 * @param {string} text - Text to validate
 * @returns {boolean} - True if text is insufficient
 */
function isTextInsufficient(text) {
  const cleaned = text.trim();

  // Empty or very short text
  if (cleaned.length < 10) {
    return true;
  }

  return false;
}

/**
 * Extract text content from various file types
 * @param {string} filePath - Path to the file
 * @returns {Promise<{text: string, fileType: string, fileName: string}>}
 */
async function extractFileContent(filePath) {
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
    throw new Error(`Failed to extract content from ${fileName}: ${error.message}`);
  }
}

/**
 * Extract text from PDF files
 */
async function extractPDF(filePath, fileName) {
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
        fileName: fileName
      };
    }

    return {
      text: extractedText,
      fileType: 'pdf',
      fileName: fileName
    };
  } finally {
    // Clean up parser resources
    await parser.destroy();
  }
}

/**
 * Extract text from PDF using OCR (for scanned/image-based PDFs)
 */
async function extractPDFWithOCR(filePath, fileName) {
  console.log('  Converting PDF pages to images for OCR...');

  // Create temporary directory for page images
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-ocr-'));

  try {
    // Load PDF using pdfjs-dist
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
    const dataBuffer = await fs.readFile(filePath);

    // Load the PDF document (convert Buffer to Uint8Array)
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
    const pdfDocument = await loadingTask.promise;

    const numPages = pdfDocument.numPages;
    console.log(`  Processing ${numPages} page(s) with OCR...`);

    const pageTexts = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      process.stdout.write(`\r  OCR Progress: Page ${pageNum}/${numPages}...`);

      // Get the page
      const page = await pdfDocument.getPage(pageNum);

      // Get viewport with 2x scale for better OCR accuracy
      const viewport = page.getViewport({ scale: 2.0 });

      // Create canvas with page dimensions
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      // Render page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      try {
        await page.render(renderContext).promise;
      } catch (renderError) {
        throw new Error(`Failed to render PDF page ${pageNum}: ${renderError.message}`);
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
      console.warn(`Warning: Failed to clean up temporary files: ${error.message}`);
    }
  }
}

/**
 * Extract text from plain text files
 */
async function extractText(filePath, fileName) {
  const text = await fs.readFile(filePath, 'utf8');

  return {
    text: text,
    fileType: 'text',
    fileName: fileName
  };
}

/**
 * Extract text from Word documents
 */
async function extractWord(filePath, fileName) {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
    fileType: 'docx',
    fileName: fileName
  };
}

/**
 * Extract text from images using OCR
 */
async function extractImage(filePath, fileName) {
  console.log('Performing OCR on image... This may take a moment.');

  const { data } = await Tesseract.recognize(filePath, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  console.log('\n'); // New line after progress

  return {
    text: data.text,
    fileType: 'image',
    fileName: fileName
  };
}

module.exports = {
  extractFileContent
};
