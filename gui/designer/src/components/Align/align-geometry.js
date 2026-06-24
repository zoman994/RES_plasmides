/**
 * Per-nucleotide colours — used for BOTH the base letters in the alignment and
 * the Sanger chromatogram channels, so the sequence reads by colour and the two
 * tracks agree. A green, C blue, G amber, T red (distinct + readable in light
 * and dark mode). Mismatches are marked structurally (an outline/tick), not by
 * recolouring the letter, so the colour keeps meaning «which base».
 */
export const NUCLEOTIDE_COLORS = { A: '#1D9E75', C: '#378ADD', G: '#C77F1A', T: '#E24B4A' };

// Back-compat alias: the chromatogram channels use the same palette.
export const CHANNEL_COLORS = NUCLEOTIDE_COLORS;

export const MISMATCH_COLOR = '#E24B4A';

export function qualityColor(q) {
  if (q >= 30) return '#639922';
  if (q >= 20) return '#BA7517';
  return '#E24B4A';
}
