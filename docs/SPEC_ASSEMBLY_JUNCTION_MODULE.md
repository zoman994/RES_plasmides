# SPEC_ASSEMBLY_JUNCTION_MODULE — инлайн-модуль стыка: конфиг + UI + сборочная логика

**Статус:** 🟡 черновик / к реализации
**Тип:** A (архитектура + UI + алгоритм)
**Создано:** 2026-05-29 · **переписано 2026-06-04** (выверка по коду 04.06: мёртвый `OPEN_JUNCTION_METHOD_PICKER`, три поверхности стыка, Tm-binding/Tm-tail; freshness; согласование с `SPEC_CANVAS_LIVE_PROJECTION`). Источник — 29.05-версия, не дословно.
**Роль:** владеет per-junction конфигом (`zone.junctions`), стык-контролом `JunctionControl` (монтаж-агностичный), двухуровневой сборочной логикой (фьюз vs замыкание), связкой метод↔топология, мягкой валидацией. Вызывает движок (`SPEC_PRIMER_TAIL_UNIFICATION`) за праймерами. Группировку — advisory-эвристикой, не авто-выводом.
**Сквозные решения и порядок — см. МАСТЕР-ОБЗОР в `SPEC_PRIMER_TAIL_UNIFICATION`.**

---

## §0. Срез размеров зоны правки (Code перемеряет, фиксирует в отчёте)

| Файл | Оценка | Лимит | Статус |
|---|---|---|---|
| `components/SequenceView/index.jsx` | ≈49.7 KB | .jsx 40/30 | **HARD BREACHED** (TD-SIZE-SEQUENCEVIEW-INDEX) — связывающее (J7) |
| `components/CanvasSkeleton/store/skeleton-state-zones.js` | ~10 KB | .js 25/20 | дом `zone.junctions` (подтверждено: zone-slice) |
| `components/CanvasSkeleton/store/skeleton-state-operations.js` | ~20.8 KB | .js 25/20 | soft-watch (>20) |
| `components/CanvasSkeleton/canvas/junction-styles.js` | ~7 KB | .js 25/20 | модель — читается/чуть правится |
| `components/CanvasSkeleton/canvas/zone-sequence-mode/ImplicitJunction.jsx` | ~1.5 KB | .jsx 40/30 | стык в zone-strip — UPGRADE (см. J6b) |
| `components/CanvasSkeleton/canvas/JunctionPopover.jsx` | ~9 KB | .jsx 40/30 | **готовый редактор → база `JunctionControl`** |
| `components/CanvasSkeleton/lib/auto-group-pipeline.js` | ~2 KB | .js 25/20 | advisory-эвристика, остаётся |
| `components/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx` | ~12 KB | .jsx 40/30 | монтирует editor-оверлей (J7) |
| `components/CanvasSkeleton/editor/assembly-mode/RealiseModal.jsx` / `RealiseDagPreview.jsx` | Code читает | .jsx 40/30 | → визуализация, `MethodPickerCard` удаляется |
| `components/CanvasSkeleton/editor/assembly-mode/MethodPickerCard.jsx` | ~2 KB | .jsx 40/30 | **УДАЛЯЕТСЯ** (метод в `JunctionControl`) |
| `components/CanvasSkeleton/canvas/JunctionControl.jsx` | new | .jsx 40/30 | стык-контрол (модуль) — эволюция `JunctionPopover` |

**Связывающее ограничение (J7):** `SequenceView` hard-breached → editor-оверлей `JunctionControl` **не дописывается внутрь** (CHAT_PLAYBOOK §2 п0). Монтируется оверлеем над границами; SequenceView отдаёт только offset→пиксель (если нет — минимальное thin-добавление к ref, флаг). Декомпозиция `SequenceView` — отдельный TD. **Но primary-поверхность sequence-режима — zone-strip (`ImplicitJunction`), не editor-`SequenceView`** (J6b) — она дешевле и не упирается в hard-файл.

