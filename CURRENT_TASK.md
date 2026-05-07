# CURRENT_TASK.md

## Sprint M-C.1 Container Canvas Baseline — реализация

**Статус:** 🟢 Спека визуально принята 07.05.2026. K1-K5 готовы к реализации Code.
**Тип:** B (новый workflow + новые компоненты).
**Целевая версия:** v0.9.0.
**Спека:** `docs/SPRINT_M-C-1_CONTAINER_CANVAS_BASELINE.md` (20.99 KB).
**Парный спринт:** M-C.2 Container Window real implementation — отдельная сессия после M-C.1 acceptance.

---

## TL;DR

После v0.8.0 (Library = primary workspace) `Project.containerIds[]` пинаются в проект через K8 quick-add, но визуально нигде не отображаются. M-C.1 даёт первый user-facing функционал v0.6 за пределами Library: project-level DAG canvas с draggable палеткой слева, PlasmidNode карточками с embedded PlasmidMiniMap, single neutral edge, double-click drill-in placeholder. Reactions / MIRO+ / typed edges / multi-select / undo — OUT (M-G/M-D/M-I).

Архитектурный pattern из v0.5 `components/flow/` (ReactFlow + dagre + react-dnd + minimap) — read-only reference, не extend. Новые компоненты в `components/Dag/`. Project.dag schema extension в существующем projectSlice (DEC-MC1-04). Container Window — placeholder через canvasSlice route, не имитация UI (DEC-MC1-05).

---

## Порядок чтения перед началом

1. **CLAUDE.md** — корневые правила.
2. **BUGS.md** — текущий OPEN (после v0.8.0 пуст; убедиться что не появилось).
3. **CURRENT_TASK.md** — этот файл.
4. **PROJECT_STATE.md** — first-line + последняя запись журнала (drift check).
5. **docs/SPRINT_M-C-1_CONTAINER_CANVAS_BASELINE.md** — главный документ. Читать целиком, особенно §3 (Scope IN/OUT), §4 (DEC-MC1-01..05), §5 (файлы / helpers / тесты), §8 (риски).

**Targeted reading при работе** (не читать на старте, подгружать по K):

- K1: `store/projectSlice.js`, `store/canvasSlice.js`.
- K2: `components/flow/ProjectFlowCanvas.jsx`, `components/flow/PlasmidNode.jsx`, `components/flow/FlowEdges.jsx` (read-only reference); `components/Library/PlasmidMiniMap.jsx` (для embedding).
- K3: `components/Library/tree/LibraryTree.jsx`, `LibraryGroupHeader.jsx`, `LibraryItemRow.jsx`, `hooks/useCatalogSources.js` (reuse строительных блоков).
- K4: `App.jsx` (root layout switch), `store/canvasSlice.js`.
- K5: `lib/strings.js` (расширение namespace).

Не читать ARCHITECTURE_v2.md / ANCHORS.md / DESIGN_SYSTEM.md целиком — спека самодостаточна. Если возникает развилка которой нет в спеке — STOP и спросить у Игоря.

---

## Чеклист K-step

### K1 — projectSlice.dag + dag-layout

- [ ] `lib/dag-layout.js` (~3 KB): `computeAutoLayout(nodes, edges, direction='LR') → { [id]: {x,y} }` через dagre. Default LR (см. спека §9 — TB альтернатива пробуется при приёмке).
- [ ] Helper `ensureDagShape(project)` в projectSlice — lazy migration legacy projects: добавляет `dag: { positions: {}, edges: [], viewport: {x:0,y:0,zoom:1} }` если отсутствует.
- [ ] Расширение `addContainerToCurrentProject(libraryEntryId, position?)` — без breaking changes для existing M-X.5 K8 callsites (position optional).
- [ ] Новые actions: `setDagPositions(positions)`, `addDagEdge({from,to})`, `removeDagEdge(id)`, `setDagViewport({x,y,zoom})`, `removeContainerFromProject(id)` (последний удаляет + связанные dag entries + edges).
- [ ] **Тесты:** +5-7 unit `__tests__/store/projectSlice.dag.test.js`. Включить: ensureDagShape на legacy fixture, setDagPositions персистится через autosave (mock putProject), removeContainerFromProject убирает edges связанные с node.
- [ ] **Регрессия-guard:** existing `addContainerToCurrentProject` без position продолжает работать. Все librarySlice / Library workspace тесты — green.

**Артефакты K1:** `lib/dag-layout.js` (~3 KB новый) + `store/projectSlice.js` (~15.62 → ~18 KB, +2-3 KB).

### K2 — DagCanvas + PlasmidNode + NeutralEdge

