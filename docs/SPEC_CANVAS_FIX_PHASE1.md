# Sprint M-CANVAS-FIX.1 — авторитетная раскладка + живой ромб + цвет стыка (canvas core)

**Тип:** bugfix + refactor (читаемость канваса)
**База:** v0.8.7-alpha
**Предпосылка:** Игорь — «канвас плохо рендерится и грустно выглядит по логике компоновки и читаемости». Deep code-recon показал: это **не лень дизайна, а арифметика движка раскладки** — константы расстановки меньше самого блока (наложение гарантировано), одно перетаскивание убивает авто-раскладку всей зоны, анти-наложение висит на drag а не на spawn, рамки только растут, рёбра молчат. Решение Игоря по interaction-модели зафиксировано (§0.5).

> Связано с BUGS V139 (клик по ромбу мёртв в зоне), V140 (узлы не двигаются / рамка не масштабируется), V141 (панель тесная). V139/V140 закрываются этим спринтом; V141 — отдельный layout-фикс панели, OUT.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `canvas/canvas-layout.js` | 18.55 KB | 25 KB (.js) | OK |
| `canvas/useCanvasLayoutDrag.js` | 14.07 KB | 25 KB | OK |
| `lib/zone-layout.js` | 8.99 KB | 25 KB | OK |
| `lib/zone-bounds.js` | 2.15 KB | 25 KB | OK — **дом для frame-tighten (K3)** |
| `canvas/junction-styles.js` | 7.44 KB | 25 KB | OK — канон цвета (K5) |
| `canvas/ZoneFrame.jsx` | 10.39 KB | 40 KB (.jsx) | OK |
| `canvas/ZoneGraphContent.jsx` | 6.39 KB | 40 KB | OK |
| `canvas/OperationNode.jsx` | 7.65 KB | 40 KB | OK |
| `canvas/ZoneLayer.jsx` | 5.36 KB | 40 KB | OK |
| `store/skeleton-state.js` | **24.98 KB** | 25 KB | **soft+ почти hard — НЕ дописывать. K3 выносит логику в `zone-bounds.js`, в state остаётся тонкий вызов (net-neutral/shrink)** |

Ни одного файла в red zone. `CanvasLayoutView.jsx` = 14 KB (старая цифра 41 KB в TECH_DEBT устарела — НЕ блокер; вне скоупа). **`skeleton-state.js` впритык к hard** → §9 риск-bullet + K3 не растит его.

---

## 0.1. Visual reference / Source of truth

No visual reference — design на усмотрение Code в рамках `docs/DESIGN_SYSTEM.md`. Цвет реакций/стыков — **канон уже выбран (K5, §4.5): палитра `junction-styles.js`**, потому что её уже видит биолог на стыках sequence-полосы (junction-UX срезы, v0.8.7). Канвас должен совпадать со строкой: один стык — один цвет в обоих видах. Текст — 11px floor (DESIGN_SYSTEM), но full text-floor pass — отдельный спринт (OUT).

---

## 0.2. Component reuse audit

| Use | NOT use (legacy) | Reason |
|-----|------------------|--------|
| `junctionStroke`/`junctionFill`/`junctionLabel` (`junction-styles.js`) — **канон цвета** | `OperationNode.KIND_COLORS`, DESIGN_SYSTEM reaction-hex как параллельные источники | три противоречивых палитры для одной биологии; junction-styles уже live на строке стыков |
| `computeZoneLayout`/`spreadLane`/`computeAutoLayout` (`zone-layout.js`) | переписывать раскладку с нуля | движок 3-полос рабочий, чиним константы/гейт |
| `resolveNodeOverlap`/`gatherObstacleRects` (`canvas-layout.js`) | свой анти-overlap | существует, просто прицеплен к не тому событию |
| `CanvasGraphView` onOperationClick-проводка (живая) — **референс для V139** | — | в `CanvasGraphView` ромб кликается; в `ZoneFrame` тот же проп не прокинут |