---

## §1. Контекст — текущее состояние (сверено чтением кода 04.06)

**Сейчас:**
- **Метод стыка — свойство op-группы.** `deriveAutoPrimers(opGroup)` берёт `opGroup.kind`; GG/RE/overlap гейтятся по нему. Per-boundary метод выбирается **в `RealiseModal`** (`MethodPickerCard`, radio) — в конце, при «собрать».
- **Per-junction конфиг есть в модели, не доходит:** `junction-styles.defaultJunctionParams` (дефолт `right/30`) + `inferEndRequirements`, но движок хардкодит overlap 25 двусторонний + binding 20, а `realise.junctionForMethod` берёт только `defaultJunctionParams(kind)` (выбор юзера теряется). Раздельной Tm-binding нет.
- **🔴 Стык-элемент в zone sequence-режиме УЖЕ ЕСТЬ, но мёртв.** `ZoneAssembledView` (strip собранных pieces) рендерит `ImplicitJunction` между соседями; его `onClick` диспатчит `OPEN_JUNCTION_METHOD_PICKER {zoneId, fromPieceId, toPieceId}` — но **handler'а нет нигде** (ни zonesReducer, ни sequence-state): dispatch проваливается, ничего не открывается, конфиг не хранится. Метод `ImplicitJunction` сейчас лишь ВЫВОДИТСЯ из `acquisitionMethod` пары (`derivedJunctionMethod`), не редактируем. → Эта спека воскрешает dispatch (handler → `JunctionControl`), делает метод хранимым.
- **🔴 Граф-вид стык-элемента не имеет вовсе** — `ZoneGraphContent` рисует containers+operations+рёбра, pieces исключены (V114). Стык на графе → `SPEC_CANVAS_LIVE_PROJECTION`.
- **`JunctionPopover` (F2) — готовый богатый редактор** (6 методов + overlapTarget L/R/both + length-XOR-Tm + ends-preview + валидация), но работает на ХРАНИМОМ junction-объекте между КОНТЕЙНЕРАМИ (создаётся только ПОСЛЕ realise). Это прямая база `JunctionControl` — репойнт на `zone.junctions` (live, до realise) + добавить binding-ручку.
- **Группировка ручная** — Sew/«Auto-собрать» (гонит `auto-group-pipeline`), не на add. `auto-group-pipeline` уже несёт модель Игоря (дефолт overlap; >6 для кольца → ⌈√N⌉ бакеты + Gibson; all-restriction → restriction).
- **`segmentBoundaries(draft)`** даёт N−1 **внутренних** стыков; замыкание (последний↔первый) — не граница, а неявная `topology.circular`.
- **Два дефолта противоречат:** `auto-group-pipeline`→overlap (модель Игоря) vs `detectJunctionKind`(читается realise)→по концам.

**Модель Игоря (29.05, уточнено 04.06):**
- Двухуровневость: внутренние стыки = фьюз (overlap-ПЦР / RE); замыкание (только кольцо) = Gibson/GG/KLD/RL.
- Gibson/GG линейное не собирают → замыкающий метод ⟹ кольцо.
- Дефолт стыка = overlap; ends-детект — подсказка.
- Метод + праймеры настраиваются **у стыка, инлайн, на add** — кликом на стык-элемент в **обоих режимах зоны** (sequence-strip + граф).
- **Авто-подбор праймеров после выбора метода**, с ручными ручками: длина перекрытия, **Tm хвоста, Tm комплементарной области** (04.06).
- Группировка — пользовательский жест + advisory; Realise = визуализация/коммит; невыполнимый метод — мягко предупреждать; backbone нет.

**Разрывы (что закрывает эта спека):** хранимый дом конфига (`zone.junctions`); воскрешение `OPEN_JUNCTION_METHOD_PICKER`; стык-контрол кликом в обоих режимах (sequence-strip здесь, граф — CANVAS); метод инлайн (не RealiseModal); раздельные Tm-binding/Tm-tail; двухуровневость; метод↔топология; closure-стык; дефолт overlap; мягкая валидация; авто-сид на add; RealiseModal→viz; `MethodPickerCard` удалить.

