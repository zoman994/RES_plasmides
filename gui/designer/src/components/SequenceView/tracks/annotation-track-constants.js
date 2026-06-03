/**
 * AnnotationTrack layout constants — extracted from AnnotationTrack.jsx
 * (decomp P1, size-budget; values byte-for-byte unchanged).
 */
export const ROW_HEIGHT = 14;
export const ROW_GAP = 2;
export const LABEL_FONT_SIZE = 9;
export const CHEVRON_PAD = 2;
export const SHORT_VISIBLE_THRESHOLD = 4; // chars
// Sprint M-X.3 follow-up — small SBOL glyph badge sits at the left
// of every wide-enough region so biolog can scan feature TYPES at
// a glance without reading every label. Glyph is 11×11; rect needs
// at least 14 px of width to fit it without crowding the label.
export const GLYPH_SIZE = 11;
export const GLYPH_MIN_PX = 14;
// Shortened from 14 → 8 px (biolog visual review 03.05.2026 evening,
// pBR322 lac operator/promoter pair: «ещё есть куда приближать»). The
// leader still reads clearly as a tick connecting the rect to its
// label, but the constant LEADER_RESERVED below the rect — required for
// inter-line consistency so longest-feature row stays at a stable
// distance from DNA — drops from 25 to 19 px. Combined with
// STRAND_GAP 5 → 1, the annotation→DNA gap shrinks ~8 px without
// sacrificing the constant-height invariant (LEADER_RESERVED is still
// reserved on every line regardless of whether THIS line uses a leader,
// so AmpR / lacZα don't jump line-to-line).
export const LEADER_LINE_LENGTH_PX = 8;
