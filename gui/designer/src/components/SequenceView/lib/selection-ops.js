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
 * Sticky-end overhangs at the selection boundaries. A selection end coincides
 * with a restriction cut when it equals a scanned site's `position` (which
 * `flattenSites` already stores as the TOP-strand cut = recognition + cut[0]).
 * The BOTTOM-strand cut at that end is `position + (cut[1] - cut[0])`, so the
 * bottom strand's selection edge is offset from the top edge by `delta`.
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
