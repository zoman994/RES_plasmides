/**
 * Pure helpers that bridge a parsed chromatogram (from `abif-parse.js`) to the
 * column-locked renderer: which trace samples belong to base i, which read base
 * sits under each alignment column, and reverse-complementing a trace when the
 * Sanger read aligned on the reverse strand.
 */
import { reverseComplement } from '../../sequence-utils.js';

/**
 * Sample window for base `i`: from the midpoint to the previous peak to the
 * midpoint to the next peak (clamped to the trace bounds). This is the slice of
 * the trace drawn inside that base's alignment column.
 */
export function traceWindowForBase(chromatogram, i) {
  const ploc = chromatogram.peakLocations || [];
  const L = ploc.length;
  const sc = chromatogram.sampleCount || 0;
  if (L === 0) return { start: 0, end: 0, peak: 0 };
  const peak = ploc[i];
  const prevStep = L > 1 ? ploc[1] - ploc[0] : 10;
  const lastStep = L > 1 ? ploc[L - 1] - ploc[L - 2] : 10;
  const prev = i > 0 ? ploc[i - 1] : peak - prevStep;
  const next = i < L - 1 ? ploc[i + 1] : peak + lastStep;
  let start = Math.round((prev + peak) / 2);
  let end = Math.round((peak + next) / 2);
  start = Math.max(0, start);
  if (sc > 0) end = Math.min(sc, end);
  if (end < start) end = start;
  return { start, end, peak };
}

/**
 * For each alignment column, the index of the trace base under it on `side`
 * ('a' or 'b'); null where that side has a gap. Drives column-locked drawing.
 */
export function mapAlignmentToTrace(columns, side = 'b') {
  const key = side === 'a' ? 'ai' : 'bi';
  return columns.map((c) => (c[key] == null ? null : c[key]));
}

/**
 * Reverse-complement a chromatogram so a reverse-strand read can be drawn with
 * the same forward renderer: samples reversed, channels swapped (A↔T, C↔G),
 * peak locations and qualities flipped onto the reversed sample axis.
 */
export function reverseComplementChromatogram(chromatogram) {
  const sc = chromatogram.sampleCount || 0;
  const rev = (arr) => {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[arr.length - 1 - i];
    return out;
  };
  const t = chromatogram.traces;
  const traces = { A: rev(t.T), T: rev(t.A), C: rev(t.G), G: rev(t.C) };
  const ploc = chromatogram.peakLocations || [];
  const L = ploc.length;
  const peakLocations = new Array(L);
  const lastSample = sc > 0 ? sc - 1 : 0;
  for (let k = 0; k < L; k++) peakLocations[k] = lastSample - ploc[L - 1 - k];
  return {
    bases: reverseComplement(chromatogram.bases || ''),
    qualities: rev(chromatogram.qualities || []),
    peakLocations,
    traces,
    sampleCount: sc,
  };
}
