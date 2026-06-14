/**
 * JunctionPopover — junction contract editor (F2 DEC-CANVAS-JUNC-06).
 *
 * Replaces the kind-only JunctionMethodPicker. Canvas-level badge click
 * opens it (NOT an editor tab — F2 §1). Four sections:
 *   1. Kind picker (6 methods, v0.5 palette).
 *   2. Overlap params — target L/R/both + length-XOR-Tm toggle.
 *   3. Ends preview — required from-3′ / to-5′ ends.
 *   4. Validation warnings (only when present).
 * Footer: Reset to auto + Close. Presentational — the reducer enforces
 * the length/Tm mutex + status flips.
 */
import { useEffect, useState } from 'react';
import {
  junctionStroke,
  junctionFill,
  junctionLabel,
  defaultJunctionParams,
  inferEndRequirements,
} from './junction-styles';
import { GG_ENZYMES } from '../../../golden-gate';
import { RE_ENZYMES } from '../../../restriction-db';

// F — enzyme choices per junction kind. GG = the 5 Type IIS; RE = common cloning
// workhorses (the full 63-enzyme DB is too long for this popover).
const GG_ENZYME_KEYS = Object.keys(GG_ENZYMES);
const RE_ENZYME_KEYS = ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'SalI', 'NdeI', 'NcoI', 'XbaI', 'PstI', 'KpnI', 'SacI', 'SpeI', 'NheI', 'BglII']
  .filter((k) => RE_ENZYMES[k]);
function enzymeKeysForKind(kind) {
  if (kind === 'golden_gate') return GG_ENZYME_KEYS;
  if (kind === 're_ligation') return RE_ENZYME_KEYS;
  return [];
}
function enzymeRecognition(kind, key) {
  if (kind === 'golden_gate') return GG_ENZYMES[key] && GG_ENZYMES[key].recognition;
  return RE_ENZYMES[key] && RE_ENZYMES[key].site;
}

// JC-2 — 'preformed' removed from the picker: the «ничего не делаем» tile mapped
// to a real blunt ligation (direct_ligation) — the label lied. (An already-
// 'preformed' container junction still DISPLAYS elsewhere; it just isn't a pick.)
const METHODS = [
  { id: 'overlap', title: 'Overlap (Gibson)', hint: 'Sequence-overlap PCR сборка' },
  { id: 'golden_gate', title: 'Golden Gate', hint: 'Type IIS — BsaI / BpiI / BsmBI' },
  { id: 're_ligation', title: 'RE лигирование', hint: 'Digest + sticky-end ligation' },
  { id: 'kld', title: 'KLD', hint: 'Back-to-back kinase/ligase/DpnI' },
  { id: 'ligation', title: 'Blunt ligation', hint: 'Тупые концы' },
];

// Overhang target L/R/both + length/Tm is an OVERLAP-PCR/Gibson concept only.
// RE/GG/KLD/sticky/blunt have enzyme- or chemistry-defined ends — no overlap
// length slider (Звено: stale overlapLength was leaking into non-overlap kinds).
const OVERLAP_KINDS = new Set(['overlap']);
const TARGETS = [
  { id: 'left', label: 'L' },
  { id: 'right', label: 'R' },
  { id: 'both', label: 'both' },
];

function endText(e) {
  if (!e) return 'any';
  if (e.type === 'blunt') return 'blunt';
  if (e.type === 'any') return 'any';
  if (e.overhang) return `overhang ${e.overhang}`;
  return `overhang ${e.length ?? 0} nt`;
}

