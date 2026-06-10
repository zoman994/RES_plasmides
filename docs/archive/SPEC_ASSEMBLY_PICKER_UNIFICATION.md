# SPEC — Унификация source-picker'а ассемблера с canvas-пикером

**Тип:** B (унификация-рефакторинг). **Запрос:** Игорь 22.05.2026 — ассемблер не должен иметь свой source-picker; добавление сегмента идёт через тот же пикер, что добавление на canvas. Оформление одинаковое (минимапа плазмиды + вываливающийся список). Полная унификация — одна сущность.
**Статус:** готова к реализации. Диагноз/проектирование — чтением `EmptyAssemblyLibrary.jsx`, `AssemblyShellBody.jsx`, `LibrarySearchBar.jsx`, `picker-prefs.js`, `PlaceholderTreePicker` (структура из COMPONENT_MAP).

> **Связанная спека:** `SPEC_ASSEMBLY_CUSTOM_SEGMENT.md` (тип A, пишется отдельно) — убирает сущности Обвес/Синтез/Gap, заменяет их одной модалкой «вставить свой сиквенс / из библиотеки» + Ctrl+V в позиции курсора со split-логикой сегмента. **Эта спека (picker-unification) НЕ трогает** `SnippetCatalogModal` / `SynthesisModal` / `InsertGapModal` и кнопки Обвес/Синтез/Gap в `AssemblyToolbar` — они живут до отдельной спеки. Здесь — только унификация library-пикера «из библиотеки».

---

## 0. Размеры затрагиваемых модулей

- `canvas/LibrarySearchBar.jsx` — 15.46 KB. После обогащения (favorites/recent + фильтры + ATGC-поиск + entry-centric секции) ≈ 24–26 KB — под hard 40 для .jsx, приближается к soft 30 → **watch-точка**.
- `editor/assembly-mode/EmptyAssemblyLibrary.jsx` — 17.40 KB. **Удаляется целиком** (−17 KB).
- `editor/assembly-mode/AssemblyShellBody.jsx` — 21.86 KB. Правка mount-точек, под лимитом.
- `canvas/CanvasLayoutView.jsx` — 49.18 KB (над hard 40). Касание — props у `<LibrarySearchBar>` (~3–5 строк). Декомпозиция файла — отдельный TECH_DEBT, становится срочной (3 спеки трогают этот файл — V99, COLLISION, эта). В IN-scope не входит.
- `canvas/picker-prefs.js` — 2 KB. Не меняется, переиспользуется.

## 1. Где задача сядет (связи)

`LibrarySearchBar` сейчас живёт в `canvas/`, монтируется только `CanvasLayoutView`. После задачи — **единый library-picker для двух поверхностей**: canvas (`CanvasLayoutView`) и редактор сборки (`AssemblyShellBody`).

