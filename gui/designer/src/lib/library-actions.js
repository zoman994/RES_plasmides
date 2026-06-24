/**
 * library-actions — Sprint M-X.7a v2 K3 (spec §5.4).
 *
 * `getActionsFor(entry, zone, ctx)` returns the per-zone × per-kind
 * action-row contents that `LibraryActionRow` mounts under the
 * `LibrarySingleInspector` body.
 *
 * Shape: `{ id, label, icon, variant, onClick, disabled?, tooltip? }`
 *   • variant = 'primary' | 'default' | 'ghost' | 'danger'
 *
 * 17.06.2026 cleanup (Игорь «прибраться — часть убрать»): every action
 * here now DOES something. The previous build rendered «visual
 * completeness» placeholders — buttons backed by an unwired handler or
 * hard-disabled pending a future sprint (Container Window, Save-as-
 * version, cross-bodge import, primer-edit, clone) — plus the dead DAG
 * path (Show/Use in DAG → the orphaned DagWorkspace). All removed.
 * Save-as-version still exists, but as the working inspector save panel
 * (LibrarySaveActions), not a dead row stub. A future feature re-adds
 * its action only once the pipe is actually built.
 *
 * The only conditionally-disabled action is `align` (degrades via
 * `wip()` if a caller forgets to wire `alignEntry`) and the
 * «add/copy to active project» CTAs (disabled with a tooltip when no
 * active project exists — a real, recoverable state, not a stub).
 */

import { STRINGS } from './strings';

const noop = () => {};

// A handler that may be unwired by some callers (only `align` today)
// degrades gracefully to a disabled affordance with a tooltip rather
// than a dead enabled button. The 17.06.2026 cleanup removed every
// PERMANENTLY-disabled placeholder (DAG, Container Window, versioning,
// cross-bodge import, primer-edit, clone) — those re-appear only when
// their pipe is actually built. See getActionsFor docstring.
const TOOLTIP_WIP = 'В разработке';
const wip = (handler) => ({ disabled: !handler, tooltip: !handler ? TOOLTIP_WIP : null });

// M-X.7c K6 — STRINGS lookup with safe fallbacks for the new
// loose-container/primer button labels and the «no active project»
// disabled tooltip.
const A_LOOSE = STRINGS?.libraryWorkspace?.actionsLoose || {};
const LBL = {
  addToActiveProject: A_LOOSE.addToActiveProject || 'Добавить в активный проект',
  addToActiveProjectDisabled: A_LOOSE.addToActiveProjectDisabled || 'Нет активного проекта',
  moveToFolder: A_LOOSE.moveToFolder || 'Переместить в папку…',
};

function action(id, opts) {
  return {
    id,
    label: opts.label,
    icon: opts.icon || '',
    variant: opts.variant || 'default',
    onClick: opts.onClick || noop,
    disabled: opts.disabled === true,
    tooltip: opts.tooltip || null,
  };
}

function looseContainerActions(entry, ctx) {
  // M-X.7c K6 — bottom-bar refactor (DEC-UIRREV-OPEN-DOUBLECLICK-ONLY-01).
  //   • «Использовать в активном» → «Добавить в активный проект» (id renamed
  //     to addToActiveProject).
  //   • «Открыть» button removed; double-click on the Tree row is the
  //     single entry point into Container Window / full-Inspector.
  //   • «Manual-edit ветка» → «Создать копию для правки».
  //   • «Переместить» → «Переместить в папку…».
  return [
    action('addToActiveProject', {
      label: LBL.addToActiveProject,
      icon: '📋',
      variant: 'primary',
      onClick: () => ctx.cloneEntryToActiveProject?.(entry.id),
      disabled: !ctx.hasActiveProject,
      tooltip: !ctx.hasActiveProject ? LBL.addToActiveProjectDisabled : null,
    }),
    action('align', {
      label: STRINGS?.align?.action || 'Выровнять',
      icon: '≣',
      onClick: () => ctx.alignEntry?.(entry.id),
      ...wip(ctx.alignEntry),
    }),
    action('moveToFolder', {
      label: LBL.moveToFolder,
      icon: '📁',
      onClick: () => ctx.openFolderPicker?.(entry.id),
    }),
    action('exportGenBank', {
      label: 'Экспорт',
      icon: '⤓',
      onClick: () => ctx.exportEntry?.(entry.id),
    }),
    action('delete', {
      label: 'Удалить',
      icon: '🗑',
      variant: 'danger',
      onClick: () => ctx.deleteEntry?.(entry.id),
    }),
  ];
}

function loosePrimerActions(entry, ctx) {
  // M-X.7c K6 — primer variant: «Использовать в проекте» → «Добавить
  // в активный проект» (id addToActiveProject), «Переместить» →
  // «Переместить в папку…». Primers don't get «Открыть» / Container
  // Window (different workflow).
  return [
    action('addToActiveProject', {
      label: LBL.addToActiveProject,
      icon: '🧪',
      variant: 'primary',
      onClick: () => ctx.cloneEntryToActiveProject?.(entry.id),
      disabled: !ctx.hasActiveProject,
      tooltip: !ctx.hasActiveProject ? LBL.addToActiveProjectDisabled : null,
    }),
    action('moveToFolder', {
      label: LBL.moveToFolder,
      icon: '📁',
      onClick: () => ctx.openFolderPicker?.(entry.id),
    }),
    action('exportGenBank', {
      label: 'Экспорт',
      icon: '⤓',
      onClick: () => ctx.exportEntry?.(entry.id),
    }),
    action('delete', {
      label: 'Удалить',
      icon: '🗑',
      variant: 'danger',
      onClick: () => ctx.deleteEntry?.(entry.id),
    }),
  ];
}