---

## §2. Стратегия

Per-junction конфиг — единый источник правды `zone.junctions[pairKey]`, сидится на add дефолтом overlap, читается движком (дизайн) и realise. UI — **`JunctionControl` (эволюция готового `JunctionPopover`)**, монтаж-агностичный, на трёх поверхностях: zone sequence-strip (через воскрешённый `OPEN_JUNCTION_METHOD_PICKER` у `ImplicitJunction`), zone graph (`StitchMarkers` — CANVAS-спека, реюз того же контрола), assembly-editor `SequenceView`-оверлей (для глубокого редактора). Двухуровневость явная. Группировка — advisory. Реюз `JunctionPopover`/`junction-styles`/`auto-group-pipeline`/`coloredZones`/`useAssemblyPrimerWriting`. Не дублировать (§17/antipattern 8).

---

## §3. Scope

**IN:**
- `zone.junctions[pairKey]` — модель конфига (метод, overlapTarget, overlap len/Tm-tail, binding len/Tm-binding, lock), сид/жизненный цикл.
- Воскрешение `OPEN_JUNCTION_METHOD_PICKER` → handler открывает `JunctionControl` на стыке.
- `JunctionControl` — стык-контрол (эволюция `JunctionPopover`): метод + ←/⇆/→ + **хвост len|Tm + binding len|Tm** + мини-схема + подсказка + мягкое предупреждение + палитра.
- Три поверхности: zone sequence-strip (`ImplicitJunction` upgrade) — primary; assembly-editor `SequenceView`-оверлей (AssemblyShellBody); дизайн контрола реюзабельным для graph (`StitchMarkers`).
- Двухуровневость (внутр. {overlap,RE} vs closure {Gibson,GG,KLD,RL}); метод↔топология; No-PCR-сосед force+lock.
- Мягкая валидация выполнимости (варнинг, не блок).
- Авто-сид конфига + дерайв праймеров на add (вызов движка).
- `RealiseModal` → визуализация/выкладка; `MethodPickerCard` удалить.
- Группировка — пользовательский жест + advisory `auto-group-pipeline` + семантика валидности группы.

**OUT:**
- Движок хвостов/праймеров (включая длину по Tm-binding/Tm-tail) → `SPEC_PRIMER_TAIL_UNIFICATION` (вызываем; дом значений Tm-полей — здесь, расчёт — там).
- **Монтаж стык-контрола на граф-проекцию (`StitchMarkers`) + сама проекция pieces→реакции→◇ → `SPEC_CANVAS_LIVE_PROJECTION`** (реюз `JunctionControl`/`zone.junctions`).
- Де-гэп / insert-путь / RE-two-route / piece-acquisition → `SPEC_ASSEMBLY_PIECE_MODEL`.
- Декомпозиция `SequenceView` — отдельный TD.

---

## §4. Архитектурные решения

