import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../../../store';
import { CURATED_CATEGORIES } from './curated-categories';

/**
 * CategoryPickerModal — multi-select picker over the 7 curated
 * onboarding categories (M-X.5 K5). Surfaced from OnboardingNudge
 * banner. Selecting categories + clicking «Добавить выбранное (N)»
 * fires `librarySlice.loadOnboardingPlasmids(...)` which fetches
 * `/plasmids-data/${slug}.json` per category and bulk-persists the
 * plasmids into the user's Library with origin.kind = 'demo_category'.
 *
 * Cancel / close → no-op (banner stays visible if Library still
 * empty; biolog can dismiss the banner separately).
 */
export default function CategoryPickerModal({ open, onClose, onComplete }) {
  const showToast = useStore(s => s.showToast);
  const loadOnboardingPlasmids = useStore(s => s.loadOnboardingPlasmids);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const selectedCount = selected.size;
  const totalPlasmids = useMemo(() => {
    let n = 0;
    for (const cat of CURATED_CATEGORIES) if (selected.has(cat.slug)) n += cat.count;
    return n;
  }, [selected]);

  const toggle = useCallback((slug) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedCount === 0) return;
    const picked = CURATED_CATEGORIES.filter(c => selected.has(c.slug));
    setBusy(true);
    try {
      const result = await loadOnboardingPlasmids?.(picked);
      if (result?.ok) {
        showToast?.(`Загружено ${result.count} плазмид в библиотеку`, { kind: 'success', duration: 4000 });
        onComplete?.(result);
        onClose?.();
      } else {
        showToast?.('Не удалось загрузить плазмиды — проверьте подключение и попробуйте снова.', { kind: 'error', duration: 5000 });
      }
    } finally {
      setBusy(false);
    }
  }, [selectedCount, selected, loadOnboardingPlasmids, showToast, onComplete, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="onboarding-category-picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-picker-title"
      style={{
        position: 'fixed', inset: 0,
        background: 'color-mix(in srgb, var(--text-primary) 35%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 55,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
    >
      <div
        style={{
          minWidth: 480, maxWidth: 580, maxHeight: '80vh',
          background: 'var(--surface-1)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '14px 18px 8px', borderBottom: '0.5px solid var(--border-subtle)' }}>
          <div id="onboarding-picker-title" style={{ fontSize: 14, fontWeight: 600 }}>
            Выберите категории базовых плазмид
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
            Можно выбрать несколько. Плазмиды появятся в библиотеке в папке «Demo / [категория]».
          </div>
        </div>

        <div style={{ padding: '8px 8px', overflowY: 'auto', flex: 1 }}>
          {CURATED_CATEGORIES.map((cat) => {
            const checked = selected.has(cat.slug);
            return (
              <label
                key={cat.slug}
                data-testid={`onboarding-category-${cat.slug}`}
                data-checked={checked ? 'true' : 'false'}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  background: checked ? 'var(--accent-50, rgba(249, 115, 22, 0.08))' : 'transparent',
                  border: checked ? '0.5px solid var(--accent-500)' : '0.5px solid transparent',
                  marginBottom: 4,
                  opacity: busy ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => toggle(cat.slug)}
                  style={{ marginTop: 2, accentColor: 'var(--accent-500)' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{cat.label}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {cat.count}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                    {cat.blurb}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div
          style={{
            padding: '10px 18px',
            borderTop: '0.5px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--surface-2)',
            borderBottomLeftRadius: 'var(--radius-lg)',
            borderBottomRightRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ flex: 1, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {selectedCount > 0
              ? `Выбрано категорий: ${selectedCount} · плазмид: ${totalPlasmids.toLocaleString('ru-RU')}`
              : 'Выберите хотя бы одну категорию.'}
          </div>
          <button
            type="button"
            data-testid="onboarding-picker-cancel"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >Отмена</button>
          <button
            type="button"
            data-testid="onboarding-picker-submit"
            onClick={handleSubmit}
            disabled={busy || selectedCount === 0}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: selectedCount > 0 ? 'var(--accent-500)' : 'var(--surface-2)',
              color: selectedCount > 0 ? 'var(--surface-1)' : 'var(--text-tertiary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: busy || selectedCount === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              opacity: busy ? 0.6 : 1,
            }}
          >{busy ? 'Загрузка…' : `Добавить выбранное (${selectedCount})`}</button>
        </div>
      </div>
    </div>
  );
}
