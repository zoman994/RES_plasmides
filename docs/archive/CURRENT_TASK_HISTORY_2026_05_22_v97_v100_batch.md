> **АРХИВ.** Контракт bug-batch V97–V100 + 3 фичи и отчёт Code. Перемещён из корневого `CURRENT_TASK.md` 22.05.2026 при выдаче editable-assembly спринта 1. Визуальная приёмка батча отложена Игорём до реализации wave editable-assembly + консолидации калькулятора — этот файл несёт чеклист и отчёт для той приёмочной сессии.

---

# CURRENT_TASK.md

## 🔵 Статус: Хендофф Code — bug-batch V97–V100 + 3 фичи assembly/canvas (22.05.2026)

Bug-сессия 22.05.2026. Восемь спек. V96 уже реализован Code (отчёт — `docs/archive/CODE_REPORT_V96_OVERLAY_2026_05_22.md`, ждёт визуальной приёмки). Остальные семь — Code реализует сейчас.

**TL;DR для Code:** прочитай `CLAUDE.md` / `BUGS.md` / этот файл. Выполни 7 спек из `docs/` в порядке §«Порядок выполнения». Спеки в `docs/` НЕ переписывай. После зелёного Vitest + `vite build` остановись, отчёт в этот файл. НЕ финализируй `PROJECT_STATE` / `BUGS` / `DECISIONS` / `RELEASES` / `ANCHORS` / `TECH_DEBT` / `CLAUDE.md` / `COMPONENT_MAP`.

---

## Порядок чтения для Code

1. `CLAUDE.md` → `BUGS.md` (записи V96–V100) → этот файл.
2. Спека выполняемого пункта (по мере прохождения, из `docs/`).
3. Для багфиксов V97–V100 — детали корня в `BUGS.md`, не дублированы в спеках.

---

## Чеклист — 7 спек

Багфиксы (тип C):
- [ ] **V97** — `docs/SPEC_V97_RE_DOUBLE_FIRE.md`. RE double-fire. Локальный, не пересекается с фичами.
- [ ] **V98** — `docs/SPEC_V98_OOR_MASK_WRAPTAIL.md`. OOR-маска не затеняет текст на wrap-tail строках. `OutOfRangeMaskOverlay.jsx` — `trailing-wrap`/`leading-wrap` ветки читают `data-line-start`.
- [ ] **V99** — `docs/SPEC_V99_CANVAS_CLICK_ADD.md`. Клик library-entry на canvas не должен открывать редактор сборки. `CanvasLayoutView.jsx::onSearchPick` — удаление `setTimeout`-блока.
- [ ] **V100** — `docs/SPEC_V100_KILL_PROXIMITY_JUNCTION.md`. Drop контейнера авто-создаёт proximity-junction. `useCanvasLayoutDrag.js::onPointerUp` — удаление блока `computeAutoJunctions`/`reconcileAutoJunctions`.

Фичи (тип B):
- [ ] **picker-unification** — `docs/SPEC_ASSEMBLY_PICKER_UNIFICATION.md`. Единый library-пикер для canvas + ассемблера. Обогащение `LibrarySearchBar`, удаление `EmptyAssemblyLibrary`.
- [ ] **custom-segment (только SAFE-scope §3)** — `docs/SPEC_ASSEMBLY_CUSTOM_SEGMENT.md`. Замена Обвес/Синтез/Gap на секцию «вставить свой сиквенс» в пикере. **§6 спеки НЕ реализовывать** — ждёт фразы Игоря (следующая сессия).
- [ ] **collision** — `docs/SPEC_CANVAS_NODE_COLLISION.md`. Ноды canvas не наезжают друг на друга (collision-resolve, loose-only). Helper в `canvas-layout.js`.

---

## Порядок выполнения

Три фичевые спеки + V99 + collision трогают `CanvasLayoutView.jsx` / `AssemblyShellBody.jsx` — мерджить последовательно.

