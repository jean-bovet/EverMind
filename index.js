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
  .argument('[file]', 'path to the file to import')
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

      // Check if file path is provided
      if (!filePath) {
        console.error('\n❌ Error: Please provide a file path or use --auth to authenticate\n');
        program.help();
        process.exit(1);
      }

      // Check authentication before importing
      if (!(await hasToken())) {
        console.error('\n❌ Error: Not authenticated. Please run: node index.js --auth\n');
        process.exit(1);
      }

      // Import the file
      await importFile(filePath, options.debug);

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

  const { description, tags: aiTags } = await analyzeContent(text, fileName, fileType, existingTags, debug, absolutePath);

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
  console.log(formatAIResults(description, validTags));

  // Step 4: Create Evernote note
  console.log(stepHeader(4, 'Creating Evernote Note'));

  const noteUrl = await createNote(absolutePath, fileName, description, validTags);

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
