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

describe('PRIMER-TAIL-SAVE-1 — WRITE_ASSEMBLY_PRIMER preserves the 5′ tail', () => {
  // seg0 = SEG0 (20 bp) [0,20); seg1 = SEG1 (16 bp) [20,36).
  function draftWithSegments() {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'a', name: 'A' });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'a', sequence: SEG0 });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'a', sequence: SEG1 });
    return s;
  }

  it('an explicit 5′ tail on create is stored as an overhang, not folded into the binding', () => {
    let s = draftWithSegments();
    const tail = 'GGGGCCCC';
    const binding = SEG0; // the annealed region for range [0,20)
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      range: { start: 0, end: 20 },
      direction: 'forward',
      tail,
      binding,
      sequence: tail + binding,
    });
    const ps = s.assemblyDraftPrimers.a;
    expect(ps).toHaveLength(1);
    const p = ps[0];
    expect(p.tail).toBe(tail); // the tail is kept as an overhang…
    expect(p.bindingSequence).toBe(binding); // …NOT absorbed into the binding
    expect(p.sequence).toBe(tail + binding);
    expect(p.status).toBe('edited');
  });

  it('saving an existing primer (primerId) edits it in place — no duplicate, anchor preserved, tail kept', () => {
    let s = draftWithSegments();
    // Auto forward primer within seg0 (tail-less to start).
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'a', range: { start: 0, end: 20 }, direction: 'forward',
    });
    const before = s.assemblyDraftPrimers.a[0];
    expect(before.tail).toBe('');
    const {
      id, pairId, source, range,
    } = before;
    const binding = before.bindingSequence; // unchanged annealed region
    const tail = 'TTTTGGGG';
    // Re-open, add a 5′ tail, Save → carries primerId + the canonical split.
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      primerId: id,
      range: { start: 0, end: 20 },
      direction: 'forward',
      tail,
      binding,
      sequence: tail + binding,
      bindingModel: 'aligned-v1',
    });
    const after = s.assemblyDraftPrimers.a;
    expect(after).toHaveLength(1); // edited in place, not duplicated
    expect(after[0].id).toBe(id); // the SAME record
    expect(after[0].pairId).toBe(pairId); // pair identity preserved
    expect(after[0].source).toEqual(source); // source anchor preserved
    expect(after[0].range).toEqual(range); // range preserved
    expect(after[0].tail).toBe(tail); // the tail survives
    expect(after[0].bindingSequence).toBe(binding);
    expect(after[0].sequence).toBe(tail + binding);
    expect(after[0].bindingModel).toBe('aligned-v1'); // aligned-v1 model preserved
    expect(after[0].status).toBe('edited');
  });

  it('a conflicting edited sequence (≠ tail + binding) fails closed — record left unchanged', () => {
    let s = draftWithSegments();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'a', range: { start: 0, end: 20 }, direction: 'forward',
    });
    const before = s.assemblyDraftPrimers.a[0];
    const s2 = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      primerId: before.id,
      range: { start: 0, end: 20 },
      direction: 'forward',
      tail: 'GGGG',
      binding: SEG0,
      sequence: 'ACGT', // sequence disagrees with tail + binding → unusable
    });
    const after = s2.assemblyDraftPrimers.a;
    expect(after).toHaveLength(1); // no duplicate, no invented record
    expect(after[0].tail).toBe(''); // unchanged (no invented / re-anchored bases)
    expect(after[0].sequence).toBe(before.sequence);
  });
});

describe('PRIMER-TAIL-SAVE-1 CORRECTION — reducer contract', () => {
  function draftWithPrimer() {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'a', name: 'A' });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'a', sequence: SEG0 });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'a', sequence: SEG1 });
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'a', range: { start: 0, end: 20 }, direction: 'forward',
    });
    return s;
  }

  // A — stale primerId: no create, no mutation.
  it('A: a stale primerId (record gone) fails closed — no new primer is created', () => {
    const s = draftWithPrimer();
    const before = s.assemblyDraftPrimers.a;
    const s2 = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      primerId: 'nonexistent-id',
      range: { start: 0, end: 20 },
      direction: 'forward',
      binding: SEG0,
      sequence: SEG0,
    });
    expect(s2.assemblyDraftPrimers.a).toHaveLength(before.length); // unchanged
    expect(s2.assemblyDraftPrimers.a[0].id).toBe(before[0].id); // same record
  });

  // B — tm: explicit finite replaces; explicit null clears; omitted preserves.
  it('B: explicit finite tm replaces old tm on edit', () => {
    let s = draftWithPrimer();
    const original = s.assemblyDraftPrimers.a[0];
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      primerId: original.id,
      range: { start: 0, end: 20 },
      direction: 'forward',
      binding: SEG0,
      sequence: SEG0,
      tm: 58.5,
    });
    expect(s.assemblyDraftPrimers.a[0].tm).toBe(58.5);
  });

  it('B: explicit tm:null clears Tm (indel/mismatch model)', () => {
    let s = draftWithPrimer();
    const original = s.assemblyDraftPrimers.a[0];
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      primerId: original.id,
      range: { start: 0, end: 20 },
      direction: 'forward',
      binding: SEG0,
      sequence: SEG0,
      tm: null,
    });
    expect(s.assemblyDraftPrimers.a[0].tm).toBeNull();
  });

  it('B: omitted tm preserves existing tm on edit', () => {
    let s = draftWithPrimer();
    const original = s.assemblyDraftPrimers.a[0];
    const prevTm = original.tm;
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'a',
      primerId: original.id,
      range: { start: 0, end: 20 },
      direction: 'forward',
      binding: SEG0,
      sequence: SEG0,
      // tm intentionally omitted
    });
    expect(s.assemblyDraftPrimers.a[0].tm).toBe(prevTm);
  });

  // C — sequence-only write with a non-empty fallback tail clears the tail.
  it('C: legacy sequence-only write with a non-empty fallback tail clears tail (sequence = binding, tail = empty)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'b', name: 'B' });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'b', sequence: SEG0 });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'b', sequence: SEG1 });
    // Write a primer that has a tail in its initial record.
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'b',
      range: { start: 0, end: 20 },
      direction: 'forward',
      tail: 'GGGG',
      binding: SEG0,
      sequence: 'GGGG' + SEG0,
    });
    const primer = s.assemblyDraftPrimers.b[0];
    expect(primer.tail).toBe('GGGG'); // sanity — initial state has tail

    // Now edit with a sequence-only override (no explicit binding).
    // The fallback fb.tail must NOT be retained — it would make sequence ≠ tail + binding.
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: 'b',
      primerId: primer.id,
      range: { start: 0, end: 20 },
      direction: 'forward',
      sequence: SEG0, // sequence-only, no `binding` field
    });
    const after = s.assemblyDraftPrimers.b[0];
    expect(after.tail).toBe(''); // tail cleared — no inconsistent split
    expect(after.bindingSequence).toBe(SEG0);
    expect(after.sequence).toBe(SEG0);
  });
});
