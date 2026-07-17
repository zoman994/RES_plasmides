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

// M-WORKSPACE retired the global Layout/Graph toggle + CanvasGraphView/
// the retired project canvas: each assembly now owns its own DAG
// view tab inside the two-level workspace.
describe('Canvas Graph view — retired by M-WORKSPACE', () => {
  it('no global Layout/Graph toggle; the project mounts the assembly-tab workspace', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-view-toggle-graph')).toBeNull();
    expect(screen.queryByTestId('skeleton-canvas-graph')).toBeNull();
    expect(screen.getByTestId('project-assembly-workspace')).toBeTruthy();
  });
});
