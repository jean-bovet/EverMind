import { Ollama } from 'ollama';
import { ensureOllamaReady } from './ollama-manager.js';
import { createSpinner, colors } from './output-formatter.js';
import { saveDebugFile } from './debug-helper.js';
import { parseAIResponse, type AIAnalysisResult } from './utils/ai-response-parser.js';

export type { AIAnalysisResult };

/**
 * Analyze file content using Ollama AI to generate title, description and tags
 * @param text - Extracted text from file
 * @param fileName - Name of the file
 * @param fileType - Type of file
 * @param existingTags - Existing tags from Evernote (optional)
 * @param debug - Enable debug output
 * @param sourceFilePath - Path to source file (for debug output)
 */
export async function analyzeContent(
  text: string,
  fileName: string,
  fileType: string,
  existingTags: string[] = [],
  debug: boolean = false,
  sourceFilePath: string | null = null
): Promise<AIAnalysisResult> {
  const ollamaHost = process.env['OLLAMA_HOST'] || 'http://localhost:11434';
  const model = process.env['OLLAMA_MODEL'] || 'mistral';  // Default: mistral for French/English support
  const customInstructions = process.env['AI_CUSTOM_INSTRUCTIONS'] || '';

  // AI Model configuration parameters
  const temperature = parseFloat(process.env['OLLAMA_TEMPERATURE'] || '0');
  const numCtx = parseInt(process.env['OLLAMA_NUM_CTX'] || '4096', 10);

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
        repeat_penalty: 1.1,            // Prevent repetition
      },
    });

    // Save response if debug mode is enabled
    if (debug && sourceFilePath) {
      spinner.stop();
      await saveDebugFile(sourceFilePath, 'response', response.response);
    }

    // Parse the AI response
    const result = parseAIResponse(response.response);

    spinner.succeed('AI analysis completed successfully');

    return result;
  } catch (error) {
    spinner.fail('AI analysis failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to analyze content with Ollama: ${errorMessage}`);
  }
}

