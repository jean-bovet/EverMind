/**
 * Pure functions for parsing AI responses
 * Handles JSON extraction and fallback strategies
 */

export interface AIAnalysisResult {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Parse AI response and extract title, description and tags
 * Pure function with multiple fallback strategies for robust parsing
 *
 * @param response - Raw response from AI model
 * @returns Parsed analysis result with defaults for missing fields
 *
 * @example
 * // Valid JSON
 * parseAIResponse('{"title":"Test","description":"Desc","tags":["a"]}')
 * // => { title: 'Test', description: 'Desc', tags: ['a'] }
 *
 * @example
 * // JSON embedded in text
 * parseAIResponse('Here is the result: {"title":"Test","description":"Desc","tags":["a"]} done')
 * // => { title: 'Test', description: 'Desc', tags: ['a'] }
 *
 * @example
 * // Malformed JSON
 * parseAIResponse('This is not JSON')
 * // => { title: 'Imported Document', description: 'This is not JSON', tags: ['document', 'imported'] }
 */
export function parseAIResponse(response: string): AIAnalysisResult {
  try {
    // Strategy 1: Try to find JSON embedded in response (handles markdown code blocks, extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<AIAnalysisResult>;

      return {
        title: parsed.title || 'Untitled Document',
        description: parsed.description || 'No description provided',
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      };
    }

    // Strategy 2: Try to parse entire response as JSON
    const parsed = JSON.parse(response) as Partial<AIAnalysisResult>;
    return {
      title: parsed.title || 'Untitled Document',
      description: parsed.description || 'No description provided',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };

  } catch (error) {
    // Strategy 3: Fallback for completely unparseable responses
    // Use the raw text as description with default metadata
    console.warn('Could not parse AI response as JSON, using fallback parsing.');

    return {
      title: 'Imported Document',
      description: response.substring(0, 200) || 'File content analyzed',
      tags: ['document', 'imported'],
    };
  }
}
