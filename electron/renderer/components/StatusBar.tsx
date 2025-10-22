
interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  models?: string[];
}

interface StatusBarProps {
  ollamaStatus: OllamaStatus | null;
}

export default function StatusBar({ ollamaStatus }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-indicator">
        <div className={`status-dot ${ollamaStatus?.running ? 'running' : 'stopped'}`} />
        <span>
          Ollama: {ollamaStatus?.running ? 'Running' : ollamaStatus?.installed ? 'Installed' : 'Not Installed'}
        </span>
      </div>
      {ollamaStatus?.models && ollamaStatus.models.length > 0 && (
        <div>
          {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? 's' : ''} available
        </div>
      )}
      {ollamaStatus?.version && (
        <div style={{ color: '#666' }}>v{ollamaStatus.version}</div>
      )}
    </div>
  );
}
