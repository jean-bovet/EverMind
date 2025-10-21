import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                '@napi-rs/canvas',
                'pdfjs-dist',
                'tesseract.js',
                'mammoth',
                'pdf-parse',
                'evernote',
                'ollama'
              ]
            }
          }
        }
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        onstart(options) {
          // Reload preload on change
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    electronRenderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron')
    }
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    rollupOptions: {
      external: [
        // Exclude native modules from renderer bundle
        '@napi-rs/canvas',
        'canvas'
      ]
    }
  },
  server: {
    port: 5173
  },
  optimizeDeps: {
    exclude: [
      '@napi-rs/canvas',
      'pdfjs-dist',
      'tesseract.js',
      'mammoth',
      'pdf-parse',
      'evernote',
      'ollama'
    ]
  }
});
