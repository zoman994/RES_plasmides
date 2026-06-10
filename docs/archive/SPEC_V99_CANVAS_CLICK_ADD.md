# SPEC V99 — Клик по entry в LibrarySearchBar авто-открывает редактор сборки

**Тип:** C (bugfix одного обработчика). **Баг:** V99 (в `BUGS.md`).
**Источник:** Игорь 22.05.2026 — клик по элементу в дропдауне «Поиск в библиотеке» на canvas сразу открывает редактор/пикер. Должно: фрагмент просто помещается на canvas, без авто-открытия.
**Статус:** готова к реализации. Диагноз — чтением `LibrarySearchBar.jsx`, `CanvasLayoutView.jsx`, `CanvasSkeleton/index.jsx`, `store/skeleton-state-canvas.js`.

---

## 0. Размеры затрагиваемых модулей

- `canvas/CanvasLayoutView.jsx` — 49.18 KB (выше hard-лимита 40 KB для .jsx). **Фикс — ТОЛЬКО удаление ~25 строк**, файл уменьшается. §2 запрещает *дописывать* в раздутый модуль; удаление из него правило не нарушает. Декомпозиция `CanvasLayoutView.jsx` — отдельный пункт `TECH_DEBT.md`, не в этой спеке.
- `store/skeleton-state-canvas.js` — 26.00 KB (выше hard-лимита 25 KB — TD-SKELETON-STATE-SIZE). **НЕ трогать** — редьюсер `ADD_CONTAINER_FROM_ENTRY` уже корректен, правки не требует.

## 1. Где задача сядет

Один обработчик — `onSearchPick` в `CanvasLayoutView.jsx`, ветка `kind === 'library'`. `LibrarySearchBar` сам корректен (зовёт `onSelectEntry({kind,id,entry})`, пикер не открывает). Редьюсер `ADD_CONTAINER_FROM_ENTRY` корректен. Радиус — один callback внутри одного файла.

## 2. Корень (по коду)

`LibrarySearchBar` при клике по entry зовёт `onSelectEntry({kind,id,entry})`. Caller — `onSearchPick` в `CanvasLayoutView.jsx`. Ветка `kind === 'library'` делает:
1. `actions.addContainerFromEntry(entry)` — добавляет контейнер на canvas. **Это верно** — тултип «pUC19 добавлено из дерева» в скриншоте подтверждает, что шаг отрабатывает.
2. Затем `setTimeout(…, 0)`: создаёт новую zone (`buildAssemblyZoneAction` + `zoneDispatch`), переносит контейнер в zone (`moveNodeToZone`), вставляет сегмент на всю длину (`insertSegment`) и **`openEditorAssemblyTab(zone.id)`** — открывает редактор сборки.

Шаг 2 — поведение AE-K10 (комментарий в коде: «container always belongs to a zone … picking a library plasmid materialises a container, wraps it in a zone, opens the assembly editor … Single pUC19 view case lands here»). Игорь это поведение отменяет: клик должен только положить фрагмент на canvas.

Для сравнения — drag-drop путь (`use-tree-drop-target.js` → `ADD_CONTAINER_FROM_ENTRY`) кладёт контейнер БЕЗ zone-wrap и БЕЗ открытия редактора. Клик и drop сейчас несогласованы; фикс делает клик идентичным drop.

Редьюсер `ADD_CONTAINER_FROM_ENTRY` без `position` дефолтит контейнер на `{x:80,y:80}`, ставит `highlightedContainerId`, шлёт toast «Добавлено». Т.е. «фрагмент помещается на canvas» полностью отрабатывает уже на шаге 1.

## 3. Решение

В `onSearchPick`, ветка `kind === 'library'`: убрать весь блок `setTimeout(…)` (zone-wrap + `openEditorAssemblyTab`). Оставить только `actions.addContainerFromEntry?.(entry)` + `return`.

Сопутствующая чистка (после удаления блока код становится мёртвым):
- `searchStateRef` (`useRef(state)` + строка `searchStateRef.current = state`) — использовался только удаляемым `setTimeout`. Удалить.
- import `buildAssemblyZoneAction` — если в `CanvasLayoutView.jsx` больше нигде не используется (проверить grep по файлу), удалить.

Прочие ветки `onSearchPick` — `container` → `highlightContainer`, `zone` → `openEditorAssemblyTab`, `primer` → no-op — НЕ трогать, для них поведение верное.

Фикс отменяет click-поведение AE-K10. Code не должен «восстанавливать» zone-wrap. DEC-запись о реверсе AE-K10 добавит Chat в сессии финализации.

## 4. Scope

**IN:** `CanvasLayoutView.jsx` — `onSearchPick` library-ветка + чистка dead `searchStateRef` / import. Регрессионный тест.

**OUT:** `LibrarySearchBar.jsx` (корректен). `skeleton-state-canvas.js` (корректен + над hard-лимитом — не трогать). Декомпозиция `CanvasLayoutView.jsx` (TECH_DEBT). Drag-drop путь. Ветки `container` / `zone` / `primer` в `onSearchPick`.

## 5. Тесты

- **Регрессионный:** смонтировать `CanvasLayoutView`, кликнуть library-entry в search bar → `state.containers` вырос на 1, контейнер на canvas; редактор НЕ открыт (`state.editorOpen` false), новая assembly-zone НЕ создана.
- **Согласованность:** клик и drop одного library-entry дают идентичный результат — контейнер на canvas, без редактора.
- **Регрессия:** существующие тесты `onSearchPick` (если покрывали AE-K10 zone-wrap) — обновить под новое поведение. Полный Vitest + `vite build` clean.

## 6. Риски

- Повторные клики кладут контейнер на фиксированный `{x:80,y:80}` (редьюсер не каскадит для `ADD_CONTAINER_FROM_ENTRY`, в отличие от `ADD_CONTAINER`) → стопка при N кликах. Каскад — правка `skeleton-state-canvas.js`, а он над hard-лимитом, трогать нельзя. Оставляем; при необходимости — отдельная задача после декомпозиции редьюсера.
- Реверс AE-K10: контейнер остаётся loose (`zoneId: null`). Это уже валидное состояние — drag-drop путь именно такие и создаёт. Mental model «container ∈ zone» сохраняется: zone присваивается позже (drop в zone / явное действие сборки).

## 7. Порядок + STOP

1. `onSearchPick` — убрать `setTimeout`-блок из library-ветки + dead `searchStateRef` / unused import.
2. Регрессионный тест + тест согласованности click/drop.
3. Полный Vitest + `vite build`.

**STOP:** после реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md`. НЕ финализировать `PROJECT_STATE` / `BUGS` / `DECISIONS` — V99 переедет в FIXED отдельной Chat-сессией после визуальной приёмки.