1. **V97, V98, V100** — независимые багфиксы, не пересекаются с фичами. Можно первыми, в любом порядке.
2. **V99** — `onSearchPick` в `CanvasLayoutView.jsx`.
3. **picker-unification** — `LibrarySearchBar` обогащение + `AssemblyShellBody` + `CanvasLayoutView`.
4. **custom-segment SAFE** — поверх picker-unification (та же `LibrarySearchBar` + `AssemblyShellBody`).
5. **collision** — поверх V99 (обе трогают `onSearchPick`).

Каждая спека несёт свой раздел «Порядок выполнения» + размеры модулей — следовать им.

---

## STOP-условие и формат отчёта

После реализации всех 7 пунктов + зелёного полного Vitest + `vite build` clean — **STOP**. Отчёт в этот файл, отдельной секцией на каждую спеку или сводно:
- commit range (или working-tree, если без коммита);
- Vitest counters (pass / skip / fail), pytest если задет backend;
- `vite build` результат;
- spec deviations — если отступал от спеки, явно;
- size budget затронутых файлов (особенно `LibrarySearchBar.jsx`, `CanvasLayoutView.jsx`).

Визуальная приёмка — **отдельная Chat-сессия**, не в этой. До приёмки баги остаются OPEN в `BUGS.md`.

---

## Что НЕ трогать

- Координационные файлы — `PROJECT_STATE.md` / `BUGS.md` / `DECISIONS.md` / `RELEASES.md` / `ANCHORS.md` / `TECH_DEBT.md` / `CLAUDE.md` / `COMPONENT_MAP.md`. Их финализирует Chat после приёмки.
- Спеки в `docs/` — не переписывать.
- **`SPEC_ASSEMBLY_CUSTOM_SEGMENT.md` §6** (вставка по курсору / Ctrl+V / split piece) — НЕ реализовывать. Ждёт фразы Игоря.
- Backend `src/pvcs/` — не задет.
- Алгоритмические зоны (§3 CHAT_PLAYBOOK) — без правок сверх спеки.

---

## Известные пересечения (для аккуратного мерджа)

- `CanvasLayoutView.jsx` (49 KB, над hard 40) — трогают V99, picker-unification, collision. Декомпозиция файла — назревший TECH_DEBT, **в этот batch не входит**, но отметить в отчёте если стало хуже.
- `AssemblyShellBody.jsx` — трогают picker-unification (mount пикера) и custom-segment (удаление 3 модалок). Разные секции файла.
- `LibrarySearchBar.jsx` — picker-unification обогащает, custom-segment добавляет paste-секцию. Если >soft 30 KB — декомпозиция под-компонентом (см. спеки).

---

## При регрессии

Если новый пункт ломает существующий тест — не глушить, не править тест «под результат». Зафиксировать в отчёте: какой тест, какой пункт, предполагаемая причина. Chat разбирает на приёмке.

---

## V96 — статус

Реализован Code 22.05.2026 (ждёт визуальной приёмки вместе с V97–V100). Полный отчёт — `docs/archive/CODE_REPORT_V96_OVERLAY_2026_05_22.md`. Working-tree, branch `feature/m-x-7a-library-structure-v2`, база HEAD `7a25375`.

---

## Контекст по предыдущему батчу (M-FORMAT-V2 + 3×CLEANUP)

Большой acceptance-документ предыдущего батча (M-FORMAT-V2-CORE / NOTEBOOK / M-CANVAS-WORKFLOW-UX / 3×CLEANUP, Vitest 3840 pass) перезаписан этим хендоффом. Если визуальная приёмка того батча ещё не закрыта — его чеклист поднимать из истории git / `docs/archive/CURRENT_TASK_HISTORY_2026_05_20_format_v2_and_cleanup.md`.

---

**Дата:** 22.05.2026. **Статус:** готов к выдаче Code.

---

## 🔧 Отчёт Code — bug-batch V97–V100 + 3 фичи (22.05.2026)

**Прогон (финальный):** полный Vitest **3915 pass / 18 skipped / 0 fail** (402 файла, 1 skipped). `npx vite build` — clean (`✓ built`, PWA сгенерирован; только pre-existing warnings: chunk >500 KB, INEFFECTIVE_DYNAMIC_IMPORT `DagWorkspace`). Backend не задет (pytest не гонял). **Коммит не делал** — working-tree, branch `feature/m-x-7a-library-structure-v2`, база HEAD `7a25375`.