function activeContainerActions(entry, ctx) {
  // «Сохранить как версию» lives in the inspector's own save panel
  // (LibrarySaveActions) — it's not duplicated here as a dead stub.
  // Container Window + DAG removed (17.06.2026 cleanup).
  return [
    action('align', {
      label: STRINGS?.align?.action || 'Выровнять',
      icon: '≣',
      onClick: () => ctx.alignEntry?.(entry.id),
      ...wip(ctx.alignEntry),
    }),
    action('extractToLoose', {
      label: 'Извлечь в Loose',
      icon: '📤',
      onClick: () => ctx.extractEntryToLoose?.(entry.id),
    }),
    action('exportGenBank', {
      label: 'Экспорт GenBank',
      icon: '⤓',
      onClick: () => ctx.exportEntry?.(entry.id),
    }),
    action('delete', {
      label: 'Удалить из проекта',
      icon: '🗑',
      variant: 'danger',
      onClick: () => ctx.deleteEntry?.(entry.id),
    }),
  ];
}

function activePrimerActions(entry, ctx) {
  // exportGenBank added for parity with loose primers (a primer in a
  // project is just as exportable). DAG + versioning stubs removed.
  return [
    action('extractToLoose', {
      label: 'Извлечь в Loose',
      icon: '📤',
      onClick: () => ctx.extractEntryToLoose?.(entry.id),
    }),
    action('exportGenBank', {
      label: 'Экспорт',
      icon: '⤓',
      onClick: () => ctx.exportEntry?.(entry.id),
    }),
    action('delete', {
      label: 'Удалить из проекта',
      icon: '🗑',
      variant: 'danger',
      onClick: () => ctx.deleteEntry?.(entry.id),
    }),
  ];
}

function readonlyContainerActions(entry, ctx) {
  return [
    action('copyToActive', {
      label: 'Скопировать в активный',
      icon: '📋',
      variant: 'primary',
      onClick: () => ctx.cloneEntryToActiveProject?.(entry.id),
      disabled: !ctx.hasActiveProject,
      tooltip: !ctx.hasActiveProject ? 'Откройте активный проект' : null,
    }),
    action('align', {
      label: STRINGS?.align?.action || 'Выровнять',
      icon: '≣',
      onClick: () => ctx.alignEntry?.(entry.id),
      ...wip(ctx.alignEntry),
    }),
  ];
}

function readonlyPrimerActions(entry, ctx) {
  return [
    action('copyToActive', {
      label: 'Скопировать в активный',
      icon: '📋',
      variant: 'primary',
      onClick: () => ctx.cloneEntryToActiveProject?.(entry.id),
      disabled: !ctx.hasActiveProject,
      tooltip: !ctx.hasActiveProject ? 'Откройте активный проект' : null,
    }),
  ];
}

function labPrimerActions(entry, ctx) {
  return [
    action('useInActive', {
      label: 'Использовать в проекте',
      icon: '🧪',
      variant: 'primary',
      onClick: () => ctx.cloneEntryToActiveProject?.(entry.id),
      disabled: !ctx.hasActiveProject,
      tooltip: !ctx.hasActiveProject ? 'Откройте активный проект' : null,
    }),
    action('toggleLabStock', {
      label: entry.inLabStock ? 'Снять метку' : 'Поставить метку',
      icon: '❄',
      onClick: () => ctx.toggleLabStock?.(entry.id),
    }),
    action('delete', {
      label: 'Удалить',
      icon: '🗑',
      variant: 'danger',
      onClick: () => ctx.deleteEntry?.(entry.id),
    }),
  ];
}

/**
 * @param {object} entry — LibraryEntry (must carry `kind`).
 * @param {string} zone — 'loose' | 'active_bodge' | 'readonly_bodge' | 'lab_pool'
 * @param {object} ctx — { hasActiveProject, cloneEntryToActiveProject,
 *   extractEntryToLoose, toggleLabStock, openFolderPicker, exportEntry,
 *   deleteEntry, alignEntry } — concrete working handlers from
 *   LibraryWorkspace wiring. (17.06.2026 cleanup dropped the unwired /
 *   dead-DAG handlers; only working actions are emitted now.)
 * @returns {Array<{id,label,icon,variant,onClick,disabled?,tooltip?}>}
 *   Empty array for unknown (zone, kind) combinations.
 */
export function getActionsFor(entry, zone, ctx = {}) {
  if (!entry || !zone) return [];
  const kind = entry.kind;
  if (zone === 'loose' && kind === 'container') return looseContainerActions(entry, ctx);
  if (zone === 'loose' && kind === 'primer') return loosePrimerActions(entry, ctx);
  if (zone === 'active_bodge' && kind === 'container') return activeContainerActions(entry, ctx);
  if (zone === 'active_bodge' && kind === 'primer') return activePrimerActions(entry, ctx);
  if (zone === 'readonly_bodge' && kind === 'container') return readonlyContainerActions(entry, ctx);
  if (zone === 'readonly_bodge' && kind === 'primer') return readonlyPrimerActions(entry, ctx);
  if (zone === 'lab_pool' && kind === 'primer') return labPrimerActions(entry, ctx);
  return [];
}