- [ ] `components/Dag/DagCanvas.jsx` (~10 KB): ReactFlow + nodeTypes + edgeTypes + drag-drop drop target (`'DAG_ADD'`) + auto-layout button + empty state («Перетащите плазмиду из библиотеки» + CTA-link на library fullscreen) + viewport persist через `setDagViewport` debounced.
- [ ] `components/Dag/PlasmidNode.jsx` (~12 KB): M-D-style карточка ~280×220 px (DEC-MC1-01). Top — embedded `<PlasmidMiniMap>` 200×140 inline через props (НЕ extend). Под ним: title (truncate), meta line (length kb · topology icon ○/—), до 4 region badges с feature-palette A+v2 + `+N` chip. Border / radius / shadow токены DESIGN_SYSTEM. Selected: `--accent-500` 2 px + `--shadow-focus`. Hover: `--shadow-md`. ReactFlow handles target/source single port. `React.memo` обязательно. Click → select. Double-click → `pushFullscreen('containerWindow', {containerId})`.
- [ ] `components/Dag/NeutralEdge.jsx` (~1 KB): BaseEdge smoothStepPath, stroke `--text-secondary`, width 1.5 px, без markers. Default edge type через `edgeTypes = { neutral: NeutralEdge }`. `onConnect` создаёт edge с `type:'neutral'`.
- [ ] Drop handler: `screenToFlowPosition({x,y})` → `addContainerToCurrentProject(libraryEntryId, position)`. Двойной drop того же id → toast «Уже добавлено» + lift highlight на existing node (animate `--accent-500` glow 600 ms).
- [ ] Backspace/Delete на selected node → `removeContainerFromProject(id)` (с подтверждением через `window.confirm` или toast undo — Code определит UX в рамках playbook §2 sanity).
- [ ] **Тесты:** +8-10 component `__tests__/components/Dag/DagCanvas.test.jsx` + `PlasmidNode.test.jsx`. Характерные: drop from palette adds node + persists position; PlasmidNode renders embedded mini-map + ≥4 region badges; double drop same id → toast + highlight; double-click → pushes containerWindow route; auto-layout button computes LR positions через dag-layout.

**Артефакты K2:** 3 новых файла в `components/Dag/` (~23 KB суммарно).

### K3 — DagPalette + PreviewDrawer

- [ ] `components/Dag/Palette/DagPalette.jsx` (~10 KB): split-pane left ~280 px. Reuse `useCatalogSources` (data identical Library) + `LibraryGroupHeader` + `LibraryItemRow`. 4 группы в порядке: «Этот проект» → «Учебные / demo» → «Моя библиотека» → «Каталог SnapGene». Sticky search field наверху (length-pattern `>5kb` / `<2k` / `2k-3k` + name match). **Без:** folder tree, folder/file creation, dropzone, paste textarea, full flat search overlay. Persistent group-state localStorage `pvcs-dag-palette-group-{key}` (отдельные ключи от Library workspace).
- [ ] `components/Dag/Palette/DagPaletteItemRow.jsx` (~3 KB): wrapper над `LibraryItemRow`. Drag handle ⋮⋮ → react-dnd source `'DAG_ADD'` payload `{libraryEntryId}`. Click row → `onPreview(entry)`. Drag source ограничен handle (не вся строка) — Risk #2 в спеке.
- [ ] `components/Dag/PreviewDrawer.jsx` (~7 KB): slide-in overlay 340 px справа от палетки. Содержимое: PlasmidMiniMap 180×180 + metadata (name, length, topology, feature count) + region list (max 8 с `+N more`) + кнопки «Добавить на canvas» / «Закрыть». Закрывается на: Esc, click outside, drag start, успешный «Добавить на canvas». «Добавить на canvas» из drawer (без drag) → drop в центр текущего viewport (Q2 спека §9).
- [ ] **Тесты:** +7-9 component `__tests__/components/Dag/Palette/`. Характерные: 4 группы в правильном порядке, sticky search с length-pattern фильтрацией, drag handle ⋮⋮ initiates `'DAG_ADD'`, click row opens drawer, Esc closes drawer, «Добавить на canvas» из drawer drop'ает в viewport center.

**Артефакты K3:** 3 новых файла в `components/Dag/Palette/` + `components/Dag/PreviewDrawer.jsx` (~20 KB суммарно).

### K4 — ContainerWindowPlaceholder + canvasSlice route

- [ ] `store/canvasSlice.js`: добавить route `'containerWindow'` в FULLSCREENS (+~0.5 KB).
- [ ] `components/Dag/ContainerWindowPlaceholder.jsx` (~3 KB): `← Назад` button (popFullscreen) + название контейнера (lookup `libraryEntries[containerId]`) + центрированный текст «M-C.2 Container Window — В разработке». Стили DESIGN_SYSTEM tokens.
- [ ] `App.jsx` (root layout): switch case `'dag'` → `<DagCanvas>`, case `'containerWindow'` → `<ContainerWindowPlaceholder containerId={fullscreen.payload.containerId}/>`.
- [ ] При open-project в projectSlice.openProjectFromIndexedDB — `state.canvas.activeFullscreen = 'dag'` (биолог попадает на DAG canvas автоматически).
- [ ] **Тесты:** +3-5 integration. Характерные: double-click PlasmidNode → containerWindow в stack, `← Назад` pops back на dag, open-project автоматически открывает dag fullscreen.

**Артефакты K4:** 1 новый файл `ContainerWindowPlaceholder.jsx` + дельта `canvasSlice.js` / `App.jsx` (~4 KB суммарно).

### K5 — STRINGS namespace + edge cases

