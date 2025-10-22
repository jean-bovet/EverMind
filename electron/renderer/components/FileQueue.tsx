import type { FileItem } from '../../utils/processing-scheduler.js';
import {
  getFileStatusLabel,
  countFilesByStatus,
  shouldShowProgressBar
} from '../../utils/file-helpers.js';
import { formatCount } from '../../utils/format-helpers.js';

interface FileQueueProps {
  files: FileItem[];
  onClearCompleted: () => void;
  onClearAll: () => void;
}

export default function FileQueue({
  files,
  onClearCompleted,
  onClearAll
}: FileQueueProps) {
  const completedCount = countFilesByStatus(files, 'complete');

  return (
    <div className="file-queue">
      <div className="file-queue-header">
        <div className="file-queue-title">
          {formatCount(files.length, 'file')} in queue
        </div>
        <div className="file-queue-actions">
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
                {getFileStatusLabel(file.status)}
              </div>
            </div>

            {/* Progress bar for active operations */}
            {shouldShowProgressBar(file.status) && (
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}

            {/* Status message */}
            {file.message && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                {file.message}
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
                    {file.result.tags.map((tag: string, i: number) => (
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
