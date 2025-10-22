import React from 'react';
import type { NotePreview } from '../../utils/note-helpers.js';

interface NoteCardProps {
  note: NotePreview & { thumbnailUrl?: string };
  onAugment: (noteGuid: string) => void;
  augmenting: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onAugment, augmenting }) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const truncateText = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="note-card">
      <div className="note-card-header">
        <h3 className="note-card-title">{note.title || 'Untitled'}</h3>
        {note.isAugmented && (
          <span className="augmented-badge" title={`Augmented on ${note.augmentedDate}`}>
            ✓ AI Augmented
            {note.augmentedDate && (
              <span className="augmented-date">
                {' '}({new Date(note.augmentedDate).toLocaleDateString()})
              </span>
            )}
          </span>
        )}
      </div>

      <div className="note-card-metadata">
        <span className="metadata-item">
          📅 Created: {formatDate(note.created)}
        </span>
        <span className="metadata-item">
          🔄 Updated: {formatDate(note.updated)}
        </span>
      </div>

      {note.tags.length > 0 && (
        <div className="note-card-tags">
          {note.tags.map((tag, index) => (
            <span key={index} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      )}

      {note.thumbnailUrl && (
        <div className="note-card-thumbnail">
          <img src={note.thumbnailUrl} alt="Note thumbnail" />
        </div>
      )}

      {note.contentPreview && (
        <div className="note-card-preview">
          {truncateText(note.contentPreview)}
        </div>
      )}

      <div className="note-card-actions">
        <button
          className="augment-button"
          onClick={() => onAugment(note.guid)}
          disabled={augmenting || note.isAugmented}
          title={
            note.isAugmented
              ? 'This note has already been augmented'
              : augmenting
              ? 'Augmenting...'
              : 'Augment this note with AI analysis'
          }
        >
          {augmenting ? '🔄 Augmenting...' : '🤖 Augment with AI'}
        </button>
      </div>
    </div>
  );
};

export default NoteCard;
