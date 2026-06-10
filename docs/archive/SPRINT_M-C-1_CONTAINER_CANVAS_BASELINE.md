> **Архивировано 27.05.2026 — консолидация docs/ (S4). СУПЕРСЕЖЕНО.** DAG-as-primary заменён Canvas-as-primary (four-tier T-серия, `ARCHITECTURE.md §1.6`). Учтено в `BACKLOG.md` §Канвас-и-окна.

# SPRINT_M-C-1_CONTAINER_CANVAS_BASELINE.md

> **Статус:** 🟡 Спека готова к визуальной приёмке.
> **Тип:** B (новый workflow + новые компоненты).
> **Целевая версия:** v0.9.0.
> **Парный спринт:** M-C.2 (Container Window read-only) — отдельная сессия после acceptance.

---

## §0. Размеры затрагиваемых модулей

`list_directory_with_sizes` показал: ни одного файла в hard / soft зоне в скоупе M-C.1.

| Зона | Состояние | Действие |
|------|-----------|----------|
| `components/flow/` (8 файлов, max 9.73 KB) | green | **Read-only reference** на ProjectFlowCanvas / PlasmidNode / FlowEdges patterns. Новые компоненты в `components/Dag/`, не extend. |
| `components/Library/tree/` (LibraryTree 38.31 KB soft) | soft warn (под hard 40 KB) | **Reuse строительных блоков** (`LibraryGroupHeader`, `LibraryItemRow`, `useCatalogSources`). LibraryTree.jsx сама не trogается. |
| `store/projectSlice.js` (15.62 KB green) | green | **Точечное расширение +2-3 KB** → итого ~18 KB, под hard 25 KB с запасом. |

K1 декомпозиции не требуется. Hard violations LibrarySingleInspector / AnnotationTrack / SequenceView/index — вне зоны M-C.1.

---

## §1. Контекст

После v0.8.0 (DEC-IMP-06 ⚓ Library = primary workspace) биолог имеет полноценный Library. Через K8 quick-add containerId пинается в `Project.containerIds[]` (`addContainerToCurrentProject` уже landed). Но M-X.5 явно отложил визуализацию — комментарий в `projectSlice.js`: «Actual DAG node visualisation lands in **M-C/M-D**».

В текущем состоянии биолог в проекте видит либо start screen, либо placeholder при непустых containerIds — **negde эти containers не становятся видимыми объектами с position и связями**. ARCHITECTURE_v2 §1.6 + §3.3 фиксирует **DAG = корневой view** как ⚓; baseline DAG canvas — обязательная инфраструктура для M-C.2 / M-D / M-E / M-G.

**v0.5 baseline.** В `components/flow/` живёт работающий ProjectFlowCanvas (9.72 KB) — ReactFlow + 5 node types + 3 edge types + MIRO+ + dagre + drag-drop. Концептуально работает; визуал и data wiring v0.5 (parts/flowNodes/flowEdges/assemblies). Под v0.6 wipe (DEC-V2-08 ⚓): код read-only reference, не extend. Биолог решил **отложить cleanup-спринты** (M-X.6 / NCBI / decomp) и идти сразу на M-C — пользовательский value > чистота кода.

---

## §2. Стратегия

Берём **архитектурный pattern** v0.5 ProjectFlowCanvas (ReactFlow + dagre + drag-drop + minimap), визуал и data wiring пишем с нуля под v0.6 модель. Минимальный baseline: только PlasmidNode + единый neutral edge; reactions / MIRO+ / stage indicators отложены (M-G). Палетка слева — read-only browse subset LibraryTree (sticky search + 4 группы + click→preview drawer + drag-source), без folder creation / file import / dropzone (импорт через Library workspace, отдельный entry). Drill-in placeholder при double-click — минимальный fullscreen «← Назад + container name + В разработке» (real fullscreen — M-C.2).

---

## §3. Scope

### IN

