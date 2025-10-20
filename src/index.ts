#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import { promises as fs } from 'fs';
import readline from 'readline';
import { extractFileContent } from './file-extractor.js';
import { analyzeContent } from './ai-analyzer.js';
import { listTags } from './evernote-client.js';
import {
  hasExistingJSON,
  saveNoteToJSON,
  uploadNoteFromJSON,
  retryPendingUploads,
  waitForPendingUploads,
  getPendingCount,
} from './upload-queue.js';
import { hasToken, authenticate, removeToken } from './oauth-helper.js';
import { stopOllama, wasOllamaStartedByUs } from './ollama-manager.js';
import {
  colors,
  stepHeader,
  formatTextPreview,
  formatAIResults,
  createSpinner,
  success,
  info,
  warning,
  error,
} from './output-formatter.js';
import { saveDebugFile } from './debug-helper.js';
import { filterExistingTags } from './tag-validator.js';

interface ProgramOptions {
  debug?: boolean;
  auth?: boolean;
  logout?: boolean;
  listTags?: boolean;
  keepOllama?: boolean;
}

interface ProcessingResults {
  totalFiles: number;
  processed: number;
  skipped: number;
  failed: Array<{ file: string; error: string }>;
  uploadsPending: number;
  uploadsSuccessful: number;
  uploadsFailed: number;
}

const program = new Command();

program
  .name('evernote-ai-importer')
  .description('Import files to Evernote with AI-generated descriptions and tags')
  .version('1.0.0')
  .argument('[file]', 'path to a file or folder to import')
  .option('--debug', 'save debug output (extracted text, prompt, response) next to source file')
  .option('--auth', 'authenticate with Evernote (first-time setup)')
  .option('--logout', 'remove stored authentication token')
  .option('--list-tags', 'list all existing tags from Evernote')
  .option('--keep-ollama', 'keep Ollama running after completion (default: auto-stop if we started it)')
  .action(async (filePath: string | undefined, options: ProgramOptions) => {
    try {
      // Handle authentication
      if (options.auth) {
        await authenticate();
        return;
      }

      // Handle logout
      if (options.logout) {
        await removeToken();
        console.log('\n✅ You have been logged out successfully.\n');
        return;
      }

      // Handle list tags
      if (options.listTags) {
        // Check authentication
        if (!(await hasToken())) {
          console.error('\n❌ Error: Not authenticated. Please run: node index.js --auth\n');
          process.exit(1);
        }

        console.log('\n📋 Fetching tags from Evernote...\n');
        const tags = await listTags();

        if (tags.length === 0) {
          console.log('No tags found in your Evernote account.\n');
        } else {
          console.log(`Found ${tags.length} tags:\n`);
          tags.sort().forEach((tag, index) => {
            console.log(`  ${index + 1}. ${tag}`);
          });
          console.log('');
        }
        return;
      }

      // Check if file/folder path is provided
      if (!filePath) {
        console.error('\n❌ Error: Please provide a file or folder path, or use --auth to authenticate\n');
        program.help();
        process.exit(1);
      }

      // Check authentication before importing
      if (!(await hasToken())) {
        console.error('\n❌ Error: Not authenticated. Please run: node index.js --auth\n');
        process.exit(1);
      }

      // Check if path is a file or folder
      const absolutePath = path.resolve(filePath);
      const stats = await fs.stat(absolutePath);

      if (stats.isDirectory()) {
        // Process folder batch
        await processFolderBatch(absolutePath, options.debug || false);
      } else if (stats.isFile()) {
        // Import single file
        await importFile(absolutePath, options.debug || false);
      } else {
        throw new Error(`Path is neither a file nor a directory: ${filePath}`);
      }

      // Cleanup: Stop Ollama if we started it and --keep-ollama is not set
      if (!options.keepOllama && wasOllamaStartedByUs()) {
        stopOllama();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`\n❌ Error: ${errorMessage}`);

      // Cleanup on error: Stop Ollama if we started it and --keep-ollama is not set
      if (!options.keepOllama && wasOllamaStartedByUs()) {
        stopOllama();
      }

      process.exit(1);
    }
  });

/**
 * Supported file extensions for processing
 */
const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.markdown', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'];

/**
 * Recursively scan folder for supported files
 * @param folderPath - Path to folder to scan
 */
async function scanFolderForFiles(folderPath: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath); // Recursive
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(folderPath);
  return files.sort(); // Sort for consistent ordering
}

