import { useEffect, useRef } from 'react';
import ToastIcon from './toast-icons';

export default function Toast({ id, msg, kind = 'info', onUndo, onAutoDismiss, onDismiss, autoDismissMs = 3500 }) {
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!autoDismissMs || autoDismissMs <= 0) return undefined;
    const timer = setTimeout(() => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      try { if (typeof onAutoDismiss === 'function') onAutoDismiss(); } catch { /* ignore */ }
      onDismiss?.(id);
    }, autoDismissMs);
    return () => {
      clearTimeout(timer);
    };
  }, [autoDismissMs, id, onAutoDismiss, onDismiss]);

  function handleUndo() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    try { onUndo?.(); } catch { /* ignore */ }
    onDismiss?.(id);
  }

  function handleClose() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss?.(id);
  }

  return (
    <div
      data-testid="toast"
      data-toast-id={id}
      data-toast-kind={kind}
      role="status"
      style={{
        background: '#262626',
        color: '#f5f5f5',
        border: 'none',
        borderRadius: 6,
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 260,
        maxWidth: 480,
        fontSize: 13,
      }}
    >
      <ToastIcon kind={kind} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{msg}</span>
      {typeof onUndo === 'function' && (
        <button
          type="button"
          onClick={handleUndo}
          data-testid="toast-undo"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fbbf24',
            fontSize: 13,
            cursor: 'pointer',
            padding: '0 4px',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >Отменить</button>
      )}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Закрыть"
        data-testid="toast-close"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#a3a3a3',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          width: 20,
          height: 20,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#f5f5f5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#a3a3a3'; }}
      >×</button>
    </div>
  );
}
