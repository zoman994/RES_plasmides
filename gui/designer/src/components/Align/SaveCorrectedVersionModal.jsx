/**
 * SaveCorrectedVersionModal — explicit «save the corrected reference as a new
 * version» (P3, git-logic). Shows the change summary (what) + a reason field
 * (why); on save it branches a NEW library entry via the store
 * (`saveCorrectedReference`), leaving the source untouched.
 */
import { useState } from 'react';
import { formatCorrection } from '../../lib/alignment/describe-edit';

// Default name for the new version: the reference name + «· исправлено», with
// any prior edit suffix stripped so it doesn't stack (Игорь — «дать номер
// исправленной версии»). The biolog can overwrite it freely.
function suggestVersionName(name) {
  const base = String(name || 'плазмида')
    .replace(/\s*(\(manual edit\)|·\s*правка|·\s*исправлено.*)\s*$/i, '')
    .trim();
  return `${base || 'плазмида'} · исправлено`;
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panel = {
  width: 'min(480px, 92vw)', maxHeight: '82vh', overflow: 'auto',
  background: 'var(--surface-1, #fff)', border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
};

export default function SaveCorrectedVersionModal({ workingReference, onSave, onClose }) {
  const [reason, setReason] = useState('');
  const [name, setName] = useState(() => suggestVersionName(workingReference?.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const corrections = (workingReference && workingReference.corrections) || [];

  const submit = async () => {
    setBusy(true); setError(null);
    const res = await onSave(reason, name);
    setBusy(false);
    if (res && res.ok) { onClose(); return; }
    setError(res?.reason === 'no-library-entry'
      ? 'Референс добавлен вручную (не из библиотеки) — сохранить версию нельзя. Добавьте референс из библиотеки.'
      : 'Не удалось сохранить версию.');
  };

  return (
    <div data-testid="align-save-version-modal" style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #1c1917)' }}>Сохранить исправленную версию</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #57534e)' }}>
          Будет создана <strong>новая запись</strong> в библиотеке (ветка), исходник
          <strong> {workingReference?.name}</strong> не изменится.
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary, #78716c)' }}>Имя новой версии</span>
          <input
            type="text" data-testid="align-save-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Например: pUC19 · исправлено"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-default, #d6d3d1)', background: 'var(--surface-1, #fff)', color: 'var(--text-primary, #1c1917)' }}
          />
        </label>

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary, #78716c)', margin: '0 0 6px' }}>
            Изменения · {corrections.length}
          </div>
          <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--border-subtle, #e7e5e4)', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
            {corrections.length === 0
              ? <span style={{ color: 'var(--text-tertiary, #78716c)' }}>нет правок</span>
              : corrections.map((c, i) => (
                <div key={i} data-testid="align-save-change">{formatCorrection(c)}</div>
              ))}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary, #78716c)' }}>Причина / комментарий</span>
          <textarea
            data-testid="align-save-reason" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Например: исправлены несовпадения по Sanger-чтению…" rows={3}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 8, resize: 'vertical', borderRadius: 6, border: '1px solid var(--border-default, #d6d3d1)', background: 'var(--surface-1, #fff)', color: 'var(--text-primary, #1c1917)' }}
          />
        </label>

        {error && <div data-testid="align-save-error" style={{ fontSize: 12, color: 'var(--danger-fg, #b91c1c)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" data-testid="align-save-cancel" onClick={onClose} disabled={busy}
            style={{ padding: '7px 12px', fontSize: 13, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-default, #d6d3d1)', background: 'var(--surface-1, #fff)', color: 'var(--text-primary, #1c1917)' }}>Отмена</button>
          <button type="button" data-testid="align-save-confirm" onClick={submit} disabled={busy || corrections.length === 0}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, cursor: busy ? 'default' : 'pointer', border: '1px solid var(--accent-700, #b45309)', background: 'var(--accent-500, #f59e0b)', color: '#fff', opacity: (busy || corrections.length === 0) ? 0.6 : 1 }}>
            {busy ? 'Сохранение…' : 'Сохранить версию'}
          </button>
        </div>
      </div>
    </div>
  );
}