/**
 * Get user confirmation via command line
 * @param prompt - Prompt message
 */
async function getUserConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const response = answer.trim().toLowerCase();
      resolve(response === 'y' || response === 'yes' || response === '');
    });
  });
}

/**
 * Process all files in a folder
 * @param folderPath - Path to folder
 * @param debug - Enable debug mode
 */
async function processFolderBatch(folderPath: string, debug: boolean = false): Promise<void> {
  const absolutePath = path.resolve(folderPath);
  const startTime = Date.now();

  console.log(`\n${colors.accent.bold('📁 Processing folder:')} ${colors.highlight(absolutePath)}\n`);

  // Scan for files
  const spinner = createSpinner('Scanning folder for supported files').start();
  const allFiles = await scanFolderForFiles(absolutePath);
  spinner.stop();

  // Filter out files that already have JSON (already processed)
  const filterSpinner = createSpinner('Filtering already processed files').start();
  const filesToProcess: string[] = [];
  const skippedFiles: string[] = [];

  for (const file of allFiles) {
    if (await hasExistingJSON(file)) {
      skippedFiles.push(file);
    } else {
      filesToProcess.push(file);
    }
  }
  filterSpinner.succeed(`Found ${colors.highlight(allFiles.length)} supported files (${colors.highlight(skippedFiles.length)} already processed)`);

  // Check for pending uploads
  const pendingCount = await getPendingCount(absolutePath);

  if (filesToProcess.length === 0 && pendingCount === 0) {
    console.log(`\n${info('No files to process and no pending uploads.')}\n`);
    return;
  }

  // Display file list
  if (filesToProcess.length > 0) {
    console.log(`\n${colors.info('Files to process:')}`);
    filesToProcess.forEach((file, index) => {
      const relativePath = path.relative(absolutePath, file);
      console.log(`  ${colors.muted((index + 1).toString().padStart(3))}. ${relativePath}`);
    });
  }

  if (pendingCount > 0) {
    console.log(`\n${colors.info(`📤 Pending uploads: ${colors.highlight(pendingCount)} files waiting to be uploaded`)}`);
  }

  // Get confirmation
  let confirmMessage = '';
  if (filesToProcess.length > 0 && pendingCount > 0) {
    confirmMessage = `\n${colors.accent(`Process ${filesToProcess.length} files and retry ${pendingCount} pending uploads? [Y/n]:`)} `;
  } else if (filesToProcess.length > 0) {
    confirmMessage = `\n${colors.accent(`Process ${filesToProcess.length} files? [Y/n]:`)} `;
  } else {
    confirmMessage = `\n${colors.accent(`Retry ${pendingCount} pending uploads? [Y/n]:`)} `;
  }

  const confirmed = await getUserConfirmation(confirmMessage);

  if (!confirmed) {
    console.log(`\n${info('Batch processing cancelled.')}\n`);
    return;
  }

  // Process files
  console.log('');
  const results: ProcessingResults = {
    totalFiles: allFiles.length,
    processed: 0,
    skipped: skippedFiles.length,
    failed: [],
    uploadsPending: 0,
    uploadsSuccessful: 0,
    uploadsFailed: 0,
  };

  try {
    // Fetch tags once for the entire batch (if we have files to process)
    let batchTags: string[] = [];
    if (filesToProcess.length > 0) {
      console.log(`\n${colors.accent.bold('🏷️  Fetching Tags')}\n`);
      const tagSpinner = createSpinner('Fetching existing tags from Evernote').start();

      try {
        batchTags = await listTags();
        tagSpinner.succeed(`Tags fetched successfully - Found ${colors.highlight(batchTags.length)} existing tags`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        tagSpinner.fail('Could not fetch tags');
        console.warn(warning(`Could not fetch existing tags: ${errorMessage}`));
        console.warn(warning('Will proceed without tag filtering.'));
      }
    }

    // Step 1: Retry pending uploads before processing new files
    if (pendingCount > 0) {
      console.log(`\n${colors.accent.bold('📤 Retrying Pending Uploads')}\n`);
      const retryStats = await retryPendingUploads(absolutePath);

      if (retryStats.attempted > 0) {
        console.log(`\n${colors.info(`Retry summary: ${retryStats.successful} successful, ${retryStats.rateLimited} rate-limited, ${retryStats.failed} failed`)}\n`);
      }
    }

    // Step 2: Process new files
    if (filesToProcess.length > 0) {
      console.log(`\n${colors.accent.bold('📝 Processing New Files')}\n`);

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        if (!file) continue;
        const relativePath = path.relative(absolutePath, file);

        console.log(`${colors.accent.bold(`[${i + 1}/${filesToProcess.length}]`)} ${colors.highlight(relativePath)}`);

        try {
          await importFile(file, debug, batchTags);
          results.processed++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          results.failed.push({ file: relativePath, error: errorMessage });
          console.error(`\n${colors.error('✗ Failed:')} ${errorMessage}\n`);
          // Don't stop processing on error - continue with next file
        }
      }
    }

    // Step 3: Wait for remaining pending uploads
    const remainingPending = await getPendingCount(absolutePath);
    if (remainingPending > 0) {
      console.log(`\n${colors.accent.bold('📤 Waiting for Pending Uploads')}\n`);
      console.log(`${colors.info(`${remainingPending} files queued for upload`)}\n`);

      const uploadResults = await waitForPendingUploads(absolutePath, 600000); // 10 min max
      results.uploadsSuccessful = uploadResults.successful;
      results.uploadsFailed = uploadResults.failed;
    }

  } finally {
    // Display summary (always shown, even if stopped early)
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const finalPending = await getPendingCount(absolutePath);

    console.log(`\n${'═'.repeat(80)}`);
    console.log(colors.accent.bold('📊 Batch Processing Summary'));
    console.log(`${'═'.repeat(80)}`);
    console.log(`${colors.info('Total files found:')}      ${colors.highlight(results.totalFiles)}`);
    console.log(`${colors.info('Files processed:')}        ${colors.highlight(results.processed)}`);
    console.log(`${colors.info('Files skipped:')}          ${colors.highlight(results.skipped)} ${colors.muted('(already processed)')}`);

    if (results.uploadsSuccessful > 0 || results.uploadsFailed > 0) {
      console.log(`${colors.success('✓ Uploads successful:')}   ${colors.highlight(results.uploadsSuccessful)}`);
      if (results.uploadsFailed > 0) {
        console.log(`${colors.error('✗ Uploads failed:')}       ${colors.highlight(results.uploadsFailed)}`);
      }
    }

    if (finalPending > 0) {
      console.log(`${colors.warning('⏳ Still pending:')}       ${colors.highlight(finalPending)} ${colors.muted('(will retry on next run)')}`);
    }

    if (results.failed.length > 0) {
      console.log(`${colors.error('✗ Processing failed:')}    ${colors.highlight(results.failed.length)}`);
    }

    console.log(`${colors.muted('Total time:')}            ${colors.highlight(totalTime + 's')}`);

    if (results.failed.length > 0) {
      console.log(`\n${colors.error('Failed files:')}`);
      results.failed.forEach(({ file, error: err }) => {
        console.log(`  ${colors.muted('•')} ${file}`);
        console.log(`    ${colors.error('Error:')} ${err}`);
      });
    }

    console.log('');
  }
}

