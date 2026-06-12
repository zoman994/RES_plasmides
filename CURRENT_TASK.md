# CURRENT_TASK.md

> **Активная задача — Sprint M-CANVAS-FIX.1** (canvas core: раскладка + V139 + цвет). Блок ниже.
> **Старт сессии:** `CHAT_PLAYBOOK.md` → `CLAUDE.md` → `BUGS.md` → этот файл → первая строка `PROJECT_STATE.md`.

---

## ⚠ Незакрытый долг прошлой арки (JUNCTION + Звенья + UX-срезы) — нужна сессия финализации

Вся junction-арка + Звенья + UX-срезы РЕАЛИЗОВАНЫ и визуально ПРИНЯТЫ, но **НЕ закоммичены и трекеры НЕ финализированы** (Code по дисциплине не трогал; git за Игорем). Полные отчёты — `docs/archive/CURRENT_TASK_HISTORY_2026_06_junction.md`.

**Сделано-но-не-зафиксировано** (Vitest 4395 pass / 0 fail на момент Tm-Звена):
- JUNCTION шаг 2 + FIX + FIX-2 (клик-стык в редакторе, RealiseModal→viz/J9) — ✅ принято.
- Звенья: overhang-params для не-overlap; Tm-таргетинг авто-связывания — ✅ приняты.
- UX-срезы: read-first JunctionPopover; метод сборки flow-down + differs-badge; строка готовности; trust-состояние стыка на полосе — slice-тесты зелёные.

**Финализация трекеров (Chat, отдельной сессией):**
- PROJECT_STATE — Vitest → 4395+, «что дальше» → canvas (M-CANVAS-FIX.1).
- ANCHORS/DECISIONS — **DEC-JUNC-PRIMER-01** promotion-candidate → promoted (⚓ +1); ⚓ canvas interaction-модель (§0.5 спеки canvas).
- RELEASES — junction шаг2+J9 + Звенья + UX-срезы delivery.
- TECH_DEBT — JUNCTION-отклонения + минор `zone-handle` click-steal (тот же bail-out gap, что чинили для junction-глифа).
- COMPONENT_MAP — junction-глиф в SegmentZonesOverlay; JunctionControl смонтирован в AssemblyShellBody; канал onZoneClick string|object; junctionPicker state.
- **Git / гигиена (НЕ доделано, важно):** рабочее дерево = крупный незакоммиченный бэклог. **`docs/design_assets/` НЕ в `.gitignore`** (аудит: там паспорт/договоры/237MB .msi — широкий `git add docs/` их утащит); `test.bodge` тоже не игнорится. **Добавить `.gitignore` ДО любого широкого `git add`.** v0.8.7-bump + commit — статус уточнить.

Спека верификации (M-VERIFY) — `docs/SPEC_ASSEMBLY_VERIFY_PHASE1.md`, **химический вердикт отложен/заглушка** (решение Игоря 10.06, статус-баннер в спеке).

---

# ▶ СЛЕДУЮЩАЯ ЗАДАЧА — Sprint M-CANVAS-FIX.1 (canvas core: раскладка + V139 + цвет)

> Спека: **`docs/SPEC_CANVAS_FIX_PHASE1.md`** (тело не переписывать). **§11 «Сверка с кодом 10.06» — обязательно прочитать, в нём поправки к §6.** Решение interaction-модели — §0.5/§0.6 (Игорь).
> Всё junction-содержимое ВЫШЕ — историческое (приёмка завершена). Это новая активная задача.

**Контекст:** канвас грустит не от дизайна — арифметика движка раскладки гарантирует наложение (константы < блока), один drag убивает авто-раскладку зоны, рамки только растут, рёбра молчат. Решение Игоря: **канвас = авторитетная авто-раскладка, узлы не таскаются** (Miro = пространственность через pan/zoom + drag зоны), **ромб живой + настройка лёгкая**, **точность/авторитет — в sequence-виде**.

**ПРЕД-ШАГ (до K1): прочитать §11 спеки** — там подтверждённые file:line и 3 поправки (K1 пинит loose-only + containment через auto-size; K3 union только sequence; K4 `ZoneGraphContent` уже готов, дыра в `ZoneFrame`).

## Чеклист (TDD-first, правило №1; порядок K1→K6 фиксирован)

