# CURRENT_TASK.md

## Sprint M-X.7a Library Structure rebuild — реализация

**Статус:** 🟢 Спека визуально принята 08.05.2026 (после Library.html acceptance). K1-K6 готовы к реализации Code.
**Тип:** A (новый workspace + top-level routing change + librarySlice extension).
**Целевая версия:** v0.9.0.
**Спека:** `docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md` (~53 KB).
**Парные документы:** `docs/LIBRARY_MODEL_DRAFT.md` (data model + 3 зоны), `docs/LIBRARY_WIREFRAME_DRAFT.md` rev 3 (rationale + OQs), `docs/design_assets/Library.html` (визуальный SoT от дизайнера 08.05.2026), `docs/guides/USER_GUIDE_LIBRARY.md` (user-facing guide).
**Парный спринт:** M-X.7b — Versioning UI (содержимое таба «История», version-actions). Отдельная сессия после M-X.7a acceptance.
**Предыдущий спринт:** M-C.1 Container Canvas Baseline — STOP awaiting visual acceptance на ветке `feature/m-c-1-baseline` (40a40a1). M-X.7a forked отсюда, не от main; M-C.1 work стоит unfinalized до acceptance.

---

## TL;DR

В v0.8.0 Library признана primary workspace через ⚓ DEC-IMP-06, но реализация осталась встроенной в Importer (CatalogColumn группа «Моя библиотека»). Биологу некуда идти после открытия app — workspace выбирается через Importer flow. M-X.7a даёт Library как **top-level workspace** с собственной структурой: 3 зоны (`⚐ Без проекта` / `📦 .bodge` archives / `🧬 Лабораторный пул`), Tree + Inspector + AddModal + TopBar по паттерну `Library.html`.

`librarySlice` расширяется fields `zone` / `projectId` / `inLabStock` / `manualEditFlag` / `parentEntryId` / `parentEntryHash` без breaking changes (lazy migration в hydrate). `App.jsx` получает top-level route `library` — landing default, вытесняет старый landing screen. `canvas.activeFullscreen` остаётся для Container Window и DAG fullscreen — Library это **не** fullscreen, а корневой view рядом с Construct.

Версионирование (tab «История» content + version-actions) — out of scope, M-X.7b. Cross-project import wizard — M-X.9. Command palette ⌘K — M-X.7c. ⚓ DEC-LIB-K11 (Library = unified projection of IndexedDB grouped by ownership zones) — promote после acceptance.

---

## Порядок чтения перед началом

1. **CLAUDE.md** — корневые правила.
2. **BUGS.md** — текущий OPEN.
3. **CURRENT_TASK.md** — этот файл.
4. **PROJECT_STATE.md** — first-line + последняя запись журнала (drift check).
5. **docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md** — главный документ. Читать целиком, особенно §3 (Scope IN/OUT), §4 (DEC-MX7A-01..12), §5 (файлы / helper signatures / action+banner tables), §9 (риски R1-R8), §10 (open questions).
6. **docs/LIBRARY_MODEL_DRAFT.md** — data model + 3 зоны (для K1).

**Targeted reading при работе** (по K, не на старте):

- K1: `store/librarySlice.js`, `store/canvasSlice.js`, `store/projectSlice.js` (containerIds / primerIds для migration heuristic).
- K2: существующие `components/Library/*` файлы (на удаление при TD-LIB-K2-DEAD-CODE-PURGE), `docs/design_assets/Library.html` для tree wireframe.
- K3: `components/Importer/inspector/SequenceMapView.jsx`, `components/Importer/inspector/AnnotationEditor.jsx` (R1: prop `readOnly`), `Library.html` для Inspector wireframe.
- K4: existing Importer flow (PreImport DEC-IMP-13), `useCatalogSources` hook для Catalog source.
- K5: `App.jsx`, `store/projectSlice.js` openProjectFromIndexedDB.
- K6: `lib/strings.js`, `LIBRARY_WIREFRAME_DRAFT.md` rev 3 (для polish details).

Не читать ARCHITECTURE_v2.md / ANCHORS.md / DESIGN_SYSTEM.md целиком — спека самодостаточна. Если развилка не покрыта спекой — STOP и спросить у Игоря.

---

## Чеклист K-step

### K1 — Data model + migration

