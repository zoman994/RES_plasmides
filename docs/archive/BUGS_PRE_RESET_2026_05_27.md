# BUGS.md — BodgeGene v0.8.3-alpha

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

**Trekking новой архитектуры (v0.6+).** v0.5 баги архивированы в `docs/archive/BUGS_v05.md`. v0.6/0.7/early-0.8 закрытые баги (V49–V57, M-B.2 + Parser-Unification 02–03.05.2026) — в `docs/archive/BUGS_HISTORY.md`. Открытые v0.5 баги, которые могут проявиться в v0.6 (биологические alg-баги P6 mutagenesis triplet, V20 split-PCR micro-fragments, V23 GG orthogonal palindromes), переоткрываются здесь по факту воспроизведения.

---

## OPEN

### Критичные

(пусто)

### Высокие

**[x] V117 — Окно «Добавить» (paste): футер с кнопками уползает за нижнюю границу вьюпорта, скроллом не достать** (FIXED 26.05.2026, репорт Игоря на приёмке Звена-2; скриншот; full Vitest 4066 pass / 17 skip / 0 fail, build clean). Функциональный — при высоком контенте модалки кнопки «Отмена/Продолжить» были недостижимы, импорт через вставку блокировался.
- **Симптом:** при выборе источника «Вставить» появляются textarea + ИМЯ + ТОПОЛОГИЯ; вместе со списком «КУДА ДОБАВИТЬ» (несколько проектов) модалка перерастает высоту окна. Футер (Отмена / Продолжить) уходит ниже экрана; внутреннего скролла нет — кнопки недостижимы.
- **Корень (по коду `AddModal.jsx`):** контейнер `add-modal` — `display:flex; flexDirection:column; overflow:hidden`, но БЕЗ `maxHeight`. Backdrop центрирует модалку (`align-items:center`); при высоте контента > вьюпорта верх и низ уходят за края, а `overflow:hidden` + отсутствие скролла отрезают футер. Средний блок-контент не является скролл-областью.
- **Фикс (по подходу):** контейнер `add-modal` получил `maxHeight:100%` (cap по content-box центрирующего backdrop с padding 6vh/4vw); средний блок-контент стал скролл-областью (`data-testid="add-modal-body"`, `flexGrow:1; minHeight:0; overflowY:auto`); header и footer закреплены `flexShrink:0`. Футер всегда виден, длинный контент скроллится внутри окна. +1 структурный тест в `add-modal.test.jsx` (modal height-capped + body scroll + footer pinned; happy-dom без layout-движка — проверяется структура DOM/стилей, не пиксели). Визуальную приёмку делает Игорь.
- **Scope:** `AddModal.jsx` (стили контейнера + body + header/footer). Тип C.

**V51 — Drag selection микролаги в SequenceView на legacy железе** (OPEN, зафиксирован 10.05.2026, обнаружен на приёмке M-X.8/M-X.9).
- **Симптом:** drag selection по плазмиде происходит с видимыми микролагами (frame drops). User-perceived choppy.
- **Среда воспроизведения:** ThinkPad 2013-го года (dev workstation Игоря). На современном железе может быть невидимо — биолог на лабовом PC 2017-2019 увидит тоже.
- **Предполагаемые корни** (не расследованы):
  - Selection state идёт через Zustand → SequenceView/index.jsx (~39 KB) rerender'ится целиком, включая несвязанные tracks (Ruler / Restriction).
  - Transient drag state не отвязан от canonical Zustand store — каждый mousemove (~120/sec) идёт через фулл store update + React rerender pipeline.
  - Нет RAF-throttling на mousemove handler.
  - SVG `<rect>` в SelectionOverlay перевычисляется на каждый frame вместо CSS transform на absolutely-positioned div.
  - Плохо настроенные `useMemo` deps в tracks — мемо не работает при фреквентных изменениях selection.
- **Чинится:** отдельным перфо-спринтом. Диагностика через React DevTools Profiler + Chrome Performance первым шагом, точечные фиксы вторым. Предполагаемый объём: 2-5 дней Code-работы. Тип спеки C, мини-спека ~5 KB.
- **Связь с Rust/Tauri:** НЕ связан. Bottleneck — React state propagation pipeline, не compute.
- **STOP-условие фикса:** на ThinkPad 2013 или эквиваленте — selection drag smooth, нет visible frame drops на плазмиде до 15 kb.

**V101 — Вставленный свой сиквенс не приземляется в сборку; после round-trip канвас↔сборка фрагмент потерян** (OPEN, зафиксирован 22.05.2026; диагностика по коду 20 файлов assembly/pieces/zone). Функциональный — блокирует вставку custom-сегмента в сборку.
- **Симптом (репорт Игоря, живой тест):** в paste-секции пикера сборки вставлен свой сиквенс (5941 bp). После вставки сборка читается пустой — «бросает в выборщик». Если выйти на канвас и вернуться в сборку — сегмент не сохранён.
- **Статус диагностики:** детерминированный путь вставки прослежен по 20 файлам — zone-путь (`INSERT_MANUAL_SEGMENT` → `routeAssemblyWriteToZone` → `createPieceInZone` → `CREATE_PIECE`) и legacy-путь (`commitDraft` → `addSegment`). Путь **статически чист**: пирс проходит инварианты (`validateShape` принимает gap-пирс — 5941 < `GAP_MAX_LENGTH` 10000, `manual-gap` ∈ ORIGIN_ENUM; `validateDraft` принимает manual-сегмент), создаётся, зонируется, персистится (`pieces`/`zones` не transient), `draftFromZone` его читает, финализаторы (`applyAutoReactions`/`applyZoneLayouts`) не трогают, `zonesReducer` геометрически не выселяет. Баг в чистом редьюсер-пути НЕ воспроизводится → корень динамический (runtime / re-render / persistence-тайминг / session-state), статикой не ловится.
- **Реальные смежные дефекты, найденные по дороге (чинятся независимо):** D1 — `commitDraft` тихий no-op при `idx<0` (legacy-путь, без тоста); D2 — zone-кап `GAP_MAX_LENGTH=10000` режет вставку плазмиды >10 kb (НЕ корень V101 — Игорь вставлял 5941, под капом); D3 — мёртвая рассинхрон-константа `ASM_CAPS.gapMax=200`.
- **Подход:** не чинить вслепую — reproduction-first. Шаг 1: full-flow интеграционный тест точного сценария Игоря (свежая зона → вставка через пикер → assert `draft.segments` → round-trip → assert). Красный → корень найден. Зелёный → инструментация живого пути (`onPasteSequence`/`routeAssemblyWriteToZone`/`createPieceInZone`/`draftFromZone`). Детали, дерево решений, hardening D1-D3 — `docs/SPEC_V101_PASTE_SEGMENT_PERSISTENCE.md`.
- **Нужно от Игоря для ускорения:** тост при вставке (текст?), консоль F12 в момент вставки, длина пасты в случаях потери, свежая/старая сборка.
- **Scope:** диагностика + hardening D1-D3. Мини-спека тип C — `docs/SPEC_V101_PASTE_SEGMENT_PERSISTENCE.md`. НЕ выдавать Code одновременно с editable-assembly S1 (обе правят `AssemblyShellBody.jsx`).

**[x] V88 — В пикере «Выбор фрагмента» не работает выбор фрагмента двумя кликами по RE-сайтам** (FIXED 21.05.2026; pair-state в RangePickerModal + 3 теста range-picker-re-pair-v88).
- **Симптом:** sub-header пикера advertises режим «RE-сайт», но выбор фрагмента между двумя рестриктазами не работал.
- **Фикс:** RangePickerModal получил state `firstRESite`. Первый клик RE-site A → snap на recognition span + store A. Второй клик RE-site B → выделение [cutA, cutB] = [siteA.position+cut[0], siteB.position+cut[0]] (top-strand cut), reset. Курсор/numeric/feature сбрасывают накопленный RE. Footer hint показывает «RE-сайт A зафиксирован — кликни второй RE...». Test escape hatch — window event `__v88_re_click__` для unit-testing pair-math (реальный SVG-click тяжело симулировать в happy-dom).

**[x] V92 — Панели, открываемые кнопкой «Палитра», невозможно закрыть** (FIXED 21.05.2026; per-panel × close + Палитра restore + 4 теста panel-close-v92).
- **Симптом:** при нажатии «Палитра» в редакторе сборки появляются панель «Схема сборки» и соседние колонки (фильтр контейнеров, инспектор сегмента). Закрыть/свернуть их нельзя — нет close-контрола, повторное нажатие «Палитра» не убирает.
- **Фикс (вариант «каждая панель получает close» из Подхода):** `AssemblyPipelinePanel` / `AssemblySidebar` / `AssemblyPrimersPanel` получили × кнопку (`*-close` testid). Hidden-state живёт в `AssemblyShellBody` как `hiddenPanels: Set<string>`. «Палитра» в `AssemblyHeader`: если ≥1 панель скрыта → клик восстанавливает все (label «🎨 Палитра ↩», accent background); иначе — открывает color legend как раньше.

