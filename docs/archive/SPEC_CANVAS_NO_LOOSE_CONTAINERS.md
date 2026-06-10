# SPEC — Канвас: только зоны-сборки (удаление свободных контейнеров-нод)

**Тип:** B (UX + рендер-парадигма + декомпозиция over-limit файла).
**Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
**Реализует:** `DECISIONS.md` DEC-V0.8.3-CANVAS-FINAL-MODEL (разбор узла B, 23.05).
**Источник диагностики:** чтение кода 23.05.2026 — `CanvasSkeleton/index.jsx`, `canvas/CanvasLayoutView.jsx`, `canvas/ContainerBlock.jsx`; спеки `SPEC_PROJECT_CANVAS_CLEANUP.md`, `SPEC_ASSEMBLY_WORKFLOW_UX.md` (обе с блок-поправками 23.05).
**Цель одной фразой:** на канвасе верхнего уровня живут ТОЛЬКО зоны-сборки; свободного контейнера как ноды канваса нет.

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `canvas/CanvasLayoutView.jsx` | **49.35 KB** | .jsx hard 40 | **ВЫШЕ hard.** Удаление loose-рендеринга само сильно ужмёт файл; декомпозиция остатка — по §4 |
| `canvas/ContainerBlock.jsx` | 13.33 KB | .jsx 40/30 | рендерер loose-ноды — становится мёртвым для канваса (см. §5.4) |
| `canvas/useCanvasLayoutDrag.js` | 14.07 KB | .js 25/20 | drag/connect loose-нод — урезается |
| `canvas/use-tree-drop-target.js` | 4.28 KB | .js 25/20 | canvas-level drop → ADD_CONTAINER — урезается/удаляется |
| `store/skeleton-state-canvas.js` | 26.00 KB | .js hard 25 | **выше hard.** Удаление loose-add actions ужимает; Code сверяет итог |
| `canvas/PlaceholderTreePicker.jsx` | 20.31 KB | .jsx 40/30 | placeholder-picker — мёртвый (см. §5.3) |

`CanvasLayoutView.jsx` и `skeleton-state-canvas.js` — оба выше hard-лимита уже сейчас. Эта спека их **уменьшает** удалением; §4 — добор декомпозиции если после удаления всё ещё над лимитом.

---

## §1 Контекст / что сейчас (подтверждено чтением кода)

`CanvasLayoutView.jsx` рендерит на одном бесконечном полотне НЕСКОЛЬКО типов loose-нод:
- **Контейнеры** — `state.containers.map(...)` → `ContainerBlock` на абсолютных `state.positions[c.id]`. Placeholder-контейнеры уже скипаются (`isPlaceholderContainer(c) → return null`, AE-K9.6).
- **Операции** — `state.operations.map(...)` → `OperationNode` на `op.position`.
- **Джанкшены** — SVG-слой между контейнерами по `state.junctions`.
- **AssemblyDrafts** — `(state.assemblyDrafts||[]).filter(d=>d.position)` → `AssemblyDraftBlock`.
- **Virtual outputs** — `selectVirtualOutputs` → `ContainerBlock` (dimmed).
- **Зоны** — `ZoneLayer` (T4) — рамки-зоны под нодами.

