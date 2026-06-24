/**
 * DigestFragmentPicker — when a restriction digest cuts at >2 sites, the
 * fragment is ambiguous, so show ALL the bands the digest produces (the «gel»)
 * on a plasmid map and let the biolog pick the one to extract (Игорь 21.06.2026:
 * «модалка с кольцевой/линейной плазмидой, какие куски есть и какой выбрать —
 * это рестрикция/гель/выделение»). The pick is recorded as context (the
 * acquisitionParams carry the digest + the chosen band).
 */
import { useState } from 'react';
import { RE_ENZYMES } from '../../../../restriction-db';
import { digestFragments } from '../../lib/digest-fragments';
import PlasmidMapV2 from '../../../PlasmidMapV2';

const BAND_COLORS = ['#4A7C59', '#b85c3e', '#3e6db8', '#b8860b', '#7c4a6e', '#3e8c8c', '#8c6a3e'];

export default function DigestFragmentPicker({
  source, enzymes, onPick, onCancel,
}) {
  const seq = (source && source.sequence) || '';
  const circular = !!(source && source.circular);
  const annotations = (source && source.annotations) || [];
  const { fragments, seqLen } = digestFragments(seq, enzymes, circular, RE_ENZYMES);
  const [selected, setSelected] = useState(0);
  // Bands drawn ON the map — one selectable arc per fragment, coloured to match
  // the «gel» rows below; clicking either updates the same `selected`.
  const bands = fragments.map((f, i) => ({
    index: f.index, start: f.start, end: f.end, wraps: f.wraps,
    color: BAND_COLORS[i % BAND_COLORS.length],
  }));
  // Click an RE cut on the map → select the band that STARTS at that cut (the
  // marker carries the recognition position; the cut sits a few bp downstream, so
  // pick the fragment whose start is nearest). Игорь 22.06: «кликабельные сайты».
  const onReSiteClick = (marker) => {
    const p = (marker && marker.positions && marker.positions[0]) || 0;
    let best = null; let bd = Infinity;
    for (const f of fragments) {
      const d = Math.abs(f.start - p);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) setSelected(best.index);
  };

  return (
    <div
      role="dialog"
      data-testid="digest-fragment-picker"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(28,25,23,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 16px 48px rgba(28,25,23,0.32)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <strong style={{ fontSize: 13 }}>Дайджест → выбор полосы (гель)</strong>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
            {`${(enzymes || []).filter(Boolean).join(' + ')} · ${circular ? 'кольцевая' : 'линейная'} · ${fragments.length} фрагмент(ов)`}
          </span>
        </div>

        <div style={{ padding: 14, overflow: 'auto' }}>
          {/* Real plasmid map (features + ALL RE cut sites, circular/linear) so
              the band choice is bound to features and every cut is visible —
              not viewport-limited (Игорь 21.06). */}
          <div data-testid="digest-map" style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            {/* Constrained box so the map isn't bulky (Игорь 22.06: «громоздкая»). */}
            <div style={{ width: 'min(440px, 80vh)', height: 'min(440px, 80vh)' }}>
              <PlasmidMapV2
                fragments={[{ sequence: seq, annotations, length: seqLen }]}
                constructName={(source && source.name) || ''}
                totalBp={seqLen}
                topology={circular ? 'circular' : 'linear'}
                reEnzymesFilter={(enzymes || []).filter(Boolean)}
                bands={bands}
                selectedBandIndex={selected}
                onSelectBand={setSelected}
                onReSiteClick={onReSiteClick}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {fragments.map((f, i) => (
              <button
                key={f.index}
                type="button"
                data-testid={`digest-fragment-row-${f.index}`}
                onClick={() => setSelected(f.index)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  border: `0.5px solid ${f.index === selected ? 'var(--border-secondary)' : 'var(--border-tertiary, var(--border-subtle))'}`,
                  background: f.index === selected ? 'var(--surface-2)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, background: BAND_COLORS[i % BAND_COLORS.length], flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{`Полоса ${f.index + 1}`}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{`${f.length} bp`}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {`концы: ${f.leftEnzyme || 'нативный'} ↔ ${f.rightEnzyme || 'нативный'}`}
                </span>
                {f.wraps && <span style={{ color: 'var(--text-tertiary)' }}>· замыкается через начало</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <button type="button" data-testid="digest-cancel" onClick={onCancel} style={ghost}>Отмена</button>
          <button
            type="button"
            data-testid="digest-confirm"
            onClick={() => { const f = fragments[selected]; if (f) onPick(f); }}
            disabled={fragments.length === 0}
            style={primary}
          >
            Выделить эту полосу →
          </button>
        </div>
      </div>
    </div>
  );
}

const ghost = {
  fontSize: 11.5, padding: '5px 12px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primary = {
  fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
