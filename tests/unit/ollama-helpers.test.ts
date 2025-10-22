import { describe, it, expect } from 'vitest';
import {
  getOllamaStatusText,
  getOllamaStatusClass,
  type OllamaStatus
} from '../../electron/utils/ollama-helpers.js';

describe('ollama-helpers', () => {

  describe('getOllamaStatusText', () => {
    it('should return "Running" when Ollama is running', () => {
      const status: OllamaStatus = { installed: true, running: true };
      expect(getOllamaStatusText(status)).toBe('Running');
    });

    it('should return "Installed" when installed but not running', () => {
      const status: OllamaStatus = { installed: true, running: false };
      expect(getOllamaStatusText(status)).toBe('Installed');
    });

    it('should return "Not Installed" when not installed', () => {
      const status: OllamaStatus = { installed: false, running: false };
      expect(getOllamaStatusText(status)).toBe('Not Installed');
    });

    it('should return "Unknown" when status is null', () => {
      expect(getOllamaStatusText(null)).toBe('Unknown');
    });

    it('should prioritize running status', () => {
      const status: OllamaStatus = { installed: true, running: true, version: '0.1.0' };
      expect(getOllamaStatusText(status)).toBe('Running');
    });
  });

  describe('getOllamaStatusClass', () => {
    it('should return "running" when Ollama is running', () => {
      const status: OllamaStatus = { installed: true, running: true };
      expect(getOllamaStatusClass(status)).toBe('running');
    });

    it('should return "stopped" when not running', () => {
      const status: OllamaStatus = { installed: true, running: false };
      expect(getOllamaStatusClass(status)).toBe('stopped');
    });

    it('should return "stopped" when null', () => {
      expect(getOllamaStatusClass(null)).toBe('stopped');
    });

    it('should return "stopped" when not installed', () => {
      const status: OllamaStatus = { installed: false, running: false };
      expect(getOllamaStatusClass(status)).toBe('stopped');
    });
  });

});
