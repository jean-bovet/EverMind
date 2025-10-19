const { Ollama } = require('ollama');
const { ensureOllamaReady } = require('./ollama-manager');
const { createSpinner, success, colors } = require('./output-formatter');

/**
 * Analyze file content using Ollama AI to generate title, description and tags
 * @param {string} text - Extracted text from file
 * @param {string} fileName - Name of the file
 * @param {string} fileType - Type of file
 * @param {string[]} existingTags - Existing tags from Evernote (optional)
 * @param {boolean} debug - Enable debug output
 * @param {string} sourceFilePath - Path to source file (for debug output)
 * @returns {Promise<{title: string, description: string, tags: string[]}>}
 */
async function analyzeContent(text, fileName, fileType, existingTags = [], debug = false, sourceFilePath = null) {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'mistral';  // Default: mistral for French/English support
  const customInstructions = process.env.AI_CUSTOM_INSTRUCTIONS || '';

  // AI Model configuration parameters
  const temperature = parseFloat(process.env.OLLAMA_TEMPERATURE || '0');
  const numCtx = parseInt(process.env.OLLAMA_NUM_CTX || '4096', 10);

  // Ensure Ollama is installed, running, and has the required model
  await ensureOllamaReady(model, ollamaHost);

  const ollama = new Ollama({ host: ollamaHost });

  // Show analysis progress
  const spinner = createSpinner(`Analyzing content with Ollama (${colors.highlight(model)})`).start();

  // Truncate text if too long to avoid token limits
  const maxLength = 4000;
  const truncatedText = text.length > maxLength
    ? text.substring(0, maxLength) + '...[truncated]'
    : text;

  // Build prompt with conditional tag instructions
  const tagInstructions = existingTags.length > 0
    ? `2. Select 3-7 relevant tags from the EXISTING TAGS list below

EXISTING TAGS (you MUST choose ONLY from this list):
${existingTags.join(', ')}

IMPORTANT: You MUST select tags ONLY from the existing tags list above. Do NOT create new tags.`
    : `2. 5-7 relevant tags/keywords that categorize this content`;

  // Build custom instructions section
  const customSection = customInstructions
    ? `\n\nADDITIONAL INSTRUCTIONS:\n${customInstructions}\n`
    : '';

  const prompt = `You are analyzing a file named "${fileName}" of type "${fileType}".

CRITICAL INSTRUCTION: You MUST respond in the SAME LANGUAGE as the file content below. If the content is in French, write your entire response in French. If in English, write in English. Match the language exactly.

File content:
${truncatedText}
${customSection}
Please analyze this content and provide:
1. A single-sentence title that meaningfully describes this document (not the filename, but what it's about)
2. A description of what this file contains. Include important information such as: location, date, names, amounts, and other key details.
${tagInstructions}

Format your response as JSON:
{
  "title": "your meaningful title here",
  "description": "your description here",
  "tags": ["tag1", "tag2", "tag3"]
}

Respond ONLY with the JSON object, no additional text.`;

  // Save prompt if debug mode is enabled
  if (debug && sourceFilePath) {
    spinner.stop();
    const { saveDebugFile } = require('./debug-helper');
    await saveDebugFile(sourceFilePath, 'prompt', prompt);
    spinner.start();
  }

  try {
    const response = await ollama.generate({
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: temperature,      // Control randomness (0 = deterministic)
        num_ctx: numCtx,               // Context window size
        top_p: 0.9,                    // Nucleus sampling
        repeat_penalty: 1.1            // Prevent repetition
      }
    });

    // Save response if debug mode is enabled
    if (debug && sourceFilePath) {
      spinner.stop();
      const { saveDebugFile } = require('./debug-helper');
      await saveDebugFile(sourceFilePath, 'response', response.response);
    }

    // Parse the AI response
    const result = parseAIResponse(response.response);

    spinner.succeed('AI analysis completed successfully');

    return result;
  } catch (error) {
    spinner.fail('AI analysis failed');
    throw new Error(`Failed to analyze content with Ollama: ${error.message}`);
  }
}

/**
 * Parse AI response and extract title, description and tags
 * @param {string} response - Raw response from Ollama
 * @returns {{title: string, description: string, tags: string[]}}
 */
function parseAIResponse(response) {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        title: parsed.title || 'Untitled Document',
        description: parsed.description || 'No description provided',
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
      };
    }

    // Fallback: try to parse the entire response
    const parsed = JSON.parse(response);
    return {
      title: parsed.title || 'Untitled Document',
      description: parsed.description || 'No description provided',
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };

  } catch (error) {
    // If parsing fails, create a basic description from the response
    console.warn('Could not parse AI response as JSON, using fallback parsing.');

    return {
      title: 'Imported Document',
      description: response.substring(0, 200) || 'File content analyzed',
      tags: ['document', 'imported']
    };
  }
}

module.exports = {
  analyzeContent
};
