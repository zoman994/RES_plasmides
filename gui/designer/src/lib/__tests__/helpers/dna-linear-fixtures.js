/**
 * dna-linear-fixtures.js — shared, test-only fixtures for the EXPERIMENTAL linear/Dinkelbach
 * kernel suites (dna-linear-scan / dna-linear-verify / dna-linear-kernel / dna-linear-differential).
 *
 * Test-only: no assertions, no describe/it, and NO import of the engine or of the oracle. This file
 * is a neutral fixture layer; keeping it engine-free is what stops assertions from creeping in.
 *
 * shape() is the COMPARISON CONTRACT of SPEC_GAPPED_DNA_SEARCH §3.2 — every assertion compares the
 * FULL occurrence, never identity alone. Do not change it without re-baselining all 50 tests.
 */

/** Full occurrence as one comparable string. Identity alone is deliberately not enough. */
export function shape(o) {
  return `${o.strand}|s=${o.start}|span=${o.targetSpan}|e=${o.end}`
    + `|M=${o.M}|X=${o.X}|I=${o.I}|D=${o.D}|ev=${o.gapEvents}`
    + `|L=${o.alignmentLength}|bps=${o.identityBps}|${o.script}`;
}

export const shapes = (list) => list.map(shape);

/** Deterministic LCG — the suite must not depend on Math.random. */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const randDna = (rnd, len, alphabet = 'ACGT') => {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[(rnd() * alphabet.length) | 0];
  return out;
};

/** Enumerate every word of the given length over the alphabet. */
export function words(alphabet, len) {
  if (len === 0) return [''];
  const prev = words(alphabet, len - 1);
  const out = [];
  for (const p of prev) for (const c of alphabet) out.push(p + c);
  return out;
}