1. **Новый fullscreen `dag` route** в canvasSlice. При open-project биолог попадает на DAG canvas автоматически (existing `state.canvas.activeFullscreen = 'dag'` в projectSlice.openProjectFromIndexedDB).
2. **DagCanvas компонент** — ReactFlow + новый PlasmidNode + NeutralEdge + drag-drop из палетки + click-select + double-click drill-in + Backspace/Delete на selected node + auto-layout LR (dagre) + viewport persist в Project.dag (см. §4 DEC-MC1-04).
3. **PlasmidNode компонент** — M-D-style карточка ~280×220 px с **embedded PlasmidMiniMap** + name + length + topology + до 4 region badges с feature-palette A+v2 цветами + ReactFlow handles target/source.
4. **NeutralEdge компонент** — solid line `--text-secondary`, single edge type для всего M-C.1.
5. **DagPalette компонент** — split-pane left ~280 px, sticky search, 4 группы (Mine → Canvas → Demo → Snapgene), click row → PreviewDrawer, drag handle ⋮⋮ → react-dnd source `'DAG_ADD'`. Persistent group-state `pvcs-dag-palette-group-{key}` в localStorage (отдельно от Library workspace ключей).
6. **PreviewDrawer компонент** — slide-in overlay 340 px справа от палетки, PlasmidMiniMap 180×180 + metadata + region list + кнопки «Добавить на canvas» / «Закрыть». Закрывается на Esc / click outside / drag start.
7. **Project.dag schema extension** — `dag: { positions: { [containerId]: {x,y} }, edges: [{id, from, to}], viewport: {x,y,zoom} }`. Migrate-on-load для legacy projects.
8. **projectSlice actions:** `setDagPositions`, `addDagEdge`, `removeDagEdge`, `setDagViewport`, `removeContainerFromProject`. Расширение `addContainerToCurrentProject(id, position?)` без breaking changes.
9. **Drag-from-palette → drop-on-canvas** через react-dnd. Drop handler вызывает `addContainerToCurrentProject(libraryEntryId, screenToFlowPosition({x,y}))`. Двойной drop того же id → toast «Уже добавлено» + lift highlight на existing node.
10. **Empty state** на пустом DAG: центрированная подсказка «Перетащите плазмиду из библиотеки» + CTA-link «Открыть библиотеку для импорта» (push fullscreen `library`).
11. **Drill-in placeholder fullscreen** при double-click PlasmidNode: новый route `'containerWindow'` в canvasSlice + минимальный stub компонент «← Назад + название контейнера + M-C.2 — В разработке».

### OUT (явно отложено)

- Reactions (mix / pcr / digest / clone) — M-G. Single neutral edge только.
- MIRO+ hover-handle dropdown — Q3 в CURRENT_TASK, сырая для baseline.
- Stage column indicators — Q6, зависят от commit.rank semantics, M-I.
- Multi-select / box-select — single click only. M-I polish.
- Undo/Redo для DAG операций — M-D вместе с container undo.
- Side-panel список контейнеров (drawer left) — M-I polish.
- Container Window real implementation — M-C.2.
- Read-only ProjectCommit click → Mix Workspace — M-E + M-G.
- DAG export PNG/JSON — v0.5 функционал, не приоритет в baseline.
- Tag-filter overlay на canvas — M-I polish.

---

## §4. Архитектурные решения

**DEC-MC1-01 — PlasmidNode = M-D-style карточка с embedded PlasmidMiniMap, не v0.5-compact.** Карточка ~280×220 px: top — `PlasmidMiniMap` 200×140 inline-mode (DEC-DS-02 feature palette A+v2), под ним title (truncate), meta line (length kb · topology icon ○/—), до 4 region badges + `+N` chip. Border `--border-default` 1.5 px, `--radius-md`, `--shadow-sm`. Selected: `--accent-500` 2 px + `--shadow-focus`. Hover: `--shadow-md`. ReactFlow handles target/source. **Обоснование:** v0.5-compact card требует 2 клика до preview — против «two-click max» principle (CLAUDE.md). Embedded mini-map даёт глянс с первого взгляда на DAG с 5-20 узлами.

**DEC-MC1-02 — NeutralEdge = single edge type M-C.1, supersedes 3 typed edges v0.5.** Один компонент `NeutralEdge` (BaseEdge с smoothStepPath), stroke `--text-secondary`, width 1.5 px, без markers/dasharray. Default edge type в ReactFlow `edgeTypes = { neutral: NeutralEdge }`. Все edges создаются через `onConnect` с `type: 'neutral'`. v0.5 typed edges (template/product/fragment) семантически принадлежат reactions, в M-C.1 OUT. M-G позже добавит typed edges автоматически когда reaction node вставится. **Обоснование:** Q5 в CURRENT_TASK.

