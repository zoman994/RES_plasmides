/**
 * OpPopup — базовый frame для popup'а параметров операции.
 *
 * Sprint M-CANVAS-OPS K6 (12.05.2026 — DEC-OPS-06). Inline absolute-
 * positioned popover поверх canvas (НЕ fullscreen modal). Anchored
 * к точке клика (clientX/clientY). Содержит:
 *   - Header: title + kind icon + status badge + close-X
 *   - Body: children slot (PCR / Cut / Gibson / Ligate / KLD / Mutate)
 *   - Footer: Cancel + Execute
 *
 * Esc — closes (вызывает onCancel).
 * Click outside — closes (onCancel).
 * Hard cap по DEC-OPS-06: 8 KB на kind-specific popup; base ≤4 KB.
 */
import { useEffect, useRef } from 'react';
import { Icon } from '../../../icons/Icon';

const STATUS_BADGES = {
  draft: { label: 'draft', color: '#a8a29e', bg: '#f5f5f4' },
  committed: { label: 'committed', color: '#0284c7', bg: '#e0f2fe' },
  executed: { label: 'executed', color: '#16a34a', bg: '#dcfce7' },
  failed: { label: 'failed', color: '#dc2626', bg: '#fee2e2' },
};

export default function OpPopup({
  operation,
  position = { x: 100, y: 100 },
  title = '',
  icon = 'settings',
  children,
  onCancel,
  onExecute,
  executeLabel = 'Запустить',
  executeDisabled = false,
}) {
  const ref = useRef(null);

  // Esc closes — listens once-per-mount, fires onCancel.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Click outside closes. Uses mousedown so it fires before potential
  // click bubble. Skips when click target is inside popup.
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      onCancel?.();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [onCancel]);

  const badge = STATUS_BADGES[operation?.status] || null;

  return (
    <div
      ref={ref}
      data-testid={`op-popup-${operation?.id || 'unknown'}`}
      data-operation-id={operation?.id}
      data-kind={operation?.kind || 'none'}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 100,
        background: 'var(--surface-1, #fff)',
        border: '1px solid var(--border-default, #d6d3d1)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        minWidth: 320,
        maxWidth: 480,
        fontSize: 13,
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-default, #e7e5e4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={16} aria-hidden="true" />
          <strong data-testid="op-popup-title" style={{ fontSize: 14 }}>{title}</strong>
          {badge && (
            <span
              data-testid="op-popup-status-badge"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 10,
                color: badge.color,
                background: badge.bg,
              }}
            >{badge.label}</span>
          )}
        </div>
        <button
          type="button"
          data-testid="op-popup-close"
          onClick={onCancel}
          aria-label="Закрыть"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: 'var(--text-tertiary, #a8a29e)',
            padding: 2,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        ><Icon name="close" size={16} /></button>
      </div>
      <div data-testid="op-popup-body" style={{ padding: 12 }}>{children}</div>
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-default, #e7e5e4)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          data-testid="op-popup-cancel"
          onClick={onCancel}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--text-secondary, #57534e)',
          }}
        >Отмена</button>
        <button
          type="button"
          data-testid="op-popup-execute"
          onClick={onExecute}
          disabled={executeDisabled}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--accent-500, #d97706)',
            borderRadius: 4,
            background: executeDisabled ? '#fed7aa' : 'var(--accent-500, #d97706)',
            color: '#fff',
            cursor: executeDisabled ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            opacity: executeDisabled ? 0.6 : 1,
          }}
        >{executeLabel}</button>
      </div>
    </div>
  );
}
