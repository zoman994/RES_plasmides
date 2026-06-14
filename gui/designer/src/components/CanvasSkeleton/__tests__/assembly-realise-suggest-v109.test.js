/**
 * assembly-realise-suggest-v109.test.js — V109 (walkthrough WT-B-7).
 *
 * `suggestMethodForBoundary` now reads `opGroup.kind` as the first-class
 * source of a boundary's method (the recorded design decision) BEFORE the
 * tail-length heuristic. A boundary whose two flanking pieces both belong
 * to one zone op-group → that group's `kind`, confidence 'high'. Boundaries
 * without a single covering op-group (legacy assemblyDraft, or a join
 * between two distinct groups) fall through to the existing heuristic
 * unchanged.
 *
 * Op-groups live in `state.operations` as entries with `isOpGroup === true`
 * carrying `id` / `kind` / `zoneId` / `inputPieces` (created by
 * CREATE_OP_GROUP). Zone-draft segments carry the piece id as `segment.id`
 * (draftFromZone), so the boundary→piece map is direct.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { suggestMethodForBoundary } from '../lib/assembly-realise-suggest';

// Clean sources: each is a single A-block followed by a single T-block, so
// it contains NO restriction site at all (even the AT-only cutters like
// MseI=TTAA / DraI=TTTAAA need a T→A transition, which never occurs here).
// → detectCompatibleREsites is always empty → the fallback resolves to the
// default gibson(low), distinct from every op-group kind used below. (An
// interleaved AT sequence would accidentally embed TTAA and trip the RE
// branch — that bit me once; A-block-then-T-block is the safe fixture.)
const AT1 = { id: 'src1', kind: 'molecule', name: 's1', sequence: 'AAAAAAAAAATTTTTTTTTT', annotations: [], topology: { circular: false } };
const AT2 = { id: 'src2', kind: 'molecule', name: 's2', sequence: 'AAAAAAAAAAAATTTTTTTT', annotations: [], topology: { circular: false } };
const AT3 = { id: 'src3', kind: 'molecule', name: 's3', sequence: 'AAAAAAAATTTTTTTTTTTT', annotations: [], topology: { circular: false } };
const AT4 = { id: 'src4', kind: 'molecule', name: 's4', sequence: 'AAAAAATTTTTTTTTTTTTT', annotations: [], topology: { circular: false } };

function piece(id, sid, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: [sid],
    ranges: [{ sourceId: sid, start: 0, end: 20, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    derivedReactionId: null, frozen: false, createdAt, updatedAt: createdAt,
  };
}

function zoneState(pieces, containers) {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, ...containers],
    zones: [{
      id: 'zn-1', name: 'ZR', viewMode: 'sequence',
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    }],
    pieces,
  };
}

describe('V109 — suggestMethodForBoundary reads opGroup.kind', () => {
  it('zone op-group kind:overlap_pcr → boundary method overlap_pcr (high), not gibson', () => {
    let s = zoneState([piece('pc1', 'src1', 1), piece('pc2', 'src2', 2)], [AT1, AT2]);
    s = skeletonReducer(s, {
      type: 'CREATE_OP_GROUP', zoneId: 'zn-1', kind: 'overlap_pcr', name: 'G1', pieceIds: ['pc1', 'pc2'],
    });
    const r = suggestMethodForBoundary(s, 'zn-1', 0);
    expect(r.method).toBe('overlap_pcr');
    expect(r.confidence).toBe('high');
    expect(r.rationale).toBe('из группы операций');
  });

  it('zone op-group kind:restriction → boundary method restriction (high)', () => {
    let s = zoneState([piece('pc1', 'src1', 1), piece('pc2', 'src2', 2)], [AT1, AT2]);
    s = skeletonReducer(s, {
      type: 'CREATE_OP_GROUP', zoneId: 'zn-1', kind: 'restriction', name: 'G1', pieceIds: ['pc1', 'pc2'],
    });
    const r = suggestMethodForBoundary(s, 'zn-1', 0);
    expect(r.method).toBe('restriction');
    expect(r.confidence).toBe('high');
  });

  it('zone with pieces but NO op-group → fallback heuristic (overlap_pcr low for AT-only linear — AM-5)', () => {
    const s = zoneState([piece('pc1', 'src1', 1), piece('pc2', 'src2', 2)], [AT1, AT2]);
    const r = suggestMethodForBoundary(s, 'zn-1', 0);
    // No covering op-group → fallback runs. AT-only → no shared RE site, no
    // boundary primer → topology-aware default. The zone is LINEAR → overlap_pcr
    // (not gibson). Crucially NOT the op-group path.
    expect(r.rationale).not.toBe('из группы операций');
    expect(r.method).toBe('overlap_pcr');
    expect(r.confidence).toBe('low');
  });

  it('boundary between two distinct op-groups → no single cover → fallback (not a group kind)', () => {
    let s = zoneState(
      [piece('pc1', 'src1', 1), piece('pc2', 'src2', 2), piece('pc3', 'src3', 3), piece('pc4', 'src4', 4)],
      [AT1, AT2, AT3, AT4],
    );
    s = skeletonReducer(s, {
      type: 'CREATE_OP_GROUP', zoneId: 'zn-1', kind: 'overlap_pcr', name: 'A', pieceIds: ['pc1', 'pc2'],
    });
    s = skeletonReducer(s, {
      type: 'CREATE_OP_GROUP', zoneId: 'zn-1', kind: 'restriction', name: 'B', pieceIds: ['pc3', 'pc4'],
    });
    // Intra-group boundaries read their own group's kind…
    expect(suggestMethodForBoundary(s, 'zn-1', 0).method).toBe('overlap_pcr');
    expect(suggestMethodForBoundary(s, 'zn-1', 2).method).toBe('restriction');
    // …the inter-group join (pc2 | pc3) does NOT read a group kind — no single
    // covering op-group → falls through the heuristic. JUNCTION 1b: the
    // finalizer now derives a primer for EVERY junction on add, so the
    // heuristic reads its overlap tail (≈20 bp — the prev piece is only 20 nt,
    // so the 30-bp default is capped) → overlap_pcr(high), via the HEURISTIC,
    // not the op-group. The surviving point: rationale is NOT the op-group path.
    const mid = suggestMethodForBoundary(s, 'zn-1', 1);
    expect(mid.rationale).not.toBe('из группы операций');
    expect(mid.rationale).toMatch(/tail|overlap/i); // heuristic (tail), not a group kind
    expect(mid.method).toBe('overlap_pcr');
    expect(mid.confidence).toBe('high');
  });
});
