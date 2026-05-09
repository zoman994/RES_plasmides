/**
 * CrossProjectStub — Sprint M-X.7a v2 K6.
 *
 * «Из другого .bodge» source tile in AddModal triggers this stub
 * dialog per spec §3 OUT — cross-project import wizard is M-X.9
 * scope. This stub keeps the entry point visible (so biolog
 * discovers the future capability) without faking unfinished
 * functionality.
 */
import { useEffect } from 'react';

export default function CrossProjectStub({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      data-testid="cross-project-stub-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 240,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6vh 4vw',
      }}
    >
      <div
        data-testid="cross-project-stub"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          padding: '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
          Импорт из другого .bodge
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          В разработке — Sprint M-X.9 («Cross-project import wizard»).
          Пока контейнеры из чужих проектов можно открыть только через
          импорт самого .bodge файла как нового проекта.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="cross-project-stub-close"
            onClick={onClose}
            style={{
              fontSize: 12, padding: '6px 14px',
              background: 'var(--accent-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >Понятно</button>
        </div>
      </div>
    </div>
  );
}