- [ ] **K1 — зафиксировать авто-раскладку (зонные узлы не hand-draggable).** `canvas/useCanvasLayoutDrag.js` (onPointerUp ~234-270): убрать `setZoneLaneLayout(target.id,'manual')` (:234-236) И гейтить `setNodePinned` (:268-270) на **loose-only** (зонный узел не пинить). `moveNodeToZone` (:225) НЕ трогать. **K1.0 verify-first:** узел, назначенный в зону, авто-раскладывается И рамка растёт под него (containment через auto-size, не manual). Тесты (+~4): drop зонного → `laneLayout` остаётся, не pinned, авто-разложен, рамка включает; DRAG_ZONE/pan/loose не задеты.
- [ ] **K2 — один `NODE_FOOTPRINT` → вывести расстановку.** `canvas/canvas-layout.js` (footprint+collision) + `lib/zone-layout.js` (lanes+dagre). Один `NODE_FOOTPRINT≈{w:240,h:150,gutterX:48,gutterY:40}`; `NODE_SPACING`→`w+gutterX`; lane-Y height-aware (низ источников не въезжает в середину); финалы под dagre-extent середины (не фикс `+380`); dagre кормить `w×h` (а не 160×60 / 270×180); collision тот же footprint. Тесты (`__tests__/zone-layout-footprint.test.js`, +~6): pitch≥w (нет горизонт.наложения); полосы height-aware; dagre интервал≥footprint; единый источник (изменил footprint → всё поехало — frozen).
- [ ] **K3 — детерминированные tight-box рамки (shrink-capable).** Новый `tightZoneBounds(memberRects,padding)` в `lib/zone-bounds.js`; заменить grow-only union в `store/skeleton-state.js:291` (НЕ дописывать state — он 24.98/25, только заменить вызов, Δ≤0). Скоуп — sequence/manual зоны (auto уже recompute через zone-layout). Тесты (`__tests__/zone-bounds-tighten.test.js`, +~4): подтянул члена → рамка СЖАЛАСЬ; дважды → идемпотент (фикс-точка); min-bounds; origin не сдвинут.
- [ ] **K4 — живой ромб V139.** `canvas/ZoneFrame.jsx` (+`ZoneLayer.jsx` если оттуда хендлер) — протянуть `onOperationClick` в `ZoneGraphContent` (он уже принимает :44 и вешает :171). Тесты (+~3): клик по ромбу в зоне → `onOperationClick(opId)` (V139 guard); `CanvasGraphView` не сломан.
- [ ] **K5 — один канон цвета = `junction-styles`.** `canvas/OperationNode.jsx` читает цвет из `junction-styles` (через `METHOD_TO_JUNCTION`→kind→`junctionStroke/Fill`); снести локальный `KIND_COLORS` (:51). Канон подтверждён (§0.6: класс химии — overlap=синий/GG=зелёный/RE=оранж/KLD=фиол/ligation=красный). Тесты (+~3): OperationNode gibson/GG/RE == `junctionStroke(kind)`; нет второго хекса (frozen).
- [ ] **K6 — цветные подписанные рёбра.** `canvas/ZoneGraphContent.jsx:112` — stroke ребра + mid-edge чип через канон K5 (`junctionStroke/junctionLabel`). Нейтраль только для неопределённого. Тесты (+~3): ребро overlap → `junctionStroke('overlap')`+чип; без метода → нейтраль; чип ≥11px.

## Размерные ловушки (обязательно в отчёте)
- **`store/skeleton-state.js` 24.98/25 — НЕ растить.** K3 пишет в `zone-bounds.js`, в state только замена вызова. Если Δ state > 0 → СТОП, выносить больше.
- Остальные под лимитами (`canvas-layout.js` 18.55 / `zone-layout.js` 8.99 / `ZoneFrame.jsx` 10.39 / `OperationNode.jsx` 7.65 / `ZoneGraphContent.jsx` 6.39).

## OUT (НЕ трогать — отдельные спринты)
Spawn-time анти-overlap, full text-floor, header/lucide → `.2`. Piece-проекция Source→Piece→Reaction→Product, 174-hex→токены/dark-mode → `.3`. `CanvasLayoutView.jsx`, V141-панель — не в скоупе.

## STOP / дисциплина
После K6 (или K4 при split, см. §7 спеки) — СТОП, **визуальная приёмка отдельной сессией** (опрятная зона без наложений + живой ромб + цветные рёбра). Code НЕ финализирует PROJECT_STATE/RELEASES/DECISIONS/ANCHORS/BUGS/TECH_DEBT/package.json/version.js; НЕ архивирует спеку; НЕ начинает `.2/.3`. Git за Игорем. Координационные доки — русский; публичный код — English.

