import { useState, DragEvent } from 'react';

interface DropZoneProps {
  onFilesAdded: (filePaths: string[]) => void;
  disabled?: boolean;
}

export default function DropZone({ onFilesAdded, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    // Use Electron's webUtils API to get the file path
    const filePaths = files
      .map(file => {
        try {
          return window.electronAPI.getPathForFile(file);
        } catch (error) {
          console.error('Error getting file path:', error);
          return '';
        }
      })
      .filter(path => path !== '');

    console.log('Dropped files:', filePaths);

    if (filePaths.length > 0) {
      onFilesAdded(filePaths);
    } else {
      console.warn('No file paths extracted from dropped files');
    }
  };

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="drop-zone-icon">📁</div>
      <h2>Drop files or folders here</h2>
      <p>Drag and drop your files to get started</p>
    </div>
  );
}
