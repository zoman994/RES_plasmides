/**
 * circularize-selfclose-c3.test.js — M-CIRCULARIZE C3. Single-fragment
 * self-closure: a 1-fragment circular assembly closes the fragment's own ends
 * into a plasmid (KLD whole-plasmid PCR + ligation, or blunt self-ligation).
 * Previously closureBoundary guarded `< 2` and realise emitted no closure op for
 * a lone fragment, so a single-fragment plasmid couldn't be realised at all.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { realiseAssembly } from '../lib/assembly-realise';
import { closureBoundary, methodsFromJunctions } from '../lib/junction-derive';

const C1 = { id: 'src1', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false } };

function build1(circular) {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, C1] };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm', name: 'A' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src1', start: 0, end: 32, rc: false });
  if (circular) s = skeletonReducer(s, { type: 'SET_ASSEMBLY_DRAFT_TOPOLOGY', draftId: 'asm', circular: true });
  return s;
}
const draftOf = (s) => s.assemblyDrafts.find((d) => d.id === 'asm');

describe('M-CIRCULARIZE C3 — single-fragment self-closure', () => {
  it('closureBoundary on a 1-fragment circular draft → self-closure boundary', () => {
    const cb = closureBoundary(draftOf(build1(true)));
    expect(cb).toBeTruthy();
    expect(cb.role).toBe('closure');
    expect(cb.selfClosure).toBe(true);
  });

  it('closureBoundary on a 1-fragment LINEAR draft → null', () => {
    expect(closureBoundary(draftOf(build1(false)))).toBeNull();
  });

  it('methodsFromJunctions on a 1-fragment circular draft → one closure key', () => {
    expect(Object.keys(methodsFromJunctions(draftOf(build1(true)), {}, []))).toEqual(['0']);
  });

  it('realise: 1-fragment circular → a self-closure op (frag → circular product)', () => {
    const r = realiseAssembly(build1(true), 'asm', { 0: 'kld' }, {});
    expect(r.ok).toBe(true);
    const frag = r.diff.containers.find((c) => /-frag-/.test(c.name));
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    expect(product.topology).toEqual({ circular: true });
    const closeOp = r.diff.operations.find((o) => o.params && o.params.selfClosure);
    expect(closeOp).toBeTruthy();
    expect(closeOp.inputs).toEqual([frag.id]);
    expect(closeOp.outputs).toEqual([product.id]);
    // the product is reachable — an op outputs it (no longer floating)
    expect(r.diff.operations.some((o) => (o.outputs || []).includes(product.id))).toBe(true);
  });

  it('realise: 1-fragment LINEAR → no self-closure op', () => {
    const r = realiseAssembly(build1(false), 'asm', { 0: 'overlap_pcr' }, {});
    expect(r.diff.operations.find((o) => o.params && o.params.selfClosure)).toBeUndefined();
  });
});
