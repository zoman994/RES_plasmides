# SPEC V96 — Overlay-геометрия не пересчитывается после two-phase render

**Тип:** C (bugfix одного семейства компонентов). **Баг:** V96 в `BUGS.md`.
**Источник:** Игорь 22.05.2026 — выделение и цветные участки (out-of-range маска в пикере) рендерятся «скучено и едет» при первом открытии любого вьювера; чинится любым кликом.
**Статус:** готова к реализации. Диагноз — чтением кода всех 5 overlay-файлов + `index.jsx` в этой сессии.

---

## 0. Размеры затрагиваемых модулей

`SequenceView/` + `SequenceView/overlays/`:
- `index.jsx` — **44.65 KB** (выше hard-лимита 40 KB для .jsx).
- `overlays/SelectionOverlay.jsx` — 11.74 KB
- `overlays/CaretOverlay.jsx` — 7.13 KB
- `overlays/OutOfRangeMaskOverlay.jsx` — 6.81 KB
- `overlays/SearchHitsOverlay.jsx` — 6.38 KB
- `overlays/SegmentZonesOverlay.jsx` — 7.85 KB

`index.jsx` за лимитом — **но фикс добавляет ~6 строк нетто** (одно `useState` + один `useLayoutEffect` + один prop в 5 точек JSX). Это bugfix, не функциональность; декомпозиция 44 KB файла в рамках type-C bugfix = взрыв scope. Декомпозиция `index.jsx` остаётся отдельным пунктом `TECH_DEBT.md`, в эту спеку НЕ входит. Дописать 6 строк фикса — допустимо.

## 1. Где задача сядет

Фикс целиком внутри `SequenceView/`: `index.jsx` (оркестратор) + 5 overlay-файлов. Overlay-компоненты больше никто не импортирует — только `index.jsx`. Consumers `SequenceView` (`RangePickerModal`, `ContainerEditorSkeleton`, `AssemblyShellBody`, `PcrModeShell`, Library `SingleInspector`, Annotator preview, Importer) **не меняются** — фикс внутренний, контракт пропов `SequenceView` / `SequenceTab` не трогается. Радиус правки — нулевой за пределами `SequenceView/`.

## 2. Корень (детали в BUGS.md V96)

`SequenceView/index.jsx` делает two-phase render: `tracksReady` (`useState(false)`, флип через `requestIdleCallback`, timeout 250 ms). Фаза 1 — `SequenceLine` рисует только ruler и DNA-strands. Фаза 2 — добавляются annotation/AA-треки, строки становятся выше, layout reflow'ится.

Все 5 overlay-компонентов считают геометрию rect'ов в `useLayoutEffect`, меряя `offsetTop` / `offsetLeft` / strand-офсеты строк из DOM. Ни у одного в deps нет сигнала о завершении фазы 2 — после флипа overlay не пересчитывается, висит на геометрии фазы 1. Клик меняет `caretPos` (он в deps большинства) — пересчёт. `OutOfRangeMaskOverlay` (цветная маска пикера) от `caretPos` не зависит вообще — не чинится даже кликом по канвасу, только правкой диапазона. Отсюда «цветные участки скучены и едут».

Deps `useLayoutEffect` каждого (по коду, дословно):
- `SelectionOverlay` — `caretPos, caretAnchor, charPx, charsPerLine, containerRef, showBottomStrand, selectionMode, selectionStrand, selectionFrame, seqLength`
- `OutOfRangeMaskOverlay` — `rangeStart, rangeEnd, charPx, charsPerLine, containerRef, seqLength`
- `CaretOverlay` — `caretPos, charPx, containerRef, showBottomStrand, seqLength, charsPerLine`
- `SearchHitsOverlay` — `hits, charPx, charsPerLine, containerRef`
- `SegmentZonesOverlay` — `zones, charPx, charsPerLine, containerRef` (есть частичный rAF-retry на «strand-rows ещё не в DOM», но он покрывает ≤2 кадра ~32 ms, а флип фазы 2 — до 250 ms; не помогает)

Ни у кого нет сигнала «layout строк изменился».

## 3. Решение — `layoutEpoch`

Не перечислять флаги (`tracksReady`, `measured`, …) в deps каждого overlay — хрупко, и придётся дотрагивать overlay-файлы при каждом будущем изменении рендера строк. Вместо — один счётчик.

