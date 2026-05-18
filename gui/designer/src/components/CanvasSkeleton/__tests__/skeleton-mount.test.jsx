/**
 * K1 — mount smoke test для CanvasSkeleton.
 *
 * Render root + verify presence Header + Tree + Canvas + view toggle.
 * Editor НЕ открыт по умолчанию.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CanvasSkeleton from '../index';

afterEach(cleanup);

describe('K1 — CanvasSkeleton mount', () => {
  it('renders root container', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('canvas-skeleton')).toBeTruthy();
  });

  it('renders header with «← Назад» + Layout/Graph toggle', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-header')).toBeTruthy();
    expect(screen.getByTestId('skeleton-back-btn')).toBeTruthy();
    expect(screen.getByTestId('skeleton-view-toggle')).toBeTruthy();
    expect(screen.getByTestId('skeleton-view-toggle-layout')).toBeTruthy();
    expect(screen.getByTestId('skeleton-view-toggle-graph')).toBeTruthy();
  });

  it('renders LibraryTreeRoot via LibraryTreeHost (12.05.2026 — bespoke SkeletonTree выпилен)', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-library-tree-host')).toBeTruthy();
    // LibraryTreeRoot ставит свой testId.
    expect(screen.getByTestId('library-tree-root')).toBeTruthy();
    // Tree-head (search + Add button) — full Library functionality.
    expect(screen.getByTestId('tree-head')).toBeTruthy();
    expect(screen.getByTestId('tree-add-btn')).toBeTruthy();
    expect(screen.getByTestId('tree-search')).toBeTruthy();
  });

  it('renders Canvas area (Layout view default)', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-canvas-area')).toBeTruthy();
    expect(screen.getByTestId('skeleton-canvas-layout')).toBeTruthy();
  });

  it('editor closed by default', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-editor')).toBeNull();
  });
});
