# COMPONENT_MAP.md — компас по codebase BodgeGene

> **Цель файла:** ответить на вопрос «что у меня уже есть, прежде чем плодить новое». Не inventory всех файлов. Роли + связи + что не делать заново.
>
> **Когда читать:** Chat **обязательно** открывает перед написанием любой спеки/поручения которое задевает existing компоненты (R1 §17 в `CHAT_PLAYBOOK.md`).
>
> **Когда обновлять:** после каждой acceptance-сессии — что добавилось, что умерло, что переехало (R5 §17).

**Версия:** 02.06.2026 (common-features: overlay slice + раздел + промоут, R5; v0.8.4 cleanup — v0.5-верстак снесён; обновлено после v0.8.2-skeleton 12.05; создан 09.05.2026).
**Размер цели:** ≤7 KB. Если разрастётся — декомпозировать.

---

## Точка входа

`gui/designer/src/main.jsx` → `App.jsx` → разветвление по `canvas.activeFullscreen`:
- `'start'` → `<StartScreen>` (минуя AppShell)
- иначе → `<AppShell>{inProjectChild}</AppShell>` где AppShell.WorkspaceRouter переключает по `workspace.active`

**⚠ Дубль navigation state:** `canvas.activeFullscreen` (старая, с navStack) + `workspace.active` (новая, M-X.7a v2). Сосуществуют. Не разруливать без явной задачи.

---

## Современное ядро (живое, в основе)

### `components/StartScreen/` (~30 KB)

`Sidebar` (232/56 px collapsible) + `MainPanel` (Главная: topbar + recent + empty). Принят 09.05.2026 pixel-perfect по `docs/design_assets/start_screen.html`.

**После текущего fix (Code правит):** Sidebar становится единственным shell для всех режимов (Library / DAG / Importer). `AppShell.NavRail` + `AppShell.Topbar` умирают.

### `components/Library/` (~360 KB) — M-X.7a v2

Зрелая структура. **Не переписывать.**

- `LibraryWorkspace.jsx` — корневой workspace (Tree + Inspector + ActionRow).
- `LibraryTopBar.jsx` — breadcrumb + search + 🔔 + avatar.
- `tree/` — `LibraryTreeRoot` + `LooseZone` + `ProjectZone` + `LibraryZone` + `TreeItemRow` + `TreeFolderRow`. **`LabPoolZone.jsx` снесён** в M-X.7c K3+K4 (Lab pool = View, не Zone). **`ProjectZone` больше не рендерит DAG-узел** (DEC-UIRREV-DAG-NOT-FOLDER-01) — только «Контейнеры» и «Праймеры». **`TreeItemRow` получил hover-revealed `+`** (M-X.7c K5, DEC-UIRREV-QUICKADD-HOVER-01) для cross-project добавления в активный проект. **Зоны 4→2** (DEC-UIRREV-ZONES-MERGE-01) — `loose | bodge`, различение между проектами через `entry.projectId`.
- `inspector/` (115 KB):
  - `LibrarySingleInspector.jsx` 39 KB — главный body.
  - `FeatureEditorModal.jsx` 26 KB — **двойной клик на feature → редактирование** (правильный pattern).
  - `LibraryMetaColumn` + `LibrarySaveActions` + `LibraryInspectorTitleRow` + `TagsEditor` + `InlineEditableTitle`.
  - `tabs/` — `OverviewTab` + `SequenceTab` + `AnnotationsTab` + `HistoryTab` (placeholder) + `TabBar` + `LinearFeatureBar` 26 KB («колбаса»).
  - `hooks/` — `useFeatureEditorFlow` / `useEditableModeToggle` ⚓ / `useManualEditBranching` / `useLibrarySaveFlow` / `useAnnotationUndoRedo` / `useIdlePrewarm`.
- `import/` — **РАБОЧИЙ путь импорта**: `PreImportModal.jsx` 22 KB + `MultiImportView.jsx` 15 KB. Используется через старый `Library/index.jsx`. **Импорт = активация** (DEC-UIRREV-IMPORT-EQ-ACTIVATE-01, M-X.7c K8) — `.bodge` import в конце pipeline вызывает `projectSlice.activateProject(newProjectId)`.
- `RecentProjectsDropdown.jsx` (~4.7 KB, M-X.7c K7) — MRU из `state.recentProjectIds` (cap 8), вызывает `activateProject(id)`. **UX итерация** — дропдаун сносится в M-X.8 (DEC-UIRREV-BREADCRUMB-STATIC), логика MRU переедет в Command Palette + sidebar секцию «В работе». До M-X.8 — рабочее решение c известным UX-гэпом.
- `AddModal/` — новый из M-X.7a v2: `AddModal` + `SourceTiles` + `CrossProjectStub`. **Submit = toast stub (R4 не доделан)** — реальный wiring в PreImportModal через 2-prop addition.
- `modals/` — `PrimerWizardStepModal` + `AutonameModal`.
- `onboarding/` — `OnboardingNudge` + `CategoryPickerModal` + 7 curated categories.

**⚠ Дубль:** `Library/index.jsx` (35 KB, легаси Importer, deprecated DEC-IMP-06) vs `LibraryWorkspace.jsx` — оба живые. Старый держит **рабочий путь импорта** через `useImporterState` (22 KB hook в `Library/hooks/useLibraryState.js`). Умрёт после R4 fix.

