/**
 * zone-frame-graph-render.test.jsx — Sprint V114 K2.
 *
 * ZoneFrame graph-mode body now mounts ZoneGraphContent with the zone's nodes
 * (nodeListInZone by zoneId) instead of the old ZoneLaneDivider stub — so the
 * Layout canvas shows the realise result (containers + operations) inside the
 * zone frame. Closes BUGS V114 (zone graph-render): after «Реализовать» the
 * canvas was empty.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import ZoneFrame from '../canvas/ZoneFrame';

afterEach(cleanup);

const C = (id, zoneId, name) => ({
  id, kind: 'molecule', name, sequence: 'ATGCATGCATGC', length: 12, topology: { circular: false }, zoneId,
});
const zoneZ1 = {
  id: 'z1', name: 'Assembly', bounds: { x: 0, y: 0, width: 400, height: 300 }, viewMode: 'graph',
};
const zoneZ2 = {
  id: 'z2', name: 'Other', bounds: { x: 500, y: 0, width: 300, height: 200 }, viewMode: 'graph',
};
const baseState = () => ({
  containers: [C('c1', 'z1', 'Backbone'), C('c2', 'z1', 'Insert'), C('cX', 'z2', 'Foreign')],
  operations: [
    { id: 'op1', kind: 'pcr', inputs: ['c1'], outputs: ['c2'], zoneId: 'z1' },
    { id: 'opX', kind: 'pcr', inputs: ['cX'], outputs: [], zoneId: 'z2' },
  ],
  pieces: [],
  zones: [zoneZ1, zoneZ2],
  highlightedContainerId: null,
});

describe('ZoneFrame — V114 K2 graph-mode renders the zone graph', () => {
  it('renders the zone containers + operation inside the frame (graph-mode)', () => {
    render(<ZoneFrame zone={zoneZ1} state={baseState()} dispatch={vi.fn()} nodeCount={3} />);
    const frame = screen.getByTestId('zone-frame-z1');
    expect(within(frame).getByTestId('zone-graph-content')).toBeTruthy();
    expect(within(frame).getByTestId('skeleton-block-c1')).toBeTruthy();
    expect(within(frame).getByTestId('skeleton-block-c2')).toBeTruthy();
    expect(within(frame).getByTestId('skeleton-op-node-op1')).toBeTruthy();
  });

  it('nodes from another zone do NOT leak into this frame', () => {
    render(<ZoneFrame zone={zoneZ1} state={baseState()} dispatch={vi.fn()} nodeCount={3} />);
    expect(screen.queryByTestId('skeleton-block-cX')).toBeNull();
    expect(screen.queryByTestId('skeleton-op-node-opX')).toBeNull();
  });

  it('ZoneLaneDivider is no longer rendered in graph-mode', () => {
    render(<ZoneFrame zone={zoneZ1} state={baseState()} dispatch={vi.fn()} nodeCount={3} />);
    expect(screen.queryByTestId('zone-lane-divider')).toBeNull();
  });

  it('double-click a container dispatches OPEN_EDITOR_VIEW_ONLY', () => {
    const dispatch = vi.fn();
    render(<ZoneFrame zone={zoneZ1} state={baseState()} dispatch={dispatch} nodeCount={3} />);
    fireEvent.doubleClick(screen.getByTestId('skeleton-block-c1'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_EDITOR_VIEW_ONLY', containerId: 'c1' });
  });

  it('sequence-mode is untouched: ZoneSequenceMode mounts, no graph content', () => {
    render(
      <ZoneFrame
        zone={{ ...zoneZ1, viewMode: 'sequence' }}
        state={baseState()}
        dispatch={vi.fn()}
        nodeCount={3}
      />,
    );
    expect(screen.getByTestId('zone-seq-root')).toBeTruthy();
    expect(screen.queryByTestId('zone-graph-content')).toBeNull();
  });

  it('header + counter still render (regression)', () => {
    render(<ZoneFrame zone={zoneZ1} state={baseState()} dispatch={vi.fn()} nodeCount={3} />);
    expect(screen.getByTestId('zone-header-z1')).toBeTruthy();
    expect(screen.getByTestId('zone-counter-z1')).toBeTruthy();
  });
});
