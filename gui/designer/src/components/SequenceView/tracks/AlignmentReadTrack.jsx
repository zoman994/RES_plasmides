/**
 * AlignmentReadTrack — the aligned read drawn beneath the reference, keyed to
 * reference columns (so it reuses SequenceView's char-grid + ruler + the
 * reference's annotations rather than a parallel viewer). Opt-in: rendered only
 * when SequenceLine receives an `alignmentRead` (the adapter output from
 * `lib/alignment/align-to-reference.js`).
 *
 * Per reference column: the read base. Bases are BLACK by default (Игорь:
 * «вернём чёрный» — coloured A/C/G/T was visual noise); `colorMode="nucleotide"`
 * re-enables the per-base palette. A MISMATCH is always a red letter (the signal
 * is the colour of the letter, not a box around it — Игорь: «красным за счёт
 * рамок плохо») over a very soft, border-less tint. Deletions render as «–»;
 * insertions (bases with no reference column) show a between-column caret with
 * the inserted bases in the tooltip. The track names itself in the left gutter
 * on the first line.
 */
import { memo } from 'react';
import { SEQUENCE_FONT_FAMILY } from '../lib/grid.js';

// Same nucleotide palette as the Align legend (kept local so this core track
// has no dependency on the Align feature module). Read letters share the
// reference's monospace font (Игорь: «шрифт выравнивания и референса отличается»)
// — explicit so they line up with the HTML strand glyph-for-glyph.
const NUC = { A: '#1D9E75', C: '#378ADD', G: '#C77F1A', T: '#E24B4A' };
const MISMATCH = '#E24B4A';
const PLAIN = 'var(--text-primary, #1c1917)';
const ROW_H = 18;

// AA-effect (P2, redesigned per Игорь — «точки аляповато»): a thin grid-aligned
// bar above a PROTEIN-CHANGING mismatch only (silent/synonymous is dropped as
// noise). Amber = missense, red = nonsense (premature stop, taller).
const AA_EFFECT_COLOR = { missense: '#C77F1A', nonsense: '#E24B4A' };
const AA_EFFECT_RU = { silent: 'синонимичная', missense: 'миссенс', nonsense: 'нонсенс (стоп)' };

