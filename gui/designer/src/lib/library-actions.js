/**
 * library-actions — Sprint M-X.7a v2 K3 (spec §5.4).
 *
 * `getActionsFor(entry, zone, ctx)` returns the per-zone × per-kind
 * action-row contents that `LibraryActionRow` mounts under the
 * `LibrarySingleInspector` body.
 *
 * Shape: `{ id, label, icon, variant, onClick, disabled?, tooltip? }`
 *   • variant = 'primary' | 'default' | 'ghost' | 'danger'
 *   • Disabled actions surface a `tooltip` explaining why
 *     (typically `'M-X.7b: версионирование'` for save-as-version
 *     / rollback / branch flows that wait on the parallel
 *     versioning sprint).
 *
 * Handlers:
 *   • Concrete handlers come from `ctx` (caller wires them to
 *     librarySlice actions, projectSlice actions, etc.).
 *   • If a handler is missing, the action's `onClick` is a no-op
 *     and its `disabled` flag flips on with a generic tooltip
 *     so the row still renders the affordance (visual completeness
 *     for the K3 acceptance pass; K6+ wires the missing pipes).
 */

import { STRINGS } from './strings';

const noop = () => {};

const TOOLTIP_M_X_7B = 'M-X.7b: версионирование';
const TOOLTIP_M_X_9 = 'M-X.9: импорт из чужих .bodge';
// A5 (audit) — handler not wired yet: disable the affordance with a tooltip
// instead of rendering an enabled button whose click does nothing.
const TOOLTIP_WIP = 'В разработке';
const wip = (handler) => ({ disabled: !handler, tooltip: !handler ? TOOLTIP_WIP : null });

// M-X.7c K6 — STRINGS lookup with safe fallbacks for the new
// loose-container/primer button labels and the «no active project»
// disabled tooltip.
const A_LOOSE = STRINGS?.libraryWorkspace?.actionsLoose || {};
const LBL = {
  addToActiveProject: A_LOOSE.addToActiveProject || 'Добавить в активный проект',
  addToActiveProjectDisabled: A_LOOSE.addToActiveProjectDisabled || 'Нет активного проекта',
  createCopyForEdit: A_LOOSE.createCopyForEdit || 'Создать копию для правки',
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
    action('createCopyForEdit', {
      label: LBL.createCopyForEdit,
      icon: '✎',
      onClick: () => ctx.createManualEditBranch?.(entry.id),
      ...wip(ctx.createManualEditBranch),
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
    action('editPrimer', {
      label: 'Редактировать',
      icon: '✎',
      onClick: () => ctx.editPrimer?.(entry.id),
      ...wip(ctx.editPrimer),
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
  return [
    action('containerWindow', {
      label: 'Container Window',
      icon: '↗',
      variant: 'primary',
      onClick: () => ctx.openContainerWindow?.(entry.id),
      ...wip(ctx.openContainerWindow),
    }),
    action('showInDag', {
      label: 'Показать в DAG',
      icon: '🔀',
      onClick: () => ctx.showInDag?.(entry.id),
    }),
    action('extractToLoose', {
      label: 'Извлечь в Loose',
      icon: '📤',
      onClick: () => ctx.extractEntryToLoose?.(entry.id),
    }),
    action('saveAsVersion', {
      label: 'Сохранить как версию',
      icon: '📚',
      disabled: true,
      tooltip: TOOLTIP_M_X_7B,
    }),
    action('clone', {
      label: 'Клонировать',
      icon: '📋',
      onClick: () => ctx.cloneEntry?.(entry.id),
      ...wip(ctx.cloneEntry),
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
  return [
    action('useInDag', {
      label: 'Использовать в DAG',
      icon: '🧪',
      variant: 'primary',
      onClick: () => ctx.usePrimerInDag?.(entry.id),
      ...wip(ctx.usePrimerInDag),
    }),
    action('extractToLoose', {
      label: 'Извлечь в Loose',
      icon: '📤',
      onClick: () => ctx.extractEntryToLoose?.(entry.id),
    }),
    action('saveAsVersion', {
      label: 'Сохранить как версию',
      icon: '📚',
      disabled: true,
      tooltip: TOOLTIP_M_X_7B,
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
    action('copyToLoose', {
      label: 'Скопировать в Loose',
      icon: '📋',
      onClick: () => ctx.copyToLoose?.(entry.id),
      ...wip(ctx.copyToLoose),
    }),
    action('openAsActive', {
      label: 'Открыть как активный',
      icon: '🔓',
      disabled: true,
      tooltip: TOOLTIP_M_X_9,
    }),
    action('view', {
      label: 'Просмотр',
      icon: '↗',
      onClick: () => ctx.openContainerWindow?.(entry.id),
      ...wip(ctx.openContainerWindow),
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
    action('copyToLoose', {
      label: 'Скопировать в Loose',
      icon: '📋',
      onClick: () => ctx.copyToLoose?.(entry.id),
      ...wip(ctx.copyToLoose),
    }),
    action('openAsActive', {
      label: 'Открыть как активный',
      icon: '🔓',
      disabled: true,
      tooltip: TOOLTIP_M_X_9,
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
    action('editNotes', {
      label: 'Редактировать заметки',
      icon: '✎',
      onClick: () => ctx.editPrimerNotes?.(entry.id),
      ...wip(ctx.editPrimerNotes),
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
 *   extractEntryToLoose, toggleLabStock, openContainerWindow,
 *   createManualEditBranch, openFolderPicker, exportEntry,
 *   deleteEntry, editPrimer, editPrimerNotes, showInDag, cloneEntry,
 *   copyToLoose, usePrimerInDag } — concrete handlers from
 *   LibraryWorkspace (K4) wiring.
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
