/**
 * NB-K9 — NotebookToolbar 16 buttons + special actions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotebookToolbar, { BASE_BUTTONS } from '../NotebookToolbar';

describe('NB-K9 — NotebookToolbar', () => {
  it('renders all 16 base buttons + 3 special buttons', () => {
    render(<NotebookToolbar onInsert={vi.fn()} />);
    expect(BASE_BUTTONS.length).toBe(16);
    for (const b of BASE_BUTTONS) {
      expect(screen.getByTestId(`nb-tb-${b.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('nb-tb-attach')).toBeTruthy();
    expect(screen.getByTestId('nb-tb-ref')).toBeTruthy();
    expect(screen.getByTestId('nb-tb-preview')).toBeTruthy();
  });

  it('clicking bold calls onInsert with **${sel}**', () => {
    const onInsert = vi.fn();
    render(<NotebookToolbar onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('nb-tb-bold'));
    expect(onInsert).toHaveBeenCalledWith('**${sel}**', 'bold');
  });

  it('clicking DNA code block calls onInsert with ```dna template', () => {
    const onInsert = vi.fn();
    render(<NotebookToolbar onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('nb-tb-block-dna'));
    expect(onInsert.mock.calls[0][0]).toContain('```dna');
  });

  it('attach / ref / preview buttons dispatch to their specific callbacks', () => {
    const onAttach = vi.fn();
    const onRef = vi.fn();
    const onToggle = vi.fn();
    render(
      <NotebookToolbar
        onInsert={vi.fn()}
        onAttachmentClick={onAttach}
        onRefPickerClick={onRef}
        onTogglePreview={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('nb-tb-attach'));
    fireEvent.click(screen.getByTestId('nb-tb-ref'));
    fireEvent.click(screen.getByTestId('nb-tb-preview'));
    expect(onAttach).toHaveBeenCalled();
    expect(onRef).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalled();
  });
});