### `components/SequenceView/` (~330 KB) — M-B.3 + M-X.2 K1

**Universal viewer для 4 контекстов:** Library Inspector / Importer / Annotator Preview / Container Window (будущий M-C.2). DEC-SQV-07: NO container imports, plain `fragments` shape.

DNA-first layout (биолог 03.05.2026): 6 tracks в порядке Primer → Restriction → Ruler → DNA forward → DNA reverse → Annotation → AA forward → AA reverse.

- `index.jsx` 39 KB — orchestrator.
- `tracks/` (110 KB) — `AnnotationTrack` 49 KB + `AATrack` 39 KB + `StrandsTrack` + `PrimerTrack` + `RulerTrack` + `RestrictionTrack`.
- `overlays/` — `SelectionOverlay` (DNA orange + AA blue) + `CaretOverlay` + `OriginMarkerOverlay`.
- `popups/` — `CreateAnnotationPopup` (H key) + `EditAnnotationModal` (E key) + `SelectionContextMenu` (right click → tri-modal copy DEC-SV-04) + `InlineRenameInput` (двойной клик).
- `hooks/` (49 KB) — `useSelectionState` (drag DNA + AA + edge auto-scroll) + `useSequenceKeyboard` (Ctrl+A/H/E/Del/copy) + `useSelectionEdit` + `useAnnotationDrag` (drag handles на ребрах регионов с live preview + tooltip) + `useAnnotationRename`.
- `lib/` (51 KB) — `wrap-tail` (M-X.3 wraptail) + `feature-map` + `aa-opacity` (per-position opacity в frames mode auto) + `annotation-stacking` (greedy pack overlapping) + `scroll-handle` + `codon-walker` + `frames-mode` + `orf-ranges` + `grid` + `row-selection-isolation`.

**Уже умеет:** selection, caret, hotkeys, create/edit annotations, drag edges, copy в 3 режимах, AA translation (single/hybrid), ORF detection, RE sites, wraptail circular.

**Container Window M-C.2 = слой над SequenceView** + harvest workflows (Mutagenesis/Restriction/Golden Gate/Gibson). Не писать новый viewer.

### `components/Annotator/` (~75 KB) — M-X.3

Fullscreen workflow для batch-аннотации:
- TargetPreview (linear strip + scope highlight) сверху.
- 3-level progression: L1 Common features homology (auto-runs) → L2 Predictors (ORF / promoter / terminator) → L3 BLAST (NCBI).
- Two tabs: Table (rows с verdict Принять/Отклонить/Редактировать) + Preview (**встраивает SequenceView** с ghost features dashed).
- GhostDrillInPanel (slide-over 280 px справа) при клике на predicted.
- Footer: Принято/Отклонено/Изменено + `[Сохранить]` → emits в `SingleInspector.onUpdateEdits`.

**Связан с SequenceView через CreateAnnotationPopup кнопку «Найти в Аннотаторе».** Это рабочий cross-component flow.

Plugin pipeline в `lib/annotator-plugins` + `lib/annotator-pipeline`.

### `components/Dag/` (~30 KB) — M-C.1 K4

```
DagPalette 280px | PreviewDrawer 340px (slide-in) | DagCanvas 1fr (ReactFlow)
```

- `DagPalette` (12 KB) — 4 группы: thisProject / demo / mine / snapgene (lazy). Search: name + length-pattern.
- `DagPaletteItemRow` — drag handle с MIME `application/x-bodgegene-dag-add`.
- `PreviewDrawer` — slide-in 340 px (PlasmidMiniMap 180×180 + meta + region list + CTAs).
- `DagCanvas` — ReactFlow + `PlasmidNode` + `NeutralEdge`. Drop target listening на MIME. Auto-layout dagre LR.
- `PlasmidNode` — карточка ~280×220 (PlasmidMiniMap + title + length/topology + region badges).
- `ContainerWindowPlaceholder` — M-C.1 K4 заглушка drill-in. **M-C.2 не сделан** — реальный Container Window отсутствует, есть только placeholder.

**⚠ Дубль группировок:** DagPalette 4 группы (thisProject/demo/mine/snapgene) vs LibraryTreeRoot 2 зоны (БЕЗ ПРОЕКТА / .bodge). Обе показывают `libraryEntries`. По архитектуре Игоря — должна быть одна Tree, рендериться по-разному в Library mode (full tree) vs DAG mode (palette с drag-source).

---

## Common-фичи (overlay-стор + раздел + промоут) — v0.8.4

Overlay над заводской `common-features.json` (read-only статик). **Не плодить заново: это НЕ `LibraryEntry`, НЕ окно.**

