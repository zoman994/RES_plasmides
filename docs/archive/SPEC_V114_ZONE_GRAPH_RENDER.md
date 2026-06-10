# Sprint V114 — Layout-канвас: graph-рендер узлов зоны

**Тип:** feature (восстановление функциональности через переиспользование)
**База:** v0.8.3-alpha, working-tree, branch `feature/m-x-7a-library-structure-v2` (всё нескоммичено — коммит-хэша нет)
**Предпосылка:** живой тест Игоря 24.05.2026 — после «Реализовать как DAG» Layout-канвас выглядит пустым. Диагностика по коду (`BUGS.md` V114): `ZoneFrame` в graph-режиме рендерит только рамку + счётчик + `ZoneLaneDivider`; рендера узлов внутри зоны нет вообще. Ребилд Node B (`SPEC_CANVAS_NO_LOOSE_CONTAINERS.md`, 23.05) выпотрошил loose-node рендер канваса, а graph-режим зоны остался без рендерера содержимого.

> Шаблон из `docs/_TEMPLATE_SPEC.md`. Правила формата — `CHAT_PLAYBOOK.md` §2.

---

## 0. Срез размеров затрагиваемых модулей

`list_directory_with_sizes` на `gui/designer/src/components/CanvasSkeleton/canvas/` (24.05.2026):

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `canvas/ZoneFrame.jsx` | 9.56 KB | .jsx 40/30 | OK (большой запас) |
| `canvas/ZoneLayer.jsx` | 5.36 KB | .jsx 40/30 | OK |
| `canvas/CanvasGraphView.jsx` | 14.26 KB | .jsx 40/30 | OK (после извлечения — уменьшится) |
| `canvas/canvas-layout.js` | 18.55 KB | .js 25/20 | soft (warning — см. §9; правок не предполагается) |
| `canvas/ContainerBlock.jsx` | 13.33 KB | .jsx 40/30 | OK (не меняется — переиспользуется) |
| `canvas/OperationNode.jsx` | 7.65 KB | .jsx 40/30 | OK (не меняется — переиспользуется) |
| новый `canvas/ZoneGraphContent.jsx` | — | .jsx 40/30 | новый, ~6–8 KB ожидаемо |

Ни один файл в скоупе не в red zone. `canvas-layout.js` в soft-зоне (18.55 при soft 20) — но спека его **не правит** (только импортирует существующие функции), risk-bullet в §9 формальный.

---

## 0.1. Visual reference / Source of truth

> No visual reference, design — на усмотрение Code в рамках `docs/DESIGN_SYSTEM.md` tokens. Граф зоны должен визуально совпадать с тем, что DAG-вид (`CanvasGraphView`) уже рисует сейчас — те же `ContainerBlock`/`OperationNode`/SVG-рёбра. «Как на DAG-виде, но внутри рамки зоны» — это и есть эталон.

---

## 0.2. Component reuse audit

Граф-рендер для канваса **уже существует и работает** — это `CanvasGraphView.jsx` (DAG-вид). Он читает `state.containers`/`state.operations`, строит граф через `buildGraphNodesEdges`/`computeGraphPositions` (`canvas-layout.js`), рисует `ContainerBlock`/`OperationNode` + SVG-рёбра. Задача V114 — НЕ писать новый рендерер, а извлечь этот живой код в переиспользуемый компонент и подключить к зоне.

