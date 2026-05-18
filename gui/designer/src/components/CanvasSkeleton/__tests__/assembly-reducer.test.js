/**
 * assembly-reducer.test.js — A1 K2: state.assemblyDrafts sub-reducer via
 * the public skeletonReducer (also exercises router wiring + invariant
 * gate + toast-on-error).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { ASM_CAPS } from '../lib/assembly-invariants';

function baseState() {
  const s = buildInitialState();
  return {
    ...s,
    containers: [
      ...s.containers,
      { id: 'c1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [] },
    ],
  };
}
const make = (st, action) => skeletonReducer(st, action);

describe('K2 assemblyDrafts reducer', () => {
  it('initial state has empty assemblyDrafts slice', () => {
    expect(buildInitialState().assemblyDrafts).toEqual([]);
  });

  it('CREATE_ASSEMBLY_DRAFT adds a draft (id honoured)', () => {
    const s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-x', name: 'D' });
    expect(s.assemblyDrafts).toHaveLength(1);
    expect(s.assemblyDrafts[0].id).toBe('asm-x');
    expect(s.assemblyDrafts[0].name).toBe('D');
  });

  it('RENAME / SET_TOPOLOGY / SET_POSITION mutate the draft', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    s = make(s, { type: 'RENAME_ASSEMBLY_DRAFT', draftId: 'asm-1', name: 'New' });
    s = make(s, { type: 'SET_ASSEMBLY_DRAFT_TOPOLOGY', draftId: 'asm-1', circular: true });
    s = make(s, { type: 'SET_ASSEMBLY_DRAFT_POSITION', draftId: 'asm-1', position: { x: 9, y: 8 } });
    const d = s.assemblyDrafts[0];
    expect(d.name).toBe('New');
    expect(d.topology.circular).toBe(true);
    expect(d.position).toEqual({ x: 9, y: 8 });
  });

  it('INSERT_SEGMENT resolves the container reducer-side + caches slice', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    s = make(s, {
      type: 'INSERT_SEGMENT', draftId: 'asm-1',
      sourceContainerId: 'c1', start: 4, end: 8, rc: false,
    });
    const seg = s.assemblyDrafts[0].segments[0];
    expect(seg.source).toMatchObject({ type: 'container', containerId: 'c1' });
    expect(seg.sequence).toBe('CCCC');
  });

  it('INSERT_SEGMENT unknown container → state unchanged + error toast', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    const before = s.assemblyDrafts[0];
    s = make(s, { type: 'INSERT_SEGMENT', draftId: 'asm-1', sourceContainerId: 'nope', start: 0, end: 4 });
    expect(s.assemblyDrafts[0]).toBe(before);
    expect(s.toast).toMatchObject({ kind: 'error' });
  });

  it('INSERT_MANUAL_SEGMENT + REMOVE_SEGMENT + REORDER + UPDATE + SPLIT', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    s = make(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm-1', sequence: 'AAAATTTT' });
    s = make(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm-1', sequence: 'GG' });
    let segs = s.assemblyDrafts[0].segments;
    expect(segs.map((x) => x.sequence)).toEqual(['AAAATTTT', 'GG']);
    s = make(s, { type: 'REORDER_SEGMENTS', draftId: 'asm-1', fromIndex: 1, toIndex: 0 });
    expect(s.assemblyDrafts[0].segments.map((x) => x.sequence)).toEqual(['GG', 'AAAATTTT']);
    s = make(s, {
      type: 'SPLIT_SEGMENT', draftId: 'asm-1',
      segmentId: s.assemblyDrafts[0].segments[1].id, atOffsetWithinSegment: 4,
    });
    expect(s.assemblyDrafts[0].segments.map((x) => x.sequence)).toEqual(['GG', 'AAAA', 'TTTT']);
    s = make(s, {
      type: 'UPDATE_SEGMENT', draftId: 'asm-1',
      segmentId: s.assemblyDrafts[0].segments[0].id, patch: { label: 'lk' },
    });
    expect(s.assemblyDrafts[0].segments[0].label).toBe('lk');
    s = make(s, {
      type: 'REMOVE_SEGMENT', draftId: 'asm-1',
      segmentId: s.assemblyDrafts[0].segments[0].id,
    });
    expect(s.assemblyDrafts[0].segments.map((x) => x.sequence)).toEqual(['AAAA', 'TTTT']);
  });

  it('TOGGLE_SEGMENT_RC reverse-complements the cached sequence', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    s = make(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm-1', sequence: 'AAAA' });
    const sid = s.assemblyDrafts[0].segments[0].id;
    s = make(s, { type: 'TOGGLE_SEGMENT_RC', draftId: 'asm-1', segmentId: sid });
    expect(s.assemblyDrafts[0].segments[0].sequence).toBe('TTTT');
    expect(s.assemblyDrafts[0].segments[0].reverseComplement).toBe(true);
  });

  it('REMOVE_ASSEMBLY_DRAFT removes it', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    s = make(s, { type: 'REMOVE_ASSEMBLY_DRAFT', draftId: 'asm-1' });
    expect(s.assemblyDrafts).toEqual([]);
  });

  it('hard-cap: manual segment over total length cap → unchanged + error toast', () => {
    let s = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    s = make(s, {
      type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm-1',
      length: ASM_CAPS.totalLengthHard + 10, gapKind: 'unknown',
    });
    expect(s.assemblyDrafts[0].segments).toHaveLength(0);
    expect(s.toast).toMatchObject({ kind: 'error' });
  });

  it('unknown / non-assembly action leaves slice identity', () => {
    const s0 = make(baseState(), { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    const s1 = make(s0, { type: 'SET_VIEW', view: 'graph' });
    expect(s1.assemblyDrafts).toBe(s0.assemblyDrafts);
  });
});
