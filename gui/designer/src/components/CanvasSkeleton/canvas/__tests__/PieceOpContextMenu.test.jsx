/**
 * AV-K9 — shared PieceContextMenu + OpContextMenu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PieceContextMenu from '../PieceContextMenu';
import OpContextMenu from '../OpContextMenu';

describe('AV-K9 — PieceContextMenu', () => {
  it('renders only the items whose callback is provided', () => {
    render(
      <PieceContextMenu
        anchor={{ x: 100, y: 200 }}
        onClose={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId('piece-context-menu-rename')).toBeTruthy();
    expect(screen.getByTestId('piece-context-menu-del')).toBeTruthy();
    expect(screen.queryByTestId('piece-context-menu-rc')).toBeNull();
    expect(screen.queryByTestId('piece-context-menu-mut')).toBeNull();
  });

  it('hides Сшить when selectionSize<2', () => {
    render(
      <PieceContextMenu anchor={{ x: 0, y: 0 }} onClose={vi.fn()}
        onSew={vi.fn()} selectionSize={1} />,
    );
    expect(screen.queryByTestId('piece-context-menu-sew')).toBeNull();
  });

  it('shows Сшить when selectionSize≥2', () => {
    render(
      <PieceContextMenu anchor={{ x: 0, y: 0 }} onClose={vi.fn()}
        onSew={vi.fn()} selectionSize={3} />,
    );
    const sew = screen.getByTestId('piece-context-menu-sew');
    expect(sew).toBeTruthy();
    expect(sew.textContent).toMatch(/\(3\)/);
  });

  it('clicking an item fires its callback + onClose', () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    render(
      <PieceContextMenu anchor={{ x: 0, y: 0 }} onClose={onClose}
        onRename={onRename} />,
    );
    fireEvent.click(screen.getByTestId('piece-context-menu-rename'));
    expect(onRename).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc closes the menu', () => {
    const onClose = vi.fn();
    render(<PieceContextMenu anchor={{ x: 0, y: 0 }} onClose={onClose} onRename={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('empty placeholder when no callbacks wired', () => {
    render(<PieceContextMenu anchor={{ x: 0, y: 0 }} onClose={vi.fn()} />);
    expect(screen.getByTestId('piece-context-menu-empty')).toBeTruthy();
  });
});

describe('AV-K9 — OpContextMenu', () => {
  it('renders 3 op-related items when all callbacks provided', () => {
    render(
      <OpContextMenu anchor={{ x: 0, y: 0 }} onClose={vi.fn()}
        onEditParams={vi.fn()} onChangeKind={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByTestId('op-context-menu-params')).toBeTruthy();
    expect(screen.getByTestId('op-context-menu-kind')).toBeTruthy();
    expect(screen.getByTestId('op-context-menu-del')).toBeTruthy();
  });

  it('hides items whose callback is missing', () => {
    render(
      <OpContextMenu anchor={{ x: 0, y: 0 }} onClose={vi.fn()}
        onRemove={vi.fn()} />,
    );
    expect(screen.queryByTestId('op-context-menu-params')).toBeNull();
    expect(screen.getByTestId('op-context-menu-del')).toBeTruthy();
  });
});