- [ ] `store/workspaceSlice.js` (~2 KB новый): top-level workspace router (`active: 'library'|'construct'|'flow'`, `history: []`, `setActiveWorkspace(name)`, `goBack()`, селекторы `selectActiveWorkspace`, `selectIsInLibrary`). **Решить OQ1** (новый slice vs append в canvasSlice) — Code в этом K1 определяет; рекомендация спеки — отдельный slice ради изоляции. Решение зафиксировать в отчёте.
- [ ] `store/librarySlice.js` extend (+~3 KB): новые fields в LibraryEntry (`zone`, `projectId`, `inLabStock`, `manualEditFlag`, `parentEntryId`, `parentEntryHash`); новые actions (`moveEntryToFolder`, `cloneEntryToActiveProject`, `extractEntryToLoose`, `toggleLabStock`, `createLooseFolder`, `renameLooseFolder`, `deleteLooseFolder`); новые селекторы (`selectEntriesByZone`, `selectContainersByProject`, `selectPrimersByProject`, `selectLooseTreeStructure`, `selectLabPoolStructure`, `selectPrimerUsageCount`, `selectMatchingLabStockPrimer`).
- [ ] `lib/library-migration.js` (~2 KB): `migrateLibraryEntry(entry, projects)` идемпотентен; `migrateAllEntries(entries, projects)` возвращает `{entries, migratedCount: {loose, project, lab_pool}}`. Heuristic из DEC-MX7A-02: zone preset → tags Lab/In freezer → containerIds/primerIds match → fallback Loose. Logged через console на dev mode.
- [ ] `lib/library-actions.js` (~6 KB): `getActionsFor(selection): Action[]` per zone × kind (полная таблица §5.4 спеки); `getInspectorBanner(selection)` per zone (таблица §5.5); `canDrop(source, target): boolean`; `getDropOperation(source, target): 'move'|'clone'|'copy-out'|'promote'|null`. Всё version-related actions (`saveAsVersion`, `manualEditBranch`, `revertToVersion`, `branchFromHere`) — `disabled: true, tooltip: 'M-X.7b: версионирование'`.
- [ ] `lib/library-origin.js` (~3 KB): `getOriginSummary(entry): string|null` per origin.kind (DEC-MX7A-10 mapping); `getLineageChain(entry, library, projects): LineageStep[]` resolves cross_project_clone refs.
- [ ] **R7 follow-up:** добавить `'project_extract'` в Origin discriminated union (поля `{kind: 'project_extract', sourceProjectId, sourceContainerId, sourceContainerHash, extractedAt}`). Mini-lineage helper обновляется.
- [ ] **Тесты K1:** +29 unit (8 migration + 12 actions + 6 origin + 3 workspace).
- [ ] **Регрессия-guard:** existing librarySlice API (`addLibraryEntry`, `checkLibraryDedup`, `getSuggestedLibraryName`, `selectVisibleLibraryEntries`, `selectAllLibraryTags`) — green. Importer CatalogColumn «Моя библиотека» group работоспособна (читает ту же entries[]).

**Артефакты K1:** 4 новых файла (`workspaceSlice.js`, `library-migration.js`, `library-actions.js`, `library-origin.js`) + delta `librarySlice.js` ~+3 KB.

### K2 — Tree component

