/**
 * AlignmentChromatogramTrack — the Sanger trace drawn beneath the read track,
 * column-locked to the reference (each read base's peak sits under its
 * reference column). Opt-in: rendered only when SequenceLine receives both an
 * `alignmentRead` and a `chromatogram`. The per-line slice keeps it fast.
 */
import { memo } from 'react';
import { traceWindowForBase } from '../../../lib/alignment/chromatogram-model.js';

const NUC = { A: '#1D9E75', C: '#378ADD', G: '#C77F1A', T: '#E24B4A' };
const H = 42;
const BASE_Y = H - 6;
const PEAK_TOP = 4;
const MAX_H = BASE_Y - PEAK_TOP;

function AlignmentChromatogramTrack({ lineStart, lineLen, charPx, labelChars, alignmentRead, chromatogram, maxVal: maxValProp }) {
  if (!chromatogram || chromatogram.sampleCount <= 0 || !alignmentRead || !lineLen || charPx <= 0) return null;
  const { readByRefPos } = alignmentRead;
  const traces = chromatogram.traces || { A: [], C: [], G: [], T: [] };
  const width = (labelChars + lineLen) * charPx;
  const off = labelChars * charPx;

  // gather per-column trace windows for this line
  const windows = [];
  for (let ci = 0; ci < lineLen; ci++) {
    const r = readByRefPos[lineStart + ci];
    windows.push(r && r.bi != null ? { ci, w: traceWindowForBase(chromatogram, r.bi) } : null);
  }

  let maxVal = maxValProp || 1;
  if (!maxValProp) {
    windows.forEach((e) => { if (!e) return; for (let s = e.w.start; s < e.w.end; s++) ['A', 'C', 'G', 'T'].forEach((ch) => { const v = traces[ch][s] || 0; if (v > maxVal) maxVal = v; }); });
  }

  const paths = { A: '', C: '', G: '', T: '' };
  ['A', 'C', 'G', 'T'].forEach((ch) => {
    let d = '';
    windows.forEach((e) => {
      if (!e) return;
      const span = Math.max(1, e.w.end - e.w.start);
      let first = true;
      for (let s = e.w.start; s < e.w.end; s++) {
        const x = off + (e.ci + (s - e.w.start) / span) * charPx;
        const y = BASE_Y - ((traces[ch][s] || 0) / maxVal) * MAX_H;
        d += `${first ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
        first = false;
      }
    });
    paths[ch] = d;
  });

  return (
    <svg data-testid="alignment-chromatogram-track" data-line-start={lineStart} width={width} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <text data-testid="aln-chromo-label" x={2} y={12} textAnchor="start" fontFamily="var(--font-sans, sans-serif)" fontSize="9" fill="var(--text-tertiary, #78716c)">трасса</text>
      <line x1={off} y1={BASE_Y} x2={width} y2={BASE_Y} stroke="var(--border-subtle, #e7e5e4)" strokeWidth="1" />
      {['A', 'C', 'G', 'T'].map((ch) => (
        <path key={ch} data-testid="aln-chromo-path" d={paths[ch]} fill="none" stroke={NUC[ch]} strokeWidth="1.2" opacity="0.95" />
      ))}
    </svg>
  );
}

export default memo(AlignmentChromatogramTrack);
