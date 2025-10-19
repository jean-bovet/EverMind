const { Ollama } = require('ollama');
const { ensureOllamaReady } = require('./ollama-manager');

/**
 * Analyze file content using Ollama AI to generate description and tags
 * @param {string} text - Extracted text from file
 * @param {string} fileName - Name of the file
 * @param {string} fileType - Type of file
 * @param {string[]} existingTags - Existing tags from Evernote (optional)
 * @returns {Promise<{description: string, tags: string[]}>}
 */
async function analyzeContent(text, fileName, fileType, existingTags = []) {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama2';

  // Ensure Ollama is installed, running, and has the required model
  await ensureOllamaReady(model, ollamaHost);

  const ollama = new Ollama({ host: ollamaHost });

  console.log(`Analyzing content with Ollama (${model})...`);

  // Truncate text if too long to avoid token limits
  const maxLength = 4000;
  const truncatedText = text.length > maxLength
    ? text.substring(0, maxLength) + '...[truncated]'
    : text;

  // Build prompt based on whether we have existing tags
  let prompt;

  if (existingTags.length > 0) {
    prompt = `You are analyzing a file named "${fileName}" of type "${fileType}".

File content:
${truncatedText}

Please analyze this content and provide:
1. A concise description (2-3 sentences) of what this file contains
2. Select 3-7 relevant tags from the EXISTING TAGS list below

EXISTING TAGS (you MUST choose ONLY from this list):
${existingTags.join(', ')}

IMPORTANT: You MUST select tags ONLY from the existing tags list above. Do NOT create new tags.

Format your response as JSON:
{
  "description": "your description here",
  "tags": ["existing-tag1", "existing-tag2", "existing-tag3"]
}

Respond ONLY with the JSON object, no additional text.`;
  } else {
    prompt = `You are analyzing a file named "${fileName}" of type "${fileType}".

File content:
${truncatedText}

Please analyze this content and provide:
1. A concise description (2-3 sentences) of what this file contains
2. 5-7 relevant tags/keywords that categorize this content

Format your response as JSON:
{
  "description": "your description here",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Respond ONLY with the JSON object, no additional text.`;
  }

  try {
    const response = await ollama.generate({
      model: model,
      prompt: prompt,
      stream: false
    });

    // Parse the AI response
    const result = parseAIResponse(response.response);

    console.log('AI analysis completed successfully.');

    return result;
  } catch (error) {
    throw new Error(`Failed to analyze content with Ollama: ${error.message}`);
  }
}

/**
 * Parse AI response and extract description and tags
 * @param {string} response - Raw response from Ollama
 * @returns {{description: string, tags: string[]}}
 */
function parseAIResponse(response) {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        description: parsed.description || 'No description provided',
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
      };
    }

    // Fallback: try to parse the entire response
    const parsed = JSON.parse(response);
    return {
      description: parsed.description || 'No description provided',
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };

  } catch (error) {
    // If parsing fails, create a basic description from the response
    console.warn('Could not parse AI response as JSON, using fallback parsing.');

    return {
      description: response.substring(0, 200) || 'File content analyzed',
      tags: ['document', 'imported']
    };
  }
}

module.exports = {
  analyzeContent
};
