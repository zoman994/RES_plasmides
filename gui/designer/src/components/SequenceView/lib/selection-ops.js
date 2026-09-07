/**
 * selection-ops — pure helpers for two SequenceView selection features:
 *
 *  1. INVERT («Инвертировать выделение»): a selection of [lo,hi] can be flipped
 *     to its complement — everything EXCEPT [lo,hi]. The complement is two
 *     disjoint MAIN segments ([0,lo) + [hi,len)), which a single (anchor,focus)
 *     pair cannot represent, so the overlay paints `complementSegments` directly
 *     when an `inverted` flag is set, and copy uses `invertedSlice`.
 *
 *  2. STICKY ENDS («липкие концы»): when a selection's ends sit on restriction
 *     cut sites, the two strands are cut staggered by the enzyme overhang.
 *     `stickyEnds` derives the per-end bottom-strand offset (delta) so the
 *     overlay can draw the top and bottom strand highlights staggered.
 */

/**
 * Complement of [lo,hi] within [0,seqLength] as MAIN-row segments. Topology-
 * agnostic — visually it's the two highlighted regions «всё кроме [lo,hi]».
 * Returns [] when the whole sequence is selected (nothing to invert).
 */
export function complementSegments(lo, hi, seqLength) {
  if (!Number.isFinite(seqLength) || seqLength <= 0) return [];
  const a = Math.max(0, Math.min(seqLength, Math.min(lo, hi)));
  const b = Math.max(0, Math.min(seqLength, Math.max(lo, hi)));
  return [
    { kind: 'main', start: 0, end: a },
    { kind: 'main', start: b, end: seqLength },
  ].filter((s) => s.end > s.start);
}

/**
 * The complement string for copy. Linear → `[0,lo) + [hi,len)`. Circular → read
 * the long way through the origin: `[hi,len) + [0,lo)`.
 */
export function invertedSlice(seq, lo, hi, seqLength, circular) {
  const s = seq || '';
  if (!Number.isFinite(seqLength) || seqLength <= 0) return '';
  const a = Math.max(0, Math.min(seqLength, Math.min(lo, hi)));
  const b = Math.max(0, Math.min(seqLength, Math.max(lo, hi)));
  if (a <= 0 && b >= seqLength) return '';
  return circular
    ? s.slice(b, seqLength) + s.slice(0, a)
    : s.slice(0, a) + s.slice(b, seqLength);
}

/**
 * invertedStickyStrandRanges — the top/bottom strand ranges for the sticky-end
 * staircase of the INVERTED backbone (Игорь 07.07: «при инверсии обжирает липкие
 * концы»). When the biolog excises [sLo,sHi] between two restriction cuts and then
 * presses «Инвертировать», the piece taken is the COMPLEMENT arc (the backbone),
 * whose top strand wraps the origin: `[sHi, len] + [0, sLo]`.
 *
 * A restriction cut is a GLOBAL duplex property — the top strand is cut at
 * `position` and the bottom strand at `position + delta` — so the SAME per-cut
 * delta that staggers the excised piece staggers the backbone at the SAME columns,
 * only the backbone owns the OTHER side of each cut:
 *   • at the HIGH cut sHi (the backbone's physical LEFT end) the bottom strand
 *     starts at `sHi + rightDelta`  (rightDelta = the enzyme at sHi);
 *   • at the LOW cut sLo (the backbone's physical RIGHT end) the bottom strand
 *     ends at `sLo + leftDelta`      (leftDelta = the enzyme at sLo).
 * This mirrors the excised-piece formula `bottom = [sLo+leftDelta, sHi+rightDelta]`
 * (same signs → works for 5′ delta>0, 3′ delta<0, blunt 0), so the backbone's
 * overhang slivers are the exact complements of the insert's — nothing is eaten.
 *
 * @returns {{ top: number[][], bottom: number[][] }} inclusive-exclusive [a,b] ranges
 */
export function invertedStickyStrandRanges({
  sLo, sHi, leftDelta = 0, rightDelta = 0, seqLength,
} = {}) {
  if (!Number.isFinite(seqLength) || seqLength <= 0) return { top: [], bottom: [] };
  const lo = Math.max(0, Math.min(seqLength, Math.min(sLo, sHi)));
  const hi = Math.max(0, Math.min(seqLength, Math.max(sLo, sHi)));
  const clamp = ([a, b]) => [Math.max(0, Math.min(seqLength, a)), Math.max(0, Math.min(seqLength, b))];
  const top = [[hi, seqLength], [0, lo]].map(clamp).filter(([a, b]) => b > a);
  const bottom = [[hi + rightDelta, seqLength], [0, lo + leftDelta]].map(clamp).filter(([a, b]) => b > a);
  return { top, bottom };
}

/**
 * Sticky-end overhangs at the selection boundaries. A selection end coincides
 * with a restriction cut when it equals a scanned site's `position`.
 * Canonical sites carry their physical top/bottom cuts and actual overhang;
 * legacy direct callers fall back to the catalog cut delta.
 *
 *   delta > 0  → 5' overhang (top strand protrudes / recessed bottom)
 *   delta < 0  → 3' overhang
 *   delta = 0  → blunt (no sticky end)
 *
 * @returns null when neither end is a cut, else
 *   { leftDelta, rightDelta, left:{enzyme,delta,type,overhang}|null, right:{…}|null }
 */
export function stickyEnds({ selStart, selEnd, sites, enzymes }) {
  if (!Number.isFinite(selStart) || !Number.isFinite(selEnd) || selEnd <= selStart) return null;
  if (!Array.isArray(sites) || !sites.length || !enzymes) return null;
  const endInfo = (cutPos) => {
    for (const s of sites) {
      if (!s || s.position !== cutPos) continue;
      if (s.occurrence) {
        const occurrence = s.occurrence;
        const rawTop = occurrence.topCutUnwrapped;
        const rawBottom = occurrence.bottomCutUnwrapped;
        const overhang = occurrence.overhang;
        if (occurrence.enzyme !== s.enzyme
          || occurrence.topCut !== s.position
          || !Number.isFinite(rawTop)
          || !Number.isFinite(rawBottom)
          || !overhang
          || !Number.isFinite(overhang.length)
          || typeof overhang.seq !== 'string') continue;
        const delta = rawBottom - rawTop;
        if (Math.abs(delta) !== overhang.length || overhang.seq.length !== overhang.length) continue;
        const type = overhang.type === '5overhang'
          ? '5prime'
          : (overhang.type === '3overhang' ? '3prime' : overhang.type);
        if (!['5prime', '3prime', 'blunt'].includes(type)) continue;
        return {
          enzyme: s.enzyme,
          delta,
          type,
          overhang: overhang.length > 0 ? overhang.seq : null,
        };
      }
      const enz = enzymes[s.enzyme];
      if (!enz || !Array.isArray(enz.cut) || enz.cut.length < 2) continue;
      const delta = enz.cut[1] - enz.cut[0];
      const type = enz.end || (delta > 0 ? '5prime' : delta < 0 ? '3prime' : 'blunt');
      return { enzyme: s.enzyme, delta, type, overhang: enz.overhang || null };
    }
    return null;
  };
  const left = endInfo(selStart);
  const right = endInfo(selEnd);
  if (!left && !right) return null;
  return {
    leftDelta: left ? left.delta : 0,
    rightDelta: right ? right.delta : 0,
    left,
    right,
  };
}
