# SPEC_CANVAS_LIVE_PROJECTION — граф-вид как живая проекция сборки + стык-чип

**Статус:** 🟡 черновик / к реализации
**Тип:** A (архитектура + UI)
**Создано:** 2026-06-04 (новая спека набора live-junction; D1=A подтверждён Игорем — граф = живая проекция, реальная перестройка graph-mode, не косметика).
**Роль:** делает граф-вид зоны **живой проекцией** ещё-не-материализованной сборки (pieces → реакция ◇ → виртуальный продукт), непрерывно, до realise. Наносит **стык-чип** на стыки графа, кликабельный, реюзящий `JunctionControl` + `zone.junctions` (тот же стык-элемент, что в sequence-режиме). Realise → **commit-only** (коммитит проекцию в персистентные узлы, перестаёт быть единственным способом увидеть граф сборки).
**Сквозные решения и порядок — см. МАСТЕР-ОБЗОР в `SPEC_PRIMER_TAIL_UNIFICATION`.** Реюзит `JunctionControl` из `SPEC_ASSEMBLY_JUNCTION_MODULE` (J12) и питается типами куска из `SPEC_ASSEMBLY_PIECE_MODEL`.

> **Степень верификации (честно):** `[recon 04.06]` — подтверждено чтением `canvas-layout.js`, `ZoneGraphContent.jsx`, `StitchMarkers.jsx`. `[Code-verify]` — файлы, которых я НЕ читал (`OperationNode.jsx`, `ContainerBlock.jsx`, `lib/zone-model.js::nodeListInZone`, `CanvasGraphView.jsx`, `ZoneFrame.jsx`, `lib/zone-layout.js`, `lib/zone-pieces-to-dag.js` детально): Code **обязан** прочесть и подтвердить геометрию/компоненты. Проектирую модель, не выдумывая внутренности непрочитанного.

---

## §0. Срез размеров зоны правки (Code перемеряет)

| Файл | Оценка | Лимит | Статус |
|---|---|---|---|
| `canvas/canvas-layout.js` | ~14 KB | .js 25/20 | `buildGraphNodesEdges`/`computeGraphPositions` — расширить проекцией ИЛИ sibling-builder [recon] |
| `canvas/ZoneGraphContent.jsx` | ~6 KB | .jsx 40/30 | потребитель проекции (рёбра/узлы) [recon] |
| `canvas/StitchMarkers.jsx` | ~3 KB | .jsx 40/30 | глифы по kind — обернуть кликабельным чипом [recon] |
| `canvas/OperationNode.jsx` | ? | .jsx 40/30 | **Code читает** — тир Reaction (◇ diamond?) |
| `canvas/ContainerBlock.jsx` | ? | .jsx 40/30 | **Code читает** — тир Piece/Product рендер |
| `lib/zone-model.js` (`nodeListInZone`) | ? | .js 25/20 | **Code читает** — что отдаёт до realise |
| `canvas/ZoneFrame.jsx` | ? | .jsx 40/30 | **Code читает** — graph-mode проводка |
| `lib/zone-layout.js` (`applyZoneLayouts`, T4.5) | ? | .js 25/20 | **Code читает** — раскладка зоны |
| `lib/zone-pieces-to-dag.js` (`realiseAssembly`) | ~10 KB | .js 25/20 | realise → commit-only (V130-зона) [recon частично] |
| `canvas/CanvasGraphView.jsx` | ? | .jsx 40/30 | **Code читает** — общий DAG-вид (не регрессить) |
| `canvas/ProjectionBuilder.js` или в `canvas-layout` | new | .js 25/20 | builder проекции (draft → виртуальные узлы/рёбра/стыки) |

Точные KB — Code перемеряет. Если расширение `buildGraphNodesEdges` пухнет >25 KB → отдельный `lib/projection-builder.js` (не дописывать в раздутое).

---

## §1. Контекст (сверено чтением 04.06)

