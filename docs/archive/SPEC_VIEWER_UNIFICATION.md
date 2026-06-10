# SPEC — Унификация просмотрщиков сиквенса

**Тип:** A. **Источник:** запрос Игоря 21.05.2026 — RE-выделение не работает в viewer'е по двойному клику на деталь, хотя в range picker работает.
**Статус:** готова к реализации. Диагноз получен **чтением кода** (`SequenceView/index.jsx`, `SequenceView/hooks/useSelectionState.js`, `SequenceTab.jsx`, `RangePickerModal.jsx`, `ContainerEditorSkeleton.jsx`), не из COMPONENT_MAP.

---

## Диагноз (по коду)

Вопреки записи COMPONENT_MAP про «5 sequence viewers» — viewer **один**. Все контексты рендерят `SequenceView` через тонкий wrapper `Library/inspector/tabs/SequenceTab.jsx` (~25 пропов pass-through). Call-sites: `RangePickerModal`, `ContainerEditorSkeleton` (табы sequence + mutagenesis), `AssemblyShellBody`, `PcrModeShell`, Library `SingleInspector`. Рендер уже унифицирован — «converge viewers» делать нечего.

Проблема в другом. `SequenceView` / `SequenceTab` — **полностью controlled**: caretPos / caretAnchor / selectionMode / selectionStrand + обработчики `onCaretChange` / `onSelectRange` / `onRestrictionClick` каждый call-site реализует **вручную, своей копией**. Копии разъехались:

- **RE-клик.** `RangePickerModal.onRestrictionClick` = **парный выбор фрагмента** (клик сайт A → клик сайт B → фрагмент [cutA,cutB]; `firstRESiteRef`, snap на cut-координаты, `acquisitionMethod='restriction'`). `ContainerEditorSkeleton.onRestrictionClick` = **совсем другое**: открывает `RestrictionSitePopover` — инструмент «разрезать здесь» → `cutContainerAtCursor`. Один проп `onRestrictionClick` общего `SequenceTab`, но в picker'е это выбор фрагмента, в editor'е — разрез. Поэтому RE-выделение «не работает» по двойному клику на деталь: этот call-site его не реализует — он реализует разрез.
- **drag-grace hack.** Анти-баг «выделение сбрасывается после короткого быстрого drag» (`lastExtendAtRef`, `DRAG_GRACE_MS = 250`) **скопирован дословно** в `RangePickerModal` И в `ContainerEditorSkeleton`. Один фикс в двух файлах.
- **outOfRangeMask.** RangePicker считает из `[start,end]`; ContainerEditor — из `piece.ranges` (`containerRangeMask`). Источник разный, проп общий.

**Корень:** нет общего слоя оркестрации controlled-выделения. Каждый call-site — своя ручная обвязка `SequenceTab`, обвязки разошлись. `useSelectionState` (внутри SequenceView) решает только pointer→DOM механику; внешний controlled-слой не разделён.

## Решение: общий хук `useSequenceSelection`

Вынести оркестрацию controlled-выделения в один хук. Хук владеет:
- state caretPos / caretAnchor / selectionMode / selectionStrand;
- `onCaretChange` со **встроенным drag-grace** (250 ms) — копии из call-sites удаляются;
- `onSelectRange`;
- selection-derived (copy и пр. — как уже умеет SequenceView).

RE-поведение — **подключаемая стратегия**. Это настоящий контекст, не баг: «выбрать фрагмент между сайтами» (picker) и «разрезать здесь» (editor) — разные легитимные действия. Хук принимает `reBehavior`:
- `'pair-select'` — логика V88 (firstRESite pairing, snap на cut, acquisitionMethod). Переезжает из `RangePickerModal` в стратегию хука.
- `'cut'` — popover «разрезать здесь». Переезжает из `ContainerEditorSkeleton`. Стратегия параметризуется callback'ом (`onCutHere`), **не** импортит skeleton-state.
- `'off'` — Library / Importer, RE display-only.

