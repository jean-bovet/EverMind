import React, { useState, DragEvent } from 'react';

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
    const filePaths = files.map(file => (file as any).path).filter(Boolean);

    if (filePaths.length > 0) {
      onFilesAdded(filePaths);
    }
  };

  const handleSelectFiles = async () => {
    if (disabled) return;

    const filePaths = await window.electronAPI.selectFiles();
    if (filePaths && filePaths.length > 0) {
      onFilesAdded(filePaths);
    }
  };

  const handleSelectFolder = async () => {
    if (disabled) return;

    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      onFilesAdded([folderPath]);
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
      <p>Or click below to select</p>
      <div className="drop-zone-buttons">
        <button
          className="button button-primary"
          onClick={handleSelectFiles}
          disabled={disabled}
        >
          Select Files
        </button>
        <button
          className="button button-secondary"
          onClick={handleSelectFolder}
          disabled={disabled}
        >
          Select Folder
        </button>
      </div>
    </div>
  );
}
