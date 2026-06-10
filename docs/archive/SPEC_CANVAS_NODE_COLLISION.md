> **Архивировано 27.05.2026 — консолидация docs/ (S4). СУПЕРСЕЖЕНО узлом B.** Свободных нод на канвасе нет (`DEC-V0.8.3-CANVAS-FINAL-MODEL`). Остаточный вопрос (наезд зон) — `BACKLOG.md` §Канвас-и-окна (follow-up).

# SPEC — Collision-resolve нод на canvas (анти-наезд)

**Тип:** B (фича среднего объёма). **Запрос:** Игорь 22.05.2026 — ноды на canvas не должны наезжать друг на друга; при добавлении/перемещении блок отталкивается на ближайшее свободное место. Распространяется на все ноды canvas (контейнеры, операции, сборки-блоки).
**Статус:** готова к реализации. Диагноз/проектирование — чтением `canvas-layout.js`, `useCanvasLayoutDrag.js`, `skeleton-state-canvas.js`, `CanvasLayoutView.jsx`, `index.jsx`, `use-tree-drop-target.js`.

---

## 0. Размеры затрагиваемых модулей

- `canvas/canvas-layout.js` — ~13 KB (под soft 20 для .js). **Дом для нового helper'а** — там уже живёт вся геометрия (`computeAutoJunctions`, `edgeAnchors`, `canvasContentExtent`, размерные константы). Места достаточно.
- `canvas/useCanvasLayoutDrag.js` — 12.61 KB (под лимитом). Drag-end wiring.
- `canvas/use-tree-drop-target.js` — 3.58 KB (под лимитом). Drop wiring.
- `CanvasSkeleton/index.jsx` — 12.59 KB (под лимитом). opAdd wiring (`onPickKind` в `CanvasArea`).
- `canvas/CanvasLayoutView.jsx` — 49.18 KB (**над hard 40**). Касание — ~4 строки wiring в `onSearchPick` + `onPickHoverOp`. Это тривиальная проводка, не новый блок функциональности; к тому же `SPEC_V99` net-удаляет ~25 строк из того же файла. Декомпозиция `CanvasLayoutView.jsx` остаётся отдельным `TECH_DEBT` — в эту спеку не входит.
- `store/skeleton-state-canvas.js` — 26.00 KB (**над hard 25**, TD-SKELETON-STATE-SIZE). **НЕ трогаем** — см. §2: collision-resolve делается view-side, редьюсеры позиций не правятся.

## 1. Где задача сядет

Новый pure-helper в `canvas-layout.js`. Wiring — в 4 точках размещения нод:
- `useCanvasLayoutDrag.js::onPointerUp` — конец drag'а (контейнер/операция/сборка-блок).
- `use-tree-drop-target.js` — drop entry из библиотеки на canvas (`ADD_CONTAINER_FROM_ENTRY`).
- `CanvasLayoutView.jsx::onSearchPick` — клик entry в search bar (после `SPEC_V99` — простой `addContainerFromEntry`).
- opAdd: `CanvasLayoutView.jsx::onPickHoverOp` + `index.jsx::CanvasArea.onPickKind`.

Редьюсеры (`ADD_CONTAINER_FROM_ENTRY`, `OP_ADD`, `SET_POSITION` и т.д.) **не меняются** — они уже принимают готовую `position`; helper подаёт им разрешённую позицию.

## 2. Контекст / проблема

При добавлении и перетаскивании ноды свободно ложатся на canvas, наезжают друг на друга (`ADD_CONTAINER_FROM_ENTRY` без позиции дефолтит на фикс. `{80,80}` → стопка; drop кладёт точно в точку броска; drag оставляет где бросили). Нагромождение мешает восприятию.

