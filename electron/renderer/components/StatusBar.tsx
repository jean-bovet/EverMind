import {
  getOllamaStatusText,
  getOllamaStatusClass,
  type OllamaStatus
} from '../../utils/ollama-helpers.js';
import { formatCount } from '../../utils/format-helpers.js';

interface StatusBarProps {
  ollamaStatus: OllamaStatus | null;
}

export default function StatusBar({ ollamaStatus }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-indicator">
        <div className={`status-dot ${getOllamaStatusClass(ollamaStatus)}`} />
        <span>
          Ollama: {getOllamaStatusText(ollamaStatus)}
        </span>
      </div>
      {ollamaStatus?.models && ollamaStatus.models.length > 0 && (
        <div>
          {formatCount(ollamaStatus.models.length, 'model')} available
        </div>
      )}
      {ollamaStatus?.version && (
        <div style={{ color: '#666' }}>v{ollamaStatus.version}</div>
      )}
    </div>
  );
}