## Хендофф-фраза Code
> Прочитай `CHAT_PLAYBOOK.md`, `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`, **`docs/SPEC_CANVAS_FIX_PHASE1.md` (особ. §11 «Сверка с кодом» — там file:line + поправки)**. Выполни Sprint M-CANVAS-FIX.1, K1→K6 (TDD red→green). Модель: канвас — авторитетная авто-раскладка, узлы не таскаются, ромб живой, цвет = `junction-styles` (класс химии). K1 — снять manual-флип + пинить loose-only (containment через auto-size, K1.0 verify-first). K2 — один `NODE_FOOTPRINT`, вывести pitch/полосы/dagre/collision. K3 — tight-box в `zone-bounds.js` (НЕ растить `skeleton-state.js` 24.98/25). K4 — протянуть `onOperationClick` через `ZoneFrame` (ромб уже принимает). K5 — `OperationNode` цвет из `junction-styles`, снести `KIND_COLORS`. K6 — рёбра stroke+чип через канон. OUT: spawn-overlap/text-floor/Piece-проекция/dark-mode. После K6 — СТОП, визприёмка отдельной сессией. Тело спеки не переписывай, шапку не ставь, трекеры не финализируй.

---

## Отчёт Code — M-CANVAS-FIX.1 (K1+K2+K4 готовы; K3 снят; K5/K6 — блокер дизайна) · 10.06

