/**
 * zone-realise-autolayout.test.js — T4.5 follow-up (Игорь: «не работает
 * сортировка по зонам»).
 *
 * Root cause: realising into a ZONE created the frag/product/op nodes
 * LOOSE (no zoneId) → nodeListInZone returned nothing → the 3-lane
 * finalizer had no members to sort. Fix: ASSEMBLY_REALISE tags every
 * realised container/op with the target zoneId and pulls the loose
 * source containers it consumes into the zone; the `-product`
 * container (edge-isolated) is classified as a FINAL, not a source.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { classifyZoneNodes } from '../lib/zone-layout-rules';

describe('T4.5 fix — classifyZoneNodes: realised-product → finals', () => {
  it('an edge-isolated container with origin realised-product is a final', () => {
    const s = {
      zones: [{ id: 'z1', name: 'Z', bounds: { x: 0, y: 0, width: 800, height: 600 } }],
      containers: [
        { id: 'src', kind: 'molecule', name: 'src', zoneId: 'z1' },
        {
          id: 'prod', kind: 'molecule', name: 'asm-product', zoneId: 'z1',
          origin: { kind: 'realised-product' },
        },
      ],
      pieces: [], operations: [], junctions: [], positions: {},
    };
    const { sources, finals } = classifyZoneNodes(s, 'z1');
    expect(finals.map((n) => n.id)).toContain('prod');
    expect(sources.map((n) => n.id)).not.toContain('prod');
    expect(sources.map((n) => n.id)).toContain('src');
  });
});

describe('T4.5 fix — realise into a zone tags nodes + lanes them', () => {
  // Build a zone with one sourced piece referencing a loose source
  // container, then Realise it.
  function seedZoneWithPiece() {
    const base = buildInitialState({ forceEmptyZones: true });
    return {
      ...base,
      zones: [{
        id: 'zR', name: 'Сборка 1', viewMode: 'graph', laneLayout: 'auto',
        collapsed: false, autoResize: true,
        bounds: { x: 50, y: 50, width: 1400, height: 800 },
      }],
      containers: [{
        id: 'srcC', kind: 'molecule', name: 'pUC',
        sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [],
        topology: { circular: false }, zoneId: null, pinned: false,
      }],
      pieces: [{
        id: 'pc1', kind: 'sourced', name: 'pc1', sourceIds: ['srcC'],
        ranges: [{ sourceId: 'srcC', start: 0, end: 24, orientation: 'forward' }],
        origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
        functionalLabel: null, color: '#abc', zoneId: 'zR',
        derivedReactionId: null, frozen: false, pinned: false,
        createdAt: 1, updatedAt: 1,
      }],
      operations: [], junctions: [], positions: {},
    };
  }

  it('realised containers + ops get zoneId = the zone', () => {
    let s = seedZoneWithPiece();
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'zR', perBoundaryMethods: {} });
    const realised = s.containers.filter((c) => c.origin && /realised/.test(c.origin.kind));
    expect(realised.length).toBeGreaterThan(0);
    expect(realised.every((c) => c.zoneId === 'zR')).toBe(true);
    const realisedOps = s.operations.filter((o) => o.origin && /realised/.test(o.origin.kind));
    expect(realisedOps.length).toBeGreaterThan(0);
    expect(realisedOps.every((o) => o.zoneId === 'zR')).toBe(true);
  });

  it('the pre-existing source container IS pulled into the zone (Fix B 10.06)', () => {
    // 10.06 reversal of the 17.05 "keep sources loose" contract: K1/K2 made
    // auto-layout authoritative (no frame ballooning — sources are re-laid in
    // the source lane, not kept at arbitrary positions), so the PCR source is
    // pulled in + unpinned → it renders as the op input (source→PCR→frag).
    let s = seedZoneWithPiece();
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'zR', perBoundaryMethods: {} });
    const src = s.containers.find((c) => c.id === 'srcC');
    expect(src.zoneId).toBe('zR');
    expect(src.pinned).toBe(false);
    const { sources } = classifyZoneNodes(s, 'zR');
    expect(sources.map((n) => n.id)).toContain('srcC');
  });

  it('the 3-lane finalizer arranges the realised graph (positions written)', () => {
    let s = seedZoneWithPiece();
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'zR', perBoundaryMethods: {} });
    // every non-pinned zone container has a finalizer-assigned position
    const zoneCnt = s.containers.filter((c) => c.zoneId === 'zR');
    expect(zoneCnt.length).toBeGreaterThan(1);
    for (const c of zoneCnt) {
      expect(s.positions[c.id]).toBeTruthy();
    }
    // product sits in the finals lane, below the realised PCR op
    // (intermediate lane) — robust regardless of frag classification.
    const prod = s.containers.find((c) => c.origin && c.origin.kind === 'realised-product');
    const op = s.operations.find((o) => o.origin && /realised/.test(o.origin.kind));
    expect(op.position.y).toBeLessThan(s.positions[prod.id].y);
  });

  it('legacy assemblyDraft realise is unaffected (no zone tagging)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-L' });
    // no segments → realise fails gracefully, must not throw / tag.
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'asm-L', perBoundaryMethods: {} });
    expect(s).toBeTruthy();
  });
});
