/**
 * V183 (Игорь 29.06) — restriction-cloning ligation lost the product's features
 * (empty ring) + the junction-seam feature. Root cause: the live DAG preview
 * product node (`derivePiecesToGraph`, circular branch) hardcoded
 * `annotations: []`, while realiseAssembly's product correctly aggregated them.
 * Plus reflectAnnotations used a 0-based RC formula on 1-based segment coords.
 */
import { describe, it, expect } from 'vitest';
import { draftFromZone, realiseAssembly } from '../lib/zone-pieces-to-dag';
import { derivePiecesToGraph } from '../lib/pieces-to-dag-preview';
import { reflectAnnotations } from '../lib/segment-overhangs';

// Two BglII-like fragments of a pCBH cassette; each carries a pCBH feature.
const FRAG_SEQ = `${'GATCT'}${'AAAACCCCGGGGTTTTAAAACCCCGGGG'}${'A'}`; // 34 nt
const fragContainer = (id) => ({
  id, kind: 'molecule', name: id, sequence: FRAG_SEQ,
  topology: { circular: false },
  annotations: [{ id: `${id}-pcbh`, name: 'pCBH', type: 'CDS', level: 'region', start: 1, end: 30, strand: 1 }],
});

function sourcedPiece(id, sourceId, len) {
  return {
    id, kind: 'sourced', name: id, sourceIds: [sourceId],
    ranges: [{ sourceId, start: 0, end: len, orientation: 'forward' }],
    acquisitionMethod: 'restriction', acquisitionParams: { enzyme: 'BglII' },
    origin: 'legacy-migration', functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    frozen: false, createdAt: 1, updatedAt: 1,
  };
}

const ZONE = { id: 'zn-1', name: 'Сборка 5', topology: { circular: true, explicit: true } };
function zoneState(circular = true) {
  return {
    containers: [fragContainer('cf1'), fragContainer('cf2')],
    operations: [], junctions: [], assemblyDrafts: [], positions: {},
    zones: [{ id: 'zn-1', name: 'Сборка 5', topology: { circular, explicit: true }, bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [sourcedPiece('p1', 'cf1', FRAG_SEQ.length), sourcedPiece('p2', 'cf2', FRAG_SEQ.length)],
  };
}

describe('reflectAnnotations — 1-based inclusive RC contract', () => {
  it('[5,12] on len 24 reflects to [13,20] (matches transferAnnotations), strand flips', () => {
    expect(reflectAnnotations([{ name: 'x', start: 5, end: 12, strand: 1 }], 24)[0])
      .toMatchObject({ start: 13, end: 20, strand: -1 });
  });
});

describe('V183 — DAG preview product inherits features + seam', () => {
  it('circular preview product carries the inherited pCBH features (NOT empty)', () => {
    const { containers } = derivePiecesToGraph(zoneState(true), ZONE);
    const product = containers.find((c) => c._role === 'product');
    expect(product).toBeTruthy();
    const pcbh = (product.annotations || []).filter((a) => a.name === 'pCBH');
    expect(pcbh.length).toBe(2); // one per fragment, offset into the product
  });

  it('preview product has a junction seam marker per boundary', () => {
    const { containers } = derivePiecesToGraph(zoneState(true), ZONE);
    const product = containers.find((c) => c._role === 'product');
    const seams = (product.annotations || []).filter((a) => a._seam);
    expect(seams.length).toBe(2); // 2 fragments → 2 ring junctions
  });
});

describe('V183 — realiseAssembly product (already correct, guard)', () => {
  it('materialised product also carries both pCBH features', () => {
    const r = realiseAssembly(zoneState(true), 'zn-1', { 0: 'restriction' }, {});
    expect(r.ok).toBe(true);
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    expect((product.annotations || []).filter((a) => a.name === 'pCBH').length).toBe(2);
  });
});