/**
 * Main function to import a file to Evernote
 * @param filePath - Path to the file to import
 * @param debug - Enable debug mode
 * @param existingTags - Optional pre-fetched tags from Evernote (for batch processing)
 */
async function importFile(filePath: string, debug: boolean = false, existingTags?: string[]): Promise<void> {
  const absolutePath = path.resolve(filePath);
  const startTime = Date.now();

  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch (err) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Check if file has already been processed (has JSON)
  if (await hasExistingJSON(absolutePath)) {
    console.log(`\n${info('⏭  Skipping already processed file:')} ${colors.highlight(path.basename(filePath))}`);
    console.log(`   ${colors.muted('JSON file exists - file is queued for upload')}\n`);
    return;
  }

  console.log(`\n${colors.accent.bold('📄 Processing file:')} ${colors.highlight(path.basename(filePath))}\n`);

  // Show debug mode status if enabled
  if (debug) {
    console.log(`${colors.info('ℹ Debug mode enabled - saving intermediate files')}\n`);
  }

  // Step 1: Fetch existing tags from Evernote (if not already provided)
  let tags: string[] = existingTags || [];

  if (!existingTags) {
    console.log(stepHeader(1, 'Fetching Tags'));
    const spinner = createSpinner('Fetching existing tags from Evernote').start();

    try {
      tags = await listTags();
      spinner.succeed(`Tags fetched successfully - Found ${colors.highlight(tags.length)} existing tags`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      spinner.fail('Could not fetch tags');
      console.warn(warning(`Could not fetch existing tags: ${errorMessage}`));
      console.warn(warning('Will proceed without tag filtering.\n'));
    }
  } else {
    console.log(stepHeader(1, 'Using Tags'));
    console.log(`  ${colors.info('ℹ')} Using pre-fetched tags (${colors.highlight(tags.length)} available)\n`);
  }

  // Step 2: Extract file content
  console.log(stepHeader(2, 'Extracting Content'));
  const extractSpinner = createSpinner('Extracting file content').start();

  const { text, fileType, fileName } = await extractFileContent(absolutePath);

  extractSpinner.succeed('Content extracted successfully');

  // Save extracted text if debug mode is enabled
  if (debug) {
    await saveDebugFile(absolutePath, 'extracted', text);
  }

  console.log(`  Type: ${colors.highlight(fileType)}`);
  console.log(`  Size: ${colors.highlight(text.length + ' characters')}`);
  console.log('');
  console.log(formatTextPreview(text, fileType, 500));

  // Step 3: Analyze content with AI (using existing tags)
  console.log(stepHeader(3, 'Analyzing with AI'));

  const { title, description, tags: aiTags } = await analyzeContent(
    text,
    fileName,
    fileType,
    tags,
    debug,
    debug ? absolutePath : null
  );

  // Filter and validate tags against existing Evernote tags
  const { valid: validTags, rejected: rejectedTags } = filterExistingTags(aiTags, tags);

  // Warn if tags were filtered out
  if (rejectedTags.length > 0) {
    console.log(`\n  ${colors.warning('⚠ Rejected tags:')}`);
    rejectedTags.forEach(({ tag, reason }) => {
      console.log(`    ${colors.muted('•')} ${colors.highlight(tag)} - ${colors.muted(reason)}`);
    });
  }

  // Display AI results
  console.log(formatAIResults(title, description, validTags));

  // Step 4: Save to JSON and upload
  console.log(stepHeader(4, 'Saving & Uploading to Evernote'));

  // Ensure uploadResult properties are not undefined

  // Step 4a: Save note data to JSON
  const spinner2 = createSpinner('Saving note data to queue').start();
  const jsonPath = await saveNoteToJSON(absolutePath, {
    title: title,
    description: description,
    tags: validTags,
  });
  spinner2.succeed('Note data saved to queue');

  // Step 4b: Attempt upload
  const uploadSpinner = createSpinner('Uploading to Evernote').start();
  const uploadResult = await uploadNoteFromJSON(jsonPath);

  if (uploadResult.success) {
    uploadSpinner.succeed('Uploaded to Evernote successfully');

    // Final success message
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${success('Successfully imported to Evernote!')}`);
    const noteUrl = uploadResult.noteUrl ?? '';
    console.log(`   ${colors.info('Note URL:')} ${colors.highlight(noteUrl)}`);
    console.log(`   ${colors.muted('Total time:')} ${colors.highlight(totalTime + 's')}\n`);

  } else if (uploadResult.rateLimitDuration) {
    uploadSpinner.warn('Rate limit reached - queued for retry');

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${warning('File processed but upload rate-limited')}`);
    console.log(`   ${colors.info('Status:')} ${colors.highlight('Queued for upload')}`);
    console.log(`   ${colors.info('Retry in:')} ${colors.highlight(uploadResult.rateLimitDuration + 's')}`);
    console.log(`   ${colors.muted('Total time:')} ${colors.highlight(totalTime + 's')}\n`);

  } else {
    uploadSpinner.fail('Upload failed');

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMessage = uploadResult.error?.message || 'Unknown error';
    console.log(`\n${error('File processed but upload failed')}`);
    console.log(`   ${colors.error('Error:')} ${errorMessage}`);
    console.log(`   ${colors.info('Status:')} ${colors.highlight('Queued for retry')}`);
    console.log(`   ${colors.muted('Total time:')} ${colors.highlight(totalTime + 's')}\n`);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  console.error(`\n❌ Unexpected error: ${errorMessage}`);
  stopOllama();
  process.exit(1);
});

// Handle process termination signals
process.on('SIGINT', () => {
  console.log('\n\nInterrupted. Cleaning up...');
  stopOllama();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopOllama();
  process.exit(0);
});

program.parse();