> ⚠ `git diff` против HEAD содержит и **pre-existing** working-tree правки прошлого батча (`EmptyAssemblyHint.jsx`+test — deleted, `HelpPopover.jsx`+test — modified) — они НЕ из этой сессии. V96 (overlay-геометрия) тоже в этом working-tree (отчёт `docs/archive/CODE_REPORT_V96_OVERLAY_2026_05_22.md`).

Порядок выполнения соблюдён: V97 → V98 → V100 → V99 → picker-unification → custom-segment SAFE → collision.

### Багфиксы (тип C)

**V97 — RE double-fire** (`RestrictionTrack.jsx`). Per-instance `mouseHandledRef`: `onMouseDown` ставит флаг + вызывает `onSiteClick`; `onClick` при флаге — сброс + `return` (жест уже обработан); без флага (`fireEvent.click` без mousedown) — как раньше (V88-совместимость). Ложный комментарий про «click не выстрелит» исправлен. `useSequenceSelection` не тронут. +3 теста `restriction-track-double-fire-v97`.

**V98 — OOR-маска на wrap-tail** (`OutOfRangeMaskOverlay.jsx`). Ветки `trailing-wrap`/`leading-wrap` слиты в общую `!wrapsOrigin` ветку, читающую `data-line-start` (как `main`): `lineLen=min(cpl,L−lineStart)`, колонка `pos−lineStart`. Bridge (`wrapsOrigin`) не тронут. +3 теста `out-of-range-mask-wraptail-v98`, регрессия V87 зелёная.

**V100 — kill proximity-junction** (`useCanvasLayoutDrag.js::onPointerUp`). Удалён блок `computeAutoJunctions`+`reconcileAutoJunctions` (ветка container) + dead import. Прочая drop-логика осталась. DEAD-sweep хвоста (`RECONCILE_AUTO_JUNCTIONS`, helper, junction-слой, JunctionPopover) НЕ делал — отдельная задача (§4 OUT). Helper+reducer остаются (тесты `skeleton-auto-junctions` зелёные). +1 тест `kill-proximity-junction-v100` (renderHook).

**V99 — клик library-entry не открывает редактор** (`CanvasLayoutView.jsx::onSearchPick`). Удалён `setTimeout`-блок (zone-wrap + `openEditorAssemblyTab`) + dead `searchStateRef` + unused import `buildAssemblyZoneAction`. Library-ветка = `addContainerFromEntry(entry, …)`. +1 integration `canvas-click-add-v99` (editor-window-shell НЕ монтируется после клика).

### Фичи (тип B)

**picker-unification** (`SPEC_ASSEMBLY_PICKER_UNIFICATION`). `LibrarySearchBar` переписан в единый богатый пикер (24.8 KB): entry-centric секции (Избранное/Недавно/Из проекта/Коллекция/Другие проекты через `picker-prefs`) + фильтр-пилюли (Все/Circular/Linear/Primer) + ATGC-поиск (имя ИЛИ `payload.sequence`) + `<mark>`-подсветка + drag-out `TREE_DRAG_MIME` + prop `extraSections` + dual-режим (`inline` / dropdown). Canvas (`CanvasLayoutView`) передаёт `extraSections` (На канвасе / Сборки / Праймеры) — canvas-специфичные группы. `AssemblyShellBody`: empty-state inline пикер + «+ Сегмент» popover; `EmptyAssemblyLibrary` + assembly-usage `PlaceholderTreePicker` удалены (canvas-usage `PlaceholderTreePicker` НЕ тронут). `RangePickerModal`/`insertSegment` не тронуты.
- **Deviation:** не «обогащение на месте», а реструктуризация модели секций — старые canvas-секции (library/in-project/zones/primers) → entry-centric core + `extraSections`. Поведение canvas-пикера изменилось (favorites/recent/фильтры/ATGC) — Игорь явно OK (спека §9). Тесты переписаны: `LibrarySearchBar.test` (новый контракт, 20 тестов), `EmptyAssemblyLibrary.test` удалён; обновлены empty-state пути в `assembly-mode`/`zone-assembly-toolbar`/`range-picker` (testid `skeleton-placeholder-picker*` → `assembly-source-picker*`).

