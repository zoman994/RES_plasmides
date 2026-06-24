/**
 * anchor.js — locate a short query within a long reference via shared (w,k)
 * minimizers, so an expensive read-vs-reference alignment can run against a
 * narrow WINDOW of the reference instead of the whole thing.
 *
 * Why: the dominant align workspace workload is a Sanger read / sub-sequence
 * (m ≈ 0.5–1 kb) against a plasmid (n ≈ 3–8 kb) in local / semiglobal mode.
 * Full Gotoh is O(n·m) — 8 M cells for 8k×1k — and banding does NOT help there
 * (the band must widen by |n−m| ≈ n to let the read sit anywhere, so it spans
 * the whole reference). Seeding the read's position first lets us slice the
 * reference down to ≈ m + padding and run the SAME exact DP on that window —
 * O(window·m), a 4–6× cut — with no change to the optimum, because trimming
 * reference far from the read's mapping cannot contain a better local /
 * semiglobal placement.
 *
 * Strand note: `computeMinimizers` hashes each k-mer CANONICALLY (min of
 * forward / revcomp), so a reverse-strand read shares minimizer hashes with the
 * reference; the caller anchors each B-orientation (forward / revcomp)
 * independently, so positions stay in that orientation's coordinate space.
 *
 * Conservative by construction: repetitive minimizers are skipped, only a
 * single dominant collinear (same-diagonal) seed cluster anchors, and any
 * ambiguity / insufficient seeding returns null → the caller falls back to the
 * full DP. Pure, client-side.
 */
import { computeMinimizers } from '../minimizer-index.js';

/**
 * Estimate the reference window that query B maps into.
 * @param {string} A  reference (long)
 * @param {string} B  query / read (short)
 * @param {object} [opts]
 *   k, w               minimizer params (default 12 / 8, matching the index)
 *   minRefLen          don't bother below this reference length (default 1000)
 *   minSeeds           min collinear seeds to trust an anchor (default 4)
 *   maxHits            skip minimizers occurring >this many times in A (repeats; default 5)
 *   maxIndel           diagonal spread tolerated within one cluster (default 0.2·|B|+50)
 *   pad                reference padding each side of the seeded span (default 0.25·|B|+k+30)
 *   maxWinFrac         only window when it's <this fraction of A (default 0.7)
 * @returns {{winStart:number, winEnd:number}|null}  half-open ref window, or null
 */
export function anchorWindow(A, B, opts = {}) {
  const k = opts.k ?? 12;
  const w = opts.w ?? 8;
  const minRefLen = opts.minRefLen ?? 1000;
  const minSeeds = opts.minSeeds ?? 4;
  const maxHits = opts.maxHits ?? 5;
  if (!A || !B || A.length < minRefLen || B.length < k) return null;

  const refMin = computeMinimizers(A, { k, w });
  const qMin = computeMinimizers(B, { k, w });
  if (refMin.length < minSeeds || qMin.length < minSeeds) return null;

  // hash → reference positions (skip repeats lazily at lookup time)
  const byHash = new Map();
  for (const m of refMin) {
    let arr = byHash.get(m.h);
    if (!arr) { arr = []; byHash.set(m.h, arr); }
    arr.push(m.pos);
  }

  // Seed matches carry a diagonal = refPos − readPos. Collinear seeds (a true
  // mapping) share a diagonal up to indel slack; repeats scatter across many.
  const seeds = [];
  for (const qm of qMin) {
    const arr = byHash.get(qm.h);
    if (!arr || arr.length > maxHits) continue; // unseen or repetitive → skip
    for (const rp of arr) seeds.push({ refPos: rp, diag: rp - qm.pos });
  }
  if (seeds.length < minSeeds) return null;

  // Largest cluster whose diagonal spread is within the indel tolerance.
  seeds.sort((s1, s2) => s1.diag - s2.diag);
  const tol = opts.maxIndel ?? (Math.ceil(0.2 * B.length) + 50);
  let bestLen = 0;
  let bestLo = 0;
  let bestHi = 0;
  let lo = 0;
  for (let hi = 0; hi < seeds.length; hi++) {
    while (seeds[hi].diag - seeds[lo].diag > tol) lo += 1;
    if (hi - lo + 1 > bestLen) { bestLen = hi - lo + 1; bestLo = lo; bestHi = hi; }
  }
  if (bestLen < minSeeds) return null;

  let refStart = Infinity;
  let refEnd = -Infinity;
  for (let i = bestLo; i <= bestHi; i++) {
    if (seeds[i].refPos < refStart) refStart = seeds[i].refPos;
    if (seeds[i].refPos > refEnd) refEnd = seeds[i].refPos;
  }
  refEnd += k; // minimizer pos is the k-mer START

  const pad = opts.pad ?? (Math.ceil(0.25 * B.length) + k + 30);
  const winStart = Math.max(0, refStart - pad);
  const winEnd = Math.min(A.length, refEnd + pad);
  // Only worth it when the window is meaningfully smaller than the whole ref.
  if (winEnd - winStart >= A.length * (opts.maxWinFrac ?? 0.7)) return null;
  return { winStart, winEnd };
}