export default function JunctionPopover({
  junction,
  position,
  warnings = [],
  onPick,
  onSetParams,
  onResetAuto,
  onCancel,
  // UX slice 3 — reverse gesture: promote this junction's method to the whole
  // assembly. Omitted by callers that don't support it → button hidden.
  onMakeAssemblyMethod,
  // JC-1 — restrict the offered kinds (e.g. an INTERNAL fuse boundary only
  // allows overlap / re_ligation). Omitted → all methods (container-junction caller).
  allowedKinds,
}) {
  const shownMethods = Array.isArray(allowedKinds) && allowedKinds.length > 0
    ? METHODS.filter((m) => allowedKinds.includes(m.id))
    : METHODS;
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Read-first (UX slice 2): a DECIDED junction (manually set) opens as a
  // compact summary; a TENTATIVE one (the auto-guess the strip flags) opens
  // ready-to-edit. The grid stays mounted — only CSS-collapsed.
  const [editing, setEditing] = useState(() => junction?.status !== 'manual');

  if (!junction) return null;
  const left = position?.x ?? 0;
  const top = position?.y ?? 0;
  const kind = junction.kind;
  const showOverlap = OVERLAP_KINDS.has(kind);
  const mode = junction.overlapTm != null ? 'tm' : 'length';
  const ends = inferEndRequirements(kind, junction.overlapTarget, junction.overlapLength);
  const activeMethod = METHODS.find((m) => m.id === kind);
  const decided = junction.status === 'manual';
  // F — enzyme-driven kinds (GG / RE) expose an enzyme picker.
  const enzymeKeys = enzymeKeysForKind(kind);

  return (
    <div
      data-testid="junction-popover-backdrop"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
    >
      <div
        data-testid="junction-popover"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left,
          top,
          transform: 'translate(-50%, 8px)',
          width: 300,
          maxHeight: '70vh',
          overflowY: 'auto',
          background: 'var(--surface-1, #fff)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 8,
          boxShadow: '0 6px 18px rgba(28,25,23,0.15)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              Метод сборки на стыке
            </span>
            <span
              data-testid="junction-popover-status"
              data-status={junction.status}
              title={junction.status === 'manual' ? 'Изменён вручную' : 'Авто-детект'}
              style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                padding: '1px 6px', borderRadius: 8,
                background: junction.status === 'manual' ? 'var(--accent-wash, #f3e8e3)' : 'var(--surface-1)',
                color: junction.status === 'manual' ? 'var(--accent-500, #b85c3e)' : 'var(--text-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}
            >{junction.status === 'manual' ? 'ВРУЧНУЮ' : 'АВТО'}</span>
          </div>
          <button
            type="button" data-testid="junction-popover-close" onClick={onCancel}
            style={{ background: 'transparent', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px' }}
          >×</button>
        </header>

        {/* Read-first summary — leads; the full grid collapses behind «изменить». */}
        <div
          data-testid="junction-popover-summary"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>Метод:</span>
          <strong style={{ color: 'var(--text-primary)' }}>{activeMethod ? activeMethod.title : kind}</strong>
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>· {decided ? 'выбран' : 'по умолчанию'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {onMakeAssemblyMethod && (
              <button
                type="button"
                data-testid="junction-popover-make-assembly"
                onClick={onMakeAssemblyMethod}
                title="Сделать этот метод методом всей сборки"
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)',
                }}
              >↑ методом сборки</button>
            )}
            <button
              type="button"
              data-testid="junction-popover-edit-toggle"
              onClick={() => setEditing((e) => !e)}
              style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--accent-500, #b85c3e)',
              }}
            >{editing ? 'свернуть' : 'изменить'}</button>
          </div>
        </div>

        {/* F — enzyme picker (GG / RE). Always visible for enzyme kinds: the
            chosen enzyme defines the chemistry, so it leads, not collapsed. */}
        {enzymeKeys.length > 0 && (
          <div
            data-testid="junction-popover-enzyme-row"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11.5,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              {kind === 'golden_gate' ? 'Фермент Type IIS:' : 'Рестриктаза:'}
            </span>
            <select
              data-testid="junction-popover-enzyme"
              value={junction.enzyme || enzymeKeys[0]}
              onChange={(e) => onSetParams?.({ enzyme: e.target.value })}
              style={{
                fontSize: 11.5, padding: '2px 6px', borderRadius: 4,
                border: '1px solid var(--border-subtle)', background: 'var(--surface-1)', color: 'var(--text-primary)',
              }}
            >
              {enzymeKeys.map((k) => (
                <option key={k} value={k}>{`${k} (${enzymeRecognition(kind, k)})`}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sections 1+2 — the full editor, CSS-collapsed for a decided junction. */}
        <div
          data-testid="junction-popover-edit"
          data-editing={editing ? 'true' : 'false'}
          style={{ display: editing ? 'block' : 'none' }}
        >
        {/* Section 1 — kind picker */}
        <div data-testid="junction-popover-kinds" style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shownMethods.map((m) => {
            const active = kind === m.id;
            const stroke = junctionStroke(m.id);
            const fill = junctionFill(m.id);
            return (
              <button
                key={m.id}
                type="button"
                data-testid={`junction-popover-kind-${m.id}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => onPick?.(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                  background: active ? fill : 'transparent',
                  border: '1px solid ' + (active ? stroke : 'transparent'),
                  borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  fontSize: 12, color: 'var(--text-primary)',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 18, background: fill, border: `1.5px solid ${stroke}`,
                  borderRadius: 9, fontSize: 9.5, fontWeight: 700, color: stroke, flexShrink: 0,
                }}>{junctionLabel(m.id)}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: active ? 500 : 400 }}>{m.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Section 2 — overlap params */}
        {showOverlap && (
          <div
            data-testid="junction-popover-overlap-params"
            style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Overhang:</span>
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`junction-popover-target-${t.id}`}
                  data-active={junction.overlapTarget === t.id ? 'true' : 'false'}
                  onClick={() => onSetParams?.({ overlapTarget: t.id })}
                  style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                    border: '1px solid var(--border-subtle)',
                    background: junction.overlapTarget === t.id ? 'var(--accent-500, #b85c3e)' : 'transparent',
                    color: junction.overlapTarget === t.id ? '#fff' : 'var(--text-secondary)',
                  }}
                >{t.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="radio"
                  data-testid="junction-popover-mode-length"
                  checked={mode === 'length'}
                  // A10 (audit) — mode is derived from overlapTm != null, so the
                  // Length radio MUST null overlapTm or Tm→Length snaps back (the
                  // live SET_BOUNDARY_OVERLAP only merges, never nulls the opposite).
                  onChange={() => onSetParams?.({ overlapLength: junction.overlapLength ?? defaultJunctionParams(kind).overlapLength ?? 30, overlapTm: null })}
                />
                Length
              </label>
              <input
                type="number"
                data-testid="junction-popover-length-input"
                disabled={mode !== 'length'}
                value={junction.overlapLength ?? ''}
                onChange={(e) => onSetParams?.({ overlapLength: Number(e.target.value) })}
                style={{ width: 52, fontSize: 11, padding: '2px 4px' }}
              />
              <span style={{ color: 'var(--text-tertiary)' }}>bp</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 6 }}>
                <input
                  type="radio"
                  data-testid="junction-popover-mode-tm"
                  checked={mode === 'tm'}
                  // A10 — symmetric: Tm radio nulls overlapLength so length-mode
                  // doesn't linger and the XOR mode toggle actually flips.
                  onChange={() => onSetParams?.({ overlapTm: junction.overlapTm ?? 60, overlapLength: null })}
                />
                Tm
              </label>
              <input
                type="number"
                data-testid="junction-popover-tm-input"
                disabled={mode !== 'tm'}
                value={junction.overlapTm ?? ''}
                onChange={(e) => onSetParams?.({ overlapTm: Number(e.target.value) })}
                style={{ width: 52, fontSize: 11, padding: '2px 4px' }}
              />
              <span style={{ color: 'var(--text-tertiary)' }}>°C</span>
            </div>
          </div>
        )}
        </div>

        {/* Section 3 — ends preview */}
        <div
          data-testid="junction-popover-ends-preview"
          style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <div>From-контейнер 3′: <strong style={{ fontFamily: 'var(--mono, monospace)' }}>{endText(ends.fromEnd)}</strong></div>
          <div>To-контейнер 5′: <strong style={{ fontFamily: 'var(--mono, monospace)' }}>{endText(ends.toEnd)}</strong></div>
        </div>

        {/* Section 4 — validation */}
        {warnings.length > 0 && (
          <div
            data-testid="junction-popover-validation"
            style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--amber-wash, #fdf3e7)' }}
          >
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--accent-500, #b85c3e)' }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Footer */}
        <footer
          style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}
        >
          <button
            type="button"
            data-testid="junction-popover-reset-auto"
            onClick={onResetAuto}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)' }}
          >↻ Сбросить на авто</button>
          <button
            type="button"
            data-testid="junction-popover-footer-close"
            onClick={onCancel}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)' }}
          >Закрыть</button>
        </footer>
      </div>
    </div>
  );
}
