/**
 * Canvas Layout view — 1 ghost placeholder + click sets highlight.
 *
 * V61 (14.05.2026) — fixture теперь имеет 1 призрачный placeholder
 * (был 2). После filling авто-создается новый. Тесты обновлены.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CanvasSkeleton from '../index';

afterEach(cleanup);

describe('Canvas Layout view — V61 ghost fixture', () => {
  it('renders exactly 1 ghost placeholder block on startup', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-block-c-placeholder-1')).toBeTruthy();
    const blocks = Array.from(document.querySelectorAll('[data-kind="placeholder"], [data-kind="linear"], [data-kind="circular"]'));
    expect(blocks.length).toBe(1);
  });

  it('ghost has kind=placeholder + plus icon', () => {
    render(<CanvasSkeleton />);
    const b1 = screen.getByTestId('skeleton-block-c-placeholder-1');
    expect(b1.getAttribute('data-kind')).toBe('placeholder');
    expect(screen.getByTestId('skeleton-placeholder-plus-c-placeholder-1')).toBeTruthy();
  });

  it('click on ghost opens PlaceholderTreePicker + sets highlight', () => {
    render(<CanvasSkeleton />);
    const block = screen.getByTestId('skeleton-block-c-placeholder-1');
    fireEvent.click(block);
    expect(screen.getByTestId('skeleton-placeholder-picker')).toBeTruthy();
    expect(block.getAttribute('data-highlighted')).toBe('true');
  });
});
