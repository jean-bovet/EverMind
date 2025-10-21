import React from 'react';

interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  progress: number;
  result?: {
    title: string;
    description: string;
    tags: string[];
    noteUrl?: string;
  };
  error?: string;
}

interface FileQueueProps {
  files: FileItem[];
  onProcess: () => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  isProcessing: boolean;
}

export default function FileQueue({
  files,
  onProcess,
  onClearCompleted,
  onClearAll,
  isProcessing
}: FileQueueProps) {
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const completedCount = files.filter(f => f.status === 'complete').length;

  return (
    <div className="file-queue">
      <div className="file-queue-header">
        <div className="file-queue-title">
          {files.length} file{files.length !== 1 ? 's' : ''} in queue
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </div>
        <div className="file-queue-actions">
          {pendingCount > 0 && !isProcessing && (
            <button className="button button-primary" onClick={onProcess}>
              Process {pendingCount} file{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
          {completedCount > 0 && (
            <button className="button button-secondary" onClick={onClearCompleted}>
              Clear Completed
            </button>
          )}
          <button className="button button-secondary" onClick={onClearAll}>
            Clear All
          </button>
        </div>
      </div>

      <div className="file-list">
        {files.map((file, index) => (
          <div key={index} className={`file-item ${file.status}`}>
            <div className="file-item-header">
              <div className="file-item-name">{file.name}</div>
              <div className="file-item-status">
                {file.status === 'pending' && '⏳ Pending'}
                {file.status === 'processing' && '⚙️ Processing'}
                {file.status === 'complete' && '✅ Complete'}
                {file.status === 'error' && '❌ Error'}
              </div>
            </div>

            {file.status === 'processing' && (
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}

            {file.status === 'complete' && file.result && (
              <div className="file-result">
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  <strong>{file.result.title}</strong>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                  {file.result.description}
                </div>
                {file.result.tags.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {file.result.tags.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          background: '#333',
                          borderRadius: 4
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {file.result.noteUrl && (
                  <div style={{ marginTop: 8, fontSize: 11 }}>
                    <a
                      href={file.result.noteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#007aff' }}
                    >
                      View in Evernote →
                    </a>
                  </div>
                )}
              </div>
            )}

            {file.status === 'error' && file.error && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#ff3b30' }}>
                {file.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