**Почему view-side, а не редьюсер.** Архитектурно «single source of truth» — редьюсер (он знает все позиции). Но `skeleton-state-canvas.js` (26 KB) над hard-лимитом — §2 запрещает дописывать в него функциональность, а collision в редьюсере = правка `ADD_CONTAINER_FROM_ENTRY` + `SET_POSITION` именно там. View-side путь этого избегает И **согласован с тем, как codebase уже считает позиции** — `onSearchPick`, `onPickKind`, `onPickHoverOp` все вычисляют координаты во вью и подают редьюсеру готовыми. Поэтому view-side — не обход, а консистентный выбор.

## 3. Стратегия

Чистый helper «найди ближайшее свободное место»: на каждой точке размещения ноды вью считает желаемую позицию (точка drop'а / дефолт / каскад), прогоняет через helper против bbox'ов остальных нод, подаёт редьюсеру разрешённую позицию.

**Loose-only.** Collision-resolve применяется к **loose-нодам** (вне zone). Ноды ВНУТРИ zone расставляет сам zone (lane-layout finalizer уже не даёт им пересекаться). Это закрывает «все ноды canvas» двумя механизмами без конфликта с zone-attach: loose → collision-resolve, in-zone → lane layout. Заодно снимает риск, что resolve выпихнет ноду из zone-фрейма, в который её только что притянули.

## 4. Архитектурные решения

1. **Helper в `canvas-layout.js`** (не новый файл) — геометрия живёт там же, файл под лимитом.
2. **`nodeRect(kind, position) → {x,y,w,h}`** — bbox по kind: `container` → `BLOCK_LINEAR_W×BLOCK_LINEAR_H` (240×150), `operation` → `OPERATION_NODE_W×OPERATION_NODE_H` (120×60), `assembly` → размер `AssemblyDraftBlock` (Code берёт фактический рендер-размер; если не вынесен в константу — вынести).
3. **`gatherObstacleRects(state, excludeId) → [{x,y,w,h}]`** — bbox'ы всех нод-препятствий: filled-контейнеры (`isPlaceholderContainer` исключить), операции, assembly-drafts с позицией. Исключить ноду `excludeId` (саму перемещаемую) и **in-zone ноды** (у кого `zoneId` присвоен / нода числится в zone — расставляются zone'ом, не препятствия для loose-resolve). Zone-фреймы препятствиями НЕ считаются.
4. **`resolveNodeOverlap(desired, size, obstacles, opts) → {x,y}`** — pure. Если bbox `desired` (с зазором `gap`) не пересекает ни один obstacle → вернуть `desired`. Иначе expanding-ring поиск: радиус от `step` вверх до `maxRadius`, на каждом радиусе кандидаты в фиксированном порядке направлений (детерминизм для тестов), первый непересекающийся (с зазором) — победитель, `x,y` клампятся ≥ 0. Ничего не найдено в `maxRadius` → вернуть `desired` без изменений (graceful, никаких зависаний).
5. **Зазор `gap`** — ноды не впритык: дефолт ~16 px дыхания между bbox'ами. Параметр `opts.gap`.
6. **`opts`:** `gap` (~16), `step` (~24), `maxRadius` (~1200). Значения — стартовые, Игорь тюнит.
7. **Применять только к loose-drop'ам.** В `onPointerUp` `findZoneAtPoint` уже вычисляет zone под точкой drop'а — если zone есть, resolve пропускается (zone сам расставит). Если loose — resolve.

## 5. Файлы / сигнатуры

**`canvas-layout.js`** — добавить три pure-функции (сигнатуры выше, §4 п.2–4). Без React, тестируемы изолированно.

**`useCanvasLayoutDrag.js::onPointerUp`** — в ветке `dragging.hasMoved`, для `kind ∈ {container, operation, assembly}`: если drop loose (нет target-zone — переиспользовать уже вычисленный `findZoneAtPoint`) → `gatherObstacleRects(state, dragging.id)` + `resolveNodeOverlap(droppedPos, nodeRect(kind,...).size, obstacles)` → вызвать существующий `setPosition` / `opSetPosition` / `setAssemblyDraftPosition` с разрешённой позицией. In-zone drop → resolve пропустить.

