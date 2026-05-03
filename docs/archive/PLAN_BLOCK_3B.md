# PLAN_BLOCK_3B.md — Status + Lifecycle

**Дата:** 1 апреля 2026
**Статус:** Готов к реализации
**Зависит от:** Блок 3a ✅

---

## Анализ: что уже реализовано

| Что | Где | Статус |
|-----|-----|--------|
| Поле `status` в `addPart()` (auto-assign по source) | `fragmentSlice.js:105-111` | ✅ |
| Поле `origin` с projectId/projectName/createdAt | `fragmentSlice.js:98-101` | ✅ |
| Миграция v5→v6 (persist version = 6) | `store/index.js:160-171` | ✅ частично |
| `updatePartStatus`, `archivePart`, `restorePart` | `fragmentSlice.js:144-159` | ✅ |
| Status badges (draft → "Запл.", archived → "Арх.") | `PartsPalette.jsx:223-224, 293-294` | ✅ |
| Фильтр по статусу (5 кнопок) | `PartsPalette.jsx:185-198` | ✅ |
| Контекстное меню: verify/archive/restore | `PartsPalette.jsx:443-450` | ✅ |
| Инвентарь свёрнут | `PartsPalette.jsx:66, 387-424` | ✅ |

---

## Что осталось

| # | Задача | Файл(ы) | Сложность |
|---|--------|---------|-----------|
| 1 | `origin.assemblyId` не устанавливается | `fragmentSlice.js` | Низкая |
| 2 | Палитра: 4 секции вместо flat-списка | `PartsPalette.jsx` + новый `parts-grouping.js` | Средняя |
| 3 | `completeAssembly` product naming: `{projectName} — {assemblyName}` | `useFragmentHandlers.js` | Низкая |
| 4 | Миграция v5→v6: упростить (ВСЕ → verified, по спеку §2.3) | `store/index.js` | Низкая |
| 5 | `restorePart`: два варианта (→ draft, → verified) | `fragmentSlice.js` + `PartsPalette.jsx` | Низкая |
| 6 | Бейдж "Получ." для verified parts | `PartsPalette.jsx` | Низкая |

---

## Подзадача 1: origin.assemblyId

**Файл:** `gui/designer/src/store/fragmentSlice.js`

В `addPart()` (~строка 99) добавить `assemblyId`:

```js
origin: part.origin || {
  projectId: get().activeProjectId,
  projectName: get().projectName,
  assemblyId: get().activeId,       // <-- ДОБАВИТЬ
  createdAt: new Date().toISOString(),
},
```

**Тесты:**
- `addPart()` устанавливает `origin.assemblyId` из `activeId`
- `addPart()` с готовым `origin` не перезаписывает

---

## Подзадача 2: Палитра — 4 секции

**Новый файл:** `gui/designer/src/parts-grouping.js`

```js
export function groupByLifecycle(parts, activeProjectId) {
  const nonArchived = parts.filter(p => p.status !== 'archived');
  return {
    thisProject: nonArchived.filter(p =>
      p.status === 'draft' && p.origin?.projectId === activeProjectId),
    library: nonArchived.filter(p =>
      p.status === 'verified' || !p.status),
    otherProjects: nonArchived.filter(p =>
      p.status === 'draft' && p.origin?.projectId && p.origin.projectId !== activeProjectId),
  };
}

export function formatProductName(projectName, assemblyName) {
  return `${projectName} — ${assemblyName}`;
}
```

**Файл:** `PartsPalette.jsx`

1. Добавить `activeProjectId` selector
2. Добавить `otherProjOpen` state (default: false)
3. Заменить `filtered` useMemo на группировку через `groupByLifecycle()` (при `statusFilter === 'default'`)
4. В JSX — 4 секции:
   - **ЭТОТ ПРОЕКТ** — раскрыт, draft-ы текущего проекта, без категорийной группировки
   - **БИБЛИОТЕКА** — раскрыт, verified + no-status, с категорийной группировкой (как сейчас)
   - **ДРУГИЕ ПРОЕКТЫ** (N) ▶ — свёрнут, draft-ы чужих проектов
   - **ИНВЕНТАРЬ** (N) ▶ — свёрнут (уже есть)
5. При `statusFilter !== 'default'` — flat-список как сейчас

**Тесты (чистая функция `groupByLifecycle`):**
- draft + origin.projectId === active → thisProject
- verified → library
- parts без status → library (backward compat)
- draft + origin.projectId !== active → otherProjects
- archived → ни в одну группу
- parts без origin → library

**Главный риск:** Не сломать drag-n-drop, context menu, expand/collapse. Митигация: DraggableHandle не менять, только обёртки секций.

