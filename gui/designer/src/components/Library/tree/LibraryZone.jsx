/**
 * LibraryZone — Sprint M-X.7a v2 K2.
 *
 * Universal zone wrapper per Library.html `<div class="zone">`.
 * Variants: 'loose' (no extra class) / 'active' / 'readonly' / 'lab'.
 * Each variant tweaks the zone-head accent color and (for 'active'
 * / 'readonly') surfaces a status pill next to the title.
 *
 * Owns expand/collapse for the zone level. Body renders only when
 * expanded — heavy zone content (large project trees) doesn't pay
 * render cost when collapsed.
 *
 * Children: zone-specific row content provided by the consumer
 * (LooseZone / ProjectZone / LabPoolZone), so this file stays
 * stateless about which entries to show.
 */
import { memo } from 'react';

const VARIANT_STYLE = {
  loose: { iconColor: 'var(--text-secondary)', headBg: 'transparent' },
  active: { iconColor: 'var(--accent-700)', headBg: 'var(--accent-50)' },
  readonly: { iconColor: 'var(--text-tertiary)', headBg: 'var(--surface-2)' },
  lab: { iconColor: 'var(--kld)', headBg: 'transparent' },
};

export const LibraryZone = memo(function LibraryZone({
  variant = 'loose',
  icon,
  title,
  sub,
  count = null,
  pill,
  expanded = true,
  onToggle,
  headerAction,
  // Right-click on the zone header (project rows attach a context menu here).
  onHeaderContextMenu,
  children,
  testId,
}) {
  const v = VARIANT_STYLE[variant] || VARIANT_STYLE.loose;
  return (
    <section
      data-testid={testId || `library-zone-${variant}`}
      data-variant={variant}
      data-expanded={expanded ? 'true' : 'false'}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'transparent',
      }}
    >
      <header
        data-testid={`${testId || `library-zone-${variant}`}-head`}
        role="button"
        tabIndex={0}
        onClick={() => onToggle?.()}
        onContextMenu={onHeaderContextMenu}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(); } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          background: v.headBg,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          // FAIL-fix-pass 3 — UPPERCASE only for the «section
          // label» variants (loose / readonly / lab). Project-zone
          // headers carry the user-typed project name and should
          // stay in natural case.
          textTransform: variant === 'active' ? 'none' : 'uppercase',
          color: 'var(--text-secondary)',
          borderLeft: variant === 'active'
            ? '2px solid var(--accent-500)'
            : '2px solid transparent',
        }}
      >
        <span style={{ width: 10, fontSize: 9, color: 'var(--text-tertiary)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ fontSize: 13, color: v.iconColor }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {pill && (
          <span data-testid={`${testId || `library-zone-${variant}`}-pill`}>
            {pill}
          </span>
        )}
        {sub && (
          <span style={{
            fontSize: 10.5, fontWeight: 400, textTransform: 'none',
            letterSpacing: 0, color: 'var(--text-tertiary)',
          }}>{sub}</span>
        )}
        {count !== null && (
          <span
            data-testid={`${testId || `library-zone-${variant}`}-count`}
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              padding: '1px 6px',
              background: 'var(--surface-1)',
              borderRadius: 9,
              fontWeight: 500,
              letterSpacing: 0,
            }}
          >{count}</span>
        )}
        {headerAction && (
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center' }}
          >{headerAction}</span>
        )}
      </header>
      {expanded && children}
    </section>
  );
});

export default LibraryZone;
