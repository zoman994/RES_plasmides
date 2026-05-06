import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../../../store';

/**
 * LibrarySaveActions — two explicit Save buttons surfaced in the
 * LibrarySingleInspector header for Mine-source library entries
 * (M-X.5 K7, DEC-LIB-13 ⚓).
 *
 *   • [Перезаписать]      — overwrites annotations on the current entry,
 *                            bumps `version` counter, emits toast.
 *   • [Сохранить как версию] — creates a new library entry with
 *                            `origin: { kind: 'version', parentEntryId, … }`,
 *                            recomputes resourceHash, leaves the parent
 *                            unchanged.
 *
 * Both buttons are visible only when the inspector is editing a Mine
 * entry (caller passes `libraryEntryId`) AND there are pending edits
 * (`hasChanges` derived from edits.editedAnnotations vs item.annotations).
 *
 * Q5 plan decision (soft-deleted parent): both slice actions hard-fail
 * with a `pending-delete` reason; this UI surfaces the failure as a
 * specific toast rather than silently dropping the click.
 *
 * Coexists with the silent write-through safety-net inside
 * `useLibraryState.updateEdits` — that path keeps biolog's keystroke
 * edits durable across browser refresh; these explicit buttons are
 * the «commit point» that bumps version / forks history.
 */
export default function LibrarySaveActions({
  libraryEntryId,
  hasChanges,
  editedAnnotations,
  parentName,
  onAfterOverwrite,    // (id) => void — caller clears local edit flags
  onAfterSaveAsVersion, // (newId, newName) => void
}) {
  const showToast = useStore(s => s.showToast);
  const overwrite = useStore(s => s.overwriteLibraryEntryAnnotations);
  const saveAsVersion = useStore(s => s.saveLibraryEntryAsVersion);
  const getSuggestedName = useStore(s => s.getSuggestedLibraryName);
  const [busy, setBusy] = useState(false);
  const [versionPrompt, setVersionPrompt] = useState(null); // { defaultName }

  const enabled = !!libraryEntryId && !!hasChanges && !busy;

  const handleOverwrite = useCallback(async () => {
    if (!enabled) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(`Перезаписать аннотации в записи «${parentName || 'без имени'}»? Текущая версия будет заменена.`);
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await overwrite(libraryEntryId, editedAnnotations);
      if (result?.ok) {
        showToast?.(`Сохранено · v${result.version}`, { kind: 'success', duration: 2000 });
        onAfterOverwrite?.(libraryEntryId);
      } else if (result?.reason === 'pending-delete') {
        showToast?.(`Запись «${result.name || parentName}» помечена на удаление. Восстановите её перед сохранением.`, { kind: 'error', duration: 4000 });
      } else {
        showToast?.('Не удалось сохранить — попробуйте ещё раз.', { kind: 'error', duration: 4000 });
      }
    } finally {
      setBusy(false);
    }
  }, [enabled, libraryEntryId, editedAnnotations, parentName, overwrite, showToast, onAfterOverwrite]);

  const defaultVersionName = useMemo(() => {
    if (!parentName || !getSuggestedName) return parentName || '';
    const base = `${parentName} (v2)`;
    try { return getSuggestedName(base); } catch { return base; }
  }, [parentName, getSuggestedName]);

  const openVersionPrompt = useCallback(() => {
    if (!enabled) return;
    setVersionPrompt({ name: defaultVersionName });
  }, [enabled, defaultVersionName]);

  const closeVersionPrompt = useCallback(() => setVersionPrompt(null), []);

  const submitVersionPrompt = useCallback(async () => {
    if (!versionPrompt) return;
    const trimmed = (versionPrompt.name || '').trim();
    if (!trimmed) {
      showToast?.('Введите имя для новой версии.', { kind: 'error', duration: 3000 });
      return;
    }
    setBusy(true);
    try {
      const result = await saveAsVersion(libraryEntryId, editedAnnotations, trimmed);
      if (result?.ok) {
        showToast?.(`Сохранено как «${result.name}»`, { kind: 'success', duration: 3000 });
        onAfterSaveAsVersion?.(result.id, result.name);
        setVersionPrompt(null);
      } else if (result?.reason === 'pending-delete') {
        showToast?.(`Родительская запись «${result.name || parentName}» помечена на удаление. Восстановите её перед save-as-version.`, { kind: 'error', duration: 4000 });
      } else {
        showToast?.('Не удалось создать версию — попробуйте ещё раз.', { kind: 'error', duration: 4000 });
      }
    } finally {
      setBusy(false);
    }
  }, [versionPrompt, saveAsVersion, libraryEntryId, editedAnnotations, parentName, showToast, onAfterSaveAsVersion]);

  if (!libraryEntryId) return null;

  return (
    <>
      <div
        className="library-save-actions"
        data-testid="library-save-actions"
        data-has-changes={hasChanges ? 'true' : 'false'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <button
          type="button"
          data-testid="library-save-overwrite"
          onClick={handleOverwrite}
          disabled={!enabled}
          title="Перезаписать аннотации в текущей записи (увеличит счётчик версии)."
          style={{
            padding: '4px 10px',
            fontSize: 12,
            background: enabled ? 'var(--accent-500)' : 'var(--surface-2)',
            color: enabled ? 'var(--surface-1)' : 'var(--text-tertiary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: enabled ? 'pointer' : 'not-allowed',
            opacity: enabled ? 1 : 0.6,
          }}
        >Перезаписать</button>
        <button
          type="button"
          data-testid="library-save-as-version"
          onClick={openVersionPrompt}
          disabled={!enabled}
          title="Сохранить как новую запись с ссылкой на текущую (parent reference)."
          style={{
            padding: '4px 10px',
            fontSize: 12,
            background: enabled ? 'var(--surface-2)' : 'var(--surface-2)',
            color: enabled ? 'var(--text-primary)' : 'var(--text-tertiary)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: enabled ? 'pointer' : 'not-allowed',
            opacity: enabled ? 1 : 0.6,
          }}
        >Сохранить как версию</button>
      </div>

      {versionPrompt && (
        <div
          data-testid="library-save-version-modal"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0,
            background: 'color-mix(in srgb, var(--text-primary) 35%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeVersionPrompt(); }}
        >
          <div
            style={{
              minWidth: 360, maxWidth: 480,
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 16,
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              Сохранить как новую версию
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Текущая запись «{parentName}» останется неизменной. Будет создана новая запись со ссылкой на неё.
            </div>
            <input
              type="text"
              data-testid="library-save-version-name"
              value={versionPrompt.name}
              onChange={(e) => setVersionPrompt(p => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitVersionPrompt(); }
                if (e.key === 'Escape') { e.preventDefault(); closeVersionPrompt(); }
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: 13,
                background: 'var(--surface-1)',
                border: '0.5px solid var(--accent-500)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                marginBottom: 12,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={closeVersionPrompt}
                disabled={busy}
                style={{
                  padding: '4px 12px',
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
                data-testid="library-save-version-submit"
                onClick={submitVersionPrompt}
                disabled={busy || !(versionPrompt.name || '').trim()}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  background: 'var(--accent-500)',
                  color: 'var(--surface-1)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >Создать версию</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
