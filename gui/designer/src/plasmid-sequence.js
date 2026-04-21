/**
 * plasmid-sequence.js — assembly-level sequence + annotation concatenation.
 *
 * buildPlasmidSequence(fragments) reads an assembly's fragments array and returns
 * the concatenated DNA sequence together with annotations shifted into the
 * combined coordinate space. Reversed fragments (strand === -1) are rev-comped
 * and their annotations are coordinate-inverted before the shift.
 *
 * Used by PlasmidWorkspace / SequencePane (Sprint Map-WS-1) and reusable by
 * any future consumer that needs an assembly rendered as a single linear/circular
 * plasmid sequence.
 */
import { reverseComplement } from './sequence-utils';

/**
 * @typedef {Object} Annotation
 * @property {number} start — nt offset, 0-based, inclusive
 * @property {number} end   — nt offset, 0-based, exclusive
 * @property {string} [level] — 'region' | 'detail' | 'point'
 * @property {number} [strand] — 1 | -1
 * @property {string} [id]
 * @property {string} [type]
 * @property {string} [name]
 */

/**
 * @typedef {Object} Fragment
 * @property {string} sequence
 * @property {Annotation[]} [annotations]
 * @property {number} [strand]  — -1 means reverse-complement this fragment
 * @property {boolean} [reversed] — alternative flag, honoured if strand is absent
 * @property {string} [id]
 * @property {string} [name]
 */

/**
 * Concatenate fragments into a single sequence and rebase all their annotations
 * to the combined coordinate frame.
 *
 * @param {Fragment[]} fragments
 * @returns {{ sequence: string, annotations: Annotation[] }}
 */
export function buildPlasmidSequence(fragments) {
  if (!Array.isArray(fragments) || fragments.length === 0) {
    return { sequence: '', annotations: [] };
  }

  let sequence = '';
  const annotations = [];

  for (const frag of fragments) {
    if (!frag) continue;
    const rawSeq = (frag.sequence || '').toUpperCase();
    const L = rawSeq.length;
    const isReversed = frag.strand === -1 || frag.reversed === true;
    const fragSeq = isReversed ? reverseComplement(rawSeq) : rawSeq;
    const offset = sequence.length;

    const rawAnns = Array.isArray(frag.annotations) ? frag.annotations : [];
    for (const ann of rawAnns) {
      if (!ann || typeof ann.start !== 'number' || typeof ann.end !== 'number') continue;
      const s = ann.start;
      const e = ann.end;
      if (isReversed) {
        // Invert [s, e) in a strand of length L → [L - e, L - s).
        // Flip strand sign on nested annotations if present.
        const newStart = Math.max(0, L - e);
        const newEnd = Math.max(0, L - s);
        annotations.push({
          ...ann,
          start: offset + newStart,
          end: offset + newEnd,
          ...(typeof ann.strand === 'number' ? { strand: -ann.strand } : {}),
        });
      } else {
        annotations.push({
          ...ann,
          start: offset + s,
          end: offset + e,
        });
      }
    }

    sequence += fragSeq;
  }

  return { sequence, annotations };
}
