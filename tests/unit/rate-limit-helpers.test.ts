import { describe, it, expect } from 'vitest';
import {
  isRateLimitError,
  extractRateLimitDuration,
  formatDuration,
  parseRateLimitError
} from '../../electron/utils/rate-limit-helpers.js';

describe('rate-limit-helpers', () => {

  describe('isRateLimitError', () => {
    it('should detect rate limit errors from Error objects', () => {
      const error = new Error('Failed to get note: {"errorCode":19,"message":null,"rateLimitDuration":1052}');
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect rate limit errors from string', () => {
      const errorStr = '{"errorCode":19,"rateLimitDuration":60}';
      expect(isRateLimitError(errorStr)).toBe(true);
    });

    it('should detect rate limit errors with whitespace in JSON', () => {
      const errorStr = '{"errorCode": 19, "rateLimitDuration": 60}';
      expect(isRateLimitError(errorStr)).toBe(true);
    });

    it('should return false for non-rate-limit errors', () => {
      const error = new Error('Network error');
      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for different error codes', () => {
      const errorStr = '{"errorCode":400,"message":"Bad request"}';
      expect(isRateLimitError(errorStr)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isRateLimitError('')).toBe(false);
    });

    it('should return false for plain objects (not JSON strings)', () => {
      const errorObj = { errorCode: 19, rateLimitDuration: 60 };
      // String(obj) produces "[object Object]", not JSON
      expect(isRateLimitError(errorObj)).toBe(false);
    });

    it('should handle JSON-stringified objects', () => {
      const errorObj = { errorCode: 19, rateLimitDuration: 60 };
      const jsonError = JSON.stringify(errorObj);
      expect(isRateLimitError(jsonError)).toBe(true);
    });
  });

  describe('extractRateLimitDuration', () => {
    it('should extract duration from Error object', () => {
      const error = new Error('Failed to get note: {"errorCode":19,"message":null,"rateLimitDuration":1052}');
      expect(extractRateLimitDuration(error)).toBe(1052);
    });

    it('should extract duration from string', () => {
      const errorStr = '{"errorCode":19,"rateLimitDuration":60}';
      expect(extractRateLimitDuration(errorStr)).toBe(60);
    });

    it('should extract duration with whitespace', () => {
      const errorStr = '{"errorCode": 19, "rateLimitDuration": 3600}';
      expect(extractRateLimitDuration(errorStr)).toBe(3600);
    });

    it('should return null for non-rate-limit errors', () => {
      const error = new Error('Network error');
      expect(extractRateLimitDuration(error)).toBeNull();
    });

    it('should return null when duration is missing', () => {
      const errorStr = '{"errorCode":19}';
      expect(extractRateLimitDuration(errorStr)).toBeNull();
    });

    it('should return null for different error codes', () => {
      const errorStr = '{"errorCode":400,"rateLimitDuration":60}';
      expect(extractRateLimitDuration(errorStr)).toBeNull();
    });

    it('should handle duration at end of complex error message', () => {
      const error = new Error('Error invoking remote method \'get-note-content\': Error: Failed to get note: {"errorCode":19,"message":null,"rateLimitDuration":904}');
      expect(extractRateLimitDuration(error)).toBe(904);
    });

    it('should extract zero duration', () => {
      const errorStr = '{"errorCode":19,"rateLimitDuration":0}';
      expect(extractRateLimitDuration(errorStr)).toBe(0);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds only (less than 60)', () => {
      expect(formatDuration(30)).toBe('30 seconds');
      expect(formatDuration(1)).toBe('1 second');
      expect(formatDuration(59)).toBe('59 seconds');
    });

    it('should format exact minutes', () => {
      expect(formatDuration(60)).toBe('1 minute');
      expect(formatDuration(120)).toBe('2 minutes');
      expect(formatDuration(300)).toBe('5 minutes');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1 minute and 30 seconds');
      expect(formatDuration(125)).toBe('2 minutes and 5 seconds');
      expect(formatDuration(3661)).toBe('61 minutes and 1 second');
    });

    it('should handle pluralization correctly', () => {
      // Singular
      expect(formatDuration(1)).toBe('1 second');
      expect(formatDuration(60)).toBe('1 minute');
      expect(formatDuration(61)).toBe('1 minute and 1 second');

      // Plural
      expect(formatDuration(2)).toBe('2 seconds');
      expect(formatDuration(120)).toBe('2 minutes');
      expect(formatDuration(122)).toBe('2 minutes and 2 seconds');
    });

    it('should handle zero seconds', () => {
      expect(formatDuration(0)).toBe('0 seconds');
    });

    it('should handle negative numbers gracefully', () => {
      expect(formatDuration(-30)).toBe('0 seconds');
    });

    it('should format large durations', () => {
      expect(formatDuration(3600)).toBe('60 minutes');
      expect(formatDuration(3661)).toBe('61 minutes and 1 second');
      expect(formatDuration(7200)).toBe('120 minutes');
    });

    it('should handle edge case at 60 seconds boundary', () => {
      expect(formatDuration(59)).toBe('59 seconds');
      expect(formatDuration(60)).toBe('1 minute');
      expect(formatDuration(61)).toBe('1 minute and 1 second');
    });
  });

  describe('parseRateLimitError', () => {
    it('should parse rate limit error with seconds only', () => {
      const error = new Error('{"errorCode":19,"rateLimitDuration":30}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 30 seconds before trying again.');
    });

    it('should parse rate limit error with minutes and seconds', () => {
      const error = new Error('{"errorCode":19,"rateLimitDuration":904}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 15 minutes and 4 seconds before trying again.');
    });

    it('should parse rate limit error with exact minutes', () => {
      const error = new Error('{"errorCode":19,"rateLimitDuration":300}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 5 minutes before trying again.');
    });

    it('should handle complex error message', () => {
      const error = new Error('Error invoking remote method \'list-notes-in-notebook\': Error: Failed to list notes in notebook: {"errorCode":19,"message":null,"rateLimitDuration":1701}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 28 minutes and 21 seconds before trying again.');
    });

    it('should return null for non-rate-limit errors', () => {
      const error = new Error('Network error');
      expect(parseRateLimitError(error)).toBeNull();
    });

    it('should return null for different error codes', () => {
      const error = new Error('{"errorCode":400,"message":"Bad request"}');
      expect(parseRateLimitError(error)).toBeNull();
    });

    it('should handle string errors', () => {
      const errorStr = '{"errorCode":19,"rateLimitDuration":60}';
      expect(parseRateLimitError(errorStr)).toBe('Rate limit exceeded. Please wait 1 minute before trying again.');
    });

    it('should handle zero duration', () => {
      const error = new Error('{"errorCode":19,"rateLimitDuration":0}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 0 seconds before trying again.');
    });

    it('should handle 1 second (singular)', () => {
      const error = new Error('{"errorCode":19,"rateLimitDuration":1}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 1 second before trying again.');
    });

    it('should handle real-world error format from Evernote', () => {
      const error = new Error('Failed to get note: {"errorCode":19,"message":null,"rateLimitDuration":1052}');
      expect(parseRateLimitError(error)).toBe('Rate limit exceeded. Please wait 17 minutes and 32 seconds before trying again.');
    });
  });

});
