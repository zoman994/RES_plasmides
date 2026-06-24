/**
 * align-circular.js — rotation-invariant pairwise alignment for CIRCULAR
 * topology (literature-review §A3). A plasmid's origin (position 1) is
 * arbitrary, so a linear aligner produces a spurious indel/mismatch run at the
 * origin seam whenever the two molecules are rotated relative to each other
 * (and a query that physically spans the seam can't be placed at all).
 *
 * Standard trick: DOUBLE the reference (ref+ref) and place the query against it
 * with free reference-terminal gaps (semiglobal). The doubled reference
 * contains every rotation of the reference as a contiguous window, so the best
 * placement is found wherever the origin falls — including a query spanning the
 * seam. The hit is mapped back to ORIGINAL reference coordinates (mod refLen)
 * with a `wrapped` flag + rotation offset. Pure; reuses the (WFA-accelerated,
 * oracle-verified) align-pairwise engine.
 */
import { alignPairwise } from './align-pairwise';

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
function countNonGap(s) {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] !== '-') c += 1;
  return c;
}

/**
 * @param {string} ref    circular reference (template).
 * @param {string} query  query (Sanger read, or another plasmid).
 * @param {object} [opts]  passed to alignPairwise (match/mismatch/gaps/tryRevComp…);
 *                         `mode` defaults to 'semiglobal' (place the query into the ring).
 * @returns {object} alignPairwise result PLUS:
 *   refStart  — 0-based start of the hit in the ORIGINAL reference (mod refLen)
 *   wrapped   — true when the alignment crosses the origin seam
 *   refLen    — reference length
 *   coverageRef — % of the reference covered, relative to refLen (not the double)
 */
export function alignCircular(ref, query, opts = {}) {
  const R = clean(ref);
  const Q = clean(query);
  const refLen = R.length;
  if (!refLen || !Q.length) {
    const r = alignPairwise(R, Q, opts);
    return { ...r, refStart: 0, wrapped: false, refLen, coverageRef: 0 };
  }
  // Double the reference so every rotation is a contiguous window. Banding/WFA
  // in the engine keep this affordable even for full plasmids.
  const doubled = R + R;
  const res = alignPairwise(doubled, Q, { ...opts, mode: opts.mode || 'semiglobal' });

  const refStart = ((res.aStart % refLen) + refLen) % refLen;
  const refBases = countNonGap(res.alignedA);
  const aEnd = res.aStart + refBases; // end position in doubled coordinates
  const wrapped = res.aStart < refLen && aEnd > refLen;
  const coverageRef = Math.min(100, (refBases / refLen) * 100);

  return { ...res, refStart, wrapped, refLen, coverageRef };
}
