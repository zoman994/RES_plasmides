/**
 * OpContextMenu — shared right-click menu for op rhombus / junction
 * boundary / pipeline card.
 *
 * SPEC_ASSEMBLY_VIEWS_UNIFICATION §4.4 (op variant).
 */
import { useEffect, useRef } from 'react';
import { Icon } from '../../icons/Icon';

export default function OpContextMenu({
  anchor,
  onClose,
  onEditParams,
  onChangeKind,
  onRemove,
  testId = 'op-context-menu',
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
    onEditParams && { id: 'params', icon: 'settings', label: 'Параметры стыка…', onClick: onEditParams },
    onChangeKind && { id: 'kind', icon: 'swap', label: 'Изменить тип op…', onClick: onChangeKind },
    onRemove && { id: 'del', icon: 'trash', label: 'Удалить группу', onClick: onRemove, danger: true },
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
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          data-testid={`${testId}-${it.id}`}
          onClick={() => { it.onClick(); onClose?.(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '6px 10px',
            background: 'transparent',
            color: it.danger ? 'var(--danger-fg, #b91c1c)' : 'var(--text-primary)',
            border: 'none', borderRadius: 4, cursor: 'pointer',
            fontSize: 12.5, textAlign: 'left',
          }}
        >
          <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }} aria-hidden>
            <Icon name={it.icon} size={14} />
          </span>
          <span style={{ flex: 1 }}>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
