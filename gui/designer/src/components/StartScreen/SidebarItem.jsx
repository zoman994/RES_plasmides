/**
 * SidebarItem — Sprint StartScreen-Pixel.
 *
 * One sidebar entry per Library.html `.sb-item`. Variants:
 *   • default — icon + label + optional `right` slot
 *   • primary — амбер background («Создать проект» CTA)
 *   • active — highlighted (current workspace) + 2.5px left stripe
 *   • disabled — opacity .45, not clickable, optional badge-soon
 *
 * `tip` is `data-tip` for the collapsed-state tooltip
 * (`.sb.collapsed .sb-item:hover::after` reads it).
 *
 * `right` can be:
 *   • a string (rendered into `.right` span — kbd shortcut, counter)
 *   • a node (e.g. `<span class="badge-soon">soon</span>`)
 *   • null (no right slot)
 */
import { memo } from 'react';

export const SidebarItem = memo(function SidebarItem({
  icon,
  label,
  right = null,
  tip,
  active = false,
  primary = false,
  disabled = false,
  badgeSoon = false,
  onClick,
  testId,
  style,
}) {
  const className = ['sb-item'];
  if (active) className.push('active');
  if (primary) className.push('primary');

  return (
    <button
      type="button"
      className={className.join(' ')}
      data-tip={tip || label}
      data-testid={testId || `sb-item-${label}`}
      data-active={active ? 'true' : 'false'}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
    >
      <span className="ico">{icon}</span>
      <span className="lbl">{label}</span>
      {badgeSoon && <span className="badge-soon">soon</span>}
      {!badgeSoon && right !== null && right !== undefined && (
        <span className="right">{right}</span>
      )}
    </button>
  );
});

export default SidebarItem;