**V109 — Диалог «Realise as DAG» игнорирует тип op-группы, дефолтит в Gibson** (OPEN, зафиксирован 23.05.2026, walkthrough overlap-PCR WT-B-7; диагностика по коду `assembly-realise-suggest.js`). Функциональный — теряется протокол/интент дизайна (не молекула: Gibson и overlap-PCR оба работают на 25-нт хвостах).
- **Симптом:** op-группа в редакторе сборки = «Overlap PCR», но диалог «Реализовать» на каждую границу по умолчанию предлагает Gibson. «Реализовать» без ручного переключения радио → реализация как Gibson.
- **Корень (по коду):** `suggestMethodForBoundary` (`assembly-realise-suggest.js`) детектит праймеры границы через `getBoundaryPrimerInfo`, который ищет ТОЛЬКО legacy-форму (`state.assemblyDraftPrimers` со `source.kind==='boundary'`). Праймеры от «Auto-собрать» (`deriveAutoPrimers`/`primer-derive.js`) имеют форму `origin.kind==='auto-from-group'` (поля `source` нет) → `hasPrimer:false` → дерево решений падает в дефолт `gibson`. Диалог не читает `opGroup.kind` вообще. Корень — раскол двух систем сборки (op-группы+`primer-derive.js` vs assemblyDrafts+`assembly-primer-utils.js`).
- **Подтверждено (WALKTHROUGH §F):** `realiseAssembly` ручной выбор радиокнопки честно применяет (`perBoundaryMethods[i]`→`junctionForMethod`) — баг только в *дефолте* радио.
- **Подход:** диалог / `suggestMethodForBoundary` читают `opGroup.kind` существующей группы как первоисточник; либо `getBoundaryPrimerInfo` расширить на форму `auto-from-group`.
- **Scope:** `assembly-realise-suggest.js`. Тип C. Детали — `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §A WT-B-7 + §F.

### Средние

**[x] V85 — Пикер контейнера в «+ Плазмида» (новая сборка) не переиспользует библиотечный рендер entry** (FIXED 21.05.2026; `PlasmidMiniMap` 20×20 thumb в EntryRow + `extraBadge` inline вместо absolute overlap + 4 теста PlaceholderTreePicker-v85).
- **Симптом:** PlaceholderTreePicker рисовал плоский текст без минимап; бейдж проекта в «Другие проекты» налезал на «N bp · circular».
- **Фикс:** EntryRow получил `<PickerMiniThumb entry/>` (20×20 PlasmidMiniMap для circular/linear-with-features; fallback одно-`<line>` SVG для primer / empty linear — тот же подход как Library/tree/TreeItemRow.MiniIcon). «Другие проекты» теперь передаёт `extraBadge={projName}` — рендерится inline ПЕРЕД bp-счётчиком, не overlap. `LibrarySearchBar` уже использовал MiniPlasmidMap (K2.1), визуал теперь parity между двумя пикерами.

**[x] V86 — Пустое состояние сборки обещает кнопку «+ Плазмида», которой нет** (FIXED 21.05.2026; SegmentList footer copy-fix + 3 теста SegmentList-empty-text).
- **Симптом:** текст пустого состояния — «используйте кнопки внизу: + Плазмида / + Обвес / + Синтез / + Gap», но кнопками отрисованы только Обвес/Синтез/Gap; +Плазмида = библиотечный список выше, не кнопка.
- **Фикс:** SegmentList footer hint → «Сегментов нет. + Плазмида — выбор из списка выше; кнопки: + Обвес / + Синтез / + Gap.». ASSEMBLY_EDITOR_SMOKE_PLAN.md обновлён.

**[x] V87 — В пикере «Выбор фрагмента» сиквенс за границей выбранного диапазона не затеняется** (FIXED 21.05.2026; новый `OutOfRangeMaskOverlay` + opt-in prop `outOfRangeMask` в SequenceView + 4 теста out-of-range-mask-v87).
- **Симптом:** в range picker сиквенс после end-divider рендерился тем же контрастом, что и выбранная часть.
- **Фикс:** новый overlay `OutOfRangeMaskOverlay` рисует translucent rgba(245,245,244,0.65) маску на main-band rows ВНЕ `[start,end]` — на character-granularity (partial rows работают). SequenceView получил opt-in prop `outOfRangeMask={{start,end}}`, SequenceTab — pass-through. RangePickerModal передаёт `{start,end}` когда `hasSelection`. Library/Importer/PCR не передают prop → overlay не рендерится (back-compat).

**[x] V89 — Выбор фрагмента через RE-сайт не задаёт лигирование как предполагаемый метод клонирования** (FIXED 21.05.2026; acquisitionMethod через insertSegment → piece → auto-group + 6 тестов auto-group-pipeline-restriction-v89).
- **Ожидаемое:** RE-сайт выбор → `piece.acquisitionMethod='restriction'`, auto-grouping → `kind='restriction'` (RE-клонирование/ligation), а не PCR/Gibson.
- **Фикс:** RangePickerModal в onConfirm payload теперь передаёт `acquisitionMethod`. `actions.insertSegment(..., opts)` принимает `{acquisitionMethod}` → action.acquisitionMethod → reducer mapping в `ACQUISITION_METHOD_ENUM`: 'restriction' → 'restriction'; cursor/feature/numeric → 'undefined' (валидный enum). `autoGroupPipeline` если ВСЕ un-grouped sources имеют `acquisitionMethod='restriction'` → `kind='restriction'` для всех layers (включая layer-1 финал). Смешанные сборки → previous overlap_pcr/gibson default (back-compat).

**[x] V90 — Вкладка редактора показывает «(пустой)» и не обновляется под содержимое** (FIXED 21.05.2026; EditorTabStrip dual-resolve через `selectAssemblyTarget` + 3 теста editor-tab-strip-v90).
- **Корень:** EditorTabStrip для assembly-таба искал draft только в `state.assemblyDrafts`. Когда таб открыт на zone id (T6 архитектура), legacy slice пуст → fallback на «(пустой)», даже если у зоны есть имя.
- **Фикс:** `StoreTab` + `PropTab` используют `selectAssemblyTarget(state, tab.assemblyDraftId)` — тот же dual-resolve, что у `AssemblyModeShell` + `SegmentDetailPanel`. `EditorWindowShell` теперь прокидывает `zones`+`pieces` в `EditorTabStrip` для prop-mode path. Legacy assemblyDrafts путь сохранён, «(пустой)» остаётся только для unresolved-id.

**[x] V91 — MiniProjectCanvas в развёрнутом виде перекрывает правую панель редактора** (FIXED 21.05.2026; default `collapsed: true`).
- **Симптом:** развёрнутый мини-канвас перекрывал «Праймеры/Границы» и поле поиска.
- **Фикс (вариант «дефолт свёрнутый» по spec):** `MiniProjectCanvas.useState(collapsed)` initial = `true`. Биолог разворачивает кликом по иконке 🗺. V81 collapse/expand cycle сохранён. Существующие К4 / V68 тесты получили `expandMini()` helper перед marker-checks.

**[x] V93 + V94 — «Палитра» / «Источник» / инспектор «Сегмент» дублируют управление; сводим в строку «Источник»** (FIXED 21.05.2026; SegmentDetailPanel orphan + inline editor в SegmentList rows + AssemblyHeader без color legend + 6 тестов segment-inline-editor-v94 + регрессионные тесты обновлены).
- **V93 симптом:** «Палитра» открывала дропдаун с цветовой легендой; цвет также в swatch'ах нижней строки + в инспекторе → три точки управления.
- **V94 симптом:** правый инспектор «Сегмент» (Source / Range / RC / Color / Label / Apply / Delete) дублировал нижнюю строку.
- **Фикс (поглощение V93 в V94):** `SegmentDetailPanel` больше не монтируется в `AssemblyShellBody` (import закомментирован). Новый `SegmentRow` в `SegmentList` несёт chevron ▸/▾ — expand раскрывает inline-editor с теми же контролами (range / RC / color-swatch с inline color picker / label / Apply / Convert-to-gap для orphan). Color-swatch в строке «Источник» теперь интерактивный → открывает color picker. `AssemblyHeader.Палитра` потерял color legend (V93) — кнопка остаётся как V92 restore-panels-when-hidden affordance, tooltip направляет на цвет в строке. RC apply вызывает `toggleSegmentRc` (recompose'ит sequence) вместо generic UPDATE_SEGMENT.

**[x] V95 — Панель «Фильтр по контейнерам проекта» — неясное назначение, громоздкая** (FIXED 21.05.2026; explicit header + collapsible body + 5 тестов sidebar-compact-v95).
- **Симптом:** filter input без header'а, контейнерский список занимал крупную колонку без явного объяснения назначения.
- **Фикс (вариант «компактный + сворачиваемый», без слияния с верхним поиском):** AssemblySidebar получил explicit header «Контейнеры · N» (uppercase letter-spacing, title-tooltip объясняет «источник для drag в strip»). Body (filter + items list) collapsed by default; chevron ▸/▾ раскрывает. Header остаётся видимым в compact mode — биолог видит counter и может развернуть когда нужно. × close (V92) сохранён.

**V98 — OutOfRangeMaskOverlay не затеняет текст на wrap-tail строках** (OPEN, зафиксирован 22.05.2026; диагностика по коду OutOfRangeMaskOverlay.jsx / wrap-tail.js). Визуальный — диапазон и выделение считаются верно, неверно ложится только dim-маска; работу не блокирует.
- **Симптом:** контейнер открыт как плазмида (circular) в редакторе сборки. «Просмотр через ориджин» (wrap-bridge с жёлтым разделителем) рендерится корректно, но текст на строке после ориджина (trailing-wrap) не затеняется out-of-range маской.
- **Корень (по коду):** `OutOfRangeMaskOverlay` затеняет участки ВНЕ `[rangeStart,rangeEnd]` построчно. `buildWrapTailLines` (`lib/wrap-tail.js`) даёт wrap-tail строкам РЕАЛЬНЫЕ абсолютные координаты `start` (trailing начинается с `cpl − bridge.wrapAt` — на pUC19 432 bp это 88, не 0; leading — с `seqLen − leadCnt*cpl`), `SequenceLine` кладёт это в `data-line-start`. Ветка `main` overlay'я читает `data-line-start` и считает маску верно. Ветки `trailing-wrap` и `leading-wrap` `data-line-start` ИГНОРИРУЮТ — хардкодят, будто строка показывает `[0,lineLen)` (trailing) / `[L−lineLen,L)` (leading). → на строке после ориджина маска ложится на неверные колонки либо промахивается → текст не затеняется. Ветка `wrapsOrigin` (bridge) корректна — отсюда «просмотр через ориджин работает».
- **Подход для Code:** ветки `trailing-wrap` / `leading-wrap` читают `lineStart` из `el.dataset.lineStart` и считают маску так же, как `main` (`lineLen = min(cpl, L−lineStart)`, пересечение OOR-сегментов с `[lineStart, lineStart+lineLen)`, колонка = `pos−lineStart`). Три ветки можно слить в одну; `wrapsOrigin`-bridge оставить отдельной — не трогать.
- **Тест:** `OutOfRangeMaskOverlay` с fake `trailing-wrap`/`leading-wrap` строками с `data-line-start > 0` — mask-rect на колонках `pos−lineStart`, не `pos`. Регрессия V87 (`main`/`wrapsOrigin`) зелёная.
- **Scope:** `OutOfRangeMaskOverlay.jsx` (ветки trailing/leading-wrap). Мини-спека тип C — `docs/SPEC_V98_OOR_MASK_WRAPTAIL.md`.

**V99 — Клик по entry в LibrarySearchBar на canvas авто-открывает редактор сборки** (OPEN, зафиксирован 22.05.2026; диагностика по коду CanvasLayoutView.jsx). Поведенческий — фрагмент добавляется, но клик дерейлит в редактор; работу не блокирует.
- **Симптом:** клик по элементу в дропдауне «Поиск в библиотеке» на canvas сразу открывает редактор сборки. Ожидается: фрагмент просто помещается на canvas, без авто-открытия.
- **Корень (по коду):** `LibrarySearchBar` при клике зовёт `onSelectEntry` (пикер не открывает). Caller — `onSearchPick` в `CanvasLayoutView.jsx`, ветка `kind === 'library'`: (1) `addContainerFromEntry(entry)` — кладёт контейнер на canvas (верно), (2) в `setTimeout` — создаёт zone, переносит контейнер в неё, вставляет сегмент и `openEditorAssemblyTab` — открывает редактор. Шаг 2 — поведение AE-K10 («container always belongs to a zone»). Drag-drop путь (`use-tree-drop-target` → `ADD_CONTAINER_FROM_ENTRY`) кладёт контейнер БЕЗ zone-wrap и редактора — клик и drop несогласованы.
- **Подход для Code:** в `onSearchPick` library-ветке убрать весь `setTimeout`-блок (zone-wrap + `openEditorAssemblyTab`), оставить только `addContainerFromEntry(entry)`. Отменяет click-поведение AE-K10 (DEC-реверс добавляет Chat при финализации). Редьюсер `ADD_CONTAINER_FROM_ENTRY` не трогать — он корректен.
- **Тест:** клик library-entry → `state.containers` +1, редактор НЕ открыт (`editorOpen` false), zone НЕ создана. Клик и drop дают один результат.
- **Scope:** `CanvasLayoutView.jsx` (`onSearchPick` library-ветка, удаление ~25 строк). Мини-спека тип C — `docs/SPEC_V99_CANVAS_CLICK_ADD.md`.

**V100 — Drop контейнера авто-создаёт proximity-junction между рядомстоящими блоками (мёртвый функционал)** (OPEN, зафиксирован 22.05.2026; диагностика по коду useCanvasLayoutDrag.js). Поведенческий — создаёт ложные junction'ы, вводит в заблуждение; работу не блокирует.
- **Симптом:** рядомстоящие контейнеры на canvas авто-коннектятся junction'ом «auto». Мёртвый функционал — связывание контейнеров теперь идёт через zones / редактор сборки.
- **Корень (по коду):** `useCanvasLayoutDrag.js`, `onPointerUp` — при drop контейнера с движением вызывает `computeAutoJunctions(containers, positions)` (парит блоки по близости) → `reconcileAutoJunctions(pairs)` → junction `status:'auto'`. `reconcileAutoJunctions` — единственный создатель junction'ов между контейнерами (`JunctionPopover` только меняет kind существующего).
- **Подход для Code:** убрать блок `computeAutoJunctions` + `reconcileAutoJunctions` из `onPointerUp` (ветка `dragging.kind === 'container'`) + dead import `computeAutoJunctions`. Прочая drop-логика (zone hit-detection, `setNodePinned`, `justDraggedRef`) — остаётся.
- **DEAD-code хвост (отдельная задача):** после фикса мёртвы — `RECONCILE_AUTO_JUNCTIONS` + `computeAutoJunctions`, junction SVG-слой в `CanvasLayoutView.jsx`, `JunctionPopover`/`JunctionMethodPicker`, `SET_JUNCTION_*`/`REMOVE_JUNCTION`/`RESET_JUNCTION_TO_AUTO`, `junction-styles`. Снос уменьшит `skeleton-state-canvas.js` (TD-SKELETON-STATE-SIZE). Объём DEAD-sweep решает Игорь.
- **Тест:** drag контейнера и drop рядом с другим → `state.junctions` пуст.
- **Scope:** `useCanvasLayoutDrag.js` (`onPointerUp`, удаление ~5 строк). Мини-спека тип C — `docs/SPEC_V100_KILL_PROXIMITY_JUNCTION.md`.

**[x] V96 — Overlay выделения/каретки рендерился по устаревшей геометрии до завершения two-phase render** (FIXED — подтверждён по коду 24.05.2026, все 5 overlay-файлов; исправлен Code ранее; баг не воспроизводится в живом приложении).
- **Симптом был:** при первом открытии любого sequence-viewer'а оранжевый highlight выделения «съехавший» — патчевый, смещён, местами половинной высоты; любой клик чинил навсегда.
- **Корень был:** overlay-компоненты меряют геометрию строк в `useLayoutEffect`; после two-phase tracksReady-флипа (фаза 2 добавляет треки, строки растут) effect не перезапускался — в deps не было ничего, что меняется при reflow.
- **Фикс (подтверждён чтением всех 5 файлов):** во всех пяти overlay'ях — `SelectionOverlay`, `CaretOverlay`, `OutOfRangeMaskOverlay`, `SearchHitsOverlay`, `SegmentZonesOverlay` — введён prop `layoutEpoch` (комментарий `// V96` в каждом), он стоит последним в deps `useLayoutEffect`. SequenceView бампает `layoutEpoch` при ЛЮБОМ reflow (two-phase tracksReady, wrap-tail, charsPerLine) — решение шире исходной спеки (та предлагала узко пробросить `tracksReady`). Overlay пересчитывается на финальном layout сам, без клика.
- **Примечание:** Chat-звено по V96 формально не открывалось — Code сделал фикс сам; в `ZVENO_LOG.md` отдельной Z-строки нет. Спека `docs/SPEC_V96_OVERLAY_GEOMETRY.md` — кандидат в `docs/archive/`.

