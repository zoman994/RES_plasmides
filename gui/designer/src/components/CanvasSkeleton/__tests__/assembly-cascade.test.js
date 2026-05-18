/**
 * assembly-cascade.test.js — A1 K6: REMOVE_CONTAINER keep-with-warning
 * cascade + hard-cap enforcement on the assemblyDrafts slice.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { computeAssemblySequence } from '../lib/assembly-model';
import { selectAssemblyDraftById } from '../store/selectors-assembly';
import { ASM_CAPS } from '../lib/assembly-invariants';

function withSourced() {
  let s = buildInitialState();
  s = {
    ...s,
    containers: [...s.containers, { id: 'c1', name: 'pUC', sequence: 'AAAACCCCGGGG', annotations: [] }],
  };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm-1', sourceContainerId: 'c1', start: 4, end: 8 });
  return s;
}

describe('K6 REMOVE_CONTAINER keep-with-warning cascade', () => {
  it('segment kept, flagged source-unavailable, cached sequence survives, warn toast', () => {
    let s = withSourced();
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c1' });
    const d = selectAssemblyDraftById(s, 'asm-1');
    expect(d.segments).toHaveLength(1);                 // NOT removed
    expect(d.segments[0].source.unavailable).toBe(true);
    expect(d.segments[0].sequence).toBe('CCCC');         // cached survives
    const r = computeAssemblySequence(d);
    expect(r.sequence).toBe('CCCC');
    expect(r.orphans).toEqual([{ segmentId: d.segments[0].id, reason: 'source-unavailable' }]);
    expect(s.toast).toMatchObject({ kind: 'warning' });
  });

  it('REMOVE_CONTAINER for an unrelated container → assembly slice identity preserved', () => {
    let s = withSourced();
    const before = s.assemblyDrafts;
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'not-used' });
    expect(s.assemblyDrafts).toBe(before);
  });

  it('idempotent — second REMOVE_CONTAINER does not re-toast / re-touch', () => {
    let s = withSourced();
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c1' });
    const after1 = s.assemblyDrafts;
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c1' });
    expect(s.assemblyDrafts).toBe(after1);               // already flagged → no change
  });

  it('hard-cap segment count: over ASM_CAPS.segmentsHard rejected', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
    // Stuff the draft directly past the cap, then attempt one more via reducer.
    const big = { ...s.assemblyDrafts[0] };
    big.segments = Array.from({ length: ASM_CAPS.segmentsHard }, (_, i) => ({
      id: `seg-${i}`, source: { type: 'manual' }, sequence: 'A', length: 1, annotations: [],
    }));
    s = { ...s, assemblyDrafts: [big] };
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm-1', sequence: 'C' });
    expect(s.assemblyDrafts[0].segments).toHaveLength(ASM_CAPS.segmentsHard); // rejected
    expect(s.toast).toMatchObject({ kind: 'error' });
  });
});
