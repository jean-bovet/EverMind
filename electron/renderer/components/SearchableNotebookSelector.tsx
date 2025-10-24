import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, Check } from 'lucide-react';

interface Notebook {
  guid: string;
  name: string;
  defaultNotebook?: boolean;
}

interface SearchableNotebookSelectorProps {
  notebooks: Notebook[];
  selectedNotebook: string | null;
  onNotebookChange: (notebookGuid: string) => void;
  disabled?: boolean;
}

export function SearchableNotebookSelector({
  notebooks,
  selectedNotebook,
  onNotebookChange,
  disabled = false,
}: SearchableNotebookSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter notebooks based on search text
  const filteredNotebooks = notebooks.filter((notebook) =>
    notebook.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Get selected notebook name
  const selectedNotebookName = notebooks.find(
    (nb) => nb.guid === selectedNotebook
  )?.name || 'Loading...';

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchText('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined; // Explicit return for when isOpen is false
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset highlighted index when search text changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchText]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setSearchText('');
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredNotebooks.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredNotebooks[highlightedIndex]) {
          handleSelect(filteredNotebooks[highlightedIndex]!.guid);
        }
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (notebookGuid: string) => {
    onNotebookChange(notebookGuid);
    setIsOpen(false);
    setSearchText('');
  };

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (isOpen) {
        setSearchText('');
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="searchable-notebook-selector"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={`notebook-selector-button ${disabled ? 'disabled' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="notebook-selector-text">{selectedNotebookName}</span>
        {isOpen ? (
          <ChevronUp size={16} className="notebook-selector-icon" />
        ) : (
          <ChevronDown size={16} className="notebook-selector-icon" />
        )}
      </button>

      {isOpen && (
        <div className="notebook-dropdown">
          <div className="notebook-search-container">
            <Search size={16} className="notebook-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="notebook-search-input"
              placeholder="Search notebooks..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div ref={listRef} className="notebook-list" role="listbox">
            {filteredNotebooks.length === 0 ? (
              <div className="notebook-item-empty">No notebooks found</div>
            ) : (
              filteredNotebooks.map((notebook, index) => (
                <div
                  key={notebook.guid}
                  data-index={index}
                  className={`notebook-item ${
                    highlightedIndex === index ? 'highlighted' : ''
                  } ${selectedNotebook === notebook.guid ? 'selected' : ''}`}
                  onClick={() => handleSelect(notebook.guid)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  aria-selected={selectedNotebook === notebook.guid}
                >
                  <span className="notebook-item-name">
                    {notebook.name}
                    {notebook.defaultNotebook && (
                      <span className="notebook-item-badge"> (Default)</span>
                    )}
                  </span>
                  {selectedNotebook === notebook.guid && (
                    <Check size={16} className="notebook-item-check" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
