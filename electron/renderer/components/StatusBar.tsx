import { Settings, RefreshCw, Trash2 } from 'lucide-react';
import {
  getOllamaStatusText,
  getOllamaStatusClass,
  type OllamaStatus
} from '../../utils/ollama-helpers.js';

interface StatusBarProps {
  ollamaStatus: OllamaStatus | null;
  onSettingsClick: () => void;
  onRefreshNotes: () => void;
  notesLoading: boolean;
  completedCount: number;
  onClearCompleted: () => void;
}

export default function StatusBar({
  ollamaStatus,
  onSettingsClick,
  onRefreshNotes,
  notesLoading,
  completedCount,
  onClearCompleted
}: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-indicator">
        <div className={`status-dot ${getOllamaStatusClass(ollamaStatus)}`} />
        <span>
          Ollama: {getOllamaStatusText(ollamaStatus)}
        </span>
      </div>
      {ollamaStatus?.version && (
        <div className="status-version">v{ollamaStatus.version}</div>
      )}
      <div className="status-spacer" />
      <button
        className="refresh-notes-button"
        onClick={onRefreshNotes}
        disabled={notesLoading}
        title="Refresh notes list"
      >
        <RefreshCw size={16} className={notesLoading ? 'animate-spin' : ''} />
      </button>
      {completedCount > 0 && (
        <button
          className="clear-completed-button"
          onClick={onClearCompleted}
          title={`Clear ${completedCount} completed file${completedCount > 1 ? 's' : ''}`}
        >
          <Trash2 size={16} />
          <span>Clear {completedCount}</span>
        </button>
      )}
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
