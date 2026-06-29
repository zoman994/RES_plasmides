/**
 * primer-status — PRIMER-2 (Игорь /loop 28.06.2026). Single source of truth for
 * the pool primer lifecycle: labels (RU), colors, the forward flow and rank.
 *
 * Statuses mirror primerSlice VALID_STATUSES:
 *   imported / designed  — entry states (where the primer came from)
 *   ordered              — sent to a vendor
 *   received             — physically in the freezer
 *   archived             — retired (kept for provenance, hidden by default)
 *
 * Forward flow (the «advance» button): entry → ordered → received → archived.
 * Archiving from any state is a separate explicit action (see PrimerStatusControl).
 */

export const ALL_STATUSES = ['imported', 'designed', 'ordered', 'received', 'archived'];

// Ordered tail of the lifecycle that the «advance» arrow walks through.
const FORWARD_TAIL = ['ordered', 'received', 'archived'];

const META = {
  imported: { label: 'Импортирован', color: '#0369a1', bg: '#e0f2fe' },
  designed: { label: 'Спроектирован', color: '#7c3aed', bg: '#ede9fe' },
  ordered: { label: 'Заказан', color: '#b45309', bg: '#fef3c7' },
  received: { label: 'Получен', color: '#15803d', bg: '#dcfce7' },
  archived: { label: 'В архиве', color: '#57534e', bg: '#f5f5f4' },
};

const GENERIC = { label: 'Статус неизвестен', color: '#57534e', bg: '#f5f5f4' };

export function statusMeta(status) {
  return META[status] || GENERIC;
}

export function statusLabel(status) {
  return statusMeta(status).label;
}

/**
 * Next status the «advance» action moves to, or null when terminal (archived).
 * Entry states (imported/designed/unknown) step to 'ordered'.
 */
export function nextStatus(status) {
  if (status === 'archived') return null;
  const i = FORWARD_TAIL.indexOf(status);
  if (i === -1) return 'ordered'; // entry / unknown
  return FORWARD_TAIL[i + 1] || null;
}

export function isTerminal(status) {
  return status === 'archived';
}

const RANK = { imported: 0, designed: 0, ordered: 1, received: 2, archived: 3 };

export function statusRank(status) {
  return RANK[status] ?? 0;
}