**[x] V97 — Клик по RE-сайту вызывал `onSiteClick` дважды; выбор фрагмента между двумя сайтами схлопывался** (FIXED — подтверждён по коду 24.05.2026; исправлен Code ранее — вероятно попутно в одном из батчей `tracks/` V111–V114; баг не воспроизводится в живом приложении, выбор фрагмента по RE-сайтам работает).
- **Симптом был:** в range picker'е клик по второму RE-сайту — фрагмент между сайтами появлялся, но после mouseup схлопывался на второй сайт. Выбрать фрагмент между двумя рестриктазами было невозможно.
- **Корень был:** RE-сайт `<g>` в `RestrictionTrack.jsx` вешал `onSiteClick` на ДВА события — `onMouseDown` и `onClick`; `preventDefault()` на `mousedown` НЕ гасит `click` → `onSiteClick` вызывался дважды за клик.
- **Фикс (подтверждён чтением `RestrictionTrack.jsx`):** в коде стоит ровно предложенный дедуп — per-instance `mouseHandledRef = useRef(false)` (комментарий `// V97`): `onMouseDown` ставит флаг и вызывает `onSiteClick`; `onClick` при выставленном флаге — сброс и `return`; без флага (тест-среда, `fireEvent.click` без `mousedown`) — обрабатывает как раньше (V88-покрытие сохранено).
- **Примечание:** Chat-звено по V97 формально не открывалось — Code сделал фикс сам; в `ZVENO_LOG.md` отдельной Z-строки нет. Спека `docs/SPEC_V97_RE_DOUBLE_FIRE.md` — кандидат в `docs/archive/`.

**[x] V116 — Новый проект открывался в устаревшем DAG-workspace вместо Библиотеки** (FIXED 24.05.2026; коммит `95e3648`; full Vitest 4049 pass / 17 skip / 0 fail, `vite build` clean; принят Игорём в живом приложении; `ZVENO_LOG.md`).
- **Симптом был:** создание проекта из палитры «Все проекты» (`CommandPalette`, кнопка «+ Создать проект») открывало устаревший `DagWorkspace` (палитра «УЧЕБНЫЕ / DEMO» / «КАТАЛОГ SNAPGENE» / `PreviewDrawer`) вместо актуальной Библиотеки (`LibraryWorkspace`).
- **Корень (подтверждён рантайм-фактом через Claude in Chrome):** `createProject` (`store/projectSlice.js`) в своём `set` жёстко ставил `canvas.activeFullscreen='dag'` + `navStack` на `dag`. `App.jsx` при `activeFullscreen==='dag'` рисует overlay `<DagWorkspace>`, минуя `WorkspaceRouter`/`LibraryWorkspace`. `CommandPalette.onCreate` был корректен — баг не в кнопке. Нарушал контракт «mode stays Library»: `activateProject` рядом специально перестал трогать `activeFullscreen` («FAIL-fix-pass 4»), `createProject` остался не поправлен.
- **Фикс (`createProject` в `projectSlice.js`):** убраны `activeFullscreen='dag'`/`navStack:[dag]`; вместо них `activeFullscreen='library'` + `navStack:[{fullscreen:'library', payload:{projectId}}]` (`'library'` нет в overlay-switch `App.jsx` → `overlayContent===null` → рендерится `WorkspaceRouter`/Библиотека); после `set` — `get().setActiveWorkspace('library')`. +1 новый тест, 4 существующих обновлены под новое поведение. Решение Игоря: новый проект сразу в Библиотеке.
- **⚠ Size-budget:** `projectSlice.js` 26.40 → 26.94 KB — был над `.js` hard 25 KB ДО правки; Code пометил кандидатом в Watch list `TECH_DEBT.md` (декомпозиция не делалась — вне скоупа Звена).
- **Смежное (ОСТАЁТСЯ, НЕ в скоупе V116):** `activateProject`/`openProjectFromIndexedDB`/`openProjectFromFileData`/`retryAcquireLock` по-прежнему садят на `'dag'` — это открытие существующего проекта; перевод в Библиотеку — отдельное звено по решению Игоря.

