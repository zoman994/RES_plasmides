/**
 * circularize-realise-c2.test.js — M-CIRCULARIZE C2. The engine gap: realise
 * never created the closure junction (last fragment → first) for a circular
 * assembly, so «кольцевание» was cosmetic — the product got the circular flag
 * but no DAG edge modelled the ring closing. Now realiseAssembly emits the
 * closure join (role 'closure') when circular, and methodsFromJunctions includes
 * its method at index N−1 (allBoundaries order).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { realiseAssembly } from '../lib/assembly-realise';
import { methodsFromJunctions } from '../lib/junction-derive';

const C1 = { id: 'src1', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false } };
const C2 = { id: 'src2', kind: 'molecule', name: 'pET', sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false } };

function build(circular) {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, C1, C2] };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm', name: 'A' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src1', start: 0, end: 24, rc: false });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src2', start: 0, end: 24, rc: false });
  if (circular) s = skeletonReducer(s, { type: 'SET_ASSEMBLY_DRAFT_TOPOLOGY', draftId: 'asm', circular: true });
  return s;
}
const draftOf = (s) => s.assemblyDrafts.find((d) => d.id === 'asm');

describe('M-CIRCULARIZE C2 — realiseAssembly creates the closure junction', () => {
  it('circular → a CLOSURE junction joins the last fragment back to the first', () => {
    const r = realiseAssembly(build(true), 'asm', { 0: 'gibson', 1: 'restriction' }, {});
    expect(r.ok).toBe(true);
    const fragIds = r.diff.containers.filter((c) => /-frag-/.test(c.name)).map((c) => c.id);
    expect(fragIds).toHaveLength(2);
    const closure = r.diff.junctions.find((j) => j.realisedFrom && j.realisedFrom.role === 'closure');
    expect(closure).toBeTruthy();
    expect(closure.fromContainerId).toBe(fragIds[1]); // last fragment
    expect(closure.toContainerId).toBe(fragIds[0]); // → first fragment
    expect(closure.realisedFrom.method).toBe('restriction'); // perBoundaryMethods[1]
  });

  it('linear → NO closure junction (only the N−1 internal joins)', () => {
    const r = realiseAssembly(build(false), 'asm', { 0: 'overlap_pcr' }, {});
    expect(r.diff.junctions.find((j) => j.realisedFrom && j.realisedFrom.role === 'closure')).toBeUndefined();
    expect(r.diff.junctions).toHaveLength(1); // 2 frags → 1 internal
  });

  it('the product is still marked circular', () => {
    const r = realiseAssembly(build(true), 'asm', { 0: 'gibson', 1: 'gibson' }, {});
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    expect(product.topology).toEqual({ circular: true });
  });

  it('closure method falls back to gibson when not provided', () => {
    const r = realiseAssembly(build(true), 'asm', { 0: 'gibson' }, {}); // no [1]
    const closure = r.diff.junctions.find((j) => j.realisedFrom && j.realisedFrom.role === 'closure');
    expect(closure.realisedFrom.method).toBe('gibson');
  });
});

describe('M-CIRCULARIZE C2 — methodsFromJunctions includes the closure', () => {
  it('circular 2-segment draft → keys 0 (internal) + 1 (closure)', () => {
    expect(Object.keys(methodsFromJunctions(draftOf(build(true)), {}, []))).toEqual(['0', '1']);
  });
  it('linear 2-segment draft → only key 0 (no closure)', () => {
    expect(Object.keys(methodsFromJunctions(draftOf(build(false)), {}, []))).toEqual(['0']);
  });
});
