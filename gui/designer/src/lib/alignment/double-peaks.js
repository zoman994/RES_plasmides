/**
 * double-peaks — detect heterozygous / mixed Sanger positions: a secondary
 * trace peak comparable to the primary at a called base → an IUPAC ambiguity
 * (Игорь: «двойные пики / гетерозиготы в объёме»). Pure analysis over the parsed
 * chromatogram; the read track marks the flagged base indices.
 */

// Two-base IUPAC ambiguity codes.
const IUPAC2 = {
  AG: 'R', GA: 'R', CT: 'Y', TC: 'Y', GC: 'S', CG: 'S',
  AT: 'W', TA: 'W', GT: 'K', TG: 'K', AC: 'M', CA: 'M',
};

const CHANNELS = ['A', 'C', 'G', 'T'];

/**
 * @param {object} chromatogram — { traces:{A,C,G,T}, peakLocations:number[] }.
 * @param {{ratio?:number, minPrimary?:number}} [opts] — `ratio` = secondary/primary
 *        threshold (default 0.35), `minPrimary` floors noise.
 * @returns {Object<number, {code:string, primary:string, secondary:string, ratio:number}>}
 *          keyed by BASE INDEX (matches readByRefPos[*].bi).
 */
export function detectDoublePeaks(chromatogram, opts = {}) {
  const { ratio = 0.35, minPrimary = 1 } = opts;
  const out = {};
  if (!chromatogram) return out;
  const traces = chromatogram.traces || {};
  const peaks = chromatogram.peakLocations || [];
  for (let i = 0; i < peaks.length; i++) {
    const s = peaks[i];
    const vals = CHANNELS.map((ch) => ({ ch, v: (traces[ch] && traces[ch][s]) || 0 }));
    vals.sort((a, b) => b.v - a.v);
    const primary = vals[0];
    const secondary = vals[1];
    if (primary.v < minPrimary) continue;
    const r = secondary.v / primary.v;
    if (r >= ratio) {
      out[i] = {
        code: IUPAC2[primary.ch + secondary.ch] || 'N',
        primary: primary.ch,
        secondary: secondary.ch,
        ratio: r,
      };
    }
  }
  return out;
}

/**
 * Re-key a base-index double-peak map onto reference positions, using a read's
 * readByRefPos (whose entries carry `bi`). So the read track can mark by column.
 */
export function doublePeaksByRefPos(doublePeaksByBi, readByRefPos) {
  const out = {};
  if (!doublePeaksByBi || !readByRefPos) return out;
  for (const pos of Object.keys(readByRefPos)) {
    const r = readByRefPos[pos];
    if (r && r.bi != null && doublePeaksByBi[r.bi]) out[pos] = doublePeaksByBi[r.bi];
  }
  return out;
}
