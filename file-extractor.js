const fs = require('fs').promises;
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

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
    // Extract text from PDF
    const result = await parser.getText();

    return {
      text: result.text,
      fileType: 'pdf',
      fileName: fileName
    };
  } finally {
    // Clean up parser resources
    await parser.destroy();
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
