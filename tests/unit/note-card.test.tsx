import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NoteCard from '../../electron/renderer/components/NoteCard';

describe('NoteCard', () => {
  const mockNote = {
    guid: 'n1',
    title: 'Test Note',
    contentPreview: 'This is a preview of the note content...',
    created: 1697990400000, // Oct 22, 2023
    updated: 1697990400000,
    tags: ['tag1', 'tag2'],
    isAugmented: false
  };

  it('should render note title', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText('Test Note')).toBeInTheDocument();
  });

  it('should render untitled for notes without title', () => {
    const noteWithoutTitle = { ...mockNote, title: '' };
    render(<NoteCard note={noteWithoutTitle} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('should render content preview', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/This is a preview/)).toBeInTheDocument();
  });

  it('should render created and updated dates', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText(/Updated:/)).toBeInTheDocument();
    expect(screen.getByText(/Oct/)).toBeInTheDocument();
  });

  it('should render tags', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
  });

  it('should not render tags section if no tags', () => {
    const noteWithoutTags = { ...mockNote, tags: [] };
    const { container } = render(
      <NoteCard note={noteWithoutTags} onAugment={vi.fn()} augmenting={false} />
    );

    const tagsSection = container.querySelector('.note-card-tags');
    expect(tagsSection).not.toBeInTheDocument();
  });

  it('should call onAugment when button clicked', () => {
    const onAugment = vi.fn();
    render(<NoteCard note={mockNote} onAugment={onAugment} augmenting={false} />);

    const button = screen.getByRole('button', { name: /augment/i });
    fireEvent.click(button);

    expect(onAugment).toHaveBeenCalledWith('n1');
  });

  it('should disable button when augmenting', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={true} />);

    const button = screen.getByRole('button', { name: /augmenting/i });
    expect(button).toBeDisabled();
  });

  it('should show augmented badge when augmented', () => {
    const augmentedNote = {
      ...mockNote,
      isAugmented: true,
      augmentedDate: '2025-10-22T15:30:00Z'
    };

    render(<NoteCard note={augmentedNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/AI Augmented/i)).toBeInTheDocument();
  });

  it('should show augmented date in badge', () => {
    const augmentedNote = {
      ...mockNote,
      isAugmented: true,
      augmentedDate: '2025-10-22T15:30:00Z'
    };

    render(<NoteCard note={augmentedNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/10\/22\/2025/)).toBeInTheDocument();
  });

  it('should disable button for already augmented notes', () => {
    const augmentedNote = {
      ...mockNote,
      isAugmented: true
    };

    render(<NoteCard note={augmentedNote} onAugment={vi.fn()} augmenting={false} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should render thumbnail if provided', () => {
    const noteWithImage = {
      ...mockNote,
      thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };

    render(<NoteCard note={noteWithImage} onAugment={vi.fn()} augmenting={false} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', noteWithImage.thumbnailUrl);
    expect(img).toHaveAttribute('alt', 'Note thumbnail');
  });

  it('should truncate long content previews', () => {
    const longNote = {
      ...mockNote,
      contentPreview: 'A'.repeat(300)
    };

    const { container } = render(
      <NoteCard note={longNote} onAugment={vi.fn()} augmenting={false} />
    );

    const preview = container.querySelector('.note-card-preview');
    expect(preview?.textContent?.length).toBeLessThan(250);
    expect(preview?.textContent).toContain('...');
  });

  it('should not truncate short content previews', () => {
    const shortNote = {
      ...mockNote,
      contentPreview: 'Short preview'
    };

    render(<NoteCard note={shortNote} onAugment={vi.fn()} augmenting={false} />);

    const preview = screen.getByText('Short preview');
    expect(preview.textContent).not.toContain('...');
  });

  it('should show correct button text when augmenting', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={true} />);

    expect(screen.getByText(/Augmenting.../)).toBeInTheDocument();
  });

  it('should show correct button text when not augmenting', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/Augment with AI/)).toBeInTheDocument();
  });

  it('should have proper tooltip on augment button', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'Augment this note with AI analysis');
  });

  it('should have proper tooltip when already augmented', () => {
    const augmentedNote = {
      ...mockNote,
      isAugmented: true
    };

    render(<NoteCard note={augmentedNote} onAugment={vi.fn()} augmenting={false} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'This note has already been augmented');
  });

  it('should have proper tooltip when augmenting', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={true} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'Augmenting...');
  });

  it('should render with all sections present', () => {
    const fullNote = {
      ...mockNote,
      thumbnailUrl: 'data:image/png;base64,abc',
      isAugmented: true,
      augmentedDate: '2025-10-22'
    };

    const { container } = render(
      <NoteCard note={fullNote} onAugment={vi.fn()} augmenting={false} />
    );

    expect(container.querySelector('.note-card-header')).toBeInTheDocument();
    expect(container.querySelector('.note-card-metadata')).toBeInTheDocument();
    expect(container.querySelector('.note-card-tags')).toBeInTheDocument();
    expect(container.querySelector('.note-card-thumbnail')).toBeInTheDocument();
    expect(container.querySelector('.note-card-preview')).toBeInTheDocument();
    expect(container.querySelector('.note-card-actions')).toBeInTheDocument();
  });
});