**[x] V102 — Wrap-tail строки циркулярной плазмиды затеняются для ЛЮБОЙ плазмиды, даже целиком видимой на экране** (FIXED 22.05.2026; origin-crossing gate; full Vitest 4001 pass / 18 skip / 0 fail [1 pre-existing waitFor-flake не воспроизвёлся на re-run], build clean). Визуальный — последовательность читаема, но крупный блок строк выглядит «выключенным/disabled»; повторяющаяся жалоба Игоря.
- **Симптом (скриншоты pUC19 432 bp, pGEX-4T-1 363 bp, Library-инспектор → таб Sequence):** часть последовательности «после разделителя» (origin-divider) рендерится приглушённой — серый фон + блёклый текст. Биолог видит небольшую плазмиду целиком, но ~половина строк выглядит затенённой. «все так же проблема с затенением последовательности после разделителя».
- **НЕ V98, отдельный механизм:** V98 — OOR-маска НЕ докладывает затенение текста (RangePicker, opt-in `outOfRangeMask`, «слишком мало»). V102 — обратное, «слишком много». OOR-оверлей в Library-инспекторе ВЫКЛЮЧЕН (opt-in, prop не передаётся) → видимое затенение это НЕ он, а собственный `opacity` wrap-tail строк.
- **Корень (по коду `lib/wrap-tail.js`):** для циркулярной плазмиды viewer вставляет leading/trailing «wrap-tail» строки (контекст до/после origin для primer-hat'ов, пересекающих ориджин) — они рендерятся приглушёнными (`opacity ~0.5`, `pointer-events:none` — см. docstring `wrap-tail.js`). `shouldEnableWrapTail` ПО ЗАМЫСЛУ (его же docstring) должен отключать wrap-tail когда плазмида целиком помещается в viewport. Но «fits in viewport» auto-disable check **удалён** (комментарий в коде «06.05.2026 round 4»): SequenceView смонтирован внутри scroll-parent'а — его собственная `clientHeight` равна полной высоте контента, не видимой области → проба всегда говорила «помещается» и глушила wrap-tail везде. Вместо надёжной пробы поставили «enable whenever ≥3 main lines». Итог: `shouldEnableWrapTail` возвращает `true` для ЛЮБОЙ циркулярной плазмиды с ≥3 main-строк. `pickWrapTailLines`: ≥5 строк → 2, ≥3 → 1 wrap-tail строки С КАЖДОЙ стороны. pUC19 (432 bp, ~5 main-строк) → 2 leading + 2 trailing приглушённых строки на полностью видимой плазмиде — ровно жалоба Игоря.
- **Возможность решения (рекомендация — origin-crossing gate, детерминированный):** wrap-tail существует для контекста аннотаций / primer-hat'ов / выделений, ПЕРЕСЕКАЮЩИХ ориджин (прямо заявлено в docstring `wrap-tail.js`). Рендерить wrap-tail строки только если есть annotation / primer / selection, чей span реально оборачивается через ориджин (`end > seqLength` → возврат в 0). Когда ничего ориджин не пересекает — wrap-tail контекста не несёт → не рендерить. Детерминированно, без хрупкой viewport-пробы (та уже провалилась раз — «06.05 round 4»). Сигнатуру `shouldEnableWrapTail` расширить на annotations/primers/selection — caller `SequenceView/index.jsx` их уже имеет. Trade-off: длинная плазмида со скроллом, где ничего не пересекает ориджин, потеряет «контекст начала при скролле к концу» — приемлемо (docstring заявляет цель именно как primer spanning origin). При желании Игоря — добавить вторичный viewport-fit gate надёжно: `ResizeObserver` на ближайшем scrollable-ancestor'е (замена удалённой неработавшей пробы), wrap-tail off когда `mainLines × lineHeight ≤ clientHeight scroll-parent'а`.
- **Альтернатива (минимальная, если origin-crossing избыточен):** поднять `MIN_TOTAL_LINES_FOR_WRAP_TAIL` с 3 до ~15-20 — wrap-tail только для реально длинных плазмид (короткие, видимые целиком — никогда). Грубая эвристика, но детерминированная и нулевой риск.
- **Связь с V98:** обе про один визуальный регион (wrap-tail). V98 в текущем батче V97-V100 у Code (реализован, ждёт приёмки) — при правке условий рендера wrap-tail (V102) проверить, что V98-фикс OOR-маски не разъезжается.
- **Scope:** `lib/wrap-tail.js` (`shouldEnableWrapTail` + сигнатура) + callsite `SequenceView/index.jsx`. Мини-спека тип C.
- **Фикс (origin-crossing gate — рекомендация спеки):** `shouldEnableWrapTail` получил параметр `originCrossing`; новый чистый `hasOriginCrossingSpan({annotations, primers, caretPos, caretAnchor, seqLength})` детектит span, оборачивающий ориджин (`start>end`, `end>seqLength`, либо extended-domain каретка `>seqLength`/`<0`; backward-selection в пределах [0,L] НЕ триггерит — без ложных срабатываний). Wrap-tail рендерится ТОЛЬКО когда что-то реально пересекает ориджин → целиком видимая плазмида без пересечений больше не затеняется. Callsite `SequenceView/index.jsx` считает `originCrossing` из `features`/`primers`/каретки. Детерминированно, без хрупкой viewport-пробы. Тесты: `wrap-tail.test` re-baseline под gate + новый `hasOriginCrossingSpan` блок; render-тесты (`wrap-tail-render`/`-integration`/`-caret-filter`) получили origin-crossing каретку (extended-domain), чтобы продолжать проверять рендеринг. V98 OOR-маска не задета — 47 wrap-tail+V98 тестов зелёные. Размеры: `wrap-tail.js` 10.9 KB (OK); `SequenceView/index.jsx` +~1.5 KB (уже над hard 40 — TD-SIZE-SEQUENCEVIEW-INDEX, callsite в скоупе V102, инкремент малый).
- **§5 — рендер элементов на wrap-половине (FIXED 23.05.2026, отдельный сабтаск).** На bridge-строке кольцевой плазмиды wrap-половина теперь рисует аннотации / праймеры / сайты рестрикции (не только ДНК+линейку): `AnnotationTrack` второй стек wrap-половины, `PrimerTrack`/`RestrictionTrack` wrap-awareness, проброс `wrapsOrigin`/`wrapAt`/`seqLength` из `SequenceLine`. Code: Vitest 4002 pass / 18 skip / 0 fail, `vite build` clean. **Визуальная приёмка пройдена 23.05.2026.** Спека `SPEC_V102_WRAPTAIL_GATE.md` → `docs/archive/`.

**V103 — `parseFasta`: заголовок и сиквенс в одной строке → пустая последовательность** (OPEN, зафиксирован 23.05.2026, walkthrough overlap-PCR WT-B-1).
- **Симптом:** вставка `>F1 ACGT...` одной строкой через пробел — вся строка уходит в заголовок (`name = line.slice(1).trim().split(/\s+/)[0]`, остаток отброшен), `sequence=''`, `parseFile` бросает «No sequence found in file».
- **Подход (двойной):** (1) `parseFasta` — ACGT-подобный остаток `>`-строки не отбрасывать; и/или (2) `parseFile` — при пустом `sequence` из `.fasta`-вставки прогнать текст как сырой ACGT (`sanitizeSequence`).
- **Scope:** `file-import.js`. Тип C, батч с V104. Связь: WT-UX-6 (textarea word-wrap маскирует пробел).

**V104 — Вставка текстом теряет common-features** (OPEN, зафиксирован 23.05.2026, walkthrough WT-B-2).
- **Симптом:** `enrichWithCommonFeatures` вызывается только в `handleFileImport`. Путь вставки (`LibraryWorkspace.importFiles` → голый `parseFile`) обогащение пропускает (подтверждено: F встал «456 bp · linear» без features).
- **Подход:** common-features детект гонять всегда — и файл, и вставка.
- **Scope:** импорт-путь. Тип C, батч с V103. Смыкается с WT-D-3 (согласованное решение «common-features всегда»).

**V105 — `primer-derive.js` считает Tm по Wallace (рассинхрон с SantaLucia)** (OPEN, зафиксирован 23.05.2026, walkthrough WT-B-3).
- **Симптом:** авто-праймеры overlap-сборки получают `tm` из локальной `tmEstimate` (`4·GC+2·AT`, Wallace), весь остальной проект — SantaLucia NN. Один праймер показывает разный Tm в панели «Праймеры» и в редакторе праймера (K13).
- **Подход:** удалить локальный Wallace, перевести на канонический `calcTm`. Готовая тип-C спека — `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §E (самодостаточна, переносится в `CURRENT_TASK.md` при постановке).
- **Scope:** `primer-derive.js` + греп репозитория на Wallace-остатки. Тип C. Алгоритмическая зона — реализует Code.

**V110 — Нечитаемая раскладка DAG после «Realise as DAG»** (OPEN, зафиксирован 23.05.2026, walkthrough WT-B-8; диагностика по коду — §F walkthrough'а). Визуальный — граф собран содержательно верно, нечитаема раскладка.
- **Симптом:** после realise и возврата на канвас — дубли входных нод (`F` дважды), наложение карточек, длинные кривые рёбра через полполотна, ромб `overlap_pcr_product` разнесён с нодой-продуктом.
- **Корень (по коду, §F):** `handleAssemblyRealise` чисто аддитивен — `[...state, ...diff]`, «old entities are NOT auto-deleted». После realise зона держит ОДНОВРЕМЕННО piece-граф + op-группу + T8 auto-reactions + новый realise-DAG; T4.5 лейн-пакует вдвое больше нод. «F дважды» — realise кладёт frag-контейнер с тем же сиквенсом, что у входа.
- **ФИКС АРХИТЕКТУРНЫЙ, НЕ layout-патч.** Realise должен либо замещать piece-граф зоны DAG'ом, либо realise-DAG жить когерентно. Задевает якоря DEC-CANVAS-4T. В быстрый fix-батч НЕ идёт — спека после архитектурного решения, вместе с разбором раскола двух систем сборки.
- **Scope:** `zone-pieces-to-dag.js` / `skeleton-state.js` `handleAssemblyRealise` / T4.5 layout. Архитектурный. Детали — `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §A WT-B-8 + §F.

**[x] V111 — Хвосты праймеров (5′-overhang) не переносятся на соседнюю строку sequence-viewer'а** (FIXED 24.05.2026; full Vitest 4021 pass / 17 skip / 0 fail, build clean). Визуальный — биндинг и его аннеалинг-бэйзы рендерятся верно, неверно ложится только tail-сегмент на границе строки; работу не блокирует.
- **Симптом (репорт Игоря, скриншот):** в sequence-viewer'е (перенос ~50 bp/строка) праймер с tail'ом, чей биндинг упирается в край строки, рисует tail приклеенным к биндингу — forward-tail вылезает в левое поле (поверх номера строки), reverse-tail уходит за правый край строки. Хвост должен лечь на соседнюю строку, на свои колонки.
- **Корень (по коду):** `PrimerTrack.jsx` рисовал tail всегда внутри binding-группы по относительной координате `x={isFwd ? -tailW : W}` — приклеен к стрелке, без учёта переноса. Плюс per-line фильтр включал хит только если *биндинг* пересекает строку — на строку, где лежат только колонки tail'а, праймер не попадал вовсе.
- **Фикс:** tail трактуется как занимающий `tail.length` колонок сразу 5′ от биндинга (fwd: слева; rev: справа). Per-line фильтр расширен: хит включается, если строку пересекает биндинг ИЛИ on-sequence span хвоста. Inline-tail (как раньше) — только когда хвост целиком влезает на строку биндинга или торчит в поле у абсолютного конца плазмиды; иначе рисуется отдельный per-line-обрезанный `sequence-view-primer-tail-wrap` сегмент на той строке, где реально лежат его колонки (поддержан и частичный split хвоста через границу). Wrap-bridge (циркулярный ориджин) ветка не тронута. Тесты: `primer-track-tail.test.jsx` +5 (forward/reverse flush + partial split).
- **Scope:** `components/SequenceView/tracks/PrimerTrack.jsx` (+5.9 KB → 21.4 KB, в пределах soft 30 / hard 40). Warning signal по size-budget: рост >5 KB за правку (аддитивный отдельный tail-`<g>` + комментарии) — но файл стабилен и далёк от hard.

**[x] V112 — Binding-стрелка wrap-праймера получает остриё на каждом фрагменте → праймер выглядит как два** (FIXED 24.05.2026; full Vitest 4024 pass / 17 skip / 0 fail, build clean). Визуальный — смежен с V111; binding split переносом строки рисовался двумя полными стрелками с остриями.
- **Симптом:** связывание праймера пересекает перенос строки → `clipHit` даёт два `lineHits`-фрагмента, оба строили полный пятиугольник с остриём (`HEAD`). Wrap-праймер читался как две отдельные стрелки вместо одной непрерывной фигуры.
- **Корень (по коду):** `arrowPath` в рендер-цикле `PrimerTrack.jsx` всегда строил пятиугольник с остриём, без учёта того, содержит ли фрагмент 3′-конец.
- **Фикс:** флаг `headHere = isFwd ? hit._visEnd === hit.end : hit._visStart === hit.start` (3′-конец: fwd — `hit.end`, rev — `hit.start`). `headHere` → текущий пятиугольник; `!headHere` → тупой прямоугольник `M0,0 L${W},0 L${W},${ARROW_H} L0,${ARROW_H} Z`. Неразорванный binding → оба равенства истинны → остриё как раньше. Абсолютные `_visStart/_visEnd` корректны и на wrap-bridge. Тесты: `primer-track-redesign.test.jsx` +3 (fwd/rev split + unbroken).
- **Scope:** `components/SequenceView/tracks/PrimerTrack.jsx` (+0.7 KB → 22.1 KB). Size-budget: OK.

**[x] V113 — Hit-target и selection-halo праймера вылезают на `HEAD` (~6 px) за тупой край wrap-фрагмента** (FIXED 24.05.2026; full Vitest 4028 pass / 17 skip / 0 fail, build clean). Визуальный — хвост дефекта V112; три `<rect>` (hit-target + 2 halo) расширяли габарит на остриё всегда.
- **Симптом:** на тупом фрагменте wrap-праймера (без 3′-конца) невидимый hit-target и оба halo-прямоугольника торчали ~6 px за тупой край — выделение/клик-зона вылетали за фигуру.
- **Корень (по коду):** три `<rect>` жёстко расширяли габарит на `HEAD` со стороны острия (forward — правое слагаемое `width`, reverse — `HEAD` в `x`) независимо от `headHere`.
- **Фикс:** `headExt = headHere ? HEAD : 0` рядом с `headHere`; в трёх `<rect>` член со стороны острия (`2*HEAD` в `width` → `HEAD + headExt`; reverse `x`: `-HEAD-N` → `-headExt-N`). 5′/tail-вынос и `groupTailW` не тронуты. `headHere` истинно → `headExt===HEAD`, габариты прежние. Тесты: `primer-track-redesign.test.jsx` +4 (fwd/rev × blunt/3′).
- **Scope:** `components/SequenceView/tracks/PrimerTrack.jsx` (+0.4 KB → 22.5 KB). Size-budget: OK.

**[x] V114 — В сборщике при выделенном праймере Del правит нуклеотид, а не праймер; каретка при выделении праймера не гаснет** (FIXED 24.05.2026; full Vitest 4034 pass / 17 skip / 0 fail, build clean). Функциональный — деструктивно (Del трогал ДНК вместо праймера).
- **Симптом:** в редакторе сборки клик по праймеру выделяет его, но Del/Backspace уходили в annotation/sequence-edit путь (правка нуклеотида), а не удаляли праймер. Каретка продолжала «мигать» поверх выделенного праймера.
- **Корень (по коду):** в `SequenceView` `hit` праймера не нёс `id` (нечем адресовать `removeAssemblyPrimer`); `onRootKeyDown` не имел приоритетной ветки удаления праймера; `CaretOverlay` не умел гаснуть.
- **Фикс (5 файлов):** `useAssemblyPrimerWriting` viewerPrimers += `id`; `SequenceTab` pass-through `onDeletePrimer`; `AssemblyShellBody` колбэк `onDeletePrimer(hit)→removeAssemblyPrimer(draftId, hit.id)`; `SequenceView` — приоритетный `onPrimerDeleteKeyDown` (выделен праймер ⇒ Del/Backspace удаляют праймер, не нуклеотид; без `onDeletePrimer` событие всё равно гасится — read-only Library не трогает ДНК) + `CaretOverlay hidden={selectedPrimers.length>0}`; `CaretOverlay` — проп `hidden`→`return null`. Решение: 2 выделенных праймера ⇒ Del удаляет оба. Тесты: `primer-delete-keydown.test.jsx` +6.
- **Scope:** 5 файлов (см. ниже). ⚠️ **Size-budget WARN:** `SequenceView/index.jsx` 46.6 → 48.2 KB (Δ+1.7 KB) — уже над hard 40 ДО правки и в Active-decomp (TD-SIZE-SEQUENCEVIEW-INDEX). По §7/skill дописывание в Active-decomp ≥hard файл = STOP-кейс (декомпозиция первым пунктом спеки) — спека этого не содержала. Правка проведена минимально-хирургически (+1.7 KB); декомпозиция остаётся за Chat.

### Низкие

**V106 — Несогласованный перехват хоткеев** (OPEN, зафиксирован 23.05.2026, walkthrough WT-B-4).
- **Симптом:** Ctrl+F на канвасе не перехвачен — срабатывает браузерный поиск; Ctrl+R в окне выбора фрагмента перехвачен корректно. Предсказуемости нет. Потери данных нет.
- **Подход:** аудит хоткеев — свести перехват к предсказуемому набору.
- **Scope:** `lib/hotkeys.js` + callsites. Тип C.

**V107 — Счётчик покрытия границ не обновляется** (OPEN, зафиксирован 23.05.2026, walkthrough WT-B-5; диагностика по коду 23.05.2026).
- **Симптом:** вкладка «Границы» показывает «границы 0 / 1 покрыты» даже после генерации 4 праймеров через «Auto-собрать». Индикатор не пересчитывается при появлении праймеров стыка.
- **Корень (по коду):** `selectBoundaryCoverage` (`store/selectors-assembly.js`) фильтрует `state.assemblyDraftPrimers` по `p.source.kind==='boundary'` — legacy-форма. «Auto-собрать» (`deriveAutoPrimers`, `primer-derive.js`) создаёт праймеры формы `origin.kind==='auto-from-group'` без поля `source` → селектор их не считает → покрытие всегда 0. Тот же раскол двух систем праймеров (op-группы vs assemblyDrafts), что у V109/V110.
- **Scope:** симптом раскола формы записи праймера. **Спека написана** — `docs/SPEC_NODE_A_PRIMER_RECORD_UNIFY.md` (узел A, тип A): унификация record'а праймера, `selectBoundaryCoverage` начинает видеть auto-праймеры. Минимальный dual-read патч `selectBoundaryCoverage` отклонён (дописывает dual-system код, §17). Зависимость узла A: после V105/V109.

**V108 — Счётчик «Контейнеры · N» в редакторе сборки не сходится с наблюдаемым** (OPEN, зафиксирован 23.05.2026, walkthrough WT-B-6; диагностика по коду — §F walkthrough'а). Косметический.
- **Симптом:** счётчик «КОНТЕЙНЕРЫ · N» показывал 3→2→3; ни одно значение не сходится с сегментами сборки / контейнерами на канвасе.
- **Корень (по коду, §F):** `AssemblySidebar` показывает `state.containers.length` (непустой `sequence`) — глобальный пул контейнеров скелета, не scoped на зону/сборку. Пул растёт: `onRangeConfirm` зовёт `addContainerFromEntry` на каждую вставку сегмента (+1, без дедупа), `realiseAssembly` (+3).
- **Подход:** не пересчёт — честный лейбл / убрать счётчик из header'а. Сопутствующий продуктовый вопрос: дедуп `addContainerFromEntry` (смыкается с V52 и реестром 8 дублей).
- **Scope:** `AssemblySidebar.jsx` (+ продуктовый вопрос дедупа). Тип C/D.

---

## FEATURE REQUESTS

(пусто на старте v0.6 — фичи живут в `docs/ARCHITECTURE_v2.md` §7 Roadmap до момента, когда становятся конкретным дизайн-вопросом)

---

## FIXED (текущий спринт v0.8.3-alpha — four-tier T1-T10 + T4.5 + canvas UX + primer redesign)

**[x] V115 — Кнопка 🗑 не убирала pinned/current-проект из дерева библиотеки** (FIXED 24.05.2026, принят Игорём в живом приложении; `ZVENO_LOG.md` Z6).
- **Симптом был:** клик 🗑 у проекта в дереве — тост появлялся, счётчик Корзины рос (+1), но проект оставался в дереве.
- **Корень (подтверждён рантайм-фактом через Claude in Chrome):** `markPendingDelete` отрабатывал корректно — `_pendingDelete:true` ставился в `state.projects[id]` (проверено через fiber). Баг был в `LibraryTreeRoot.jsx`, `useMemo` для `groups`: группы `current` и `pinnedRest` брали проект из `projectsById` без фильтра `_pendingDelete` (в отличие от `discoverProjects` для `others`). Поэтому un-pinned проект удалялся, а pinned/current — нет.
- **Фикс:** в `groups`-мемо `LibraryTreeRoot.jsx` добавлен фильтр `_pendingDelete` для `current` и `pinnedRest`. Чисто рендерный фикс — хранилище не тронуто.
- **⚠ Caveat:** приёмка визуальная, без отчёта Code — блок «Отчёт Code по V115» в `CURRENT_TASK.md` остался пуст. Закрыт по решению Игоря по факту видимого результата.
- **Смежное (ОСТАЁТСЯ OPEN):** рассинхрон версии Dexie — в браузере `bodgegene-db` version 50, в коде `DB_VERSION = 5`. Отдельный разбор (`ZVENO_LOG.md` «Открытые»).

**[x] V114 — Layout-канвас не рисовал узлы зоны в graph-режиме; после «Реализовать» канвас выглядел пустым** (ПРИНЯТ Игорём в приложении 24.05.2026 — рендер вернулся, узлы видны).
- **Симптом был:** после realise возврат на Layout — рамка зоны есть, счётчик узлов ненулевой, но узлов не видно. Корень и диагностика — спека `docs/SPEC_V114_ZONE_GRAPH_RENDER.md`.
- **Статус:** Игорь принял 24.05 — «рендер вернулся, работает». **⚠ Caveat:** приёмка визуальная, без отчёта Code — Chat не видел, какими изменениями рендер вернулся (спека V114 написана, но Code по ней формально не отчитывался в этой сессии). Закрыт по решению Игоря по факту видимого результата.
- **Смежное (ОСТАЁТСЯ OPEN):** V110 — нечитаемая раскладка DAG после realise (дубли входных нод, realise аддитивен). Скриншот приёмки 24.05 это воспроизвёл («frag-1/3/4» по дважды, 7 PCR-ромбов на 4 фрагмента, фрагменты 3/4 bp) — V114 к graph-рендеру, V110 к аддитивности realise; разные баги.

**[x] V84 — Realise-продукты (frag/product) не наследовали аннотации исходника** (FIXED 17.05.2026; full Vitest 3168 pass / 1 skip / 0 fail + 1 pre-existing flake TD-PRIMER-WIZARD не связан, 2/2 изолированно; zero регрессий).
- **Симптом (репорт Игоря + скриншот pks4):** `Сборка 1-frag-1..4` после Realise — пустые серые бары, без фич, хотя источники (`pBluescript SK(+)` и т.д.) имеют аннотации (MCS / T7 / T3 promoter). «продукты не наследуют аннотации исходника».
- **Корень (класс V83, рассинхрон zone vs legacy):** legacy `assembly-model.makeSourcedSegment` переносит фичи через `transferAnnotations(parentAnns, lo, hi, rc, srcId)` (`segment-annotation-transfer.js`), а 4-tier `zone-pieces-to-dag.draftFromZone` хардкодил sourced-сегменту `annotations: []`. `realiseAssembly` берёт `seg.annotations` → frag-контейнеры пустые; финальный `-product` тоже `annotations: []`. Путь op-execute (`operation-product-assembly.js`, DEC-PROD-07) аннотации переносил — баг только в realise/zone-пути.
- **Фикс (DRY, переиспользование проверенных хелперов):** (1) `draftFromZone` sourced-сегмент → `transferAnnotations(c.annotations, r.start, r.end, rc, r.sourceId)` (тот же helper, что у legacy); gap/orphan/no-ann → `[]`. Frag-контейнеры наследуют каскадом. (2) Новый чистый `concatSegmentAnnotations(segments)` в `assembly-model.js` — аннотации каждого сегмента смещаются на его char-offset в конкатенации (gap двигает offset, фич не даёт), порядок как у `computeAssemblySequence`; финальный `-product` контейнер → `annotations: concatSegmentAnnotations(segs)`.
- **Acceptance:** sourced full-range → фича в локальных координатах; clipped range → клип+сдвиг; reverse → зеркало+strand −1; нет источника/аннотаций → `[]`; gap → `[]`; realise frag-контейнер несёт фичу; `-product` агрегирует со сдвигом. +12 тестов `assembly-product-annotations.test.js`. Full Vitest **3168 pass / 1 skip / 0 fail**, zero регрессий.

**[x] V83 — При вставке gap с известной ПСО (линкер/своя) в сборку добавлялся поли-N вместо реальной ДНК** (FIXED 17.05.2026; full Vitest 3119 pass / 1 skip / 0 fail + 1 pre-existing flake TD-PRIMER-WIZARD не связан; zero регрессий).
- **Симптом (репорт Игоря + скриншот):** в зоне-сборке сегмент №5 «gap · unknown · 54 bp» отрисован как 54×N в последовательности. 54 нт = пресет-линкер **T2A** (`GAGGGCAGAGG…CCT`, самовырезающийся пептид — функциональный элемент, НЕ unknown-плейсхолдер). «при добавлении gap добавляется поли N, а не то что написано в карточке».
- **Корень (подтверждён по коду):** 4-tier gap-piece (`piece-model.createPiece`, T6 DEC-T6-02) хранил **только** `gapLength`+`gapHint` — реальная ПСО (InsertGapModal таб «Линкер»/«Своя ПСО» → `onInsert({sequence})`) молча отбрасывалась в `zone-assembly-write-adapter.INSERT_MANUAL_SEGMENT` (брал лишь `.length`). На realise/display `draftFromZone`/`computeAssemblySequenceFromPieces` → `sequence:''` → `'N'.repeat(gapLength)`. Было задокументировано как T6-deviation DEC-T6-02/09 «sequence-lossy»; репорт Игоря промотировал в реальный баг.
- **Фикс (аддитивный, без миграции):** gap-piece получил опциональный `gapSequence`. Когда задан (линкер/своя) — хранится дословно, `gapLength === gapSequence.length`, `gapHint='known'`, end-to-end сохраняется (`createPiece` / `piece-invariants` consistency-инвариант / `zone-assembly-write-adapter` / `draftFromZone` / `segment-to-piece-adapter`). Когда НЕ задан (таб «Неизв. длина») — поведение **без изменений**: поли-N от `gapLength`. Старые persisted gap-pieces без `gapSequence` → поли-N (доп. поле опционально, `SCHEMA_VERSION` не бампился).
- **Acceptance:** линкер T2A → gap-piece c `gapSequence`=T2A, realise → frag/product содержат реальную ДНК, нет N-ранов; своя ПСО `atcgATCG` → `ATCGATCG` (uppercase) сохранена; «Неизв. длина» 20 → по-прежнему 20×N (корректный плейсхолдер). +15 тестов `gap-known-sequence-v83.test.jsx`. Full Vitest **3119 pass / 1 skip / 0 fail**, zero регрессий.

**[x] V82 — Дефолтная «стартовая сборка» не отражалась в счётчике «Сборки (N)»** (FIXED 17.05.2026; full Vitest 3105 pass / 1 skip / 0 fail, zero регрессий; вариант 1 «панель → zone-based» по выбору Игоря).
- **Симптом:** в стартовый проект добавлено 3 элемента в авто-сборку на canvas («Сборка 1 · 3 узла»). Панель «📋 Сборки (0)» / «Сборок пока нет.» её не показывала. «+ Новая сборка» создаёт нормально, но первая (дефолтная) не отражалась.
- **Корень (подтверждён по коду):** `buildInitialState` (skeleton-state.js:69–75, T3 DEC-T3-08) сидил новый проект **дефолтной ZONE** «Сборка 1» (`createZone`), НЕ assemblyDraft. `AssemblyDraftsPanel.jsx` считала `state.assemblyDrafts.length` (пуст — T6 мигрировал черновики→зоны). Пост-T6 рассинхрон: концептуальная «сборка» = zone, но legacy-панель считала drafts.
- **Фикс (вариант 1, архитектурно-верный — единый источник истины, без техдолга):** `AssemblyDraftsPanel.jsx` переписана **zone-based** — счётчик/карточки от `selectAllZones(state)`; узлы в карточке = `nodeListInZone` (containers+pieces+operations); «+ Новая сборка» → `CREATE_ZONE` («Сборка {N}», offset bounds); card Open → `openEditorAssemblyTab(zone.id)` (T6 dual-resolve в AssemblyModeShell); Delete → `REMOVE_ZONE`. Pin/Unpin убран (zone всегда on-canvas frame). Testid'ы сохранены.
- **Acceptance:** новый проект → «Сборки (1)», карточка «🧬 Сборка 1»; добавление узлов в зону → счётчик узлов в карточке растёт; «+ Новая сборка» → 2-я zone; Open → assembly-таб на zone id; Delete → zone удалена. +5 новых тестов `assembly-drafts-panel-v82.test.jsx`. Full Vitest **3105 pass / 1 skip / 0 fail**, zero регрессий.
- **Известное следствие:** `assemblyReducer`/`state.assemblyDrafts` остаётся живым (T6 K14) для on-canvas `AssemblyDraftBlock`/`MiniProjectCanvas` (legacy, не в скоупе V82). Полная зачистка legacy assembly-draft слоя — отдельный T-future cleanup.
- **Дополнительный реверс (17.05.2026, по AskUserQuestion):** позже DEC-T3-08 + V61 РЕВЕРСНУТЫ — `buildInitialState` больше НЕ сидит default zone, ghost auto-respawn отключён. Чистый старт (`zones:[]`); сборка создаётся явно через «+ Новая сборка». См. журнал PROJECT_STATE «реверс DEC-T3-08/V61» 17.05.

**[x] V81 — Мини-канвас нельзя свернуть (всегда занимает угол editor-окна)** (FIXED 16.05.2026, bug-session; full Vitest 2641 pass / 1 skip / 0 fail, build clean).
- **Запрос (Игорь):** мини-канвас (MiniProjectCanvas, V68 — всегда виден, zIndex 40) сделать сворачиваемым.
- **Решение (local-state toggle, минимальный scope; V68 always-visible сохранён как default):**
  1. `MiniProjectCanvas.jsx` — `useState collapsed` (default `false`).
  2. Свёрнуто → одиночная иконка-пилюля 🗺 (30×30, top:60/right:16, zIndex 40), `data-testid=mini-canvas-collapsed`, клик → развернуть.
  3. Развёрнуто → кнопка `–` `data-testid=mini-canvas-collapse` (top-right), клик → свернуть. Токены `--surface-*/--text-*/--border-subtle`.
- **Acceptance:** по умолчанию развёрнут (V68 не задет); клик `–` → frame исчезает, остаётся иконка 🗺; клик иконки → разворачивается; маркеры/клик-навигация/assembly-маркеры работают как раньше. +1 V81 `editor-window-shell.test.jsx` K4. Full Vitest **2641 pass / 1 skip / 0 fail**, build clean.

**[x] V80 — Выделение праймера в PCR-вьювере тянулось от 1-го нуклеотида** (FIXED 15.05.2026, root-caused; live-gesture за биологом).
- **Симптом:** в PcrModeShell выделение под праймер «автоматом тянется со всего с первого нуклеотида» (anchor = 0).
- **Корень:** `PcrModeShell.onCaretChange(pos)` ставил ТОЛЬКО `setCaretPos(pos)`, никогда не сбрасывал `caretAnchor`. SequenceView controlled по `caretAnchor`/`caretPos`; `caretAnchor` оставался на initial `useState(0)` навсегда. Эталон `ContainerEditorSkeleton.onCaretChangeFromView` при не-extend делает `setCursorAnchor(pos)` (collapse) — этого в PcrModeShell не было (недосмотр при V71-рефакторинге).
- **Фикс:** `onCaretChange(pos, opts)` зеркалит эталон: `setCaretPos(pos)`; если `!opts?.extendSelection` → `setCaretAnchor(pos)` + `setSelectionMode('dna')`.
- **Acceptance:** простой клик → anchor схлопывается на клик; extendSelection → anchor сохраняется. +2 V80 `pcr-mode-selection.test.jsx`. Full Vitest 2501 pass / 1 skip / 0 fail.

**[x] V79 — `127.0.0.1:3000` не грузился; AmneziaVPN перехватывал `localhost`** (FIXED 15.05.2026, измерено на машине).
- **Симптом:** биолог переустановил браузер — всё равно «не подхватывает» новый код. `localhost:3000` грузит старое, `127.0.0.1:3000` не грузится вообще.
- **Корень:** (1) Vite по умолчанию биндится только на `localhost` → резолвилось в IPv6 `::1`; на IPv4 `127.0.0.1:3000` не слушал НИКТО. (2) AmneziaVPN UP — перехватывал `localhost`/`::1`-путь и отдавал stale-ответ.
- **Фикс:** `vite.config.js` `server` — `host: true` (dual-stack), `strictPort: true`, `hmr.host: '127.0.0.1'`, proxy `/api` → `http://127.0.0.1:8000`.
- **Verification:** `:3000` биндит `::` (dual-stack), `127.0.0.1:3000` → 200; свежий бандл с V78/V76/V74.
- **Что делать биологу:** открывать **`http://127.0.0.1:3000`** (не `localhost`) — в обход AmneziaVPN.

**[x] V78 — Клик по committed PCR-опу открывал тесный params-popup, viewer недостижим** (FIXED 15.05.2026, live-verified в браузере).
- **Симптом:** биолог: «праймеры не отражаются, нет Tm, хоткеи/ПКМ не работают». PCR-viewer + праймеры через hover-иконку (V70) работали, но клик по ромбу committed PCR — открывал PCROpPopup, не viewer.
- **Корень:** `CanvasLayoutView.onOperationClick` для committed-op с inputs всегда делал PCROpPopup независимо от kind.
- **Фикс:** `onOperationClick` ветка для `op.kind === 'pcr'` с template → `actions.openEditorOpTab(op.id)` (как V70 hover-icon). Не-PCR kinds (cut/gibson/…) сохраняют popup.
- **Live verification:** committed PCR → single-click → pcr-mode-shell + editor-window-shell + 3 sequence-view-primer + PrimerSuggestionsPanel «Tm 61°C». +2 V78 `pcr-mode.test.jsx`. Full Vitest 2499 pass / 1 skip / 1 known flake / 0 real fail.

**[x] V77 — Stale PWA service worker отдаёт старый бандл в dev** (FIXED 15.05.2026).
- **Симптом:** в `npm run dev` браузер исполняет старый бандл — V72–V76 «не работают», хотя тесты зелёные. Все 4 фичи отсутствуют ОДНОВРЕМЕННО = stale JS из precache.
- **Корень:** SW от прошлого `vite build`/preview зарегистрирован на `localhost:3000` и контролирует origin; dev-сервер SW не отдаёт, поэтому старый SW бесконечно отдаёт свой precache. Ctrl+F5 не помогает (SW перехватывает fetch).
- **Фикс (dev-only, prod PWA не тронут):** `lib/pwa-install.js` — `purgeStaleServiceWorkers({nav,cacheStore})`: снимает все SW-регистрации + чистит все Cache Storage. `main.jsx` — вызов ТОЛЬКО под `if (import.meta.env.DEV)`; если SW контролировал страницу → один `location.reload()` под sessionStorage-guard. +4 V77 `pwa-install.test.js`. Full Vitest 2497 pass / 1 skip / 0 fail.
- **⚠ Bootstrap:** фикс в НОВОМ бандле, а браузер пока крутит СТАРЫЙ → нужно ОДИН раз выбить SW вручную, дальше V77 сам.

**[x] V76 — Нет температуры отжига рядом с курсором при выделении фрагмента** (FIXED 15.05.2026).
- **Запрос:** при выделении фрагмента в вьювере показывать рядом с курсором температуру отжига (Tm). Формула в v0.5.
- **Решение (переиспользование v0.5-формулы + prop-driven SequenceView):** `calcTm` из `src/tm-calculator.js` (SantaLucia 1998 NN). `SequenceView/index.jsx` — opt-in prop `showSelectionTm` (default false). При активном DNA-выделении считает `calcTm(fullSeq.slice(lo,hi))` и рисует near-cursor тултип `Tm ≈ X°C · N bp`. `SequenceTab` pass-through; `PcrModeShell` включает `showSelectionTm`.
- **Acceptance:** в PCR-вьювере выделил участок → рядом с курсором Tm + длина; нет выделения / aa-режим / off → тултипа нет. +4 V76 `selection-tm.test.jsx`. Full Vitest 2493 pass / 1 skip / 0 fail.

**[x] V75 — Праймеры + фланкируемая область не видны на canvas-минимапе при выбранной PCR** (FIXED 15.05.2026).
- **Запрос:** праймеры должны отражаться на минимапе; когда выбран PCR-оп — явно подсвечивать выбранные праймеры и какую область они фланкируют.
- **Решение (prop-driven расширение, переиспользование binding-математики):** `selectors-pcr.js::selectPcrSpans(state, opId)` — та же math что в `adapters/pcr.js`. Возвращает `{flank:{start,end}, primers:[{start,end,direction,name}]}`. `MiniPlasmidMap.jsx` — opt props `primers=[]`, `flank=null`. `ContainerBlock.jsx` pass-through. `CanvasLayoutView.jsx` — props только на блок темплейта highlighted PCR-оп.
- **Acceptance:** выбрал PCR → на блоке темплейта мини-карта показывает fwd/rev маркеры + flank-арку; не-PCR / не темплейт — без оверлея. +2/+4 V75 тестов. Full Vitest 2488 pass / 1 skip / 0 fail.

**[x] V74 — Нет записи праймера через right-click меню SequenceView** (FIXED 15.05.2026).
- **Запрос:** в существующее right-click меню добавить пункты выбора праймера.
- **Решение (чистое расширение через `extraItems`):** `SequenceView/index.jsx` — consumer-gated prop `onWritePrimer`; в extraItems добавляются «Прямой праймер» / «Обратный праймер» при `typeof onWritePrimer === 'function'`. Library/Importer prop не передают. `SequenceTab.jsx` pass-through. `PcrModeShell.jsx` — `writePrimerForRange(direction,lo,hi)` core; hotkey-путь и `onWritePrimer` идут в один core.
- **Acceptance:** right-click по выделению в PCR → «Прямой/Обратный праймер»; клик пишет нужную цепь. +2 V74 `pcr-mode-selection.test.jsx`. Full Vitest 2482 pass / 1 skip / 0 fail.

**[x] V73 — executePCR игнорировал выбранные/написанные праймеры (op.params.userPrimers)** (FIXED 15.05.2026 — keystone).
- **Симптом:** праймеры из вьювера (Ctrl+R → `op.params.userPrimers`) показывались, но при execute игнорировались.
- **Корень:** `adapters/pcr.js` `executeSingleTemplatePCR` не читал `operation.params.userPrimers`.
- **Фикс:** ветка перед auto-design — если `!primerPairId && userPrimers[0].forward && .reverse` → ампликон считается тем же bio-bridge (indexOf binding на темплейте, RC downstream от forward; tails не темплируются). `origin.userPrimers:true`. Приоритет: explicit primerPairId → userPrimers → autoDesign.
- **Acceptance:** PCR с `userPrimers` даёт ампликон по выбранным праймерам. +2 V73 `skeleton-adapters-s2.test.jsx`. Full Vitest 2480 pass / 1 skip / 0 fail.

**[x] V72 — Праймеры писались авто-по-выделению (без явной кнопки)** (FIXED 15.05.2026).
- **Запрос:** Ctrl+R прямой / Ctrl+Alt+R обратный — только в открытом PCR viewer.
- **Решение (decouple + per-strand hotkey, scoped via lifecycle):** `lib/hotkeys.js` — +2 entries `pcr-primer-forward` (Ctrl+R), `pcr-primer-reverse` (Ctrl+Alt+R). Scope `'global'`, viewer-scope через `useHotkey` lifecycle. RU-раскладка через `event.code` fallback. HotkeyCheatsheet auto-derives. `PcrModeShell.jsx` — `onSelectRangeFromView` теперь ТОЛЬКО трекает выделение; `writePrimerStrand(direction)` пишет ОДНУ цепь.
- **Acceptance:** выделение само не пишет; Ctrl+R в viewer пишет forward, Ctrl+Alt+R reverse, повтор аккумулирует; вне viewer Ctrl+R = reload браузера. Full Vitest 2478 pass / 1 skip / 0 fail.

**[x] V71 — PCR viewer = bespoke сущность вместо переиспользования Library sequence viewer** (FIXED 15.05.2026, spec-level — reverses DEC-CANVAS-PCR-05/06, добро Игоря явно).
- **Запрос:** переиспользовать Library sequence viewer (SequenceView/SequenceTab) внутри PcrModeShell.
- **Фикс:** `PcrModeShell.jsx` переписан: центр = `<SequenceTab>` (Library viewer). Bespoke `<pre>` template + `PrimerDragHandles` удалены. Header (level switcher), `PrimerSuggestionsPanel`, footer/OrderOligosConfirmGate сохранены. `operation-pcr-bridge.js` — `fwdBinding`/`revBinding` additive.
- **Acceptance:** PCR-режим показывает Library SequenceView с шаблоном; выделение пишет user primers (source 'edited'); auto-designed pair виден; bespoke компоненты отсутствуют. Full Vitest 2474 pass / 1 skip / 0 fail.
- **Открытый вопрос для Chat:** формализовать reversal DEC-CANVAS-PCR-05/06 + обновить F3 спеку — Code спеку не трогает.

**[x] V70 — Клик по hover-иконке PCR не открывает viewer** (FIXED 15.05.2026).
- **Симптом:** ожидаемый flow — клик по 🔬: (1) создаётся блок op, (2) вбивается темплейт, (3) сразу заходим в viewer. Фактически — только (1)+(2), биолог должен был руками double-click ромб.
- **Фикс:** `createOperationDraft` принимает опциональный `id`. `CanvasLayoutView.onPickHoverOp` — pre-gen `opId = uuidv7()`, передаётся в `opAdd`, затем `actions.openEditorOpTab(opId)`.
- **Acceptance:** hover filled-контейнер → клик 🔬 → активный operation-tab с PcrModeShell + темплейт. +1 V70 `pcr-mode.test.jsx` K7. Full Vitest 2472 pass / 1 skip / 1 pre-existing flake.

**[x] V69 — PCR-операция из hover-иконки не подхватывает темплейт (PCROpPopup игнорирует op.inputs[0])** (FIXED 15.05.2026).
- **Симптом:** клик 🔬 PCR создаёт op с `op.inputs=[fragmentId]`. Popup открывается с пустым template-`<select>`.
- **Корень:** `PCROpPopup.jsx:22` инициализировал `templateId` ТОЛЬКО из `params.templateId`, игнорируя `operation.inputs[0]`.
- **Фикс:** `inputTemplateId = operation.inputs?.[0]`; `templateId` init = `params.templateId || inputTemplateId || ''`. Тот же порядок резолва что в `adapters/pcr.js:25-27`.
- **Acceptance:** PCR из hover-иконки открывается с уже выбранным темплейтом; explicit `params.templateId` по-прежнему приоритетнее. +2 V69 `skeleton-op-popup-k6.test.jsx`. Full Vitest 2471 pass / 1 skip / 0 fail.

**[x] V68 — ContainerBlock: пропорции + MiniProjectCanvas visibility/labels** (FIXED 15.05.2026 приёмка F1-F4).
- **Запрос (4 пункта):** (1) блок «более квадратным»; (2) название контейнера не должно перекрываться подписями feature-арок; (3) MiniProjectCanvas виден всегда; (4) подписи у маркеров MiniProjectCanvas.
- **Фикс:** (1) `BLOCK_LINEAR_H` 110→150 (240×150). (2) Row1 (имя) — divider-band + Row2 overflow:hidden. MiniPlasmidMap height 62→90. (3) MiniProjectCanvas zIndex 2→40. (4) `<text>` подписи у маркеров (truncate 14 симв, halo).
- **Acceptance:** блок ближе к квадрату; имя в своей полосе, никогда не перекрывается; mini-canvas всегда видна; у маркеров truncate-имена. +8 V68 тестов. Full Vitest 2469 pass / 1 skip / 0 fail.

**[x] V67 — Соединительные линии op↔контейнер привязаны к центру, не к границе** (FIXED 15.05.2026 приёмка F1-F4).
- **Симптом:** линии op→input / op→output / preview drag-to-connect входили в горизонтальный ЦЕНТР контейнера, а не в боковую ГРАНИЦУ.
- **Фикс:** container endpoint X = `opCx >= (cPos.x+120) ? cPos.x + BLOCK_LINEAR_W : cPos.x` (facing edge). Применено в 3 местах. +1 V67 `skeleton-op-wires-a4.test.jsx`.

**[x] V66 — На canvas-прямоугольнике контейнера нет подписей feature-арок** (FIXED 15.05.2026 приёмка F1-F4).
- **Симптом:** в прямоугольнике контейнера на canvas (MiniPlasmidMap) feature-арки только с `<title>`, без видимых текстовых подписей.
- **Фикс:** новый shared `src/lib/plasmid-label-utils.js` (`pickRegionsForLabels` + `truncateLabel`). `MiniPlasmidMap.jsx` — рендер `<text>` подписей (`mini-plasmid-label`), малый шрифт 6.5 + halo.
- **Acceptance:** на canvas видны подписи; PlasmidMiniMap/Dag/overview без регрессий. +3 V66 тестов.

**[x] V65 — Нет user-facing входа в канвас проекта + canvas не per-project** (FIXED 15.05.2026 приёмка F1-F4).
- **Симптом:** (1) Из Library входа в canvas нет (только dev-кнопка sidebar StartScreen). (2) Состояние канваса персистилось в один глобальный blob, не привязано к проекту.
- **Фикс:** (1) `skeleton-persistence.js` `stateKeyFor(projectId)`: `null` → legacy global key, projectId → `canvas-state-v1::<projectId>`. (2) `skeleton-context.jsx` читает `currentProjectId` из global store; rehydrate keyed by него; project-switch без snapshot → `RESET`. (3) Nav: sidebar StartScreen + LibraryTopBar — кнопка `📂 Открыть проект` → `pushFullscreen({fullscreen:'canvasSkeleton'})`.
- **Acceptance:** из StartScreen sidebar И Library есть «Открыть проект»; проект A сохраняется отдельно от B. +3 V65 `skeleton-persistence-s3.test.jsx`. Full Vitest 2457 pass / 1 skip / 0 fail.

**[x] V64 — На 2-м контейнере ghost id коллидировал (slice 8 chars uuid)** (FIXED 14.05.2026 bug-session).
- **Корень:** `makeGhostPlaceholder` использовал `c-ghost-${uuidv7().slice(0, 8)}` — uuid'ы в одной мс начинаются с одних hex.
- **Фикс:** полный `uuidv7()` без slice.

**[x] V63 — Ghost respawn'ится рядом с filled (привязан); надо в углу** (FIXED 14.05.2026 bug-session).
- **Фикс:** `GHOST_HOME_POSITION = {x:40, y:40}`. `ensureGhostPlaceholder` default'ит на home; filled уезжает на cascade-slot grid 5×N (260×100 шаг).
- **Реверс (17.05):** см. ниже «реверс DEC-T3-08 + V61» — ghost auto-respawn отключён вообще.

**[x] V62 — Ghost auto-respawn не работал runtime + drag по ghost открывал picker** (FIXED 14.05.2026 bug-session).
- **Фикс:** (1) `skeleton-state.js` — FINALIZER на уровне main router'а: после любого action `ensureGhostPlaceholder`. (2) `CanvasLayoutView.jsx` — `justDraggedRef` флаг: `onPointerUp` ставит true когда `dragging.hasMoved`; `onPlaceholderClick` skip'ает picker если флаг true.
- **Реверс (17.05):** ensureGhostPlaceholder отключён, но `justDraggedRef`-guard сохранён и расширен на op-drag (см. ниже «drag ромба → отпускание бросает в сиквенс-вивер»).

**[x] V61 — Призрачный (ghost) контейнер + переделка picker** (FIXED 14.05.2026 → РЕВЕРС 17.05.2026).
- **Изначальный запрос:** на canvas всегда РОВНО 1 ghost. При его клике — picker с 4 секциями. После выбора → fill → новый ghost появляется автоматически.
- **Фикс 14.05:** `ensureGhostPlaceholder` финализатор + `makeGhostPlaceholder`. Стартовых placeholder'ов 1. `PlaceholderTreePicker.jsx` 4 секции (search + Из проекта + Коллекция + Другие проекты + Библиотека-link).
- **Реверс 17.05 (по AskUserQuestion Игоря «Полностью из state»):** в составе canvas cleanup — `ensureGhostPlaceholder` финализатор **отключён** в `skeletonReducer`. Чистый старт без авто-госта. Picker работает по запросу через explicit «+ Сборка»/«+ Операция»/drag-drop. **DEC-T3-08 одновременно реверснут** (default zone «Сборка 1» не сидится). См. PROJECT_STATE «реверс DEC-T3-08/V61» 17.05.

**[x] V59 — Пропала кнопка «+ Операция»** (FIXED 13.05.2026 bug-session).
- **Симптом:** floating button «+ Операция» отсутствует на Graph view.
- **Корень:** кнопка жила в `CanvasLayoutView.jsx`, а не в общем `CanvasArea`. При переключении на Graph view терялась.
- **Фикс:** перенёс в `CanvasSkeleton/index.jsx::CanvasArea`. `position: absolute; bottom: 20; right: 24; zIndex: 30`. Cascade-offset по `state.operations.length`.

**[x] V58 — Ромбы operation не двигаются по canvas** (FIXED 13.05.2026 bug-session).
- **Корень:** `onPointerMove` обрабатывал только `dragging` для контейнеров.
- **Фикс:** `dragging` state получил поле `kind: 'container' | 'operation'`, `onOperationPointerDown(e, opId)`, в `onPointerMove` switch → `actions.opSetPosition` для op-kind.
- **Regression test:** 2 теста `skeleton-operation-node-k5.test.jsx` (`describe('V58 ...')`).

**[x] V52 — Quick-add дублировал entry в активный проект без предупреждения** (FIXED 16.05.2026, bug-session; full Vitest 2640 pass / 1 skip / 0 fail).
- **Симптом:** клик hover-revealed `+` на entry в чужом проекте добавлял копию в активный проект без проверки на дубликат.
- **Фикс (инвариант в store):** `cloneEntryToActiveProject(entryId, opts={})` — fingerprint-скан перед клонированием (name + resourceHash/sequence). Дубликат → return `{ok:false, reason:'duplicate', existingId, name}` без клонирования. `opts.force` обходит. `TreeItemRow.onQuickAdd` → `window.confirm` («уже есть, добавить ещё одну копию?») → forced 2-я копия по Да.
- **Acceptance:** первый quick-add — как раньше; повторный → confirm Да/Нет, по умолчанию (Нет/dismiss) не создаётся. +4/+1 V52 тестов. Full Vitest **2640 pass / 1 skip / 0 fail**.

---

## Архивные FIXED записи

Старшие FIXED (v0.5 legacy + v0.6/0.7/0.8.0-0.8.2 — Sprint M-B.2 + Parser-Unification 02–03.05.2026, V49 / V50, и т.д.) — в `docs/archive/BUGS_HISTORY.md`.

v0.5 legacy баги — в `docs/archive/BUGS_v05.md` (последняя запись 28.04.2026: Sprint Catalog Polish + FIX cycle закрыл 11 import-related багов V35–V48).
