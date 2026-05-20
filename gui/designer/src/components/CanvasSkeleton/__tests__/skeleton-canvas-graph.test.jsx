/**
 * Canvas Graph view — toggle Layout ⇄ Graph + 2 placeholder containers.
 *
 * 12.05.2026 V2 fixture: no operations / commits на старте → graph
 * view рендерит 0 operation nodes + 2 placeholder containers через
 * dagre layout.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CanvasSkeleton from '../index';

afterEach(cleanup);

describe('Canvas Graph view — V2 placeholder fixture', () => {
  it('toggle to Graph view shows 0 operation nodes (no commits в fixture)', () => {
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-view-toggle-graph'));
    expect(screen.getByTestId('skeleton-canvas-graph')).toBeTruthy();
    const ops = screen.queryAllByTestId(/^skeleton-op-node-/);
    expect(ops.length).toBe(0);
  });

  it.skip('graph view renders the ghost placeholder container — LEGACY (AE-K9.6 ghost block removed, spec §7.6)', () => {});

  it('toggle back to Layout removes graph view', () => {
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-view-toggle-graph'));
    expect(screen.queryByTestId('skeleton-canvas-layout')).toBeNull();
    fireEvent.click(screen.getByTestId('skeleton-view-toggle-layout'));
    expect(screen.getByTestId('skeleton-canvas-layout')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-canvas-graph')).toBeNull();
  });
});
