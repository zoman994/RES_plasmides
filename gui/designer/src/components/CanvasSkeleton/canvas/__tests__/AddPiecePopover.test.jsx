/**
 * AV-K2 — AddPiecePopover shared component.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AddPiecePopover, { ADD_PIECE_KINDS } from '../AddPiecePopover';

describe('AV-K2 — AddPiecePopover', () => {
  it('renders 4 piece-kind entries', () => {
    render(<AddPiecePopover onPick={vi.fn()} onClose={vi.fn()} />);
    expect(ADD_PIECE_KINDS).toHaveLength(4);
    for (const k of ADD_PIECE_KINDS) {
      expect(screen.getByTestId(`add-piece-popover-${k.id}`)).toBeTruthy();
    }
  });

  it('click on plasmid item calls onPick("plasmid")', () => {
    const onPick = vi.fn();
    render(<AddPiecePopover onPick={onPick} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('add-piece-popover-plasmid'));
    expect(onPick).toHaveBeenCalledWith('plasmid');
  });

  it('Esc calls onClose', () => {
    const onClose = vi.fn();
    render(<AddPiecePopover onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('hotkey P triggers plasmid pick', () => {
    const onPick = vi.fn();
    render(<AddPiecePopover onPick={onPick} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'p' });
    expect(onPick).toHaveBeenCalledWith('plasmid');
  });

  it('hotkey S triggers snippet pick, "." triggers synthesis, G triggers gap', () => {
    const onPick = vi.fn();
    render(<AddPiecePopover onPick={onPick} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: 'g' });
    expect(onPick).toHaveBeenNthCalledWith(1, 'snippet');
    expect(onPick).toHaveBeenNthCalledWith(2, 'synthesis');
    expect(onPick).toHaveBeenNthCalledWith(3, 'gap');
  });

  it('renders with anchorPos absolute positioning when provided', () => {
    render(<AddPiecePopover anchorPos={{ x: 100, y: 200 }} onPick={vi.fn()} onClose={vi.fn()} />);
    const popover = screen.getByTestId('add-piece-popover');
    expect(popover.style.position).toBe('absolute');
    expect(popover.style.left).toBe('100px');
    expect(popover.style.top).toBe('200px');
  });

  it('falls back to fixed centered positioning without anchorPos', () => {
    render(<AddPiecePopover onPick={vi.fn()} onClose={vi.fn()} />);
    const popover = screen.getByTestId('add-piece-popover');
    expect(popover.style.position).toBe('fixed');
  });
});
