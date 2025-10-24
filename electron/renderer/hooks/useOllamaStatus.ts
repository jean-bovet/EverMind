/**
 * useOllamaStatus Hook
 * Manages Ollama installation status
 */

import { useState, useEffect } from 'react';

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  location?: string;
  models?: string[];
}

export function useOllamaStatus() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    const status = await window.electronAPI.checkOllamaInstallation();
    setOllamaStatus(status);

    if (!status.installed) {
      setShowWelcome(true);
    }
  };

  return {
    ollamaStatus,
    showWelcome,
    setShowWelcome,
    checkOllamaStatus
  };
}
