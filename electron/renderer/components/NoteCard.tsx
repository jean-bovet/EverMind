import React from 'react';
import type { NotePreview } from '../../utils/note-helpers.js';
import {
  formatDate,
  truncateText,
  getAugmentButtonTooltip,
  getAugmentButtonLabel
} from '../../utils/format-helpers.js';

interface NoteCardProps {
  note: NotePreview & { thumbnailUrl?: string };
  onAugment: (noteGuid: string) => void;
  augmenting: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onAugment, augmenting }) => {

  return (
    <div className="note-card">
      <div className="note-card-header">
        <h3 className="note-card-title">{note.title || 'Untitled'}</h3>
        {note.isAugmented && (
          <span className="augmented-badge" title={`Augmented on ${note.augmentedDate}`}>
            ✓ AI Augmented
            {note.augmentedDate && (
              <span className="augmented-date">
                {' '}({formatDate(Date.parse(note.augmentedDate))})
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
          {truncateText(note.contentPreview, 200)}
        </div>
      )}

      <div className="note-card-actions">
        <button
          className="augment-button"
          onClick={() => onAugment(note.guid)}
          disabled={augmenting || note.isAugmented}
          title={getAugmentButtonTooltip(note.isAugmented, augmenting)}
        >
          {getAugmentButtonLabel(augmenting)}
        </button>
      </div>
    </div>
  );
};

export default NoteCard;
