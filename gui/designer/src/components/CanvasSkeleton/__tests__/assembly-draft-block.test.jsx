/**
 * assembly-draft-block.test.jsx — A1 K7: minimal read-only
 * AssemblyDraftBlock + CanvasLayoutView render/drag wiring + «+ Сборка».
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import AssemblyDraftBlock from '../canvas/AssemblyDraftBlock';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import { SkeletonProvider, useSkeletonActions, useSkeletonState } from '../store/skeleton-context';
import { createDraft, addSegment, makeManualSegment, makeSourcedSegment } from '../lib/assembly-model';

afterEach(cleanup);

function draftWith2() {
  let d = createDraft({ name: 'My assembly' });
  d = addSegment(d, makeManualSegment({ sequence: 'AAAATTTT' }));
  d = addSegment(d, makeManualSegment({ sequence: 'GG' }));
  return d;
}

describe('K7 AssemblyDraftBlock (read-only)', () => {
  it('renders header, coloured zones (one per segment), footer count', () => {
    const d = draftWith2();
    render(<AssemblyDraftBlock draft={d} />);
    expect(screen.getByTestId(`assembly-draft-block-${d.id}`)).toBeTruthy();
    expect(screen.getByText(/My assembly/)).toBeTruthy();
    expect(screen.getByText(/10 bp · linear/)).toBeTruthy();
    const zones = screen.getAllByTestId('assembly-zone');
    expect(zones).toHaveLength(2);
    expect(screen.getByText(/2 сегм\./)).toBeTruthy();
  });

  it('shows orphan warning when a sourced segment lost its source', () => {
    let d = createDraft();
    const C = { id: 'c1', name: 'p', sequence: 'AAAACCCC', annotations: [] };
    d = addSegment(d, makeSourcedSegment({ sourceContainer: C, start: 0, end: 4 }));
    d.segments[0].source.unavailable = true;
    render(<AssemblyDraftBlock draft={d} />);
    expect(screen.getByTestId(`assembly-orphan-warn-${d.id}`)).toBeTruthy();
  });
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('K7 canvas integration', () => {
  it('createAssemblyDraft(position) → block rendered on CanvasLayoutView', () => {
    render(<SkeletonProvider><H /><CanvasLayoutView /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ name: 'OnCanvas', position: { x: 40, y: 40 } }); });
    const d = S.assemblyDrafts[0];
    expect(d.position).toEqual({ x: 40, y: 40 });
    expect(screen.getByTestId(`assembly-draft-wrap-${d.id}`)).toBeTruthy();
    expect(screen.getByTestId(`assembly-draft-block-${d.id}`)).toBeTruthy();
  });

  it('draft without position is NOT rendered on canvas (drafts-panel only)', () => {
    render(<SkeletonProvider><H /><CanvasLayoutView /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ name: 'PanelOnly' }); }); // position null
    const d = S.assemblyDrafts[0];
    expect(d.position).toBeNull();
    expect(screen.queryByTestId(`assembly-draft-wrap-${d.id}`)).toBeNull();
  });

  it('pointer-drag the block updates its position via setAssemblyDraftPosition', () => {
    render(<SkeletonProvider><H /><CanvasLayoutView /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ name: 'Drag', position: { x: 10, y: 10 } }); });
    const id = S.assemblyDrafts[0].id;
    const wrap = screen.getByTestId(`assembly-draft-wrap-${id}`);
    act(() => { fireEvent.pointerDown(wrap, { button: 0, clientX: 12, clientY: 12 }); });
    const root = screen.getByTestId('skeleton-canvas-layout');
    act(() => { fireEvent.pointerMove(root, { clientX: 120, clientY: 90 }); });
    act(() => { fireEvent.pointerUp(root, { clientX: 120, clientY: 90 }); });
    const pos = S.assemblyDrafts[0].position;
    expect(pos.x).not.toBe(10);
  });
});