`outOfRangeMask` — хук принимает source диапазона (`{start,end}` или resolver), call-site передаёт свой.

Каждый call-site после: `const sel = useSequenceSelection({ reBehavior, ... })` → spread `sel`-пропов на `SequenceTab`. Ручная обвязка (включая дублированный drag-grace) удаляется.

## База / контекст — где граница

**База (хук, идентично везде):** курсор/caret, drag-select, drag-grace, feature-click select, AA-select, copy. Отсутствие любого в любом call-site = баг, не вариант.

**Контекст (параметры хука / композиция, НЕ форк копии):** `reBehavior`-стратегия; что делает commit (`onConfirm` в picker'е / `pendingEdits` в editor'е); source для `outOfRangeMask`; окружающие панели. Контекст — параметр, не своя копия обвязки.

## Scope IN

- Новый хук `useSequenceSelection`.
- 3 RE-стратегии (`pair-select` / `cut` / `off`) — `pair-select` и `cut` вынесены из `RangePickerModal` и `ContainerEditorSkeleton` без потери поведения.
- Перевод call-sites на хук: `RangePickerModal`, `ContainerEditorSkeleton` (оба таба), `AssemblyShellBody`, `PcrModeShell`, Library `SingleInspector` — удаление ручных копий.
- Functional parity (см. мандат).

## Scope OUT

- `SequenceView` рендер-ядро и `SequenceTab` контракт пропов — не переписываются (хук кормит те же пропы).
- `useSelectionState` (внутренний pointer→DOM механик SequenceView) — не трогается; новый хук — внешний слой над `SequenceTab`.
- Декомпозиция `SequenceView/index.jsx` (**44.65 KB, выше hard 40 KB** для .jsx) — реальный долг, в `TECH_DEBT.md`, но НЕ в этой спеке (хук = новый файл, index.jsx не раздувается).
- Легаси `FragmentEditor.SequenceGrid` — Этап 3 kill, не сюда.
- Plasmid-circular семья (`PlasmidMap` / `PlasmidViewer` / `PlasmidMiniMap`) — не sequence-grid viewer, отдельная спека.

## Functional parity — мандат

Перед переводом каждого call-site — выписать ВСЁ, что его ручная обвязка делает с выделением: state, каждый handler, RE-поведение, источник mask, drag-grace, acquisitionMethod. Хук обязан покрыть всё. RE-стратегия обязана сохранить **и** pair-select (V88), **и** cut-popover без потерь. «Display-only by architecture» — только с явным OK Игоря.

Прочитано при диагнозе (основа спеки): `SequenceView/index.jsx`, `useSelectionState.js`, `SequenceTab.jsx`, `RangePickerModal.jsx`, `ContainerEditorSkeleton.jsx`.
**Code обязан дочитать перед переводом** (parity-выписка):
- `editor/assembly-mode/AssemblyShellBody.jsx` (~22 KB) — «same shape» по комментарию RangePicker; подтвердить.
- `editor/operation-modes/PcrModeShell` — специфика `onWritePrimer` / `showSelectionTm`.
- `Library/inspector/LibrarySingleInspector.jsx` (~39 KB) — RE display-only, cursorPos/anchor pattern, `pendingScroll`.

## Тесты

- Хук `useSequenceSelection` — unit: caret, range, drag-grace (короткий drag не сбрасывает выделение), переключение стратегии.
- RE-стратегии — unit: `pair-select` даёт `[cutA,cutB]` + `acquisitionMethod='restriction'`; `cut` зовёт cut-callback; `off` — no-op на RE-клик.
- Регрессия каждого переведённого call-site: выделение, RE-поведение этого контекста, mask. Полный Vitest зелёный, build clean.

## Риски