В `index.jsx`:
- `const [layoutEpoch, setLayoutEpoch] = useState(0);`
- `useLayoutEffect(() => { setLayoutEpoch((e) => e + 1); }, [linesJsx]);`
- `linesJsx` — уже существующий `useMemo`. Его reference меняется при ЛЮБОМ изменении, реально reflow'ящем строки (`measured`, `tracksReady`, `charPx`, `charsPerLine`, `wrapTailLines`, `features`, …) — это всё уже в его deps. `layoutEpoch` инкрементируется ровно тогда.
- Передать `layoutEpoch={layoutEpoch}` во все 5 overlay в JSX `index.jsx`.

Каждый overlay: принять prop `layoutEpoch` (default `0`), добавить его в массив deps своего `useLayoutEffect`. Больше ничего.

**Loop-safety:** deps `linesJsx` НЕ включают `layoutEpoch` — bump epoch'а не пересчитывает `linesJsx` — `useLayoutEffect([linesJsx])` не перезапускается — бесконечного цикла нет. `useLayoutEffect` (не `useEffect`) — пересчёт overlay до paint, без кадра со старой геометрией.

**Почему не «добавить `tracksReady` в deps»** (как в bullet'е V96 в `BUGS.md`): пропустит reflow от `wrapTailLines` (circular-плазмиды) и потребует трогать overlay-файлы при каждом следующем подобном изменении рендера. `layoutEpoch` от `linesJsx` покрывает класс целиком. **Эта спека уточняет подход V96 — Code следует спеке.**

## 4. Scope

**IN:** `index.jsx` — `layoutEpoch` state + effect + prop в 5 overlay. 5 overlay-файлов — приём пропа + dep. Тесты.

**OUT:** декомпозиция `index.jsx` (TECH_DEBT, отдельно). Контракт пропов `SequenceView` / `SequenceTab`. rAF-retry в `SegmentZonesOverlay` — оставить как есть (с `layoutEpoch` он избыточен, но удаление = лишний риск; не трогать). Любой consumer `SequenceView`. `SPEC_VIEWER_UNIFICATION` (рендер-ядро им явно исключено — это разные фиксы).

## 5. Тесты

`__IS_TEST_ENV__` делает `tracksReady` стартово `true` — two-phase флип в тест-среде естественно не воспроизводится. Поэтому:
- **Per-overlay unit (основное, детерминично):** смонтировать overlay изолированно с fake `sequence-view-line` узлами в DOM на геометрии A — проверить rects. Мутировать geometry узлов (offsetTop/height) + инкрементировать prop `layoutEpoch` — проверить, что rects пересчитались на геометрию B. 5 тестов, по одному на overlay.
- **Integration (1):** в тесте `index.jsx` с локально форсированным `__IS_TEST_ENV__ = false` (или экспонировать флип `tracksReady` через тест-хук) — смонтировать `SequenceView` с выделением, дождаться флипа фазы 2, проверить что `sequence-view-selection` rect совпал с финальной геометрией строки БЕЗ клика.
- **Регрессия:** полный Vitest зелёный, `vite build` clean. Существующие overlay-тесты не ломаются (prop опционален, default `0`).

## 6. Риски

- `layoutEpoch`-bump даёт лишний re-render overlay, когда строки фактически не сдвинулись. Цена — повторный замер `offsetTop` + `setRects`. Дёшево, не per-frame (только на смену `linesJsx`). Не митигируем.
- `setLayoutEpoch` в `useLayoutEffect` — синхронный extra-commit до paint; несколько раз на mount, дальше редко. Приемлемо.
- `SegmentZonesOverlay` имеет свой `anchorRef` / `containerRef`-fallback + rAF-retry — добавление `layoutEpoch` в deps с ними не конфликтует (deps только добавляются). Проверить, что rAF-retry не зацикливается — не должен, `attempt`-счётчик от epoch'а не зависит.
- Default пропа `layoutEpoch = 0` обязателен — иначе изолированные overlay-тесты и любой прямой mount overlay получат `undefined` в deps.

## 7. Порядок + STOP

1. `index.jsx` — `layoutEpoch` state + `useLayoutEffect([linesJsx])` + prop в 5 overlay.
2. 5 overlay-файлов — приём пропа + dep.
3. 5 unit + 1 integration теста.
4. Полный Vitest + `vite build`.

**STOP:** после реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md` (commit range, Vitest counters, build). НЕ финализировать `PROJECT_STATE` / `BUGS` / `DECISIONS` — V96 переедет в FIXED отдельной Chat-сессией после визуальной приёмки.
