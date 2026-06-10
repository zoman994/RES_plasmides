# SPRINT_M-CANVAS-SKELETON.md — скелет всей Canvas-модели (mock-everywhere)

> **Тип:** A (архитектурный mock-скелет). Размер спеки 40-55 KB.
> **Версия:** v1, 11.05.2026.
> **Цель:** Игорь должен **увидеть всю Canvas-модель живьём** — Canvas (Layout + Graph) + Tree (3 раздела) + Контейнер-редактор (multi-tab + multi-draft pills) + 4 operations (ПЦР / Restriction / Мутагенез / Gibson) с pre-baked 5 containers и 6 primers. Всё mock-everywhere, in-memory state, изолированный route `/canvas-skeleton`. Существующий `/canvas-prototype` мержится в `/canvas-skeleton`.
> **Что НЕ в скоупе:** real store write, persistence через `← Назад`, cross-project clone, real primer-design для не-ПЦР operations, «+ Сборка» / «+ Контейнер» жесты на canvas, cascade-layout, system-tabs. Всё out-of-scope перечислено в §4.

---

## 1. Контекст

В M-Canvas v0.1 макетной сессии 11.05.2026 закрепили модель: Canvas (Layout/Graph) + Tree + Контейнер-редактор. На текстовых обсуждениях договорились о persistent multi-tab editor с pill-переключателем draft sessions, immutable model (операция → новый контейнер), Tree-3-разделах (Итоги / Материалы / Праймеры).

Code 11.05.2026 реализовал узкий B-прототип контейнер-редактора по `SPRINT_M-CANVAS-PROTOTYPE-PCR.md` — PCR flow внутри одного редактора, через изолированный route `/canvas-prototype`. Прототип работает (К1-К5 done), PCR flow от selection до product tab корректен. Но Игорь на визуальной приёмке 11.05.2026: «функционала 0, мы могли понять как он выглядит без визуальной приёмки». Корень проблемы — без Canvas и Tree рядом контейнер-редактор в вакууме не отвечает на вопрос «работает ли модель».

Эта спека закрывает корень. Делаем **скелет всей UI-парадигмы** одновременно: все три инструмента живьём с pre-baked 5 containers + 6 primers + 4 operations + 2 pre-loaded draft sessions. Цель — Игорь открывает `/canvas-skeleton`, видит реалистичную картину проекта со связями, кликает по блокам, переключает Layout/Graph, открывает редактор, переключается между draft sessions, запускает operations, видит как растёт canvas от commit'ов. После этого можно говорить «работает ли модель».

**Признание классификационного косяка:** изначально надо было идти типом A. Игорь явно сказал «слишком большая задача» — это сигнал A, не B. Три раунда обсуждения было потрачено на оборону B-формата. Спека этой ошибки не повторяет.

---

## 2. Где задача сядет (§17 R4)

**Existing компоненты которые скелет использует:**

- `components/SequenceView/` (~330 KB) — universal viewer, без правок. Все existing tracks/overlays/popups/hooks сохранены. Скелет передаёт стандартный `fragments` shape (DEC-SQV-07). **Расширение Plasmid Map mode (§5 K6)** — новый track в `tracks/`, не модификация существующих.
- `local-primer-design.js` (~20 KB) — для ПЦР operation (already integrated в `/canvas-prototype`). Остальные operations используют mock primers.
- `components/PlasmidMiniMap.jsx` (~30 KB) — основа Plasmid Map mode (Пункт 7 CANVAS_MODEL.md). Extend до interactive (selection capable + caret sync).
- `components/ContainerEditorPrototype/` — существующий prototype, **мержится** в новый скелет (§5 K1).
- `lib/strings.js` — namespace `canvasSkeleton` для всех UI-строк (расширение существующего `prototypeCanvas`).
- `Toast/` — для mock-commit feedback.
- `@xyflow/react` (existing dep в `Dag/`) — для Graph view canvas (auto-layout dagre LR).
- `react-dnd` (existing dep) — для drag-to-position в Layout view.

