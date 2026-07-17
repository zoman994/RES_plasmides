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
 * Coexists with the LibraryWorkspace silent write-through safety-net,
 * which keeps the biologist's keystroke
 * edits durable across browser refresh; these explicit buttons are
 * the «commit point» that bumps version / forks history.
 */
export default function LibrarySaveActions({
  libraryEntryId,
  hasChanges,
  editedSequence,        // working sequence to commit (transient buffer)
  editedAnnotations,
  changesSummary = [],   // string[] — «что изменено», one line per coalesced edit
  changeText = '',       // joined summary → stamped as origin.changes provenance
  parentName,
  onAfterSaveAsVersion, // (newId, newName) => void
}) {
  const showToast = useStore(s => s.showToast);
  // Version-only save (Игорь 17.06.2026): the edited SEQUENCE + annotations
  // commit to a NEW branch via createManualEditBranch — the SAME action the
  // aligner's «Сохранить исправленную версию» uses. Source is untouched.
  const createManualEditBranch = useStore(s => s.createManualEditBranch);
  const getSuggestedName = useStore(s => s.getSuggestedLibraryName);
  const [busy, setBusy] = useState(false);
  const [versionPrompt, setVersionPrompt] = useState(null); // { name, reason }

  const enabled = !!libraryEntryId && !!hasChanges && !busy;

  const defaultVersionName = useMemo(() => {
    if (!parentName || !getSuggestedName) return parentName || '';
    const base = `${parentName} · исправлено`;
    try { return getSuggestedName(base); } catch { return base; }
  }, [parentName, getSuggestedName]);

  const openVersionPrompt = useCallback(() => {
    if (!enabled) return;
    setVersionPrompt({ name: defaultVersionName, reason: '', lineageRole: 'version' });
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
      const result = await createManualEditBranch(
        libraryEntryId,
        typeof editedSequence === 'string' ? editedSequence : '',
        Array.isArray(editedAnnotations) ? editedAnnotations : [],
        {
          name: trimmed,
          changes: changeText,
          reason: (versionPrompt.reason || '').trim(),
          lineageRole: versionPrompt.lineageRole === 'branch' ? 'branch' : 'version',
        },
      );
      if (result?.ok) {
        showToast?.(`Сохранено как «${result.name}»`, { kind: 'success', duration: 3000 });
        onAfterSaveAsVersion?.(result.id, result.name);
        setVersionPrompt(null);
      } else if (result?.reason === 'pending-delete') {
        showToast?.(`Родительская запись «${result.name || parentName}» помечена на удаление. Восстановите её перед сохранением версии.`, { kind: 'error', duration: 4000 });
      } else {
        showToast?.('Не удалось создать версию — попробуйте ещё раз.', { kind: 'error', duration: 4000 });
      }
    } finally {
      setBusy(false);
    }
  }, [versionPrompt, createManualEditBranch, libraryEntryId, editedSequence, editedAnnotations, changeText, parentName, showToast, onAfterSaveAsVersion]);

  if (!libraryEntryId) return null;

  return (
    <>
      <div
        className="library-save-actions"
        data-testid="library-save-actions"
        data-has-changes={hasChanges ? 'true' : 'false'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}
      >
        {changesSummary.length > 0 && (
          <span
            data-testid="library-changes-summary"
            title={changeText}
            style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            изменено: {changesSummary.length === 1 ? changesSummary[0] : `${changesSummary[0]} +${changesSummary.length - 1}`}
          </span>
        )}
        <button
          type="button"
          data-testid="library-save-as-version"
          onClick={openVersionPrompt}
          disabled={!enabled}
          title="Сохранить правки как новую версию (ветку) — исходник не меняется."
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
        >Сохранить версию</button>
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
            {changesSummary.length > 0 && (
              <div data-testid="library-version-changes" style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 4 }}>Что изменено · {changesSummary.length}</div>
                <div style={{ maxHeight: 120, overflow: 'auto', border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '6px 8px', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>
                  {changesSummary.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              </div>
            )}
            {/* Версия vs ветка — явный выбор намерения (Игорь: «нет явного
                разграничения новая ли это версия или ветка»). «Версия»
                продолжает линию (голова двигается вперёд), «ветка» — вариант
                рядом, исходная линия не двигается. */}
            <div
              data-testid="library-save-role"
              role="radiogroup"
              style={{ display: 'flex', gap: 8, marginBottom: 10 }}
            >
              {[
                { value: 'version', label: 'Новая версия', hint: 'продолжает линию' },
                { value: 'branch', label: 'Ветка', hint: 'вариант рядом' },
              ].map((opt) => {
                const active = (versionPrompt.lineageRole || 'version') === opt.value;
                return (
                  <label
                    key={opt.value}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '6px 10px', cursor: 'pointer',
                      border: `1px solid ${active ? 'var(--accent-500)' : 'var(--border-default)'}`,
                      background: active ? 'var(--accent-50)' : 'var(--surface-1)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: active ? 500 : 400 }}>
                      <input
                        type="radio"
                        name="library-save-role"
                        data-testid={`library-save-role-${opt.value}`}
                        checked={active}
                        onChange={() => setVersionPrompt((p) => ({ ...p, lineageRole: opt.value }))}
                      />
                      {opt.value === 'branch' ? '⑂ ' : ''}{opt.label}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', paddingLeft: 22 }}>{opt.hint}</span>
                  </label>
                );
              })}
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
                marginBottom: 10,
              }}
            />
            <textarea
              data-testid="library-save-version-reason"
              value={versionPrompt.reason}
              onChange={(e) => setVersionPrompt(p => ({ ...p, reason: e.target.value }))}
              placeholder="Причина / комментарий (необязательно)"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 10px', fontSize: 12, resize: 'vertical',
                background: 'var(--surface-1)',
                border: '0.5px solid var(--border-default)',
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
