/**
 * zone-graph-content.test.jsx — Sprint V114 K1.
 *
 * ZoneGraphContent is the graph core extracted from CanvasGraphView (DAG
 * view): given already-filtered containers/operations it builds the bipartite
 * graph via canvas-layout helpers, lays it out with the local dagre, and draws
 * the SVG edge layer + ContainerBlock/OperationNode nodes. Interactions are
 * optional callbacks. The DAG view's own tests (skeleton-canvas-graph,
 * skeleton-drop-from-tree) guard that the extraction stays identical.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ZoneGraphContent from '../canvas/ZoneGraphContent';

afterEach(cleanup);

const C1 = {
  id: 'c1', kind: 'molecule', name: 'Backbone', sequence: 'ATGCATGCATGC', length: 12, topology: { circular: true },
};
const C2 = {
  id: 'c2', kind: 'molecule', name: 'Insert', sequence: 'TTTTGGGGCCCC', length: 12, topology: { circular: false },
};
const OP1 = { id: 'op1', kind: 'pcr', inputs: ['c1'], outputs: ['c2'] };
// placeholder = empty sequence (isPlaceholderContainer) → skipped in render.
const PH = { id: 'ph1', kind: 'molecule', name: 'empty', sequence: '', origin: { kind: 'placeholder' } };

describe('ZoneGraphContent — V114 K1 extracted graph renderer', () => {
  it('happy path: containers + operation render as blocks + op-node + edges', () => {
    const { container } = render(<ZoneGraphContent containers={[C1, C2]} operations={[OP1]} />);
    expect(screen.getByTestId('zone-graph-content')).toBeTruthy();
    expect(screen.getByTestId('skeleton-block-c1')).toBeTruthy();
    expect(screen.getByTestId('skeleton-block-c2')).toBeTruthy();
    expect(screen.getByTestId('skeleton-op-node-op1')).toBeTruthy();
    // op1: inputs [c1] → edge c1→op1; outputs [c2] → edge op1→c2 ⇒ 2 edges.
    // (the arrowhead <path> lives inside <defs><marker>, no marker-end attr.)
    expect(container.querySelectorAll('path[marker-end]').length).toBe(2);
  });

  it('placeholder container is NOT rendered (empty sequence → skipped)', () => {
    render(<ZoneGraphContent containers={[PH]} operations={[]} />);
    expect(screen.getByTestId('zone-graph-content')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-block-ph1')).toBeNull();
  });

  it('empty graph renders without crashing and shows no nodes', () => {
    render(<ZoneGraphContent containers={[]} operations={[]} />);
    expect(screen.getByTestId('zone-graph-content')).toBeTruthy();
    expect(screen.queryByTestId(/^skeleton-block-/)).toBeNull();
    expect(screen.queryByTestId(/^skeleton-op-node-/)).toBeNull();
  });

  it('no callbacks passed → clicking a node does not throw (decorative)', () => {
    render(<ZoneGraphContent containers={[C1]} operations={[]} />);
    const block = screen.getByTestId('skeleton-block-c1');
    expect(() => fireEvent.click(block)).not.toThrow();
    expect(() => fireEvent.doubleClick(block)).not.toThrow();
    expect(screen.getByTestId('skeleton-block-c1')).toBeTruthy();
  });

  it('optional callbacks fire with the container id', () => {
    const onClick = vi.fn();
    const onDbl = vi.fn();
    render(
      <ZoneGraphContent
        containers={[C1]}
        operations={[]}
        onContainerClick={onClick}
        onContainerDoubleClick={onDbl}
      />,
    );
    const block = screen.getByTestId('skeleton-block-c1');
    fireEvent.click(block);
    fireEvent.doubleClick(block);
    expect(onClick).toHaveBeenCalledWith('c1');
    expect(onDbl).toHaveBeenCalledWith('c1');
  });
});