**Сейчас:**
- **`buildGraphNodesEdges(containers, commits, operations)`** строит биграф: узлы = containers + operations; рёбра = `op.inputs→op` и `op→op.outputs`. **Pieces узлами НЕ становятся** — их нет среди аргументов. `[recon]`
- **`ZoneGraphContent`** (V114 K1) — общий рендерер: `buildGraphNodesEdges` → `computeGraphPositions` (dagre LR) → SVG-рёбра (простые стрелки, без стык-глифов) + `ContainerBlock`/`OperationNode`. `ZoneFrame` graph-mode кормит его `nodeListInZone(zone)`-отфильтрованными узлами. `[recon]`
- **Следствие (V114):** до realise зональный граф = разрозненные source-контейнеры (pieces не контейнеры, реакция не материализована, виртуального продукта нет). «Реализовать» — единственный способ увидеть связную сборку графом. Сам realise (`zone-pieces-to-dag::realiseAssembly`) сейчас даёт биологически мёртвый результат (бланкетный PCR, без замыкания, продукт=concat — чинит ENGINE/JUNCTION). `[recon]`
- **`StitchMarkers`** — чистый props-only (`{kind, x1,y1,x2,y2, stroke}`), глифы overlap/GG/RE/KLD/ligation, **не кликабелен**, живёт в layout-виде (`CanvasLayoutView` junction-layer между блоками), НЕ в `ZoneGraphContent`-рёбрах. `[recon]`
- Размеры узлов: блок 240×150, operation 120×60; рёбра — `edgeAnchors` 4-сторонний bezier. `[recon]`
- Четырёхтир (ANCHORS): Source → Piece → Reaction → Product внутри Zone-фреймов (T4.5). Сейчас в графе видны Source-контейнеры + (после realise) Reaction/Product; **тир Piece в графе не показан вовсе**. `[recon + ANCHORS]`

