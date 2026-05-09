/**
 * LibraryActionRow — Sprint M-X.7a v2 K3.
 *
 * Per-zone action row mounted UNDER the existing
 * `LibrarySingleInspector` body. Inspector body itself is not
 * touched (DEC-MX7A-V2-02 — composition over inheritance).
 *
 * Variants per spec §5.4:
 *   • loose × container — 6 actions, primary = «Использовать в активном»
 *   • loose × primer — 5 actions, primary = «Использовать в проекте»
 *   • active_bodge × container — 7 actions, primary = «Container Window»
 *   • active_bodge × primer — 4 actions, primary = «Использовать в DAG»
 *   • readonly_bodge × {container, primer} — 4/3 actions
 *   • lab_pool × primer — 4 actions
 *
 * Rendered as a single horizontal row with overflow-x:auto for
 * narrow inspector pane widths. Disabled actions stay visible but
 * dimmed; tooltip surfaces on hover (M-X.7b / M-X.9 markers).
 *
 * `getActionsFor` is the source of truth for what shows up — this
 * component is purely a renderer.
 */
import { memo } from 'react';
import { getActionsFor } from '../../../lib/library-actions';

const VARIANT_STYLE = {
  primary: {
    background: 'var(--accent-500)', color: '#fff',
    border: '1px solid var(--accent-500)',
  },
  default: {
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  },
  ghost: {
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'transparent', color: 'rgb(220, 38, 38)',
    border: '1px solid rgba(220, 38, 38, 0.4)',
  },
};

export const LibraryActionRow = memo(function LibraryActionRow({
  entry,
  zone,
  ctx = {},
}) {
  if (!entry || !zone) return null;
  const actions = getActionsFor(entry, zone, ctx);
  if (!actions.length) return null;

  return (
    <div
      data-testid="library-action-row"
      data-zone={zone}
      data-kind={entry.kind || ''}
      style={{
        display: 'flex',
        gap: 6,
        padding: '8px 14px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {actions.map((a) => {
        const sty = VARIANT_STYLE[a.variant] || VARIANT_STYLE.default;
        return (
          <button
            type="button"
            key={a.id}
            data-testid={`library-action-${a.id}`}
            data-variant={a.variant}
            onClick={a.onClick}
            disabled={a.disabled}
            title={a.tooltip || ''}
            style={{
              ...sty,
              fontSize: 11.5,
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: a.disabled ? 'not-allowed' : 'pointer',
              opacity: a.disabled ? 0.55 : 1,
              fontWeight: a.variant === 'primary' ? 500 : 400,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {a.icon && <span style={{ fontSize: 12 }}>{a.icon}</span>}
            <span>{a.label}</span>
          </button>
        );
      })}
    </div>
  );
});

export default LibraryActionRow;