- [ ] **TD-LIB-K2-DEAD-CODE-PURGE first:** инвентаризация существующих `components/Library/*` файлов. Удалить старые M-A.3 / pre-M-X.7 если уже не используются. В отчёте — состояние (purged / not found / partial).
- [ ] `components/Library/Library.jsx` (~4 KB): корневой workspace, `<LibraryTopBar>` + split-pane `<LibraryTree>` | `<Inspector>`. Selection state в `uiSlice.libSelection` (persists между перерендерами Tree).
- [ ] `components/Library/LibraryTopBar.jsx` (~3 KB): app branding (`b. BodgeGene`) слева + breadcrumb «Активный проект: <name>» (с status indicator «сохранён» / «не сохранён», fallback «Без активного проекта» — R8) + simple search field справа. Search фильтрует tree по `entry.name` (case-insensitive substring). ⌘K hotkey + length-pattern + feature-filter — отложены в M-X.7c.
- [ ] `components/Library/Tree/LibraryTree.jsx` (~6 KB): drag-drop корневой контейнер, рендерит 3 зоны через `<ZoneHeader>` + соответствующие children, handles cross-zone drops через `canDrop` + `getDropOperation`.
- [ ] `components/Library/Tree/ZoneHeader.jsx` (~2 KB): heading зоны + collapse toggle.
- [ ] `components/Library/Tree/ItemRow.jsx` (~4 KB): строка container/primer + mini-lineage через `getOriginSummary`. Origin icon (↑/✎/🔗) inline.
- [ ] `components/Library/Tree/FolderRow.jsx` (~3 KB): папка Loose с children, context-menu actions (создать / переименовать / удалить).
- [ ] `components/Library/Tree/ProjectFolder.jsx` (~4 KB): `📦` папка с фиксированными sub-rows `🔀 DAG` / `📥 Контейнеры` / `🧬 Праймеры`. Read-only marker (lock icon + cursor not-allowed) для импортированных `.bodge`.
- [ ] `components/Library/Tree/LabPoolSection.jsx` (~3 KB): Lab pool с двумя sub-секциями («❄️ В лаборатории» с `inLabStock=true` + «📚 Из чужих проектов» с `inLabStock=false`).
- [ ] Folder operations в Loose: создать (через context-menu на zone heading — OQ2 closed: explicit), переименовать (slash-path tags batch update), удалить (confirm dialog с warning).
- [ ] **OQ2 решение:** Folder создание через explicit context-menu «Новая папка» (закрыто §10 спеки).
- [ ] **R6:** Folder = derived view над `entry.tags` slash-paths (DEC-CAT-04). Empty folder исчезает после move последнего item'а — это feature.
- [ ] **Тесты K2:** +8 component (LibraryTree.test).

**Артефакты K2:** 8 новых файлов в `components/Library/` (root + Tree/) + потенциальные deletions старого Library кода.

### K3 — Inspector + tabs

- [ ] **R1 ПЕРВОЙ задачей:** Code проверяет `readOnly` prop в `components/Importer/inspector/SequenceMapView.jsx` и `AnnotationEditor.jsx`. Если есть — go. Если нет — добавляет с default `false` (no-op для existing Importer callsites). Если внутри много hard-coded edit-логики — STOP коммита K3, эскалация Игорю (возможно вынос readOnly mode в M-X.7c).
- [ ] `components/Library/Inspector/Inspector.jsx` (~4 KB): корневой Inspector. Заголовок (`<InspectorHeader>` + `<InspectorBanner>`) + tab bar (`<InspectorTabs>`) + active tab content.
- [ ] `components/Library/Inspector/InspectorHeader.jsx` (~2 KB): name + meta-line + breadcrumb.
- [ ] `components/Library/Inspector/InspectorBanner.jsx` (~2 KB): per zone tone/icon/text через `getInspectorBanner` (таблица §5.5). Persistent (не dismissable). null banner = no render.
- [ ] `components/Library/Inspector/InspectorTabs.jsx` (~2 KB): tab bar Обзор / Последовательность / Аннотации / История(N).
- [ ] `components/Library/Inspector/tabs/OverviewTab.jsx` (~5 KB): lineage trail (через `<LineageTrail>`) + preview + metadata.
- [ ] `components/Library/Inspector/tabs/SequenceTab.jsx` (~2 KB): wrapper над `SequenceMapView` с `readOnly={true}` + inline read-only banner (DEC-MX7A-08): «🔒 Просмотр read-only. Edit аннотаций / последовательности — в Container Window.» с link `→ Container Window`.
- [ ] `components/Library/Inspector/tabs/AnnotationsTab.jsx` (~2 KB): wrapper над `AnnotationEditor` с `readOnly={true}` + inline banner.
- [ ] `components/Library/Inspector/tabs/HistoryTab.jsx` (~2 KB): placeholder card «Список коммитов и version-actions — M-X.7b». Tab counter в InspectorTabs = `commits.length`. Tab скрыт целиком если `commits.length === 0` (OQ6 closed: hide).
- [ ] `components/Library/Inspector/LineageTrail.jsx` (~3 KB): chain rendering через `getLineageChain`.
- [ ] `components/Library/Inspector/ActionRow.jsx` (~2 KB): variant-styled buttons из `getActionsFor`. Empty actions = no render. Disabled actions с tooltip.
- [ ] Tab persistence (DEC-MX7A-04): тот же selection после повторного select → последний tab; новый selection → reset на «Обзор» (OQ5 closed: Обзор default).
- [ ] **Тесты K3:** +10 component (Inspector.test).

