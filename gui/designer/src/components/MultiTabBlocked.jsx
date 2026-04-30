import { useState } from 'react';
import { useStore } from '../store';
import { broadcastForceRelease } from '../lib/multi-tab-lock';

export default function MultiTabBlocked() {
  const currentProjectId = useStore(s => s.currentProjectId);
  const retryAcquireLock = useStore(s => s.retryAcquireLock);
  const closeProject = useStore(s => s.closeProject);
  const showToast = useStore(s => s.showToast);
  const [busy, setBusy] = useState(false);

  async function takeOver() {
    if (!currentProjectId || busy) return;
    setBusy(true);
    try {
      broadcastForceRelease(currentProjectId);
      // give the holding tab time to release
      await new Promise(r => setTimeout(r, 500));
      const ok = await retryAcquireLock();
      if (!ok) showToast('Не удалось перенять контроль — другая вкладка не отдаёт lock', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="multi-tab-blocked"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 32,
        textAlign: 'center',
        background: 'var(--surface-base, #fafaf9)',
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
        Проект уже открыт в другой вкладке
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 480 }}>
        BodgeGene запрещает редактирование одного проекта в нескольких вкладках одновременно.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          data-testid="multi-tab-takeover"
          onClick={takeOver}
          disabled={busy}
          style={{
            padding: '8px 16px', fontSize: 14,
            border: '0.5px solid var(--accent-500)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-50)',
            color: 'var(--accent-text)',
            fontWeight: 500, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Подтверждаем…' : 'Перенять контроль'}
        </button>
        <button
          type="button"
          onClick={closeProject}
          style={{
            padding: '8px 16px', fontSize: 14,
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >Закрыть проект</button>
      </div>
    </div>
  );
}
