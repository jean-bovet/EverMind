import React from 'react';

type FileStatus =
  | 'pending'           // Waiting to start Stage 1
  | 'extracting'        // Stage 1: Extracting text from file
  | 'analyzing'         // Stage 1: AI analysis in progress
  | 'ready-to-upload'   // Stage 1 complete, waiting for upload slot
  | 'uploading'         // Stage 2: Currently uploading to Evernote
  | 'rate-limited'      // Stage 2: Waiting for rate limit to clear
  | 'retrying'          // Stage 2: Retrying after failure
  | 'complete'          // Successfully uploaded
  | 'error';            // Failed at any stage

interface FileItem {
  path: string;
  name: string;
  status: FileStatus;
  progress: number;
  message?: string;
  jsonPath?: string;    // Path to the .evernote.json file (for Stage 2)
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
  onClearCompleted: () => void;
  onClearAll: () => void;
}

export default function FileQueue({
  files,
  onClearCompleted,
  onClearAll
}: FileQueueProps) {
  const completedCount = files.filter(f => f.status === 'complete').length;

  return (
    <div className="file-queue">
      <div className="file-queue-header">
        <div className="file-queue-title">
          {files.length} file{files.length !== 1 ? 's' : ''} in queue
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
                {file.status === 'pending' && '⏳ Pending'}
                {file.status === 'extracting' && '📄 Extracting...'}
                {file.status === 'analyzing' && '🤖 Analyzing...'}
                {file.status === 'ready-to-upload' && '⏸️ Ready to upload'}
                {file.status === 'uploading' && '⬆️ Uploading...'}
                {file.status === 'rate-limited' && '⏱️ Rate limited'}
                {file.status === 'retrying' && '🔄 Retrying'}
                {file.status === 'complete' && '✅ Complete'}
                {file.status === 'error' && '❌ Error'}
              </div>
            </div>

            {/* Progress bar for active operations */}
            {['extracting', 'analyzing', 'uploading'].includes(file.status) && (
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
