import { Settings } from 'lucide-react';
import {
  getOllamaStatusText,
  getOllamaStatusClass,
  type OllamaStatus
} from '../../utils/ollama-helpers.js';
import { formatCount } from '../../utils/format-helpers.js';

interface StatusBarProps {
  ollamaStatus: OllamaStatus | null;
  onSettingsClick: () => void;
}

export default function StatusBar({ ollamaStatus, onSettingsClick }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-indicator">
        <div className={`status-dot ${getOllamaStatusClass(ollamaStatus)}`} />
        <span>
          Ollama: {getOllamaStatusText(ollamaStatus)}
        </span>
      </div>
      {ollamaStatus?.models && ollamaStatus.models.length > 0 && (
        <div className="status-models">
          {formatCount(ollamaStatus.models.length, 'model')} available
        </div>
      )}
      {ollamaStatus?.version && (
        <div className="status-version">v{ollamaStatus.version}</div>
      )}
      <div className="status-spacer" />
      <button
        className="status-settings-button"
        onClick={onSettingsClick}
        aria-label="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
