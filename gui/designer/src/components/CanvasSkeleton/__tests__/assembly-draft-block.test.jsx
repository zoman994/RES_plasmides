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

