/**
 * gap2-reamplify-restriction — GAP-2 (Игорь /loop 28.06): «если есть внезапно
 * фрагмент после рестрикции — чтобы ничего не мешало подобрать праймеры к нему и
 * сгенерировать новый ПЦР продукт и собрать гибсоном». The audit (wf_cf2017e5-072)
 * flagged primer-derive.js:414 (restriction skip) as blocking re-amplification.
 *
 * This CHARACTERISES the truth (code-confirms, like the P0.1 primer non-bug): the
 * skip is INTENT-scoped, not a wall. A digest fragment ligates via its sticky ends
 * (no PCR) — correct. To RE-AMPLIFY it for Gibson the biolog promotes its
 * acquisitionMethod restriction→ov-pcr/pcr (SET_PIECE_ACQUISITION_METHOD; reachable
 * in SegmentList's method picker). primer-derive skips ONLY 'restriction', so the
 * promoted fragment immediately gets PCR/overlap primers → a new amplicon → Gibson.
 * The chain works at the engine level; this test pins it so it can't silently break.
 */
import { describe, it, expect } from 'vitest';
import { deriveAutoPrimers } from '../lib/primer-derive';

const CONTAINER = { id: 'cA', name: 'p', sequence: 'AAAACCCCGGGGTTTT'.repeat(4) };
const piece = (id, acq) => ({
  id, kind: 'sourced', zoneId: 'z', acquisitionMethod: acq,
  ranges: [{ sourceId: 'cA', start: 0, end: 32, orientation: 'forward' }], mutations: [],
});
const st = (pieces) => ({ containers: [CONTAINER], pieces, operations: [] });
const grp = (kind, ids) => ({ id: 'op-g', kind, isOpGroup: true, inputPieces: ids, zoneId: 'z' });
const forPiece = (r, id) => r.filter((p) => p.source.pieceId === id);

describe('GAP-2 — re-amplify a restriction fragment by promoting acquisitionMethod', () => {
  it('baseline: a restriction fragment gets NO primers (digest + ligate, V166)', () => {
    const r = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'restriction'), piece('b', 'pcr')]));
    expect(forPiece(r, 'a')).toHaveLength(0);
  });

  it('promoted restriction→ov-pcr → NOW it amplifies (primers designed for Gibson/overlap)', () => {
    const r = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'ov-pcr'), piece('b', 'pcr')]));
    expect(forPiece(r, 'a').length).toBeGreaterThan(0);
  });

  it('promoted restriction→pcr → also amplifies', () => {
    const r = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'pcr'), piece('b', 'pcr')]));
    expect(forPiece(r, 'a').length).toBeGreaterThan(0);
  });

  it('the neighbour PCR fragment is unaffected either way (no cross-contamination)', () => {
    const before = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'restriction'), piece('b', 'pcr')]));
    const after = deriveAutoPrimers(grp('overlap_pcr', ['a', 'b']), st([piece('a', 'ov-pcr'), piece('b', 'pcr')]));
    expect(forPiece(before, 'b').length).toBeGreaterThan(0);
    expect(forPiece(after, 'b').length).toBeGreaterThan(0);
  });
});
