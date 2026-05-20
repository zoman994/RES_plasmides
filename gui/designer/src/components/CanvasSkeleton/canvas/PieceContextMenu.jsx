/**
 * PieceContextMenu — shared right-click menu used by Frame view
 * (ContainerBlock), Sequence view (PieceCard), and Editor strip.
 *
 * SPEC_ASSEMBLY_VIEWS_UNIFICATION §4.4. Items are consistent across
 * all three views; caller wires the action callbacks. Items that
 * don't apply (e.g. multi-select-only) are hidden via props.
 *
 * Esc / outside-click closes. Menu mounted at fixed position
 * (`anchor.x`, `anchor.y`).
 */
import { useEffect, useRef } from 'react';

export default function PieceContextMenu({
  anchor,
  onClose,
  onRename,
  onToggleRC,
  onChangeRange,
  onAddMutation,
  onSew,        // only shown when selectionSize >= 2
  selectionSize = 1,
  onDelete,
  testId = 'piece-context-menu',
}) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const items = [
    onRename && { id: 'rename', icon: '✏️', label: 'Переименовать', onClick: onRename },
    onToggleRC && { id: 'rc', icon: '🔄', label: 'Обратное дополнение (RC)', onClick: onToggleRC },
    onChangeRange && { id: 'range', icon: '📝', label: 'Изменить диапазон…', onClick: onChangeRange },
    onAddMutation && { id: 'mut', icon: '💎', label: 'Добавить mutation…', onClick: onAddMutation },
    selectionSize >= 2 && onSew && {
      id: 'sew', icon: '🔗', label: `Сшить (${selectionSize})…`, onClick: onSew, accent: true,
    },
    onDelete && { id: 'del', icon: '🗑', label: 'Удалить', onClick: onDelete, danger: true },
  ].filter(Boolean);

  return (
    <div
      ref={ref}
      role="menu"
      data-testid={testId}
      style={{
        position: 'fixed',
        top: anchor?.y || 0,
        left: anchor?.x || 0,
        zIndex: 95,
        minWidth: 220,
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        boxShadow: '0 8px 22px rgba(28,25,23,0.18)',
        padding: 4,
      }}
    >
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          data-testid={`${testId}-${it.id}`}
          onClick={() => { it.onClick(); onClose?.(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 10px',
            background: it.accent ? 'var(--accent-100, #eed2c1)' : 'transparent',
            color: it.danger ? 'var(--danger-fg, #b91c1c)' : 'var(--text-primary)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12.5,
            textAlign: 'left',
          }}
        >
          <span style={{ width: 18, textAlign: 'center' }} aria-hidden>{it.icon}</span>
          <span style={{ flex: 1 }}>{it.label}</span>
        </button>
      ))}
      {items.length === 0 && (
        <div data-testid={`${testId}-empty`} style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
          (нет действий)
        </div>
      )}
    </div>
  );
}