Новые: `canvas/reaction-colors.js` (опц., если канон не влезает в junction-styles), хелпер frame-tighten в `zone-bounds.js`. Остальное — reuse.

---

## 0.5. Ответы Игоря (kickoff 10.06)

**Источник правды.** Снимок.

- **Q:** Канвас — ручная раскладка (Miro-драг узлов) или авторитетная авто-раскладка?
  **A:** Авторитетная авто-раскладка, **красивая read-mostly проекция**. «Miro-стиль — это про *восприятие* (пространственность/навигация), а не про перетаскивание узлов». Узлы **не таскаем руками**.
- **Q:** Что с интерактивностью внутри зоны?
  **A:** **Живой ромб (реакция) + настройка стыка/реакции должны работать легко.** Read-mostly ≠ read-only: клик по реакции/стыку конфигурит модель.
- **Q:** Где авторитет/точность сборки?
  **A:** **В sequence-виде** — «именно он позволяет увидеть взаимодействие с точностью до нуклеотида. Точность тут важнее.» Канвас — пространственная проекция этой истины.
- **Q:** Остальной диагноз (footprint SoT, frame-tighten, цветные рёбра, V139, цвет-канон)?
  **A:** Согласен.

**Следствие для interaction-модели:** узлы внутри зоны **не hand-draggable** (нет перетаскивания узла → нет войны manual-vs-auto, нет пиннинга). Канвас даёт пространственное ощущение через **pan/zoom** и **drag целой зоны** (расстановка сборок на доске), а не через таскание узлов. V140 «узлы не двигаются» → **это намеренно** (не таскаем); фиксим только «рамка не подгоняется под граф».

## 0.6. Уточнение Игоря 10.06 — цвет-канон (закрывает §10 Q1)

- **Q:** Цвет реакций/стыков/рёбер = класс химии (`junction-styles`) или семейство метода (DESIGN_SYSTEM)?
  **A:** **`junction-styles` — класс химии стыка** (overlap=синий / GG=зелёный / RE=оранж / KLD=фиол / ligation=красный). Один стык = один цвет в sequence-строке И на канвасе.

→ **K5 РАЗБЛОКИРОВАН.** §4.5 канон = `junction-styles`, без альтернативы. §10 Q1 снят.

---

## 1. Контекст

Движок раскладки (`zone-layout.js` 3 полосы: источники `y+50` / dagre-середина `y+150` / финалы `y+380`) работает, но: (1) `NODE_SPACING=200` при ширине блока `BLOCK_LINEAR_W=240` → горизонт. наложение 40px всегда; полосы `y+50/+150` при высоте 150 → вертик. наложение 50px; dagre кормят `160×60` и `270×180`, коллизии — третьим набором → **пять представлений о размере блока, наложение математически гарантировано**. (2) Любой in-zone drag ставит всей зоне `laneLayout:'manual'` + пинит узел (`useCanvasLayoutDrag.js:234-235,269`) → авто-раскладка умирает для всех соседей после первого касания, откат — спрятанный «Перестроить». (3) `resolveNodeOverlap` зовётся только на drag-drop, не на spawn → новые блоки падают в кучу. (4) Рамки только растут (`max()`/`mergeBoundingBoxes`) → дрейфуют в большие разреженные коробки. (5) Рёбра — плоские серые без подписи/цвета (`ZoneGraphContent.jsx:112`), хотя `junctionStroke/junctionLabel` уже есть. (6) V139 — `ZoneFrame` не прокидывает `onOperationClick` → ромб мёртв в зоне.

Решение Игоря (§0.5) **схлопывает половину долга выбором**: узлы авто-разложены и не таскаются → пункты (2) и часть V140 исчезают как класс. Остальное — арифметика + проводка.

---

## 2. Стратегия