**DEC-MC1-03 — DagPalette = read-only browse subset LibraryTree, не extend LibraryTree.** Новый компонент `<DagPalette>` в `components/Dag/Palette/` собран из reuse'нутых блоков: `useCatalogSources` (data layer, identical), `LibraryGroupHeader`, `LibraryItemRow`. Persistent group-state — отдельные localStorage ключи `pvcs-dag-palette-group-{key}` (биолог хочет разные expanded states между палеткой и Library workspace). **Без:** folder tree (`renderFolderNodes`), folder/file creation, dropzone, paste textarea, full flat search overlay. Sticky search + light filter — да. **Обоснование:** Q2 в CURRENT_TASK. LibraryTree эволюционирует в полноценный Library editor; palette только browse + drag-source.

**DEC-MC1-04 — Project.dag schema extension в существующем projectSlice, без новых slice.** `Project` объект расширяется `dag: { positions: { [containerId]: {x,y} }, edges: [{id,from,to}], viewport: {x,y,zoom} }`. Migrate-on-load для legacy projects через `ensureDagShape(project)` lazy в селекторах. **Обоснование:** альтернативы рассмотрены — (a) новый containerSlice с full MoleculeContainer (DEC-V2-01 ⚓ полная модель) — premature, перепрыгивает в M-D territory + требует data migration LibraryEntry→MoleculeContainer; (b) отдельный flowSlice — distance от source-of-truth (Project.containerIds), создаёт двойную bookkeeping. Pragmatic — расширить Project (root entity, у него уже containerIds + projectCommitIds + primerIds). M-D позже мигрирует containerIds → containerSlice MoleculeContainer entities, dag.positions/edges переедут на сами entities — non-breaking ровно потому что в M-C.1 они на Project.

**DEC-MC1-05 — Container Window placeholder через canvasSlice.pushFullscreen, не имитация будущего UI.** Новый fullscreen route `'containerWindow'` в canvasSlice + `<ContainerWindowPlaceholder>` (~3 KB) — `← Назад` + название контейнера (lookup `libraryEntries[containerId]`) + центрированный текст «M-C.2 Container Window — В разработке». **Обоснование:** Q4 в CURRENT_TASK. Без реального M-C.2 спека полноценный fullscreen wireframe — спекулятивный, anti-pattern «эстетика подменяет функцию» (CHAT_PLAYBOOK §6 антипаттерн 7). Placeholder validates stack-навигацию (push + ← Назад работают), что критично для M-C.2.

---

## §5. Файлы / helpers / тесты

### Новые файлы (M-C.1)

| Файл | Размер | Описание |
|------|--------|----------|
| `components/Dag/DagCanvas.jsx` | ~10 KB | Root DAG fullscreen. ReactFlow + nodeTypes + edgeTypes + drag-drop wrapper + auto-layout button + empty state + viewport persist. |
| `components/Dag/PlasmidNode.jsx` | ~12 KB | M-D-style карточка с embedded PlasmidMiniMap. memo'd. ReactFlow handles. Click → highlight, double-click → push containerWindow. |
| `components/Dag/NeutralEdge.jsx` | ~1 KB | BaseEdge wrapper smooth-step solid neutral color. |
| `components/Dag/Palette/DagPalette.jsx` | ~10 KB | Split-pane left, 4 группы, sticky search. Reuse useCatalogSources + LibraryGroupHeader + LibraryItemRow. |
| `components/Dag/Palette/DagPaletteItemRow.jsx` | ~3 KB | Wrapper над LibraryItemRow с DAG-specific drag source `'DAG_ADD'` + click → onPreview. |
| `components/Dag/PreviewDrawer.jsx` | ~7 KB | Slide-in overlay 340 px. PlasmidMiniMap 180×180 + metadata + region list + add-to-canvas / close CTAs. |
| `components/Dag/ContainerWindowPlaceholder.jsx` | ~3 KB | ← Назад + name + «M-C.2 — В разработке». |
| `lib/dag-layout.js` | ~3 KB | dagre wrapper LR direction. `computeAutoLayout(nodes, edges) → { [id]: {x,y} }`. |

