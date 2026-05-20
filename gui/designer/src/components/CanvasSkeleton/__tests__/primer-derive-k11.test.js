/**
 * primer-derive-k11.test.js — M-CANVAS-WORKFLOW-UX K11 (SPEC §3 шаг 3).
 *
 * deriveAutoPrimers(opGroup, state) — pure helper. Walks the group's
 * inputPieces, generating one fwd + one rev primer per amplifiable
 * piece (sourced/synthesis/intermediate); snippet pieces get embedded
 * in the next piece's fwd tail; mutations on a sourced piece travel
 * into the corresponding binding region (mutagenic primer).
 */
import { describe, it, expect } from 'vitest';
import { deriveAutoPrimers } from '../lib/primer-derive';
import { reverseComplement } from '../../../sequence-utils';

const CONTAINER = {
  id: 'cA', name: 'pUC19',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCC',
};

function sourced(id, start, end, mutations = []) {
  return {
    id, kind: 'sourced', zoneId: 'z',
    ranges: [{ sourceId: 'cA', start, end, orientation: 'forward' }],
    mutations,
  };
}
function snippet(id, seq, name = id) {
  return {
    id, kind: 'snippet', zoneId: 'z', sequence: seq, name,
    snippetType: name, embedsInPrimer: true,
  };
}
function makeState(pieces) {
  return { containers: [CONTAINER], pieces, operations: [] };
}
function group(kind, ids) {
  return { id: 'op-g', kind, isOpGroup: true, inputPieces: ids };
}

describe('K11 — deriveAutoPrimers basic shape', () => {
  it('empty inputPieces → []', () => {
    const r = deriveAutoPrimers(group('overlap_pcr', []), makeState([]));
    expect(r).toEqual([]);
  });

  it('1 sourced piece → 2 primers (fwd + rev), tails empty (no neighbors)', () => {
    const p = sourced('p1', 0, 32);
    const r = deriveAutoPrimers(group('overlap_pcr', ['p1']), makeState([p]));
    expect(r).toHaveLength(2);
    const fwd = r.find((x) => x.origin.side === 'fwd');
    const rev = r.find((x) => x.origin.side === 'rev');
    expect(fwd).toBeTruthy();
    expect(rev).toBeTruthy();
    expect(fwd.tail).toBe('');
    expect(rev.tail).toBe('');
  });

  it('2 sourced pieces ovPCR → 4 primers total', () => {
    const a = sourced('a', 0, 32);
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 'b']), makeState([a, b]));
    expect(r).toHaveLength(4);
  });

  it('fwd binding = first 20nt of piece sequence; rev binding = RC of last 20nt', () => {
    const p = sourced('p1', 0, 40);
    const r = deriveAutoPrimers(group('overlap_pcr', ['p1']), makeState([p]));
    const expected = CONTAINER.sequence.slice(0, 40);
    expect(r[0].binding).toBe(expected.slice(0, 20));
    expect(r[1].binding).toBe(reverseComplement(expected.slice(-20)));
  });
});

describe('K11 — ovPCR / Gibson overlap tails', () => {
  it('middle piece fwd tail = prev piece last 25 nt verbatim (overlap_pcr, biology-correct: NO RC)', () => {
    const a = sourced('a', 0, 32);
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 'b']), makeState([a, b]));
    const bFwd = r.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    const aSeq = CONTAINER.sequence.slice(0, 32);
    // Spec §3 wrote reverseComplement(prevSeq.slice(-25)) but that's a
    // spec bug — fwd primer tail extends 5' on TOP strand, so the
    // tail in 5'→3' direction equals prev piece's top-strand last 25
    // nt verbatim (NO reverse-complement). Bio-invariants demand this.
    expect(bFwd.tail).toBe(aSeq.slice(-25));
  });

  it('middle piece rev tail = RC of next piece first 25 nt (overlap_pcr)', () => {
    const a = sourced('a', 0, 32);
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 'b']), makeState([a, b]));
    const aRev = r.find((x) => x.origin.pieceId === 'a' && x.origin.side === 'rev');
    const bSeq = CONTAINER.sequence.slice(32, 64);
    expect(aRev.tail).toBe(reverseComplement(bSeq.slice(0, 25)));
  });

  it('gibson opKind uses the same 25-nt overlap as overlap_pcr', () => {
    const a = sourced('a', 0, 32);
    const b = sourced('b', 32, 64);
    const rOv = deriveAutoPrimers(group('overlap_pcr', ['a', 'b']), makeState([a, b]));
    const rGi = deriveAutoPrimers(group('gibson', ['a', 'b']), makeState([a, b]));
    const bFwdOv = rOv.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    const bFwdGi = rGi.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    expect(bFwdGi.tail).toBe(bFwdOv.tail);
  });
});