| Use | NOT use | Reason |
|-----|---------|--------|
| `canvas/CanvasGraphView.jsx` graph-рендер (живой, рисует DAG-вид сейчас) — извлекается в `ZoneGraphContent` | git-откат к до-Node-B `CanvasLayoutView` (loose-node 49 KB) | git-откат отклонён Игорём 24.05: все 8 спринтов нескоммичены в одной working-tree, `checkout` снёс бы весь стек + сегодняшние звенья |
| `canvas/canvas-layout.js::buildGraphNodesEdges` / `computeGraphPositions` / `getBlockSize` / `edgeAnchors` / `OPERATION_NODE_W/H` (чистые helpers) | писать свой layout/граф-обход | те же функции уже питают `CanvasGraphView` — DEC-OPS-03 |
| `canvas/ContainerBlock.jsx` / `canvas/OperationNode.jsx` (узловые компоненты) | новые узловые компоненты | те же блоки рисует DAG-вид; props известны (§4.3) |
| `lib/zone-model.js::nodeListInZone` (фильтр узлов по `zoneId`) | геометрический фильтр по `zone.bounds` | `nodeListInZone` — канонический фильтр по `node.zoneId`, T3 DEC-CANVAS-4T-07 |

Терминология: `CanvasGraphView` — **не** superseded UI. Это живой рендерер DAG-вида; V114 его не убивает, а делает его graph-ядро общим с зоной.

---

## 0.5. Kickoff-интервью

Полноценное kickoff-интервью не проводилось: задача — восстановление функциональности с задокументированным root cause (`BUGS.md` V114). Прямые ответы Игоря 24.05.2026, определившие направление (развилка ЗАКРЫТА — не переоткрывать):

- **Q:** что должен показывать Layout-канвас внутри зоны?
  **A:** «на лэйаут должны видеть все фрагменты и их взаимосвязи. Так же там должны быть карточки с визуальным отражением структуры блоков. Лэйаут сейчас приоритет и он должен работать».

- **Q:** откат до состояния живого Layout (git)?
  **A:** отклонено. Решение Игоря: не откат — «подключение уже живого рендерера к зоне». `CanvasGraphView` цел, все узловые компоненты на месте; «вернуть живой Layout = не откат, а переиспользование».

