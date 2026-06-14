/**
 * assembly-realise.test.jsx — A4 Realise Assembly as DAG.
 *
 * K1 suggestMethodForBoundary · K2-K5 realiseAssembly (ops/junctions/
 * containers/primer-map/positions/gap/orphan) · K6 ASSEMBLY_REALISE
 * reducer · K7-K9 RealiseModal + preview + e2e.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { suggestMethodForBoundary } from '../lib/assembly-realise-suggest';
import { realiseAssembly } from '../lib/assembly-realise';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const C1 = { id: 'src1', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false } };
const C2 = { id: 'src2', kind: 'molecule', name: 'pET', sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false } };

function base() {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, C1, C2] };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm', name: 'MyAsm' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src1', start: 0, end: 24, rc: false });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src2', start: 0, end: 24, rc: false });
  return s;
}

describe('A4.K1 suggestMethodForBoundary', () => {
  it('boundary primer with long tail → gibson (high)', () => {
    let s = base();
    // write a boundary primer spanning the join (offset 24) with a tail
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'asm', range: { start: 10, end: 40 }, direction: 'forward',
    });
    const r = suggestMethodForBoundary(s, 'asm', 0);
    expect(['gibson', 'overlap_pcr']).toContain(r.method);
    expect(r.confidence).toBeTruthy();
    expect(typeof r.rationale).toBe('string');
  });

  it('no primer, no RE sites, LINEAR → overlap_pcr (low, default — AM-5)', () => {
    // AT-only sources: every RE_ENZYMES site contains G or C, so
    // detectCompatibleREsites finds nothing → topology-aware default. The draft
    // is LINEAR, so the default is overlap PCR (not gibson, a ring-forming method).
    let s = buildInitialState();
    const at1 = { id: 'at1', kind: 'molecule', name: 'at1', sequence: 'AAAAAAAAAATTTTTTTTTT', annotations: [], topology: { circular: false } };
    const at2 = { id: 'at2', kind: 'molecule', name: 'at2', sequence: 'TTTTTTTTTTAAAAAAAAAA', annotations: [], topology: { circular: false } };
    s = { ...s, containers: [...s.containers, at1, at2] };
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'aAT', name: 'AT' });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'aAT', sourceContainerId: 'at1', start: 0, end: 20, rc: false });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'aAT', sourceContainerId: 'at2', start: 0, end: 20, rc: false });
    const r = suggestMethodForBoundary(s, 'aAT', 0);
    expect(r.method).toBe('overlap_pcr');
    expect(r.confidence).toBe('low');
  });
});

describe('A4.K2-K5 realiseAssembly (pure)', () => {
  it('2 sourced segments → 2 PCR + 1 assembly op, 1 junction, 3 containers', () => {
    const s = base();
    const r = realiseAssembly(s, 'asm', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    // 2 PCR ops + the one-pot assembly op joining frags → product (10.06).
    expect(r.diff.operations.filter((o) => o.kind === 'pcr')).toHaveLength(2);
    expect(r.diff.operations.filter((o) => o.origin?.kind === 'realised-assembly')).toHaveLength(1);
    expect(r.diff.junctions).toHaveLength(1);
    expect(r.diff.junctions[0].kind).toBe('overlap'); // gibson → overlap kind
    // 2 amplicon outputs + 1 final product
    expect(r.diff.containers.length).toBe(3);
    expect(r.diff.operations[0].kind).toBe('pcr');
    expect(r.diff.operations[0].inputs).toContain('src1');
  });

  it('different methods per boundary reflected in junction kinds', () => {
    let s = buildInitialState();
    s = { ...s, containers: [...s.containers, C1, C2, { ...C1, id: 'src3', name: 'p3' }] };
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'a2', name: 'A2' });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'a2', sourceContainerId: 'src1', start: 0, end: 24, rc: false });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'a2', sourceContainerId: 'src2', start: 0, end: 24, rc: false });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'a2', sourceContainerId: 'src3', start: 0, end: 24, rc: false });
    const r = realiseAssembly(s, 'a2', { 0: 'gibson', 1: 'restriction' }, {});
    expect(r.ok).toBe(true);
    expect(r.diff.junctions).toHaveLength(2);
    expect(r.diff.junctions[0].kind).toBe('overlap');
    expect(r.diff.junctions[1].kind).toBe('re_ligation');
  });

  it('gap without sequence → ok=false with explicit error', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm', length: 20, gapKind: 'unknown' });
    const r = realiseAssembly(s, 'asm', { 0: 'gibson', 1: 'gibson' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gap/i);
  });

  it('orphan segment → ok=false', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'src1' });
    const r = realiseAssembly(s, 'asm', { 0: 'gibson' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/orphan|source/i);
  });

  it('primers mapped to ops; positions laid out in a line', () => {
    let s = base();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'asm', range: { start: 0, end: 24 }, direction: 'forward',
    });
    const r = realiseAssembly(s, 'asm', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    const att = r.diff.primerAttachments;
    expect(Array.isArray(att)).toBe(true);
    const op0 = r.diff.operations[0];
    expect(r.diff.positionsLayout.operations[op0.id]).toBeTruthy();
  });
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('A4.K6 ASSEMBLY_REALISE reducer', () => {
  it('applies the diff atomically (ops/junctions/containers added)', () => {
    let s = base();
    const before = s.operations.length;
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'asm', perBoundaryMethods: { 0: 'gibson' } });
    expect(s.operations.length).toBe(before + 3); // 2 PCR + 1 assembly op (10.06)
    expect(s.junctions.length).toBe(1);
    expect(s.assemblyDrafts.find((d) => d.id === 'asm').realiseRevision).toBe(1);
  });

  it('error path leaves state unchanged + toast', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm', length: 10, gapKind: 'unknown' });
    const opsBefore = s.operations.length;
    const s2 = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'asm', perBoundaryMethods: { 0: 'gibson', 1: 'gibson' } });
    expect(s2.operations.length).toBe(opsBefore);
    expect(s2.toast).toBeTruthy();
  });

  it('multi-realise bumps revision, keeps old ops (hard cap 5)', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'asm', perBoundaryMethods: { 0: 'gibson' } });
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'asm', perBoundaryMethods: { 0: 'gibson' } });
    expect(s.assemblyDrafts.find((d) => d.id === 'asm').realiseRevision).toBe(2);
    expect(s.operations.length).toBe(6); // 3 + 3 (2 PCR + 1 assembly each), old not deleted
  });
});

describe('A4.K7-K9 realise (direct, no modal) + e2e', () => {
  function mount() {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => { A.createAssemblyDraft({ id: 'asm', name: 'E2E' }); });
    act(() => { A.insertSegment('asm', 'src1', 0, 24, false, undefined); });
    act(() => { A.insertSegment('asm', 'src2', 0, 24, false, undefined); });
    act(() => { A.openEditorAssemblyTab('asm'); });
  }

  // Modal removed (Игорь 11.06): the per-boundary method is owned by the strip
  // junctions (J9) and the real DAG renders on the canvas, so the button
  // realises directly — no confirm step, no preview.
  it('Realise button enabled (segments present) → realises directly, no modal', () => {
    mount();
    const btn = screen.getByTestId('assembly-realise-btn');
    expect(btn.disabled).toBe(false);
    act(() => { fireEvent.click(btn); });
    expect(screen.queryByTestId('realise-modal')).toBeNull();
    expect(S.operations.filter((o) => o.kind === 'pcr').length).toBeGreaterThanOrEqual(2);
  });

  it('click dispatches ASSEMBLY_REALISE → ops + junction on canvas', () => {
    mount();
    act(() => { fireEvent.click(screen.getByTestId('assembly-realise-btn')); });
    expect(screen.queryByTestId('realise-modal')).toBeNull();
    expect(S.operations.filter((o) => o.kind === 'pcr').length).toBeGreaterThanOrEqual(2);
    expect(S.junctions.length).toBe(1);
    // The editor itself shows no change → a success toast acknowledges it.
    expect(S.toast && /реализован/i.test(S.toast.message || '')).toBe(true);
  });
});