Удаляется: `EmptyAssemblyLibrary` (импортируется только `AssemblyShellBody` — Code подтверждает grep'ом).

`PlaceholderTreePicker` — используется И canvas'ом (клик по placeholder-блоку, `pickerForId`), И ассемблером (`pickerOpen`, «+ Плазмида»). Эта спека снимает **только assembly-usage**. Canvas-usage `PlaceholderTreePicker` остаётся — его унификация отдельный кандидат, не в scope.

`RangePickerModal` + `onRangeConfirm` + `insertSegment` — downstream, **не меняются**. Пикер выбирает контейнер; выбор фрагмента (праймеры/RE/диапазон/фича) остаётся в `RangePickerModal`.

**Вне scope (отдельная спека `SPEC_ASSEMBLY_CUSTOM_SEGMENT`):** `SnippetCatalogModal`, `SynthesisModal`, `InsertGapModal`, actions `insertSnippet`/`insertSynthesis`/`insertManualSegment`, кнопки Обвес/Синтез/Gap в `AssemblyToolbar`. Эта спека их не касается.

## 2. Контекст

В ассемблере три source-picker'а, все ведут в `RangePickerModal` → `insertSegment`:
- `EmptyAssemblyLibrary` — bespoke-пикер в пустом ассемблере (свой поиск, фильтры, секции, `EntryRow` с глифом `◯/▭` вместо минимапы).
- `PlaceholderTreePicker` — модалка «+ Плазмида» в непустом (`AssemblyToolbar.onAddSegment`).
- `AssemblySidebar` — drag-источник.

На canvas — `LibrarySearchBar` (минимапа + вываливающийся список). Это эталон оформления. Лишние bespoke-сущности в ассемблере → задача §17 «карта связей > новая сущность».

## 3. Стратегия

Обобщить `LibrarySearchBar` до **единственного library-picker'а** богатой модели, использовать его на обеих поверхностях. `EmptyAssemblyLibrary` удалить. Assembly «+ Плазмида» переключить на тот же компонент.

«Богатая модель» = объединение фич обоих пикеров:
- из `LibrarySearchBar`: `MiniPlasmidMap`-минимапа в строке, dropdown-shell, `onSelectEntry`, drag-out с `TREE_DRAG_MIME`.
- из `EmptyAssemblyLibrary`: Избранное/Недавно (persist через `picker-prefs.js`), фильтры типа (Все/Circular/Linear/Primer), поиск по последовательности (ATGC), подсветка совпадений, entry-centric секции (Из проекта / Коллекция / Другие проекты).

Обе поверхности получают одинаковый богатый пикер (Игорь явно OK на обогащение canvas-пикера).

Секция «вставить свой сиквенс» в пикер НЕ добавляется — это отдельная модалка из `SPEC_ASSEMBLY_CUSTOM_SEGMENT`.

## 4. Архитектурные решения

1. **Обогатить `LibrarySearchBar` на месте**, не создавать новый файл (не плодить сущности). Опционально — переименовать в `LibraryPicker` и переместить из `canvas/` в нейтральное `CanvasSkeleton/` (две поверхности используют) — это полировка, на усмотрение Code, не блокер.
2. **Универсальное ядро компонента** (рендерит сам, на обеих поверхностях): search input, фильтр-пилюли (Все/Circular/Linear/Primer), секции Избранное + Недавно (из `picker-prefs.js`), entry-centric секции Из проекта / Коллекция / Другие проекты, ATGC-поиск (`name` ИЛИ `payload.sequence`), `<mark>`-подсветка, `MiniPlasmidMap`-строки.
3. **Опциональный prop `extraSections`** — canvas передаёт свои canvas-специфичные группы (контейнеры canvas / сборки-zones / праймеры-пул); ассемблер не передаёт. Точную форму prop'а проектирует Code; принцип — entry-секции и favorites/recent встроены, surface-специфичное прокидывается.
4. **`onSelectEntry({kind, id, entry})`** — единый колбэк. Canvas-хендлер: библиотечный entry → `addContainerFromEntry` (см. `SPEC_V99`). Assembly-хендлер: entry → `setRangeSource({kind:'entry', payload:entry})` → `RangePickerModal`.
5. **`PlaceholderTreePicker` в assembly не используется** — `AssemblyShellBody` `pickerOpen`/`PlaceholderTreePicker` заменяются на единый пикер. Canvas-usage `PlaceholderTreePicker` не трогать.
6. **Текущие записи проекта.** `LibrarySearchBar` сейчас исключает entries текущего проекта из `fromLibrary`. Entry-centric модель (секция «Из проекта») их включает — это чинит дыру: ассемблеру нужны плазмиды текущего проекта.

## 5. Functional parity — что обязано выжить

Редизайн → parity по умолчанию (CHAT_PLAYBOOK). Из `EmptyAssemblyLibrary` в единый компонент переносится:
- поиск по имени ✓ (уже есть) + **поиск по последовательности ATGC** (добавить);
- **фильтр-пилюли** Все / Circular / Linear / Primer (добавить);
- **Избранное** (★ toggle через `toggleFavorite`/`getFavorites`) + **Недавно** (`recordRecent`/`getRecent`) — `picker-prefs.js` как есть;
- секции **Из проекта · {name} / Коллекция / Другие проекты** (collapsible);
- **`<mark>`-подсветка** совпадения в имени.
Из `LibrarySearchBar` сохраняется: `MiniPlasmidMap`-минимапы, dropdown-shell, drag-out `TREE_DRAG_MIME`, `onSelectEntry`.

**НЕ переносится:** Обвес/Синтез/Gap (футер `EmptyAssemblyLibrary`) — эти сущности упраздняются в `SPEC_ASSEMBLY_CUSTOM_SEGMENT`, их не нужно сохранять при parity.

## 6. Файлы / сигнатуры

**`LibrarySearchBar.jsx`** — обогатить: добавить фильтр-пилюли, ATGC-поиск в `groupResults`, favorites/recent секции (через `picker-prefs`), entry-centric секции, `<mark>`-подсветку, prop `extraSections`. Без copy-paste — переиспользовать `EntryThumbnail`/`MiniPlasmidMap`, логику фильтров портировать из `EmptyAssemblyLibrary` (`matchesType`/`matchesQuery`/`HighlightedText` — перенести как helper'ы, не дублировать).

**`AssemblyShellBody.jsx`** — (а) empty-state: `<EmptyAssemblyLibrary>` → единый пикер с `onSelectEntry`→`setRangeSource({kind:'entry'})`; (б) `pickerOpen`/`PlaceholderTreePicker` («+ Плазмида» непустого) → тот же пикер (dropdown/popover от тулбар-кнопки). Удалить import `EmptyAssemblyLibrary` + `PlaceholderTreePicker`. **НЕ трогать** `onAddSnippet`/`onAddSynthesis`/`onAddGap` и соответствующие модалки — они на `SPEC_ASSEMBLY_CUSTOM_SEGMENT`.

**`CanvasLayoutView.jsx`** — `<LibrarySearchBar>` получает `extraSections` с canvas-группами (контейнеры/zones/primers). ~3–5 строк.

**`EmptyAssemblyLibrary.jsx`** — удалить файл.

## 7. Порядок выполнения

1. Обогатить `LibrarySearchBar` (ядро: фильтры + favorites/recent + ATGC + entry-секции + подсветка) + prop `extraSections`. Unit-тесты `groupResults`/фильтров.
2. `CanvasLayoutView` — передать `extraSections`, проверить canvas-пикер не сломан.
3. `AssemblyShellBody` — переключить empty-state + «+ Плазмида» на единый пикер; удалить `EmptyAssemblyLibrary` import + файл.
4. Обновить тесты `EmptyAssemblyLibrary`/`LibrarySearchBar`/`PlaceholderTreePicker`-assembly под новый компонент.
5. Полный Vitest + `vite build`.

## 8. Тесты

- Unit: `groupResults` с ATGC-query матчит по `sequence`; фильтр-пилюли сужают; favorites/recent секции из `picker-prefs`.
- Integration canvas: пикер с `extraSections` показывает canvas-группы; клик entry → `addContainerFromEntry` (после V99); drag-out даёт `TREE_DRAG_MIME`.
- Integration assembly: пустой ассемблер показывает единый пикер; клик entry → `RangePickerModal`; «+ Плазмида» непустого открывает тот же пикер.
- Регрессия: `RangePickerModal`/`insertSegment` не затронуты; Обвес/Синтез/Gap модалки (вне scope) не сломаны; полный Vitest + `vite build`.

## 9. Риски

- `LibrarySearchBar` 15→~25 KB — под hard 40, у soft 30. Watch; если перевалит soft — декомпозиция секции/строки в под-файл.
- `CanvasLayoutView.jsx` над hard-лимитом; эту + `SPEC_V99` + `SPEC_CANVAS_NODE_COLLISION` все трогают файл. Касание здесь ~5 строк; но декомпозиция `CanvasLayoutView.jsx` назрела — **рекомендую отдельный TECH_DEBT-пункт высоким приоритетом**.
- Поведение canvas-пикера меняется (favorites/recent/фильтры/ATGC) — Игорь явно OK.
- Testid-churn: тесты `EmptyAssemblyLibrary` (testids совпадали с `PlaceholderTreePicker`) переписываются под новый компонент.
- Ordering: V99 + COLLISION + эта — все по `CanvasLayoutView`. Code мерджит аккуратно; рекомендуемый порядок V99 → эта → COLLISION (или единым заходом, Code решает).
- Пересечение с `SPEC_ASSEMBLY_CUSTOM_SEGMENT`: обе трогают `AssemblyShellBody`. Эта — mount пикера; та — модалки Обвес/Синтез/Gap. Зоны не пересекаются (разные секции файла), но Code держит обе в голове при мердже.

## 10. Открытые вопросы

- Affordance «+ Плазмида» в непустом ассемблере: popover-dropdown от тулбар-кнопки vs лёгкая модалка-хост. Рекомендую popover (консистентно с «вываливающимся списком»). Точную форму — Code, Игорь смотрит на приёмке.

## 11. STOP

После реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md` (commit range, Vitest counters, build, size budget `LibrarySearchBar`). НЕ финализировать `PROJECT_STATE`/`DECISIONS` — фича принимается визуально отдельной сессией; DEC о едином пикере фиксирует Chat при финализации.
