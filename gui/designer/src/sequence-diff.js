/**
 * Sequence diff — positional comparison of two DNA sequences.
 * Supports optional AA-level annotation for substitutions within CDS regions.
 */

import { CODON_TABLE } from './codons';

function gcPercent(seq) {
  if (!seq.length) return 0;
  const gc = seq.split('').filter(c => c === 'G' || c === 'C').length;
  return +((gc / seq.length) * 100).toFixed(1);
}

/**
 * For each substitution within a CDS region, compute the amino acid change.
 * @param {Array<{pos, from, to}>} substitutions
 * @param {string} parentSeq - uppercase
 * @param {string} childSeq - uppercase
 * @param {Array<{start, end}>} cdsRegions - 0-based [start, end) ranges
 * @returns {Array} substitutions with optional aaChange property
 */
export function annotateAAChanges(substitutions, parentSeq, childSeq, cdsRegions = []) {
  if (!cdsRegions.length) return substitutions;

  return substitutions.map(sub => {
    const cds = cdsRegions.find(r => sub.pos >= r.start && sub.pos < r.end);
    if (!cds) return sub;

    const relPos = sub.pos - cds.start;
    const codonIndex = Math.floor(relPos / 3);
    const codonStart = cds.start + codonIndex * 3;

    const parentCodon = parentSeq.slice(codonStart, codonStart + 3);
    const childCodon = childSeq.slice(codonStart, codonStart + 3);

    if (parentCodon.length < 3 || childCodon.length < 3) return sub;

    const fromAA = CODON_TABLE[parentCodon] || '?';
    const toAA = CODON_TABLE[childCodon] || '?';

    return {
      ...sub,
      aaChange: {
        from: fromAA,
        to: toAA,
        position: codonIndex + 1, // 1-based AA position within CDS
        codonFrom: parentCodon,
        codonTo: childCodon,
        silent: fromAA === toAA,
      },
    };
  });
}

/**
 * Compare two sequences and return a diff summary.
 * @param {string} parentSeq
 * @param {string} childSeq
 * @param {Array<{start, end}>} [cdsRegions] - optional CDS regions for AA annotation
 * @returns {{ parentLen, childLen, lengthDelta, parentGC, childGC, gcDelta, substitutions }}
 */
export function sequenceDiff(parentSeq, childSeq, cdsRegions) {
  const a = (parentSeq || '').toUpperCase();
  const b = (childSeq || '').toUpperCase();

  const substitutions = [];
  const minLen = Math.min(a.length, b.length);

  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      substitutions.push({ pos: i, from: a[i], to: b[i] });
    }
  }

  const parentGC = gcPercent(a);
  const childGC = gcPercent(b);

  const annotatedSubs = cdsRegions?.length > 0
    ? annotateAAChanges(substitutions, a, b, cdsRegions)
    : substitutions;

  return {
    parentLen: a.length,
    childLen: b.length,
    lengthDelta: b.length - a.length,
    parentGC,
    childGC,
    gcDelta: +(childGC - parentGC).toFixed(1),
    substitutions: annotatedSubs,
  };
}
