import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: [
      './tests/mocks/electron.mock.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['electron/**/*.ts'],
      exclude: [
        'electron/**/*.d.ts',
        'electron/main.ts', // Electron entry point, tested via E2E
        'electron/preload.ts', // Preload script, tested via E2E
        'electron/ollama-detector.ts', // External dependency, tested separately
        'electron/renderer/**/*', // React components, tested via E2E
        'tests/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 30000, // 30 seconds for tests that use Ollama
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './electron'),
      // Redirect runtime-config imports to mock values for tests
      // This handles the missing runtime-config.ts file in CI
      '../config/runtime-config.js': path.resolve(__dirname, './tests/mocks/runtime-config-values.ts'),
      '../../config/runtime-config.js': path.resolve(__dirname, './tests/mocks/runtime-config-values.ts'),
    },
  },
});