### Изменения существующих файлов

| Файл | Дельта | Изменения |
|------|--------|-----------|
| `store/projectSlice.js` | +2-3 KB → ~18 KB | Расширение `addContainerToCurrentProject(id, position?)`. Новые actions: `setDagPositions / addDagEdge / removeDagEdge / setDagViewport / removeContainerFromProject`. Helper `ensureDagShape`. |
| `store/canvasSlice.js` | +0.5 KB → ~3.5 KB | Route `'containerWindow'` в FULLSCREENS. |
| `App.jsx` (root layout) | +0.5 KB | Switch case `'dag'` → `<DagCanvas>`, case `'containerWindow'` → `<ContainerWindowPlaceholder>`. |
| `lib/strings.js` | +1 KB | Namespace `STRINGS.dag`: empty-state, palette labels, drawer CTAs, drill-in placeholder. EN + RU mirror (DEC-MA2-01). |

### Тесты (Vitest)

Целевой охват: ~25-35 новых тестов. Code определит точное число.

**2-3 характерных:**

1. `DagCanvas.test.jsx::drop from palette adds node and persists position`
   - Setup: project с пустым containerIds + libraryEntry. Render DagCanvas + DagPalette. Simulate react-dnd drop с payload `{libraryEntryId: 'lib-1'}` в координаты `(200, 150)`. Assert `Project.containerIds === ['lib-1']` + `Project.dag.positions['lib-1']` ≈ `{x: 200, y: 150}`.

2. `PlasmidNode.test.jsx::renders M-D-style card with embedded PlasmidMiniMap and region badges`
   - Mount с pUC19 fixture + 8 регионов. Assert PlasmidMiniMap rendered (test-id). Assert title `pUC19`. Assert ≥4 region badges visible. Assert `+N` chip если регионов больше 4.

3. `projectSlice.dag.test.js::ensureDagShape adds dag field to legacy project + setDagPositions persists через autosave`
   - Setup: project без `dag`. Call `ensureDagShape(project)`. Assert empty dag shape. Then setDagPositions('c-1', {x:100,y:200}). Wait autosave delay → assert `putProject` called.

**Плюс ~25-30 вариаций по паттерну:** double drop same id → toast, drag handle ⋮⋮ starts react-dnd с `'DAG_ADD'` mime, palette renders 4 groups в правильном порядке, PreviewDrawer Esc/click-outside/add-to-canvas, NeutralEdge renders solid neutral line, ContainerWindowPlaceholder ← Назад pops stack, auto-layout button computes positions, viewport persist round-trip, Backspace на selected node удаляет dag.positions + связанные edges, empty state CTA-link → library fullscreen, etc.

**Регрессия-guards:** existing `addContainerToCurrentProject` без position продолжает работать (legacy callsites M-X.5 K8). librarySlice / LibraryTree / Library workspace tests — без изменений.

---

## §6. Порядок выполнения

K-step plan, тип B спринт. K1 foundation → K2 canvas+node → K3 палетка+drawer → K4 drill-in → K5 polish.

| K | Артефакт | Тесты |
|---|----------|-------|
| **K1 — projectSlice.dag + dag-layout** | extension projectSlice (5 actions + ensureDagShape) + `lib/dag-layout.js`. | +5-7 unit tests |
| **K2 — DagCanvas + PlasmidNode + NeutralEdge** | Empty state + drag-drop wiring + auto-layout button + viewport persist. Палетка mock через test dnd source. | +8-10 component tests |
| **K3 — DagPalette + PreviewDrawer** | 4 группы + sticky search + drag-source + click→preview + Esc / click-outside / add-to-canvas. | +7-9 component tests |
| **K4 — ContainerWindowPlaceholder + canvasSlice route** | New fullscreen route + double-click handler в PlasmidNode. | +3-5 integration tests |
| **K5 — STRINGS namespace + edge cases** | `STRINGS.dag` (EN+RU), empty-state CTA-link, toast «Уже добавлено», Backspace/Delete на node + edge. | +3-5 tests |

