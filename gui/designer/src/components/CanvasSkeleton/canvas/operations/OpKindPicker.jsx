/**
 * OpKindPicker — popover-grid 3×2 для выбора kind у draft operation.
 *
 * Sprint M-CANVAS-OPS K6 (12.05.2026 — DEC-OPS-05). Click on tile →
 * onPick(kind) → caller dispatches OP_SET_KIND → popup для chosen kind.
 *
 * Esc / click outside — onCancel.
 */
import { useEffect, useRef } from 'react';
import OpIcon from '../op-icons';
import { OP_KINDS_LIST } from './op-kinds-registry';

// R12-1: OP_KINDS теперь derived от centralного registry. Сохраняем
// export ради backward-compat (тесты могут импортить отсюда).
export const OP_KINDS = OP_KINDS_LIST.map(({ kind, label, desc }) => ({ kind, label, desc }));

export default function OpKindPicker({
  operation,
  position = { x: 100, y: 100 },
  onPick,
  onCancel,
}) {
  const ref = useRef(null);

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

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      onCancel?.();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      data-testid={`op-kind-picker-${operation?.id || 'unknown'}`}
      data-operation-id={operation?.id}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 100,
        background: 'var(--surface-1, #fff)',
        border: '1px solid var(--border-default, #d6d3d1)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 130px)',
        gap: 6,
      }}
    >
      {OP_KINDS.map((k) => (
        <button
          key={k.kind}
          type="button"
          data-testid={`op-kind-tile-${k.kind}`}
          onClick={() => onPick?.(k.kind)}
          style={{
            padding: '10px 8px',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 6,
            background: 'var(--surface-2, #f5f5f4)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 80ms ease',
          }}
        >
          <div style={{ marginBottom: 2, color: 'var(--text-primary)' }}><OpIcon kind={k.kind} size={20} /></div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{k.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #57534e)', marginTop: 2 }}>{k.desc}</div>
        </button>
      ))}
    </div>
  );
}
