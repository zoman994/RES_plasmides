/**
 * assembly-primer-design.test.jsx — A3 Primer Design on Assembly.
 *
 * A2 already shipped primer writing (slice, Ctrl+R/Ctrl+Alt+R,
 * onWritePrimer, cross-boundary detection, panel, persistence). A3 is
 * the REFINEMENT: boundary-aware primer tails (5' overhang), source
 * attachment metadata (segment vs boundary), pairId grouping, GC%,
 * status, selectBoundaryCoverage, richer panel + right-column toggle.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act, within,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { buildAssemblyPrimer } from '../lib/assembly-primer-utils';
import { selectBoundaryCoverage } from '../store/selectors-assembly';
import { reverseComplement } from '../../../sequence-utils';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

// Assembly: seg0 = 20 bp [0,20), seg1 = 16 bp [20,36).
const SEG0 = 'AAAACCCCGGGGTTTTAAAA';
const SEG1 = 'CCCCGGGGTTTTAAAA';
const ASM = SEG0 + SEG1;
const B = [
  { segmentId: 's0', startOnAssembly: 0, endOnAssembly: 20 },
  { segmentId: 's1', startOnAssembly: 20, endOnAssembly: 36 },
];

describe('A3.K1-K2 buildAssemblyPrimer (boundary-aware tails)', () => {
  it('within a single segment, forward: no tail, binding = slice', () => {
    const p = buildAssemblyPrimer({
      assemblySequence: ASM, boundaries: B, range: { start: 0, end: 20 }, direction: 'forward',
    });
    expect(p.source.kind).toBe('segment');
    expect(p.source.segmentId).toBe('s0');
    expect(p.bindingSequence).toBe(SEG0);
    expect(p.sequence).toBe(SEG0); // no tail
    expect(typeof p.gc).toBe('number');
  });

  it('within a single segment, reverse: binding = RC(slice)', () => {
    const p = buildAssemblyPrimer({
      assemblySequence: ASM, boundaries: B, range: { start: 0, end: 20 }, direction: 'reverse',
    });
    expect(p.bindingSequence).toBe(reverseComplement(SEG0));
    expect(p.sequence).toBe(reverseComplement(SEG0));
  });

  it('boundary forward: binding from left, 5′ tail = right segment start', () => {
    // range spans the 20-boundary: [10, 28)
    const p = buildAssemblyPrimer({
      assemblySequence: ASM, boundaries: B, range: { start: 10, end: 28 },
      direction: 'forward', tailLen: 6,
    });
    expect(p.source.kind).toBe('boundary');
    expect(p.source.leftSegmentId).toBe('s0');
    expect(p.source.rightSegmentId).toBe('s1');
    expect(p.bindingSequence).toBe(ASM.slice(10, 20)); // left part
    expect(p.sequence).toBe(ASM.slice(20, 26) + ASM.slice(10, 20)); // tail(6) + binding
  });

  it('boundary reverse: binding = RC(right part), tail = RC(left tail)', () => {
    const p = buildAssemblyPrimer({
      assemblySequence: ASM, boundaries: B, range: { start: 10, end: 28 },
      direction: 'reverse', tailLen: 6,
    });
    expect(p.bindingSequence).toBe(reverseComplement(ASM.slice(20, 28)));
    expect(p.sequence).toBe(
      reverseComplement(ASM.slice(14, 20)) + reverseComplement(ASM.slice(20, 28)),
    );
  });
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function mountDraft() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.createAssemblyDraft({ id: 'a3', name: 'A3' }); });
  act(() => { A.insertManualSegment('a3', { sequence: SEG0 }); });
  act(() => { A.insertManualSegment('a3', { sequence: SEG1 }); });
  act(() => { A.openEditorAssemblyTab('a3'); });
}
const prims = () => S.assemblyDraftPrimers.a3 || [];

describe('A3.K3-K5 reducer metadata + pairId grouping', () => {
  it('WRITE_ASSEMBLY_PRIMER attaches source/gc/status/label', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'a', name: 'A' });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'a', sequence: SEG0 });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'a', sequence: SEG1 });
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'a', range: { start: 0, end: 20 }, direction: 'forward',
    });
    const p = s.assemblyDraftPrimers.a[0];
    expect(p.source.kind).toBe('segment');
    expect(p.status).toBe('auto');
    expect(typeof p.gc).toBe('number');
    expect(p.label).toBe(p.name);
    expect(typeof p.pairId).toBe('string');
  });

  it('fwd + rev on the same boundary range get the SAME pairId', () => {
    mountDraft();
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 12, end: 30 }, direction: 'forward' }); });
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 12, end: 30 }, direction: 'reverse' }); });
    const ps = prims();
    expect(ps).toHaveLength(2);
    expect(ps[0].pairId).toBe(ps[1].pairId);
  });

  it('non-overlapping selections get DIFFERENT pairIds', () => {
    mountDraft();
    // [0,18) within seg0 (segment-kind); [18,36) spans the boundary
    // (boundary-kind) — disjoint + different source.kind ⇒ distinct.
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 0, end: 18 }, direction: 'forward' }); });
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 18, end: 36 }, direction: 'reverse' }); });
    const ps = prims();
    expect(ps).toHaveLength(2);
    expect(ps[0].pairId).not.toBe(ps[1].pairId);
  });

  it('updateAssemblyPrimer (manual sequence) sets status=edited', () => {
    mountDraft();
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 0, end: 20 }, direction: 'forward' }); });
    const id = prims()[0].id;
    act(() => { A.updateAssemblyPrimer('a3', id, { sequence: 'ATCGATCGATCGATCGATCG' }); });
    const p = prims()[0];
    expect(p.sequence).toBe('ATCGATCGATCGATCGATCG');
    expect(p.status).toBe('edited');
  });
});

describe('A3.K6-K7 AssemblyPrimerPanel (pairs / rename / edit / coverage)', () => {
  function writePair() {
    mountDraft();
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 12, end: 30 }, direction: 'forward' }); });
    act(() => { A.writeAssemblyPrimer({ draftId: 'a3', range: { start: 12, end: 30 }, direction: 'reverse' }); });
  }

  it('groups fwd+rev with same pairId into one pair card', () => {
    writePair();
    const panel = screen.getByTestId('assembly-primers-panel');
    expect(within(panel).getAllByTestId('assembly-primer-pair')).toHaveLength(1);
  });

  it('header shows primer count + boundary coverage', () => {
    writePair();
    const panel = screen.getByTestId('assembly-primers-panel');
    const hdr = within(panel).getByTestId('assembly-primers-header').textContent;
    expect(hdr).toMatch(/2/); // 2 primers
    expect(hdr).toMatch(/1\s*\/\s*1/); // 1/1 boundary covered (fwd+rev)
  });

  it('inline rename updates the primer label', () => {
    writePair();
    const panel = screen.getByTestId('assembly-primers-panel');
    const rn = within(panel).getAllByTestId('assembly-primer-rename')[0];
    act(() => { fireEvent.click(rn); });
    const input = within(panel).getByTestId('assembly-primer-rename-input');
    act(() => { fireEvent.change(input, { target: { value: 'GibF' } }); });
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect((S.assemblyDraftPrimers.a3.find((p) => p.direction === 'forward')).label).toBe('GibF');
  });

  it('edit-sequence modal manual override sets status=edited', () => {
    writePair();
    const panel = screen.getByTestId('assembly-primers-panel');
    act(() => { fireEvent.click(within(panel).getAllByTestId('assembly-primer-edit')[0]); });
    const modal = screen.getByTestId('assembly-primer-edit-modal');
    act(() => { fireEvent.change(within(modal).getByTestId('assembly-primer-edit-seq'), { target: { value: 'gggcccaaatttgggcccaa' } }); });
    act(() => { fireEvent.click(within(modal).getByTestId('assembly-primer-edit-save')); });
    const p = S.assemblyDraftPrimers.a3.find((x) => x.direction === 'forward');
    expect(p.sequence).toBe('GGGCCCAAATTTGGGCCCAA');
    expect(p.status).toBe('edited');
  });

  it('Boundaries tab lists coverage rows', () => {
    writePair();
    const panel = screen.getByTestId('assembly-primers-panel');
    act(() => { fireEvent.click(within(panel).getByTestId('assembly-primers-tab-boundaries')); });
    expect(within(panel).getAllByTestId('assembly-boundary-row').length).toBeGreaterThanOrEqual(1);
  });
});

describe('A3.K4 selectBoundaryCoverage', () => {
  it('reports fwd/rev coverage per boundary', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'c', name: 'C' });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'c', sequence: SEG0 });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'c', sequence: SEG1 });
    // boundary at offset 20: write a forward boundary primer only.
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'c', range: { start: 12, end: 30 }, direction: 'forward',
    });
    const cov = selectBoundaryCoverage(s, 'c');
    expect(cov).toHaveLength(1); // one internal boundary
    expect(cov[0].fwd).toBe(true);
    expect(cov[0].rev).toBe(false);
  });
});
