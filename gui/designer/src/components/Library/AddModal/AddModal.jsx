/**
 * AddModal — Sprint M-X.7a v2 K6 (DEC-MX7A-V2-07).
 *
 * Wrapper around the existing PreImportModal flow per spec §3
 * IN #8 + §6 K6. Renders:
 *   • Source tiles (Файл · Paste · Каталог · Cross-project)
 *   • Target radio (Активный / Без проекта / Лабпул — last
 *     visible only for kind=primer scope; deferred to a future
 *     refinement when target metadata propagates further down)
 *   • Esc + click-outside closes
 *
 * Source dispatch:
 *   • file → onLaunchPreImport({ source: 'file', target })
 *   • paste → onLaunchPreImport({ source: 'paste', target })
 *   • catalog → onLaunchPreImport({ source: 'catalog', target })
 *   • cross-project → opens CrossProjectStub (no PreImport handoff)
 *
 * The PreImportModal handoff signatures are minimal in K6 (preset
 * source + target). Concrete file picker / paste textarea / catalog
 * sub-flows live in the existing PreImportModal — we just hand it
 * the preset and let it run. R4 risk mitigation: 2 new props on
 * PreImportModal don't break existing Importer flow callsites.
 */
import { useEffect, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import SourceTiles from './SourceTiles';
import CrossProjectStub from './CrossProjectStub';

const TARGETS = [
  { id: 'loose', label: 'Без проекта', sub: '⚐ Loose zone' },
  { id: 'active', label: 'В активный проект', sub: '📦 .bodge' },
];

export default function AddModal({ open, onClose, onLaunchPreImport }) {
  const ws = STRINGS.libraryWorkspace || {};
  const [pickedSource, setPickedSource] = useState(null);
  const [target, setTarget] = useState('loose');
  const [stubOpen, setStubOpen] = useState(false);

  // Reset on open transition.
  useEffect(() => {
    if (!open) return;
    setPickedSource(null);
    setTarget('loose');
    setStubOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const onPickSource = (id) => {
    setPickedSource(id);
    if (id === 'cross-project') {
      setStubOpen(true);
      return;
    }
  };

  const onSubmit = () => {
    if (!pickedSource || pickedSource === 'cross-project') return;
    onLaunchPreImport?.({ source: pickedSource, target });
    onClose?.();
  };

  return (
    <div
      data-testid="add-modal-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 230,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6vh 4vw',
      }}
    >
      <div
        data-testid="add-modal"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'baseline', gap: 12,
          padding: '14px 20px',
          borderBottom: '0.5px solid var(--border-subtle)',
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
            {ws.addBtn || '+ Добавить'} в библиотеку
          </h2>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="add-modal-close"
            onClick={onClose}
            aria-label="close"
            style={{
              fontSize: 14, padding: '0 6px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
          >✕</button>
        </header>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FieldLabel label="ИСТОЧНИК">
            <SourceTiles onPick={onPickSource} picked={pickedSource} />
          </FieldLabel>

          <FieldLabel label="КУДА ДОБАВИТЬ">
            <div data-testid="add-modal-target" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TARGETS.map((t) => (
                <label
                  key={t.id}
                  data-testid={`add-modal-target-${t.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    border: target === t.id
                      ? '1px solid var(--accent-500)'
                      : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: target === t.id ? 'var(--accent-50)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="add-target"
                    value={t.id}
                    checked={target === t.id}
                    onChange={() => setTarget(t.id)}
                    style={{ margin: 0 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {t.label}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                    {t.sub}
                  </span>
                </label>
              ))}
            </div>
          </FieldLabel>
        </div>

        <footer
          style={{
            display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end',
            padding: '12px 20px',
            borderTop: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-2)',
          }}
        >
          <button
            type="button"
            data-testid="add-modal-cancel"
            onClick={onClose}
            style={{
              fontSize: 12, padding: '6px 14px',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
            }}
          >Отмена</button>
          <button
            type="button"
            data-testid="add-modal-submit"
            onClick={onSubmit}
            disabled={!pickedSource || pickedSource === 'cross-project'}
            style={{
              fontSize: 12, padding: '6px 16px',
              background: 'var(--accent-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: (!pickedSource || pickedSource === 'cross-project') ? 'not-allowed' : 'pointer',
              opacity: (!pickedSource || pickedSource === 'cross-project') ? 0.55 : 1,
              fontWeight: 500,
            }}
          >Продолжить</button>
        </footer>
      </div>

      {stubOpen && <CrossProjectStub onClose={() => setStubOpen(false)} />}
    </div>
  );
}

function FieldLabel({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
      }}>{label}</span>
      {children}
    </div>
  );
}