**Артефакты K3:** 11-12 новых файлов в `components/Library/Inspector/` + delta `SequenceMapView` / `AnnotationEditor` (если R1 потребует).

### K4 — AddModal

- [ ] `components/Library/AddModal/AddModal.jsx` (~3 KB): корневой modal, multi-step (source → target → preview wizard через DEC-IMP-13 reuse).
- [ ] `components/Library/AddModal/SourceTiles.jsx` (~3 KB): 4 source tiles (Файл / Вставить последовательность / Каталог / Из другого .bodge).
- [ ] `components/Library/AddModal/TargetZonePicker.jsx` (~2 KB): 3 radio (project / loose / lab) с default per источник из таблицы DEC-MX7A-09 (FILE→project|loose, PASTE→same as file, CATALOG→loose, CROSS→project).
- [ ] `components/Library/AddModal/sources/FileSourceFlow.jsx` (~3 KB): file picker + format detect.
- [ ] `components/Library/AddModal/sources/PasteSourceFlow.jsx` (~3 KB): textarea + format detect.
- [ ] `components/Library/AddModal/sources/CatalogSourceFlow.jsx` (~3 KB): reuse CatalogColumn data через `useCatalogSources`.
- [ ] `components/Library/AddModal/sources/CrossProjectStub.jsx` (~1 KB): placeholder M-X.9 («В разработке (M-X.9). Используйте Файл → выберите .bodge для импорта проекта.» — R4 hint).
- [ ] Integration с PreImport flow (DEC-IMP-13).
- [ ] Esc / click outside closes modal без сохранения.
- [ ] **Тесты K4:** +5 component (AddModal.test).

**Артефакты K4:** 7 новых файлов в `components/Library/AddModal/`.

### K5 — App routing + landing

- [ ] `App.jsx` top-level switch для workspace (+~1 KB): `library` | `construct` | `flow` + fullscreen overlay (Container Window / DagWorkspace остаются).
- [ ] Default landing на Library (вытесняет старый landing — Quick Start panel etc.).
- [ ] `projectSlice.openProjectFromIndexedDB` обновляет `workspace.active='library'`; активный `📦` появляется как папка в Tree (не fullscreen DAG canvas как было в M-C.1).
- [ ] **R2 mitigation:** workspace = root, fullscreen = overlay. `active='library'` + `canvas.activeFullscreen='containerWindow'` — валидная конфигурация (Container Window перекрывает Library view; close → возврат в Library). Смена workspace на Construct из Library — fullscreen закрывается автоматически.
- [ ] Construct (DAG) и Container Window остаются доступны через actions / breadcrumb.
- [ ] Старые landing screens / quick-start panels — оценка Code: переезжают как secondary actions в `LibraryTopBar` либо удаляются.
- [ ] **OQ4:** empty state Library когда IndexedDB пустая — большая `+ Add` CTA по центру правого pane, Tree пустой, Inspector пустой. Onboarding nudge — отложить в M-X.7c.
- [ ] **Тесты K5:** +5 integration (Library.integration.test).

**Артефакты K5:** delta `App.jsx` + `workspaceSlice.js` finalization.

### K6 — STRINGS + Lab pool details + edge cases

- [ ] `lib/strings.js` namespace `STRINGS.library` (+~2 KB) — все labels EN+RU mirror per DEC-MA2-01. Если применить prior art M-C.1 K5 (RU values + EN comments) — Code решает в финале и фиксирует в отчёте как deviation.
- [ ] Lab pool: PrimerUsage rendering inline («used in N проектах») в `ItemRow` через `selectPrimerUsageCount`.
- [ ] Lab pool: sequence-match подсветка между cross-project primer и lab-stock entry (DEC-MX7A-12) через `selectMatchingLabStockPrimer`. UI badge на cross-project entry.
- [ ] Empty states per zone (Loose / `.bodge` archives / Lab pool) — что показывается когда зона пустая.
- [ ] Hover/focus states polish.
- [ ] Read-only markers (lock icon + cursor not-allowed на rows импортированных `.bodge`).
- [ ] prefers-reduced-motion для drag-drop animations (если есть transform-based feedback).
- [ ] **Тесты K6:** +5-7.

**Артефакты K6:** delta `lib/strings.js` + edge polish across K2-K4 файлов.

---

## STOP-условие

