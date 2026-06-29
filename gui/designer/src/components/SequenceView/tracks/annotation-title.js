/**
 * buildAnnotationTitle — gap-research quick-win. The native SVG `<title>` shown on
 * hover over a feature in the SequenceView track, so the enriched qualifier fields
 * (description / %identity, set by enrichWithCommonFeatures) are readable in the
 * SEQUENCE pane — not only on the maps' hover card. SnapGene/Benchling surface
 * qualifiers on hover in BOTH the map and the sequence view; this is the fastest
 * «what is this feature» lever on a dense fungal cassette.
 *
 * Pure (headless-testable). Composes, ` · `-separated:
 *   name · TYPE · 1-based span `s+1..e (len bp)` · strand (+/−) ·
 *   identity% (when region.identity is a 0..1 fraction) · description/note (HTML
 *   stripped — SnapGene descriptions arrive wrapped in <html><body>…).
 *
 * @param {{name?,type?,start?,end?,strand?,identity?,description?,note?,qualifiers?}} region
 * @returns {string} '' for a nullish region.
 */
export function buildAnnotationTitle(region) {
  if (!region) return '';
  const parts = [];
  const name = region.name || region.type || 'фича';
  parts.push(name);
  if (region.type && region.type !== name) parts.push(region.type);

  const s = Number(region.start);
  const e = Number(region.end);
  if (Number.isFinite(s) && Number.isFinite(e)) {
    const len = Math.max(0, e - s);
    parts.push(`${s + 1}..${e}${len ? ` (${len} bp)` : ''}`);
  }

  parts.push(region.strand === -1 ? '−' : '+');

  // enrichWithCommonFeatures stores identity as a 0..1 fraction.
  if (typeof region.identity === 'number' && region.identity > 0 && region.identity <= 1) {
    parts.push(`${Math.round(region.identity * 100)}%`);
  }

  const rawNote = region.description
    || region.note
    || (region.qualifiers && (region.qualifiers.note || region.qualifiers.product));
  const note = stripHtml(Array.isArray(rawNote) ? rawNote[0] : rawNote);
  if (note) parts.push(note);

  return parts.join(' · ');
}

/** Strip HTML tags + collapse whitespace (SnapGene descriptions arrive as HTML). */
function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
