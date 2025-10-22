/**
 * Ollama Helpers
 * Utilities for working with Ollama status and display
 */

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  models?: string[];
}

/**
 * Get Ollama status display text
 * @param status - Ollama status object
 * @returns Human-readable status text
 */
export function getOllamaStatusText(status: OllamaStatus | null): string {
  if (!status) return 'Unknown';
  if (status.running) return 'Running';
  if (status.installed) return 'Installed';
  return 'Not Installed';
}

/**
 * Get CSS class for Ollama status indicator
 * @param status - Ollama status object
 * @returns CSS class name for status dot
 */
export function getOllamaStatusClass(status: OllamaStatus | null): string {
  if (status?.running) return 'running';
  return 'stopped';
}