- **`store/commonFeaturesSlice.js`** 9.87 KB — Zustand-slice: `userFeatures` (net-new) + `overrides` (по baseId заводской) + Dexie-персист (таблица `commonFeatures`, DB v6). Actions: `promoteFeature` / `editCommonFeature` (factory→override + debounce 400мс) / `resetCommonFeature` / `deleteUserFeature` + селектор `selectMergedCommonFeatures`. `getMergedFeatureDB()` мёржит built-in+overlay; `detectCommonFeaturesAsync` зовёт его (не `loadFeatureDB`); merged-кэш инвалидируется на мутации slice.
- **`Library/CommonFeaturesPanel/`** 15.48 KB — раздел: master-detail (список + деталь `LinearFeatureBar` + editable `SequenceView` на синтез-фрагменте). Узел «Common-фичи» в `LibraryTreeRoot` + view-swap `selectedView:'entry'|'common'` в `LibraryWorkspace` (НЕ новое окно, §17 R2).
- **`SequenceView/popups/PromoteToCommonModal.jsx`** 7.36 KB + **`SequenceView/hooks/usePromoteToCommon.js`** 2.33 KB — промоут «Добавить в common-фичи» (пункт в `build-selection-menu-items.js` под `matchedRegion` + проп `onPromoteToCommon`). Проводка в **2 виверах**: Library-инспектор + ContainerEditor (Importer N/A — нет inline-вивера).

**Связи:** detect-пайплайн (`feature-match-core`) ← общий с дедупом (`feature-dedup`) → «дедуп=детекция». **Common-фичи НЕ в палитру** (отдельный стор, не `libraryEntries`, panel не drag-source — DEC-CF-07).

---

## Algorithm core (живой, не трогать)

В `gui/designer/src/` корне:

`mutagenesis.js` 18 KB · `golden-gate.js` 11 KB · `restriction-db.js` 37 KB · `tm-calculator.js` 7 KB · `local-primer-design.js` 20 KB · `orf-detection.js` · `auto-annotate.js` 15 KB · `domain-detection.js` · `feature-detection.js` 2.79 KB (re-export shell после decomp) · `feature-match-core.js` 24.93 KB (engine: detect + dedup-примитивы, DEC-CF-08) · `feature-dedup.js` 4.56 KB (`featureMatchesExisting`) · `predicted-detection.js` 18 KB · `genbank-parser.js` · `validate.js` 19 KB · `cds-validation.js` · `sequence-utils.js` · `sequence-diff.js` · `annotation-model.js` ⚓ · `feature-palette.js` ⚓ 12 KB · `primer-reuse.js` · `intron-utils.js` · `codons.js`

**Backend связь:** `api.js` 767 B — клиент для `fetchConstructs` / `fetchFeatures`. Используется в `AddFragmentModal` + `MutagenesisWizard`.

---

## Алгоритмические UI (v<0.5, harvest для Container Window M-C.2)

**Не убивать.** Эти wizards — основа будущего Container Window:

- **`PlasmidUseWizard.jsx`** 39 KB — **10 режимов операций**: view / use_whole / restriction_cloning / replace / disassemble / extract / mutate / insert / delete / versions. Триггерится из addFragment когда circular Part с ≥2 регионами. Игорь: «был неплох, частично переиспользуем».
- **`MutagenesisWizard.jsx`** 18 KB — site-directed mutagenesis 4 метода (auto/kld/quikchange/overlap). Использует `mutagenesis.js` + backend `api.js`.
- **`OligoManager.jsx`** 13 KB — реестр олигов **со статусами заказа** (Не заказан / Заказан / В доставке / Получен / Плохой). LocalStorage `pvcs-oligo-registry`. Использует Tm calculator.
- **`PrimerPanel.jsx`** 9 KB — отображение праймеров с категориями (assembly / custom / verification), reused tracking, primer quality, matches.
- **`JunctionBlock.jsx`** 29 KB + **`JunctionDNA.jsx`** 14 KB — **8 типов junction** (overlap/Gibson, golden_gate, re_ligation, ligation, kld, sticky_end, blunt, preformed). Использует `golden-gate.js` + `restriction-db.js`.
- **`PlasmidMiniMap.jsx`** 30 KB — alive (catalog tiles, Inspector rows, SessionSummary, MetaColumn). Read-only ring SVG.
- **`PlasmidMap.jsx`** 36 KB · **`PlasmidViewer.jsx`** 23 KB · **`PlasmidWorkspace.jsx`** 6 KB · **`PlasmidVersionTree.jsx`** 9 KB — связка для просмотра плазмид. Статус «возможно живой через цепочки» — нужен grep по импортам перед kill.

**Possible harvest помельче:**
- `mutation-normalize.js` (из FragmentEditor) — normalize-for-git logic, для DAG node serialization.
- `region-types.js` (из FragmentEditor) — custom region types.
- `color-palette.js` (из FragmentEditor) — saved user colors.
- `ProtocolTracker.jsx` 31 KB — lab protocol calculator (PCR mixes / purification / assembly), `protocol-data.js`.

---

## DEAD / kill (поэтапно)

> **⚠ ОБНОВЛЕНО v0.8.4 (31.05.2026): v0.5-верстак СНЕСЁН (−404 КБ, 44 файла).** Удалены целиком: `FragmentEditor/`, `flow/`, `ImportStartScreen/`, `MoleculeWorkspace/`, `Prototype/` + файлы `DesignCanvas.jsx` / `PartsPalette.jsx` / `PartsLibrary.jsx` / `PartBlock.jsx` / `AddFragmentModal.jsx` / `ModalStack.jsx` (граф достижимости от `main.jsx`, build clean, 4082 теста зелёные). **Список «Остаётся в очереди» ниже и упоминание `ModalStack.jsx` в «Modals / utility» — СНЯТЫ** (описывают уже удалённое). Исключение: `AnnotationEditor.jsx` НЕ снесён (держит живой `Library/inspector/FeatureEditorModal.jsx` через `PART_TYPE_GROUPS` → микро-harvest). Остаток ~630 КБ недостижимого (97 ф) — три категории (A forward-работа / B reserved wizards до M-C.2 / C огрызки-после-wiring) разнесены в **TD-DEAD-REMNANT-630KB** (TECH_DEBT) + **BACKLOG** wiring-кластер. plasmid-git — отвалившаяся фича (TD-PLASMID-GIT-LOSS). Category-C kill — ПОСЛЕ wiring-спринта.