**`use-tree-drop-target.js`** — canvas-level drop (`ADD_CONTAINER_FROM_ENTRY`): прогнать drop-позицию через resolve до dispatch. Block-level drop (`FILL_PLACEHOLDER`) — позиция placeholder'а не меняется, не трогать.

**`CanvasLayoutView.jsx::onSearchPick`** (library-ветка, после `SPEC_V99`): `addContainerFromEntry(entry, position)` — `position` = resolve от дефолтного якоря.

**`CanvasLayoutView.jsx::onPickHoverOp`** + **`index.jsx::CanvasArea.onPickKind`** — позицию нового op прогнать через resolve.

Порядок относительно `SPEC_V99`: V99 и эта спека трогают `onSearchPick`. **V99 — первой** (она чистит ветку до 1 строки), эта — поверх (+`position` arg). Если ляжет наоборот — Code мерджит аккуратно.

## 6. Порядок выполнения

1. `canvas-layout.js` — `nodeRect`, `gatherObstacleRects`, `resolveNodeOverlap` + unit-тесты helper'ов.
2. `useCanvasLayoutDrag.js::onPointerUp` — drag-end resolve (loose-only).
3. `use-tree-drop-target.js` — drop resolve.
4. `onSearchPick` + `onPickHoverOp` + `index.jsx onPickKind` — add/op resolve.
5. Integration-тесты (§ ниже).
6. Полный Vitest + `vite build`.

## 7. Тесты

- **Unit `resolveNodeOverlap`:** (а) `desired` свободен → возвращается как есть; (б) `desired` поверх obstacle → результат не пересекает ни один obstacle, с зазором; (в) детерминизм — один вход даёт один выход; (г) `maxRadius` исчерпан → `desired` без зависания.
- **Unit `gatherObstacleRects`:** placeholder-контейнеры и in-zone ноды исключены; `excludeId` исключён.
- **Integration:** добавить два контейнера подряд кликом из search bar → их bbox'ы не пересекаются. Drop на занятое место → нода рядом, не поверх. Drag контейнера поверх другого и отпускание → отталкивается.
- **Регрессия:** drop в zone — нода остаётся в zone (resolve пропущен, lane layout расставляет). Полный Vitest + `vite build`.

## 8. Риски

- Drag-end resolve может «нудж'ить» ноду, которую биолог поставил намеренно впритык. Митигировано loose-only + zones-own-in-zone: для loose-нод небольшой сдвиг от наезда — это и есть запрошенное поведение; точная расстановка внутри группы — задача zone.
- View-side wiring: будущий новый путь размещения ноды, не прошедший через 4 точки, обойдёт resolve. Точек мало и они известны; митигация — helper в `canvas-layout.js` рядом с геометрией, легко подключить новому call-site.
- `CanvasLayoutView.jsx` над hard-лимитом — касание ~4 строки wiring, `SPEC_V99` из того же файла net-удаляет ~25; декомпозиция файла — отдельный TECH_DEBT.
- Ring-search worst-case — capped `maxRadius`; число нод на canvas невелико (десятки). Стоимость незначима.

## 9. Открытые вопросы

- Дефолтный якорь для клик-add (`onSearchPick`, курсор-позиции нет): фикс. `{80,80}` с последующим resolve (повторные клики веером уходят в свободное) или центр текущего вьюпорта. Рекомендую `{80,80}`+resolve — проще, детерминично.
- Значение `gap` (дыхание между нодами) — старт ~16 px, Игорь смотрит на приёмке и тюнит.

## 10. STOP

После реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md` (commit range, Vitest counters, build, size budget затронутых файлов). НЕ финализировать `PROJECT_STATE` / `DECISIONS` — фича принимается визуально отдельной Chat-сессией; решение о view-side подходе и loose-only фиксируется в `DECISIONS.md` Chat'ом при финализации.
