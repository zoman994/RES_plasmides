/**
 * ProteinEffectBadge (UX-6) — at-a-glance protein consequence of a pending
 * sequence edit, evaluated across the CDS/gene features and showing the MOST
 * SEVERE verdict (frameshift ⚠ wins). Geneious's «Protein Effect» as a live
 * badge; the loud frameshift case is the molbiol headline.
 *
 * Pure-presentational: given the original + edited sequences + annotations, it
 * renders a single chip (or null when there's no edit / no coding feature).
 */
import { useMemo } from 'react';
import { getRegions } from '../../../annotation-model';
import { classifyProteinEffect, PROTEIN_EFFECT_META } from '../../../lib/protein-effect';

// Worst-first severity so the badge reflects the most consequential change.
const SEVERITY = { frameshift: 5, truncation: 4, extension: 3, missense: 2, 'inframe-indel': 1, silent: 0, none: -1 };
const isCoding = (t) => /(^|_)(cds|gene)($|_)/i.test(t || '');

const TONE_STYLE = {
  ok: { color: 'var(--success-fg, #15803d)', bg: 'var(--surface-2)' },
  warn: { color: 'var(--accent-700, #b45309)', bg: 'var(--accent-50, #fffbeb)' },
  bad: { color: 'rgb(220,38,38)', bg: 'var(--surface-2)' },
  none: { color: 'var(--text-tertiary)', bg: 'var(--surface-2)' },
};

export default function ProteinEffectBadge({ originalSequence, editedSequence, annotations }) {
  const effect = useMemo(() => {
    if (editedSequence == null || editedSequence === originalSequence) return null;
    const cds = getRegions(annotations).filter((r) => isCoding(r.type));
    if (!cds.length) return null;
    let best = null;
    for (const r of cds) {
      const e = classifyProteinEffect(originalSequence, editedSequence, r);
      if (e.kind === 'none') continue;
      if (!best || (SEVERITY[e.kind] ?? -1) > (SEVERITY[best.kind] ?? -1)) best = e;
    }
    return best;
  }, [originalSequence, editedSequence, annotations]);

  if (!effect || effect.kind === 'none') return null;
  const meta = PROTEIN_EFFECT_META[effect.kind] || PROTEIN_EFFECT_META.none;
  const tone = TONE_STYLE[meta.tone] || TONE_STYLE.none;
  const detail = effect.kind === 'missense' && effect.changes?.length
    ? ` ${effect.changes[0].from}${effect.changes[0].pos}${effect.changes[0].to}${effect.changes.length > 1 ? ` +${effect.changes.length - 1}` : ''}`
    : '';

  return (
    <span
      data-testid="protein-effect-badge"
      data-effect={effect.kind}
      title={`Эффект правки на белок: ${meta.label}${detail}`}
      style={{
        fontSize: 10.5, lineHeight: '16px', padding: '0 7px', borderRadius: 9,
        background: tone.bg, color: tone.color, border: '1px solid var(--border-subtle)',
        whiteSpace: 'nowrap', flexShrink: 0, fontWeight: meta.tone === 'bad' ? 600 : 500,
      }}
    >
      белок: {meta.label}{detail}
    </span>
  );
}
