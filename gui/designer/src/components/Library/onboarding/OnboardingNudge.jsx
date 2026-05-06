import { useState, useCallback } from 'react';
import CategoryPickerModal from './CategoryPickerModal';

/**
 * OnboardingNudge — non-blocking banner surfaced inside the empty
 * Library tree (M-X.5 K5, DEC-LIB-17 ⚓ «Onboarding through nudge,
 * not modal»). Shown only when `libraryEntries` is empty AND
 * biolog hasn't dismissed it for the session.
 *
 * Click «Выбрать категории...» → CategoryPickerModal opens. After
 * a successful load, the banner self-dismisses (libraryEntries is
 * no longer empty so the parent gates render off it).
 *
 * The «×» close button dismisses the banner without loading. State
 * is local — refresh / reopen Library re-shows it if the library
 * is still empty. No persistent localStorage key by design — the
 * value is «remind me until I have actual entries», which matches
 * the empty-library predicate.
 */
export default function OnboardingNudge() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const dismiss = useCallback(() => setDismissed(true), []);

  if (dismissed) return null;

  return (
    <>
      <div
        data-testid="onboarding-nudge"
        role="region"
        aria-label="Onboarding suggestion"
        style={{
          margin: '8px 12px',
          padding: '10px 12px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--accent-50, rgba(249, 115, 22, 0.08))',
          border: '0.5px solid var(--accent-500)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-700, #b45309)', marginBottom: 4 }}>
            📚 Загрузить базовые плазмиды
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Библиотека пуста. Можно начать с готового набора (pUC19, pET28b, CRISPR …)
            или просто перетащите свои файлы в любое место.
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              type="button"
              data-testid="onboarding-pick-categories"
              onClick={openPicker}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                background: 'var(--accent-500)',
                color: 'var(--surface-1)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >Выбрать категории…</button>
          </div>
        </div>
        <button
          type="button"
          data-testid="onboarding-dismiss"
          onClick={dismiss}
          aria-label="Dismiss onboarding banner"
          title="Закрыть"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 14, lineHeight: 1,
            cursor: 'pointer',
            padding: 4,
            flexShrink: 0,
          }}
        >×</button>
      </div>
      <CategoryPickerModal
        open={pickerOpen}
        onClose={closePicker}
        onComplete={() => { setPickerOpen(false); }}
      />
    </>
  );
}
