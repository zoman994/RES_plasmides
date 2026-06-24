/**
 * V166 — methods coexist cleanly: «оверлап оверлапом, рестриктазы рестриктазами».
 *
 * BUG: a fragment picked by RESTRICTION enzymes (acquisitionMethod 'restriction')
 * is DIGESTED, not amplified — yet deriveAutoPrimers still emitted PCR/overlap
 * primers for it (it gated only on `kind`, not acquisitionMethod), while the
 * reaction graph correctly gave it a `cut` op. The two graphs disagreed → primers
 * computed on a restriction junction.
 *
 * FIX (two parts):
 *  A) deriveAutoPrimers skips pieces whose acquisitionMethod === 'restriction'
 *     (digested → no PCR primers). pcr/ov-pcr/undefined(cursor) still amplify.
 *  B) suggestMethodForBoundary biases a boundary to 'restriction' when BOTH
 *     flanking fragments are RE-acquired (method follows acquisition, even with
 *     no auto-detected site / no op-group).
 */
import { describe, it, expect } from 'vitest';
import { deriveAutoPrimers } from '../lib/primer-derive';
import { suggestMethodForBoundary } from '../lib/assembly-realise-suggest';
import { buildInitialState } from '../store/skeleton-state';

// ── A) primer gate ──────────────────────────────────────────────────────────
const CONTAINER = { id: 'cA', name: 'p', sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT' };
const piece = (id, acq) => ({
  id, kind: 'sourced', zoneId: 'z', acquisitionMethod: acq,
  ranges: [{ sourceId: 'cA', start: 0, end: 32, orientation: 'forward' }], mutations: [],
});
const st = (pieces) => ({ containers: [CONTAINER], pieces, operations: [] });
const grp = (kind, ids) => ({ id: 'op-g', kind, isOpGroup: true, inputPieces: ids, zoneId: 'z' });

describe('V166-A — deriveAutoPrimers skips DIGESTED (restriction) fragments', () => {
  it('two restriction-cut fragments → NO primers (digest + ligate, not PCR)', () => {
    const r = deriveAutoPrimers(grp('restriction', ['a', 'b']), st([piece('a', 'restriction'), piece('b', 'restriction')]));
    expect(r).toEqual([]);
  });

  it('cursor/undefined fragments still amplify → primers kept (overlap path intact)', () => {
    const r = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'undefined'), piece('b', 'undefined')]));
    expect(r).toHaveLength(4);
  });

  it('mixed: RE fragment gets no primers, the PCR neighbour still does', () => {
    const r = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'restriction'), piece('b', 'pcr')]));
    expect(r.filter((p) => p.source.pieceId === 'a')).toHaveLength(0);
    expect(r.filter((p) => p.source.pieceId === 'b')).toHaveLength(2);
  });
});

// ── B) method follows acquisition ───────────────────────────────────────────
const SRC1 = { id: 'src1', kind: 'molecule', name: 's1', sequence: 'AAAAAAAAAATTTTTTTTTT', annotations: [], topology: { circular: false } };
const SRC2 = { id: 'src2', kind: 'molecule', name: 's2', sequence: 'AAAAAAAAAAAATTTTTTTT', annotations: [], topology: { circular: false } };
const zPiece = (id, sid, acq) => ({
  id, kind: 'sourced', name: id, sourceIds: [sid],
  ranges: [{ sourceId: sid, start: 0, end: 20, orientation: 'forward' }],
  origin: 'selection', acquisitionMethod: acq,
  acquisitionParams: acq === 'restriction' ? { enzymes: ['EcoRI', 'BamHI'], cutSites: [{ position: 2 }, { position: 18 }] } : {},
  color: '#abc', zoneId: 'zn-1', derivedReactionId: null, frozen: false, createdAt: 1, updatedAt: 1,
});
const zoneState = (pieces) => {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, SRC1, SRC2],
    zones: [{ id: 'zn-1', name: 'ZR', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces,
  };
};

describe('V166-B — suggestMethodForBoundary follows RE acquisition', () => {
  it('both flanking fragments RE-acquired → method «restriction»', () => {
    const s = zoneState([zPiece('p1', 'src1', 'restriction'), zPiece('p2', 'src2', 'restriction')]);
    expect(suggestMethodForBoundary(s, 'zn-1', 0).method).toBe('restriction');
  });

  it('cursor fragments (no RE site) → NOT restriction (falls to default)', () => {
    const s = zoneState([zPiece('p1', 'src1', 'undefined'), zPiece('p2', 'src2', 'undefined')]);
    expect(suggestMethodForBoundary(s, 'zn-1', 0).method).not.toBe('restriction');
  });
});
