/**
 * project-context.js — чистые селекторы контекста активного проекта.
 *
 * UX_DIRECTION фаза 1: активный `.bodge` должен быть виден всегда. Эти
 * селекторы извлекают из стора то, что показывает `ProjectContextBar`:
 * имя активного проекта, привязанный файл, число контейнеров, и список
 * недавних проектов для быстрого переключения. Чистые → юнит-тестируемы
 * без DOM/стора.
 *
 * Источник истины (store/projectSlice.js): `currentProjectId`, `projects`,
 * `fileName` (текущий открытый файл), `recentProjectIds` (MRU).
 */

/**
 * Контекст активного проекта.
 * @returns {{hasProject:boolean,id:string|null,name:string|null,fileName:string|null,containerCount:number}}
 */
export function selectActiveProjectContext(state) {
  const id = (state && state.currentProjectId) || null;
  const project = id && state.projects ? state.projects[id] : null;
  // Soft-deleted (trashed, `_pendingDelete`) current project counts as «нет
  // активного» — иначе карточка светит проект из корзины (Игорь 24.06).
  if (!id || !project || project._pendingDelete) {
    return { hasProject: false, id: null, name: null, fileName: null, containerCount: 0 };
  }
  return {
    hasProject: true,
    id,
    name: project.name || 'Без имени',
    fileName: (state && state.fileName) || null,
    containerCount: Array.isArray(project.containerIds) ? project.containerIds.length : 0,
  };
}

/**
 * Недавние проекты для дропдауна «сменить проект».
 * Пропускает id без живого объекта проекта; помечает текущий.
 * @returns {Array<{id:string,name:string,isCurrent:boolean}>}
 */
export function selectRecentProjectsForSwitch(state, limit = 8) {
  const ids = state && Array.isArray(state.recentProjectIds) ? state.recentProjectIds : [];
  const projects = (state && state.projects) || {};
  const cur = (state && state.currentProjectId) || null;
  const out = [];
  for (const id of ids) {
    const p = projects[id];
    if (!p || p._pendingDelete) continue; // корзина не показывается в пикере
    out.push({ id, name: p.name || 'Без имени', isCurrent: id === cur });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Полный список проектов для ПЕРВОГО выбора (когда активного проекта нет).
 * Недавние (recentProjectIds) идут первыми в их порядке, затем все остальные
 * проекты по алфавиту. В отличие от {@link selectRecentProjectsForSwitch}, не
 * ограничивается недавними — на свежем старте `recentProjectIds` может быть пуст,
 * а проекты уже существуют (созданы в Библиотеке). Дубли не повторяются.
 * @returns {Array<{id:string,name:string,isCurrent:boolean}>}
 */
export function selectProjectsForPick(state, limit = 12) {
  const projects = (state && state.projects) || {};
  const recentIds = state && Array.isArray(state.recentProjectIds) ? state.recentProjectIds : [];
  const cur = (state && state.currentProjectId) || null;
  const seen = new Set();
  const out = [];
  const push = (id) => {
    const p = projects[id];
    if (!p || p._pendingDelete || seen.has(id)) return; // корзина не показывается в пикере
    seen.add(id);
    out.push({ id, name: p.name || 'Без имени', isCurrent: id === cur });
  };
  for (const id of recentIds) push(id);
  const rest = Object.keys(projects)
    .filter((id) => !seen.has(id))
    .sort((a, b) => String(projects[a].name || '').localeCompare(String(projects[b].name || ''), 'ru'));
  for (const id of rest) push(id);
  return out.slice(0, limit);
}
