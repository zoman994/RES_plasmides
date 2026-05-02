import { useEffect, useState } from 'react';
import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * AutonameModal — M-B.1 K6 (DEC-IMP-10 rewrite v1.1).
 *
 * Surfaces a SnapGene-style autoname prompt when the Confirm flow detects a
 * resourceHash collision in the Library. The default action is a single
 * primary button labelled with the suggested name (`✓ Save as «pUC19 (1)»`)
 * — biolog can edit the input first to pick a custom name, or expand the
 * Advanced caret for the older "Replace existing / Skip" choices.
 *
 * Simple mode bypasses this modal entirely (silent autoname in K3).
 *
 * Props:
 *   baseName      string             — original parsed name
 *   suggested     string             — name produced by getSuggestedLibraryName
 *   existing      LibraryEntry       — the duplicate already in the Library
 *   onApply(name) (string) => void   — primary action: save as `name`
 *   onReplace     () => void         — advanced action: overwrite existing
 *   onSkip        () => void         — advanced action: drop this item
 *   onCancel      () => void         — Esc / backdrop close
 */
export default function AutonameModal({
  baseName,
  suggested,
  existing,
  onApply,
  onReplace,
  onSkip,
  onCancel,
}) {
  const [name, setName] = useState(suggested || baseName || '');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Handle Esc to close (cancel only — never resolves Apply implicitly).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const trimmed = name.trim();
  const canApply = trimmed.length > 0;

  return (
    <div
      data-testid="importer-autoname-modal"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(28,25,23,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div
        style={{
          width: 480, maxWidth: '100%',
          background: 'var(--surface-1, #fff)',
          borderRadius: 'var(--radius-lg, 10px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
          {S.autonameTitle(baseName)}
        </div>

        <div
          data-testid="importer-autoname-existing"
          style={{
            fontSize: 12,
            padding: '8px 10px',
            background: 'var(--surface-2, #f5f5f4)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
          }}
        >
          {S.autonameExistingPreview(
            existing?.name || '—',
            existing?.payload?.length || 0,
            existing?.addedAt || '',
          )}
        </div>

        <label
          style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 12, color: 'var(--text-secondary)',
          }}
        >
          {S.autonameInputLabel}
          <input
            type="text"
            value={name}
            data-testid="importer-autoname-input"
            onChange={(e) => setName(e.target.value)}
            autoFocus
            style={{
              fontSize: 13,
              padding: '6px 10px',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="importer-autoname-cancel"
            onClick={onCancel}
            style={{
              padding: '6px 12px', fontSize: 13,
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >{S.cancel}</button>
          <button
            type="button"
            data-testid="importer-autoname-primary"
            onClick={() => canApply && onApply(trimmed)}
            disabled={!canApply}
            style={{
              padding: '6px 14px', fontSize: 13,
              border: '0.5px solid var(--accent-500, #f59e0b)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-500, #f59e0b)',
              color: 'var(--surface-1, #fff)',
              cursor: canApply ? 'pointer' : 'not-allowed',
              opacity: canApply ? 1 : 0.5,
            }}
          >{S.autonamePrimary(trimmed)}</button>
        </div>

        <button
          type="button"
          data-testid="importer-autoname-advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen(o => !o)}
          style={{
            alignSelf: 'flex-start',
            padding: 0, marginTop: 2,
            background: 'none', border: 'none',
            fontSize: 11, color: 'var(--text-tertiary)',
            cursor: 'pointer',
          }}
        >{advancedOpen ? S.autonameAdvancedHide : S.autonameAdvancedShow}</button>

        {advancedOpen && (
          <div
            data-testid="importer-autoname-advanced"
            style={{ display: 'flex', gap: 8 }}
          >
            <button
              type="button"
              data-testid="importer-autoname-replace"
              onClick={onReplace}
              style={{
                padding: '6px 12px', fontSize: 12,
                border: '0.5px solid var(--danger-text, #b91c1c)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                color: 'var(--danger-text, #b91c1c)',
                cursor: 'pointer',
              }}
            >{S.autonameReplace}</button>
            <button
              type="button"
              data-testid="importer-autoname-skip"
              onClick={onSkip}
              style={{
                padding: '6px 12px', fontSize: 12,
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >{S.autonameSkip}</button>
          </div>
        )}
      </div>
    </div>
  );
}