- [ ] `lib/strings.js`: namespace `STRINGS.dag` — empty-state, palette labels (4 группы), sticky search placeholder, drawer CTAs, drill-in placeholder, toast «Уже добавлено», auto-layout button label, undo confirmation. EN + RU mirror (DEC-MA2-01).
- [ ] Toast «Уже добавлено» при двойном drop same containerId (visual lift на existing node).
- [ ] Backspace / Delete на selected edge → removeDagEdge.
- [ ] Полировка empty state, hover/focus states, prefers-reduced-motion для slide-in drawer.
- [ ] **Тесты:** +3-5. Характерные: STRINGS.dag доступны в EN + RU, toast triggers на дубль, Delete на edge удаляет.

**Артефакты K5:** дельта `lib/strings.js` (+~1 KB) + edge polish across K2-K4 файлов.

---

## STOP-условие

После K1-K5 commits Code останавливается на ветке `feature/m-c-1-baseline`:

> «K1-K5 landed. Финальные счётчики: Vitest XXX passing, pytest 112/112 passing. Build clean. Жду визуальной приёмки M-C.1 — не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT.»

**Не финализировать:**
- PROJECT_STATE.md (журнал сессии + first-line).
- RELEASES.md.
- DECISIONS.md (DEC-MC1-01..05 уже в спеке, promotion в DECISIONS только после acceptance).
- ANCHORS.md (никаких ⚓ promotions без явного запроса Игоря).
- TECH_DEBT.md (новые TD только если Code обнаружил соответствующие в процессе).
- BUGS.md (только если найден existing bug — добавить в OPEN, не закрывать ничего).

---

## Формат отчёта Code в конце сессии

В конце реализации Code дописывает в этот CURRENT_TASK.md секцию «Отчёт K1-K5»:

1. **Коммит-хэши** по каждому K-step (5 hashes).
2. **Финальные счётчики:** Vitest passing/total, pytest 112/112, build status, PWA precache size delta.
3. **Размеры новых файлов** (точные KB) + дельта `projectSlice.js` / `canvasSlice.js` / `lib/strings.js`.
4. **Отклонения от спеки** — явный блок «Что отличается от §3-§5 спеки», конкретно: split K на под-коммиты, drawer auto-close behavior tweaks, edge polish решения, mismatch размеров файлов от targets, и т.д. Не «всё по спеке» — конкретные расхождения.
5. **Hard violation flag** — если хоть один файл влез в hard зону (40 KB .jsx / 25 KB .js) — явный red flag с предложением декомпозиции в M-X.6 / M-X.7.
6. **TD-pencil-marks** — если в K3 пришлось добавить новые props в `PlasmidMiniMap` (Risk #4) — флаг с цитатой изменений.

---

## Что делать при регрессии

Если в любом K-step ломаются existing тесты (librarySlice / Library workspace / Importer / Annotator):

1. STOP коммита, не пушить.
2. Проверить задели ли regression-guard зону: `addContainerToCurrentProject` без position (legacy callsites M-X.5 K8 quick-add) — должен работать как раньше.
3. Если регрессия в проекте, который Code не считает зоной M-C.1 (например Annotator / SequenceView / Library tree) — вернуться в CURRENT_TASK и зафлагать это Игорю отдельным сообщением, не «починю по ходу». Скорее всего митигация — изоляция нового кода через ensureDagShape lazy + `?? DEFAULT_DAG` defensive в селекторах.
4. Регрессия legacy projects (без `dag` field) при load — Risk #3 в спеке. Митигация в K1: `ensureDagShape` lazy + write-on-mutate. Test fixture legacy project обязателен.

---

## Контекст-бюджет реализации

Code-сессия M-C.1 K1-K5 — обычная реализационная сессия не milestone-планировочная. Бюджет ~50 KB на старте: CLAUDE.md + BUGS.md + CURRENT_TASK.md + PROJECT_STATE.md first-line + спека M-C.1 (20.99 KB) ≈ 45 KB. Targeted reading подгружается по K (см. «Порядок чтения»).

Compact между K3 и K4 не нужен (K4 = 1 файл). Compact обязателен после K1-K5 commit + STOP — приёмка идёт в свежей сессии.

---

## Что не делается в M-C.1 (явно отложено)

- Reactions / typed edges / mix / pcr / digest / clone — M-G.
- MIRO+ hover-handle dropdown — Q3, сырая для baseline.
- Stage column indicators — M-I, зависят от commit.rank.
- Multi-select / box-select / undo для DAG операций — M-D + M-I.
- Side-panel список контейнеров (drawer left) — M-I polish.
- **Container Window real implementation — M-C.2.**
- DAG export PNG/JSON — v0.5 функционал, не приоритет.
- Tag-filter overlay на canvas — M-I polish.
- M-X.6 cleanup, NCBI integration, AnnotationTrack decomposition — отложены биологом, post-M-C.

---

**Дата:** 07.05.2026 (визуальная приёмка спеки + K-step plan для Code).
**Спека source-of-truth:** `docs/SPRINT_M-C-1_CONTAINER_CANVAS_BASELINE.md`.