**Что не задеваем (явные guard'ы):**

- `App.jsx` — добавление одного route, минимальная правка (как и в B-прототипе).
- `librarySlice` / `projectSlice` / `uiSlice` (кроме одного флага open/close скелета) — НЕ задеваются. Всё state в local React внутри скелета.
- `SequenceView/` core — не модифицируем кроме одной optional callback prop (`onSelectionChange` если ещё нет — Code проверит).
- Production routes / production sidebar / Library / DAG — никаких изменений.
- Algorithm core (mutagenesis.js, restriction-db.js, golden-gate.js, и др.) — используется только `local-primer-design.js` для ПЦР; остальные operations получают mock-products из fixture'а.

**Карта дублей (§17 R1):**

- Новая папка `components/CanvasSkeleton/` — не конфликтует с existing.
- `Dag/ContainerWindowPlaceholder.jsx` — на kill (M-C.1 K4 заглушка), не трогаем; скелет даёт прообраз того что заменит этот placeholder в production.
- `Dag/DagCanvas.jsx` + `DagPalette.jsx` — harvest для Graph view (см. K5). Не модифицируем оригинальные файлы, форкаем нужное.
- `flow/ProjectFlowCanvas` — Этап 3 kill, не трогаем.

**Кто ссылается на затрагиваемое:**
- На `SequenceView/` — 4 context'а (Importer / Library Inspector / Annotator / `/canvas-prototype`). Опциональный prop `onSelectionChange` симметричен existing `onCaretChange` / `onLocate` — не ломает context'ы.
- На `PlasmidMiniMap.jsx` — catalog tiles, Inspector rows, SessionSummary, MetaColumn. Если Plasmid Map mode требует правки оригинала — НЕ правим, создаём `PlasmidMapInteractive.jsx` рядом, расширяя оригинал композицией.

**Что может сломаться:**

- `SequenceView/` если соблазн «маленькой правки» — снова 4 context'а. Гарантия: не правим, только extend через новые tracks composition.
- Vitest baseline 1764/1765 — должен оставаться зелёным. Новые tests добавляются в `__tests__/canvas-skeleton/`.
- Build: `npx vite build` clean. Новая папка ~80-100 KB кода, размер bundle вырастет — не критично для dev-only route.

---

## 3. Стратегия

**Mock-everywhere, изолированный route, in-memory state.** Все 5 pre-baked containers + 6 primers + 2 draft sessions hard-coded в `fixture-canvas-skeleton.js`. Любые операции (ПЦР / Restriction / Мутагенез / Gibson) при commit'е создают новый container в local state скелета, появляется на canvas + в Tree (если соответствующий раздел) — биолог видит как растёт DAG. `← Назад` — навигация назад без persistence (state сбрасывается на следующий open).

**Три инструмента — три зоны скелета:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Назад   Canvas-скелет   [Layout / Graph]                               │ ← header + toggle
├──────────────┬───────────────────────────────────────────────────────────┤
│ Tree         │ Canvas (Layout view OR Graph view)                       │
│ - ⭐ Итоги   │                                                           │
│ - 📥 Матер.. │ pre-baked 5 containers как draggable / auto-layout blocks│
│ - 🔬 Прайм..│                                                           │
│              │ click block → highlight                                  │
│ click → high.│ dbl-click block → открывается КОНТЕЙНЕР-РЕДАКТОР (overlay)│
└──────────────┴───────────────────────────────────────────────────────────┘
        ↓ dbl-click container
┌──────────────────────────────────────────────────────────────────────────┐
│ Контейнер-редактор (overlay над Canvas)                                  │
│                                                                          │
│ [📋 PCR draft]  [🧬 Gibson draft]   ← pre-loaded 2 pills (multi-draft)   │
│ [Template: pUC19]                    ← tabs внутри active session        │
│ [ПЦР] [Restriction] [Мутагенез] [Gibson]   ← operations toolbar          │
│ SequenceView                                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Single source of truth — local Zustand-like store внутри скелета.** Не используется global zustand. Используется React useReducer или mini-store из 4-5 actions: `getContainers / getPrimers / commitOperation / setActivePill / setActiveTab / setEditorOpen`. Это даёт реактивность без задевания global state.

**Изоляция:** удаление скелета = снос папки `components/CanvasSkeleton/` + откат строк в App.jsx + откат строк в `lib/strings.js`. Один коммит revert. Existing `components/ContainerEditorPrototype/` мержится в скелет на K1 (его файлы переезжают как часть скелета, route `/canvas-prototype` удаляется в пользу `/canvas-skeleton`).

---

## 4. Scope IN / OUT

**IN (детально):**

### 4.1 Canvas (Layout + Graph view)

- **Layout view** — 5 pre-baked containers расставлены по pre-baked positions (см. fixture §6). Drag-to-position работает (react-dnd), positions сохраняются в local state до session reset.
- **Graph view** — те же 5 containers + 3 operations (PCR / Cut / Gibson из fixture provenance) как ромбы между ними. Auto-layout dagre LR (harvest из `Dag/DagCanvas.jsx`). Read-only визуализация связей. Bipartite разделение: materials прямоугольники, operations ромбы.
- **Layout / Graph toggle** — control в header canvas. Переключение мгновенное. Layout positions persist в local state (не теряются при toggle); Graph auto-relayout каждый раз.
- **Container blocks** — circular (★) рендерятся как круглые иконки с PlasmidMiniMap внутри + name + length; linear (Материал) — прямоугольные bars с feature-bar + name + length. Click → highlight. Дабл-клик → редактор overlay.
- **Operations nodes (Graph view)** — ромбы с типом операции (PCR / Cut / Gibson), input/output рёбра к containers. Click → highlight связанных containers. Дабл-клик — пока ничего (placeholder для будущих макетов).

### 4.2 Tree (Library-сайдбар)

- **3 раздела по DEC-CANVAS-06**: `⭐ Итоги` (плоский список circular), `📥 Материалы` (linear с expandable children inline), `🔬 Праймеры` (плоский список primer-pool).
- Derived из fixture'а по правилу Пункт 5 CANVAS_MODEL: `topology.circular → Итоги, else → Материалы`.
- В Материалах — children-expansion. Pre-baked структура: pUC19_lacZ_amplicon и pUC19_BamHI_digest_5kb рендерятся как children от pUC19, но pUC19 показан только в Итогах (не дублируется). Linear-цепочки терминируются: pUC19_BamHI_digest_5kb имеет терминатор `→ собрано в pUC19_INS-v1`.
- Click container → highlight на Canvas + scroll-to-block (Layout) / scroll-to-node (Graph).
- Дабл-клик container → редактор overlay.
- Click `→ собрано в Y` reference → switch highlight на Y в Итогах + scroll Canvas к нему.
- Праймеры click — пока ничего (placeholder для будущих макетов primer pool).

### 4.3 Контейнер-редактор (overlay над Canvas)

- **Multi-draft pills сверху** — 2 pre-loaded pills: «📋 PCR draft» (active по умолчанию, pre-loaded с pUC19 как первая tab) и «🧬 Gibson draft» (с двумя tabs: pUC19_BamHI_digest_5kb + gBlock_insert). Pills кликабельны, переключение между draft sessions активно.
- **Tabs внутри active session** — рендерится по содержимому active draft. PCR draft = 1 tab (template). Gibson draft = 2 tabs (participants). После commit добавляется product tab.
- **Operations toolbar** — 4 кнопки (ПЦР / Restriction / Мутагенез / Gibson). Кнопка ПЦР работает (как сейчас в `/canvas-prototype` — selection → real primers → product). Кнопки Restriction / Мутагенез / Gibson работают с mock-products (см. §4.4).
- **SequenceView** — рендерит content active tab. Без изменений в самом SequenceView.
- **«← Назад»** — закрывает редактор, возвращает к Canvas с сохранением pills + tabs state (draft sessions персистентны до session reset).
- **Mix with picker** — открытый вопрос, не делаем. Все participants Gibson pre-loaded в fixture'е.
- **Двойной клик с Canvas → редактор** — если редактор закрыт, открывается с pill соответствующий выбранному контейнеру (если он в pre-baked draft sessions) или новый pill «View: {name}» (view-only mode без операций, если контейнер не в активных drafts).

### 4.4 Operations (4 типа)

- **ПЦР (1→1)** — selection в SequenceView → клик ПЦР в toolbar → popup с реальными primers через `local-primer-design.js` → confirm → product tab появляется как linear amplicon, content = selection sequence. **Уже работает в B-прототипе, переносится без изменений.**
- **Restriction Cut (1→N)** — клик Restriction в toolbar → popup с enzyme picker (4-5 mock-ферментов в dropdown: BamHI / EcoRI / HindIII / PstI / XhoI) → confirm → popup закрывается, 2 product tabs появляются (mock-fragments из fixture'а под выбранный enzyme; если enzyme не из pre-baked — generic split в 2 равные части). Demonstrates 1→N model.
- **Мутагенез (1→1 с branch)** — selection в SequenceView → клик Мутагенез → popup с методом dropdown (auto / kld / quikchange / overlap mock-выбор) + input для new sequence (mock — заменить ATG на GTG) → confirm → product tab появляется (mutant container с явным parentCommit). Sequence mutant = original с заменённым regionом.
- **Gibson (n→1)** — кнопка Gibson active **только** если в текущей draft session ≥2 participants tabs (биологически Gibson требует минимум 2 fragmenta). Клик → popup с overlap-region overview (mock: показывается последние 20 nt каждого participant как «overlap-region») + reaction class indicator («Gibson Assembly» / «Golden Gate» / «KLD» в dropdown, default Gibson) → confirm → product tab появляется (circular product, sequence = concatenation participants по overlap regions). Demonstrates n→1 model.

После любого commit'а на Canvas появляется новый block (linear или circular в зависимости от operation), на Tree добавляется в соответствующий раздел.

### 4.5 Plasmid Map mode в SequenceView

- Toggle linear ⇄ plasmid map в углу SequenceView header.
- Circular containers (★) — открываются по умолчанию в plasmid map (кольцо с features).
- Linear containers — открываются в existing track-based viewer.
- **Минимальная глубина** — кольцо + features как дуги + основные labels (name + type как color). Без restriction sites внутри кольца, без точного label routing с overlap resolution.
- Реализация — wrapping `PlasmidMiniMap.jsx` в новый `PlasmidMapInteractive.jsx` с добавлением selection capability + caret sync с linear mode.
- Toggle сохраняет состояние per-tab (открыл pUC19 в map mode → переключился на linear → опять открыл pUC19 → map mode сохранён).

### 4.6 Pre-loaded multi-draft pills

- **Pre-loaded session 1 «📋 PCR draft»** — active по умолчанию при открытии скелета. Single tab «Template: pUC19». Биолог может выделить регион и сделать PCR.
- **Pre-loaded session 2 «🧬 Gibson draft»** — inactive до клика по pill. Two tabs «pUC19_BamHI_digest_5kb» + «gBlock_insert». Кнопка Gibson в toolbar enabled. Биолог может commit'нуть Gibson и увидеть продукт.
- Переключение между pills сохраняет каждый session state (tabs, active tab внутри session, selection, popup state).
- После commit'а в session — соответствующий pill остаётся, добавляется product tab, биолог может commit'нуть mock-commit (toast) или «← Назад» оставив draft в текущем состоянии.

### 4.7 Mock-commit и появление на canvas

- **Mock-commit toast** — как в B-прототипе, «Mock commit OK · продукт {name}».
- **Новый block на Canvas** — после mock-commit'а container из product tab добавляется в local state скелета. Canvas сразу рендерит новый block: Layout view — в pre-defined «новые слева» зоне (cascade сверху-вниз); Graph view — auto-relayout dagre LR.
- **Tree обновляется** — новый container добавляется в соответствующий раздел (circular → Итоги, linear → Материалы с правильным parent через ProjectCommit).
- **State после mock-commit** — соответствующий pill сохраняется, draft session содержит template + product tabs до session reset.

**OUT (явно):**

- Real store write — никакой `librarySlice.addLibraryEntry`, никакой Dexie put, никакой `.bodge` persistence. Всё in-memory.
- Persistence через `← Назад` или browser refresh — state сбрасывается, скелет загружается с fixture state каждый раз.
- Cross-project clone (drag из Tree другого проекта) — другого проекта нет.
- «+ Сборка» как UX-жест из Canvas (открытый вопрос №1) — не зафиксирован, не делаем.
- «+ Контейнер» жест на canvas (связан с №4 layout algorithm) — отложен.
- Real algorithm для Restriction / Мутагенез / Gibson — только mock-products из fixture'а или generic mock-логика (substring concatenation, AA→GTG replacement). Real ПЦР сохраняется как уже работающий.
- Mix with picker внутри редактора — все participants pre-loaded.
- Cascade / pre-defined zones в Layout view — биолог position'ит блоки drag'ом, но new blocks (после commit) появляются в cascade «сверху-вниз слева» без сложной layout-логики.
- Production sidebar / Library integration — отдельный route, скелет не доступен через нормальную навигацию.
- Tests deep coverage — minimum 8-10 smoke tests, не full unit coverage всех компонентов.

---

## 5. Архитектурные решения (sprint-level, не ⚓)

**DEC-SKELETON-01 — Изолированный route + in-memory store.** Скелет полностью изолирован от production. Удаление = revert одного коммита. Local React store (useReducer + Context) внутри скелета, не задевает global Zustand. Это explicit гарантия что косяки скелета не повлияют на production code.

**DEC-SKELETON-02 — Merge `/canvas-prototype` в `/canvas-skeleton`.** Existing prototype не оставляется как parallel — две route'и дублирующие 80% кода. ContainerEditorPrototype/ файлы переезжают как часть скелета, route `/canvas-prototype` удаляется. Это закрывает риск «забыли удалить старый прототип, оно живёт в коде».

**DEC-SKELETON-03 — Real ПЦР, mock остальные operations.** ПЦР через `local-primer-design.js` уже работает в B-прототипе, переносится без изменений. Restriction / Мутагенез / Gibson получают mock-products из fixture'а (заранее заготовленные sequences) или generic mock-логику (substring concatenation для Gibson, region replacement для Мутагенез, equal split для Cut). **Обоснование:** реальные алгоритмы для не-ПЦР операций — это полноценные wizard'ы и validation flows, неподъёмные для скелета. Цель скелета — увидеть **UX-модель**, не запустить production algorithms.

**DEC-SKELETON-04 — Pre-baked draft sessions, не empty state.** Два pre-loaded pills (PCR + Gibson) с предзаполненными tabs. **Обоснование:** empty editor показывает только UI shell, не demonstrating multi-draft model. Pre-loaded sessions сразу показывают как pill-переключатель работает + как multiple drafts coexist + как Gibson n→1 setup выглядит до commit'а.

**DEC-SKELETON-05 — Plasmid Map mode минимальный, не полный.** Кольцо + features + основные labels. Без restriction sites внутри, без точного label routing. **Обоснование:** полный Plasmid Map с label routing — отдельный sprint M-Canvas-PMAP, не часть скелета. Минимум показывает что toggle linear ⇄ circular работает + circular containers visually отличаются от linear в SequenceView.

**DEC-SKELETON-06 — Двойной клик с Canvas + Tree как единственный жест входа в редактор.** Из Canvas (Layout / Graph) и из Tree — оба двойной клик. Sidebar кнопка / hotkey / menu — нет (DEC-CANVAS-V01-INIT-DBLCLICK-01 черновик из 11.05.2026 макетной сессии, проверяется в этом скелете).

**DEC-SKELETON-07 — New containers (после mock-commit) появляются в cascade слева-сверху.** Не sophisticated layout algorithm (это §7 вопрос №4 CANVAS_MODEL, отложен), а простое правило: каждый new container получает position `{x: 50 + cascadeIndex * 20, y: 50 + cascadeIndex * 20}` где cascadeIndex = количество containers созданных после fixture'а. **Обоснование:** простое и работает. Биолог может потом drag'ом перенести куда хочет. Для скелета вполне достаточно.

**DEC-SKELETON-08 — Operations toolbar всегда показывает все 4 кнопки.** ПЦР / Restriction / Мутагенез / Gibson visible always; Gibson enabled только при ≥2 tabs в active session, остальные enabled когда есть active tab. Disabled state — opacity 0.5 + cursor not-allowed + tooltip «Требуется выделение» (для ПЦР/Мутагенез) или «Требуется ≥2 фрагмента» (для Gibson). **Обоснование:** показывает биологу что operations доступны контекстно, а не «всегда работают».

**DEC-SKELETON-09 — Mock-commit реально создаёт block на canvas + entry в Tree.** Не только toast, а live update local state → canvas re-render + tree re-render. **Обоснование:** это критичная часть демонстрации immutable model — биолог должен **видеть** как operation создаёт новый container, не просто читать toast. Без этого скелет повторил бы провал B-прототипа.

**DEC-SKELETON-10 — Tree shared между Library Inspector и Canvas через прокси-компонент.** В скелете Tree — это **новый** компонент `CanvasSkeleton/Tree/SkeletonTree.jsx`, не реальный `LibraryTreeRoot`. Реальный LibraryTreeRoot привязан к global librarySlice / projectSlice / Dexie — это в production. Скелет содержит свой Tree для изоляции. **Обоснование:** §7 вопрос №7 CANVAS_MODEL (Tree shared или дублируется) — открытый, скелет даёт первую визуализацию shared-shape, реальное shared component — следующий sprint после acceptance скелета.

---

## 6. Файлы / структура

**Новая папка `gui/designer/src/components/CanvasSkeleton/`:**

```
CanvasSkeleton/
├── index.jsx                              — оркестратор (~6 KB)
├── SkeletonHeader.jsx                     — top header с «← Назад» + Layout/Graph toggle (~2 KB)
├── canvas/
│   ├── CanvasLayoutView.jsx               — Layout view с draggable blocks (~6 KB)
│   ├── CanvasGraphView.jsx                — Graph view с ReactFlow + dagre (~6 KB)
│   ├── ContainerBlock.jsx                 — circular/linear block component (~4 KB)
│   ├── OperationNode.jsx                  — ромб operation для Graph view (~2 KB)
│   └── canvas-layout.js                   — dagre LR config + position helpers (~2 KB)
├── tree/
│   ├── SkeletonTree.jsx                   — 3-section tree (Итоги / Материалы / Праймеры) (~6 KB)
│   ├── TreeSection.jsx                    — collapsible section с children (~2 KB)
│   ├── TreeContainerRow.jsx               — container row с expand chevron (~3 KB)
│   ├── TreePrimerRow.jsx                  — primer row (~1 KB)
│   └── tree-derive.js                     — derive Tree structure из containers + primers (~3 KB)
├── editor/
│   ├── ContainerEditorSkeleton.jsx        — overlay editor (~6 KB)
│   ├── PillsBar.jsx                       — multi-draft pills (~3 KB) — мерж existing PillsBar.jsx из prototype
│   ├── TabsBar.jsx                        — tabs внутри active session (~3 KB) — мерж existing
│   ├── OperationsToolbar.jsx              — 4 operations buttons (~3 KB) — extend existing
│   └── operations/
│       ├── PCRPopup.jsx                   — real primers через local-primer-design.js (~4 KB) — мерж existing
│       ├── RestrictionPopup.jsx           — enzyme picker + mock split (~3 KB)
│       ├── MutagenesisPopup.jsx           — method picker + mock replacement (~3 KB)
│       └── GibsonPopup.jsx                — overlap-region overview + reaction class + mock concat (~4 KB)
├── sequence-view/
│   └── PlasmidMapInteractive.jsx          — wrapping PlasmidMiniMap с selection + caret sync (~5 KB)
├── store/
│   ├── skeleton-state.js                  — useReducer + actions (~4 KB)
│   └── skeleton-context.jsx               — React Context для local store (~1 KB)
├── fixture-canvas-skeleton.js             — 5 containers + 6 primers + 2 draft sessions + 3 operations inline (~12 KB)
└── __tests__/
    ├── skeleton-mount.test.jsx
    ├── skeleton-canvas-layout.test.jsx
    ├── skeleton-canvas-graph.test.jsx
    ├── skeleton-tree-derive.test.jsx
    ├── skeleton-editor-open.test.jsx
    ├── skeleton-pills-switch.test.jsx
    ├── skeleton-pcr-flow.test.jsx
    ├── skeleton-restriction-flow.test.jsx
    ├── skeleton-mutagenesis-flow.test.jsx
    ├── skeleton-gibson-flow.test.jsx
    ├── skeleton-mock-commit-creates-block.test.jsx
    └── skeleton-plasmid-map-toggle.test.jsx
```

**Итого ~88 KB на 22 компонента + 12 тестов.** Каждый файл — well under soft limit (.jsx soft 30 / .js soft 20).

**Existing prototype merge:**
- `components/ContainerEditorPrototype/index.jsx` → `CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` (расширение).
- `components/ContainerEditorPrototype/PillsBar.jsx` → `CanvasSkeleton/editor/PillsBar.jsx` (расширение с multi-draft).
- `components/ContainerEditorPrototype/TabsBar.jsx` → `CanvasSkeleton/editor/TabsBar.jsx` (без изменений, переезд).
- `components/ContainerEditorPrototype/OperationsToolbar.jsx` → `CanvasSkeleton/editor/OperationsToolbar.jsx` (extend от 1 enabled до 4 enabled).
- `components/ContainerEditorPrototype/PCRPopup.jsx` → `CanvasSkeleton/editor/operations/PCRPopup.jsx` (без изменений, переезд).
- `components/ContainerEditorPrototype/ProductView.jsx` → раствор в `TabsBar.jsx` + `mock-commit` action в store (не отдельный компонент, повторное использование SequenceView).
- `components/ContainerEditorPrototype/fixture-puc19.js` → раствор в `fixture-canvas-skeleton.js` (pUC19 — один из 5 containers).
- `components/ContainerEditorPrototype/usePrototypeState.js` → раствор в `CanvasSkeleton/store/skeleton-state.js`.

**Папка `components/ContainerEditorPrototype/` целиком удаляется после merge.** Route `/canvas-prototype` удаляется из App.jsx, остаётся только `/canvas-skeleton`.

**Правка App.jsx:**

Один новый case в WorkspaceRouter switch (или эквивалент через `uiSlice.prototypes.canvasSkeleton: bool`). Точка входа dev-mode — рекомендуется кнопка в StartScreen sidebar **только при** `import.meta.env.DEV` (production build её не покажет). Размер правки ≤15 строк.

**Правка `lib/strings.js`:**

Расширение namespace `prototypeCanvas` → переименование в `canvasSkeleton`, добавление ~30 новых ключей: имена pills (`pillPCRDraft`, `pillGibsonDraft`), section headers Tree (`treeGoals`, `treeMaterials`, `treePrimers`), названия operations (`operationPCR`, `operationRestriction`, ...), labels для popup'ов всех 4 operations, mock-commit toasts, layout/graph toggle labels, Plasmid Map toggle, и т.д. EN-комментарии в strings.js по правилу проекта (DEC-MA2-01 bilingual).

---

## 7. Fixture (структура 5 containers + 6 primers + 2 draft sessions + 3 operations)

**File:** `CanvasSkeleton/fixture-canvas-skeleton.js`, ~12 KB.

### 7.1 Containers (5)

```javascript
// Все sequences/features в реальных значениях (не mock).
// pUC19 сохраняется из existing fixture-puc19.js (2686 bp с lacZα, AmpR, ori, MCS).

{
  id: 'c-puc19',
  kind: 'molecule',
  name: 'pUC19',
  topology: { circular: true },
  baseSnapshot: { sequence: '<2686 bp реальная>', annotations: [<10 features>] },
  commits: [],
  origin: { kind: 'catalog', catalogId: 'puc19', vendor: 'AddGene' },
  position: { x: 100, y: 100 },
}

{
  id: 'c-gblock-insert',
  kind: 'molecule',
  name: 'gBlock_insert',
  topology: { circular: false },
  baseSnapshot: { sequence: '<500 bp с overhang'ами под Gibson>', annotations: [{ name: 'GOI', type: 'CDS', start: 50, end: 450 }] },
  ends: { fivePrime: { overhang: 'CTAGCAGGT', type: '5overhang' }, threePrime: { overhang: 'ACGTGCAT', type: '5overhang' } },
  commits: [],
  origin: { kind: 'paste', pastedAt: '2026-05-11T10:00:00Z' },
  position: { x: 400, y: 100 },
}

{
  id: 'c-puc19-lacz-amplicon',
  kind: 'molecule',
  name: 'pUC19_lacZ_amplicon',
  topology: { circular: false },
  baseSnapshot: { sequence: '<~1200 bp lacZα regionа из pUC19>', annotations: [<3 features>] },
  ends: { fivePrime: { overhang: '', type: 'blunt' }, threePrime: { overhang: '', type: 'blunt' } },
  commits: [],
  origin: { kind: 'project_commit', projectCommitId: 'op-pcr-1', role: 'product' },
  position: { x: 100, y: 350 },
}

{
  id: 'c-puc19-bamhi-digest',
  kind: 'molecule',
  name: 'pUC19_BamHI_digest_5kb',
  topology: { circular: false },
  baseSnapshot: { sequence: '<~2200 bp linearized pUC19 с BamHI overhang'ами>', annotations: [<8 features>] },
  ends: { fivePrime: { overhang: 'GATCC', type: '5overhang' }, threePrime: { overhang: 'GATCC', type: '5overhang' } },
  commits: [],
  origin: { kind: 'project_commit', projectCommitId: 'op-cut-1', role: 'split_product' },
  position: { x: 400, y: 350 },
}

{
  id: 'c-puc19-ins-v1',
  kind: 'molecule',
  name: 'pUC19_INS-v1',
  topology: { circular: true },
  baseSnapshot: { sequence: '<~3200 bp pUC19 + insert>', annotations: [<13 features>] },
  commits: [],
  origin: { kind: 'project_commit', projectCommitId: 'op-gibson-1', role: 'product' },
  position: { x: 700, y: 350 },
}
```

### 7.2 Primers (6)

```javascript
{ id: 'p-1', name: 'lacZ_fwd', sequence: 'CCTGCAGGTCGACTCT', length: 16, tm: 56, origin: { kind: 'project_commit', projectCommitId: 'op-pcr-1', role: 'forward' } },
{ id: 'p-2', name: 'lacZ_rev', sequence: 'GTCATAGCTGTTTCCT', length: 16, tm: 52, origin: { kind: 'project_commit', projectCommitId: 'op-pcr-1', role: 'reverse' } },
{ id: 'p-3', name: 'gibson_overlap_fwd', sequence: 'CTAGCAGGTGCCATCAGAGC', length: 20, tm: 62, origin: { kind: 'manual_create', createdAt: '...' } },
{ id: 'p-4', name: 'gibson_overlap_rev', sequence: 'ACGTGCATCATAGCTGTTTC', length: 20, tm: 58, origin: { kind: 'manual_create', createdAt: '...' } },
{ id: 'p-5', name: 'mutagenesis_pUC19_ATG', sequence: 'GTGCTTTACCAGGCACT', length: 17, tm: 60, origin: { kind: 'manual_create', createdAt: '...' } },
{ id: 'p-6', name: 'verification_seq', sequence: 'GGCGATTAAGTTGGGTAA', length: 18, tm: 54, origin: { kind: 'manual_create', createdAt: '...' } },
```

### 7.3 ProjectCommits (3, для Graph view + parent references)

```javascript
{
  id: 'op-pcr-1',
  type: 'amplify',
  inputs: { containerIds: ['c-puc19'], primerIds: ['p-1', 'p-2'] },
  outputs: { containerIds: ['c-puc19-lacz-amplicon'] },
  params: { tm: 54, cycles: 30 },
  createdAt: '2026-05-11T10:30:00Z',
}

{
  id: 'op-cut-1',
  type: 'digest_split',
  inputs: { containerIds: ['c-puc19'] },
  outputs: { containerIds: ['c-puc19-bamhi-digest'] }, // в реальности был бы 2 fragmenta, в fixture показываем один для упрощения
  params: { enzyme: 'BamHI' },
  createdAt: '2026-05-11T11:00:00Z',
}

{
  id: 'op-gibson-1',
  type: 'mix',
  reactionClass: 'gibson',
  inputs: { containerIds: ['c-puc19-bamhi-digest', 'c-gblock-insert'] },
  outputs: { containerIds: ['c-puc19-ins-v1'] },
  params: { homologyLength: 20 },
  createdAt: '2026-05-11T11:30:00Z',
}
```

### 7.4 Draft sessions (2 pre-loaded)

```javascript
{
  id: 'draft-pcr',
  pillLabel: '📋 PCR draft',
  icon: '📋',
  containerIds: ['c-puc19'], // tabs = participants
  activeTabId: 'c-puc19',
  operationType: 'pcr',
  state: 'in-progress', // not yet committed
}

{
  id: 'draft-gibson',
  pillLabel: '🧬 Gibson draft',
  icon: '🧬',
  containerIds: ['c-puc19-bamhi-digest', 'c-gblock-insert'],
  activeTabId: 'c-puc19-bamhi-digest',
  operationType: 'gibson',
  state: 'in-progress',
}
```

---

## 8. Порядок выполнения (K-блоки)

**K1 — Merge prototype + skeleton infrastructure.** Создать `CanvasSkeleton/` папку. Перенести существующий `ContainerEditorPrototype/` файлы в новые местоположения внутри `editor/` (см. §6). Удалить `ContainerEditorPrototype/` папку. Создать `fixture-canvas-skeleton.js` с 5 containers + 6 primers + 3 ProjectCommits + 2 draft sessions. Создать `store/skeleton-state.js` (useReducer + actions: getContainers, getPrimers, getDraftSessions, setActivePill, setActiveTab, commitOperation, openEditor, closeEditor) + `store/skeleton-context.jsx` (React Context). Удалить route `/canvas-prototype`, добавить route `/canvas-skeleton` в App.jsx. Кнопка в StartScreen sidebar dev-mode. **Тесты K1:** skeleton-mount, fixture-derive sanity.

**K2 — Canvas Layout view + Container blocks.** `canvas/CanvasLayoutView.jsx` + `canvas/ContainerBlock.jsx` + `canvas/canvas-layout.js`. 5 pre-baked containers рендерятся на pre-baked positions. Circular containers — круглые иконки с PlasmidMiniMap (embedded inline). Linear containers — прямоугольные bars с feature-bar. Drag-to-position работает (react-dnd), updates store positions. Click block → highlight (через store). **Тесты K2:** skeleton-canvas-layout (5 blocks render, drag updates position, click highlights).

**K3 — Canvas Graph view + Operations nodes.** `canvas/CanvasGraphView.jsx` + `canvas/OperationNode.jsx`. ReactFlow + dagre LR (harvest из `Dag/DagCanvas.jsx`). 5 containers + 3 operations (PCR / Cut / Gibson из fixture) рендерятся с auto-layout. Bipartite разделение (operations ромбы, materials прямоугольники). Toggle Layout/Graph в SkeletonHeader. **Тесты K3:** skeleton-canvas-graph (3 operations rendered, dagre layout applied, toggle switches).

**K4 — Tree (3 sections + children expansion).** `tree/SkeletonTree.jsx` + `tree/TreeSection.jsx` + `tree/TreeContainerRow.jsx` + `tree/TreePrimerRow.jsx` + `tree/tree-derive.js`. Derive Tree structure из containers + primers по правилам §3 CANVAS_MODEL. ⭐ Итоги (pUC19 + pUC19_INS-v1), 📥 Материалы (gBlock_insert root + pUC19_lacZ_amplicon child от pUC19 + pUC19_BamHI_digest_5kb с terminator `→ собрано в pUC19_INS-v1`), 🔬 Праймеры (6 entries flat). Click container → highlight Canvas. **Тесты K4:** skeleton-tree-derive (sections правильно derive'd, children expandable, terminator references работают).

**K5 — Editor overlay + multi-draft pills (extend existing).** `editor/ContainerEditorSkeleton.jsx` обёртка + extend `editor/PillsBar.jsx` (multi-draft с 2 pre-loaded pills, click switches active). Extend `editor/TabsBar.jsx` (рендерит tabs из active session containerIds). Двойной клик с Canvas или Tree → editor открывается с pill соответствующий контейнеру (или новый view-only pill если контейнер не в drafts). «← Назад» закрывает editor, сохраняет state pills. **Тесты K5:** skeleton-editor-open (двойной клик открывает editor с правильным pill), skeleton-pills-switch (click pill переключает active, tabs соответствуют новой session).

**K6 — Plasmid Map mode в SequenceView.** `sequence-view/PlasmidMapInteractive.jsx` — wrapping `PlasmidMiniMap.jsx` с selection capability + caret sync с linear mode. Toggle linear ⇄ plasmid map в углу SequenceView header (новый control). Circular containers default → plasmid map mode. Linear → existing track-based. State per-tab сохраняется. **Тесты K6:** skeleton-plasmid-map-toggle (circular default plasmid map, toggle switches, state persists per tab).

**K7 — Operations Restriction + Мутагенез + Gibson (mock-implementations).** Extend `editor/OperationsToolbar.jsx` (все 4 кнопки enabled с правильными conditions). Создать `editor/operations/RestrictionPopup.jsx` (enzyme picker dropdown с 5 mock-ферментами; confirm создаёт 2 mock product tabs). `editor/operations/MutagenesisPopup.jsx` (method dropdown + sequence input; confirm создаёт mutant tab). `editor/operations/GibsonPopup.jsx` (overlap-region preview + reaction class; enabled при ≥2 tabs; confirm создаёт circular product tab). Все три используют generic mock logic (substring / replacement / concat), не real algorithm core. **Тесты K7:** skeleton-restriction-flow, skeleton-mutagenesis-flow, skeleton-gibson-flow.

**K8 — Mock-commit → block on canvas + entry in tree.** Action `commitOperation` в store. После confirm operation popup'а — product container добавляется в store containers[], position auto-cascade «слева-сверху» (DEC-SKELETON-07). Canvas auto-rerenders (new block visible). Tree auto-derives (new entry в соответствующем разделе). Toast «Mock commit OK · {productName}». Pill + tabs сохраняются. **Тесты K8:** skeleton-mock-commit-creates-block (после mock-commit new block виден на Canvas + entry в Tree, toast shown).

**Order rationale:** K1-K2-K3 — Canvas первым, потому что это primary view. K4 Tree — после Canvas, потому что Tree click → highlight Canvas требует Canvas working. K5 Editor — после Tree, потому что entry point из Tree через двойной клик. K6 Plasmid Map — extension SequenceView, можно после K5 потому что editor работает с linear mode уже. K7 Operations — после editor working. K8 Mock-commit + canvas update — последний потому что требует всё предыдущее.

---

## 9. STOP-условие и формат отчёта

**STOP после K8.**

Code в финальном отчёте:
- Подтверждение каждого K-блока: «K1 done», «K2 done», ..., «K8 done».
- Тесты passed: `npm test -- CanvasSkeleton` зелёный полностью, плюс баланс всего suite (1764+ baseline → 1776+ с новыми тестами).
- Build clean: `npx vite build` без warnings связанных со скелетом.
- Размеры файлов скелета (`find components/CanvasSkeleton -printf '%s %p\n' | sort -n`). Если какой-то файл over soft limit — отметить, не блокер (можно decomp в next iteration).
- Скриншоты / описание поведения для каждого K-блока: что биолог видит при открытии `/canvas-skeleton`, при toggle Layout/Graph, при click Tree entry, при двойном клике на container, при switching pills, при mock-commit'ах операций, при toggle Plasmid Map.
- Точка входа dev-mode: конкретно как Игорь открывает скелет в браузере (URL / hotkey / кнопка в StartScreen).
- Известные ограничения / edge cases / тривиальности отложенные. Если K-блок упёрся в R-риск из §10 — какой именно, как обошёл.

**Не финализировать (НЕ писать в) по итогам Code violations 11.05.2026:**
- `CURRENT_TASK.md`, `RELEASES.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `COMPONENT_MAP.md`, `TECH_DEBT.md`.
- `gui/designer/package.json` + `lib/version.js` (нет bump'а — скелет не в production track).

После STOP — Игорь визуально оценивает скелет в отдельной сессии. Chat в той же / следующей сессии финализирует sprint-side updates **только** после PASS Игоря:
- DEC-SKELETON-01..10 → DECISIONS.md.
- DEC-CANVAS-V01-INIT-DBLCLICK-01..06 → DECISIONS.md (после проверки в скелете).
- COMPONENT_MAP.md update (новая папка CanvasSkeleton/, удалена ContainerEditorPrototype/).
- TECH_DEBT.md новый TD-CANVAS-SKELETON-CLEANUP — что снести когда production Canvas-implementation придёт.
- BUGS.md новые баги обнаруженные на acceptance (если будут).

---

## 10. Риски

**R1 — `local-primer-design.js` API в Restriction/Mutagenesis/Gibson не подходит для mock-logic.** Mock operations не должны вызывать real algorithm core — они генерируют products через простую substring/concat логику. Митигация: K7 explicit использует только plain JS logic, никаких импортов из algorithm core кроме `local-primer-design.js` для ПЦР (уже работает).

**R2 — Tree click → highlight Canvas требует shared state.** Tree и Canvas — соседние компоненты, оба читают из skeleton-state. Highlight через `state.highlightedContainerId`. Если Canvas re-renders 5 blocks на каждое highlight change — perf hit на большем количестве containers. Митигация: для 5 containers performance не критичен. Если в acceptance Игорь добавит 20+ containers — следующая итерация добавит memoization.

**R3 — Graph view dagre layout требует ReactFlow setup.** Existing `Dag/DagCanvas.jsx` имеет working ReactFlow + dagre. Скелет harvest'ит pattern, но создаёт **новый** GraphView без модификации оригинала. Если ReactFlow context конфликтует с existing Dag/ context — Code решает через `<ReactFlowProvider>` обёртку отдельно для скелета.

**R4 — Plasmid Map mode требует caret/selection sync с track-based mode.** Toggle сохраняет state per-tab. Если биолог выделил регион в plasmid map, toggle'нул в linear → selection должна сохраниться. Митигация: state lives in skeleton-state, не в `useSelectionState` hook (который per-SequenceView). PlasmidMapInteractive подписывается на тот же selection state. Если sync ломается — fallback: selection сбрасывается при toggle, биолог переделывает в новом mode (acceptable degradation).

**R5 — Двойной клик с Canvas → editor конфликт с double-click на block (drag-start vs open-editor).** React-dnd drag-start обычно требует pointer-down + mousemove. Double-click — два rapid pointer-down/up. Митигация: Code использует react-dnd `useDrag` с `canDrag` callback который проверяет `event.detail === 2` (double-click) → false для drag, → true для open editor. Стандартный pattern.

**R6 — Existing `ContainerEditorPrototype/` merge ломает tests.** При переезде файлов в `CanvasSkeleton/editor/` все imports в существующих тестах prototype'а ломаются. Митигация: K1 включает test path updates — все тесты prototype'а либо переезжают, либо удаляются (если они тестировали только prototype-specific поведение, заменяемое skeleton тестами). Vitest config может потребовать `--update-snapshots` после переезда.

**R7 — Размер bundle вырастает на ~80-100 KB кода.** Скелет — dev-only route, но он загружается в bundle. Production build не должен включать скелет. Митигация: dynamic import скелета через `React.lazy(() => import('./components/CanvasSkeleton'))` + check `import.meta.env.DEV` в route gateway. Production build получает empty chunk для skeleton route.

---

## 11. Открытые вопросы (для Code)

**O1 — Точка входа dev-mode.** В StartScreen sidebar как dev-only кнопка vs hidden hotkey vs query param. Code на выбор. Рекомендация: кнопка в StartScreen с условием `import.meta.env.DEV`.

**O2 — Layout positions persistence в пределах session.** Биолог drag'ом передвинул blocks, ушёл в редактор, вернулся `← Назад`. Positions сохраняются? Митигация: да, positions живут в skeleton-state до session reset (close `/canvas-skeleton` → reset).

**O3 — Highlight implementation.** Border / outline / background / shadow для highlighted block. Code на выбор по существующему design language (см. `docs/DESIGN_SYSTEM.md` если нужно). Не блокер.

**O4 — Иконки operations в toolbar.** Использовать существующие в проекте (если есть) или Unicode-эмодзи (🧬 ПЦР, 🔪 Restriction, 🧪 Мутагенез, 🧫 Gibson). Code на выбор.

**O5 — Что показывать на operation node ромб в Graph view.** Тип операции (PCR / Cut / Gibson) + small icon + count of inputs/outputs. Без deep detail. Если нужны label rendering edge cases — на acceptance Игорь скажет.

**O6 — Mock fragment lengths для Restriction Cut.** При confirm Restriction — два tabs появляются. Какие fragment lengths показывать? Митигация: split по середине sequence (одна половина = первый fragment, вторая = второй). Mock-data, биолог в acceptance возможно скажет «нет, должно быть biologically реалистично», но в скелете simplicity > realism.

---

## 12. Что делать при регрессии

- Vitest 1764+ baseline должен оставаться зелёным. Если упало — Code НЕ продолжает, выясняет в чат.
- `npx vite build` clean — если warning от скелета, fix перед STOP. Production build NOT include skeleton (R7 митигация).
- Если K7 операция (Restriction / Мутагенез / Gibson) разваливается на R1 — STOP, в чат. Не правим algorithm core.
- Если merge prototype в K1 ломает существующие тесты — STOP, в чат. Не удаляем тесты без подтверждения.
- Если Graph view ReactFlow конфликтует с existing Dag/ — STOP, в чат.
- Любая ситуация когда возникает соблазн «маленькая правка в SequenceView / LibraryWorkspace / production code» — STOP, в чат. Скелет изолирован, без исключений.

---

**Источник:** Visual acceptance failure 11.05.2026 (Игорь: «функционала 0»). Корректировка классификационного косяка (тип B → тип A для skeleton tasks). DEC-CANVAS-01..08 + DEC-CANVAS-V01-INIT-DBLCLICK-01..06 + `docs/ARCHITECTURE_CANVAS_MODEL.md` §4 (три инструмента) + §6 (UX-инварианты) + §7 (открытые вопросы).

**После acceptance скелета:** DEC-SKELETON-01..10 → DECISIONS.md, DEC-CANVAS-V01-* финализируются (с возможными правками формулировок по итогам визуального опыта), COMPONENT_MAP.md update, переход к решению §7 открытых вопросов (№1 «+ Сборка», №4 Layout algorithm, №10 Primer entity) уже на работающем скелете с возможностью точечной модификации.
