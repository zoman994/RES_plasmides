/**
 * PRIMER-9 (V175) — executePCR with a tailed (Gibson) primer-pair oligo.
 *
 * Bug: the primerPairId branch searched the FULL primer (homology+anneal) on the
 * template via indexOf → the homology arm is NOT on the template → «primer не
 * найден», PCR failed. Fix: search by bindingSequence (anneal) and build the
 * amplicon WITH the homology overhangs (fwdTail + templated + RC(revTail)) — the
 * whole point of Gibson tails. Tailless oligos stay byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { executePCR } from '../pcr';
import { reverseComplement } from '../../../../../../sequence-utils';

// template: AAAA | fwdbind(4..16) | CCCCC | revregion(21..33) | TTTT
const FWD_BIND = 'ACGTACGTACGT';
const REV_REGION = 'ATGCATGCATGC';          // on top strand, near 3' end
const REV_BIND = reverseComplement(REV_REGION); // 'GCATGCATGCAT' — primer's own 5'→3'
const TEMPLATE = `AAAA${FWD_BIND}CCCCC${REV_REGION}TTTT`;
const FWD_TAIL = 'GGGGGG';
const REV_TAIL = 'TTTTTT';

function ctxWith(sequences) {
  return {
    containers: {
      tpl1: { id: 'tpl1', name: 'frag', sequence: TEMPLATE },
      oligo1: { id: 'oligo1', kind: 'oligonucleotide', payload: { sequences } },
    },
  };
}
const op = { id: 'op1', params: { primerPairId: 'oligo1', autoDesign: false, templateId: 'tpl1' } };

describe('executePCR — Gibson/tailed primer-pair (V175)', () => {
  it('searches by bindingSequence (homology arm not on template) and keeps the overhangs', () => {
    const ctx = ctxWith([
      { name: 'fwd', sequence: FWD_TAIL + FWD_BIND, bindingSequence: FWD_BIND, tail: FWD_TAIL },
      { name: 'rev', sequence: REV_TAIL + REV_BIND, bindingSequence: REV_BIND, tail: REV_TAIL },
    ]);
    const r = executePCR(op, ctx);
    expect(r.error).toBeUndefined();
    const templatedMiddle = TEMPLATE.slice(4, 33); // fwd binding start .. rev binding end
    expect(r.outputs[0].sequence).toBe(FWD_TAIL + templatedMiddle + reverseComplement(REV_TAIL));
  });

  it('without the fix the full primer would not be found — binding search succeeds', () => {
    const ctx = ctxWith([
      { name: 'fwd', sequence: FWD_TAIL + FWD_BIND, bindingSequence: FWD_BIND, tail: FWD_TAIL },
      { name: 'rev', sequence: REV_TAIL + REV_BIND, bindingSequence: REV_BIND, tail: REV_TAIL },
    ]);
    const r = executePCR(op, ctx);
    expect(r.outputs).toBeTruthy();
    expect(r.outputs[0].sequence.startsWith(FWD_TAIL)).toBe(true);
  });

  it('tailless oligo (sequence only) → amplicon is the templated region, byte-identical to before', () => {
    const ctx = ctxWith([
      { name: 'fwd', sequence: FWD_BIND },
      { name: 'rev', sequence: REV_BIND },
    ]);
    const r = executePCR(op, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence).toBe(TEMPLATE.slice(4, 33));
  });
});