Точки создания loose-контейнера:
- `onSearchPick` ветка `kind==='library'` → `addContainerFromEntry(entry, resolveLooseAdd(...))` — V99: кладёт контейнер loose (`zoneId:null`), без zone-wrap.
- Canvas-level drop — `useTreeDropTarget(containerRef)` → drop записи из библиотеки на полотно → `ADD_CONTAINER_FROM_ENTRY`.
- Block-level drop на placeholder → `fillPlaceholder` (placeholder'ы уже не рендерятся → путь практически мёртв).
- Empty-state `skeleton-canvas-empty`: «Перетащите запись из дерева сюда, чтобы добавить контейнер».
- `HoverOpIconRow` на ховере контейнера → `onPickHoverOp` → `opAdd` (операция из loose-контейнера).

DEC-V0.8.3-CANVAS-FINAL-MODEL: всё это — рудимент модели «контейнер свободно лежит на канвасе». Финальная модель — канвас держит только зоны-сборки.

---

## §2 Стратегия

Канвас верхнего уровня рендерит **только `ZoneLayer`** (+ канвас-хром: строка поиска, zoom, pan, Sanger-notebook). Все loose-ноды (контейнеры — headline; операции / джанкшены / assemblyDrafts / virtual outputs — связанные по парадигме, см. §3) перестают рендериться как standalone-блоки полотна. Операции/pieces/джанкшены сборки рендерятся ВНУТРИ зон (зона в graph-режиме — это и есть граф сборки, T4/T7). Точки создания loose-контейнера удаляются; клик/дроп записи из библиотеки ведёт в зону-сборку.

Удаление loose-рендеринга само ужимает `CanvasLayoutView` (большие блоки `.map`'ов уходят) — поэтому **порядок: сначала удаление, потом замер, потом добор декомпозиции** (§4).

---

## §3 Scope

### Scope IN
- Удаление рендера loose-контейнеров (`state.containers.map`→`ContainerBlock`), и связанных по парадигме loose-нод: операции / джанкшены / assemblyDrafts / virtual outputs как standalone-блоки полотна. **Причина связки:** op-wires тянутся к `state.positions[inputId]` контейнеров; убрав контейнеры, оставить op-wires = висящие в пустоту линии. Парадигма одна — убирается целиком.
- Удаление точек создания loose-контейнера: canvas-level drop, `onSearchPick` loose-add ветка, empty-state hint, placeholder-пути, `HoverOpIconRow` loose-op.
- Перенаправление: клик записи в `LibrarySearchBar` → в зону-сборку (§6).
- Декомпозиция `CanvasLayoutView.jsx` до < hard 40 KB (§4).
- Чистка ставших мёртвыми actions в `skeleton-state-canvas.js` (loose-add / fill-placeholder).
- Тесты.

### Scope OUT
- **Полная реализация `+ Плазмида` entry-point** (range-picker, snippet-каталог) — это `SPEC_ASSEMBLY_WORKFLOW_UX.md` K5, отдельный спринт M-CANVAS-WORKFLOW-UX. Здесь — только перенаправление в зону, не богатый picker.
- **Данные контейнеров.** Контейнеры НЕ удаляются — они живут в библиотеке/проекте (`libraryEntries`, `state.containers`). Удаляется только их рендер-как-ноды и канвас-позиции. НЕ вайп данных (в отличие от узла A).
- **Внутренний рендер зоны** (что зона graph-режима показывает внутри) — `ZoneLayer`/T4, не трогаем; если зона уже рендерит свой граф — хорошо, если нет — это T4-долг, отдельно (§13 Q2).
- `ContainerBlock.jsx` / `PlaceholderTreePicker.jsx` как файлы — НЕ удалять (могут переиспользоваться внутри зон); открепить от mount, оставить орфанами (паттерн PC-K K1/K5).
- 3-lane laneLayout (T4.5) — заморожен (DEC-V0.8.3-CANVAS-FINAL-MODEL caveat).

---

## §4 Декомпозиция `CanvasLayoutView.jsx`

Файл 49.35 KB, над hard 40. Порядок:
1. Сначала §5 (удаление loose-рендеринга) — уходят крупные блоки: `state.containers.map`, junction SVG-слой, op-wires SVG-слой, `state.operations.map`, assemblyDrafts, virtualOutputs, связанные модалки (op context menu, OpKindPicker, OpPopupRouter, OpRhombusTemplatePicker, PlaceholderTreePicker mount). Это десятки процентов файла.
2. **Замер** после удаления. Если < 40 KB hard (вероятно — да, с большим запасом) — декомпозиция не нужна, зафиксировать размер в отчёте.
3. Если всё ещё над лимитом — extract канвас-хром (zoom-контролы + pan-логика `onCanvasPointerDown/Move/Up` + wheel-zoom effect) в `canvas/CanvasViewport.jsx` (~8-10 KB). Это связный, самодостаточный кусок.

Декомпозиция — следствие удаления, не самоцель. Не плодить sub-файлы сверх необходимого (§2 п.0 ANCHORS — extract пока не landed под лимит).

---

## §5 Удаление loose-рендеринга — по блокам `CanvasLayoutView.jsx`

### 5.1 Контейнеры (headline)
Удалить блок `state.containers.map((c) => {...})` целиком — wrapper-div, `ContainerBlock`, pin-badge, `HoverOpIconRow`, block-drop хендлеры. `blockDragOver`/`hoverBlockId` state и `onBlock*`/`onPickHoverOp` колбэки — удалить.

### 5.2 Операции + джанкшены + wires
Удалить: `state.operations.map`→`OperationNode` блок; op-wires SVG (`skeleton-op-wires-svg`); op-wire-preview (`connecting`); junction SVG-слой (`skeleton-junctions-svg`) + `JunctionPopover` + `junctionPicker` state. Op context menu / `OpKindPicker` / `OpPopupRouter` / `OpRhombusTemplatePicker` mounts + их state (`openPicker/openPopup/opContextMenu/opTemplatePicker`) — удалить с верхнего уровня канваса (эти UI переезжают внутрь зоны-сборки — уже частично так, AE-K9).

### 5.3 AssemblyDrafts + virtual + placeholder
- `assemblyDrafts.filter(d=>d.position)`→`AssemblyDraftBlock` — удалить (drafts мигрированы в зоны, T6 DEC-T6-03).
- `virtualOutputs.map` → удалить с верхнего уровня (virtual product — внутри зоны).
- `PlaceholderTreePicker` mount + `pickerForId`/`onPlaceholderClick`/`onPickerPick` — удалить (placeholder'ы уже не рендерятся).

### 5.4 Empty-state + drop
- Блок `skeleton-canvas-empty` — переписать: вместо «Перетащите запись из дерева сюда, чтобы добавить контейнер» → текст про сборки, например «Канвас пуст. Создайте сборку — кнопка + Сборка, или выберите молекулу в поиске сверху». Строки — `STRINGS`.
- `useTreeDropTarget(containerRef)` + `dropHandlers` (canvas-level drop) — удалить: канвас не принимает drop записи (нет loose-контейнера). `use-tree-drop-target.js` — если больше нигде не используется, открепить.

### 5.5 useCanvasLayoutDrag
Hook урезается: drag/connect loose-контейнеров и операций больше не нужен. Остаётся pan (если pan-логика там) и drag зон (если зоны двигаются через него) — Code сверяет, что hook оставляет только зоно-релевантное. `ContainerBlock`/`OperationNode` остаются файлами-орфанами для переиспользования внутри зон.

### 5.6 Что канвас оставляет
`ZoneLayer` (зоны), `LibrarySearchBar` (строка поиска), zoom-контролы, pan, `SangerLabNotebook`, extent-shim. Всё.

---

## §6 Перенаправление entry-points записи библиотеки

`onSearchPick` (`CanvasLayoutView`) — ветки переписываются:
- `kind==='library'` — **НЕ** `addContainerFromEntry` loose. Вместо: молекула должна попасть в зону-сборку. Минимальный путь этой спеки — открыть/создать зону-сборку и передать запись как стартовую (см. ниже контракт). Богатый range-picker — `SPEC_ASSEMBLY_WORKFLOW_UX.md` K5, не здесь.
- `kind==='zone'` — оставить (`openEditorAssemblyTab(id)`).
- `kind==='container'` (запись «На канвасе») — секция «На канвасе» теряет смысл (нет нод на канвасе). Секцию `canvas-containers` из `extraSections` убрать. `kind==='container'` ветку убрать.
- `kind==='primer'` — оставить как есть (no-op).

**Контракт перенаправления `kind==='library'` (Code реализует, сверив зонные actions):**
Есть активная зона-сборка (`state.focusedZoneId` указывает на зону) → добавить запись как source-piece в эту зону. Активной зоны нет → создать зону-сборку (`buildAssemblyZoneAction`, как «+ Сборка») + добавить запись как первый source-piece + открыть редактор (`openEditorAssemblyTab`).
«Добавить запись как source-piece в зону» — Code использует существующий зонный write-путь (кандидаты — `zone-assembly-write-adapter.js`, action создания piece c `kind:'sourced'`/`sourceIds`/`zoneId`; Code сверяет точный action по `skeleton-state-zones.js`/`skeleton-state-pieces.js`). Если готового действия «entry → source-piece зоны» нет — это **главный риск** (§12 R1): тогда минимальная версия = открыть/создать зону БЕЗ загрузки молекулы, а загрузка остаётся на ASSEMBLY_WORKFLOW_UX K5; выбор — за Code по факту наличия action, с пометкой в отчёте.

Canvas-level drop (§5.4) — удалён; drag из `LibrarySearchBar` в зону (если нужен) — отдельный паттерн, не в этой спеке.

---

## §7 Существующие контейнеры на канвасах (миграция)

После удаления loose-рендеринга контейнеры с `zoneId:null` и записи в `state.positions` перестают где-либо показываться. Это **не потеря данных** — контейнеры остаются в `state.containers` / библиотеке.

- `state.positions` для loose-контейнеров — становится мёртвым полем. Чистить не обязательно (безвредно), но Code может занулить при hydrate ради гигиены — на усмотрение, отметить в отчёте.
- Контейнеры с `zoneId` — остаются, рендерятся внутри зон.
- **Вайпа нет** (в отличие от узла A — там вайпались несовместимые по форме праймеры). Здесь форма данных не меняется — меняется только рендер. Снапшоты грузятся как есть.
- Если на старом снапшоте были важные loose-контейнеры — биолог найдёт их в библиотеке/проекте (поиск). Это согласовано моделью (DEC-V0.8.3-CANVAS-FINAL-MODEL: «посмотреть» — библиотека / правый клик).

---

## §8 Тесты

- `CanvasLayoutView` с непустым `state.containers` (loose, `zoneId:null`) — `ContainerBlock`-блоки НЕ рендерятся (`skeleton-block-wrap-*` отсутствуют).
- `state.operations` непустой — `OperationNode` на верхнем уровне канваса НЕ рендерятся; op-wires SVG отсутствует.
- `ZoneLayer` рендерится; зоны на канвасе видны.
- `onSearchPick` `kind:'library'` — НЕ создаёт loose-контейнер; открывает/создаёт зону (по контракту §6). Тест на оба ветвления (есть focusedZone / нет).
- Empty-state — новый текст про сборки, без «перетащите из дерева».
- Canvas-level drop записи — не создаёт контейнер (хендлеры сняты).
- Регрессия: «+ Сборка» по-прежнему создаёт зону и открывает редактор; полный Vitest зелёный; существующие тесты на loose-рендеринг — удалить/переписать (их предмет упразднён), зафиксировать в отчёте.
- Размер `CanvasLayoutView.jsx` после удаления < 40 KB (или § 4 п.3 extract применён).

---

## §9 Порядок выполнения

1. §5 — удалить loose-рендеринг (контейнеры → операции/джанкшены/wires → drafts/virtual/placeholder → empty-state/drop → урезать `useCanvasLayoutDrag`).
2. §6 — переписать `onSearchPick`, убрать секцию `canvas-containers`.
3. §4 — замерить `CanvasLayoutView.jsx`; если над hard 40 — extract `CanvasViewport.jsx`.
4. `skeleton-state-canvas.js` — открепить/удалить ставшие мёртвыми actions (loose-add, fill-placeholder); замерить (был над hard 25).
5. Тесты (§8) + чистка/переписывание тестов на упразднённый рендер. Полный Vitest + `vite build`.

---

## §10 STOP-условие и формат отчёта

После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в `CURRENT_TASK.md`: размеры `CanvasLayoutView.jsx` / `skeleton-state-canvas.js` после правок (под лимитами или нет); был ли extract `CanvasViewport`; какой вариант §6 выбран (полное перенаправление в зону vs минимальное «открыть зону без загрузки» — и почему); список открепленных орфан-файлов; Vitest counters; `vite build`; spec deviations. Координационные файлы Code не финализирует. Визуальная приёмка (канвас показывает только зоны; клик записи ведёт в сборку) — отдельная сессия.

---

## §11 Запрещённые зоны для Code

- `ContainerBlock.jsx`, `OperationNode.jsx`, `PlaceholderTreePicker.jsx` как файлы — НЕ удалять, только открепить mount (орфаны для переиспользования внутри зон).
- `ZoneLayer.jsx` / зонный рендер (T4) — НЕ трогать в этой спеке.
- `SPEC_ASSEMBLY_WORKFLOW_UX.md` scope (range-picker, snippet-каталог) — не реализовывать здесь.
- Координационные файлы (`CLAUDE/BUGS/CURRENT_TASK/PROJECT_STATE/DECISIONS/TECH_DEBT/COMPONENT_MAP/CHAT_PLAYBOOK`), спеки в `docs/`.
- Данные контейнеров (`state.containers`, `libraryEntries`) — не вайпать (§7).

---

## §12 Риски

- **R1 — нет готового action «entry → source-piece зоны».** Главный риск §6. Митигация: Code сверяет `skeleton-state-zones.js`/`skeleton-state-pieces.js`/`zone-assembly-write-adapter.js`; если action есть — полное перенаправление; если нет — минимальная версия (открыть/создать зону без авто-загрузки молекулы, загрузка → ASSEMBLY_WORKFLOW_UX K5), зафиксировать выбор в отчёте. Спеку это не блокирует — обе версии корректны по модели.
- **R2 — зона в graph-режиме не рендерит свой внутренний граф (операции/pieces).** Если T4 `ZoneLayer` не показывает op-граф внутри зоны, то после удаления loose-операций граф сборки временно невидим в graph-режиме. Митигация: проверить `ZoneLayer` перед удалением §5.2; если внутренний рендер отсутствует — это T4-долг, поднять отдельным пунктом (§13 Q2), НЕ блокировать удаление loose-контейнеров (sequence-режим зоны strip-ом работает независимо).
- **R3 — `CanvasLayoutView` остаётся над 40 KB после удаления.** Маловероятно (удаляются крупные блоки), но если — §4 п.3 extract `CanvasViewport`.
- **R4 — `skeleton-state-canvas.js` (26 KB, над hard 25) не уходит под лимит после чистки loose-actions.** Митигация: замерить; если над — отдельный TD-таск на декомпозицию редьюсера (не блокирует эту спеку, отметить в отчёте).
- **R5 — снятые тесты loose-рендеринга.** Ожидаемо — их предмет упразднён. Переписать/удалить, перечислить в отчёте.

---

## §13 Открытые вопросы

1. **Текст пустого канваса** (§5.4) — финальная формулировка. Дефолт в спеке — рабочий; Игорь правит тривиально.
2. **Зона graph-режима — внутренний граф.** Рендерит ли `ZoneLayer` op-граф внутри зоны? Если нет — нужен отдельный T4-таск «зона показывает свой граф сборки». Code проверяет при R2; если долг есть — Chat заводит TD-запись. Не входит в эту спеку.
3. **Loose-операции с живым использованием.** AE-K9 убрал standalone «+ Операция»; новые операции зоно-связаны. Если на снапшотах есть legacy loose-операции с данными — после удаления рендера они невидимы (как и loose-контейнеры, §7) — данные целы, доступ через зону после привязки. Если Code найдёт, что loose-операции реально используются вне зон — флаг в отчёт, обсудим.

---

## §14 Что закрывает / связь

- Реализует `DECISIONS.md` **DEC-V0.8.3-CANVAS-FINAL-MODEL** — превращает решение в живой код.
- Снимает рудимент, помеченный в блок-поправках `SPEC_PROJECT_CANVAS_CLEANUP.md` (п.1/п.2 поправки 23.05) и `SPEC_ASSEMBLY_WORKFLOW_UX.md` (п.2 поправки 23.05).
- Закрывает по существу **WT-UX-10** (мутная навигация «Дерево↔Канвас») — дерева-как-вида нет, канвас = доска зон, библиотека = поиск; навигационная развилка растворяется.
- **Не закрывает:** `SPEC_ASSEMBLY_WORKFLOW_UX.md` (полный workflow сборки — отдельный спринт M-CANVAS-WORKFLOW-UX); loose-операции как отдельная тема (§13 Q3); внутренний граф зоны (§13 Q2).
- Кандидат-⚓ DEC-V0.8.3-CANVAS-FINAL-MODEL промотируется в ANCHORS после визуальной приёмки этой спеки + живучести.
