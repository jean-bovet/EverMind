#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const path = require('path');
const fs = require('fs').promises;
const { extractFileContent } = require('./file-extractor');
const { analyzeContent } = require('./ai-analyzer');
const { createNote, listTags } = require('./evernote-client');
const { hasToken, authenticate, removeToken } = require('./oauth-helper');
const { stopOllama, wasOllamaStartedByUs } = require('./ollama-manager');
const {
  colors,
  stepHeader,
  formatTextPreview,
  formatAIResults,
  createSpinner,
  success,
  info,
  warning,
  error
} = require('./output-formatter');

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
  .action(async (filePath, options) => {
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
        await processFolderBatch(absolutePath, options.debug);
      } else if (stats.isFile()) {
        // Import single file
        await importFile(absolutePath, options.debug);
      } else {
        throw new Error(`Path is neither a file nor a directory: ${filePath}`);
      }

      // Cleanup: Stop Ollama if we started it and --keep-ollama is not set
      if (!options.keepOllama && wasOllamaStartedByUs()) {
        stopOllama();
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);

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
 * @param {string} folderPath - Path to folder to scan
 * @returns {Promise<string[]>} - Array of absolute file paths
 */
async function scanFolderForFiles(folderPath) {
  const files = [];

  async function scan(dir) {
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
 * @param {string} prompt - Prompt message
 * @returns {Promise<boolean>} - True if user confirms
 */
async function getUserConfirmation(prompt) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
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
 * @param {string} folderPath - Path to folder
 * @param {boolean} debug - Enable debug mode
 */
async function processFolderBatch(folderPath, debug = false) {
  const absolutePath = path.resolve(folderPath);
  const startTime = Date.now();

  console.log(`\n${colors.accent.bold('📁 Processing folder:')} ${colors.highlight(absolutePath)}\n`);

  // Scan for files
  const spinner = createSpinner('Scanning folder for supported files').start();
  const files = await scanFolderForFiles(absolutePath);
  spinner.succeed(`Found ${colors.highlight(files.length)} supported files`);

  if (files.length === 0) {
    console.log(`\n${warning('No supported files found in folder.')}\n`);
    return;
  }

  // Display file list
  console.log(`\n${colors.info('Files to process:')}`);
  files.forEach((file, index) => {
    const relativePath = path.relative(absolutePath, file);
    console.log(`  ${colors.muted((index + 1).toString().padStart(3))}. ${relativePath}`);
  });

  // Get confirmation
  const confirmed = await getUserConfirmation(`\n${colors.accent('Process ' + files.length + ' files? [Y/n]:')} `);

  if (!confirmed) {
    console.log(`\n${info('Batch processing cancelled.')}\n`);
    return;
  }

  // Process files
  console.log('');
  const results = {
    total: files.length,
    successful: 0,
    failed: [],
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = path.relative(absolutePath, file);

    console.log(`\n${colors.accent.bold(`[${ i + 1}/${files.length}]`)} ${colors.highlight(relativePath)}`);

    try {
      await importFile(file, debug);
      results.successful++;
    } catch (error) {
      results.failed.push({ file: relativePath, error: error.message });
      console.error(`\n${colors.error('✗ Failed:')} ${error.message}\n`);
    }
  }

  // Display summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${'═'.repeat(80)}`);
  console.log(colors.accent.bold('📊 Batch Processing Summary'));
  console.log(`${'═'.repeat(80)}`);
  console.log(`${colors.info('Total files:')}      ${colors.highlight(results.total)}`);
  console.log(`${colors.success('✓ Successful:')}   ${colors.highlight(results.successful)}`);
  console.log(`${colors.error('✗ Failed:')}        ${colors.highlight(results.failed.length)}`);
  console.log(`${colors.muted('Total time:')}     ${colors.highlight(totalTime + 's')}`);

  if (results.failed.length > 0) {
    console.log(`\n${colors.error('Failed files:')}`);
    results.failed.forEach(({ file, error }) => {
      console.log(`  ${colors.muted('•')} ${file}`);
      console.log(`    ${colors.error('Error:')} ${error}`);
    });
  }

  console.log('');
}

/**
 * Main function to import a file to Evernote
 */
async function importFile(filePath, debug = false) {
  const absolutePath = path.resolve(filePath);
  const startTime = Date.now();

  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch (error) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`\n${colors.accent.bold('📄 Processing file:')} ${colors.highlight(path.basename(filePath))}\n`);

  // Show debug mode status if enabled
  if (debug) {
    console.log(`${colors.info('ℹ Debug mode enabled - saving intermediate files')}\n`);
  }

  // Step 1: Fetch existing tags from Evernote
  console.log(stepHeader(1, 'Fetching Tags'));
  const spinner = createSpinner('Fetching existing tags from Evernote').start();

  let existingTags = [];
  try {
    existingTags = await listTags();
    spinner.succeed(`Tags fetched successfully - Found ${colors.highlight(existingTags.length)} existing tags`);
  } catch (error) {
    spinner.fail('Could not fetch tags');
    console.warn(warning(`Could not fetch existing tags: ${error.message}`));
    console.warn(warning('Will proceed without tag filtering.\n'));
  }

  // Step 2: Extract file content
  console.log(stepHeader(2, 'Extracting Content'));
  spinner.start('Extracting file content');

  const { text, fileType, fileName } = await extractFileContent(absolutePath);

  spinner.succeed('Content extracted successfully');

  // Save extracted text if debug mode is enabled
  if (debug) {
    const { saveDebugFile } = require('./debug-helper');
    await saveDebugFile(absolutePath, 'extracted', text);
  }

  console.log(`  Type: ${colors.highlight(fileType)}`);
  console.log(`  Size: ${colors.highlight(text.length + ' characters')}`);
  console.log('');
  console.log(formatTextPreview(text, fileType, 500));

  // Step 3: Analyze content with AI (using existing tags)
  console.log(stepHeader(3, 'Analyzing with AI'));

  const { title, description, tags: aiTags } = await analyzeContent(text, fileName, fileType, existingTags, debug, absolutePath);

  // Filter to ensure only existing tags are used
  const validTags = existingTags.length > 0
    ? aiTags.filter(tag => existingTags.includes(tag))
    : aiTags;

  // Warn if tags were filtered out
  if (existingTags.length > 0 && validTags.length < aiTags.length) {
    const filteredTags = aiTags.filter(tag => !existingTags.includes(tag));
    console.log(`  Filtered out non-existing tags: ${filteredTags.join(', ')}`);
  }

  // Display AI results
  console.log(formatAIResults(title, description, validTags));

  // Step 4: Create Evernote note
  console.log(stepHeader(4, 'Creating Evernote Note'));

  const noteUrl = await createNote(absolutePath, title, description, validTags);

  // Final success message
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${success('Successfully imported to Evernote!')}`);
  console.log(`   ${colors.info('Note URL:')} ${colors.highlight(noteUrl)}`);
  console.log(`   ${colors.muted('Total time:')} ${colors.highlight(totalTime + 's')}\n`);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error(`\n❌ Unexpected error: ${error.message}`);
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