- `AssemblyShellBody` / `PcrModeShell` могли накопить специфику сверх RangePicker — parity-выписка перед переводом обязательна.
- `SequenceTab` контракт ~25 пропов; хук должен отдавать совместимый набор. Митигация: хук возвращает именно эти пропы, `SequenceTab` не меняется.
- RE-стратегия `'cut'` в `ContainerEditorSkeleton` тянет `RestrictionSitePopover` + `cutContainerAtCursor` (skeleton-state). Стратегия обязана быть параметризована callback'ом, иначе хук завязывается на skeleton.
- `index.jsx` 44.65 KB уже за лимитом — хук кладётся отдельным файлом, index.jsx не трогаем.

## Открытые вопросы

1. Файл хука — `SequenceView/hooks/useSequenceSelection.js` или `lib/`? Library и skeleton оба импортят → `lib/` нейтральнее.
2. RE-стратегия — объект-конфиг или набор callback'ов? (`cut` нужен `onCutHere`; `pair-select` нужен результат + `acquisitionMethod` — вероятно `mode` + разные коллбэки.)
3. `selectionMode` `'dna'|'aa'` — в хук или это SequenceView-внутреннее? По коду call-sites его держат → в хук.

## Порядок

1. Дочитать 3 оставшихся call-site (parity-выписка).
2. `useSequenceSelection` + 3 RE-стратегии — извлечь `pair-select` из RangePicker, `cut` из ContainerEditor.
3. Перевести call-sites по одному, регрессия после каждого.
4. Удалить дублированный drag-grace и ручные обвязки.

---

## ОТЧЁТ CODE (реализовано 22.05.2026)

**Статус:** ✅ РЕАЛИЗОВАНО. Все scope-IN пункты закрыты, full parity сохранён.

### Parity-выписка (шаг 1)

Прочитаны 3 мандатных call-site. Матрица обвязки по 5 контекстам:

| Поведение | RangePicker | ContainerEditor | AssemblyShellBody | PcrModeShell | Library (useInspectorSelectionNav) |
|---|---|---|---|---|---|
| caret/anchor/mode/strand | ✓ init 0 | ✓ init null | ✓ init 0 | ✓ init 0 | ✓ init null |
| onCaretChange collapse | ✓ + drag-grace | ✓ + drag-grace | ✓ | ✓ (V80) | ✓ |
| drag-grace 250 ms | ✓ | ✓ | ✗ | ✗ | ✗ |
| RE behavior | pair-select (V88) | cut popover | — | — | display-only |
| outOfRangeMask | [start,end] | piece.ranges | — | — | — |
| acquisitionMethod | ✓ (cursor/restriction/feature/numeric) | — | — | — | — |
| pendingScroll | — | ✓ | — | — | ✓ + bar-scrub + caret-gliding |
| onWritePrimer / showSelectionTm | — | ✓ | ✓ | ✓ | ✓ |

Open questions резолвлены: (1) хук → `src/hooks/useSequenceSelection.js` (нейтрально для Library+skeleton); (2) RE-стратегия = `reBehavior` строка + коллбэки `onCutHere`/`onPairCommit`; (3) `selectionMode` — в хук.

### Хук (шаг 2)

`src/hooks/useSequenceSelection.js` (7.9 KB) — owns caret/anchor/mode/strand + acquisitionMethod, onCaretChange со встроенным drag-grace (250 ms), onSelectRange, onRestrictionClick с 3 стратегиями. Возвращает `viewerProps` bundle + индивидуальные сеттеры + derived `selStart/selEnd/hasSelection`. Параметры контекста: `initialCaret`, `resetKey`, `reBehavior`, `reEnzymes`, `onPairCommit`, `onCutHere`, `onAfterCaret`, `onAfterSelect`.

### Переведённые call-sites (шаг 3-4)

