/**
 * version-status.js — small presentation helpers for the version-tree
 * redesign (Игорь 28.06.2026). A version/branch may carry a lifecycle
 * status on `entry.origin.status` ('release' | 'wip' | 'deprecated') and
 * a structural role ('version' | 'branch'). Pure, UI-token only — no
 * store access.
 */

export const STATUS_META = {
  release: { label: 'релиз', color: 'var(--success-fg)', bg: 'var(--surface-2)' },
  wip: { label: 'рабочая', color: 'var(--accent-700)', bg: 'var(--accent-50)' },
  deprecated: { label: 'устар.', color: 'var(--text-tertiary)', bg: 'var(--surface-2)' },
};

/** Status descriptor for the chip, or null when status is unset/unknown. */
export function statusMeta(status) {
  return STATUS_META[status] || null;
}

/** RU word for a structural lineage role; defaults to «версия». */
export function lineageRoleLabel(role) {
  return role === 'branch' ? 'ветка' : 'версия';
}

/** Read the lifecycle status off a library entry (null when absent). */
export function entryStatus(entry) {
  return entry?.origin?.status || null;
}
