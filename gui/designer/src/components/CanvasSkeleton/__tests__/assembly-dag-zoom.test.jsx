/**
 * assembly-dag-zoom.test.jsx — M-WORKSPACE R2 «DAG-зум».
 *
 * The DAG view tab gains the same zoom/pan affordances the retired multi-zone
 * canvas had (wheel-zoom-to-cursor + −/%/+/fit controls), so a large realise
 * graph is navigable inside the tab. The focal-zoom + fit math is the shared,
 * already-tested pure layer (zoomAtPoint / fitZoomToContent / graphContentBBox);
 * here we assert the view wires the controls and the empty state hides them.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions,
} from '../store/skeleton-context';
import AssemblyDagView from '../workspace/AssemblyDagView';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
function H() { A = useSkeletonActions(); return null; }

const C = (id, zoneId, name) => ({
  id, kind: 'molecule', name, sequence: 'ATGCATGCATGC', length: 12, topology: { circular: false }, zoneId,
});

// A zone with a real graph: src → PCR → frag.
const seededState = () => ({
  containers: [C('c1', 'z1', 'Backbone'), C('c2', 'z1', 'Insert')],
  operations: [{ id: 'op1', kind: 'pcr', inputs: ['c1'], outputs: ['c2'], zoneId: 'z1' }],
  pieces: [],
  zones: [{ id: 'z1', name: 'Assembly', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
});

function mount(zoneId, seed) {
  render(
    <SkeletonProvider>
      <H />
      <AssemblyDagView zoneId={zoneId} />
    </SkeletonProvider>,
  );
  if (seed) act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: seed }); });
}

describe('M-WORKSPACE R2 — AssemblyDagView zoom', () => {
  it('with a graph: renders the DAG + zoom controls (out/reset/in/fit)', () => {
    mount('z1', seededState());
    expect(screen.getByTestId('assembly-dag-view')).toBeTruthy();
    expect(screen.getByTestId('zone-graph-content')).toBeTruthy();
    expect(screen.getByTestId('assembly-dag-zoom-controls')).toBeTruthy();
    expect(screen.getByTestId('assembly-dag-zoom-out')).toBeTruthy();
    expect(screen.getByTestId('assembly-dag-zoom-in')).toBeTruthy();
    expect(screen.getByTestId('assembly-dag-zoom-reset')).toBeTruthy();
    expect(screen.getByTestId('assembly-dag-zoom-fit')).toBeTruthy();
  });

  it('zoom-in raises the scroll host data-zoom; reset returns it to 1', () => {
    mount('z1', seededState());
    const host = screen.getByTestId('assembly-dag-scroll');
    expect(parseFloat(host.getAttribute('data-zoom'))).toBeCloseTo(1, 3);
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-zoom-in')); });
    expect(parseFloat(host.getAttribute('data-zoom'))).toBeGreaterThan(1);
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-zoom-reset')); });
    expect(parseFloat(host.getAttribute('data-zoom'))).toBeCloseTo(1, 3);
  });

  it('zoom-out lowers the data-zoom below 1', () => {
    mount('z1', seededState());
    const host = screen.getByTestId('assembly-dag-scroll');
    act(() => { fireEvent.click(screen.getByTestId('assembly-dag-zoom-out')); });
    expect(parseFloat(host.getAttribute('data-zoom'))).toBeLessThan(1);
  });

  it('empty zone: shows the hint, no zoom controls', () => {
    mount('z1', {
      containers: [], operations: [], pieces: [],
      zones: [{ id: 'z1', name: 'Empty', bounds: { x: 0, y: 0, width: 400, height: 300 } }],
    });
    expect(screen.getByTestId('assembly-dag-view')).toBeTruthy();
    expect(screen.queryByTestId('assembly-dag-zoom-controls')).toBeNull();
    expect(screen.queryByTestId('zone-graph-content')).toBeNull();
  });
});