function truncLabel(s, n) {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

function AlignmentReadTrack({
  lineStart, lineLen, charPx, labelChars, alignmentRead, colorMode = 'plain',
  readName, aaEffects, doublePeaks, isConsensus = false,
  // P3 — «accept read base»: when provided, clicking a mismatch cell calls
  // onAcceptBase(refPos, readBase) to correct the (working-copy) reference.
  onAcceptBase,
}) {
  if (!alignmentRead || !lineLen || charPx <= 0) return null;
  const { readByRefPos, insertions } = alignmentRead;
  const width = (labelChars + lineLen) * charPx;
  const els = [];

  for (let ci = 0; ci < lineLen; ci++) {
    const r = readByRefPos[lineStart + ci];
    if (!r) continue;
    const cx = (labelChars + ci + 0.5) * charPx;
    if (r.base === '-') {
      els.push(<text key={`d${ci}`} x={cx} y={13} textAnchor="middle" fontFamily={SEQUENCE_FONT_FAMILY} fontSize="12" fill="var(--text-tertiary, #78716c)">–</text>);
      continue;
    }
    const isMismatch = r.status === 'mismatch';
    const acceptable = isMismatch && typeof onAcceptBase === 'function';
    if (isMismatch) {
      // Soft, border-less tint only — no «red box» outline. When «accept base»
      // is wired, the cell is a click target (correct the reference here).
      const refPos = lineStart + ci;
      els.push(
        <rect key={`mm${ci}`} data-testid="aln-read-mismatch" data-accept={acceptable ? 'true' : undefined}
          x={(labelChars + ci) * charPx + 0.5} y={1} width={Math.max(1, charPx - 1)} height={ROW_H - 2} rx="2"
          fill={MISMATCH} fillOpacity="0.07"
          style={acceptable ? { cursor: 'pointer' } : undefined}
          onClick={acceptable ? () => onAcceptBase(refPos, r.base) : undefined}>
          {acceptable ? <title>{`принять базу чтения «${r.base}» в референс`}</title> : null}
        </rect>,
      );
    }
    // Mismatch → red letter; otherwise black (plain) or the nucleotide palette.
    const fill = isMismatch ? MISMATCH : (colorMode === 'nucleotide' ? (NUC[r.base] || PLAIN) : PLAIN);
    // The letter is the click target too (the rect alone misses clicks landing
    // ON the glyph — Игорь «редактирование не работает»).
    els.push(
      <text key={`b${ci}`} data-testid="aln-read-base" data-base={r.base} data-mismatch={isMismatch ? 'true' : undefined}
        x={cx} y={13} textAnchor="middle" fontFamily={SEQUENCE_FONT_FAMILY} fontSize="12" fontWeight={isMismatch ? 600 : 400} fill={fill}
        style={acceptable ? { cursor: 'pointer' } : undefined}
        onClick={acceptable ? () => onAcceptBase(lineStart + ci, r.base) : undefined}>
        {r.base}
      </text>,
    );

    // AA-effect bar for a PROTEIN-CHANGING CDS mismatch (silent dropped as noise).
    const eff = isMismatch && aaEffects ? aaEffects[lineStart + ci] : null;
    if (eff && eff.effect !== 'silent') {
      els.push(
        <rect key={`aa${ci}`} data-testid="aln-aa-effect" data-effect={eff.effect}
          x={(labelChars + ci) * charPx + 1} y={0.5} width={Math.max(1, charPx - 2)} height={eff.effect === 'nonsense' ? 3 : 2} rx="0.8"
          fill={AA_EFFECT_COLOR[eff.effect] || '#C77F1A'}>
          <title>{`${eff.refAA}→${eff.altAA} · ${AA_EFFECT_RU[eff.effect] || eff.effect}`}</title>
        </rect>,
      );
    }

    // Double-peak (heterozygous) marker — violet underline + IUPAC code tooltip.
    const dp = doublePeaks ? doublePeaks[lineStart + ci] : null;
    if (dp) {
      els.push(
        <rect key={`dp${ci}`} data-testid="aln-double-peak" data-code={dp.code}
          x={(labelChars + ci) * charPx + 1} y={ROW_H - 2.5} width={Math.max(1, charPx - 2)} height={1.6} fill="#8B5CF6">
          <title>{`двойной пик: ${dp.primary}/${dp.secondary} (${dp.code})`}</title>
        </rect>,
      );
    }
  }

  (insertions || []).forEach((ins, idx) => {
    const ci = ins.afterRefPos - lineStart + 1; // boundary before the next ref column
    if (ci < 0 || ci > lineLen) return;
    const x = (labelChars + ci) * charPx;
    els.push(
      <g key={`ins${idx}`} data-testid="aln-read-insertion">
        <title>{`вставка ${ins.bases.length} нт: ${ins.bases}`}</title>
        <path d={`M${(x - 3).toFixed(1)} 2 L${(x + 3).toFixed(1)} 2 L${x.toFixed(1)} 8 Z`} fill="var(--accent-500, #f59e0b)" />
      </g>,
    );
  });

  return (
    <svg data-testid="alignment-read-track" data-line-start={lineStart} width={width} height={ROW_H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Per-line read NAME label (Игорь: на каждой строке своим названием).
          Consensus row is emphasised (bold, accent). */}
      <text data-testid="aln-read-label" data-consensus={isConsensus ? 'true' : undefined} x={2} y={13} textAnchor="start" fontFamily="var(--font-sans, sans-serif)" fontSize="9" fontWeight={isConsensus ? 700 : 400} fill={isConsensus ? 'var(--accent-700, #b45309)' : 'var(--text-tertiary, #78716c)'}>
        <title>{readName || 'чтение'}</title>
        {truncLabel(readName || 'чтение', Math.max(3, Math.floor((labelChars * charPx - 4) / 5)))}
      </text>
      {els}
    </svg>
  );
}

export default memo(AlignmentReadTrack);