---

## Подзадача 3: Product naming

**Файл:** `gui/designer/src/hooks/useFragmentHandlers.js`

1. Добавить `projectName` selector (~строка 17):
   ```js
   const projectName = useStore(s => s.projectName);
   ```

2. Строка ~243, именование продукта:
   ```js
   // БЫЛО:
   name: active.name,
   // СТАЛО:
   name: formatProductName(projectName, active.name),
   ```

3. **КРИТИЧНО:** строка ~260, проверка дубликатов:
   ```js
   // БЫЛО:
   if (!parts.some(p => p.name === active.name && p.sourceAssemblyId === active.id))
   // СТАЛО:
   const productName = formatProductName(projectName, active.name);
   if (!parts.some(p => p.name === productName && p.sourceAssemblyId === active.id))
   ```

**Тест:** `formatProductName('Проект 1', 'Сборка 3') === 'Проект 1 — Сборка 3'`

---

## Подзадача 4: Упростить миграцию v5→v6

**Файл:** `gui/designer/src/store/index.js`

Текущая миграция (строки 160-171) дифференцирует по `source`. Спек §2.3: "не угадывать, ВСЕ → verified".

```js
// Упрощённая миграция
if (version < 6 && persisted?.parts) {
  persisted.parts = persisted.parts.map(p => {
    if (p.status) return p;
    return { ...p, status: 'verified' };
  });
}
```

**Тесты:**
- part без status → `verified`
- part с `source: 'mutation'` без status → `verified` (не draft!)
- part с существующим status → без изменений

**Риск:** Нулевой для users на v6 (миграция не запустится).

---

## Подзадача 5: restorePart с targetStatus

**Файл:** `gui/designer/src/store/fragmentSlice.js`

```js
restorePart: (id, targetStatus = 'draft') => set(state => {
  const p = state.parts.find(x => x.id === id);
  if (p && p.status === 'archived') {
    p.status = targetStatus;
    if (targetStatus === 'verified') p.verifiedDate = new Date().toISOString();
  }
}, false, 'restorePart'),
```

**Файл:** `PartsPalette.jsx` — контекстное меню (строка ~449):

```js
...(p.status === 'archived' ? [
  { icon: '↩️', label: 'Восстановить (черновик)', onClick: () => restorePart(p.id, 'draft') },
  { icon: '✅', label: 'Восстановить (получен)', onClick: () => restorePart(p.id, 'verified') },
] : []),
```

**Тесты:**
- `restorePart(id)` → draft (default)
- `restorePart(id, 'verified')` → verified + verifiedDate
- `restorePart` на non-archived → noop

---

## Подзадача 6: Бейдж "Получ." для verified

**Файл:** `PartsPalette.jsx`

Добавить (после existing draft/archived badges):
```jsx
{(p.status === 'verified') && <span className="text-[7px] px-1 rounded bg-green-100 text-green-700 shrink-0">Получ.</span>}
```

Показывать только в секциях "Этот проект" и "Другие проекты". В "Библиотеке" все verified — бейдж избыточен.

---

## Порядок реализации (TDD)

```
Шаг 1: Тесты (parts-lifecycle.test.js)          — 20 мин
Шаг 2: parts-grouping.js (чистый модуль)        — 5 мин
Шаг 3: fragmentSlice.js (origin + restorePart)  — 10 мин
Шаг 4: store/index.js (миграция)                — 5 мин
Шаг 5: useFragmentHandlers.js (product naming)  — 5 мин
Шаг 6: PartsPalette.jsx (4 секции + badges)     — 40 мин
Шаг 7: npx vitest run && npx vite build         — 5 мин
```

**Суммарно:** ~90 мин.

---

## Коммиты

```
1. test: add parts-lifecycle tests (grouping, origin, restore, migration, naming)
2. feat: add assemblyId to origin, enhance restorePart with targetStatus
3. refactor: simplify v5→v6 migration — all existing parts → verified
4. feat: product naming "{projectName} — {assemblyName}" in completeAssembly
5. feat: palette 4-section grouping (thisProject / library / otherProjects / inventory)
6. feat: verified badge + dual restore in context menu
```

---

## Риски

| Риск | P | I | Митигация |
|------|---|---|-----------|
| JSX рефакторинг палитры ломает DnD | Средн | Выс | Не менять DraggableHandle |
| `formatProductName` ломает inventory lookup | Низк | Средн | Изменить проверку дубликатов в completeAssembly |
| Палитра слишком длинная с 4 секциями | Низк | Низк | "Другие проекты" свёрнут |
| v6 пользователи не затронуты | Нуль | Нуль | Миграция условна на `version < 6` |
