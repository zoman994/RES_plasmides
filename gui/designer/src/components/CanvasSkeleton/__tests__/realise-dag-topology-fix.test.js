/**
 * realise-dag-topology-fix.test.js — the realised DAG must read as a connected
 * pipeline (Игорь 10.06): source → PCR → frag → [assembly op] → product.
 *
 * Before: realiseAssembly emitted N PCRs (source→PCR→frag) + frag↔frag junctions
 * (chemistry metadata, never drawn — the renderer reads only op in/out) + a
 * FLOATING product (no op produced it), and the reducer kept source containers
 * loose (outside the zone) so PCRs looked input-less. Fix:
 *   A — emit ONE assembly operation {inputs:[all frags], outputs:[product]},
 *       coloured by the assembly method (one colour per op type);
 *   B — the ASSEMBLY_REALISE reducer pulls the source containers into the zone
 *       (zoneId + unpinned) so they render as the PCR inputs.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { realiseAssembly } from '../lib/assembly-realise';

const C1 = { id: 'src1', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false } };
const C2 = { id: 'src2', kind: 'molecule', name: 'pET', sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false } };

function legacyDraft() {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, C1, C2] };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm', name: 'A' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src1', start: 0, end: 24, rc: false });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src2', start: 0, end: 24, rc: false });
  return s;
}

describe('Realise DAG — assembly op connects frags → product (Fix A)', () => {
  it('emits N PCR ops + ONE assembly op whose inputs are the frags and output the product', () => {
    const r = realiseAssembly(legacyDraft(), 'asm', { 0: 'kld' }, {});
    expect(r.ok).toBe(true);
    const pcrs = r.diff.operations.filter((o) => o.kind === 'pcr');
    const asm = r.diff.operations.filter((o) => o.kind !== 'pcr');
    expect(pcrs).toHaveLength(2);
    expect(asm).toHaveLength(1); // ONE assembly operation
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    expect(product).toBeTruthy();
    // the assembly op consumes BOTH frags and produces the product
    const fragIds = r.diff.containers.filter((c) => /-frag-/.test(c.name)).map((c) => c.id);
    expect(asm[0].inputs.sort()).toEqual(fragIds.sort());
    expect(asm[0].outputs).toEqual([product.id]);
  });

  it('the product is reachable — some operation outputs it (no longer floating)', () => {
    const r = realiseAssembly(legacyDraft(), 'asm', { 0: 'gibson' }, {});
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    const producers = r.diff.operations.filter((o) => (o.outputs || []).includes(product.id));
    expect(producers).toHaveLength(1);
  });

  it('PCR ops still carry their source container as input (source → PCR → frag)', () => {
    const r = realiseAssembly(legacyDraft(), 'asm', { 0: 'kld' }, {});
    const pcrs = r.diff.operations.filter((o) => o.kind === 'pcr');
    const inputIds = pcrs.flatMap((o) => o.inputs);
    expect(inputIds).toContain('src1');
    expect(inputIds).toContain('src2');
  });
});

function zoneState() {
  const s = buildInitialState();
  const piece = (id, sid, createdAt) => ({
    id, kind: 'sourced', name: id, sourceIds: [sid],
    ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', zoneId: 'zn-1', createdAt, updatedAt: createdAt,
  });
  return {
    ...s,
    containers: [...s.containers, { ...C1, pinned: true }, { ...C2, pinned: true }],
    zones: [{ id: 'zn-1', name: 'Z', viewMode: 'graph', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [piece('pc1', 'src1', 1), piece('pc2', 'src2', 2)],
  };
}

describe('Realise DAG — source containers pulled into the zone (Fix B)', () => {
  it('after realising a zone, the source containers join the zone (zoneId set, unpinned)', () => {
    const s = skeletonReducer(zoneState(), {
      type: 'ASSEMBLY_REALISE', draftId: 'zn-1', perBoundaryMethods: { 0: 'kld' },
    });
    for (const id of ['src1', 'src2']) {
      const c = s.containers.find((x) => x.id === id);
      expect(c.zoneId).toBe('zn-1'); // now a zone node → renders feeding its PCR
      expect(c.pinned).toBe(false); // unpinned → auto-laid in the source lane
    }
  });

  it('the realised assembly op is in the zone too (zoneId set)', () => {
    const s = skeletonReducer(zoneState(), {
      type: 'ASSEMBLY_REALISE', draftId: 'zn-1', perBoundaryMethods: { 0: 'kld' },
    });
    const asm = s.operations.find((o) => o.kind !== 'pcr' && o.zoneId === 'zn-1' && o.origin?.kind === 'realised-assembly');
    expect(asm).toBeTruthy();
    expect(asm.zoneId).toBe('zn-1');
  });
});
