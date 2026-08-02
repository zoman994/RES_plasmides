/**
 * dna-myers-block — the ONE block-vector Myers recurrence in this codebase.
 *
 * WHY THIS FILE EXISTS. Two scanners were computing the same bit-parallel edit-distance
 * recurrence in two different number representations: the production scan on a single arbitrary-width
 * `BigInt`, the experimental linear kernel on 32-bit words. A U6 CPU profile of the shipped worker
 * put 71.5 % of an approximate 1 Mb pass inside the BigInt sweep and another 13.9 % in its wrapper —
 * 85 % of the work in the arithmetic, not in the biology. Porting the production scan to words is
 * therefore the change worth making; copying the linear kernel's loop into the production file would
 * have made a second implementation of the identical recurrence, which is how the two drift.
 *
 * So the word arithmetic, the carry between words and the score bit live HERE, once, and both callers
 * are adapters over it:
 *   • `dna-approx-scan` sweeps the REVERSED query over the REVERSED target and reports forward
 *     STARTS. It needs the exact distance at every position (it splits exact from approximate), so it
 *     runs with the cutoff OFF — the same shape the BigInt version had. Its generator chunking stays
 *     in that file: suspension is a transport concern, not an arithmetic one.
 *   • `dna-linear-scan` sweeps forward and reports candidate ENDS, with the active-block cutoff on.
 *
 * The recurrence is Myers 1999 in Hyyrö's block form. Nothing here is new: it is the code that was
 * already running inside `MyersScanner`, moved out and given the two entry points both callers need.
 *
 * Pure. No allocation per position; every array is sized once, in the constructor.
 */

/** Words needed for a pattern of length `m` (at least one, so an empty pattern still has state). */
export function blockCount(m) {
  return ((m + 31) >>> 5) || 1;
}

/**
 * Equal-position bitmasks for a pattern given as small integer codes (0..alphabet-1).
 * Layout is `code * nb + block`, so one symbol's whole row is contiguous — the scan reads it by a
 * single base offset instead of a lookup per word.
 */
export function buildPeqCoded(codes, alphabet) {
  const m = codes.length;
  const nb = blockCount(m);
  const peq = new Int32Array(alphabet * nb);
  for (let i = 0; i < m; i += 1) {
    const c = codes[i];
    if (c >= 0 && c < alphabet) peq[c * nb + (i >>> 5)] |= (1 << (i & 31));
  }
  return peq;
}

/**
 * The block-Myers state machine for one pattern.
 *
 * `Score[b]` is the edit distance of the pattern PREFIX covered by blocks 0..b against the best text
 * substring ending at the current position. With every block active, `Score[nb-1]` is the distance
 * for the whole pattern — which is exactly the number the single-BigInt version reported.
 */
export class BlockMyers {
  /**
   * @param {number} m pattern length
   * @param {number} k edit budget — used only by the active-block cutoff
   */
  constructor(m, k) {
    const nb = blockCount(m);
    this.m = m;
    this.k = k;
    this.nb = nb;
    this.VP = new Int32Array(nb);
    this.VN = new Int32Array(nb);
    this.Score = new Int32Array(nb);
    this.blockLen = new Int32Array(nb);
    this.hbit = new Int32Array(nb);
    for (let b = 0; b < nb; b += 1) {
      this.blockLen[b] = Math.min((b + 1) * 32, m) - b * 32;
      // The LAST block reads its score bit at (m-1)%32, NOT bit 31 — the classic silent block-Myers
      // bug. Padding bits above (m-1)%32 only ever carry upward, never downward, so reading bit 31
      // on a pattern whose length is not a multiple of 32 counts carries that do not exist.
      this.hbit[b] = (b === nb - 1) ? ((m - 1) & 31) : 31;
    }
    this.y = nb - 1;
    this.reset(false);
  }

  /** Fresh state for a new sweep. `cutoff` decides how much of the pattern starts active. */
  reset(cutoff) {
    const { nb, m, VP, VN, Score, k } = this;
    for (let b = 0; b < nb; b += 1) {
      VP[b] = -1;
      VN[b] = 0;
      Score[b] = Math.min((b + 1) * 32, m);
    }
    this.y = cutoff ? Math.min(nb - 1, (k / 32) | 0) : nb - 1;
  }

  /**
   * One 32-bit word of the recurrence. `hin` is the horizontal delta arriving from the block below
   * (-1, 0 or +1); the return value is the delta leaving this block upward.
   */
  step(b, eq, hin, hbit) {
    const VP = this.VP;
    const VN = this.VN;
    const Pv = VP[b] | 0;
    const Mv = VN[b] | 0;
    const Xv = (eq | Mv) | 0;
    // A -1 arriving from below is injected as an extra equal bit at position 0: that is how the
    // carry crosses a word boundary without materialising the whole vector.
    const eqc = (hin < 0) ? (eq | 1) : eq;
    const sum = (((eqc & Pv) >>> 0) + (Pv >>> 0)) >>> 0;
    const Xh = ((sum ^ Pv) | eqc) | 0;
    let Ph = (Mv | ~(Xh | Pv)) | 0;
    let Mh = (Pv & Xh) | 0;
    let hout = 0;
    if ((Ph >>> hbit) & 1) hout = 1;
    else if ((Mh >>> hbit) & 1) hout = -1;
    Ph = (Ph << 1) | 0;
    Mh = (Mh << 1) | 0;
    if (hin < 0) Mh |= 1;
    else if (hin > 0) Ph |= 1;
    VP[b] = (Mh | ~(Xv | Ph)) | 0;
    VN[b] = (Ph & Xv) | 0;
    return hout;
  }

  /**
   * Advance one text position.
   *
   * @param {Int32Array} peq flat equal-masks, one contiguous row per symbol
   * @param {number} base row offset for the symbol at this position; NEGATIVE means «a symbol the
   *   pattern does not contain», whose row is all zeros — an unknown glyph matches nothing rather
   *   than matching everything, which is the difference between a miss and a false 100 % hit
   * @param {boolean} cutoff keep only the blocks that can still hold a value within `k`
   * @returns {number} the distance for the WHOLE pattern, or -1 while the pattern is not fully
   *   active (only possible with the cutoff on)
   */
  advance(peq, base, cutoff) {
    const { nb, Score, VP, VN, blockLen, hbit, k } = this;
    let y = this.y;
    let hin = 0;
    for (let b = 0; b <= y; b += 1) {
      const eq = base < 0 ? 0 : peq[base + b];
      const hout = this.step(b, eq, hin, hbit[b]);
      Score[b] += hout;
      hin = hout;
    }
    if (cutoff) {
      // GROW: a higher block can hold a value <= k only once the last row of the active region is
      // <= k in this column or the previous one.
      while (y < nb - 1) {
        const dNow = Score[y];
        const dPrev = dNow - hin;
        if (dNow > k && dPrev > k) break;
        const seed = dPrev + blockLen[y + 1];
        y += 1;
        VP[y] = -1;
        VN[y] = 0;
        const eq = base < 0 ? 0 : peq[base + y];
        const hout = this.step(y, eq, hin, hbit[y]);
        Score[y] = seed + hout;
        hin = hout;
      }
      // SHRINK: every row of block y is at least `Score[y] - (blockLen - 1)`, so once that exceeds
      // the budget the block cannot contribute again.
      while (y > 0 && Score[y] > k + 32) y -= 1;
      this.y = y;
      return y === nb - 1 ? Score[nb - 1] : -1;
    }
    return Score[nb - 1];
  }
}