После K1-K6 commits Code останавливается на ветке `feature/m-x-7a-library-structure`:

> «K1-K6 landed. Финальные счётчики: Vitest XXX passing, pytest 115/115 passing. Build clean. Жду визуальной приёмки M-X.7a — не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT.»

**Не финализировать:**
- PROJECT_STATE.md (журнал сессии + first-line) — только после acceptance.
- RELEASES.md.
- DECISIONS.md (DEC-MX7A-01..12 уже в спеке, promotion в DECISIONS только после acceptance).
- ANCHORS.md (DEC-LIB-K11 — кандидат, решает Игорь).
- TECH_DEBT.md (новые TD только если Code обнаружил соответствующие в процессе).
- BUGS.md (только если найден existing bug — добавить в OPEN, не закрывать ничего).

---

## Формат отчёта Code в конце сессии

В конце реализации Code дописывает в этот CURRENT_TASK.md секцию «Отчёт K1-K6»:

1. **Коммит-хэши** по каждому K-step (~6 hashes).
2. **Финальные счётчики:** Vitest passing/total, pytest 115/115, build status, PWA precache size delta.
3. **Размеры новых файлов** — таблица с топ-15 крупнейших новых файлов в `components/Library/` + delta `librarySlice.js` / `App.jsx` / `lib/strings.js`.
4. **Отклонения от спеки** — explicit блок:
   - Split K на под-коммиты.
   - Decisions Code где спека была неоднозначна (особенно OQ1 — workspaceSlice scope: новый slice или append в canvasSlice).
   - Mismatch размеров файлов от §5.1 targets.
   - R1 result: prop `readOnly` найден готовым либо добавлен.
5. **Hard violation flag** — explicit red flag если файл влез в hard зону (40 KB .jsx / 25 KB .js).
6. **TD-pencil-marks:**
   - TD-LIB-K2-DEAD-CODE-PURGE состояние (purged / not found / partial).
   - Importer CatalogColumn «Моя библиотека» group теперь redundant — флаг для M-X.6 cleanup.
   - SequenceMapView / AnnotationEditor требуют значительных изменений для readOnly mode → TD «readOnly mode hardening».
7. **Migration heuristic результаты** — на dev fixture сколько entries попало в каждую зону `{loose: N, project: N, lab_pool: N}`.

---

## Что делать при регрессии

Если в любом K-step ломаются existing тесты (librarySlice CRUD / Importer flow / Library quick-add):

1. STOP коммита, не пушить.
2. Проверить regression-guard зону: existing API librarySlice без `zone`/`projectId` должен работать (lazy migration через `migrateLibraryEntry` идемпотентен).
3. Если регрессия в проекте, который Code не считает зоной M-X.7a (Annotator / SequenceView / Container Window / DAG из M-C.1) — STOP и эскалация Игорю.
4. R3 mitigation: migration loss-of-data acceptable (entries без явного projectId уходят в Loose). Логирование `migratedCount` per zone в console на dev mode для отладки.

---

## Что не делается в M-X.7a (явно отложено)

- **Версионирование (M-X.7b):** содержимое таба «История», version-actions (`Сохранить как версию`, `Manual-edit ветка`, `Откатить`, `Ветка от этого`). M-X.7a показывает counter + placeholder + disabled actions.
- **Cross-project import wizard (M-X.9):** AddModal source `Из другого .bodge` triggers stub modal «В разработке (M-X.9)». Остальные 3 источника (File / Paste / Catalog) полнофункциональны.
- **«Открыть как активный проект» switch (M-X.9):** action в read-only `.bodge` action-row — показан, при клике alert «В разработке (M-X.9)». Импорт `.bodge` в read-only зону работает (для view), edit-переключение — нет.
- **Command palette ⌘K (M-X.7c):** в M-X.7a search field — простой text-фильтр по name. ⌘K hotkey + length-pattern (`>5kb`) + feature-filter (`CDS`) — отложены.
- **Group projects (post-M-I):** один agent одновременно — DEC-V2-29 не пересекается.
- **Mobile layout:** out-of-scope per DEC-V2-19.
- **Multi-select / box-select:** M-X.10+.

---

**Дата:** 08.05.2026 (kickoff Sprint M-X.7a после M-C.1 STOP; визуальная приёмка спеки + K-step plan для Code).
**Спека source-of-truth:** `docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md`.
