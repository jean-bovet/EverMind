import { app, BrowserWindow, shell, dialog } from 'electron';
import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  location?: string;
  models?: string[];
}

export class OllamaDetector {
  private ollamaPath?: string;
  private ollamaProcess?: ReturnType<typeof spawn>;

  /**
   * Check if Ollama is installed and running
   * Tries API first (fastest), then CLI detection
   */
  async checkInstallation(): Promise<OllamaStatus> {
    const status: OllamaStatus = {
      installed: false,
      running: false
    };

    // First, check if Ollama API is responding (fastest check)
    status.running = await this.isRunning();

    if (status.running) {
      // If API works, Ollama is installed and running
      status.installed = true;
      status.models = await this.listModels();
    }

    // If API didn't respond, check for CLI installation
    if (!status.installed) {
      const cliCheck = await this.checkCLI();
      if (cliCheck.found) {
        status.installed = true;
        status.location = cliCheck.path;
        status.version = cliCheck.version;
        this.ollamaPath = cliCheck.path;
      }
    }

    return status;
  }

  /**
   * Check for Ollama CLI in common locations
   */
  private async checkCLI(): Promise<{ found: boolean; path?: string; version?: string }> {
    // Try running ollama command (works if in PATH)
    try {
      const { stdout } = await execAsync('ollama --version');
      const version = stdout.trim();

      // Find actual path
      const { stdout: whichOutput } = await execAsync(
        process.platform === 'win32' ? 'where ollama' : 'which ollama'
      );
      const path = whichOutput.trim().split('\n')[0];

      return { found: true, path, version };
    } catch {
      // Not in PATH, check common locations
      const locations = [
        '/usr/local/bin/ollama',
        '/opt/homebrew/bin/ollama',
        '/Applications/Ollama.app/Contents/Resources/ollama'
      ];

      for (const location of locations) {
        try {
          await fs.access(location);
          const { stdout } = await execAsync(`${location} --version`);
          return { found: true, path: location, version: stdout.trim() };
        } catch {
          continue;
        }
      }
    }

    return { found: false };
  }

  /**
   * Check if Ollama is currently running
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Start Ollama if not running
   */
  async startOllama(): Promise<boolean> {
    if (!this.ollamaPath) {
      throw new Error('Ollama not found. Please install Ollama first.');
    }

    if (await this.isRunning()) {
      return true;
    }

    return new Promise((resolve) => {
      this.ollamaProcess = spawn(this.ollamaPath!, ['serve'], {
        detached: true,
        stdio: 'ignore'
      });

      this.ollamaProcess.unref();

      // Wait for Ollama to be ready
      const checkInterval = setInterval(async () => {
        if (await this.isRunning()) {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 1000);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 10000);
    });
  }

  /**
   * List installed models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.map(m => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific model is installed
   */
  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.startsWith(modelName));
  }

  /**
   * Download a model with progress tracking
   */
  async downloadModel(
    modelName: string,
    progressCallback: (progress: number, status: string) => void
  ): Promise<boolean> {
    if (!this.ollamaPath) {
      throw new Error('Ollama not found');
    }

    if (!(await this.isRunning())) {
      await this.startOllama();
    }

    return new Promise((resolve, reject) => {
      const pullProcess = spawn(this.ollamaPath!, ['pull', modelName]);

      let currentProgress = 0;

      pullProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        progressCallback(currentProgress, output);

        // Parse progress from output
        const progressMatch = output.match(/(\d+)%/);
        if (progressMatch) {
          currentProgress = parseInt(progressMatch[1]!);
        }
      });

      pullProcess.on('close', (code) => {
        if (code === 0) {
          progressCallback(100, 'Download complete');
          resolve(true);
        } else {
          reject(new Error(`Failed to download model: exit code ${code}`));
        }
      });

      pullProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Prompt user to install Ollama with official installer
   * Opens download page and provides clear instructions
   */
  async promptInstall(): Promise<boolean> {
    const platform = process.platform;
    const downloadUrl = platform === 'darwin'
      ? 'https://ollama.com/download/mac'
      : platform === 'win32'
      ? 'https://ollama.com/download/windows'
      : 'https://ollama.com/download/linux';

    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Ollama Required',
      message: 'Ollama is required to run local AI models',
      detail: `Ollama needs to be installed to analyze files with AI.\n\n` +
              `Size: ~500MB download\n` +
              `Privacy: All processing happens locally on your machine\n\n` +
              `Click "Download" to open the official Ollama download page.`,
      buttons: ['Download', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      // Open official download page
      await shell.openExternal(downloadUrl);

      // Show follow-up instructions
      await dialog.showMessageBox({
        type: 'info',
        title: 'Installation Instructions',
        message: 'Installing Ollama',
        detail: platform === 'darwin'
          ? `1. Download the .dmg file from your browser\n` +
            `2. Open the downloaded file\n` +
            `3. Drag Ollama to Applications\n` +
            `4. Open Ollama from Applications\n` +
            `5. Come back here and we'll continue setup`
          : platform === 'win32'
          ? `1. Download the installer from your browser\n` +
            `2. Run the installer\n` +
            `3. Follow the installation wizard\n` +
            `4. Come back here and we'll continue setup`
          : `1. Follow the installation instructions on the download page\n` +
            `2. Or run: curl -fsSL https://ollama.com/install.sh | sh\n` +
            `3. Come back here and we'll continue setup`,
        buttons: ['OK']
      });

      return true;
    }

    return false;
  }

  /**
   * Cleanup on app exit
   */
  cleanup(): void {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill();
    }
  }
}

// Singleton instance
let ollamaDetector: OllamaDetector | null = null;

export function getOllamaDetector(): OllamaDetector {
  if (!ollamaDetector) {
    ollamaDetector = new OllamaDetector();
  }
  return ollamaDetector;
}