**custom-segment SAFE — только §3** (`SPEC_ASSEMBLY_CUSTOM_SEGMENT`). Секция «Вставить свой сиквенс» в `LibrarySearchBar` (opt-in `onPasteSequence`): textarea ATGC + валидация A/C/G/T + счётчик + кнопка (disabled при invalid/пусто). `AssemblyShellBody`: paste → `insertManualSegment(draftId, {sequence}, atIndex)` (после `selectedSegmentId` либо конец) — путь V83 known-gap. Удалены 3 модалки (`InsertGapModal`/`SnippetCatalogModal`/`SynthesisModal`) + их wiring/state/handlers. `AssemblyToolbar`: 4 кнопки → одна «+ Сегмент».
- **§6 НЕ реализован** — фраза в спеке пустая. Никакого split-piece/Ctrl+V/курсор-вставки. Поведение: вставка только на границе сегментов.
- **Deviation:** `SnippetOnboardingTip` render убран из `AssemblyShellBody` (его import удалён вместе с модалками; сам файл-компонент оставлен как dead-code хвост §4 п6). Dead-code хвост (`INSERT_SNIPPET`/`INSERT_SYNTHESIS`, snippet/synthesis piece-kind, `snippet-catalog.js`) НЕ тронут. Тесты: удалены `snippet-entry-point`/`synthesis-entry-point`/`zone-assembly-gap`; `gap-known-sequence-v83` data-тесты сохранены, модал-integration блок переписан на paste-секцию (V83 покрыт end-to-end через новый путь); paste-валидация в `LibrarySearchBar.test`.

**collision** (`SPEC_CANVAS_NODE_COLLISION`). `canvas-layout.js`: pure `nodeRect`/`gatherObstacleRects`/`resolveNodeOverlap` (expanding-ring, gap 16 / step 24 / maxRadius 1200, детерминированный порядок направлений, clamp ≥0, graceful при maxRadius). Loose-only wiring в 4 точках: `useCanvasLayoutDrag::onPointerUp` (skip если drop в zone — переиспользует `findZoneAtPoint`), `use-tree-drop-target` (`ADD_CONTAINER_FROM_ENTRY`), `CanvasLayoutView::onSearchPick`(+position)/`onPickHoverOp`, `CanvasSkeleton/index.jsx::onPickKind`. Редьюсеры/`skeleton-state-canvas.js` НЕ тронуты (view-side, §2). Свежесть obstacle-bbox через `*StateRef`. +8 unit (`canvas-collision`) +1 integration (`canvas-collision-integration`: 2 клик-add не пересекаются).

### Size budget затронутых модулей
- `LibrarySearchBar.jsx` — **24.8 KB** (picker-unification 15→~22, +paste ~3). Под soft 30 / hard 40 — watch-точка спеки, OK.
- `CanvasLayoutView.jsx` — **50.5 KB** (был 49.18, над hard 40). V99 net-удалил ~25 строк, picker `extraSections` + collision wiring добавили — нетто +~1.3 KB. **Над hard** — pre-existing TD-CANVAS-LAYOUTVIEW-DECOMP, в этот batch декомпозиция не входит; отмечаю что чуть подрос.
- `canvas-layout.js` — 19 KB (под soft 20 для .js, +112 строк collision). OK.
- `AssemblyShellBody.jsx` — 23.5 KB (под hard 40). OK. `useCanvasLayoutDrag.js` — 14.4 KB. OK.
- **Новые нарушители hard за batch:** нет (CanvasLayoutView был над лимитом до сессии). **Warning >5 KB за спринт:** `LibrarySearchBar.jsx` (+~9 KB — фича picker-unification, ожидаемо).

### STOP
Все 7 пунктов реализованы, полный Vitest зелёный, build clean. Останавливаюсь — жду визуальной приёмки. `PROJECT_STATE` / `BUGS` / `DECISIONS` / `RELEASES` / `ANCHORS` / `TECH_DEBT` / `CLAUDE.md` / `COMPONENT_MAP` НЕ финализировал.
