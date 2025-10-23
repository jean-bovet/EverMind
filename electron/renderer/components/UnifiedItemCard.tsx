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
        {/* Row 1: Icon, Title, Date, Action Button */}
        <div className="item-header">
          <span className="item-icon">📄</span>
          <span className="item-title">{item.title}</span>
          {item.created && (
            <span className="item-date">
              {formatShortDate(item.created)}
            </span>
          )}
          {!item.isAugmented && onAugment && (
            <button
              className="augment-button compact"
              onClick={() => onAugment(item.id)}
            >
              Augment
            </button>
          )}
        </div>

        {/* Row 2: Tags and Augmented Badge (inline) */}
        <div className="item-metadata">
          {item.tags && item.tags.length > 0 && (
            <span className="item-tags-inline">
              {item.tags.map((tag, index) => (
                <span key={index}>
                  {tag}
                  {index < item.tags.length - 1 && ' • '}
                </span>
              ))}
            </span>
          )}
          {item.isAugmented && item.augmentedDate && (
            <>
              {item.tags && item.tags.length > 0 && <span className="metadata-separator"> • </span>}
              <span className="augmented-badge" title={`Augmented on ${item.augmentedDate}`}>
                ✓ AI Augmented ({formatShortDate(Date.parse(item.augmentedDate))})
              </span>
            </>
          )}
        </div>
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
