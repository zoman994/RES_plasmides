/**
 * breadcrumb.js — чистый построитель хлебных крошек «где я сейчас».
 *
 * UX_DIRECTION фаза 2 (логика окон): пока роутер двойной (`activeFullscreen`
 * overlay + `workspace.active`), крошки делают текущее положение ЛЕГИБЕЛЬНЫМ
 * без унификации роутера — просто читают оба и показывают трейл:
 *   Инструменты → {окно}     (кросс-проектный инструмент)
 *   {Проект}    → {окно}     (окно активного проекта)
 *
 * Пара к ProjectContextBar (фаза 1): полоса говорит КАКОЙ проект, крошки —
 * КАКОЕ окно. Чистая функция → юнит-тест без DOM/стора.
 *
 * Источник вокабуляра (App.jsx switch + workspaceSlice): activeFullscreen ∈
 * {start, canvasSkeleton, containerWindow, multiTabBlocked, readOnlyForced,
 * underConstruction, null}; workspace.active ∈ {startup, library, align,
 * importer, mix, construct}.
 */

const TOOL = 'Инструменты';

/**
 * @returns {Array<{label:string, kind?:'tool'|'project'|'window'|'system', current?:boolean}>}
 */
export function buildBreadcrumb({ activeFullscreen, workspaceActive, projectName } = {}) {
  const proj = projectName || 'Проект';

  // Overlay-роуты (activeFullscreen) перекрывают контент → у них приоритет.
  switch (activeFullscreen) {
    case 'start':
      return [{ label: 'Главная', kind: 'window', current: true }];
    case 'canvasSkeleton':
      return [{ label: proj, kind: 'project' }, { label: 'Сборки', kind: 'window', current: true }];
    case 'containerWindow':
      return [{ label: proj, kind: 'project' }, { label: 'Контейнер', kind: 'window', current: true }];
    case 'readOnlyForced':
      return [{ label: proj, kind: 'project' }, { label: 'Только чтение', kind: 'system', current: true }];
    case 'multiTabBlocked':
      return [{ label: 'Открыто в другой вкладке', kind: 'system', current: true }];
    case 'underConstruction':
      return [{ label: 'В разработке', kind: 'system', current: true }];
    default:
      break;
  }

  switch (workspaceActive) {
    case 'library':
      return [{ label: TOOL, kind: 'tool' }, { label: 'Библиотека', kind: 'window', current: true }];
    case 'align':
      return [{ label: TOOL, kind: 'tool' }, { label: 'Выравнивание', kind: 'window', current: true }];
    case 'importer':
      return [{ label: TOOL, kind: 'tool' }, { label: 'Импорт', kind: 'window', current: true }];
    case 'mix':
      return [{ label: TOOL, kind: 'tool' }, { label: 'Mix', kind: 'window', current: true }];
    case 'construct':
      return [{ label: proj, kind: 'project' }, { label: 'Конструкт', kind: 'window', current: true }];
    case 'startup':
      return [{ label: 'Главная', kind: 'window', current: true }];
    default:
      return [{ label: 'Рабочая область', kind: 'window', current: true }];
  }
}