**J1. `zone.junctions[pairKey]` — дом конфига (Q6).**
- Структура: `zone.junctions: { [pairKey]: { method, overlapTarget, overlapLength, overlapTm, bindingLength, bindingTm, locked?, lockReason? } }`. `pairKey` = `${leftSegmentId}__${rightSegmentId}` (НЕ индекс — плывёт при reorder/split). В zone-draft `segment.id === piece.id` (`draftFromZone`), поэтому `OPEN_JUNCTION_METHOD_PICKER{fromPieceId,toPieceId}` напрямую даёт pairKey.
- **`overlapLength`/`overlapTm`** управляют ХВОСТОМ (перекрытие/homology-arm); **`bindingLength`/`bindingTm`** — комплементарной областью (отжиг на матрицу). Раздельны (04.06): разные физические события. Каждая пара — «длина XOR Tm».
- Живёт на зоне → существует с появления стыка (≥2 куска), переживает `disbandOpGroup`, reorder, split.
- Сид `junction-styles.defaultJunctionParams(method)` при возникновении стыка (J11); дефолт метода — `overlap` (J3). Binding-дефолт — 20/нет-Tm.
- Читается движком (`deriveAutoPrimers`, PRIMER_TAIL A3/A1b) и realise (`junctionForMethod` вместо `defaultJunctionParams`).
- Action: `setBoundaryOverlap({ zoneId, pairKey, method?, overlapTarget?, overlapLength?, overlapTm?, bindingLength?, bindingTm? })` → апдейт записи → ре-дерайв праймеров группы (сохраняя `autoMode:'manual'`).
- При reorder/split — пере-ключевание (старый pairKey → новый; осиротевшие чистятся).

**J2. Двухуровневость.**
- **Внутренние стыки** = N−1 границ `segmentBoundaries` (по `endOnAssembly`). Роль — фьюз. Методы: `{overlap, restriction}`. KLD/Gibson/GG здесь НЕ предлагаются.
- **Closure-стык** = синтетический последний↔первый, `pairKey={lastSegmentId, firstSegmentId}`, **только когда `topology.circular`**. Методы: `{gibson, golden_gate, kld, restriction(=RL)}` (+`overlap`=циркуляризация overlap-ПЦР). `segmentBoundaries` его не даёт — JUNCTION_MODULE синтезирует при кольце, off при линейной.
- **Многоуровневая** (>6 для кольца): внутренние бакеты = overlap, замыкание = Gibson — это advisory-план `auto-group-pipeline` (J10), не отдельная модель.

**J3. Дефолт = overlap; `detectJunctionKind` → подсказка.** Новый внутренний стык — `method:'overlap'`. `detectJunctionKind` вызывается, но результат — **необязательный бейдж-подсказка** в `JunctionControl` («концы как GG/RE — переключить?»), не дефолт. RE-исключение: сосед `acquisitionMethod==='restriction'` → подсказка RE сильнее (с route a/b, PIECE_MODEL), дефолт всё равно overlap до подтверждения.

**J4. Метод↔топология.** Gibson/GG/KLD/RL на closure-стыке **форсят `topology.circular=true`**. Переключение зоны в `linear` прячет closure-стык; внутренние остаются {overlap, RE}. Внутренним стыкам Gibson/GG/KLD не предлагаются.

**J5. No-PCR-сосед.** Сосед без ПЦР (`acquisitionMethod ∈ {undefined,direct,synthesis}` / встраиваемый короткий) → overlapTarget **форсится** на сторону амплифицируемого (на не-ПЦР-куске праймера нет). В `JunctionControl` позиция залочена (`locked:true`+`lockReason`), `'both'` недоступен.

**J6. `JunctionControl` — стык-контрол (эволюция `JunctionPopover`, монтаж-агностичный).**
- **База — `JunctionPopover`** (уже несёт: 6 методов из `junction-styles`-палитры, overlapTarget L/R/both, length-XOR-overlapTm, ends-preview, валидация, status АВТО/ВРУЧНУЮ). Реюз, не переписывание. Добавить: **вторую пару length-XOR-Tm для binding** (комплементарная область); фильтр методов по `role` (internal {overlap,RE} / closure {Gibson,GG,KLD,RL}); мини-схему стыка (два хвоста, кто несёт overlap, len/Tm); бейдж-подсказку (J3); lock (J5). Репойнт: работает на `zone.junctions[pairKey]` (live), не на пост-realise container-junction.
- Props: `{ offset?, pairKey, role:'internal'|'closure', config, neighbours:{left,right}, suggestion?, locked?, lockReason?, feasibility, onChange, anchorMode:'popover'|'overlay' }`. НЕ зависит от монтажника.
- Взаимодействие: клик → `onChange` → `setBoundaryOverlap` → ре-дерайв. ≤1 клик до изменения. Лёгкий popover у стыка, НЕ модалка по центру, НЕ визард (VISION «inline > wizard»).