Делаем канвас опрятным и читаемым через: (а) **зафиксировать interaction-модель** — авто-раскладка авторитетна, узлы не таскаются (снимаем `laneLayout:'manual'`-флип + пиннинг для зонных узлов), потому что Игорь выбрал read-mostly-проекцию; (б) **один источник размера блока** — вывести pitch/полосы/dagre/коллизии из одного `NODE_FOOTPRINT`, потому что пять расходящихся констант делают корректный интервал невозможным; (в) **детерминированные tight-box рамки** в `zone-bounds.js` (не в `skeleton-state.js` — он впритык к hard), потому что grow-only даёт дрейф; (г) **живой ромб** — прокинуть `onOperationClick` через `ZoneFrame` (V139); (д) **цвет стыка на рёбрах** через канон `junction-styles` (совпадение с sequence-строкой). Spawn-time анти-overlap, full text-floor pass, header-иерархия, lucide, Piece-проекция — OUT (отдельные спринты).

---

## 3. Scope

### IN
- `canvas/useCanvasLayoutDrag.js` — снять `laneLayout:'manual'`-флип + `setNodePinned` для **зонных** узлов на drop (зонный узел re-snap'ается авто-раскладкой; не hand-draggable).
- `canvas/canvas-layout.js` + `lib/zone-layout.js` — один `NODE_FOOTPRINT {w,h,gutterX,gutterY}`; вывести `NODE_SPACING`, lane-Y (height-aware), dagre node-size, collision-rect из него.
- `lib/zone-bounds.js` — новый чистый `tightZoneBounds(members, padding)`; `skeleton-state.js`/`zone-layout.js` зовут его вместо grow-only union (детерминированный размер = чистая функция от членов).
- `canvas/ZoneFrame.jsx` + `ZoneGraphContent.jsx` + `ZoneLayer.jsx` — прокинуть `onOperationClick` (V139) до ромба; ромб открывает op-popup/настройку.
- `canvas/junction-styles.js` (канон) + `canvas/OperationNode.jsx` — единый reaction→token; снести `KIND_COLORS`-расхождение.
- `canvas/ZoneGraphContent.jsx` — рёбра: stroke + mid-edge чип метода через канон.
- тесты: `__tests__/zone-layout-footprint.test.js`, `zone-bounds-tighten.test.js`, расширить `canvas-layout-zones.test.jsx` / `junction-contract.test.jsx` (V139 + цвет-канон).

### OUT (явно отложено → M-CANVAS-FIX.2 / .3)
- **Spawn-time анти-overlap** (новые блоки не наезжают на появлении) — .2 (нужен заход в spawn-редьюсеры; ценно, но отдельно).
- **Full text-floor pass** (11px по всем подписям, gate leader-labels мини-карты за zoom) — .2.
- **Header-иерархия зоны + lucide вместо эмодзи** — .2 (косметика).
- **Piece-проекция Source→Piece→Reaction→Product** (Piece-слой на графе) — **.3, отдельная фича** (меняет ЧТО на графе, не как).
- **174 hex → токены / dark-mode parity** — .3 (механически после канона).
- `CanvasLayoutView.jsx`, V141 панель — не трогаем.

Всё не в IN — не трогаем.

---

## 4. Архитектурные решения

1. **⚓ Канвас — авторитетная авто-раскладка, узлы не hand-draggable (Игорь §0.5).** Read-mostly проекция; пространственность через pan/zoom + drag зоны, не через таскание узлов. Снимает войну manual-vs-auto как класс. → ANCHORS.
2. **Sequence-вид — авторитет точности; канвас — пространственная проекция (Игорь §0.5).** Нуклеотидная правка идёт в sequence; канвас отражает. Определяет, что канвас НЕ обязан давать точное редактирование — только клик-конфиг реакции/стыка.
3. **Один `NODE_FOOTPRINT` — единственный источник размера блока.** Все pitch/полосы/dagre/коллизии выводятся из него (`pitch = w + gutterX`, lane-gap = `h + gutterY`). Пять расходящихся констант = наложение неизбежно; один источник = наложение невозможно.
4. **Детерминированные tight-box рамки (чистая функция от членов), в `zone-bounds.js`.** Размер рамки = `tightBox(members)+padding`, не монотонный union. Убирает grow-only дрейф И страх finalizer-loop (размер не зависит от прежней рамки → фикс-точка) → разблокирует bottom-anchor финалов (но сам bottom-anchor — опционально, см. K2). **В `skeleton-state.js` не пишем** (24.98/25).
5. **⚓ Один канон цвета реакции = `junction-styles.js`.** Стыки, ромбы-операции, рёбра читают один map. Совпадает с тем, что биолог уже видит на sequence-строке (один стык — один цвет в обоих видах). `OperationNode.KIND_COLORS` + DESIGN_SYSTEM-расхождения сводятся к нему. **Семантика (method-family vs enzyme-class) — §10 Q1, подтвердить; дефолт — текущая `junction-styles` (overlap=синий / GG=зелёный / RE=оранж / KLD=фиол / ligation=красный).** → ANCHORS.
6. **Ребро несёт метод.** Stroke + mid-edge чип через канон — самый информативный элемент перестаёт молчать; «это Gibson / это digest» читается без клика.

---

## 5. Предположения

- **Зонные узлы позиционируются финалайзером каждый reducer-pass; их stored x/y игнорируется на следующем проходе.** Источник: recon (`applyZoneLayouts`, `zone-layout.js:90`). Проверено: да. Действие: K1 — снять manual-флип безопасно, узел re-snap'ается сам.
- **`DRAG_ZONE` (перемещение целой зоны) и pan/zoom не зависят от per-node drag.** Источник: recon. Проверено: **частично** — drag зоны идёт отдельным путём. Действие: **K1 первый под-шаг — подтвердить, что снятие node-drag для зонных узлов не ломает DRAG_ZONE/pan** (тест: зону можно двигать; узел внутри re-snap'ается).
- **`junction-styles` покрывает все 6 kind + операционные методы.** Источник: junction-UX срезы (live). Проверено: да (строка стыков). Действие: K5 мапит `OperationNode` kind → junction kind через существующий `METHOD_TO_JUNCTION`.
- **`onOperationClick` + op-popup mount существуют и работают в `CanvasGraphView`.** Источник: recon (V139 — в graph-view живо, в zone мёртво). Проверено: да. Действие: K4 — та же проводка через `ZoneFrame`.
- **`tightZoneBounds` детерминирован и не зависит от прежней рамки → нет finalizer-loop.** Источник: §4.4 дизайн. Проверено: **нет**. Действие: K3 — тест «дважды применённый = идемпотентен» (фикс-точка).

---

## 6. Задачи

### K1 — Зафиксировать авто-раскладку: зонные узлы не hand-draggable

**Файл:** `canvas/useCanvasLayoutDrag.js` (onPointerUp ~234-269); `lib/zone-layout.js` (manual-гейт).

**Что делаем:** in-zone drop больше НЕ ставит зоне `laneLayout:'manual'` и НЕ пинит зонный узел. Зонный узел остаётся под авторитетом авто-раскладки (re-snap). DRAG_ZONE/pan/loose-node — не трогаем.

Логика:
1. **K1.0 (verify-first, §5):** подтвердить, что снятие node-drag-persist для зонных узлов не ломает drag зоны/pan (тест).
2. On drop зонного узла: убрать `setZoneLaneLayout(...,'manual')` + `setNodePinned(...,true)`; узел не пинится → финалайзер раскладывает.
3. `RECOMPUTE_ZONE_LAYOUT`/'Перестроить' становится не нужен для зонных узлов (раскладка всегда авторитетна) — пункт меню оставить (no-op safety), не выпиливать в этом спринте.

**Тесты** (+~4): drop зонного узла → `laneLayout` остаётся 'auto', узел не pinned; финалайзер раскладывает после drop; DRAG_ZONE двигает зону (регрессия); loose-узел drag не задет.

### K2 — Один `NODE_FOOTPRINT` → вывести всю расстановку

**Файл:** `canvas/canvas-layout.js` (footprint + collision); `lib/zone-layout.js` (lanes + dagre).

**Что делаем:** один `NODE_FOOTPRINT={w,h,gutterX,gutterY}`; `NODE_SPACING`/lane-Y/dagre-size/collision-rect выводятся из него. Полосы height-aware: низ верхней полосы не достаёт верх средней.

**Сигнатура:** `NODE_FOOTPRINT` const; `lanePitch=w+gutterX`; `laneY(i)` height-aware.
Логика:
1. Завести `NODE_FOOTPRINT` (≈ `{w:240,h:150,gutterX:48,gutterY:40}` — финальные числа Code по факту блока).
2. `spreadLane` pitch = `w+gutterX` (>240 → нет горизонт. наложения).
3. Lane-Y: источники `y0`; середина `y0 + h + gutterY`; финалы — ниже фактического dagre-extent середины (не фикс `+380`).
4. dagre кормить `w×h`; `resolveNodeOverlap`/`nodeRect` — тот же footprint.

**Тесты** (`__tests__/zone-layout-footprint.test.js`, +~6): 2 источника не наезжают (pitch≥w); полоса источников не въезжает в середину (height-aware); dagre-узлы интервалом ≥ footprint; одна точка истины (изменил footprint → все интервалы поехали согласованно — frozen).

### K3 — Детерминированные tight-box рамки (kill grow-only)

**Файл:** новый `tightZoneBounds()` в `lib/zone-bounds.js`; вызовы в `lib/zone-layout.js` (auto-size) + тонкая замена union в `store/skeleton-state.js:272-301` (НЕ растить файл — заменить, не дописать).

**Сигнатура:** `tightZoneBounds(memberRects, padding) → {x,y,width,height}` (чистая, размер не зависит от прежней рамки).
Логика: tight box членов + padding; min `{360,260}`; origin не двигаем (только размер); идемпотентно.

**Тесты** (`__tests__/zone-bounds-tighten.test.js`, +~4): удалил/подтянул члена → рамка СЖАЛАСЬ (не grow-only); дважды применил → идемпотент (фикс-точка); пустая/1 член → min-bounds; origin не сдвинут.

### K4 — Живой ромб в зоне (V139) + лёгкая настройка

**Файл:** `canvas/ZoneFrame.jsx`, `ZoneGraphContent.jsx`, `ZoneLayer.jsx`.

**Что делаем:** прокинуть `onOperationClick` (как в `CanvasGraphView`) через `ZoneFrame`→`ZoneGraphContent` до ромба; клик открывает op-popup/настройку реакции. Закрывает V139.

Логика: thread `onOperationClick` проп; ромб `onClick`→ handler; mount op-popup на zone-поверхности (или делегировать существующему хосту).

**Тесты** (+~3): клик по ромбу в зоне → `onOperationClick(opId)` (V139 регрессия-guard); ромб в `CanvasGraphView` не сломан; настройка открывается.

### K5 — Один канон цвета реакции (`junction-styles`)

**Файл:** `canvas/junction-styles.js` (канон); `canvas/OperationNode.jsx` (consumer).

**Что делаем:** `OperationNode` читает цвет реакции из `junction-styles` (через `METHOD_TO_JUNCTION` → kind → `junctionStroke/Fill`); удалить локальный `KIND_COLORS`-расхождение.

**Канон подтверждён (§0.6):** `junction-styles` — класс химии стыка. K5 не блокирован.

**Тесты** (+~3): `OperationNode` gibson/GG/RE цвет == `junctionStroke(kind)` соответствующего стыка; один map (нет второго хекса для той же реакции — frozen); kind-маппинг через `METHOD_TO_JUNCTION`.

### K6 — Цветные подписанные рёбра

**Файл:** `canvas/ZoneGraphContent.jsx` (edge render ~112).

**Что делаем:** stroke ребра + маленький mid-edge чип метода через канон K5. Gibson/digest/ligation различимы без клика.

Логика: ребро между кусками/реакцией → `junctionStroke(kind)` + чип `junctionLabel(kind)` посередине; нейтральный серый только для неопределённого.

**Тесты** (+~3): ребро overlap-стыка имеет `junctionStroke('overlap')` + чип; ребро без метода → нейтраль; чип читается (≥11px).

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → K5 → K6. K1 (модель) снимает класс багов первым; K2 (footprint) — фундамент расстановки; K3 (рамки) поверх; K4 (V139) независим; K5 (канон) перед K6 (рёбра зависят от канона). **K5 заблокирован §10 Q1.**

Оценка: ~1–1.3 дня Code. **Если K5–K6 разрастутся** (цвет-проводка по многим consumer'ам) — выделить в под-спринт **M-CANVAS-FIX.2** (цвет+рёбра+текст), оставив .1 = K1–K4 (раскладка+V139). Решение по split — Code в отчёте, если K4 превысил ~полдня.

---

## 8. STOP-условие и формат отчёта

### STOP
После commit K6 (или K4 при split) Code останавливается. **НЕ** обновляет PROJECT_STATE/RELEASES/DECISIONS/ANCHORS/BUGS, **НЕ** архивирует спеку, **НЕ** начинает .2/.3 (spawn-overlap / text-floor / Piece-проекция), **НЕ** трогает OUT. Визуальная приёмка — отдельной сессией (опрятная зона без наложений + живой ромб + цветные рёбра).

### Формат отчёта
В `CURRENT_TASK.md` блок «Отчёт Code по Sprint M-CANVAS-FIX.1»: коммиты K1–K6; размеры (особ. `skeleton-state.js` Δ — **должен быть ≤0**, K3 выносит логику; `zone-bounds.js`/`canvas-layout.js`/`zone-layout.js` Δ); Vitest baseline+Δ; build; **подтвердить чтением:** зонный drop не флипает laneLayout (K1); все интервалы выведены из одного footprint (K2.frozen); tightZoneBounds идемпотентен (K3); V139 — клик по ромбу в зоне жив (K4); один цвет на реакцию (K5.frozen); отклонения явным блоком; split-решение K5–K6 если применилось.

---

## 9. Риски

1. **`skeleton-state.js` 24.98/25 — K3 может пробить hard.** Митигация: K3 логику в `zone-bounds.js`, в state только тонкий вызов; если Δ state > 0 — Code останавливается, выносит больше. **Обязательная проверка размера state после K3.**
2. **Снятие node-drag сломает что-то, что молча на нём висело** (выделение, drop-target). Митигация: K1.0 verify-first + регрессия-тесты DRAG_ZONE/pan/loose.
3. **Footprint-рефактор сдвинет существующие layout-тесты** (ожидают старые координаты). Митигация: легитимная смена модели — мигрировать координатные ассерты на «нет наложения / pitch≥footprint», не на абсолютные числа.
4. **K5 цвет-канон сменит цвета, к которым Игорь привык на канвасе.** Митигация: §10 Q1 подтверждение ДО K5; дефолт = live-палитра строки (он её уже видит).
5. **finalizer-loop от tight-box.** Митигация: §4.4 — размер чистая функция от членов (не от прежней рамки) + K3 идемпотент-тест.

---

## 10. Открытые вопросы

1. ~~Семантика канона цвета~~ — **РЕШЕНО (§0.6, 10.06): `junction-styles` (класс химии стыка).** K5 разблокирован.
2. **Финалы: bottom-anchor или оставить под dagre-extent середины (K2.3)?** Bottom-anchor разблокирован детерминированными рамками (K3), но это +1 связь раскладки. Дефолт — под серединой (проще); bottom-anchor — .2. Подтвердить.
3. **Spawn-time анти-overlap (OUT, .2) — приоритет?** Сейчас новые блоки появляются в куче до первого re-layout. K1+K2 чинят *устойчивое* состояние, но *момент появления* — нет. Тянуть в .1 или ок отдельно?
4. **«Перестроить» (RECOMPUTE_ZONE_LAYOUT) — оставить пункт меню после K1?** При авторитетной раскладке он почти не нужен. Дефолт — оставить как safety no-op, выпилить позже.

---

---

## 11. Сверка с кодом — 10.06 (поправки к §6, перед хендоффом Code)

Спека построена на recon-агентах; перед хендоффом якоря сверены с живым кодом. Три уточнения (K2/K5/K6 подтверждены точно):

- **K1 — manual-флип намеренный (containment), но в авто-only модели снятие безопасно.** `useCanvasLayoutDrag.js:234-236` ставит `setZoneLaneLayout('manual')` сознательно (`TD-ZONE-ATTACH-CONTAINMENT H2+H3`): manual-режим даёт grow-only union, рамка обнимает брошенный узел. НО containment для **auto-зон** обеспечивает `applyZoneLayout` auto-size (`zone-layout.js:197-201` — рамка растёт под laid-extent), НЕ manual. → В авто-only модели (Игорь §0.5) снятие флипа не теряет containment: узел, назначенный в зону (`moveNodeToZone`, остаётся), раскладывается авто и рамка растёт под него. **Поправки к K1:** (а) дополнительно гейтить `setNodePinned` (`:268-270`, сейчас пинит любой container/operation drag) на **loose-only** — зонные узлы не пинить; (б) **K1.0 verify-first** проверяет именно containment: узел брошен/назначен в зону → авто-разложен И рамка включает его (через auto-size, не manual). `moveNodeToZone` (`:225`) НЕ трогаем.
- **K3 — монотонный union уже скоупнут на manual/sequence.** `skeleton-state.js:287-288` пропускает auto/graph зоны (`autoOwned = laneLayout!=='manual' && viewMode!=='sequence'` → возврат без изменений); grow-only union (`:291 mergeBoundingBoxes`) гонится **только для manual/sequence** зон. После K1 (manual почти исчезает) K3 целится в **sequence-зоны** (in-canvas sequence-preview). Auto-зоны уже recompute детерминированно (`zone-layout.js:197`), но forced-tall фиксированным `LANE_FIN_DY=380` — это **K2** (финалы под dagre-extent середины), не K3. **Поправка к K3:** заменить grow-only union (`:291`) на shrink-capable tight-box (`zone-bounds.js::tightZoneBounds`); скоуп — sequence/manual зоны; в `skeleton-state.js` только замена вызова (Δ≤0).
- **K4 — `ZoneGraphContent` уже готов, дыра только в `ZoneFrame`.** `ZoneGraphContent.jsx:44` принимает `onOperationClick`, `:171` вешает на ромб (`opData && onOperationClick ? onOperationClick : undefined`). `CanvasGraphView.jsx:56,135` определяет+прокидывает (живо). Дыра: `ZoneFrame.jsx` не прокидывает проп в `ZoneGraphContent`. **K4 уменьшается:** протянуть `onOperationClick` (хендлер из родителя `ZoneLayer`/zone-хоста) через `ZoneFrame` → `ZoneGraphContent`; сам ромб уже кликабелен при наличии пропа.

Подтверждено точно: `BLOCK_LINEAR_W/H=240/150` (`canvas-layout.js:26-27`); `NODE_SPACING=200` (`zone-layout.js:50`); полосы `50/150/380` (`zone-layout.js:32,33,43`); dagre `160×60` (`zone-layout.js:126`) ≠ `270×180` (`canvas-layout.js:233-234`); `KIND_COLORS` (`OperationNode.jsx:51`); ребро `stroke="var(--text-tertiary)"` 1.5px (`ZoneGraphContent.jsx:112-113`).

**Порядок не меняется** (K1→K6): K1 безопасен без K3 (containment через auto-size). K3 после K1 (manual ушёл → union только sequence).

---

_Спека M-CANVAS-FIX.1 — canvas core (раскладка + V139 + цвет). Follow-up: .2 (spawn-overlap + text-floor + header/lucide), .3 (Piece-проекция Source→Piece→Reaction→Product + dark-mode токены). Диагностика — workflow-разбор 10.06; решение interaction-модели — Игорь §0.5; сверка с кодом — §11._
