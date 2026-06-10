/**
 * piece-mutations — shared, pure application of a piece's `mutations[]`
 * onto its top-strand sequence (SPEC_EDITABLE_ASSEMBLY_S2 §5.3).
 *
 * Each mutation overwrites ONE base at a local 0-based offset
 * (`{position, toBase}`); out-of-range / malformed entries are ignored.
 * Extracted byte-identically from primer-derive.pieceSequence so the
 * primer engine, draftFromZone (assembled-view rendering) and the
 * unified primer calculator all apply mutations the same way (DRY).
 */
export function applyPieceMutations(seq, mutations) {
  const s = typeof seq === 'string' ? seq : '';
  if (!Array.isArray(mutations) || mutations.length === 0 || s.length === 0) return s;
  const arr = s.split('');
  for (const m of mutations) {
    if (m
      && Number.isFinite(m.position) && m.position >= 0 && m.position < arr.length
      && typeof m.toBase === 'string' && m.toBase.length === 1) {
      arr[m.position] = m.toBase.toUpperCase();
    }
  }
  return arr.join('');
}