**Что не обсуждалось (стало assumption'ом — §5 / §10):** интерактив узлов в зоне (двойной клик → редактор, клик по op → пикер); авто-resize рамки зоны под размер графа; судьба `pieces` в graph-режиме зоны; судьба `ZoneLaneDivider` / T4.5 lane-layout.

---

## 1. Контекст

Симптом и корень — `BUGS.md` V114 (OPEN, высокий). Кратко: `realiseAssembly`/`handleAssemblyRealise` (`zone-pieces-to-dag.js` + `skeleton-state.js`) отрабатывает корректно — кладёт контейнеры/операции в `state.containers`/`state.operations` с `zoneId = draftId`. `nodeListInZone` их видит (счётчик «N узлов» в шапке зоны ненулевой, «Открыть сборку» работает). Но `ZoneFrame.jsx` в graph-режиме (`!isSequence`) внутри тела зоны рендерит только `<ZoneLaneDivider/>` — рендера самих узлов нет. Поэтому Layout выглядит пустым, а DAG-вид (`CanvasGraphView`) те же узлы показывает.

Это не баг realise и не Звено — отсутствующая функциональность (graph-режим зоны никогда не имел рендера узлов после ребилда Node B). Режим Спека. V114 затрагивает только рендер-слой; данные (realise-результат, `zoneId`-теги, `nodeListInZone`) корректны и не трогаются.

Смежное: `SPEC_CANVAS_NO_LOOSE_CONTAINERS.md` (узел B) §13 Q2 и его отчёт Code прямо отметили — «на визуальной приёмке проверить graph-режим зоны; если внутренний op-граф не рисуется — отдельный T4-долг». V114 и есть закрытие этого долга.

---

## 2. Стратегия

Извлекаем graph-ядро из `CanvasGraphView` в самостоятельный компонент `ZoneGraphContent` (узлы + рёбра, без canvas-specific обвязки), `CanvasGraphView` сразу переключается на него — так извлечённый компонент доказанно идентичен тому, что DAG-вид рисует сейчас, и его регрессию ловят существующие DAG-тесты. Затем `ZoneFrame` graph-mode body монтирует `ZoneGraphContent`, передав ему узлы зоны, отфильтрованные через `nodeListInZone`. Так Layout показывает граф сборки внутри рамки зоны, переиспользуя ровно тот рендерер, что уже работает — без нового кода и без git-отката.

---

## 3. Scope

### IN

- новый файл `canvas/ZoneGraphContent.jsx` — чистый граф-рендер: принимает массивы `containers`/`operations` + опциональные колбэки, строит граф через `buildGraphNodesEdges`/`computeGraphPositions`, рисует SVG-рёбра + `ContainerBlock`/`OperationNode`. Извлечение из `CanvasGraphView`.
- `canvas/CanvasGraphView.jsx` — graph-рендер (SVG-слой рёбер + `nodes.map`) заменяется на `<ZoneGraphContent>`; canvas-specific обвязка (drop-target, op-context-menu, OpKindPicker/OpPopupRouter, PlaceholderTreePicker) остаётся в `CanvasGraphView` и прокидывает колбэки в `ZoneGraphContent`.
- `canvas/ZoneFrame.jsx` — graph-mode body (`!isSequence`, `!collapsed`) монтирует `<ZoneGraphContent>` с узлами зоны из `nodeListInZone(state, zone.id)`; `<ZoneLaneDivider/>` из graph-mode убирается; body graph-mode получает `overflow:auto`.

### OUT (явно отложено)

- **`realiseAssembly` / `handleAssemblyRealise` / `zone-pieces-to-dag.js`** — НЕ трогать. realise корректен (создаёт узлы с `zoneId`); V114 — чисто рендер.
- **`applyZoneLayouts` / T4.5 lane-layout / `zonesReducer` / `skeleton-state.js`** — НЕ трогать. graph-режим зоны позиционирует узлы локальным dagre (`computeGraphPositions`), не из `state.positions` (§4.2).
- **`RealiseModal.jsx`** — НЕ трогать (диалог realise корректен).
- **sequence-режим зоны** (`ZoneSequenceMode`, `zone-sequence-mode/`) — вне V114, не трогать.
- **Рендер `pieces` в graph-режиме зоны** — OUT. realise создаёт containers+operations (не pieces); V114 показывает их. pieces 4-tier в graph-режиме зоны — §10 Q1, отдельная задача.
- **Авто-resize рамки зоны под граф** — OUT. V114 даёт `overflow:auto` в body; авто-подгон bounds — §10 Q2.
- V110 (нечитаемая раскладка DAG после realise — архитектурный), V51, V96–V109 — остаются OPEN, не в скоупе.
- Всё, что не в IN, не трогаем.

---

## 4. Архитектурные решения

1. **`ZoneGraphContent` — общий граф-рендер для DAG-вида и graph-режима зоны.** Один рендерер вместо двух (§17 — переиспользование). Извлекается из `CanvasGraphView` и сразу им же потребляется — гарантия, что компонент идентичен живому DAG-рендеру. `ZoneFrame` — второй потребитель.

2. **Позиции — локальный dagre `computeGraphPositions`, не `state.positions`.** `ZoneGraphContent` считает раскладку через `computeGraphPositions(containers, [], operations)` (dagre LR от (0,0)) — ровно как `CanvasGraphView` сейчас. `state.positions` и T4.5 `applyZoneLayouts` для graph-режима зоны не используются (граф самораскладывается). Это не регресс: `CanvasGraphView` так и работает. Координаты узлов — локальные внутри тела зоны.

3. **Узловые компоненты переиспользуются как есть.** `ContainerBlock` (props: `container`, `highlighted`, `onClick`, `onDoubleClick`, `onPlaceholderClick`, `dragOver`, `virtualState`, `pcrPrimers`, `pcrFlank`) и `OperationNode` (props: `operation`, `commit`, `highlighted`, `onClick`, `onContextMenu`) не меняются. `ZoneGraphContent` передаёт минимум: `container`/`operation` + `highlighted` + опц. колбэки.

4. **`ZoneGraphContent` интерактив — опциональные колбэки.** Компонент чистый: без колбэков узлы декоративны. `CanvasGraphView` передаёт свой набор (с op-пикерами); `ZoneFrame` — минимальный (двойной клик по контейнеру → редактор). Op-клик-пикеры внутри зоны для V114 не обязательны (§10 Q3).

5. **`ZoneLaneDivider` убирается из graph-mode body.** Это была заглушка-намёк на 3 полосы при отсутствии рендера узлов. С реальным графом через dagre divider не несёт смысла. T4.5 lane-layout для зон-сборок после Node B, вероятно, мёртв — но его удаление вне V114 (§10 Q4).

---

## 5. Предположения

- **`nodeListInZone(state, zoneId)` возвращает `{containers, pieces, operations}` фильтром по `node.zoneId`.** Источник: код `lib/zone-model.js`, прочитан 24.05. Проверено: да. realise помечает свои контейнеры/операции `zoneId` — `handleAssemblyRealise` в `skeleton-state.js`, прочитан 24.05.

- **`buildGraphNodesEdges`/`computeGraphPositions` принимают плоские массивы `(containers, commits, operations)` и не зависят от того, отфильтрованы ли они.** Источник: код `canvas-layout.js`, прочитан 24.05 — функции чистые, итерируют переданные массивы. Проверено: да. Передача отфильтрованных по зоне массивов корректна. `commits` на канвасе пуст (`state.commits` — legacy V1) — передаётся `[]`.

- **`CanvasGraphView` graph-рендер (SVG-слой + `nodes.map`) — самодостаточная секция, извлекаемая без побочных эффектов.** Источник: код `CanvasGraphView.jsx`, прочитан 24.05 — граф-рендер обособлен от drop-target/пикеров. Проверено: частично (статически). **Действие:** K1 после извлечения прогоняет существующие DAG-тесты (`skeleton-canvas-graph`, `canvas-layout-zones` и смежные) — регрессия там ловит расхождение.

- **`ZoneFrame` graph-mode body (`inset: HEADER_H 0 0 0`, `overflow:hidden`) — единственное место, где сейчас рисуется `ZoneLaneDivider`; туда же встанет `ZoneGraphContent`.** Источник: код `ZoneFrame.jsx`, прочитан 24.05. Проверено: да.

---

## 6. Задачи

### K1 — Извлечь `ZoneGraphContent` из `CanvasGraphView`

**Файлы:** новый `canvas/ZoneGraphContent.jsx`; правка `canvas/CanvasGraphView.jsx`.

**Что делаем:** выносим граф-ядро (SVG-слой рёбер + рендер узлов) в самостоятельный компонент; `CanvasGraphView` начинает его использовать.

**Сигнатура `ZoneGraphContent`:**
```
<ZoneGraphContent
  containers={Container[]}              // уже отфильтрованные вызывающим
  operations={Operation[]}              // уже отфильтрованные
  highlightedId={string|null}
  onContainerClick={(id) => void}            // опц.
  onContainerDoubleClick={(id) => void}      // опц.
  onOperationClick={(op, e) => void}         // опц.
  onOperationContextMenu={(op, e) => void}   // опц.
  onPlaceholderClick={(id) => void}          // опц.
/>
```
Логика:
1. `buildGraphNodesEdges(containers, [], operations)` → `{nodes, edges}`; `computeGraphPositions(containers, [], operations)` → `{[id]:{x,y}}`.
2. Внутренний relative-позиционированный контейнер размера по `bounds` графа (max узловой координаты + футпринт + паддинг — как `CanvasGraphView.bounds`).
3. SVG-слой рёбер: для каждого ребра — `edgeAnchors` по размерам узлов (`getBlockSize` / `OPERATION_NODE_W×H`), `<path>` + общий `<marker>` стрелки.
4. Узлы: `nodes.map` → absolute-divs; `kind==='container'` → `ContainerBlock`, `placeholder`-контейнеры скипаются (`isPlaceholderContainer`); `kind==='operation'` → `OperationNode`. Обёртка узла — `pointer-events:auto`; колбэки навешиваются только если переданы.
5. Пустой граф (`nodes.length===0`) → не падать, рендерить пусто (или мелкий хинт «сборка пуста»).

**Правка `CanvasGraphView`:** SVG-слой рёбер + `nodes.map` заменяются на `<ZoneGraphContent containers={state.containers} operations={state.operations} highlightedId={state.highlightedContainerId} ... />` с прокидыванием существующих колбэков (`onOperationClick`/`onOperationContextMenu`/`onPlaceholderClick`/двойной клик → `onOpenEditor`). drop-target, op-context-menu, `OpKindPicker`/`OpPopupRouter`, `PlaceholderTreePicker` остаются в `CanvasGraphView`.

**Тесты** (`__tests__/zone-graph-content.test.jsx`, новый, +4–5):
1. Happy path: containers+operations → рендерятся `skeleton-block-*` + `skeleton-op-node-*`, рёбер `<path>` ожидаемое число.
2. Placeholder-контейнер не рендерится.
3. Пустой граф → пусто, без падения.
4. Колбэк не передан → узел без обработчика (не падает на клике).
5. Регрессия DAG: существующие `skeleton-canvas-graph` / `canvas-layout-zones` остаются зелёными (DAG-вид рисует через `ZoneGraphContent` идентично).

### K2 — Подключить `ZoneGraphContent` к `ZoneFrame` graph-mode

**Файл:** `canvas/ZoneFrame.jsx`, тело зоны (блок `!collapsed` → `zone-body-*`, ветка `!isSequence`).

**Что делаем:** в graph-режиме рисуем граф зоны вместо `ZoneLaneDivider`.

Логика:
1. В graph-режиме (`!isSequence`) из `nodeListInZone(state, zone.id)` берём `containers` + `operations` (pieces — OUT, §10 Q1).
2. Монтируем `<ZoneGraphContent containers={...} operations={...} highlightedId={state.highlightedContainerId} onContainerDoubleClick={(id) => dispatch({type:'OPEN_EDITOR_VIEW_ONLY', containerId:id})} />` внутри тела зоны.
   - Точное имя action для двойного клика Code сверяет с `CanvasGraphView` (`actions.openEditorViewOnly`) — использовать тот же путь.
3. `<ZoneLaneDivider/>` из graph-mode body убирается.
4. graph-mode body: `pointer-events` остаётся `none` на самом body (клики фона проваливаются на канвас — DEC-T4-04), но обёртки узлов внутри `ZoneGraphContent` — `pointer-events:auto` (K1 шаг 4), так что узлы кликабельны. `overflow` body graph-mode → `auto` (граф крупнее рамки → доскролл; авто-resize bounds — §10 Q2).
5. `collapsed`-зона и sequence-режим — без изменений.

**Тесты** (`__tests__/zone-frame-graph-render.test.jsx` либо +в существующий `ZoneFrame`-тест, +3–4):
1. Зона в graph-режиме с 2 containers + 1 operation в `state` (помечены `zoneId`) → внутри `zone-frame-*` рендерятся `skeleton-block-*` + `skeleton-op-node-*`.
2. Узлы чужой зоны (другой `zoneId`) в эту рамку не попадают.
3. `ZoneLaneDivider` в graph-режиме больше не рендерится.
4. sequence-режим зоны не задет (`ZoneSequenceMode` на месте).
5. Регрессия: `ZoneFrame` header/counter/resize/collapse — зелёные.

---

## 7. Порядок и оценка

K1 → K2. Порядок фиксирован: K2 монтирует `ZoneGraphContent`, созданный в K1; K1 первым ещё и потому, что прогон DAG-тестов после извлечения доказывает корректность компонента до того, как его подключат к зоне.

Баланс: задача узкая (извлечение + одно подключение), переиспользует готовые helpers и узлы — один спринт.

---

## 8. STOP-условие и формат отчёта

### STOP

После commit K2 Code останавливается. **НЕ:** обновляет `PROJECT_STATE.md` / `RELEASES.md` / `DECISIONS.md` / `ANCHORS.md` / `BUGS.md`; не перемещает спеки в `docs/archive/`; не начинает следующий спринт; не трогает OPEN баги вне скоупа. Визуальная приёмка (realise → возврат на Layout → узлы видны внутри рамки зоны) — отдельная сессия Chat, не Code.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md` блок «Отчёт Code по Sprint V114»: коммиты K1/K2; изменения размеров (`CanvasGraphView.jsx`, `ZoneFrame.jsx`, новый `ZoneGraphContent.jsx` — KB + лимит OK/WARN/FAIL); новые файлы и +N тестов; Vitest N/N (baseline + ΔN); `vite build` clean/warnings/errors; отклонения от спеки (§3/§4/§6) явным списком или «нет»; size budget.

Без отчёта Chat не финализирует приёмку.

---

## 9. Риски

1. **Извлечение `ZoneGraphContent` ломает DAG-вид.** `CanvasGraphView` сейчас работает — регрессия недопустима. Митигация: K1 — после извлечения прогон существующих DAG-тестов (`skeleton-canvas-graph`, `canvas-layout-zones`); красный → расхождение видно сразу, до K2.

2. **Граф крупнее рамки зоны → узлы за кадром.** dagre-раскладка может выйти за `zone.bounds`. Митигация V114: `overflow:auto` в graph-mode body (доскролл). Полноценный авто-resize bounds — §10 Q2, отложен; для V114-приёмки доскролла достаточно.

3. **`canvas-layout.js` в soft-зоне (18.55 KB при soft 20).** Спека его НЕ правит — только импортирует функции. Если Code по какой-то причине вынужден туда писать и видит скачок к hard 25 — остановиться, запросить mini-spec. Ожидаемо: правок ноль.

4. **`pointer-events` конфликт.** body graph-mode — `none` (DEC-T4-04, клики фона на канвас), узлы — `auto`. Если узлы окажутся некликабельны — проверить, что `auto` стоит на обёртке узла внутри `ZoneGraphContent`, а не унаследован от body. Митигация: K1 шаг 4 явно фиксирует `pointer-events:auto` на node-обёртке.

---

## 10. Открытые вопросы

1. **`pieces` в graph-режиме зоны.** `nodeListInZone` возвращает и `pieces` (4-tier сущность). V114 рисует только containers+operations (realise создаёт их). Зона ДО realise содержит pieces — их граф-отображение в graph-режиме зоны не решено. Предполагаемый ответ: отдельная задача после V114; для закрытия V114 (realise-результат виден) containers+operations достаточно. Жду подтверждения Игоря, что pieces в graph-режиме зоны — не часть V114.

2. **Авто-resize рамки зоны под граф.** V114 даёт `overflow:auto`. Должна ли рамка зоны авто-расти под размер dagre-графа (как T4 bounds-финализатор растит под `state.positions`)? Это удобнее доскролла, но трогает `zonesReducer`/bounds-финализатор (OUT V114). Жду решения Игоря — отдельным мелким спрингтом или достаточно `overflow:auto`.

3. **Op-интерактив внутри зоны.** V114 даёт двойной клик по контейнеру → редактор. Нужен ли в graph-режиме зоны клик по операции → пикер метода / context-menu (как на DAG-виде)? Предполагаемый ответ: для V114 не обязателен (приоритет — видимость графа); если нужен — малое расширение (`ZoneGraphContent` уже принимает `onOperationClick`/`onOperationContextMenu`).

4. **Судьба `ZoneLaneDivider` и T4.5 lane-layout для зон-сборок.** V114 убирает `ZoneLaneDivider` из graph-mode body. T4.5 3-lane `applyZoneLayouts` после Node B, вероятно, не у дел для зон-сборок (граф самораскладывается через dagre). Полная зачистка T4.5 lane-кода — вне V114; отметить как кандидат на отдельный cleanup-таск / TD.
