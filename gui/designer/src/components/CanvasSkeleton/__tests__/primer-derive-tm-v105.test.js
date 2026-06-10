/**
 * primer-derive-tm-v105.test.js — V105 (walkthrough WT-B-3).
 *
 * Auto-derived assembly primers («Auto-собрать» → deriveAutoPrimers) used a
 * local Wallace estimate (4·GC + 2·AT) for `tm`, while the primer editor
 * (K13) shows the canonical SantaLucia NN value — one primer, two Tm in two
 * places of the UI. V105 routes deriveAutoPrimers through the project-wide
 * `calcTm` (SantaLucia NN, tm-calculator.js). Only the `tm` field changes;
 * geometry (sequence / binding / tail) is untouched.
 */
import { describe, it, expect } from 'vitest';
import { deriveAutoPrimers } from '../lib/primer-derive';
import { calcTm } from '../../../tm-calculator';

const CONTAINER = {
  id: 'cA', name: 'pUC19',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCC',
};

function sourced(id, start, end) {
  return {
    id, kind: 'sourced', zoneId: 'z',
    ranges: [{ sourceId: 'cA', start, end, orientation: 'forward' }],
    mutations: [],
  };
}
function makeState(pieces) {
  return { containers: [CONTAINER], pieces, operations: [] };
}
function group(kind, ids) {
  return { id: 'op-g', kind, isOpGroup: true, inputPieces: ids };
}

describe('V105 — deriveAutoPrimers Tm uses SantaLucia NN (calcTm), not Wallace', () => {
  it('fwd/rev tm equals calcTm(binding) from tm-calculator (NN)', () => {
    const p = sourced('p1', 0, 32);
    const r = deriveAutoPrimers(group('overlap_pcr', ['p1']), makeState([p]));
    const fwd = r.find((x) => x.source.side === 'fwd');
    const rev = r.find((x) => x.source.side === 'rev');
    expect(fwd.tm).toBe(calcTm(fwd.bindingSequence));
    expect(rev.tm).toBe(calcTm(rev.bindingSequence));
  });

  it('the NN value differs from the retired Wallace 4·GC+2·AT for this binding', () => {
    const p = sourced('p1', 0, 32);
    const r = deriveAutoPrimers(group('overlap_pcr', ['p1']), makeState([p]));
    const fwd = r.find((x) => x.source.side === 'fwd');
    const gc = (fwd.bindingSequence.match(/[GC]/g) || []).length;
    const at = (fwd.bindingSequence.match(/[AT]/g) || []).length;
    const wallace = 4 * gc + 2 * at;
    // Two genuinely different models — proves the switch took effect.
    expect(fwd.tm).not.toBe(wallace);
  });

  it('geometry — fwd binding is a Tm-targeted prefix; tail = prev 30 nt; sequence = tail+binding', () => {
    const a = sourced('a', 0, 32);
    const b = sourced('b', 32, 64);
    const r = deriveAutoPrimers(group('overlap_pcr', ['a', 'b']), makeState([a, b]));
    const bFwd = r.find((x) => x.source.pieceId === 'b' && x.source.side === 'fwd');
    const aSeq = CONTAINER.sequence.slice(0, 32);
    const bSeq = CONTAINER.sequence.slice(32, 64);
    // Звено — binding is Tm-targeted (prefix of the piece, ≥18 nt), not flat 20;
    // the tail + composition geometry is unchanged.
    expect(bFwd.bindingSequence.length).toBeGreaterThanOrEqual(18);
    expect(bFwd.bindingSequence).toBe(bSeq.slice(0, bFwd.bindingSequence.length));
    expect(bFwd.tail).toBe(aSeq.slice(-30)); // §9b: prev piece last 30 nt (one-sided right)
    expect(bFwd.sequence).toBe(bFwd.tail + bFwd.bindingSequence);
  });
});
