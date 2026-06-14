/**
 * primer-tm-consistency.test.js — audit AM-5/AM-4 (primers). Annealing Tm must be
 * computed on the BINDING region (the 5' tail is non-complementary in the first
 * PCR cycles); validatePrimer used the full oligo. And self-closure bindings must
 * Tm-target like every other auto primer, not ship a flat 20 nt.
 */
import { describe, it, expect } from 'vitest';
import { validatePrimer } from '../lib/operation-pcr-bridge';
import { deriveSelfClosurePrimers } from '../lib/primer-derive';
import { calcTm } from '../../../tm-calculator';

describe('validatePrimer — annealing Tm on the binding region (AM-5)', () => {
  it('computes Tm from bindingSequence, not tail+binding', () => {
    const binding = 'ATGCATGCATGCATGCATGC';
    const tail = 'GGGGGGGGGGGGGGGGGG'; // GC-rich tail inflates the full-oligo Tm
    const r = validatePrimer({ sequence: tail + binding, bindingSequence: binding });
    expect(r.tm).toBe(calcTm(binding));
    expect(r.tm).not.toBe(calcTm(tail + binding));
  });
});

describe('deriveSelfClosurePrimers — Tm-targeted binding (AM-4)', () => {
  it('extends the binding past a flat 20 nt on an AT-rich fragment', () => {
    const atSeq = 'AT'.repeat(40); // 80 nt, very AT-rich → 20 nt binding is sub-Tm
    const src = { id: 'srcAT', kind: 'molecule', name: 'AT', sequence: atSeq, annotations: [], topology: { circular: false } };
    const piece = {
      id: 'pcAT', kind: 'sourced', name: 'pcAT', sourceIds: ['srcAT'],
      ranges: [{ sourceId: 'srcAT', start: 0, end: 80, orientation: 'forward' }], zoneId: 'z',
    };
    const ps = deriveSelfClosurePrimers(piece, { containers: [src], pieces: [piece] });
    const fwd = ps.find((p) => p.direction === 'forward');
    expect(fwd.bindingSequence.length).toBeGreaterThan(20);
  });
});