**Модель Игоря (04.06):**
- Граф = **живая проекция** той же сборки, что в sequence-strip: pieces (тир Piece) → реакция (◇) → виртуальный продукт, непрерывно, до realise.
- Стык-элемент **кликабелен в обоих режимах** (sequence-strip + граф) — один элемент, один `pairKey`, один `JunctionControl`, одна `zone.junctions`-запись.
- Realise = визуализация/**коммит**: коммитит виртуальный продукт в персистентный узел; перестаёт быть единственным способом увидеть граф сборки.

**Разрывы (что закрывает спека):** тир Piece в графе (проекция draft); виртуальная реакция ◇ + виртуальный продукт до realise; стык-чип на графе (реюз `StitchMarkers`-глифа + клик → `JunctionControl`); realise → commit-only; согласование с T4.5-раскладкой зоны.

---

## §2. Стратегия

Зональная сборка имеет полное описание ДО realise: упорядоченные pieces + `zone.junctions` + `topology` (всё из draft, как у sequence-strip). Проецируем это в граф **деривативно** (из draft, не из персистентного store): виртуальные узлы Piece, виртуальная реакция ◇, виртуальный продукт ◇/блок — помечены `virtual:true`, рендерятся `ZoneGraphContent` рядом/вместо разрозненных source-блоков. Стыки графа несут кликабельный чип поверх существующего `StitchMarkers`-глифа → открывает `JunctionControl` (JUNCTION_MODULE) на `zone.junctions[pairKey]` — буквально тот же контрол и ключ, что у `ImplicitJunction` в sequence-strip. Realise коммитит виртуальное в персистентное (через `zone-pieces-to-dag`, после ENGINE/JUNCTION-фиксов). Реюз `buildGraphNodesEdges`/`ZoneGraphContent`/`StitchMarkers`/`JunctionControl`/четырёхтир/`zone-pieces-to-dag` — не дублировать (§17/antipattern 8). **Перестройка graph-mode (D1=A), но через расширение существующего рендер-пути, НЕ rebuild с нуля** (antipattern-10: redesign = расширение контракта, не переписывание `ZoneGraphContent`).

---

## §3. Scope

**IN:**
- **Проекция-builder:** `draft (pieces + zone.junctions + topology) → {виртуальные узлы Piece, реакция ◇, продукт, рёбра, стыки}` (C1).
- **Тир Piece в графе:** piece-узлы в порядке сборки, питающие виртуальную реакцию (C2).
- **Виртуальная реакция ◇ + виртуальный продукт** до realise, `virtual:true` (C3).
- **Стык-чип на графе:** кликабельный, реюз `StitchMarkers`-глифа + `JunctionControl` на `zone.junctions[pairKey]` — тот же стык-элемент, что sequence-strip (C4).
- **Согласование с sequence-strip:** один `pairKey`/`JunctionControl`/конфиг в обоих режимах (C5).
- **Realise → commit-only:** коммит виртуального продукта в персистентный узел; граф больше не зависит от realise, чтобы показать сборку (C6).
- **Раскладка проекции** в Zone-фрейме (T4.5-совместимо) (C7).

**OUT:**
- `zone.junctions` модель + `JunctionControl` сам по себе → `SPEC_ASSEMBLY_JUNCTION_MODULE` (реюзим контрол J12).
- Движок праймеров/хвостов → `SPEC_PRIMER_TAIL_UNIFICATION`.
- Тип/добыча куска → `SPEC_ASSEMBLY_PIECE_MODEL` (потребляем `acquisitionMethod` для отрисовки тира Piece).
- Биологическая корректность realise (бланкетный PCR / замыкание / продукт) → ENGINE/JUNCTION (мы лишь коммитим их результат).
- Визуальный рестайл (SBOL-глифы, provenance-timeline, минимап) — отдельный визуальный спринт; SBOL-глифы на фичах ОТКЛОНЕНЫ Игорем (фичи как сейчас). Эта спека — структура проекции, не косметика.
- Layout-вид (`CanvasLayoutView`) freeform-канвас — не трогаем (там `StitchMarkers` уже работает; не регрессить).

**КОНТРАКТ realise (важно):** проекция рендерит из draft непрерывно; realise НЕ «вычисляет граф с нуля» — он коммитит уже показанную проекцию (виртуальные узлы → персистентные containers/operations через `zone-pieces-to-dag`). До realise граф связен и живой; после — те же узлы, помеченные committed.

---

## §4. Архитектурные решения

**C1. Проекция-builder (деривативный, из draft).**
- Новый чистый `buildAssemblyProjection(zoneDraft, junctions, topology) → { nodes, edges, stitches }`, где `nodes` = piece-узлы (`kind:'piece', virtual:true, acquisitionMethod`) + одна реакция (`kind:'reaction', virtual:true, method-mix`) + продукт (`kind:'product', virtual:true, topology`); `edges` = каждый piece → реакция, реакция → продукт; `stitches` = `[{pairKey, leftPieceId, rightPieceId, method, role:'internal'|'closure', anchor}]` из `internalBoundaries`+`closureBoundary` (JUNCTION_MODULE `junction-derive`). Pure, React-free, unit-тест.
- Реюз: порядок/границы pieces — `draftFromZone`/`segmentBoundaries`/`junction-derive` (JUNCTION_MODULE), НЕ заново. `acquisitionMethod` — из piece (PIECE_MODEL).
- Builder **не пишет в store** — проекция эфемерна, дерайвится при рендере (как `computeGraphPositions`). Персистентность приходит только с realise-commit (C6).

**C2. Тир Piece в графе.**
- Piece-узлы рендерятся в порядке сборки слева→направо ПЕРЕД реакцией (тир Piece четырёхтира). Каждый — `ContainerBlock`-подобный (или `PieceNode`, Code решает реюз vs новый — `[Code-verify]` рендер `ContainerBlock`), окрашен/помечен по `acquisitionMethod` (pcr/restriction/synthesis/direct — словарь PIECE_MODEL P3). Source-контейнеры (откуда добыт piece) остаются тиром Source выше/левее (ребро Source→Piece — опционально, Code решает по `nodeListInZone`).
- **Замена разрозненности:** до realise вместо отдельных source-блоков без связей граф показывает Source → Piece → ◇ → Product связно.

**C3. Виртуальная реакция ◇ + виртуальный продукт.**
- Одна виртуальная реакция-нода (тир Reaction, ◇-diamond — `[Code-verify]` рисует ли `OperationNode` ромб; если нет — добавить diamond-вариант, не новый компонент с нуля) собирает все piece-узлы. Метод реакции = свод методов стыков (overlap-fusion / Gibson-замыкание / RE / mix — из `zone.junctions`); многоуровневая (advisory `auto-group-pipeline` >6) → несколько реакций-нод (бакеты → промежуточные продукты → финальная). MVP: одна реакция; многоуровневость — после.
- Виртуальный продукт (тир Product) — `topology.circular ? ◯ : —` (кольцо/линейный), `virtual:true`. До realise рисуется пунктиром/полупрозрачным («ещё не собрано»).
- `virtual:true` отличает проекцию от committed-узлов: разный стиль (пунктир vs сплошной), чтобы биолог видел «это план, не результат».

**C4. Стык-чип на графе (кликабельный, реюз глифа + `JunctionControl`).**
- На каждый стык проекции (`stitches` из C1) — чип: визуально **реюз `StitchMarkers`-глифа** по `method` (overlap-параллелограмм / GG-стрелки / RE-зигзаг / KLD-точки / ligation-бары — маппинг method→kind уже есть), плюс **кликабельная обёртка** (`pointer-events:auto`, hit-area) → `onStitchClick(pairKey)` → открыть `JunctionControl` (popover, anchored у чипа) на `zone.junctions[pairKey]`.
- `StitchMarkers` сейчас не кликабелен и живёт в layout-виде → нужна тонкая обёртка/расширение: либо `StitchChip` оборачивает `StitchMarkers` + hit-area, либо `StitchMarkers` принимает опц. `onClick`. Code выбирает минимальную форму (реюз глифовой логики, не копипаст; §17). **Layout-вид не регрессит** (там обёртка без onClick).
- **Расположение чипа:** на стыке между соседними piece-узлами (как layout-вид рисует между блоками) ИЛИ на ребре piece→реакция. Lean: между соседними piece-узлами (зеркалит sequence-strip + layout-вид). Точная геометрия vs dagre-раскладка проекции — `[Code-verify]` (C7).
- Closure-стык (кольцо) — чип на обёртке последний→первый (у продукта/loop-маркера).

**C5. Согласование sequence ↔ graph (один стык-элемент).**
- **Тот же `pairKey`, тот же `JunctionControl`, та же `zone.junctions`-запись** в обоих режимах. Клик по `ImplicitJunction` (sequence-strip, JUNCTION_MODULE J6b) и по стык-чипу (граф, C4) открывают ОДИН контрол на ОДНУ запись; правка в одном режиме мгновенно отражается в другом (общий store). Это и есть «кликабелен в обоих режимах».
- Оба пути идут через тот же handler `OPEN_JUNCTION_METHOD_PICKER` (JUNCTION_MODULE воскрешает) — граф-чип диспатчит его же с `{zoneId, fromPieceId, toPieceId}`. Ноль дублирования логики стыка.

**C6. Realise → commit-only.**
- Проекция (C1–C5) делает граф связным/живым ДО realise. Поэтому realise сужается до **коммита**: материализовать виртуальный продукт + реакцию в персистентные containers/operations (существующий `zone-pieces-to-dag::realiseAssembly` — после ENGINE-слой2/JUNCTION-фиксов он станет биологически верным). После commit виртуальные узлы заменяются committed (или помечаются committed), стыки сохраняют `zone.junctions`.
- **Граница с ENGINE/JUNCTION:** биологию commit (праймеры, замыкание, методы) чинят те спеки; CANVAS лишь (а) показывает проекцию до commit, (б) триггерит commit, (в) рендерит committed-результат тем же `ZoneGraphContent`. RealiseModal (JUNCTION_MODULE J9) — сводка + кнопка commit, не редактор.
- **Совместимость с V114-путём:** committed-узлы по-прежнему идут через `nodeListInZone` → `ZoneGraphContent`. Проекция — ДОБАВКА для pre-commit состояния, не замена post-commit пути.

**C7. Раскладка проекции в Zone-фрейме (T4.5-совместимо).**
- Проекция-узлы раскладываются внутри зон-фрейма теми же средствами, что committed (`computeGraphPositions` dagre LR ИЛИ `applyZoneLayouts`/T4.5 — `[Code-verify]` что управляет зональной раскладкой). Builder отдаёт узлы/рёбра в формате `buildGraphNodesEdges` → `ZoneGraphContent` их кладёт без спец-кода, если формат узла совпадает (`{id, type, width, height, data:{kind}}`).
- Если `nodeListInZone` до realise отдаёт только source-контейнеры — проекция инжектится в `ZoneFrame` graph-mode как доп. узлы (виртуальные) поверх `nodeListInZone`-результата. Точка инжекта — `ZoneFrame.jsx` graph-ветка `[Code-verify]`.
- Тиры (Source/Piece/Reaction/Product) — порядок dagre-рангов слева→направо; T4.5-фрейм оборачивает. Не ломать существующую T4.5-геометрию committed-узлов.

---

## §5. Файлы / сигнатуры (не код)

- **`lib/projection-builder.js`** (new, pure): `buildAssemblyProjection(zoneDraft, junctions, topology) → {nodes, edges, stitches}` (C1). Реюз `draftFromZone`/`segmentBoundaries`/`junction-derive`.
- **`canvas/canvas-layout.js`**: либо `buildGraphNodesEdges` принимает опц. `projection` и доклеивает виртуальные узлы/рёбра, либо `ZoneGraphContent` мёржит проекцию отдельно. Code выбирает по диффу; если canvas-layout пухнет — логика в `projection-builder`.
- **`canvas/ZoneGraphContent.jsx`**: рендер виртуальных узлов (стиль `virtual:true` — пунктир/прозрачность) + стык-чипов на `stitches`; проброс `onStitchClick`. Рёбра проекции — тем же SVG-слоем.
- **`canvas/StitchMarkers.jsx`**: обернуть кликабельным `StitchChip` (hit-area + `onClick`) ИЛИ принять опц. `onClick`; глифовую логику не дублировать (C4). Layout-вид — без onClick (не регрессить).
- **`canvas/OperationNode.jsx`** (Code читает): тир Reaction ◇ — diamond-вариант если ещё не ромб; `virtual`-стиль.
- **`canvas/ContainerBlock.jsx`** (Code читает): тир Piece/Product — реюз для piece-узла (окраска по `acquisitionMethod`) + virtual-продукт; `PieceNode` только если `ContainerBlock` не подходит.
- **`canvas/ZoneFrame.jsx`** (Code читает): graph-mode — инжект проекции до realise (C7); открытие `JunctionControl` по `onStitchClick` (тот же handler, что sequence-strip C5).
- **`lib/zone-model.js`** (Code читает): `nodeListInZone` — что до realise; нужен ли флаг «включать проекцию».
- **`lib/zone-pieces-to-dag.js`**: `realiseAssembly` → commit виртуального (C6); согласовать с ENGINE-слой2 (V130) и JUNCTION J9 — не дублировать realise-логику, лишь сузить до commit.
- **`canvas/CanvasGraphView.jsx`** (Code читает): общий DAG-вид — проекция его НЕ ломает (он показывает весь проект; зональная проекция — внутри зон-фрейма). Регрессия.
- **тесты**: `buildAssemblyProjection` (pieces→реакция→продукт, стыки из границ, closure только кольцо, virtual-флаги); стык-чип кликабелен → открывает `JunctionControl` на верном `pairKey`; sequence↔graph один контрол/запись (C5); virtual vs committed стиль; realise commit (виртуальное → персистентное); регрессия `CanvasGraphView`/layout-вида/V114-пути.

---

## §6. Порядок (строгий; ПОСЛЕ JUNCTION_MODULE — реюзит `JunctionControl`+`zone.junctions`+воскрешённый handler)

1. **`buildAssemblyProjection` (C1) + piece-тир + виртуальные реакция/продукт (C2/C3)** — граф рисует Source→Piece→◇→Product из draft до realise (стыки ещё не кликабельны). Главная победа V114-разрыва.
2. **Стык-чип (C4) + согласование sequence↔graph (C5)** — чип реюзит `StitchMarkers`-глиф + клик → `JunctionControl` на той же `zone.junctions`-записи, что sequence-strip.
3. **Раскладка в Zone-фрейме (C7)** — T4.5-совместимо; committed-геометрия не сломана.
4. **Realise → commit-only (C6)** — coordination с ENGINE-слой2/JUNCTION J9; виртуальное коммитится, post-commit путь (V114) не регрессит.

Каждый шаг — STOP перед визуальной приёмкой (отдельной сессией). Шаг 1 — после готовности JUNCTION_MODULE (нужны `junction-derive`+`zone.junctions`); шаг 2 — после JUNCTION `JunctionControl`+handler.

---

## §7. STOP + отчёт

Как `SPEC_PRIMER_TAIL_UNIFICATION` §7. Дополнительно: подтвердить, что graph-mode расширен **через `ZoneGraphContent`-контракт, НЕ rebuild** (antipattern-10); стык-чип и `ImplicitJunction` открывают ОДИН `JunctionControl` на ОДНУ `zone.junctions`-запись (C5); `virtual` vs committed различимы; layout-вид (`CanvasLayoutView`) + `CanvasGraphView` + V114 post-commit путь НЕ регрессят; realise сужен до commit (биологию чинят ENGINE/JUNCTION, не дублирована). Code **обязан прочесть** файлы «?» (§0). После реализации — статус-шапка `✅ РЕАЛИЗОВАНО [дата]`.

**Handoff (04.06).** `CURRENT_TASK.md` — лаунчер набора. Реализуется ПОСЛЕ JUNCTION_MODULE (зависимость по `JunctionControl`/`zone.junctions`/handler). Handoff Code — в сессии старта реализации этого слота.

---

## §8. Риски

1. **Перестройка graph-mode = соблазн rebuild.** D1=A разрешает перестройку, НО через расширение `ZoneGraphContent`/`buildGraphNodesEdges`-контракта (antipattern-10: redesign ≠ переписывание с нуля; пост-мортем M-X.7a 3-fail). → builder отдаёт узлы в существующем формате; `ZoneGraphContent` рендерит их тем же путём.
2. **Проекция эфемерна vs persisted.** Дерайвить из draft при рендере (как `computeGraphPositions`), НЕ писать виртуальное в store → нет рассинхрона/мусора при правке draft. Персистентность только на commit (C6).
3. **`nodeListInZone` до realise** может отдавать только source — Code читает, решает инжект проекции (C7). Точка инжекта в `ZoneFrame` graph-ветке `[Code-verify]`.
4. **`StitchMarkers` не кликабелен + в layout-виде.** → тонкая обёртка `StitchChip`/опц.`onClick`, глиф не дублировать; layout-вид без onClick (не регрессить).
5. **realise-commit пересекается с V130/JUNCTION J9.** → CANVAS лишь сужает realise до commit; биологию (праймеры/замыкание/методы) НЕ трогает — её чинят ENGINE-слой2/JUNCTION. Реализовать ПОСЛЕ них; не дублировать `zone-pieces-to-dag`-логику.
6. **T4.5-геометрия committed-узлов.** → проекция-узлы в том же формате/раскладке; регрессия committed-вида.
7. **`OperationNode` может не рисовать ◇.** → diamond-вариант существующего компонента, не новый node-компонент (§17).
8. **Многоуровневая сборка (>6).** MVP — одна реакция-нода; бакеты/промежуточные продукты — после (advisory `auto-group-pipeline`), чтобы не раздувать первый слот.

---

## §9a. Поправки выверки 04.06 (повторное чтение кода)

- **CV-Q1/C7/§1 — `nodeListInZone` ВОЗВРАЩАЕТ pieces.** Факт (`skeleton-state-zones.js` DRAG_ZONE): `nodeListInZone(state, zoneId) → {containers, pieces, operations}` — pieces перечислены. Исключение НЕ там, а на границе `ZoneFrame` graph-mode → `ZoneGraphContent` (последний принимает только `containers`+`operations`, pieces отбрасываются при пробросе). Значит инжект проекции = в graph-ветке `ZoneFrame` сконвертировать `nodeListInZone().pieces` → виртуальные узлы для `ZoneGraphContent`. Проще, чем заявлено в CV-Q1 (данные уже есть).
- **C3 virtual-продукт — инфра есть.** `junction-styles` несёт `VIRTUAL_STROKE`/`virtualStroke(state)` (F4 DEC-CANVAS-PROD-04: incomplete/disconnected/valid) — пунктир/цвет виртуального продукта брать отсюда, не выдумывать.
- **C4 method→kind маппинг подтверждён.** `METHOD_TO_JUNCTION` (`zone-pieces-to-dag`) даёт method→`junction.kind` для глифа `StitchMarkers`. Словарь method — канон из JUNCTION §9a (`opGroup.kind`-семейство). `StitchMarkers` принимает `kind` в значениях overlap/golden_gate/re_ligation/kld/ligation/blunt/preformed/auto — чип маппит method→kind перед передачей.
- **OPEN_JUNCTION_METHOD_PICKER (C5) — диспатч в `ZoneAssembledView`** (не `ImplicitJunction`, см. JUNCTION §9a); граф-чип диспатчит тот же type с `{zoneId, fromPieceId, toPieceId}` — один handler, совпадает с sequence-путём (C5 верна).
- **Остальное [Code-verify] остаётся** (честно, не читано): `OperationNode` рисует ли ◇ (CV-Q2), `ContainerBlock` реюз для piece/product (CV-Q4), точка инжекта в `ZoneFrame.jsx`, монтируется ли `JunctionPopover` на канвас сейчас (CV-Q5/J-Q2 — на этой выверке монтаж popover'а на канвасе НЕ найден, `StitchMarkers` — в `CanvasLayoutView`; Code подтверждает).

## §9. Открытые вопросы

- Сквозные (Q1–Q7) закрыты в МАСТЕР-ОБЗОРЕ.
- **CV-Q1.** `nodeListInZone` до realise — только source-контейнеры или что-то ещё? Решает форму инжекта проекции. Code читает `zone-model.js`.
- **CV-Q2.** `OperationNode` рисует ромб (◇) или прямоугольник? Если прямоугольник — diamond-вариант или CSS. Code читает.
- **CV-Q3.** Стык-чип: между соседними piece-узлами или на ребре piece→реакция? Lean — между piece-узлами (зеркалит sequence-strip/layout-вид). Финал — по dagre-раскладке проекции, Code подтверждает геометрию.
- **CV-Q4.** `ContainerBlock` подходит для piece-узла (окраска по `acquisitionMethod`) и virtual-продукта, или нужен `PieceNode`? Code решает реюзом, не плодя компонент.
- **CV-Q5 (к согласованию с JUNCTION_MODULE J-Q2).** `JunctionPopover`/`JunctionControl` уже монтируется на канвасный container-junction (post-realise)? Если да — как сосуществуют committed-junction-popover и проекционный стык-чип (оба графовые). Согласовать единый стык-UI на графе.
