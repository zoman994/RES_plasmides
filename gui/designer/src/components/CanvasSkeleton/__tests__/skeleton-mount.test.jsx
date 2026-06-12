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

  it('renders header with «← Назад»; the Layout/Graph toggle is retired (M-WORKSPACE)', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-header')).toBeTruthy();
    expect(screen.getByTestId('skeleton-back-btn')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-view-toggle')).toBeNull();
  });

  it('PC-K1: LibraryTreeHost no longer mounted (replaced by top search bar — PC-K2)', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-library-tree-host')).toBeNull();
    expect(screen.queryByTestId('library-tree-root')).toBeNull();
  });

  it('renders the two-level assembly-tab workspace in the canvas area (M-WORKSPACE)', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-canvas-area')).toBeTruthy();
    expect(screen.getByTestId('project-assembly-workspace')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-canvas-layout')).toBeNull();
  });

  it('editor closed by default', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-editor')).toBeNull();
  });
});
