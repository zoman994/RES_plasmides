import { useStore } from '../../store';
import Toast from './Toast';

export default function ToastStack() {
  const toasts = useStore(s => s.toasts);
  const clearToast = useStore(s => s.clearToast);

  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-stack"
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast
            id={t.id}
            msg={t.msg}
            kind={t.kind}
            onUndo={t.onUndo || undefined}
            onAutoDismiss={t.onAutoDismiss || undefined}
            autoDismissMs={t.autoDismissMs}
            onDismiss={clearToast}
          />
        </div>
      ))}
    </div>
  );
}
