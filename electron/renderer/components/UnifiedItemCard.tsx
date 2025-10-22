import type { UnifiedItem } from '../../utils/unified-item-helpers.js';
import { formatShortDate } from '../../utils/format-helpers.js';

interface UnifiedItemCardProps {
  item: UnifiedItem;
  onAugment?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const UnifiedItemCard: React.FC<UnifiedItemCardProps> = ({
  item,
  onAugment,
  onRetry,
}) => {
  // Processing state (file being processed or note being augmented)
  if (item.status === 'processing') {
    return (
      <div className="unified-item-card processing">
        <div className="item-header">
          <span className="item-icon">
            {item.type === 'file' ? '⏳' : '🔄'}
          </span>
          <span className="item-title">{item.title}</span>
          <span className="item-progress-percent">{item.progress}%</span>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${item.progress}%` }}
          />
        </div>

        {item.statusMessage && (
          <div className="item-status-message">{item.statusMessage}</div>
        )}
      </div>
    );
  }

  // Error state
  if (item.status === 'error') {
    return (
      <div className="unified-item-card error">
        <div className="item-header">
          <span className="item-icon">❌</span>
          <span className="item-title">{item.title}</span>
        </div>

        {item.error && (
          <div className="item-error-message">{item.error}</div>
        )}

        {item.type === 'file' && onRetry && (
          <button
            className="retry-button"
            onClick={() => onRetry(item.id)}
          >
            🔄 Retry
          </button>
        )}
      </div>
    );
  }

  // Note item (idle state)
  if (item.type === 'note') {
    return (
      <div className="unified-item-card note">
        <div className="item-header">
          <span className="item-icon">📄</span>
          <div className="item-title-section">
            <h3 className="item-title">{item.title}</h3>
            {item.isAugmented && item.augmentedDate && (
              <span className="augmented-badge" title={`Augmented on ${item.augmentedDate}`}>
                ✓ AI Augmented ({formatShortDate(Date.parse(item.augmentedDate))})
              </span>
            )}
          </div>
          {item.created && (
            <span className="item-date">
              {formatShortDate(item.created)}
            </span>
          )}
        </div>

        {item.tags && item.tags.length > 0 && (
          <div className="item-tags">
            {item.tags.map((tag, index) => (
              <span key={index} className="tag-chip">
                {tag}
              </span>
            ))}
          </div>
        )}

        {item.contentPreview && (
          <div className="item-content-preview">
            {item.contentPreview}
          </div>
        )}

        {!item.isAugmented && onAugment && (
          <button
            className="augment-button"
            onClick={() => onAugment(item.id)}
          >
            🤖 Augment with AI
          </button>
        )}
      </div>
    );
  }

  // Completed file item
  if (item.type === 'file' && item.status === 'complete') {
    return (
      <div className="unified-item-card file-complete">
        <div className="item-header">
          <span className="item-icon">✅</span>
          <span className="item-title">{item.title}</span>
        </div>

        <div className="item-success-message">
          Uploaded to Evernote successfully
        </div>

        {item.noteUrl && (
          <a
            href={item.noteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="view-note-link"
          >
            View in Evernote →
          </a>
        )}
      </div>
    );
  }

  // File item (idle - shouldn't happen in normal flow)
  return (
    <div className="unified-item-card file">
      <div className="item-header">
        <span className="item-icon">📁</span>
        <span className="item-title">{item.title}</span>
      </div>
    </div>
  );
};

export default UnifiedItemCard;
