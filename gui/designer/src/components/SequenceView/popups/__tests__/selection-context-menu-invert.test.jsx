import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SelectionContextMenu from '../SelectionContextMenu.jsx';

afterEach(cleanup);

const CTX = { x: 10, y: 10 };

describe('SelectionContextMenu — «Инвертировать выделение»', () => {
  it('renders the invert item when onInvert is provided and fires it', () => {
    const onInvert = vi.fn();
    const onClose = vi.fn();
    render(<SelectionContextMenu contextMenu={CTX} selectionMode="dna" onCopy={() => {}} onClose={onClose} onInvert={onInvert} inverted={false} />);
    const item = screen.getByText('Инвертировать выделение');
    expect(item).toBeTruthy();
    fireEvent.click(item);
    expect(onInvert).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a check mark when already inverted', () => {
    render(<SelectionContextMenu contextMenu={CTX} selectionMode="dna" onCopy={() => {}} onClose={() => {}} onInvert={() => {}} inverted />);
    expect(screen.getByText('✓ Инвертировать выделение')).toBeTruthy();
  });

  it('omits the invert item when onInvert is not wired (back-compat)', () => {
    render(<SelectionContextMenu contextMenu={CTX} selectionMode="dna" onCopy={() => {}} onClose={() => {}} />);
    expect(screen.queryByText(/Инвертировать выделение/)).toBeNull();
  });
});