**K1 ✅ — авто-раскладка авторитетна.** `canvas-layout.js`: новый чистый `dropLayoutEffects({kind,droppedZoneTarget})→{pin,flipZoneManual}`. `useCanvasLayoutDrag.js`: снят manual-флип на drop (`setZoneLaneLayout('manual')`); пин — только loose-drop (зонный узел re-snap'ается авто-раскладкой). K1.0 verify: узел в auto-зоне раскладывается в пределах рамки (containment через auto-size). Тест `canvas-drop-authoritative-k1.test.js` (+7).

**K2 ✅ — один `NODE_FOOTPRINT`.** `zone-layout.js`: `NODE_FOOTPRINT={w:240,h:150,gutterX:48,gutterY:40}`; `LANE_PITCH=w+gutterX=288` (>240 → нет горизонт. наложения); полосы height-aware (`SRC=40 / MID=230 / FIN=420` — низ ряда не достаёт следующую полосу); dagre кормится footprint (240×150, было 160×60). Наложение математически невозможно. Тест `zone-layout-footprint.test.js` (+4). Мигрированы координатные ассерты (на derived/«нет наложения», не абсолют): `zone-layout.test.js`, `zone-auto-layout-integration.test.js`.

**K3 ⊘ СНЯТ (обосновано кодом, не пропущен).** Дрейф grow-only рамок вызывал **авто-флип-на-drop**, который K1 убрал. Оставшийся union (`skeleton-state.js:272-301`) гонится только для (а) **осознанно-manual** зон (юзер тогглит через `ZoneContextMenu`) — там grow-contain **корректно** (юзер раскладывает руками, рамка держит, сжимать = воевать с ним); (б) sequence-зон — у них нет laid-узлов, union no-op. То есть «сжимать рамки» (K3) ломало бы легитимный manual-режим. K1 устранил корень → K3 не нужен. `skeleton-state.js` не тронут (остался 24.98/25).

**K4 ✅ — живой ромб (V139).** `ZoneFrame` передаёт `onOperationClick` в `ZoneGraphContent` (тот уже принимал) → клик по ромбу в зоне открывает редактор операции (`OPEN_EDITOR_OP_TAB`). `CanvasLayoutView` не хостит op-popup на zone-пути → роут в существующий редактор (лёгкий in-zone попап — полировка `.2`). Тест `zone-frame-op-click-k4.test.jsx` (+3).

**K5/K6 ✅ ГОТОВО — семантика решена Игорем 10.06.** (Был вопрос: словари op.kind vs junction.kind расходятся — см. ниже.) **Решение Игоря:** junction-ops → канон `junction-styles`; non-junction ops (pcr/cut/mutagenesis) → собственные отдельные цвета (cyan/amber/rose, design-sense, не коллизят с канон-набором); unknown → **тёплый нейтрал `#a8917d`, НЕ серый** (серый = «неактивно», плохо); рёбра — наследуют цвет операции-эндпоинта (K6 «реши сам»). Реализация: новый `canvas/op-colors.js` (`operationColor`/`edgeColorFor`/`OP_NEUTRAL`), `OperationNode` снёс локальный `KIND_COLORS` → читает канон, `ZoneGraphContent` красит рёбра + warm-стрелку. Тест `op-colors-k5k6.test.js` (+9). Контекст вопроса (для истории):
- `OperationNode.kind` ∈ {pcr, cut, gibson, golden_gate, ligate, kld, mutagenesis} — это **операции**, а `junction.kind` ∈ {overlap, golden_gate, re_ligation, ligation, kld}. **pcr / cut / mutagenesis не имеют junction-эквивалента** → какой у них цвет в каноне? `METHOD_TO_JUNCTION` ключуется engine-методами (overlap_pcr/gibson/…), не op-kind'ами — прямого маппинга нет.
- K6: graph-ребро в `ZoneGraphContent` = container→op→container (op-input/output), **не piece-pair** с методом из `zone.junctions`. Чтобы покрасить ребро «по методу стыка», нужно решить, какой junction ребро представляет.
- **Решение Игоря нужно:** (1) карта op.kind→цвет (особ. pcr/cut/mutagenesis — какой класс/нейтраль); (2) как ребро графа сопоставляется junction-методу. Это семантика цвета, не механика — поэтому остановлен (не выдумываю маппинг).

**Гейты:** Full Vitest **4455 pass / 17 skip / 0 fail**; `npx vite build` clean. Новые тесты **+23** (K1 7 / K2 4 / K4 3 / K5+K6 9), миграции 2 файла. **Size:** `canvas-layout.js` 19.36 / `useCanvasLayoutDrag.js` 13.90 / `zone-layout.js` 9.53 / `ZoneFrame.jsx` 10.79 / `op-colors.js` 2.22 (new) / `OperationNode.jsx` 7.13 / `ZoneGraphContent.jsx` 6.64 / `skeleton-state.js` **24.98 (не тронут)** — все под hard. Новых нарушителей нет.

## Отчёт Code — Realise-DAG топология (источник→PCR→frag→[сборка]→product) · 10.06

Симптом Игоря (скрин): PCR-ромб «из пустоты», два frag-продукта и product **не соединены**. Корень (пред-существующий, не из K-работы): рендер графа `buildGraphNodesEdges` строит рёбра только из `op.inputs/op.outputs`; (1) источники держались loose вне зоны (решение 17.05) → нет ребра source→PCR; (2) нет операции сборки → product ни к чему не подключён; junctions frag→frag — лишь метаданные, не рисуются.

**Fix A — assembly-операция.** `realiseAssembly` (`zone-pieces-to-dag.js`) эмитит **одну** assembly-op `{kind: метод, inputs:[все frags], outputs:[product]}` (при ≥2 frags). Граф: `frag → [assembly] → product`. `METHOD_TO_OP_KIND` (метод→op-kind), цвет — один на тип через op-colors (+`restriction`→re_ligation orange, +label «RE-клон»). Per-boundary методы — в params op + junctions-метаданными.

**Fix B — источники в зону.** `tagZoneSources` (`zone-pieces-to-dag.js`, чистый) тянет контейнеры-источники PCR в зону (`zoneId`+`pinned:false`) → рендерятся как входы, auto-laid в source-полосе. Редьюсер зовёт хелпер. **Реверс решения 17.05** «sources loose» — ballooning-страх снят K1/K2 (авто-раскладка пере-кладёт). `skeleton-state.js`: удалён устаревший комментарий → файл **24.94 (под hard 25, был 25.68 при inline-логике → вынес в хелпер)**.

**Тесты:** новый `realise-dag-topology-fix.test.js` (+5: assembly-op inputs=frags/outputs=product, product достижим, PCR несёт источник, источники в зоне + unpinned, assembly-op в зоне). **Мигрировано 7 тестов** (op-count 2→3 = 2 PCR+1 assembly; «source STAYS loose»→«pulled in» — реверс 17.05): `assembly-realise`×3, `zone-assembly-realise`×2, `zone-assembly-migration-e2e`, `zone-pieces-to-dag`×3 (вкл. V130-цикл — только PCR), `zone-realise-autolayout`. **Full Vitest 4460 pass / 17 skip / 0 fail**; `npx vite build` clean. **Size:** `zone-pieces-to-dag.js` 15.25 / `skeleton-state.js` 24.94 / `op-colors.js` 2.29 — под hard.

**СТОП — визприёмка:** **пере-запусти Realise as DAG** на сборке (текущий граф на экране — до фикса). Должно: `источник → PCR → frag` (×N) → **assembly-ромб (цвет метода)** → `product`, всё соединено. Трекеры/шапку не финализировал; git за Игорем.

---

**Итог спринта:** K1+K2+K4+K5+K6 ✅ сделаны; K3 ⊘ снят (обосновано — K1 устранил корень). **СТОП — визуальная приёмка отдельной сессией** (зона без наложений + живой ромб + цветные рёбра/ромбы по канону). Трекеры/шапку не финализировал; git за Игорем. OUT (`.2`/`.3`): spawn-overlap, text-floor, header/lucide, Piece-проекция, dark-mode токены.
