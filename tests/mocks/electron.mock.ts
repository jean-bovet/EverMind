/**
 * Mock for Electron modules in tests
 * This allows tests to import modules that use Electron APIs
 */

import { vi } from 'vitest';
import path from 'path';
import os from 'os';

// Mock app.getPath to return a temp directory for tests
export const mockApp = {
  getPath: vi.fn((name: string) => {
    if (name === 'userData') {
      return path.join(os.tmpdir(), 'evermind-test-data');
    }
    return path.join(os.tmpdir(), 'evermind-test');
  }),
  isPackaged: false,
};

// Mock BrowserWindow
export const mockBrowserWindow = vi.fn();

// Mock the electron module
vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
}));