describe('K11 — Type-IIS / Restriction tails', () => {
  it('golden_gate kind → tail starts with the BsaI prefix GGTCTC', () => {
    const a = sourced('a', 0, 32);
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('golden_gate', ['a', 'b']), makeState([a, b]));
    const bFwd = r.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    expect(bFwd.tail.startsWith('GGTCTC')).toBe(true);
  });

  it('restriction kind → tail starts with the configured site prefix', () => {
    const a = { ...sourced('a', 0, 32), reSite: 'GAATTC' };
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('restriction', ['a', 'b']), makeState([a, b]));
    const bFwd = r.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    expect(bFwd.tail.startsWith('GAATTC')).toBe(true);
  });
});

describe('K11 — snippet embedding', () => {
  it('snippet between A and B → B-fwd tail contains the snippet sequence', () => {
    const a = sourced('a', 0, 32);
    const s = snippet('s1', 'CATCATCATCATCATCAT', '6xHis');
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 's1', 'b']), makeState([a, s, b]));
    // Snippet itself produces no primers.
    expect(r.filter((x) => x.origin.pieceId === 's1')).toHaveLength(0);
    const bFwd = r.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    expect(bFwd.tail.includes('CATCATCATCATCATCAT')).toBe(true);
  });

  it('the snippet is NOT also duplicated on the previous piece rev tail', () => {
    const a = sourced('a', 0, 32);
    const s = snippet('s1', 'CATCATCATCATCATCAT', '6xHis');
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 's1', 'b']), makeState([a, s, b]));
    const aRev = r.find((x) => x.origin.pieceId === 'a' && x.origin.side === 'rev');
    expect(aRev.tail.includes('CATCATCATCATCATCAT')).toBe(false);
  });

  it('two consecutive snippets between A and B → both are concatenated into B-fwd tail', () => {
    const a = sourced('a', 0, 32);
    const s1 = snippet('s1', 'ATGATGATG', 'tag1');
    const s2 = snippet('s2', 'CCCAAAGGG', 'tag2');
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 's1', 's2', 'b']), makeState([a, s1, s2, b]));
    const bFwd = r.find((x) => x.origin.pieceId === 'b' && x.origin.side === 'fwd');
    // Order: piece-after's fwd tail goes [overlap-with-A][snippet1][snippet2]
    // from 5'→3'; we just verify both snippet sequences are present.
    expect(bFwd.tail.includes('ATGATGATG')).toBe(true);
    expect(bFwd.tail.includes('CCCAAAGGG')).toBe(true);
  });
});

describe('K11 — metadata + mutagenic primer', () => {
  it('every primer carries origin (kind/opGroupId/pieceId/side) + autoMode=auto + numeric tm', () => {
    const p = sourced('p1', 0, 32);
    const r = deriveAutoPrimers(group('overlap_pcr', ['p1']), makeState([p]));
    for (const pr of r) {
      expect(pr.origin.kind).toBe('auto-from-group');
      expect(pr.origin.opGroupId).toBe('op-g');
      expect(pr.origin.pieceId).toBe('p1');
      expect(['fwd', 'rev'].includes(pr.origin.side)).toBe(true);
      expect(pr.autoMode).toBe('auto');
      expect(typeof pr.tm).toBe('number');
    }
  });

  it('intermediate-kind piece is treated as amplifiable (inline sequence)', () => {
    const inter = {
      id: 'i1', kind: 'intermediate', zoneId: 'z',
      sequence: 'ATGAAACCCGGGTTTAAACCCGGGTTTAAACC',
      derivedFromOpId: 'op-prev',
    };
    const r = deriveAutoPrimers(group('overlap_pcr', ['i1']), makeState([inter]));
    expect(r).toHaveLength(2);
    expect(r[0].binding).toBe('ATGAAACCCGGGTTTAAACC');
  });

  it('mutation on a sourced piece → fwd binding is mutated at that position', () => {
    // Mutation C→T at position 2 of piece a (0-indexed within piece).
    // Original piece sequence starts AAAA → mutation at index 2 (the
    // third base) changes A→T (using fromBase ignored, toBase applied).
    const a = sourced('a', 0, 32, [{ position: 2, fromBase: 'A', toBase: 'T' }]);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a']), makeState([a]));
    const aFwd = r.find((x) => x.origin.side === 'fwd');
    expect(aFwd.binding[2]).toBe('T');
    expect(aFwd.mutated).toBe(true);
  });
});
