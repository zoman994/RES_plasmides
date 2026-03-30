/**
 * Shared DNA sequence utilities — complement, reverse complement.
 * Used by SequenceMapView, SequencePreview, and other components.
 */

export const COMPLEMENT_MAP = {
  A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
  a: 't', t: 'a', g: 'c', c: 'g', n: 'n',
};

export function complement(nt) {
  return COMPLEMENT_MAP[nt] || 'N';
}

export function reverseComplement(seq) {
  return seq.split('').reverse().map(c => complement(c)).join('');
}
