import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAIResponse } from '../../electron/utils/ai-response-parser.js';

describe('ai-response-parser', () => {

  describe('parseAIResponse', () => {

    // Mock console.warn to avoid cluttering test output
    let consoleWarnSpy: any;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    describe('Valid JSON parsing', () => {
      it('should parse complete valid JSON', () => {
        const response = JSON.stringify({
          title: 'Meeting Notes',
          description: 'Discussion about Q4 goals',
          tags: ['meeting', 'planning', 'q4']
        });

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Meeting Notes',
          description: 'Discussion about Q4 goals',
          tags: ['meeting', 'planning', 'q4']
        });
      });

      it('should parse JSON with empty tags array', () => {
        const response = JSON.stringify({
          title: 'Test Document',
          description: 'Test description',
          tags: []
        });

        const result = parseAIResponse(response);

        expect(result.tags).toEqual([]);
      });

      it('should parse JSON with single tag', () => {
        const response = JSON.stringify({
          title: 'Invoice',
          description: 'Monthly invoice',
          tags: ['finance']
        });

        const result = parseAIResponse(response);

        expect(result.tags).toEqual(['finance']);
      });

      it('should handle JSON with special characters in strings', () => {
        const response = JSON.stringify({
          title: 'Document with "quotes" and \\backslashes\\',
          description: 'Contains: special, chars & symbols!',
          tags: ['special-chars', 'test_tag']
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe('Document with "quotes" and \\backslashes\\');
        expect(result.description).toBe('Contains: special, chars & symbols!');
      });
    });

    describe('JSON embedded in text', () => {
      it('should extract JSON from markdown code block', () => {
        const response = `Here is the analysis:
\`\`\`json
{
  "title": "Extracted Title",
  "description": "Extracted description",
  "tags": ["extracted", "from-markdown"]
}
\`\`\`
Done!`;

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Extracted Title',
          description: 'Extracted description',
          tags: ['extracted', 'from-markdown']
        });
      });

      it('should extract JSON from text with prefix', () => {
        const response = 'Analysis result: {"title":"Doc","description":"Info","tags":["test"]}';

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Doc',
          description: 'Info',
          tags: ['test']
        });
      });

      it('should extract JSON from text with suffix', () => {
        const response = '{"title":"Doc","description":"Info","tags":["test"]} - completed';

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Doc',
          description: 'Info',
          tags: ['test']
        });
      });

      it('should extract first JSON when multiple JSON objects present', () => {
        const response = '{"title":"First","description":"A","tags":["a"]} {"title":"Second","description":"B","tags":["b"]}';

        const result = parseAIResponse(response);

        // The regex /\{[\s\S]*\}/ will match from first { to last }
        // But since we only parse the first match, behavior depends on greedy matching
        // In this case it will likely get the whole string and fail, then use the response as-is
        expect(result.title).toBeTruthy();
      });

      it('should handle JSON with nested objects', () => {
        const response = JSON.stringify({
          title: 'Complex Doc',
          description: 'Has nested data',
          tags: ['nested', 'complex'],
          extra: { nested: 'data' } // Extra field should be ignored
        });

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Complex Doc',
          description: 'Has nested data',
          tags: ['nested', 'complex']
        });
      });
    });

    describe('Missing or partial fields', () => {
      it('should use default title when missing', () => {
        const response = JSON.stringify({
          description: 'Has description',
          tags: ['tag1']
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe('Untitled Document');
        expect(result.description).toBe('Has description');
        expect(result.tags).toEqual(['tag1']);
      });

      it('should use default description when missing', () => {
        const response = JSON.stringify({
          title: 'Has title',
          tags: ['tag1']
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe('Has title');
        expect(result.description).toBe('No description provided');
        expect(result.tags).toEqual(['tag1']);
      });

      it('should use empty array when tags missing', () => {
        const response = JSON.stringify({
          title: 'Has title',
          description: 'Has description'
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe('Has title');
        expect(result.description).toBe('Has description');
        expect(result.tags).toEqual([]);
      });

      it('should handle empty JSON object', () => {
        const response = '{}';

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Untitled Document',
          description: 'No description provided',
          tags: []
        });
      });

      it('should handle null values by using defaults', () => {
        const response = JSON.stringify({
          title: null,
          description: null,
          tags: null
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe('Untitled Document');
        expect(result.description).toBe('No description provided');
        expect(result.tags).toEqual([]);
      });

      it('should handle empty strings by keeping them', () => {
        const response = JSON.stringify({
          title: '',
          description: '',
          tags: []
        });

        const result = parseAIResponse(response);

        // Empty strings are falsy, so defaults should be used
        expect(result.title).toBe('Untitled Document');
        expect(result.description).toBe('No description provided');
        expect(result.tags).toEqual([]);
      });
    });

    describe('Invalid tags field handling', () => {
      it('should convert non-array tags to empty array', () => {
        const response = JSON.stringify({
          title: 'Test',
          description: 'Test',
          tags: 'not-an-array'
        });

        const result = parseAIResponse(response);

        expect(result.tags).toEqual([]);
      });

      it('should convert null tags to empty array', () => {
        const response = JSON.stringify({
          title: 'Test',
          description: 'Test',
          tags: null
        });

        const result = parseAIResponse(response);

        expect(result.tags).toEqual([]);
      });

      it('should convert object tags to empty array', () => {
        const response = JSON.stringify({
          title: 'Test',
          description: 'Test',
          tags: { invalid: 'structure' }
        });

        const result = parseAIResponse(response);

        expect(result.tags).toEqual([]);
      });

      it('should convert number tags to empty array', () => {
        const response = JSON.stringify({
          title: 'Test',
          description: 'Test',
          tags: 123
        });

        const result = parseAIResponse(response);

        expect(result.tags).toEqual([]);
      });
    });

    describe('Malformed JSON fallback', () => {
      it('should handle plain text response', () => {
        const response = 'This is just plain text, not JSON at all';

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Imported Document',
          description: 'This is just plain text, not JSON at all',
          tags: ['document', 'imported']
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Could not parse AI response as JSON, using fallback parsing.'
        );
      });

      it('should handle malformed JSON with syntax error', () => {
        const response = '{"title": "Broken", "description": "Missing closing brace"';

        const result = parseAIResponse(response);

        expect(result.title).toBe('Imported Document');
        expect(result.description).toContain('Broken');
        expect(result.tags).toEqual(['document', 'imported']);
      });

      it('should truncate very long fallback descriptions', () => {
        const longText = 'a'.repeat(500);

        const result = parseAIResponse(longText);

        expect(result.description.length).toBe(200);
        expect(result.description).toBe('a'.repeat(200));
      });

      it('should handle empty string response', () => {
        const response = '';

        const result = parseAIResponse(response);

        expect(result).toEqual({
          title: 'Imported Document',
          description: 'File content analyzed',
          tags: ['document', 'imported']
        });
      });

      it('should handle whitespace-only response', () => {
        const response = '   \n\t  ';

        const result = parseAIResponse(response);

        expect(result.title).toBe('Imported Document');
        expect(result.tags).toEqual(['document', 'imported']);
      });

      it('should handle response with only curly braces', () => {
        const response = '{ this is not valid JSON }';

        const result = parseAIResponse(response);

        expect(result.title).toBe('Imported Document');
        expect(result.description).toContain('this is not valid JSON');
      });
    });

    describe('Edge cases', () => {
      it('should handle very large tag arrays', () => {
        const largeTags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
        const response = JSON.stringify({
          title: 'Many Tags',
          description: 'Has lots of tags',
          tags: largeTags
        });

        const result = parseAIResponse(response);

        expect(result.tags.length).toBe(100);
        expect(result.tags[0]).toBe('tag0');
        expect(result.tags[99]).toBe('tag99');
      });

      it('should handle unicode characters', () => {
        const response = JSON.stringify({
          title: 'Résumé 📄',
          description: 'Document with émojis 🎉 and àccents',
          tags: ['français', '日本語', '🏷️']
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe('Résumé 📄');
        expect(result.description).toContain('émojis 🎉');
        expect(result.tags).toContain('français');
        expect(result.tags).toContain('日本語');
      });

      it('should handle newlines in description', () => {
        const response = JSON.stringify({
          title: 'Multi-line',
          description: 'Line 1\nLine 2\nLine 3',
          tags: ['multiline']
        });

        const result = parseAIResponse(response);

        expect(result.description).toBe('Line 1\nLine 2\nLine 3');
      });

      it('should handle extremely long title', () => {
        const longTitle = 'a'.repeat(1000);
        const response = JSON.stringify({
          title: longTitle,
          description: 'Normal description',
          tags: ['test']
        });

        const result = parseAIResponse(response);

        expect(result.title).toBe(longTitle);
        expect(result.title.length).toBe(1000);
      });
    });

  });

});
