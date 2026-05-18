/**
 * OpRhombusTemplatePicker — choose the template container for an op
 * whose kind is set but inputs are still empty (F3 DEC-CANVAS-PCR-03
 * path 1). Anchored dropdown; lists non-placeholder containers.
 */
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';

export default function OpRhombusTemplatePicker({
  op, position, containers = [], onPick, onCancel,
}) {
  if (!op) return null;
  const left = position?.x ?? 0;
  const top = position?.y ?? 0;
  const candidates = containers.filter(
    (c) => !isPlaceholderContainer(c) && (c.sequence || '').length > 0,
  );

  return (
    <div
      data-testid="op-template-picker-backdrop"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
    >
      <div
        data-testid="op-template-picker"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left,
          top,
          transform: 'translate(-50%, 8px)',
          width: 240,
          maxHeight: '60vh',
          overflowY: 'auto',
          background: 'var(--surface-1, #fff)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 8,
          boxShadow: '0 6px 18px rgba(28,25,23,0.15)',
        }}
      >
        <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          Шаблон для операции
        </div>
        {candidates.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
            Нет доступных контейнеров
          </div>
        )}
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`op-template-pick-${c.id}`}
            onClick={() => onPick?.(c.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              fontSize: 12,
              padding: '7px 12px',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            📦 {c.name} <span style={{ color: 'var(--text-tertiary)', fontSize: 10.5 }}>· {(c.sequence || '').length} bp</span>
          </button>
        ))}
      </div>
    </div>
  );
}
