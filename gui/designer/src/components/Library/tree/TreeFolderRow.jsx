/**
 * TreeFolderRow — Sprint M-X.7a v2 K2.
 *
 * `.folder.indent-N` row per Library.html `<div class="folder">`.
 * Renders: twist (▾/▸) + icon + name + count badge.
 *
 * Stateless about expanded state — caller owns `expanded` and
 * `onToggle()`. Used inside every zone wrapper (LooseZone +
 * ProjectZone + LabPoolZone) for both folder + sub-folder rows
 * (Контейнеры / Праймеры / В лаборатории / Из чужих проектов /
 * user-created Loose folders).
 */
import { memo } from 'react';
import { Icon } from '../../icons/Icon';

const INDENT_PX = [12, 22, 38, 54, 70];

function indentFor(depth) {
  return INDENT_PX[Math.min(depth, INDENT_PX.length - 1)];
}

export const TreeFolderRow = memo(function TreeFolderRow({
  name,
  icon = <Icon name="folder" size={13} />,
  count = null,
  expanded = false,
  indent = 1,
  onToggle,
  testId,
  textColor,
}) {
  return (
    <div
      data-testid={testId || `tree-folder-${name}`}
      data-expanded={expanded ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={() => onToggle?.()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(); } }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        paddingLeft: indentFor(indent),
        cursor: 'pointer',
        userSelect: 'none',
        fontSize: 12,
        color: textColor || 'var(--text-secondary)',
      }}
    >
      <span style={{
        width: 10, color: 'var(--text-tertiary)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={10} /></span>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      <span
        style={{
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >{name}</span>
      {count !== null && (
        <span
          data-testid={`${testId || `tree-folder-${name}`}-count`}
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            padding: '1px 6px',
            background: 'var(--surface-2)',
            borderRadius: 9,
          }}
        >{count}</span>
      )}
    </div>
  );
});

export default TreeFolderRow;