**J6b. Поверхность sequence-режима = zone-strip `ImplicitJunction` (primary, новое 04.06).**
- `ZoneAssembledView` уже рендерит `ImplicitJunction` между соседними pieces и диспатчит `OPEN_JUNCTION_METHOD_PICKER{zoneId,fromPieceId,toPieceId}` (мёртвый — handler'а нет). Добавить handler (zone-slice / sequence-state): открыть `JunctionControl` (popover, anchored у стыка) для `pairKey=${fromPieceId}__${toPieceId}`.
- `ImplicitJunction` upgrade: метод берётся из `zone.junctions[pairKey].method` (хранимый), а НЕ `derivedJunctionMethod` (выведенный) — fallback на derived, если конфиг ещё не сидирован. Цвет/лейбл — `junction-styles` (как уже).
- Это primary-поверхность под требование «кликабелен в sequence-режиме» — дешевле editor-оверлея (J7), не упирается в hard-`SequenceView`.

**J7. Assembly-editor `SequenceView`-оверлей (вторичная поверхность, hard-gated).**
- Для глубокого редактора (открыт «🧬 сборка» → AssemblyModeShell): `JunctionControl` оверлеем над `SequenceTab`/`SequenceView`, позиционируется по offset границы. Монтирует `AssemblyShellBody` (assembly-only); абсолютный слой, читает `boundaries`+`zone.junctions`.
- `SequenceView` hard-breached → НЕ дописывать внутрь. offset→пиксель от `SequenceView` через ref (есть `scrollToPosition`; если позиционного маппинга нет — **минимальное** thin-добавление к ref-API, флаг). Учесть track/wrap/circular раскладку — Code подтверждает.
- **Library/Importer/PCR оверлей НЕ монтируют** → ноль изменений в их использовании `SequenceView` (§17). Регрессия этих виверов.

**J8. Мягкая валидация (варнинг, не блок).** Невыполнимый метод **остаётся выбираемым**, `JunctionControl` показывает причину (НЕ disabled-серость, НЕ молчаливый запрет — VISION). Правила через `junction-styles.inferEndRequirements(kind, overlapTarget, len)` vs реальные концы:
- **GG** — нет 4-нт оверхенгов / Type IIS-сайтов → варнинг.
- **KLD** замыкает ОДИН линейный фрагмент; кусков >1 → варнинг «сначала сведите к одному линейному фрагменту» (пост-мортем V14).
- **RE/RL** — несовместимые липкие (не «тот же энзим» — совместимые/изошизомеры; PIECE_MODEL) → варнинг; один энзим с обеих сторон → самолигирование/потеря ориентации → варнинг.
- **overlap** — почти всегда ok; варнинг при неизвестной последовательности.
- `feasibility` (ok | warn+reason[]) считается в JUNCTION_MODULE, передаётся в `JunctionControl`.

**J9. `RealiseModal` → визуализация/выкладка; `MethodPickerCard` удаляется (Q7).** Realise решений не принимает — всё настроено инлайн раньше. Читает готовый `zone.junctions`+куски, раскладывает блоки/DAG (`RealiseDagPreview`/`zone-pieces-to-dag`), кнопка исполняет. `MethodPickerCard` удаляется (его radio → `JunctionControl`). Code читает `RealiseModal.jsx`+`RealiseDagPreview.jsx`, снимает выбор метода, оставляет сводку+исполнение. **Координация с PRIMER_TAIL слой 2 (V130)** — не регрессить материализацию; realise теперь потребляет `zone.junctions` через `junctionForMethod`.

**J10. Группировка — пользовательская фича + advisory (НЕ авто-вывод).** Конфиг стыка (J1) ≠ группировка. `auto-group-pipeline` остаётся **advisory** (по запросу предлагает порядок: >6 → ⌈√N⌉ overlap-бакеты до ≤6 + Gibson-замыкание; биолог принимает/правит), НЕ авто на каждый add. **Семантика валидности группы:** overlap-стыки сплавляют куски в один ампликон → overlap-группа = непрерывная цепочка overlap-стыков; не-overlap стык (RE/GG/lig) = граница между фрагментами → не внутри одной fusion-группы. Эвристика/валидатор не лепят «overlap+RE в одной реакции».

**J11. Авто-сид конфига + дерайв праймеров на add.** При добавлении куска (PIECE_MODEL даёт кусок + `acquisitionMethod`): для каждого нового стыка → `zone.junctions[pairKey]` дефолтом (J3) + `feasibility` (J8) + **дерайв праймеров** (движок `deriveAutoPrimers`). Праймеры с хвостами видны инлайн сразу — без ручного Sew. Снимает гейт «сначала сгруппируй». Группировка (J10) — лишь для многоуровневых/не-overlap реакций.

**J12. Реюз `JunctionControl` граф-проекцией → `SPEC_CANVAS_LIVE_PROJECTION`.** `JunctionControl` монтаж-агностичен (J6) → канвасный `StitchMarkers` (CANVAS-спека) рендерит его же над той же `zone.junctions`. Один контрол, одна модель, три поверхности. В ЭТОЙ спеке — только держать интерфейс монтаж-агностичным; граф-монтаж — CANVAS-спека.

---

## §5. Файлы / сигнатуры (не код)

- **zone-slice** (`store/skeleton-state-zones.js` — подтверждено: дом zone-объекта): поле `zone.junctions`; action `setBoundaryOverlap(...)` (J1, +binding-поля); handler `OPEN_JUNCTION_METHOD_PICKER` → ui-state «открыть JunctionControl для pairKey» (J6b); пере-ключевание reorder/split; сид на add (J11). При росте >25 KB boundary-логику → `lib/op-boundary-config.js`.
- **`lib/junction-derive.js`** (new, тонкий): `pairKeyFor(leftId,rightId)`; `internalBoundaries(draft) → [{pairKey,offset,leftId,rightId,role:'internal'}]`; `closureBoundary(draft) → {...,role:'closure'}|null` (только кольцо); `feasibility(junction,neighbours)` (через `inferEndRequirements`); `seedJunction(method,neighbours)`.
- **`canvas/JunctionControl.jsx`** (new, эволюция `JunctionPopover`): props J6; вторая пара len/Tm (binding); фильтр методов по role; мини-схема; подсказка; lock; репойнт на `zone.junctions`. `JunctionPopover` либо переименовать/обобщить, либо `JunctionControl` оборачивает его — Code выбирает по диффу (реюз, не дубль).
- **`canvas/zone-sequence-mode/ImplicitJunction.jsx`**: метод из `zone.junctions[pairKey]` (fallback derived); onClick — существующий `OPEN_JUNCTION_METHOD_PICKER` (не менять dispatch, добавить handler).
- **`editor/assembly-mode/AssemblyShellBody.jsx`**: editor-оверлей `JunctionControl` по `internalBoundaries`+`closureBoundary` (J7); `onChange`→`setBoundaryOverlap`.
- **`SequenceView/index.jsx`**: при отсутствии — minimal ref offset→пиксель. **Тонко** (hard).
- **`RealiseModal.jsx`/`RealiseDagPreview.jsx`**: снять выбор метода → сводка+выкладка+исполнение (J9).
- **`MethodPickerCard.jsx`**: **удалить**, импорты вычистить.
- **`junction-styles.js`**: модель читается; `inferEndRequirements` — правила feasibility; дефолты +`bindingLength/bindingTm`. Минимум правок.
- **`auto-group-pipeline.js`**: advisory; экспорт «валидность группы» (overlap-цепочка vs не-overlap граница) для J10.
- **тесты**: `JunctionControl` (позиции/метод/lock/warning/binding-Tm); `junction-derive` (pairKey-стабильность reorder/split, closure только кольцо, feasibility); `OPEN_JUNCTION_METHOD_PICKER` handler открывает контрол; ImplicitJunction метод из конфига; интеграция AssemblyShellBody (оверлей N−1+closure, сид на add, ре-дерайв); регрессия Library/PCR-виверов (оверлея нет).

---

## §6. Порядок (строгий; после ENGINE слоя 2)

1. **`zone.junctions` + `junction-derive` + сид на add (J1/J2/J3/J11)** — конфиг существует, движок читает, праймеры деривятся на add.
2. **`JunctionControl` (из `JunctionPopover`) + zone-strip-поверхность (J6/J6b)** — handler `OPEN_JUNCTION_METHOD_PICKER` открывает контрол, `ImplicitJunction` показывает хранимый метод. **Primary sequence-поверхность работает.** (Дешёвая, без hard-файла.)
3. **Двухуровневость + метод↔топология + No-PCR (J2/J4/J5)** + binding/tail Tm-ручки в контроле.
4. **Editor-оверлей над `SequenceView` (J7)** — вторичная поверхность; Library/PCR не задеты.
5. **Мягкая валидация (J8).**
6. **`RealiseModal`→viz + удалить `MethodPickerCard` (J9).**
7. **Группировка-семантика + advisory (J10).**
(J12 — интерфейс монтаж-агностичен по ходу 2; граф-монтаж — CANVAS-спека.)

Каждый шаг — STOP перед визуальной приёмкой (отдельной сессией).

---

## §7. STOP + отчёт

Как `SPEC_PRIMER_TAIL_UNIFICATION` §7. Дополнительно в отчёте: handler `OPEN_JUNCTION_METHOD_PICKER` воскрешён (был мёртв); `ImplicitJunction` берёт метод из `zone.junctions`; editor-`JunctionControl` смонтирован **оверлеем** (НЕ внутрь `SequenceView`); регрессия Library/Importer/PCR-виверов; `MethodPickerCard` удалён, `RealiseModal` метод не выбирает; size budget. После реализации — статус-шапка `✅ РЕАЛИЗОВАНО [дата]`.

**Handoff (04.06).** `CURRENT_TASK.md` — лаунчер этого набора (live-junction сборка). Handoff Code кладётся в сессии старта реализации (после готовности 4 спек + freshness-пасса). V130/V131 — в `BUGS.md`.

---

## §8. Риски

1. **`SequenceView` 49.7 KB hard.** Editor-монтаж ОБЯЗАН оверлейный (J7). Primary-поверхность (zone-strip, J6b) hard-файл обходит. → приоритет шага 2 над 4.
2. **`SequenceView` — общий компонент.** → оверлей только в `AssemblyShellBody`; прочие не трогаются (§17). Регрессия виверов.
3. **`zone.junctions` по индексу плывёт** при reorder/split. → ключ = пара segmentId (J1); пере-ключевание + чистка.
4. **Closure-стык синтетический.** → синтезировать только при `topology.circular`; off при линейной.
5. **Метод↔топология форс удивит** (Gibson → кольцо). → явный визуальный фидбэк + переключаемость топологии.
6. **Ре-дерайв перетрёт ручные правки.** → `autoMode:'manual'`.
7. **Откат «авто-вывода op-групп».** Группировка ручная + advisory (J10).
8. **`RealiseModal` рефактор** трогает realise-путь (V130-зона). → координировать с ENGINE слоем 2; не регрессить материализацию.
9. **`JunctionPopover` сейчас завязан на container-junction** (после realise). → `JunctionControl` репойнтит на live `zone.junctions`; не сломать существующий вызов popover'а на канвасе (если он где-то монтируется — Code проверяет ссылки, §17/antipattern 9).

---

## §9a. Поправки выверки 04.06 (повторное чтение кода)

Перепроверка `ImplicitJunction.jsx`/`ZoneAssembledView.jsx`/`JunctionPopover.jsx`/`junction-styles.js`/`skeleton-state-zones.js`:

- **§1/J6b/§5 — диспатч в РОДИТЕЛЕ, не в `ImplicitJunction`.** Факт: `ImplicitJunction` — чистый button с `onClick`-пропом (метод выводит `derivedJunctionMethod`: pcr+pcr→`overlap-pcr`, restriction+restriction→`ligation`, иначе `gibson`). `ZoneAssembledView` (родитель) на onClick диспатчит `{type:'OPEN_JUNCTION_METHOD_PICKER', zoneId, fromPieceId, toPieceId}`. **Подтверждено:** handler'а НЕТ (`ZONE_ACTIONS` в `skeleton-state-zones.js` его не содержит, `zonesReducer` не обрабатывает); `zone.junctions`/`setBoundaryOverlap` в zone-slice НЕ существуют (J1 верна — это новое). Правка проводки: добавить handler + (опц.) репойнт `ZoneAssembledView` onClick на открытие `JunctionControl`. «ImplicitJunction диспатчит» читать «ZoneAssembledView диспатчит через ImplicitJunction onClick».
- **Словарь методов (СУЩЕСТВЕННО, к J1/J2/J4/J6).** ТРИ написания в коде (см. ENGINE §9a). **Канон:** `zone.junctions[pairKey].method` хранить в словаре ДВИЖКА (`overlap_pcr|gibson|golden_gate|restriction|direct_ligation|kld`); маппинг в `junction.kind` (для глифа/палитры/`JunctionPopover`/`inferEndRequirements`) — через `METHOD_TO_JUNCTION` (`gibson`→`overlap`, `restriction`→`re_ligation`; расширить `kld`→`kld`). Двухуровневость в РЕАЛЬНЫХ значениях: внутренние {`overlap_pcr`, `restriction`}; замыкание {`gibson`, `golden_gate`, `kld`, `restriction`} (+`overlap_pcr` circular). **«RL» НЕ id** — это `restriction`/`re_ligation`. `JunctionPopover` UI-список — это `junction.kind`-ids (overlap/golden_gate/re_ligation/kld/ligation/preformed); `JunctionControl` либо хранит method и маппит для UI, либо UI на junction.kind + конверсия на запись. Решить в реализации J6, словарь зафиксировать ДО ENGINE-слоя-2.
- **J6 база подтверждена.** `JunctionPopover` несёт всё заявленное (6 методов, target L/R/both, length-XOR-`overlapTm`, ends-preview через `inferEndRequirements`, валидация, статус АВТО/ВРУЧНУЮ). bind-пары (len/Tm) в нём НЕТ — добавить (подтверждено). `OVERLAP_KINDS` (показ overlap-параметров) = {overlap, re_ligation, golden_gate, sticky_end, kld} — при репойнте учесть.

## §9. Открытые вопросы

- Сквозные (Q1–Q7) закрыты в МАСТЕР-ОБЗОРЕ. Q4 — Code verifies pydna (ENGINE).
- **J-Q1.** offset→пиксель: `SequenceView` уже умеет (рядом со `scrollToPosition`) или нужен новый ref-метод? Касается ТОЛЬКО editor-оверлея (J7, шаг 4); primary zone-strip (J6b) от этого не зависит. Code решает чтением.
- **J-Q2.** `JunctionPopover` где-то монтируется на канвасе сейчас (на container-junction)? Если да — `JunctionControl` сосуществует с ним или заменяет? Code ищет ссылки, согласует с CANVAS-спекой (там graph-junction).
- **Согласование с PRIMER_TAIL:** поля `bindingLength/bindingTm` — дом значений здесь (`zone.junctions`), расчёт длины — движок (A1b). Согласовать имена полей ДО ENGINE-слоя-2-чтения.