**STOP-условие в каждом K:** Code останавливается после commits + green tests перед следующим K.

---

## §7. STOP и формат отчёта

### STOP

После K1-K5 commits Code останавливается:

> «K1-K5 landed на ветке `feature/m-c-1-baseline`. Финальные счётчики: Vitest XXX passing, pytest 112/112 passing. Build clean. Жду визуальной приёмки M-C.1 — не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT.»

### Формат отчёта (Code обновит CURRENT_TASK)

- Коммит-хэши по каждому K-step (5 hashes).
- Финальные счётчики тестов (Vitest + pytest) + build status.
- **Отклонения от спеки** — явный блок «Что отличается от §3-§5», с конкретными расхождениями (даже мелкими — split K на 2 коммита, drawer auto-close behavior tweaked, и т.д.).
- **Размеры новых файлов** + дельта `projectSlice.js`.
- Если есть hard violation — явный flag с предложением декомпозиции в M-X.6 / M-X.7.

---

## §8. Риски

1. **PlasmidMiniMap embedded в node может тормозить ReactFlow при ~20 узлах** — каждая mini-map это рендерящийся SVG с feature arcs. **Митигация:** `React.memo` на PlasmidNode (как v0.5 уже есть) + `contain: paint` CSS hint. Если perf проблема — fallback на topology-icon-only при >20 узлах (toast «много нод — превью свёрнуто»).

2. **react-dnd drag-source из палетки конфликтует с ReactFlow native pan** — оба используют pointer events. **Митигация:** drag handle ⋮⋮ ограничивает drag только handle, не всю строку (как v0.5 LibraryItemRow). ReactFlow получает pointer events на не-handle area.

3. **Project.dag shape migration на legacy projects может ломать селекторы.** **Митигация:** `ensureDagShape` lazy в селекторах + write-on-mutate. Все DAG selectors начинаются с `const dag = project.dag ?? DEFAULT_DAG`. Test на legacy project fixture → DAG canvas рендерится без crash.

4. **PlasmidMiniMap 24.95 KB остаётся в TD-SIZE-PLASMID-MINI-MAP soft watch — M-C.1 трогает через embedding.** **Митигация:** M-C.1 НЕ extend PlasmidMiniMap (use as-is через props). Если в K3 потребуются новые props — strict минимум через TD-pencil-mark в Code report. Real decomp — отдельно, не в M-C.1.

---

## §9. Открытые вопросы

1. **Auto-layout direction: LR vs TB.** Спека предлагает LR (старшие nodes слева, новые справа — естественно для temporal flow). Альтернатива: TB (компактнее на широких canvas, Benchling pattern). Решение в Code либо при визуальной приёмке — оба легко пробуются (один параметр `rankdir` в dagre).

2. **Drop fallback позиция при «Добавить на canvas» из preview drawer** (без drag). Спека: центр текущего viewport. Альтернатива: следующая свободная клетка по grid (требует pathfind). Pragmatic — viewport center; если несколько items добавляются в одну позицию, биолог раздвигает мышкой.

3. **Multi-port handles vs single-port на PlasmidNode.** v0.5 single target/source — достаточно для neutral container-to-container. M-G enhance до multi-port если потребуется (non-breaking — single port подмножество multi-port). M-C.1 single port явно.

---

**Дата:** 07.05.2026 (милестоун-сессия M-C.1 wireframe planning после v0.8.0 finalization).
**Авторы:** Игорь Синельников (Q1-Q6 решения, направление) + Claude Chat (формализация).
**Версия документа:** 1.0 — initial.

_Связанные документы: `ARCHITECTURE_v2.md` §1.6 + §3.3 + §6 (slices) + §8 (reuse), `DESIGN_SYSTEM.md` §2.1 colors + §4.1 ContainerNode, `ANCHORS.md` (DEC-V2-01..27, DEC-IMP-06, DEC-LIB-10..17, DEC-DS-01..02), `gui/designer/src/components/flow/` (read-only reference), `gui/designer/src/components/Library/tree/LibraryTree.jsx` (palette pattern source, не extend)._