- **PcrModeShell** → `reBehavior:'off'`. Удалены 4 useState + onSelectRangeFromView + onCaretChange (V80 collapse). primer-writing layered поверх через `sel.caretAnchor/caretPos`.
- **AssemblyShellBody** → `reBehavior:'off'`. Удалены 4 useState + 2 handler. `useAssemblyPrimerWriting` кормится `sel.caretAnchor/caretPos`.
- **RangePickerModal** → `reBehavior:'pair-select'`, `reEnzymes:RE_ENZYMES`. V88 pair-select math переехал ЦЕЛИКОМ в хук (firstRESiteRef, cut-snap, acquisitionMethod='restriction'). start/end теперь derive из `sel.caretAnchor/caretPos` (raw, picker-семантика anchor=start/pos=end). reHighlightKey: single из `sel.firstRESite`, dual из `onPairCommit`. feature/numeric — `methodOverride` (косметика hint, downstream branches только на 'restriction'). Mount-effect ставит default-selection [0, seq.length].
- **ContainerEditorSkeleton** → `reBehavior:'cut'`. cut-popover остался (`RestrictionSitePopover`/`cutContainerAtCursor`), привязан через `cutHandlerRef` (forward-ref, т.к. cut-handler объявлен ниже хука — skeleton-state НЕ импортится в хук). OOR mask (`containerRangeMask`) + pendingScroll (`onAfterCaret`) сохранены.
- **Library useInspectorSelectionNav** → `reBehavior:'off'`. Делегирует core хуку; bar-scrub (rAF coalescing + `caret-gliding`), pendingScroll, scrollOnFeatureClick (`onAfterSelect` gate) остались локальными. Внешний return-shape не изменён → LibrarySingleInspector не тронут.

### Дедуп

Дублированный drag-grace (`lastExtendAtRef` + `DRAG_GRACE_MS`) был в RangePicker И ContainerEditor — теперь один в хуке. Library/Pcr/Assembly раньше drag-grace НЕ имели — теперь получили (база per мандат). **Заметка о риске:** drag-grace вводит 250 ms окно после extend, в котором non-extend caretChange игнорируется. Для клавиатуры (shift+arrow → plain arrow в пределах 250 ms) это может проглотить ОДИН plain-arrow. Влияние минимальное (повторное нажатие срабатывает), поведение идентично уже-зашипленному ContainerEditor. Если биолог заметит — вынести drag-grace в опциональный параметр (keyboard-nav контексты выключают).

### Тесты

- `useSequenceSelection.test.js` — 15 unit: base (caret/range/aa/reset), drag-grace (короткий drag не сбрасывает + after-grace collapse), pair-select ([cutA,cutB] + acquisitionMethod), cut (onCutHere fired, caret не тронут), off (no-op), side-effect hooks.
- Регрессия per call-site: pcr-mode (47), assembly-mode + zone-assembly-primers + range-picker (64), container-editor-skeleton-v2 + cut-at-cursor + restriction-sites (54), linear-feature-bar + sequence-tab-rewire/origin + lazy-tabs (40) — все зелёные.
- **Full Vitest: 397 файлов / 3917 pass / 18 skipped.** Build clean (`vite build` OK).

### Size budget

- Новый `src/hooks/useSequenceSelection.js` = 7.9 KB (под лимитом .js 25 KB).
- `SequenceView/index.jsx` = 45.7 KB — НЕ тронут (хук отдельным файлом, как требует scope OUT). Долг декомпозиции index.jsx остаётся в TECH_DEBT, не в этой спеке.
- Нетто по строкам: +565 / −349 (хук + тесты добавлены, ручные копии удалены).

### Не сделано / отложено (scope OUT соблюдён)

- `SequenceView` рендер-ядро + `SequenceTab` контракт — не тронуты.
- `useSelectionState` (pointer→DOM) — не тронут.
- Декомпозиция `index.jsx` — отдельный долг.

**Координационные файлы (PROJECT_STATE / DECISIONS / BUGS / RELEASES / CURRENT_TASK) не финализированы** — за Chat.