**Этап 1 закрыт 09.05.2026** — снесены 9 изолированных файлов (~108.9 KB), коммит `docs/SPRINT_KILL_DEAD.md`:
- ~~`SequenceMapView.jsx`~~ · ~~`RacetrackView.jsx`~~ · ~~`FragmentSplitter.jsx`~~ · ~~`SequencePane.jsx`~~ · ~~`SequencePreview.jsx`~~ · ~~`SequenceEditor.jsx`~~ · ~~`CDSEditor.jsx`~~ · ~~`AssemblyTabs.jsx`~~ · ~~`TagFusionPicker.jsx`~~ — удалены.
- `AppShell/NavRail.jsx` + `AppShell/Topbar.jsx` — снесены в Sidebar Single-Shell refactor 09.05.2026 (отдельный ход).
- 4 осиротевших skipped-теста удалены: `AppShell.test.jsx`, `app-shell-navrail.test.jsx`, `StartScreen.test.jsx` (старая), `Importer.flow.test.jsx`.

**Остаётся в очереди:**

- **`FragmentEditor/`** 87 KB — UI плох. Этап 2: harvest helpers (`mutation-normalize.js`, `region-types.js`, `color-palette.js`) в `lib/`. Этап 3: kill папки целиком.
- **`AnnotationEditor.jsx`** (root) 17 KB — used by FragmentEditor + MoleculeWorkspace + AddFragmentModal. Kill в Этапе 3 вместе с ними.
- **`DesignCanvas.jsx`** 37 KB + **`PartsPalette.jsx`** 30 KB + **`PartsLibrary.jsx`** 22 KB + **`PartBlock.jsx`** 26 KB + **`AddFragmentModal.jsx`** 36 KB — старая parts-canvas-junctions UX v0.5. Этап 3.
- **`flow/`** (42 KB) — старый ProjectFlowCanvas с PCR/Assembly/Oligo/Checkpoint nodes. Этап 3 (с возможным harvest типов node'ов в `Dag/` под M-C).
- **`ImportStartScreen/`** 89 KB — старший Importer. Этап 3.
- **`MoleculeWorkspace/`** 16 KB — orphan после Этапа 1 (зависел от `SequenceMapView`). Этап 3.
- **`Library/index.jsx`** + **`useLibraryState.js`** + **`importer-strings.js`** — Этап 4, **только после R4 fix** (когда AddModal Submit подключён к PreImportModal).

---

## Modals / utility (живое, не трогать без задачи)

- `ProjectInfoModal.jsx` 12 KB
- `SettingsModal.jsx` 13 KB
- `ModalStack.jsx` 8.5 KB
- `ContextMenu.jsx` 2.5 KB
- `HotkeyCheatsheet.jsx` 3 KB
- `ThemeToggle.jsx` 1 KB
- `Toast/` 5 KB (живой)
- мелочь: `ActionBar`, `ConcentrationInput`, `ConnectorDropdown`, `CopySeqButton`, `MultiTabBlocked`, `QuickStart`, `ReadOnlyForced`, `ReplacePicker`, `SubFragmentBar`, `UnderConstruction`, `DataManager`, `DagPlaceholder`, `utils/fragment-topology.js`

---

## Дубли — статус по истории

1. ~~**2 sidebar:**~~ закрыт 09.05.2026 — `AppShell.NavRail` + `Topbar` снесены, `StartScreen.Sidebar` = единый shell.
2. **2 navigation state:** `canvas.activeFullscreen` (с navStack) vs `workspace.active`. До сих пор живы оба. Сливание — отдельная задача.
3. **2 Library entry:** `Library/index.jsx` legacy + `LibraryWorkspace.jsx` новый. Решается Этапом 4 после R4.
4. **3 поколения Importer:** `ImportStartScreen/` (Этап 3) + `Library/index.jsx` (Этап 4) + `Library/AddModal/` (новый, R4 stub).
5. **2 DAG canvas:** `flow/ProjectFlowCanvas` (Этап 3) + `Dag/DagWorkspace` (новый).
6. ~~**5 sequence viewers**~~ → после Этапа 1 остались 2: `SequenceView` (modern) + `FragmentEditor.SequenceGrid` (легаси, Этап 3). 3 удалены: `SequenceMapView`, `SequencePane`, `SequencePreview`.
7. **2 annotation editors:** `FeatureEditorModal` (Library) + `EditAnnotationModal` (SequenceView) — кандидат на дубль, проверить связь.
8. ~~**`entry.zone` поле** vs derive из `projectId` + `inLabStock`~~ — частично закрыт 10.05.2026 (M-X.7c K3 DEC-UIRREV-ZONES-MERGE-01): зон 2 вместо 4, различение проектов идёт через `entry.projectId`, lab pool — View. Остатки `entry.zone` в hydrate (lazy migration) — выкорчевывается когда все entries мигрируют в 2-zone shape или при next data-model bump.

---

## Архитектура Игоря (для контекста, чтобы не плодить новое)

**Полный разбор навигационной иерархии (DAG / Парт-канвас / Container Window):** `docs/ARCHITECTURE_3LEVELS.md` — фиксирует DEC-NAV-3LEVEL-01 (09.05.2026), обязательно читать перед спеками M-C.2 / M-E.

- **Library + DAG = два режима одного компонента.** Один Tree слева, разная правая панель (Inspector в Library mode, Canvas в DAG mode). Не два отдельных workspace'а.
- **Container Window M-C.2 = двойной клик на PlasmidNode в DAG → прокачанный SequenceView.** Не отдельное окно.
- **`.bodge` = коробочка биолога** со ВСЕМ (контейнеры + праймеры этого проекта + операции = git плазмид + сборки + фрагменты). Внутри коробочки — структурированное mini-tree.
- **Library праймеров = View** (агрегация над всеми primer entries из всех зон), **не Zone**.
- **Tree зон 2:** `⚐ БЕЗ ПРОЕКТА` (свободный рабочий стол биолога с папками — биолог принёс плазмиду, кинул в ящик; не обязательно проект) + `📦 *.bodge` (по блоку на проект).
- **Lab pool** — View, не Zone. `inLabStock` остаётся флагом на entry, в Tree пока не используется.

---

## v0.8.2 changes (11.05.2026)

**Снесено:** `Library/RecentProjectsDropdown.jsx` (~4.7 KB, M-X.7c K7) — заменён статичным breadcrumb + Command Palette + sidebar секция «В работе».

**Добавлено:**
- `components/CommandPalette.jsx` (~11 KB, M-X.8 K6) — overlay поверх любого workspace по хоткею `⌘P` / `Ctrl+P` / `Ctrl+Shift+P` (`modals.commandPalette` в uiSlice). Группы `ЗАКРЕПЛЕНО · N` (★ filled) + `ОСТАЛЬНЫЕ · M` (☆ hollow). Click row → `activateProject(id)` + close. Click ★/☆ → toggle pin без активации (DEC-UIRREV-ACTIVATE-WITHOUT-PIN-01). Pin cap 15 → toast warning. Footer «+ Создать проект».
- `components/SequenceSearchPopover.jsx` (~16.7 KB, M-X.9 K2) — modal popover для локального поиска ПСО в открытой плазмиде. Хоткей `Ctrl+F` / `⌘F` / `Ctrl+Shift+F` (`modals.sequenceSearch`). Query input + threshold slider 50–100% + recent searches dropdown + hit list (strand · target range · **queryIdentity %** · matches/length · query[X..Y) · 3'-end pill · fragment preview).
- `lib/sequence-search.js` (~21.9 KB, M-X.9 K1) — pure seed-and-extend без gaps + full-window alignment после seed-anchor (DEC-SEARCH-FULL-WINDOW-ALIGNMENT-01). Public API: `searchSequence` / `searchLibrary` / `buildSeedIndex` / `adaptiveSeedLen` / `identityBucket` (4-level) / `isDnaQuery` / `hasIupacAmbiguity` / `reverseComplement`. 3'-end indicator info-only при query.length ≤50 nt. **Watch list size** (slightly above soft 20 KB, под hard 25 KB) — TD-SIZE-SEQUENCE-SEARCH.
- `lib/sequence-search-recent.js` (M-X.9 K4) — localStorage MRU helper, cap 10.

**Обновлено:**
- `LibraryTopBar.jsx` (~15.9 KB, M-X.9 K3) — статичный breadcrumb `BodgeGene › 📦 [имя]` + `✓ сохранён` pill в правом tray. Auto-detect DNA pattern (query.length ≥8 nt И только ACGT+IUPAC) → dropdown `[data-testid=library-topbar-dna-results]` с hits по всей library (исключая SnapGene catalog и primers, DEC-SEARCH-SNAPGENE-EXCLUDED-01). Click hit → `activateProject(entry.projectId)` + `setSelectedId(entryId)`.
- `LibraryTreeRoot.jsx` (~10.8 KB, M-X.8 K4) — 4-уровневая иерархия: LooseZone → current project (top-level если не pinned) → pinned others (★ marker) → collapsible `📚 Все проекты (N)`. Per-project expand override Map; `currentProjectId` change auto-collapses siblings. Click на header non-current → `activateProject` + auto-expand (НЕ меняет mode в DAG — DEC-PROJSLICE-ACTIVATE-PURE-01, FAIL-fix #4 ⚓ promotion).
- `Sidebar` (StartScreen.Sidebar — единый shell) — секция **«В работе» с counter `N/15`** (M-X.8 K3). Pinned projects: `SidebarItem` `📦` (или `●` current). Click → `activateProject` + переход в Library. Footer «Все проекты» с `⌘P`. Порядок секций (FAIL-fix #1): actions → РАБОЧЕЕ МЕСТО → В РАБОТЕ → СПРАВКА → footer.
- `MainPanel` RecentRow — `pinned` prop + ★/☆ кнопка → `onTogglePin` callback (cap → showToast). Click на ★ pinит без активации (DEC-UIRREV-ACTIVATE-WITHOUT-PIN-01, M-X.8 K7).
- `projectSlice` — `pinnedProjectIds: string[]` cap `PIN_LIMIT = 15` + actions `pinProject(id)` (idempotent, returns `true | 'cap' | false`) / `unpinProject(id)` / `reorderPins(nextOrder)`. Migration `hydrateProjectsFromDexie`: пустой `pinnedProjectIds` → сидим top-3 из `recentProjectIds`. **`activateProject(id)` стал side-effect-free** (DEC-PROJSLICE-ACTIVATE-PURE-01 ⚓): мутирует только currentProjectId + MRU, **не** `canvas.activeFullscreen` / `workspace.active` / navStack. Mode-switch — responsibility вызывающего callsite.
- `STRINGS.projectHub` — новый namespace (M-X.8 K1): `sidebarPinnedHeader` («В работе»), `sidebarPinnedCounter` function, `sidebarOpenAll` («Все проекты», без `+`/`…` — FAIL-fix #3), `pinTooltip` / `unpinTooltip`, `pinCapExceeded`, `pinDoneToast` / `unpinDoneToast`, `palette*` ключи (title / search / groupPinned / groupOthers / empty / createNew), `treeAllProjectsCollapsed`. `lib/strings.js` 18.8 → 21.3 KB.
- `hotkeys.js` — `HOTKEYS.{command-palette,sequence-search}.keys` теперь array of combos (FAIL-fix #5, DEC-HOTKEY-ALTERNATES-01): primary `Ctrl+P/F` + alternate `Ctrl+Shift+P/F` (browser-override на Ctrl+F lock). HotkeyCheatsheet получил browser-override-note.

**Дубли (новые v0.8.2):**
- Поиск в плазмиде: `SequenceSearchPopover` (popover, query → hits) vs `LibraryTopBar` auto-detect (global DNA dropdown). Оба используют `lib/sequence-search.js` через одно API, но разные UI surfaces. Не дубль логики, дубль UI entry-points — биолог может искать одну query в обоих местах. Решается в M-X.9 polish либо в M-C.2 (когда Container Window появится — там точка входа становится canonical).

**Carry-over дубли (без изменений 10.05 → 11.05):**
- `canvas.activeFullscreen` (с navStack) vs `workspace.active` — навигационный state дубль. После DEC-PROJSLICE-ACTIVATE-PURE-01 ⚓ оба state-поля живут независимо, слияние — отдельный sprint.
- `Library/index.jsx` legacy vs `LibraryWorkspace.jsx` новый — Этап 4 после R4 fix.
- 3 поколения Importer: `ImportStartScreen/` (Этап 3) + `Library/index.jsx` (Этап 4) + `Library/AddModal/` (R4 stub).
- 2 DAG canvas: `flow/ProjectFlowCanvas` (Этап 3) + `Dag/DagWorkspace`.
- 2 sequence viewers: `SequenceView` (modern) + `FragmentEditor.SequenceGrid` (Этап 3).
- 2 annotation editors: `FeatureEditorModal` (Library) + `EditAnnotationModal` (SequenceView) — кандидат на дубль.
- `entry.zone` lazy migration — статус из 10.05 без изменений (зон 2, lab pool = View).

**Открытые баги (выявлены на 1-й приёмке 10.05, отдельные bugfix-спринты):**
- **V51** (OPEN, высокий) — drag selection микролаги в SequenceView на ThinkPad 2013. Связан с TD-DEV-POLICY-LEGACY-HARDWARE. Корни в React state propagation pipeline, не в compute.
- **V52** (OPEN, средний) — quick-add `+` дублирует entry в активный проект без проверки на fingerprint. Применимо к `Library/tree/TreeItemRow.jsx` + `librarySlice` quick-add action. Invariant: при R4 fix AddModal — то же правило дедупликации.

---

## v0.8.2+ canvas-skeleton V2 changes (12.05.2026)

> **Контекст.** Sprint v0.8.2-skeleton-v2 — paradigma V2 (placeholder containers, drag from Library Tree, junctions с auto-detect) + полнофункциональный Container Editor. Спека `docs/SPRINT_CANVAS_V2_EDITOR_FULL.md` (тип B, 15 KB). 16 sprint-level DEC в `DECISIONS.md`. Скелет по-прежнему DEV-only на `/canvas-skeleton`, не влияет на production routes.

**Снесено в `components/CanvasSkeleton/`:**
- `tree/SkeletonTree.jsx` + `tree/TreeContainerRow.jsx` + `tree/TreeSection.jsx` + `tree/TreePrimerRow.jsx` + `tree/tree-derive.js` (вся директория tree/) — bespoke 3-section tree заменён на production `LibraryTreeRoot` через `LibraryTreeHost` (DEC-CANVAS-V2-TREE-FROM-LIBRARY-01).
- `sequence-view/PlasmidMapInteractive.jsx` (4.91 KB) — circular-mode toggle drag-select. OverviewTab у Library уже имеет PlasmidMiniMap; interactive circular — отдельный sprint если понадобится.
- `editor/OperationsToolbar.jsx` (4.17 KB) + `editor/operations/*` (4 popup'а: PCR/Restriction/Mutagenesis/Gibson) + `editor/PillsBar.jsx` (2.57 KB) + `editor/TabsBar.jsx` (2.81 KB) — operations переезжают на canvas (DEC-CANVAS-V2-OPS-CANVAS-ONLY-01). PillsBar/TabsBar (multi-draft pills) — editor теперь по одному контейнеру за раз.

**Editor modes (mounted in F1 tabs by tab.kind) — обновлено 2026-05-16 (D1):**
- `tab.kind='container'` → `ContainerEditorSkeleton` (Library viewer reuse).
- `tab.kind='operation'` + `op.kind='pcr'` → `editor/operation-modes/PcrModeShell` (F3 V71-V76, isolated PCR). Прочие op.kind — future.
- `tab.kind='assembly'` → `editor/assembly-mode/AssemblyModeShell` → `AssemblyShellBody` (A2-A4 assembly workflow). Подпапка `editor/assembly-mode/`: AssemblyHeader, AssemblySidebar, SegmentList, SegmentDetailPanel, AssemblyToolbar, AssemblySourcePicker, InsertGapModal, AssemblyPrimersPanel, useAssemblyPrimerWriting, RealiseModal + MethodPickerCard + RealiseDagPreview. Канвас: `canvas/AssemblyDraftsPanel.jsx` (floating) + `canvas/AssemblyDraftBlock.jsx`. Libs: `lib/assembly-model.js`, `lib/assembly-invariants.js`, `lib/segment-color-palette.js`, `lib/segment-annotation-transfer.js`, `lib/assembly-primer-utils.js`, `lib/assembly-realise.js`, `lib/assembly-realise-suggest.js`. SequenceView extension: `overlays/SegmentZonesOverlay.jsx` (opt-in coloredZones).

**Переписано:**
- `fixture-canvas-skeleton.js`: 7.99 → 2.91 KB. 5 pre-baked containers + 6 primers + 3 commits + 2 draft sessions → 2 placeholder containers (`sequence=''`, `origin.kind='placeholder'`), пустые SKELETON_PRIMERS/COMMITS/DRAFTS. Добавлен predicate `isPlaceholderContainer(container)` — единый для всех слоёв.
- `store/skeleton-state.js`: 8.55 → 22.77 KB (**watch zone**, soft 20 / hard 25 для .js — TD-SKELETON-STATE-SIZE).
- `editor/ContainerEditorSkeleton.jsx`: 10.21 → 24.82 KB (под hard 40 KB .jsx).
- `index.jsx`: 3.56 → 5.81 KB. Снесён composition с SkeletonTree, добавлен `LibraryTreeHost` + `DeleteKeyHandler` (window keydown для Del/Backspace).
- `canvas/CanvasLayoutView.jsx`: 4.60 → 15.99 KB. Drop targets (canvas-level + per-block placeholder), pointer-up reconcile junctions, SVG junction layer с per-kind stitch markers + clickable badge → JunctionMethodPicker.
- `canvas/ContainerBlock.jsx`: 5.21 → 8.52 KB. Добавлен placeholder branch (dashed border + `+` в центре), drag-over indicator.

**Добавлено:**
- `LibraryTreeHost.jsx` (7.68 KB) — wrap production `LibraryTreeRoot` + `AddModal` для skeleton. Локальный `query`/`selectedId` state + wire global librarySlice через `addLibraryEntry` / `addLibraryEntriesBulk` / `currentProjectId` / `showToast`. Импорты: `build-library-entry`, `starter-set`, `parseFile`, `export-genbank`, `AddModal`.
- `canvas/PlaceholderTreePicker.jsx` (7.43 KB) — модалка click-на-placeholder, scoped к current project с loose fallback. ESC / click outside / × закрывают. Pick вызывает `FILL_PLACEHOLDER`.
- `canvas/JunctionMethodPicker.jsx` (6.70 KB) — popover на стыке для manual override junction kind (9 типов из v0.5 палитры).
- `canvas/junction-styles.js` (4.25 KB) — копия v0.5 JunctionBlock TYPE_STYLES + `detectJunctionKind(from, to)` heuristic. DEC-CANVAS-V2-JUNCTION-PALETTE-V05-01 + DEC-CANVAS-V2-DETECT-KIND-HEURISTIC-01.
- `canvas/use-tree-drop-target.js` (3.58 KB) — HTML5 drop target hook, MIME `application/x-bodge-entry-id` (из `Library/tree/TreeItemRow` onDragStart). Drop → `ADD_CONTAINER_FROM_ENTRY` (canvas-level) или `FILL_PLACEHOLDER` (block-level).
- `editor/adapt-container-to-item.js` (3.93 KB) — `buildItemFromContainer` + `buildEditsFromPending` + `hasPendingEdits`. DEC-CANVAS-V2-EDITOR-02.

**Расширено Library code (отклонение от R4 спеки):**
- `components/Library/inspector/tabs/TabBar.jsx` — добавлены props `showOverview` (default `true`) и `showMutagenesis` (default `false`). Canvas editor передаёт `showOverview={false}` + `showMutagenesis={true}` (DEC-CANVAS-V2-EDITOR-OVERVIEW-OFF-01). Library не должна сломаться (дефолты совместимы), но это watch-точка.

**Reused из Library/inspector напрямую (в editor'е скелета):**
- tabs: `TabBar` / `SequenceTab` / `AnnotationsTab` / `HistoryTab` / `LinearFeatureBar`
- `FeatureEditorModal` + `InlineEditableTitle`
- hooks: `useFeatureEditorFlow` + `useAnnotationUndoRedo`
- global actions: `openAnnotator` / `closeAnnotator` / `selectAnnotator` (uiSlice + annotator slice)

**Reused из Library/tree напрямую (в LibraryTreeHost):**
- `LibraryTreeRoot` (10.8 KB) — 4-уровневая иерархия Loose / current / pinned / collapsible all-projects.
- `AddModal` — файл/paste/catalog tiles.

**Reused из lib/ напрямую:**
- `lib/annotation-edit.js::applyAnnotationEdit` — единый редусер правок annotations для Library + skeleton.
- `lib/strings.js` namespace `canvasSkeleton` (расширяется).
- `file-import.js::parseFile` / `lib/export-genbank::downloadProjectAsZip` (в LibraryTreeHost).

**Новые actions в skeleton-state:**
- `SET_PENDING_EDITS` / `COMMIT_PENDING_EDITS` / `DISCARD_PENDING_EDITS` — pending edits buffer.
- `SET_CONTAINER_NAME` — inline rename (direct mutation, не через pending).
- `FILL_PLACEHOLDER(containerId, entry)` — in-place fill (id+position preserved).
- `ADD_CONTAINER_FROM_ENTRY(entry, position)` — new uuidv7 container, drop from tree.
- `REMOVE_CONTAINER(containerId)` — cleanup all state refs.
- `RECONCILE_AUTO_JUNCTIONS(pairs)` — diff & reconcile auto-junctions.
- `REMOVE_JUNCTION(junctionId)` / `SET_JUNCTION_KIND(junctionId, kind)` — junction CRUD.

**Дубли (v0.8.2+ canvas-skeleton):**
- `LibraryTreeHost` (skeleton-side wrapper) vs прямой mount `LibraryTreeRoot` (Library-side) — не дубль логики, разные wire-points. Host дёргает те же global actions, передаёт callbacks Library tree.
- `editor/derive-primers.js` (2.78 KB) — всё ещё живёт, выводит derived primers из commits. В V2 paradigma SKELETON_PRIMERS=[] и SKELETON_COMMITS=[], так что helper возвращает пустой массив. Кандидат на удаление при M-CANVAS-OPERATIONS sprint.
- `editor/fixture-puc19.js` (4.71 KB) — fixture pUC19 для legacy operation popup'ов, которые удалены. Кандидат на удаление (либо перенос в `__tests__/fixtures/` если нужен тестам).
- `state.popup` field + `editorContext` — в reducer больше нет OPEN_POPUP/CLOSE_POPUP cases (попапы удалены), но legacy `editorContext.draftId` flow (`draftSessions`) всё ещё живёт в reducer'е. Для V2 это dead-but-not-removed: `SKELETON_DRAFTS=[]`, следовательно draftSessions всегда пусто. Кандидат на cleanup.

**Открытые watch-точки:**
- **TD-SKELETON-STATE-SIZE** — `store/skeleton-state.js` 22.77 KB (выше soft 20 для .js, под hard 25). Следующее расширение (operations on canvas) — декомпозиция первым пунктом по DECISIONS «Module size limits».
- **TabBar Library regression** — расширены props `showOverview`/`showMutagenesis`. Library tests должны пройти (default true), проверяем на приёмке или в отдельной багфикс-сессии.
- **Annotator scope guard в Library** — Library AnnotationsTab + LinearFeatureBar.mergeStripWithPredicted не имеют guard'а на `skeleton::*` prefix. Риск низкий (разные fullscreen режимы), но в backlog отмечен (DEC-CANVAS-V2-EDITOR-04).

---

**Дата создания:** 09.05.2026.
**Последнее обновление:** 31.05.2026 — v0.8.4 cleanup: v0.5-верстак снесён (−404 КБ, 44 файла); DEAD-секция обновлена, остаток ~630 КБ разнесён в TECH_DEBT (TD-DEAD-REMNANT-630KB) + BACKLOG. Компоненты .jsx 242→206.
**Предыдущее обновление:** 12.05.2026 — canvas-skeleton V2 paradigma + полнофункциональный editor (Sprint v0.8.2-skeleton-v2). Артефакты: `LibraryTreeHost`, `PlaceholderTreePicker`, `JunctionMethodPicker`, `use-tree-drop-target`, `junction-styles`, `adapt-container-to-item`, `DeleteKeyHandler`. Снесено: bespoke `tree/`, `PlasmidMapInteractive`, `OperationsToolbar`+`operations/`, `PillsBar`, `TabsBar`. 16 DEC в DECISIONS.md.
**Предыдущее:** 11.05.2026 — v0.8.2 финализация (M-X.7c FAIL-fixes + M-X.8 + M-X.9 + Фикс 7).
**Предыдущее обновление:** 10.05.2026 — M-X.7c приёмка.
**До этого:** 09.05.2026 — Этап 1 kill (9 файлов, ~108.9 KB) + Sidebar Single-Shell refactor + чистка 4 осиротевших тестов.
**Источник:** полная инвентаризация `gui/designer/src/components/` за одну сессию (App.jsx → AppShell → Library → Dag → SequenceView → Annotator → FragmentEditor → MoleculeWorkspace → flow → ImportStartScreen → Prototype → Toast → utils → корневые файлы).

**Обновляется:** R5 §17 в `CHAT_PLAYBOOK.md` — после каждой acceptance-сессии.
