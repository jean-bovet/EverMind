import { useState, DragEvent } from 'react';
import UnifiedItemCard from './UnifiedItemCard';
import type { UnifiedItem } from '../../utils/unified-item-helpers.js';
import { AlertTriangle, Loader, FolderOpen } from 'lucide-react';

interface UnifiedListProps {
  items: UnifiedItem[];
  loading?: boolean;
  error?: string | null;
  onAugmentNote: (noteGuid: string) => void;
  onFilesDropped: (filePaths: string[]) => void;
  onRetryFile: (filePath: string) => void;
}

const UnifiedList: React.FC<UnifiedListProps> = ({
  items,
  loading = false,
  error = null,
  onAugmentNote,
  onFilesDropped,
  onRetryFile,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const filePaths: string[] = [];

    for (const file of files) {
      try {
        const path = await window.electronAPI.getPathForFile(file);
        if (path) {
          filePaths.push(path);
        }
      } catch (error) {
        console.error('Failed to get path for file:', file.name, error);
      }
    }

    if (filePaths.length > 0) {
      onFilesDropped(filePaths);
    }
  };

  // Show error message
  if (error) {
    return (
      <div className="unified-list">
        <div className="error-container">
          <div className="error-icon">
            <AlertTriangle size={48} />
          </div>
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading && items.length === 0) {
    return (
      <div className="unified-list">
        <div className="loading-container">
          <div className="loading-spinner">
            <Loader className="animate-spin" size={32} />
          </div>
          <div className="loading-message">Loading notes...</div>
        </div>
      </div>
    );
  }

  // Show empty state with drop zone
  if (items.length === 0) {
    return (
      <div
        className={`unified-list empty ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="empty-state">
          <div className="drop-zone-icon">
            <FolderOpen size={64} />
          </div>
          <h2>Drop files or folders here</h2>
          <p>to import into Evernote</p>
        </div>
      </div>
    );
  }

  // Show items list with drop zone overlay
  return (
    <div
      className={`unified-list ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <div className="drop-overlay-icon">
              <FolderOpen size={64} />
            </div>
            <div className="drop-overlay-text">Drop files to import</div>
          </div>
        </div>
      )}

      <div className="items-container">
        {items.map((item) => (
          <UnifiedItemCard
            key={item.id}
            item={item}
            onAugment={item.type === 'note' ? onAugmentNote : undefined}
            onRetry={item.type === 'file' ? onRetryFile : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default UnifiedList;
