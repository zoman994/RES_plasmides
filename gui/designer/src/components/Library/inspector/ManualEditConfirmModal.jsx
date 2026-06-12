/**
 * ManualEditConfirmModal — confirm dialog before forking a library
 * entry into a manual-edit branch (M-X.5 K10, DEC-LIB-12 ⚓).
 *
 * Surfaced once per LibrarySingleInspector mount when biolog is in
 * EDITABLE mode AND fires the first character-level keystroke
 * (A/T/G/C/N/IUPAC, Backspace, Delete) inside SequenceView. Q3 plan
 * decision: «per-mount» scope — re-opening the same entry triggers
 * the modal again, defending against accidental edits when biolog
 * navigates back.
 *
 *   Cancel    → revert character, dismiss modal, READ-ONLY pill stays
 *               EDITABLE (biolog can change mind), no entry created.
 *   Confirm   → caller calls librarySlice.createManualEditBranch,
 *               switches inspector to the new branch, subsequent
 *               keystrokes flow into the copy. Modal stays dismissed
 *               for the rest of this mount.
 *
 * Pure UI component — all side effects live in the caller.
 */
import { useEffect } from 'react';

export default function ManualEditConfirmModal({
  open,
  parentName,
  onCancel,
  onConfirm,
  busy = false,
}) {
  // ui-interactions A — close on Escape while open (backdrop-click already wired).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div
      data-testid="manual-edit-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-edit-confirm-title"
      style={{
        position: 'fixed', inset: 0,
        background: 'color-mix(in srgb, var(--text-primary) 35%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 60,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}
    >
      <div
        style={{
          minWidth: 380, maxWidth: 480,
          background: 'var(--surface-1)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="manual-edit-confirm-title"
          style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}
        >
          Ручное редактирование последовательности
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
          Текущая запись <strong>«{parentName || 'без имени'}»</strong> содержит
          канонические данные. Любая правка нуклеотидов создаст новую ветку
          плазмиды (manual edit) — оригинал останется неизменным.
          <br /><br />
          Продолжить и создать новую ветку?
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            data-testid="manual-edit-confirm-cancel"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >Отмена</button>
          <button
            type="button"
            data-testid="manual-edit-confirm-ok"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              fontWeight: 500,
            }}
            autoFocus
          >Создать ветку и продолжить</button>
        </div>
      </div>
    </div>
  );
}
