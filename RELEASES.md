# RELEASES.md — BodgeGene

> Журнал по версиям. Один блок на версию, 1.5–3 KB.
> Ротация: при достижении 30 KB или 10 версий — старшие → `docs/archive/RELEASES_YYYY_QN.md`.
> Схема версий: M-A.x = patches v0.6.x, M-B = v0.7.0, M-C = v0.8.0, ..., M-I = v1.4.0. Документационные milestones (kickoff'ы) без version bump. Patches между формальными milestones (post-acceptance polish между M-A.3 и M-B finale) допускаются как v0.6.x continuation.

---

## v0.8.3-alpha — Four-tier architecture (T1-T10 + T4.5) + canvas UX + primer redesign (16-18.05.2026)

**Контекст.** Архитектурный поворот canvas-skeleton от draft/segment-based к four-tier модели (containers / pieces / operations / zones). 10 T-спринтов реализованы Code в continuous mode 16-18.05 на базе спек (`docs/SPRINT_T*.md`, ~360 KB) и якоря `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md`. Параллельно: canvas UX полировка (4-сторонние коннекторы, wheel-zoom-к-курсору, бесконечный канвас, hand-pan, стационарный zoom-индикатор), primer redesign (модал-от-выделения, кликабельность во всех 5 виверах, pentagon-arrow glyph), 3 биологических бага (V82-V84), LibrarySingleInspector декомпозиция, реверс ⚓ DEC-T3-08 + V61.

**Sprint blocks (записаны в DECISIONS.md sprint-block, ~84 DEC):**
- **T1 Pieces State** — `state.pieces` slice + piece как первичная сущность (DEC-CANVAS-4T-01). Поля: sourceIds[] / ranges[] / origin / acquisitionMethod / acquisitionParams / derivedReactionId / frozen / kind / color (stable HSL hash). Schema v5→v6. piece-model + piece-invariants + 8 actions + 7 selectors. **+52 теста.**
- **T2 Pieces Migration** — `op.inputPieces[]` (primary) + legacy `op.inputs[]` (compat). Surgical opt-in adapters per kind (DEC-T2-09): byte-identical legacy при пустом inputPieces, NEW path активируется только при наличии. op-piece-bridge.js + 7 adapter modules cleaned. Schema v6→v7 (migration noop — поле добавлено как nullable). **+52 теста.**
- **T3 Zones Data** — `state.zones[]` Miro-style контейнеры + `zoneId` на узлах. Поля zone: bounds / viewMode / collapsed / notes / autoResize. Default zone «Сборка 1» seeded в buildInitialState (DEC-T3-08 — **позже реверснут** 17.05). Schema v7→v8. **+56 тестов.**
- **T4 Zones Rendering** — ZoneFrame / ZoneLayer / ZoneContextMenu + drag/resize/merge + hit-detect on pointer-up + cross-zone junctions dashed pattern. DOM/CSS frame, не SVG. Вариант B (informed go): K9 graph-view отложен по design-mismatch (отдельный фикс post-T4). **+43 теста.**
- **T4.5 Zone 3-lane Auto-Layout** — sources lane (top) / intermediate lane (middle, dagre LR) / finals lane (bottom). `node.pinned` field + auto-pin при drag. Hotkey + context-menu открепить/закрепить. `laneLayout: 'auto'|'manual'` per zone. Schema v9→v10. **+45 тестов.**
- **T5 Piece Authoring UI** — 4 способа создать piece: А (selection + хоткей P) / Б (feature click) / В (existing primers с binding search) / Г (new primers через V72-V74 mechanism). PieceCreateModal + PiecePrimersPickModal + piece-authoring.js (4 pure builders). Reuse extraItems pattern из V72-V74. **+22 теста.**
- **T6 Sequence-Mode Migration** — `editor/assembly-mode/*` мигрирован с segments на pieces через dual-source dual-resolution. assembly-realise.js → zone-pieces-to-dag.js (читает pieces из zone). segment-to-piece-adapter.js для back-compat. Gap segments → `piece.kind='gap'` + gapLength + gapHint + опциональный gapSequence (V83 extension). Schema v8→v9 (assemblyDrafts → zones mapping). assemblyReducer оставлен живым (T6 K14 deviation — литеральный no-op заблокирован ~50 legacy assembly-тестами). **+47 тестов.**
- **T7 Dual-Mode Toggle + Sync** — inline sequence-mode (3 состояния empty/palette/assembled) per zone. Hotkey G/S через focusedZoneId (uiSlice extension). ATTACH_PIECE_TO_ASSEMBLY / DETACH / REORDER actions + piece.order field. Bidirectional sync: drag piece в strip → ATTACH + T8 finalizer создаёт auto-reaction. BranchingVisual stub для N финалов. **+43 теста.**
- **T8 Auto-Reactions + Cross-Zone Links** — finalizer pattern: piece.acquisitionMethod != 'undefined'/'direct'/'synthesis' → auto-reaction (PCR/Cut). Method change → atomic op delete + create. Cross-zone link badges «← Зона N» в header + click → smooth pan + 1s highlight. zone-link-resolver groups by source zone. **+33 теста.**
- **T9 Variants** — design variants (piece.variantGroupId, vg-uuid) vs clone variants (op.materializedClones[], hard cap 96 colonies). MaterializeCloneModal с auto-labels. BranchingVisual rewrite 3 kinds: clones (vertical stack) / design-variants (Y-разветвитель) / independent (side-by-side). Migration v8→v9. **+37 тестов.**
- **T10 Sanger MVP Lab Notebook** — right panel hotkey B, per-zone scope (focusedZoneId T7). 4-status segmented control (pending/verified/failed/null), filter, notes ≤500 (blur-saved). BranchingVisual получает цветные dot indicators. **+26 тестов.**

**Cross-cutting (между T-спринтами и после):**
- **Реверс ⚓ DEC-T3-08 + V61** (17.05, по AskUserQuestion Игоря «Полностью из state») — buildInitialState больше НЕ сидит default zone; ensureGhostPlaceholder отключён. Чистый старт без авто-госта/зоны. Кнопки +Операция / +Сборка / Сборки / Очистить bottom-right стеком.
- **Canvas UX батч** (17.05) — 4-сторонние коннекторы (edgeAnchors), wheel-zoom-к-курсору (zoomAtPoint focal-инвариант), бесконечный канвас (canvasContentExtent + edge-pan), hand-pan (panScrollTarget gate by closest-target), стационарный zoom-индикатор (внешний non-scrolling wrapper), drag-release ромба не открывает viewer (justDraggedRef guard), «Очистить канвас» gated RESET.
- **Primer redesign** (18.05) — PrimerFromSelectionModal (имя/ПСО/RC) во всех 5 виверах. Кликабельность везде (onPrimerClick/selectedPrimerKeys, back-compat без callback — декоративный). Double-click → редактирование. Flank-highlight только fwd+rev (биоинвариант). Pentagon-arrow glyph по обе стороны цепи с вписанными буквами. Cross-portal pattern: backdrop гасит keydown+pointer+contextmenu (React-bubbling, портал DOM-изоляции событий НЕ даёт).
- **Viewer-sync** — все 5 дизайн-виверов (Library/Importer-инспектор, ContainerEditor×2, Assembly, PCR) несут одинаковую пятёрку: primers + onWritePrimer + showSelectionTm + caret + selection. useEntryPrimers hook (origin.kind='library-selection') — ContainerEditorSkeleton (K10-заглушка закрыта). hydratePrimers() теперь вызывается в проде.
- **Annotator-toggle** — вкладка «Аннотации» → toggle-кнопка в общем TabBar.showAnnotations/onToggleAnnotator. Scope: Library/Importer + container-editor. Assembly/PCR не тронуты.
- **LibrarySingleInspector decomp** — extract `useInspectorSelectionNav` hook (~170 строк caret/selection/LinearFeatureBar-навигации). 39.34 → **31.28 KB** (TD-SIZE эскалация СНЯТА, 8.7 KB запаса до hard 40).
- **3 bug fixes:** V82 (AssemblyDraftsPanel перепи��ана zone-based — счётчик показывает default zone), V83 (gap с известной ПСО хранится в `piece.gapSequence`, не подменяется поли-N), V84 (realise-продукты наследуют аннотации источника через `transferAnnotations` + новый `concatSegmentAnnotations`).

**Schema migrations:** v5→v6 (T1) → v6→v7 (T2 noop) → v7→v8 (T3 zones) → v8→v9 (T6 assemblyDrafts→zones + T9 nullable fields) → v9→v10 (T4.5 pinned). Все идемпотентны.

**Тесты:** Vitest **3276 pass / 1 skip / 0 fail** + 1 pre-existing flake (`primer-wizard.test.jsx`, intermittent под parallel-load, isolated 2/2 — TD-PRIMER-WIZARD-FLAKE, не связан). **+956 тестов** от v0.8.2 baseline 2320. pytest 112/112 (не запускался — фронтовый sprint). `vite build` clean, 0 console errors.

**Tech debt resolved:**
- TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 — CLOSED (39.34 → 31.28 KB).

**Новые TD (Active):**
- TD-CANVAS-LAYOUTVIEW-DECOMP — `.jsx` 41.35 KB пробил hard 40 после T4.5 pin-badges.
- TD-SIZE-SEQUENCEVIEW-INDEX — ~39 KB, близко к hard 40.
- TD-DOCS-ROTATION — 53 файла в docs/ против лимита 8 (отложен в Пачку 3 финализации).

**Что осталось / открытые follow-ups:**
- Annotator-toggle scope: распространять на Assembly/PCR?
- LibrarySingleInspector опциональный 2-й extract (annotation-edit pipeline ~5-7 KB) уведёт под soft 30.
- T9 K13/K14 + graph-block badge — wire trigger-пункты в op context-menu.
- T10 SHOW_SANGER_LAB_NOTEBOOK — click clone indicator → focus в notebook через event-bus.
- T8 piece.ranges change → auto-reaction params.range recompute.
- T6 orphan-UX в zone-mode + InsertGapModal rename + editorContext.tabs rewrite — T-future.
- Архивация устаревших спек F1-F4 + A1-A4 + D1 + NOTES_*_DRAFT (Пачка 3).

---

## v0.8.2-skeleton-arch-ii — M-CANVAS-OPS-ARCH-II sub-sprint (R12) (15.05.2026)

**Контекст.** Финальная архитектурная подчистка canvas-skeleton'а. Закрывает оставшиеся долги после M-CANVAS-OPS-ARCH: op kind dispatch duplication, toast single-slot clobbering, snapshot без migration, skeleton-state-canvas.js over hard.

**4 sprint-level DEC в DECISIONS.md** (M-CANVAS-OPS-ARCH-II block):
- DEC-OPS-KIND-REGISTRY-01: `op-kinds-registry.js` — single source of truth. {label, desc, adapter, popup, originKind, inputsLabel, min/maxInputs, acceptsMultiSelectInputs}. Consumers: OpKindPicker / OpPopupRouter / lib-adapters / OpSuggestions.
- DEC-OPS-TOAST-QUEUE-01: `state.toasts` array вместо single slot. Multiple ops back-to-back emit отдельные toasts, ToastBridge flushes все. Base actions reducer refactor: early-return → break (чтобы финалайзеры всегда выполнялись). R3-13 orphan cleanup tightened — work only when containers count DECREASED.
- DEC-OPS-SNAPSHOT-MIGRATE-01: schemaVersion=2 + migration chain + transient UI stripping. v1→v2 migration. Refuse cases: future version, corrupted, missing schema. REPLACE_STATE merges с initial defaults.
- DEC-OPS-STATE-CANVAS-SPLIT-01: CUT_CONTAINER_AT_CURSOR 167 lines → `skeleton-state-canvas-cut.js`. File 27.5 KB → 22 KB (under 25 KB hard). TD-SIZE-SKELETON-STATE-CANVAS resolved.

**Новые модули:**
- `canvas/operations/op-kinds-registry.js` (4.3 KB).
- `store/skeleton-state-canvas-cut.js` (5.9 KB).

**Изменения:**
- `OpKindPicker.jsx` — OP_KINDS derived от central list.
- `OpPopupRouter.jsx` — switch заменён на `getPopupComponent(kind)`.
- `lib-adapters.js` — REGISTRY заменён `getAdapter(kind)` lookup.
- `skeleton-state.js` — base actions reducer refactor + REPLACE_STATE merge + toast queue stamper.
- `skeleton-persistence.js` — migration chain + transient stripping.
- ToastBridge — iterates state.toasts queue.

**Тесты:** **+14 тестов** от R10-R11 baseline (2306 → **2320 PASS + 1 skipped**). 51 skeleton test files passed. Новые: toast-queue-r12 (7 тестов), snapshot-migrate-r12 (7 тестов). Build clean.

**Tech debt resolved:**
- TD-SIZE-SKELETON-STATE-CANVAS (Watch since R9 → Active R12) → CLOSED.

**Что осталось:** Op-кинд registry автоматически приходит в OpSuggestions при добавлении нового kind. Toast queue работает с любым количеством параллельных ops. Snapshot migration позволяет refactoring containers shape без потери user data — будущие схемы добавляются как `MIGRATIONS[2]: migrate_v2_to_v3`.

---

## v0.8.2-skeleton-arch — M-CANVAS-OPS-ARCH sub-sprint (R10-R11) (14-15.05.2026)

**Контекст.** Архитектурный under-sprint продолжающий M-CANVAS-OPS-BIO. R10 — visual story upgrade (containers как живые плазмидные карты). R11 — formal types + relocation (closes ad-hoc origin shape pitfall + перемещение bio-helpers в shared lib).

**3 sprint-level DEC в DECISIONS.md** (M-CANVAS-OPS-ARCH block):
- DEC-OPS-LIVE-PLASMID-VISUAL-01: ContainerBlock через MiniPlasmidMap SVG. State-derived визуал: cut → broken-circle с marker, excise → dim, frozen → ghost. Block height 72→110.
- DEC-OPS-FORMAL-TYPES-01: `canvas/operations/types.js` с 13 origin variants + JSDoc Container/Annotation typedef + `validateOrigin` / `validateContainer` / `assertContainerOk` (DEV-warn). Wired в `executeOperation` dispatcher.
- DEC-OPS-BIO-HELPERS-RELOCATE-01: codon-optimize / sanger-primer / gibson-primer / strain-compat / annotation-conflicts переехали из `canvas/operations/` в `src/lib/bio/`. 10 imports обновлены в 9 файлах. Production app получает helpers «бесплатно».

**Новые модули:**
- `CanvasSkeleton/canvas/MiniPlasmidMap.jsx` (5.7 KB) — SVG circular / linear / broken-circle.
- `CanvasSkeleton/canvas/operations/types.js` (6.3 KB) — Container + Origin schemas.
- `src/lib/bio/` директория с 5 helpers (30 KB total).

**Изменения:**
- `ContainerBlock.jsx` — рефакторинг с MiniPlasmidMap inside, status badge с state.
- `canvas-layout.js` — BLOCK_LINEAR_H 72→110, JUNCTION_Y_TOLERANCE 40→60.
- `adapters/cut.js` — origin tag'ит parentWasCircular, isExcised, fragmentIndex.
- `lib-adapters.js` — assertContainerOk hook на executeOperation outputs.

**Тесты:** **+30 тестов** от R9 baseline (2264 → **2306 PASS + 1 skipped**). Новые: mini-plasmid-map-r10 (12 тестов), types-r11 (18 тестов). Build clean. Все 49 skeleton test files passed.

**Что осталось / следующий sprint M-CANVAS-OPS-POLISH:**
- TD-SIZE-SKELETON-STATE-CANVAS (27.5 KB, Watch since R9) — decomp на per-domain reducers (positions/junctions/fills/removal).
- Op kind central registry (single source of truth для name/icon/popup/adapter).
- Toast queue (overwriting-slot → stacking).
- Snapshot schemaVersion field + migration path.

---

## v0.8.2-skeleton-bio — M-CANVAS-OPS-BIO sub-sprint (R5-R9) (14.05.2026)

**Контекст.** Five-round audit-loop в `/canvas-skeleton` DEV route. Никакого version bump — это под-спринт sketch'а, продолжение M-CANVAS-OPS (K1-K11 / S1-S3 / A4-A6 / B1-B12 / T13-T14 от 12-13.05.2026). Sub-sprint завершил перевод skeleton ops от stub'ов к real bio-fidelity output. Запрос Игоря: «проверь логику взаимодействия всех элементов, правь криво работающее, не спеши, биологический angle».

**17 sprint-level DEC в DECISIONS.md** (M-CANVAS-OPS-BIO block) — KLD-real-bio, protocol-export, primer-order-panel, multi-template-PCR, mutagenesis-annotation-shift, gibson-primer-design, sanger-primer-design, codon-optimize-ecoli, strain-compat (dam/dcm), codon-stats-in-protocol, annotation-conflicts, bio-validation-on-execute, lib-adapters-split, codon-stats-panel, add-container-action, auto-annotate-assembly, lineage-multi-input-hint, show-toast-action.

**Новые модули (canvas/operations/):**
- `adapters/{cut,pcr,gibson,golden-gate,ligate,kld,mutagenesis}.js` + `_shared.js` (split lib-adapters 40 KB → 2.7 KB facade).
- `protocol-export.js` (18.6 KB) — lab-notebook step-by-step text + reagents + warnings.
- `gibson-primer-design.js` (5.4 KB) — homology-arm primer pair per fragment.
- `sanger-primer-design.js` (6.3 KB) — fwd/rev upstream/downstream of target + walk.
- `codon-optimize-ecoli.js` (6.0 KB) — translate / optimize / score / rare-codon finder.
- `strain-compatibility.js` (6.0 KB) — dam/dcm methylation enzyme detection.
- `annotation-conflicts.js` (5.4 KB) — CDS structural + duplicate + overlap warnings.
- `auto-annotate-assembly.js` — post-assembly autoAnnotate integration.

**Новые UI компоненты (CanvasSkeleton/):**
- `ProtocolPanel.jsx` (R6-2) — bottom-left toggle, side-overlay с copy-to-clipboard.
- `PrimerOrderPanel.jsx` (R6-3) — TSV/FASTA/plain export, scale/purification dropdowns.
- `CodonStatsPanel.jsx` (R9-3) — per-CDS card с score / rare codons / optimized variant.

**Тесты:** **+500 тестов** от baseline v0.8.2 (1764 → **2264 PASS + 1 skipped**). 15 новых test files в `__tests__/`. Build clean.

**Тип релиза:** Internal sub-sprint, без bump'а. Hidden от prod users (DEV route only).

**Что осталось / следующий sprint M-CANVAS-OPS-POLISH:**
- Sanger primer wizard UI button (helper готов).
- Mutagenesis editor tab наполнение (через codon-optimize backend).
- Codon-optimize "Apply" action — replace selected CDS region.
- Plasmid map view для circular containers (DEC-CANVAS-07).
- Multi-input lineage graph (полный, не только +N more hint).

---

## v0.8.2 — M-X.7c FAIL-fixes + M-X.8 PROJECT-HUB + M-X.9 SEQUENCE-SEARCH + Фикс 7 (10–11.05.2026)

**Коммиты:** ветка `feature/m-x-8-project-hub-and-m-x-9-sequence-search` (предположительно). M-X.8 PROJECT-HUB 8 K-блоков + M-X.9 SEQUENCE-SEARCH 4 K-блока + FAIL-fixes 1–6 (post-acceptance первой приёмки) + Фикс 7 (position-independence). Bump 0.8.0 → **0.8.2** в `gui/designer/package.json` + `gui/designer/src/lib/version.js`. **НАГОН:** Code не бампнул в v0.8.1 короня было в 0.8.0 в файлах кода — перепрыгиваем через 0.8.1 в 0.8.2.
**Тесты:** Vitest **1764/1765 PASS + 1 skipped** + 1 pre-existing flake (`primer-wizard.test.jsx::2`, isolation passes, в TECH_DEBT как TD-PRIMER-WIZARD-FLAKE) — прошёл в этом запуске. **+67 новых тестов** (1697 → 1764). pytest не запускался (фронтовый спринт, backend не задет).
**Build:** clean. PWA precache **1216.92 KiB** (baseline 1192.48, +24.44 KiB — два новых компонента CommandPalette + SequenceSearchPopover + lib/sequence-search.js + lib/sequence-search-recent.js + projectSlice pinned actions).
**Тип релиза:** Patch. Два новых user-facing flow (Project Hub + Sequence Search) + исправление фундаментальнога store-action invariant (FAIL #4 → DEC-PROJSLICE-ACTIVATE-PURE-01 → ⚓ promotion) + 3 спринт-level → ⚓ promotion (в сумме).

**Скопе — M-X.8 PROJECT-HUB (единая точка входа в проект).**
- **K1 strings** — `STRINGS.projectHub` namespace: `sidebarPinnedHeader` («В работе»), `sidebarPinnedCounter` функция, `sidebarOpenAll`, `pinTooltip` / `unpinTooltip`, `pinCapExceeded` (cap=15), `pinDoneToast` / `unpinDoneToast`, `paletteTitle`, `paletteSearchPlaceholder`, `paletteGroupPinned` / `paletteGroupOthers`, `paletteEmpty`, `paletteCreateNew`, `treeAllProjectsCollapsed`. + `hotkeys.actionLabels.commandPalette`. `lib/strings.js` 18.8 → 21.3 KB.
- **K2 projectSlice** — `pinnedProjectIds: string[]` cap `PIN_LIMIT = 15`. Actions `pinProject(id)` (idempotent, returns `true | 'cap' | false`), `unpinProject(id)` (idempotent), `reorderPins(nextOrder)` (drops unknown, dedupes, clamps). Migration `hydrateProjectsFromDexie`: пустой `pinnedProjectIds` → сидим top-3 из `recentProjectIds`. **7 unit тестов**.
- **K3 Sidebar** — секция «В работе», counter `N/15`. Каждый пин — `SidebarItem` `📦` (или `●` current). Click → `activateProject` + переход в Library. Footer «Все проекты» с `⌘P` → `openCommandPalette`. Порядок секций (после FAIL-fix #1): actions → РАБОЧЕЕ МЕСТО → В РАБОТЕ → СПРАВКА → footer. **2 теста**.
- **K4 Tree** — `LibraryTreeRoot.jsx` 7.1 → 10.8 KB. Структура: LooseZone (top) → current project (top-level если not pinned) → pinned others (★ marker) → collapsible `📚 Все проекты (N)`. Per-project expand override Map; `currentProjectId` change auto-collapses siblings. Click на header non-current → `activateProject` + auto-expand (НЕ меняет mode в DAG — исправлено в FAIL-fix #4). Click на current — toggle expand state. **5 тестов** + добавлены 2 кейса в FAIL-fix (current-first ordering + pinned-as-current).
- **K5 Topbar** — `RecentProjectsDropdown.jsx` (M-X.7c K7) снесён. `LibraryTopBar` — статичный breadcrumb `BodgeGene › 📦 [имя]`. `✓ сохранён` pill вынесен в правый tray. Удален тест «Свернуть всё» (current единственный auto-expanded).
- **K6 CommandPalette** — `components/CommandPalette.jsx` 11.1 KB. Open via `modals.commandPalette` (uiSlice). Хоткей `⌘P` / `Ctrl+P` + alternate `Ctrl+Shift+P` через `useHotkey('command-palette')` в App.jsx (FAIL-fix #5). Группы: ЗАКРЕПЛЕНО · N (filled ★, click pin = unpin) + ОСТАЛЬНЫЕ · M (hollow ☆, click pin = pin). Filter input. Click row → activateProject + close. Click ★/☆ → toggle pin без активации. Pin cap → toast warning. Footer «+ Создать проект». Esc / outside-click. **7 тестов**.
- **K7 MainPanel** — RecentRow props `pinned` + `onTogglePin`. MainPanel читает `pinnedProjectIds` + `pinSet`, передаёт `onTogglePin` callback (cap → showToast). Click на ★ pinит без активации (DEC-UIRREV-ACTIVATE-WITHOUT-PIN-01). **1 тест**.
- **K8 Cleanup** — регрессия assertion в `hotkeys.test.js` (7 → 8 → 9 entries после K6 + K2 M-X.9). Удалён K7-era `recent-projects-dropdown.test.jsx`.

**Скопе — M-X.9 SEQUENCE-SEARCH (локальный + глобальный поиск ПСО).**
- **K1 Ядро** — `lib/sequence-search.js` 12.8 KB (после Фикса 6 и 7). Pure seed-and-extend: `adaptiveSeedLen`, `buildSeedIndex`, `extendRight/Left` (score +1/-2, drop ≥5 или run-of-3 mm), `searchSequence` (обе цепи, dedup overlapping). `searchLibrary` (sync on-demand index, worker отложен — TD-SEARCH-WORKER). Helpers: `identityBucket` (4 levels: ≥90/≥80/≥70/<70), `isDnaQuery`, `hasIupacAmbiguity`, `reverseComplement`. 3'-end indicator: query.length ≤50 nt → `threePrimeOk: bool` (info-only). **14 тестов** + 5 новых в FAIL-fix #6 + 2 новых в Фикс 7 (position-independence на 1mm + 2mm).
- **K2 Local search popover** — `components/SequenceSearchPopover.jsx` 14.1 KB. Modal popover, target sequence из props. Query input + threshold slider 50-100% + recent searches dropdown + hit list (per row: strand, target range, **queryIdentity %**, matches/length, query[X..Y), 3'-end pill, fragment preview). IUPAC + min-length toast. Ctrl+F / `⌘F` через `useHotkey('sequence-search')` + alternate `Ctrl+Shift+F` (FAIL-fix #5). **8 тестов**. **SequenceView overlay-rect rendering частично** — 100% match рисуется, для 95%/90% hits виден только при click на hit row. TD-SEARCH-OVERLAY-RECTS.
- **K3 Global search** — `LibraryTopBar` auto-detect: query.length ≥8 + только ACGT(IUPAC) → DNA mode → dropdown `[data-testid=library-topbar-dna-results]`. `searchLibrary` (только `kind === 'container' || !kind`, SnapGene catalog исключён — DEC-SEARCH-SNAPGENE-EXCLUDED-01). Sorted by queryIdentity desc, cap 50. Click → `activateProject(entry.projectId)` + `setSelectedId(entryId)`. **5 тестов**.
- **K4 Polish** — `lib/sequence-search-recent.js` localStorage MRU helper (cap 10). **5 тестов**.

**Скопе — FAIL-fixes 1–6 (post-acceptance первой приёмки 10.05.2026).**
- **#1 Sidebar swap** [type D] — порядок actions → РАБОЧЕЕ МЕСТО → В РАБОТЕ → СПРАВКА → footer.
- **#2 Tree current-first** [type C] — текущий проект первой позицией после LooseZone (DEC-UIRREV-TREE-CURRENT-FIRST-01). +1 новый кейс + 1 K2-стейл-тест переписан.
- **#3 STRINGS формализация** [type D] — `sidebarOpenAll` = «Все проекты» без `+`/`…`, снят `.bodge` суффикс и UPPERCASE в zone-header (DEC-PROJ-STRINGS-FORMALIZATION-01).
- **#4 Tree DAG-switch** [type C] — root cause в `projectSlice.activateProject` (`canvas.activeFullscreen='dag'` side-effect вместе с currentProjectId+MRU). Фикс: action теперь side-effect-free. **DEC-PROJSLICE-ACTIVATE-PURE-01 → ⚓ promotion**. Regression тест «does NOT mutate canvas.activeFullscreen» добавлен.
- **#5 Hotkey alternates** [type C] — `HOTKEYS.{command-palette,sequence-search}.keys` принимает array of combos. Primary `Ctrl+P/F` + alternate `Ctrl+Shift+P/F` (DEC-SEARCH-HOTKEY-ALTERNATES-01). +3 теста + HotkeyCheatsheet browser-override-note.
- **#6 Search semantics** [type C] — поля `queryIdentity` + `queryCoverage` + `queryStart`/`queryEnd`, sort by queryIdentity desc → hitIdentity desc → targetStart asc. Identity bucket 4 levels. Mandatory coverage column `query[X..Y) · M/N nt`, tooltip secondary `по hit: N% (length nt extension)` (DEC-SEARCH-PER-QUERY-IDENTITY-01). Обновлены 2 из 14 тестов + 5 новых.

**Скопе — Фикс 7 Identity position-independence (post-2nd-acceptance, 11.05.2026).**
- **Корень:** seed-зависимое extension — счётчик `matches` считался над extension window, не над query целиком. При разных позициях mismatch seed был в разных местах, extension отыгрывал разный объём. Итог: биологический invariant `queryIdentity = (N-K)/N` не выполнялся (mm на pos 2 → 97%, mm на pos 15 → <80%).
- **Алгоритмический фикс:** после seed-and-extend находит hitAnchor в target — full-window alignment query vs target[hitAnchor : hitAnchor + queryLen]. `queryIdentity = matches / queryLen` (BLAST-pattern). Стандартный инвариант восстановлен (DEC-SEARCH-FULL-WINDOW-ALIGNMENT-01).
- **Side-effects:** `hitIdentity` (matches/extensionLength) убран из hit object + tooltip — потерял смысл. `queryCoverage` = 1.0 при full alignment, остаётся партиал только в edge-case overhang за конец target. `extensionLength` внутреннее поле.
- **Тесты:** position-independence invariant прямыми тестами в `sequence-search.test.js` — for each position p in 0..queryLen-1, mm на p → queryIdentity == (queryLen-1)/queryLen. Аналогично для 2 mm pairs.
- **Визуальное подтверждение 11.05.2026:** биолог на тест query 20 nt с mm на разных позициях видит 1 mm → 95.0% ровно, 2 mm → 90.0% ровно — инвариант выполняется.

**Закрытые TD:** — (нет closed TD в этом спринте).
**Новые TD (10):** TD-SEARCH-OVERLAY-RECTS, TD-SEARCH-INDEL-UX, TD-SEARCH-WORKER (deferred), TD-SEARCH-INDEX-EAGER (deferred), TD-RUST-CORE-PARSER, TD-RUST-CORE-PROGRESSIVE, TD-DESKTOP-NATIVE-SHELL, TD-NATIVE-UI-EVALUATION, TD-MOBILE-VIEWER-PROBE, TD-DEV-POLICY-LEGACY-HARDWARE. Подробно — в `TECH_DEBT.md` блок v0.8.2.

**Новые баги:** **V51** (drag selection микролаги в SequenceView на ThinkPad 2013, OPEN, высокий, синхронно с TD-DEV-POLICY-LEGACY-HARDWARE); **V52** (quick-add дублирует entry в активный проект без предупреждения, OPEN, средний). Оба выявлены 10.05.2026 на первой приёмке, отдельными bugfix-спринтами после v0.8.2.

**DEC-блок:** **Sprint-level в DECISIONS.md (18):** DEC-PROJSLICE-ACTIVATE-PURE-01, DEC-UIRREV-PINNED-EXPLICIT-01, DEC-UIRREV-TREE-CURRENT-EXPANDED-ONLY-01, DEC-UIRREV-TREE-OTHERS-COLLAPSIBLE-GROUP-01, DEC-UIRREV-TREE-CLICK-ACTIVATE-01, DEC-UIRREV-TREE-CURRENT-FIRST-01, DEC-UIRREV-SIDEBAR-PINNED-SECTION-01, DEC-UIRREV-COMMAND-PALETTE-PROJECTS-01, DEC-UIRREV-BREADCRUMB-STATIC-01, DEC-UIRREV-ACTIVATE-WITHOUT-PIN-01, DEC-PROJ-STRINGS-FORMALIZATION-01, DEC-SEARCH-SEED-EXTEND-01, DEC-SEARCH-FULL-WINDOW-ALIGNMENT-01, DEC-SEARCH-PER-QUERY-IDENTITY-01, DEC-SEARCH-SEPARATE-PRIMER-01, DEC-SEARCH-3END-INFO-NOT-FILTER-01, DEC-SEARCH-SNAPGENE-EXCLUDED-01, DEC-SEARCH-HOTKEY-ALTERNATES-01, DEC-SEARCH-WORKER-DEFERRED-01, DEC-ARCH-RUST-WASM-TWIN-TARGET-01. **Promoted в ANCHORS.md ⚓ (+3):** DEC-UIRREV-ACTIVE-SINGLE-01, DEC-UIRREV-ZONES-MERGE-01, DEC-PROJSLICE-ACTIVATE-PURE-01. Общее количество ⚓ fundamental 61 → **64**.

**Post-mortem.** Спринт прошёл через **две FAIL-итерации** перед PASS:
- **Первая приёмка (10.05.2026)** — 6 FAIL-пунктов (sidebar order / tree current-first / strings / DAG-switch side-effect / hotkey alternates / search semantics). Решены одним FAIL-fix проходом.
- **Вторая приёмка (10.05.2026 вечер)** — Фикс 7 (position-independence не выполнялся в Fix #6 — тесты проверяли семантику/sort/coverage, но не position-independence как invariant). Диагностирован Code из 3 кандидатов, решён full-window alignment.
- **Третья приёмка (11.05.2026)** — PASS по math invariant (1 mm = 95.0%, 2 mm = 90.0% ровно). 2 UNSURE по overlay-rects / coverage prefix → в TD-SEARCH-OVERLAY-RECTS + NIT.

**Наблюдения из процесса:** (1) спека M-X.9 K1 не имела position-independence в acceptance criteria — тесты проверяли sort/coverage/semantics, и Code легитимно не поверил math invariant. Урок: в спеках алгоритмов invariant'ы прописывать явно («(N-K)/N не зависит от позиции») + требовать property-based test (не anecdotal); (2) FAIL #4 (activateProject side-effect) — случайный наход при visual acceptance, принёс фундаментальный invariant «actions без side-effects» → ⚓ promotion. Это пример «обычный баг → фундаментальное решение» pattern; (3) Code отложил worker + eager index (DEC-SEARCH-WORKER-DEFERRED-01) без предварительного Chat-обсуждения — легитимно на small libraries но хорошо бы такие отклонения явными были в отчёте с самого начала.

---

## v0.8.1 — M-X.7c UI revision + project activation merge (10.05.2026)

**Коммиты:** ветка `feature/m-x-7c-ui-revision-and-project-activation`, 9 K-блоков последовательно. Bump 0.8.0 → 0.8.1 в `gui/designer/package.json` + `gui/designer/src/lib/version.js`.
**Тесты:** Vitest 1697/1699 + 1 skipped + 1 flake (pre-existing `primer-wizard.test.jsx::2`, в isolation passes, записан в TECH_DEBT как TD-PRIMER-WIZARD-FLAKE). pytest не запускался (фронтовой спринт, backend не задет).
**Build:** clean. PWA precache 1192.48 KiB (baseline 1187.34, +5.14 KiB — в зоне допуска ±5 KiB из спеки).
**Тип релиза:** Patch — UX revision поверх v0.8.0 base (Library = primary workspace), функциональное закрытие DEC-PROJECT-OPEN-MERGE-01 (от 09.05.2026).

**Скопе — K1 strings.** Добавлено 9 новых ключей: `startScreen.loadBodge` (заменяет `openBodge`); `topbar.{noActiveProject, recentProjectsHeader, createNewProjectInDropdown, activeBadge}`; `libraryWorkspace.{zoneLooseTitleNoProject, zoneLooseSubFreeDesk}`; `libraryWorkspace.actionsLoose.{addToActiveProject, addToActiveProjectDisabled, createCopyForEdit, moveToFolder}`; `libraryWorkspace.treeRow.{quickAddTooltip, quickAddDoneToast}`. Старые ключи оставлены до K9.

**Скопе — K2 Sidebar.** `Sidebar.jsx` переключён на STRINGS.startScreen.loadBodge «Загрузить .bodge…». `start-screen-data.js` — убраны пункты «Конструкции» и «Реакции» (остались Главная / Библиотека / Праймеры soon / Хоткеи). 5 пунктов → 3 в disabled-проверке (тест `start-screen.test.jsx` обновлён).

**Скопе — K3 Zones merge + activateProject.** `lib/library-zones.js` — `VALID_ZONES = ['loose', 'bodge']` (было 4: loose / active_bodge / readonly_bodge / lab_pool). Lazy migration: legacy `active_bodge` / `readonly_bodge` / `lab_pool` мапятся через `entry.projectId` → `'bodge'` если set, `'loose'` иначе. Lab pool primer без projectId → loose (Lab pool теперь View, не Zone). `projectSlice.activateProject(id)` — единая точка активации: validate state.projects[id], set currentProjectId, bump MRU, route canvas в 'dag'. Размещён в projectSlice (где canonical activeProjectId), не в librarySlice. 10 тестов `library-zones.test.js` переписаны под 2-зоновую модель.

**Скопе — K4 Tree.** `LooseZone` — title `STRINGS.libraryWorkspace.zoneLooseTitleNoProject` «⏀ БЕЗ ПРОЕКТА», sub `zoneLooseSubFreeDesk` «свободный стол биолога», иконка ⚑ → ⏀. `ProjectZone` — убран рендер `TreeFolderRow name="DAG"` (DEC-UIRREV-DAG-NOT-FOLDER-01). Тег `[active]` рендерится только когда `currentProjectId === project.id` (DEC-UIRREV-ACTIVE-SINGLE-01). Раньше рендерился безусловно — теперь null когда не активен. `LabPoolZone.jsx` удалён целиком (ливых импортов не было, только док-комментарии).

**Скопе — K5 Quick-add hover-revealed.** `TreeItemRow.jsx` — `useState(hovered)` + `+` button с `data-testid` `tree-item-{id}-quickadd`. CSS opacity 0 → 1 на hover row, transition 120ms (DEC-LIB-K8-QUICKADD-01 расширение). Click → `cloneEntryToActiveProject(entry.id)` + toast `quickAddDoneToast`. Visible только при `currentProjectId !== null` И `entry.projectId !== currentProjectId` И `entry.kind !== 'primer'` (праймеры через свой flow позже). Старая стрелка ↑ (origin char) сохранена справа от quick-add — это другой смысл (origin индикатор), не дублирование.

**Скопе — K6 Inspector bottom-bar.** `lib/library-actions.js::looseContainerActions` 6 кнопок → 5. Убрана `id='open'` (DEC-UIRREV-OPEN-DOUBLECLICK-ONLY-01 — двойной клик в Tree работает как single source входа). Переименованы: `useInActive` → `addToActiveProject` («Добавить в активный проект», disabled когда нет активного проекта, tooltip); `manualEditBranch` → `createCopyForEdit`; `moveFolder` → `moveToFolder`. `loosePrimerActions` — аналогичный rename. `library-actions.test.js` counts 6→5, regex `/активн.*проект/i` (Cyrillic `\w` не работает в JS).

**Скопе — K7 Topbar dropdown.** Новый компонент `components/Library/RecentProjectsDropdown.jsx` (~4.7 KB): MRU из `state.recentProjectIds` (cap 8), активный проект с pill `active` и disabled, остальные кликабельны → `activateProject(id)`. Footer «+ Создать проект» → `createProject` + `openProjectInfo`. Outside-click + Esc закрывают. `LibraryTopBar.jsx` — статичная навбар-крошка обёрнута в `<button data-testid="library-topbar-crumb-btn">` с trailing chevron ▾. **UX-замечание (визуальная приёмка):** dropdown функционально работает, но клик-таргет «Активный проект: <имя> <✓ сохранён> ▾» биолог оценил как «надмозговое решение» — префикс «Активный проект:» избыточен, `✓ сохранён` влез внутрь switcher'а. **Полностью переделывается в M-X.8** (DEC-UIRREV-BREADCRUMB-STATIC) — dropdown сносится, breadcrumb становится статикой, переключение переезжает в sidebar «В работе» секцию + Command Palette `⌘P`.

**Скопе — K8 activateProject.** `projectSlice.activateProject(id)` использован в K7 RecentProjectsDropdown. Существующие `openProjectFromFileData` (.bodge file path) / `openProjectFromIndexedDB` (id path) уже устанавливают currentProjectId + canvas + recent — эти пути не сломаны. Отдельной action `openProject(id)` не существовало (есть только эти два specialized path), удалять нечего. **Click по заголовку проекта в Tree всё ещё только toggle раскрытия**, не активация — это осознанный gap, закрывается в M-X.8 K4 (DEC-UIRREV-TREE-CLICK-ACTIVATE).

**Скопе — K9 Cleanup.** Удалены осиротевшие STRINGS: `startScreen.openBodge` (заменён loadBodge), `libraryWorkspace.zoneLooseTitle` / `zoneLooseSub` (заменены *NoProject / *FreeDesk), `libraryWorkspace.zoneLabTitle` / `zoneLabSub` (LabPoolZone удалён), `libraryWorkspace.dagSubrow` (DAG sub-folder удалён), `libraryWorkspace.inLab` / `crossProject` (LabPoolZone удалён), `libraryWorkspace.breadcrumbNoProject` (заменён topbar.noActiveProject), `libraryWorkspace.actionsLoose.{open, useInActiveContainer, useInActivePrimer, manualEditBranch, moveFolder}` (5 ключей). `lib/strings.js` 16.9 KB → 18.8 KB (+1.9 KB нетто: 9 added − 11 removed; рост за счёт длинных RU строк + EN комментариев). Финальный grep по удалённым ключам в `src/` — пусто.

**Закрытые TD:** — (нет closed TD в этом спринте).
**Новые TD:**
- **TD-SIZE-LIBRARYSLICE** (Watch list, soft monitoring): `store/librarySlice.js` ≈ **43.9 KB** (hard 25 KB для .js +18.9 KB over). Исторически вырос через M-A.3 → M-B → M-X.5 (Library write API + manual-edit branching + save flow + multi-import bulk + dedup + soft-delete + folder ops). В этом спринте K3+K8 правок не было (`activateProject` ушёл в projectSlice). Решение (DEC-SIZE-CALIBRATION-01): Watch list, не Active decomp — нет rate-of-change >5 KB/sprint два спринта подряд, нет entanglement. Промоут в Active если M-X.8 K2 (`pinnedProjectIds`) или M-C.2 backend writes раздует ещё на +5 KB.
- **TD-PRIMER-WIZARD-FLAKE** (low priority): `__tests__/primer-wizard.test.jsx::2) checkDupe-positive primer is flagged + unchecked; re-check applies autoname` flake на full-suite (в isolation passes стабильно). Тест последний раз правился в `24b8919` (M-X.5 K1). Pre-existing, не связан с M-X.7c. Таймаут на `waitFor` в parallel-suite. Ад-хок fix когда биолог решит отвлечься от fronts UX-волны.

**Открытые TD:** все из v0.8.0 переезжают без изменений: TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 (45.94 KB hard, M-X.6 K0), TD-ANNOTATIONTRACK-DECOMPOSE-V2 (48.54 KB hard, M-X.7+), TD-SIZE-SEQUENCEVIEW-INDEX (38.78 KB soft), TD-LIB-K2-DEAD-CODE-PURGE, TD-LIB-K10-CHARACTER-APPLY, TD-LIB-K4-VIEW-PREVIEW, TD-LIB-K4-AUTO-TRIGGER, TD-LIB-PREIMPORT-LOCATION, TD-LIB-CATALOG-RENAME, TD-WRAP-KEYBOARD-NAV, TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS, TD-CIRCULAR-SELECTION. От v0.7.1: TD-SEQUENCEVIEW-SHIFT-SELECTION, TD-SEQUENCEVIEW-FOCUS-RING, TD-LINEAR-BAR-PREDICTIONS. От v0.7.0: TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP. **Watch list расширился:** TD-SIZE-LIBRARYSLICE.

**DEC-блок:** **Sprint-level в DECISIONS.md:** DEC-UIRREV-ZONES-MERGE-01 (Tree зон 2, не 4); DEC-UIRREV-ACTIVE-SINGLE-01 (один активный проект); DEC-UIRREV-IMPORT-EQ-ACTIVATE-01 (импорт = активация, функциональное закрытие DEC-PROJECT-OPEN-MERGE-01); DEC-UIRREV-DAG-NOT-FOLDER-01 (DAG не папка в Tree); DEC-UIRREV-QUICKADD-HOVER-01 (DEC-LIB-K8-QUICKADD-01 расширение на все записи bodge-зон); DEC-UIRREV-OPEN-DOUBLECLICK-ONLY-01 (двойной клик — единственная точка входа в Container Window). **Кандидаты на ⚓ promotion** (после M-X.8 acceptance когда паттерны «2 зоны + один currentProjectId» переедут в реальный workflow): DEC-UIRREV-ZONES-MERGE-01, DEC-UIRREV-ACTIVE-SINGLE-01.

**Post-mortem.** Спринт закрыт за один день — 9 K-блоков последовательно без блокеров. Визуальная приёмка выявила два gap'а: (1) topbar dropdown UX работает но «надмозгово» — клик-таргет спрятан за микро-chevron, префикс и `✓ сохранён` влезли внутрь switcher'а; (2) click по заголовку проекта в Tree только toggle, не активация. Оба получили explicit closure в следующем спринте M-X.8 PROJECT-HUB (была согласована архитектура «выводим список в сайдбар + Command Palette ⌘P + breadcrumb статикой + click в Tree активирует»), решения в `CURRENT_TASK.md`. Два K-блока вынесены как TECH_DEBT легковесно: TD-SIZE-LIBRARYSLICE и TD-PRIMER-WIZARD-FLAKE.

---

## v0.8.0 — M-X.5 Этап 2 Library features (07.05.2026, MAJOR)

**Коммиты:** 7 на ветке `feature/library-as-workspace` от `d0f04a3` (K7+K11) до `36b6163` (K4 MultiImportView). Финал bump 0.7.5 → 0.8.0 (major architectural milestone — Library is now the primary workspace for sequence data, with explicit save flow, manual edit branching, onboarding, multi-import, and project quick-add).
**Тесты:** Vitest 1460/1461 passing (1 known primer-wizard flake on full-suite, isolated PASS — pre-existing). pytest 112/112.
**Build:** clean. PWA precache ~892 KiB.
**Тип релиза:** **Major** — six new K-step features ship together. Functional UX significantly expanded vs v0.7.5.

**Скоуп — K11 visual origin icons (07.05.2026 morning).** `LibraryItemRow` stamps a small Unicode glyph next to the entry name based on `entry.origin.kind`: `file_import` → no icon (default, reduces clutter); `paste_import` → 📋; `demo_category` → 📚 with categorySlug tooltip; `manual_edit` → ✎ in amber accent (var(--accent-700)); `version` → ⎘ with parent id prefix in tooltip. Paint-only Unicode, no SVG / no extra DOM. Memo comparator extended.

**Скоуп — K7 Library Save Flow (07.05.2026 morning).** DEC-LIB-13 ⚓ Annotations mutable through explicit save flow. Two new buttons surfaced in LibrarySingleInspector title row when biolog has unsaved annotation edits on a Mine entry:
- **«Перезаписать»** — `librarySlice.overwriteLibraryEntryAnnotations(id, annotations)`. Confirm dialog → bumps `entry.version` → toast «Сохранено · v{N}». Q5 plan guard: hard-fail with `pending-delete` toast if entry is soft-deleted.
- **«Сохранить как версию»** — `librarySlice.saveLibraryEntryAsVersion(parentId, …)`. Modal name input prefilled с `${parent.name} (v2)` через autoname collision (Q4 plan). Creates new entry с `origin: { kind: 'version', parentEntryId, parentEntryHash, createdAt }`, recomputes resourceHash, leaves parent unchanged.

Both slice actions return `{ ok, id?, version?, name?, reason? }` для specific error toasts. Hybrid persistence model: v0.7.5 silent write-through (`writeLibraryEntryAnnotations`) сохраняется как safety-net (every keystroke флушит в Dexie — refresh не теряет правки). К7 explicit Save buttons добавляют COMMIT POINT layer с version bump.

**Скоуп — K6 Read-only/Editable toggle (07.05.2026 day).** DEC-LIB-16 ⚓ Read-only по умолчанию. READ-ONLY pill в title row становится `<button data-mode="readonly|editable">`. EDITABLE state — amber accent + 1.4s pulsing dot (CSS @keyframes editable-pulse, honours prefers-reduced-motion). State resets to read-only every time inspector switches plasmids — каждый open starts safe.

**Скоуп — K10 Manual edit branching (07.05.2026 day).** DEC-LIB-12 ⚓ Sequence mutable через manual-edit branching. Новая `librarySlice.createManualEditBranch(parentId, sequence, annotations)`: forks entry в new library row с `origin.kind = 'manual_edit'` + parent reference + `manualEditFlag: true`, recomputes resourceHash, returns `{ ok, id, name, reason? }`. Q5 guard: parent.pendingDelete → hard-fail. Detection layer: `Library/hooks/useManualEditDetection.js` — window-level keydown listener active только при armed=true (editable && Mine entry && Sequence tab). Filters: not in input/textarea/contenteditable, no Ctrl/Meta/Alt chord, key matches IUPAC ACGTUNRYWSKMBDHV или Backspace/Delete. Fires `onFirstEdit` once per arm cycle (latch resets when armed flips). UI: `Library/inspector/ManualEditConfirmModal.jsx` confirm dialog с Russian copy. Q3 plan: «per-mount» scope — switching plasmid triggers modal again. **Caveat:** commit lands modal + branch creation flow but не wires character-level apply в SequenceView (M-X.6 polish, requires extending useSequenceKeyboard.js with edit handlers). Today new branch identical к parent except origin marker; biolog can still mutate annotations on branch через FeatureEditorModal / drag edges / hotkeys.

**Скоуп — K5 Onboarding nudge + curated 7 categories picker (07.05.2026 day).** DEC-LIB-17 ⚓ Onboarding through nudge, not modal. Inline banner внутри empty Mine group offers «Загрузить базовые плазмиды». Click → CategoryPickerModal с 7 curated categories (Q1 plan: hybrid catalog — selected categories materialise в IndexedDB; other 12 categories accessible через future «Browse all demo» mode):
- basic_cloning_vectors (308) · pet_and_duet_vectors (120) · mammalian_expression_vectors (349) · yeast_plasmids (192) · crispr_plasmids (286) · plant_vectors (95) · fluorescent_protein_genes (398).

New `librarySlice.loadOnboardingPlasmids(categoryEntries)`: per category fetch `/plasmids-data/${slug}.json` → bulk-build LibraryEntries с `tags = ['demo', 'demo:<slug>', categoryLabel]`, `folderPath = 'Demo / categoryLabel'`, `origin.kind = 'demo_category'`. Per-category fetch errors tolerated — partial success counts returned.

**Скоуп — K8 Quick-add icon hover-revealed (07.05.2026 day).** DEC-LIB-QUICKADD-01. When biolog has active project + opens Library (e.g. from project DAG toolbar's «+ Из библиотеки»), Mine entries surface hover-revealed `➤` button. Click → `addContainerToCurrentProject(id)` + toast + `popFullscreen()` → biolog returns to canvas with entry attached as container reference. Renders ONLY когда есть `currentProjectId` И item has `id` И row hovered (CSS opacity 0 default → 1 on hover, 120ms transition). No clutter on standalone Library opened from Start screen.

**Скоуп — K4 MultiImportView (07.05.2026 evening).** DEC-LIB-MULTI-01..03. Replaces v0.7.5 K9-stub toast guard. Drop N>1 files → MultiImportView mounts in place of CatalogColumn, parses each file via existing `parseFile`, surfaces table per file (checkbox · name · per-file annotation choice dropdown). Header bar: batch annotation choice radio (Авто/Вручную/Не нужно) + folder text input. Cancel returns to tree without committing; «Готово (N)» fires `librarySlice.commitMultiImport(entries, defaults)`. Soft cap warning at >20 files (no hard limit per Q plan). New entries get `ext.annotationChoice` metadata recorded (auto-trigger wiring deferred to M-X.6 polish).

**Закрытые TD:** TD-LIBRARY-WRITE-API closed (DEC-LIB-13 explicit save flow + DEC-LIB-WRITE-THROUGH-HOTFIX-01 safety-net hybrid).
**Открытые TD:** TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS, TD-CIRCULAR-SELECTION (round-8 partial), TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB hard violation, M-X.6), TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT, TD-SEQUENCEVIEW-SHIFT-SELECTION, TD-SEQUENCEVIEW-FOCUS-RING, TD-LINEAR-BAR-PREDICTIONS, TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP. New: LibraryTree.jsx 38KB soft warning (под hard 40KB).

**Deferred work (M-X.6):**
- **K2 deferred:** dead-code purge (MultiInspector / EmptyInspector / ActionsBar / SessionSummary) и flip всех `'importer'` callsites на `'library'` (Topbar / StartScreen / canvasSlice FULLSCREENS / ~15 test fixtures). Этап 2 K2 не коснулся этого scope потому что aggressive purge во время user-facing rollout создал бы broken UX intermediate (нет multi-import view, нет empty state, нет save flow). Сейчас K4/K5/K7 заменители готовы — следующий cleanup pass переключит callsites + удалит legacy components.
- **K10 character-level sequence apply:** ManualEditConfirmModal + branch creation готовы, но реальное character editing в SequenceView требует extending useSequenceKeyboard.js (substantial scope).
- **K4 view button (PlasmidMiniMap preview в multi-import row):** план spec, skipped для K4 minimal landing.
- **K4 annotation-choice apply on mount:** ext.annotationChoice metadata recorded но не yet acted on. AnnotationsTab inside LibrarySingleInspector уже auto-runs L1 при open, поэтому `auto` is de-facto today.

**DEC-блок:** **Sprint-level в DECISIONS.md:** DEC-LIB-K7-OVERWRITE-01 (overwrite + version bump), DEC-LIB-K7-VERSION-COW-01 (save-as-version copy-on-write), DEC-LIB-K6-EDIT-PILL-01 (button toggle pill + pulsing dot), DEC-LIB-K10-MANUAL-BRANCH-01 (branch creation + per-mount confirm), DEC-LIB-K10-DETECTION-WINDOW-01 (window-level keydown listener), DEC-LIB-K5-CURATED-7-01 (curated subset + tag triple), DEC-LIB-K8-QUICKADD-01 (hover-revealed + active-project gate), DEC-LIB-K4-MULTIIMPORT-01 (in-place table + soft cap), DEC-LIB-WRITE-THROUGH-HYBRID-01 (write-through safety-net coexists с explicit save flow), DEC-VITEST-POOL-FORKS-01 (Windows worker_threads regression workaround). **⚓ promoted в ANCHORS.md:** DEC-IMP-06 (Importer fullscreen abolished, Library = primary workspace — supersedes DEC-IMP-01..05); DEC-LIB-12 (sequence mutable через manual-edit branching — supersedes DEC-LIB-05); DEC-LIB-13 (annotations mutable через explicit save flow — extends DEC-LIB-06); DEC-LIB-14 (edit parity SequenceView ↔ Annotator через single dispatcher); DEC-LIB-15 (import targets — Library only / Library + project); DEC-LIB-16 (read-only по умолчанию для sequence editing); DEC-LIB-17 (onboarding through nudge, not modal).

**Post-mortem.** Этап 2 закрыт за один день в auto-mode (07.05). Six К-steps + finalization = ~7 коммитов на ветке. Vitest pool=forks (DEC-VITEST-POOL-FORKS-01) — критическая infrastructure правка mid-sprint когда обнаружилось что worker_threads pool не поднимает happy-dom env под нагрузкой Windows; switch на forks pool восстановил полный suite (~30% медленнее но reliable). К2 deferred dead-code purge оставлен на M-X.6 cleanup чтобы избежать broken intermediate UX. K10 character-level apply deferred — modal + branch creation готовы, реальное editing в SequenceView переносится в M-X.6 (substantial scope, needs useSequenceKeyboard.js extension). Биолог принимает оба deferred items как expected при майоре.

---

## v0.7.5 — M-X.5 Этап 1 Library namespace refactor (07.05.2026)

**Коммиты:** 5 на ветке `feature/library-as-workspace` от `53db4e1` (TD-LIBRARY-WRITE-API hot-fix) до `240aa32` (K9 multi-drop gate). Финал bump 0.7.4 → 0.7.5.
**Тесты:** Vitest 1461/1461 passing (+4 vs v0.7.4: 3 new origin migration heuristic tests + the previously-flaky annotator-autorun stable on full-suite). pytest 112/112.
**Build:** clean. PWA precache 876.83 KiB.
**Тип релиза:** Refactor only — pure visual identity with v0.7.4 кроме переименования заголовка «Импорт» → «Library» в Topbar (роут `library` теперь обработан в App.jsx). M-X.5 Этап 1 acceptance: «undistinguishable from v0.7.4 functionally» — выполнено.

**Hot-fix — TD-LIBRARY-WRITE-API write-through (07.05.2026 morning).** Биолог: «после сохранения и обновления страницы, аннотация не сохраняется на сохраненном (импортированном) неаннотированном фрагменте». Корень — DEC-LIB-11 (Library entries frozen) + transient `perFileEdits.editedAnnotations`: правки FeatureEditorModal / drag edges / H/E hotkeys / Del жили только в local React state. Refresh страницы сбрасывал state → правки исчезали. Hot-fix: новая `librarySlice.writeLibraryEntryAnnotations(id, annotations)` action (overwrite payload.annotations + putLibraryEntry). В `Library/hooks/useLibraryState.js` `updateEdits` — fire-and-forget write-through когда patch carries `editedAnnotations` И item — Mine-source (`_libraryEntryId` определён). Catalog/paste/file imports остаются transient. **Будет заменено в M-X.5 K7** на explicit save flow с двумя кнопками (`Перезаписать` + version increment + confirm; `Сохранить как версию` + parent reference).

**Скоуп — K1 Library namespace skeleton + migration heuristic (07.05.2026).** `git mv components/Importer → components/Library` (45 файлов, full git history preserved через `R` rename ops). Update 6 outside imports (App.jsx, store/projectSlice.js, store/librarySlice.js, lib/strings.js, components/PlasmidViewer.jsx, components/Annotator/__tests__/annotator-flow.test.jsx). Internal renames: `inspector/SingleInspector.jsx → inspector/LibrarySingleInspector.jsx`, `inspector/MetaColumn.jsx → inspector/LibraryMetaColumn.jsx`, `lib/importer-state.js → hooks/useLibraryState.js` (move + new `Library/hooks/` directory), `catalog/use-catalog-sources.js → hooks/useLibrarySources.js`. Updated all internal references in Library/index.jsx, hooks useLibrarySources (catalog-cache path bumped), 4 test files, strings-coverage REPO_ROOT pointer. Round-18 ghost CREATE conversion (`useFeatureEditorFlow.js`) переехал as-is — fix остаётся live. Migration heuristic `deriveOriginForExisting(entry)` в librarySlice.js top-level: demo-tag prefix (`demo:<slug>`) → origin.kind = `demo_category` с categorySlug + sourcePlasmidName; иначе → `file_import` fallback. Idempotent на already-migrated entries. No I/O during hydrate (Q2 plan decision — avoiding plasmids-index.json read keeps startup fast for 100+ entries). +3 unit tests.

**Скоуп — K2 'library' route alias for 'importer' (07.05.2026).** App.jsx switch case `'importer'` теперь fall-through к `case 'library'` — оба монтируют Library workspace (Importer renamed в K1.1). Обe литералы остаются valid в Этапе 1; flipping ~10 callsites (Topbar, StartScreen, canvasSlice FULLSCREENS, project-flow toolbar, ~15 test fixtures) deferred to Этап 2 как часть DEC-IMP-06 ⚓ promotion. Это safer compromise — план предполагал что K2 удаляет `'importer'` + dead-code (MultiInspector/EmptyInspector/ActionsBar/SessionSummary) которые K4/K5/K7 заменяют — но в Этапе 1 без замен Library поломан UX'но (нет multi-import, нет empty state, нет save flow). Поэтому K2 сделан минимально: route alias + comment'ы про K4/K5/K7 ownership. Dead-code удаление перенесено в Этап 2.

**Скоуп — K3 LibraryTree decomposition (07.05.2026).** Закрывает hard violation `CatalogColumn.jsx` 64 KB (CLAUDE.md size budget hard 40 KB). Split на 5 modules в `components/Library/tree/`:
- `library-folder-tree.js` (3.5 KB) — pure helpers (GROUP_KEYS, INDENT_*, indentForDepth, depthBackground, buildFolderTree, readGroupState/writeGroupState, readSet/writeSet).
- `LibraryGroupHeader.jsx` (6 KB) — top-level group header (uppercase pill, drag-drop drop-zone, ＋/⤓ action buttons).
- `LibraryNestedSubGroup.jsx` (10.8 KB) — recursive folder header + InlineItemList renderer + SnapgeneCategoryRow с debounced 250 ms hover-prefetch.
- `LibraryItemRow.jsx` (9 KB) — memoised LibraryItemRow + flat-search CatalogCard variant + EmptyHint placeholder + newFolderInputStyle.
- `LibraryTree.jsx` (38 KB) — orchestration, sticky search, Mine folder rendering, flat-search overlay, DropZone footer с paste textarea. **Soft warning** (>30 KB) — под hard 40 KB. Дополнительные extracts (DropZone footer ~5 KB, MineSection ~7 KB) deferred в M-X.5 K12 polish если biolog найдёт ROI.
Test moved: `catalog/__tests__/catalog-column.test.jsx → tree/__tests__/library-tree.test.jsx`. Pure refactor — no logic changes, identical visual rendering. Catalog/ directory остаётся (catalog-cache.js, length-pattern.js + tests) — могут переехать в Library/lib/ при K12.

**Скоуп — K9 single-vs-multi drag-drop gate (Этап 1 stub, 07.05.2026).** `Library/index.jsx` обертка `handleAddFiles(files, opts)` — single file → forwards to `state.addFiles(files, opts)` (с `targetFolderPath` если drop был на конкретную папку Mine). Multi-file → `showToast` «Multi-import будет в v0.8.0. Пока загружайте по одному файлу.» + bail. Wires через 3 callsites: drainImporterFiles initial drain, CatalogColumn footer dropzone, folder-targeted drops в LibraryNestedSubGroup. Single-paste через PreImportModal остаётся unchanged (large 14 KB raw paste continues to work). Реальная MultiImportView UI — в M-X.5 K4 Этап 2.

**Закрытые TD:** TD-LIBRARY-WRITE-API через temporary write-through (полное закрытие в M-X.5 K7 explicit save flow).
**Открытые TD:** все из v0.7.4 переезжают: TD-CIRCULAR-SELECTION (full implementation), TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB hard violation, переносится в M-X.6), TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS (4 tracks не render в bridge wrap-half), TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT. От v0.7.1: TD-SEQUENCEVIEW-SHIFT-SELECTION, TD-SEQUENCEVIEW-FOCUS-RING, TD-LINEAR-BAR-PREDICTIONS. От v0.7.0: TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP.
**DEC-блок:** **Sprint-level в DECISIONS.md:** DEC-LIB-WRITE-THROUGH-HOTFIX-01 (TD-LIBRARY-WRITE-API hot-fix через writeLibraryEntryAnnotations + updateEdits write-through; будет заменён M-X.5 K7), DEC-LIB-MIGRATE-HEURISTIC-01 (Q2 — origin migration heuristic, no I/O during hydrate), DEC-LIB-K2-ROUTE-ALIAS-01 (case 'importer' → case 'library' fall-through; full callsite flip deferred to Этап 2), DEC-LIB-K3-DECOMP-01 (LibraryTree.jsx 38 KB landed soft, дальнейший split deferred to K12), DEC-LIB-K9-MULTIDROP-DISABLE-01 (multi-drop disabled с toast в Этапе 1; реальная MultiImportView в K4 Этап 2). **⚓ candidates** (от v0.7.2/v0.7.4): DEC-EDIT-PARITY-01 → промоция в **DEC-LIB-14 ⚓** при K6, DEC-IMPORTER-TARGETS-01 → **DEC-LIB-15 ⚓** при K9 Этап 2.

**Post-mortem.** Этап 1 закрылся за один день вместо запланированных 5-7 дней — biolog отдал auto-mode mandate сразу после approval плана, K2/K9 переосмыслены как минимальные scope (без удаления MultiInspector/EmptyInspector/ActionsBar/SessionSummary) чтобы Этап 1 acceptance не требовал визуальных изменений. K3 decomposition landed на 38 KB вместо целевых 30 KB; biolog решает достаточно ли (план разрешает «soft warning OK if hard 40 KB не превышен»). Hot-fix annotation persistence получился побочный — биолог сообщил bug сразу после плана approval, fix вошёл в первый коммит ветки до K1 чтобы не блокировать его текущую работу.

---

## v0.7.4 — M-X.3 wrap-tail rounds 12–18 (post-acceptance polish, 06.05.2026)

**Коммиты:** 10 на ветке `feature/sequence-view-feature-strip` от `afd839f` (round-12 restore trailing strip) до `7bbca01` (round-18 ghost-edit save). Финал bump 0.7.3 → 0.7.4.
**Тесты:** Vitest 1457/1458 passing (1 known flake `annotator-autorun.test.jsx::common-features-homology fires automatically` на full-suite — timeout 5000ms из-за parallel load; изолированно 537ms ✓; не регрессия — round-12..18 не трогали Annotator auto-run path). pytest 112/112.
**Build:** clean. PWA precache 875.76 KiB, 21 entries, 3.06s.

**Скоуп — Round-12 trailing wrap-tail strip restore (06.05.2026 evening).** Биолог: «тут еще надо поправить, чтобы вниз так же был призрачный сиквенс на 200-300 п.о. и можно было вести выделение через». В round-10 inline-bridge заменил отдельные trailing-wrap rows; биолог обнаружил, что для drag-selection сверху-вниз через origin призрачная полоска нужна и снизу. Fix: trailing-wrap strip восстановлен под main band (после bridge), но `trailingStart` параметр в `buildWrapTailLines` начинает offset от `bridgeWrapped` чтобы избежать дублирования с wrap-half в bridge line. Получили: leading wrap-tail (~2 строки сверху) → main:first ... main:last (с inline bridge) → trailing wrap-tail (~3 строки снизу).

**Скоуп — Round-13 duplication + selection gap fix (06.05.2026 evening).** Биолог скрин: концевой нуклеотид в призрачном участке не выделяется + дублирование начала. Корень — wrap-half в bridge line (chars 0..bridgeWrapped) И первая trailing-wrap row (chars 0..cpl) обе рендерили start-of-plasmid, что давало визуальное дублирование. Fix: `trailingStart = bridgeWrapped` в `buildWrapTailLines` — trailing rows начинаются после wrap-half. Selection gap: `computeSegments` в `SelectionOverlay` теперь корректно идёт через bridge wrap-half (detected по `data-wraps-origin`), и для trailing-wrap segment не пропускает первый bridge-region.

**Скоуп — Round-14 common-features dedup (06.05.2026 evening).** Биолог: «из комон фичей надо вымарать дубликаты. типо AmpR-BlaR они накладываются друг на друга именами, хотя это одни и те же гены». Скрипт `scripts/dedup_common_features.py` дропнул 11 дубликатов из `gui/designer/public/common-features.json` (419 → 408 features) через CANONICAL map: Tet-On 3G ≡ rtTA-Advanced ≡ rtTA3, T7 tag вариации, sacB вариации, SV40 promoter вариации, UbiC promoter вариации, LTR variants (5'/3'), ITR variants (5'/3'), AmpR ≡ Amp(R) ≡ BlaR (canonical-key collapse). Hash collisions group h=2 keep canonical, drop variants. Скрипт ASCII-safe (cp1251 console encoding fix).

**Скоуп — Round-14b bridge wrap-half resolver (06.05.2026 evening).** Биолог: «всё ещё одна буква в призраке не выделяется». Корень — `posFromPointerEvent` в `useSelectionState` при detect bridge wrap-half (rawOffset > bridgeWrapAt) не emit'ил extended-domain caret (caret > seqLength), поэтому wrapped selection через bridge не строилась корректно. Fix: bridge wrap-half emits caret `seqLength + (rawOffset - bridgeWrapAt)` — extended domain полностью консистентен с trailing-wrap rows. Selection rectangle теперь корректно охватывает буквы в bridge wrap-half + продолжается на trailing-wrap rows ниже.

**Скоуп — Round-15 / 15b / 15c — direction-aware rounding + layout-shift fix (06.05.2026 evening).** Три попытки починить «рамка выделения сдвинута, лишняя буква в призраке».
- **Round-15** (`4b28a9d`): direction-aware rounding в `posFromPointerEvent` — extending && rawOffset > anchor → `Math.ceil`, иначе `Math.floor`. Биолог: «нихера не меняется».
- **Round-15b** (`d2b1aeb`): switched to row-kind-based direction — leading-wrap rows используют `Math.floor`, trailing-wrap → `Math.ceil`, main rows сравнивают с anchor. Биолог опять: не меняется.
- **Round-15c** (`db4b395`): биолог dropped breakthrough hint «рамка выделения сдвинута! буква то может и не лишняя» — корень был НЕ в rounding, а в **CSS layout shift**: `border-left + padding-left: 3px` на `.sequence-line[data-wraptail-kind]` вызывал реальный сдвиг content на 3 px вправо. SelectionOverlay рисовал рамку по absolute coords (без сдвига) → визуальное расхождение «лишний нуклеотид». Fix: replaced `border-left + padding-left` → `box-shadow: inset 3px 0 0 var(--accent-500)` — paint-only декорация без layout shift. **Учебный момент:** биолог feedback «нихера не меняется» был правильным сигналом смотреть на саму DOM-геометрию, не на rounding math.

**Скоуп — Round-16 Annotator click → scroll preview (06.05.2026 evening).** Биолог: «нужно чтобы когда нажимаешь на имя комон фичи она тебя телепортировала на нее в сиквенс вью». Annotator's ResultRow component получил `onLocate` prop, который при click пробрасывается через `LevelPanel` → `Annotator/index.jsx` → `PreviewTab` → `SequenceView.scrollToPosition({ pos: region.start, behavior: 'smooth' })`. Annotator имеет local `innerScroll` state, мерджится с parent `pendingScroll` через `useImperativeHandle`. Click on feature name pill → smooth scroll to feature start position в SequenceView, caret moves to start.

**Скоуп — Round-17 empty-plasmid LinearFeatureBar (06.05.2026 evening).** Биолог скрин: «колбаса пропала в аннотаторе и в сиквенсе! если беру импортированный файл. Аннотации у него нет но колбаа и пустая с гост фичами должна быть». В M-X.2 LinearFeatureBar имел early-return при `!annotations.length` (для предотвращения empty render) — это блокировало показ ghost predictions из Annotator results. Fix: removed `!annotations.length` гейт в `LinearFeatureBar.jsx` и `displayAnnotations.length > 0` в SingleInspector — bar рендерится всегда, ghost-only рендер работает. PreviewTab + SequenceView consistent: empty plasmid с predictions показывает strip с штрихпунктирными ghost фичами.

**Скоуп — Round-18 feature-editor save для ghost features (06.05.2026 night).** Биолог: «поправь сначала баг что фича не применяется если на нее зайти с вклакдки сиквенс и нажать два раза и сказать "сейф"». Корень — `applyAnnotationEdit({kind:'update', id})` для predicted (ghost) feature был silent no-op, потому что synthetic id (`${start}:${end}:${type}:${name}`) НЕ существует в `editedAnnotations` (predictions живут в `annotator.results`, не в confirmed array). Fix в `useFeatureEditorFlow.js`: detect `existsConfirmed = baseAnnotations.some(a => a.id === parentId)`. Если ghost → конвертирую в `{kind: 'create', payload: {...featureUnderEdit, ...patch, level: 'region', predicted: false, confidence: undefined}}`. Strip `predicted` + `confidence` чтобы новая entry рендерилась solid (не dashed/italic), existing dedup-heuristic `isDuplicateOfConfirmed` подавляет original ghost. **Effect:** ghost features теперь редактируются и сохраняются с вкладки Sequence → FeatureEditorModal, биолог видит solid feature в strip + sequence + Annotator.

**Закрытые TD:** —. Round-12..18 — polish, не закрывают новых TD.
**Открытые TD:** все из v0.7.3 переезжают в v0.7.4 без изменений: TD-CIRCULAR-SELECTION (full implementation остаётся), TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB hard violation), TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS (4 трека не render features в bridge wrap-half), TD-LIBRARY-WRITE-API (M-X.5), TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT (deferred). От v0.7.1: TD-SEQUENCEVIEW-SHIFT-SELECTION, TD-SEQUENCEVIEW-FOCUS-RING, TD-LINEAR-BAR-PREDICTIONS. От v0.7.0: TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP.
**DEC-блок:** **Sprint-level в DECISIONS.md:** DEC-WRAPTAIL-04 (round-12+13 — trailing-wrap restored с offset через bridgeWrapped), DEC-WRAPTAIL-05 (round-14b — bridge wrap-half emits extended-domain caret для consistent selection через origin), DEC-LAYOUT-PAINT-ONLY-01 (round-15c — paint-only decorations через `box-shadow inset` для wrap-tail accent stripe; CSS layout shift из `border + padding` ломает absolute-coord overlays), DEC-COMMON-FEATURES-DEDUP-01 (round-14 — canonical-key collapse в common-features при h=2 hash collision; CANONICAL map для name variants AmpR/Amp(R)/BlaR, Tet-On 3G/rtTA, etc.), DEC-ANN-LOCATE-01 (round-16 — onLocate prop chain Annotator → SequenceView через `useImperativeHandle.scrollToPosition`), DEC-LINEAR-BAR-EMPTY-01 (round-17 — bar render всегда, ghost-only rendering supported), DEC-FEATURE-GHOST-EDIT-01 (round-18 — ghost CREATE conversion в `useFeatureEditorFlow.js` через `existsConfirmed` detection; strip predicted+confidence, dedup heuristic подавляет original ghost). **⚓ candidates:** DEC-EDIT-PARITY-01 (от v0.7.2, edit parity SequenceView ↔ Annotator через `applyAnnotationEdit`) — **подтверждён в реальном usage** через round-18 ghost edit, готов к промоции в M-X.5 как DEC-LIB-14. DEC-IMPORTER-TARGETS-01 (от v0.7.2) — готов к промоции в M-X.5 как DEC-LIB-15.

**Post-mortem.** 7 round'ов polish (12-18) в один день после v0.7.3 acceptance — биолог продолжал тестировать на real workflow, находил micro-UX баги. Round-15 → 15b → 15c — пример где изначальная hypothesis про rounding math была wrong, breakthrough пришёл от наблюдения биолога «рамка сдвинута, буква может не лишняя» (DOM-геометрия, не math). Round-18 — пример скрытого no-op в едином dispatcher (`applyAnnotationEdit({kind:update})` для несуществующего id) — single-dispatcher паттерн (DEC-EDIT-PARITY-01 candidate) усилен явным `existsConfirmed` гейтом + конверсией `update` → `create` для predicted features. v0.7.4 финализирован после round-18 принятия и aprsr плана M-X.5 биологом — чистая граница перед major bump v0.8.0.

---

## v0.7.3 — M-X.3 Wrap-tail rendering + 11 polish rounds (06.05.2026)

**Коммиты:** ~25 на ветке `feature/sequence-view-feature-strip` от `2a695e2` (M-X.3 K1 helpers) до `20f1c7f` (round-11 frame-merge fix). Финал bump 0.7.2 → 0.7.3.
**Тесты:** Vitest 1455 (+27 нетто vs v0.7.2: K1 wrap-tail unit tests, K2-K6 render/origin/edge/integration, round-8 wrap-aware, round-10 bridge). pytest 112/112.
**Build:** clean. PWA precache ~873 KiB.

**Скоуп — Sprint M-X.3 K1-K6 Wrap-tail rendering (06.05.2026 утро–день).** Закрывает TD-WRAPTAIL-RENDERING. Circular plasmid SequenceView теперь рендерит «контекст конца плазмиды» как leading wrap-tail (2 строки последних ~160 nt с opacity 0.6 + accent-stripe слева + 4% accent-tinted фон) ПЕРЕД main:first и origin marker (yellow pill с label «origin / 1») между wrap-tail и main band. Linear topology — без изменений. Auto-disable для коротких плазмид (<3 main lines). Wrap-tail row pointer-events:none стартом → click-protected, активируется на drag-extend. Caret + selection фильтруют по `data-wraptail-kind="main"` чтобы не залезать в context strip. ~7 unit тестов wrap-tail.js + render/origin-marker/edge/integration + caret-filter тесты.

**Скоуп — Round-5 caret transition gating (06.05.2026 day).** Биолог: keyboard arrow holds at ~30 Hz конфликтуют с 80 ms CSS transition на каретке — каретка отстаёт от cursorPos на 50–80 ms, при отпускании клавиши «докатывается» ещё 80 ms. Fix: transition теперь OFF по умолчанию, `body.caret-gliding` toggle во время drag-scrub'а (rAF coalesce + 120 ms сброс таймером). Keyboard nav и click — instant; drag-scrub сохраняет glide через каждый нуклеотид.

**Скоуп — Round-6 shift-anchor leading + scroll-handle filter (06.05.2026 day).** Биолог скрин pGEX-2T: «должно быть черта и сразу за чертой призрачный сиквенс». Naive grid alignment leading wrap-tail оставляла последнюю строку короткой (e.g. 48 chars из 140). Fix: `buildWrapTailLines` shift-anchor leading by END — каждая leading line ровно `cpl` chars, последняя ENDS at seqLen точно. Полная visual continuity с main:first после origin marker. Также `scroll-handle.scrollToPosition` фильтрует rows по `data-wraptail-kind="main"` — без фильтра drag-scrub стрелял на первую leading-wrap row (start=4668 > absolutePos) и `target=null` → `scrollIntoView` не вызывался → caret уползал, viewer не следовал.

**Скоуп — Round-7 perf wave + MetaColumn polish (06.05.2026 evening).** Биолог 5-point perf review:
- **PERF-1** useCallback/useMemo на inline handlers passed в `<SequenceLine>`. Identity-stable across parent re-renders → React.memo bails on lines с unchanged inputs. Раньше каждый cursor step / drag-scrub tick re-rendered все ~60 lines (full ~70k DOM nodes pass).
- **PERF-3** rAF-coalesce drag-scrub в SingleInspector. `onBarScrub` стэшит latest pos в ref + schedules один rAF tick который flushes 4 setState'а раз в кадр. Раньше 100+ Hz pointermove × 4 setStates = 400+ React-passes/sec.
- **PERF-4** split `settings` prop на скаляры (showBottomStrand / framesMode / primerStyle / reOrientation / visibleFrames). zustand emitting fresh slice object на ANY field change инвалидировал memo каждой line.
- **PERF-5** dropped `translateZ(0)` + `backfaceVisibility: hidden` на line wrappers. ~60 forced GPU layers на слабых интегрированных GPU стоили больше чем `contain:paint` уже даёт.
- **MetaColumn round-7** — TopologyPill компонент был referenced в JSX но не определён → runtime error, биолог видел кривой rendering. Добавил helper: full-width pill stacked vertically с SVG icon + label. ORIGIN row перевёл на `flex:1 1 64px` input + `flex:0 0 auto` apply button + flex-wrap fallback для узких viewport'ов.

**Скоуп — Round-8 last-char + wrap-aware selection (06.05.2026 evening).** Биолог: «не выделяется последняя буква» + «хотелось бы перенести выделение на призрачный участок сверху и снизу — фича может быть на обоих концах».
- **Last-char fix.** Outer clamp в `posFromPointerEvent` зажимал caret к `seqLength - 1` → selection [start, end) с end ≤ seqLength-1 всегда исключал final nt. Теперь clamp до `seqLength`. Drag использует `Math.ceil` (любое касание буквы = включена), click стаётся на `Math.round`.
- **Wrap-aware selection.** Extended caret domain: `caretPos ∈ (-seqLength, 2 × seqLength)`. Negative = wrapped из leading-wrap row; > seqLength = wrapped через trailing-wrap. Anchor stays in main (resolver gates initial click). SequenceLine.jsx — `pointer-events: none` DROPPED with wrap-tail wrappers; click protection moved into `posFromPointerEvent` (bails on wrap-tail unless `extending`). CaretOverlay accepts seqLength prop, picks leading-wrap rows для caret < 0 и trailing-wrap rows для caret > seqLength. SelectionOverlay's `computeSegments` helper делит (anchor, caret) пару на 1 или 2 rendering сегмента — wrapped selection paints два strip'а, один в relevant wrap-tail row + один в main band. `copySelection` склеивает head + tail через origin: forward / reverse-complement / AA copies все знают как ходить через wrap.

**Скоуп — Round-9 boundary collapse + adjacent feature gap (06.05.2026 evening).** Биолог: «рядом стоящие фичи без перекрытия объединяются одной рамкой» + «внизу с новой строки идёт призрачная часть».
- AnnotationTrack rect width subtract 1 px → adjacent stacked features имеют видимый gap.
- SequenceLine accepts `nextKind`, on wrap-tail ↔ main boundary collapses divider (border-bottom dashed dropped, paddingBottom 14→4, marginBottom 14→6) — origin marker становится единственным cue.

**Скоуп — Round-10 inline wrap-bridge (06.05.2026 evening).** Биолог: «продолжать должно дальше, просто поставить вертикальный разделитель и все. но новой строки быть не должно». Trailing wrap-tail strip moved INLINE — last main row widened to a full cpl by appending wrap chars from plasmid start, with vertical origin divider INSIDE the line at the seam. New `buildWrapBridgeLine` helper. RulerTrack accepts `wrapAt` + `seqLength` — tick numbering splits at wrap. SequenceLine renders absolute-positioned vertical accent bar with «▶ 1» pill. OriginMarkerOverlay bottom marker disabled. **Trade-off:** wrap half currently doesn't render annotations / primers / RE / AA (those tracks still filter by [lineStart, lineLen) without wrap awareness) — DNA strands + ruler labels работают корректно. Acceptable per биолог: «просто поставить вертикальный разделитель и все».

**Скоуп — Round-11 frame-merge fix (06.05.2026 evening).** Биолог скрин 3xFLAG-dCas9 pMXs-neo: features всё ещё в общей рамке. Корень в LinearFeatureBar `clusterByOverlap` — pixel-overlap clustering группирует фичи в один outer stroke. Float-rounding на границе делал touching features (AmpR end vs AmpR promoter start) cluster. Fix: overlap test now requires ≥1 px intersection (was strict `<` of ranges). Также bumped AnnotationTrack rect width subtract from 1 px → 2 px для visible gap на 1× scale.

**Закрытые TD:** TD-WRAPTAIL-RENDERING (M-X.3 K1-K6 + rounds 6, 9, 10).
**Открытые TD:** TD-CIRCULAR-SELECTION (data model + selection math через origin полноценно — round-8 partial: selection rendering + copy slice работают, но selection from-leading-wrap requires drag-extend, click on wrap-tail остаётся blocked). TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB, не тронули в M-X.3 — feature filtering at SequenceLine level позволил отложить). TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS (новый: AnnotationTrack / PrimerTrack / RestrictionTrack / AATrack не рендерят features в wrap-half bridge line). От v0.7.2 остаются: TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT, TD-LIBRARY-WRITE-API. От v0.7.1: TD-SEQUENCEVIEW-SHIFT-SELECTION, TD-SEQUENCEVIEW-FOCUS-RING, TD-LINEAR-BAR-PREDICTIONS. От v0.7.0: TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP.
**DEC-блок:** **Sprint-level в DECISIONS.md:** DEC-WRAPTAIL-01 (visual layer без data-model изменений; selection через origin = TD-CIRCULAR-SELECTION), DEC-WRAPTAIL-02 (feature filtering at SequenceLine level вместо AnnotationTrack — позволил отложить TD-ANNOTATIONTRACK-DECOMPOSE-V2), DEC-WRAPTAIL-03 (round-10 inline bridge supersedes отдельные trailing-wrap rows — биолог «новой строки быть не должно»), DEC-CARET-TRANSITION-01 (round-5 — body.caret-gliding gating, transition только во время drag-scrub'а), DEC-PERF-MEMO-01 (round-7 PERF-1 — useCallback/scalars для memo bail), DEC-LFB-OVERLAP-EPSILON-01 (round-11 — overlap test ≥1 px чтобы touching features не cluster).

**Post-mortem.** 11 раундов polish после M-X.3 K6 — сигнал что K6 visual acceptance под happy-dom недостаточно для UI работающей под real browsers + biolog real workflow. Большая часть rounds — micro-UX fixes биолог→Code пинг-понг. v0.7.3 финализирован сразу после round-11 принятия — biolog: «работает».

---

## v0.7.2 — M-X.2 Annotation Editing + Annotator + UX/perf wave (05–06.05.2026)

**Коммиты:** ~50 на ветке `feature/sequence-view-feature-strip` от `7176f7d` (CPU 25% idle bug fix через Vite HMR pin) до `322031c` (drill-in animations). Финальный bump 0.7.0 → 0.7.2 одним прыжком (v0.7.1 в коде не бампался — журнал проскочил, синхронизация при этом релизе).
**Тесты:** Vitest 1421/1422 passing (+475 нетто vs v0.7.0; +2 worker-client coverage). 1 pre-existing flake (`primer-wizard.test.jsx:79` на full-suite, проходит изолированно). pytest 112/112.
**Build:** clean. PWA precache 21 entries / 865.7 KiB. Worker chunk `predictor.worker-*.js` 12.62 KB.

**Скоуп — M-X.2 Annotation Editing + Annotator (K1-K10 + 70+ post-K10 + M-X.2-fix K1-K6).** Интегрированный edit-annotations workflow в SequenceView: Del удаляет (two-pass exact → smallest covered), H создаёт через CreateAnnotationPopup рядом с правым краем строки selection, E открывает EditAnnotationModal на coords региона, drag edges с live preview + tooltip, double-click label → inline rename / double-click bar → FeatureEditorModal (tab Feature + tab Subfeatures), context menu ПКМ. Ctrl+Z/Y на edit. Sub-features (`level: 'detail'` + `parentId`) с inset rendering и shaded color по индексу — Split button делит последнего ребёнка пополам. SBOL glyphs paired с label, mirror на reverse strand. PreImportModal flow: paste / drop / catalog click → name / topology / folder / tags / annotate-now checkbox; multi-file shared metadata; existing-annotations radio (keep / discard). Embedded Annotator (default): three-level LevelPanel (L1 common-features-homology auto-run, L2 structural predictors orf-scan/sigma70/stem-loop/sgrna-scaffold manual, L3 BLAST stub) + PreviewTab с linear/circular sub-tabs + ghost drill-in side panel (Accept/Reject/BLAST/re-run). Threshold slider live с over-fetch 0.5 + render-time filter. Accept ghost → solid annotation. Hide-duplicates toggle. Per-level «Accept all». Library entry annotations frozen (DEC-LIB-11) — правки только через `perFileEdits.editedAnnotations`; catalog mini-map обновляется через render-time merge без write-through. AnnotationTrack 41.6 KB остался (TD-ANNOTATIONTRACK-DECOMPOSE-V2). M-X.2-fix санация: hard violations 4 → 1, перенос dedup-логики в `lib/annotation-edit.js`, общее API `applyAnnotationEdit`.

**Скоуп — UX-1/UX-2/UX-3/polish wave (05–06.05.2026).** UX-аудит через Chrome MCP с сравнением SnapGene/Benchling/ApE/pLannotate → 71 ranked finding в `docs/UX_AUDIT_FINDINGS.md`. P0 пакет UX-1 (`9bf5a51`): первое впечатление, чистка дублей, скорость отзывчивости. UX-2 (`782f234`): a11y + Annotator polish + hotkey cheatsheet (`?` в Topbar). UX-3 (`dc9cf40`): confidence ticks на slider, save flash ✓ с bounce micro-anim, origin chips clickable. UX-006 (`5e0810c`): Display & Defaults tab вернулся в Settings — theme/wrap/polymerase/primer prefix/annotate-on-import с persist в `bodgegene-ui-display-settings`. SnapGene catalog snappiness: chunked render (INITIAL_CHUNK 20 / NEXT_CHUNK 60 через `requestIdleCallback`), 250 ms debounced hover prefetch, SVG chevron rotation transition, skeleton placeholders убраны (выглядели как fake rows). Animation polish: modal/toast/save flash/splash/catalog row backwards-anim (none re-fires при scroll-back через content-visibility). TOPOLOGY toggle SVG icons 12×12 (Unicode glyph collision устранена). Меta-column origin reverse в правый sidebar (DEC-MB-03 supersedes DEC-MB-02). «Моя библиотека» fix (`f5820a9`): `buildFolderTree` пропускал empty-string folders → entries без folderPath не видны. Folder tree decoupled от tags — `folderPath` своё поле (`3482400`). ESLint no-cyrillic rule + flow-node selector hot path fix (`bb64d87`).

**Скоуп — Sequence/Annotator interaction parity (05–06.05.2026).** Drag-scrub на LinearFeatureBar в Annotator (`e00c8c1`) — `onBarScrub` гейтится на `activeTab === 'sequence' || 'annotations'`, `pendingScroll` flow через `AnnotationsTab → Annotator → PreviewTab → SequenceView` (forwardRef + `useImperativeHandle.scrollToPosition`). Caret glide animation (`e00c8c1`) — `CaretOverlay` switched с `left`/`top` на `transform: translate3d(...)` + `transition: transform 80ms linear` + `will-change: transform`. На быстром drag через strip каретка плавно проходит между нуклеотидами вместо teleport. ORF ghosts на Annotator strip (`e328f15`) — force `showDuplicates: true` когда `activeTab === 'annotations'` (ORF emits `type: 'CDS'`, дедуп с confirmed CDS prevented showing). Click strip больше не швыряет в Sequence tab из Annotations.

**Скоуп — performance + main-thread (05–06.05.2026).** **DEC-PERF-WORKER-01** (06.05, `240f87a`): predictor plugins (L1 common-features-homology + L2 structural orf-scan/sigma70/stem-loop/sgrna-scaffold) бегут off-main-thread в `lib/workers/predictor.worker.js`. Pipeline через `lib/annotator-worker-client.js` lazy singleton, vitest happy-dom через `import.meta.env.VITEST` early-return → fallback на синхронный path. BLAST stub (`requiresNetwork:true`) остаётся на main thread. 200-500 ms freeze на открытии Annotator уходит из main thread полностью. Defer L1 past first paint (`5279e44`) — двух-rAF гарантия что Annotator shell + progress bar paint'ятся до scan'а. Microtask prewarm Sequence + double-rAF Annotator (`71f1033`) — Inspector mount 183 ms → 0. SequenceLine `content-visibility: auto` removed + `transform: translateZ(0)` + `backface-visibility: hidden` (`24bb02c`) — устранил re-realisation jitter на 90/120 Hz мониторах. Auto-annotate cache + bucketed RE-site scan + memoised library selectors (`1c3b9d7`). Allocation-free PWM scan + stem-loop walk (`27e796f`). Cached codon walks + O(1) AA-track cell lookup (`4bab893`, PERF-01,09,14). 5 revComp impls consolidated (`2a88c60`). Catalog stable per-entry items + pre-sized flat-search pool (`40c1bb6`). PWA: drop plasmid pack from precache, CacheFirst on demand (`f362f07`). Vendor chunk split (`5de98f7`). 4 orphan exports + 2 orphan files dropped (~404 LOC, `4a859c7`).

**Скоуп — Animation polish финал (06.05.2026).** Tab content crossfade (`67c6da0`) — 100 ms opacity + 2 px translateY между Inspector tabs (Обзор / Последовательность / Аннотации) и Annotator PreviewTab Linear/Circular. `.importer-tab-pane[data-tab-active="true"]` гейтит. Drill-in panel slide-in 120 ms translateX(12px) → 0 + opacity на mount; Accept/Reject press pulse 140 ms scale(1 → 0.96 → 1) + saturation bump (`322031c`). Все анимации gated `prefers-reduced-motion`.

**Закрытые TD:** TD-LIBRARY-WRITE-CONTRACT (закрыт K1 M-X.2-fix через Library entry frozen + perFileEdits transient). TD-ANNOTATOR-MOUNT (root-mount решение отложено в M-D, embedded стал default — DEC-ANN-13).
**Открытые TD:** TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB, M-X.4 либо параллельно M-D), TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT (при следующем sprint'е трогающем selection), TD-WRAPTAIL-RENDERING (M-X.3), TD-CIRCULAR-SELECTION (после M-X.4), TD-LIBRARY-WRITE-API (M-X.4). От v0.7.1 остаются: TD-SEQUENCEVIEW-SHIFT-SELECTION (M-D), TD-SEQUENCEVIEW-FOCUS-RING (low priority a11y), TD-LINEAR-BAR-PREDICTIONS, TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP.
**DEC-блок:** **⚓ кандидаты:** DEC-LIB-11 (Library entry annotations mutable through explicit save flow only), DEC-EDIT-PARITY-01 (edit parity SequenceView ↔ embedded Annotator через `applyAnnotationEdit`), DEC-IMPORTER-TARGETS-01 (Library only / Library + project targets). Эти три промотируются в `ANCHORS.md` если паттерн повторится в M-D Container Window. **Sprint-level в DECISIONS.md:** DEC-FEATURE-SUBFEATURES-01, DEC-ANN-SBOL-01, DEC-ANN-12 (three-level LevelPanel), DEC-ANN-13 (embedded Annotator default), DEC-IMPORTER-PRE-01 (PreImportModal flow), DEC-FEATURE-EDIT-FLOW-01 (dblclick semantics), DEC-IDLE-PREWARM-01 (V49 fix), DEC-PLUGIN-OVERFETCH-01 (over-fetch + render-time filter), DEC-ANN-01..11 (M-X.2 спека), DEC-PERF-WORKER-01 (predictor Worker — кандидат на ⚓ при reuse в M-D).

**Post-mortem.** Bump version скипнул промежуточный 0.7.1 в коде — version.js застрял на 0.7.0 после M-B finale, переехал прямо на 0.7.2. Это допустимо для in-flight ветки, но процесс «Code не оставляет отчёта в CURRENT_TASK.md» (упомянутый в v0.7.1 post-mortem) повторился — финальные test counts на момент промежуточных коммитов восстанавливаются по git log + CI build, не из координационных файлов. **Вывод закрепляется:** при следующих finalisation Chat сначала читает `package.json` + `version.js` ДО написания нового RELEASES блока (а не доверяет PROJECT_STATE.md шапке).

---

## v0.7.1 — V50 parser fix + Parser-Unification + SnapGene Refresh + M-B.3 Sequence Viewer Rewrite (03–04.05.2026)

**Коммиты:** 03.05 morning V50 parser coord fix + 4 sub-fixes AA-track refactor (PRE-K1 для всех последующих); Sprint Parser-Unification `a6182ad` + `e8f0f56` на `feature/racetrack-canvas`; 03.05 PM Sprint SnapGene Refresh; Sprint M-B.3 SequenceView Rewrite `c1122fa` → `16c2c26` → `5972c2f` на `feature/sequence-view-feature-strip`.
**Тесты:** ~947 Vitest + 112 pytest (на момент V50 fix 03.05; B.3 cycle test count в координационных файлах не зафиксирован — Code не оставил отчёта в CURRENT_TASK.md; итог уточнится при ближайшей финализации M-X.1).
**Build:** clean.

**Скоуп — V50 parser coord fix (03.05 morning, PRE-K1 для всех последующих).** Каскадный off-by-1 в backend pipeline: `pvcs/snapgene_parser.py` хранил 1-based inclusive XML coords без конверсии; `pvcs/parser.py` добавлял второй `+1` на start → длины CDS не кратны 3 → reading frame ехал → ATG real-стартовых кодонов не попадали в AA-translation. **Fix:** в `snapgene_parser.py` — `xml_start - 1` (получить 0-based start, end остаётся exclusive). Верификация на pUC19: lacZα 147..469 (322 ✗) → 146..469 (324 ÷3 ✓); AmpR 1627..2486 (859 ✗) → 1626..2486 (861 ÷3 ✓). Контракт (⚓ DEC-PARSER-COORD-01 в ANCHORS.md, 03.05.2026): 0-based exclusive end end-to-end, дальше по pipeline координаты **не трогаются**. Инварианты: `length = end - start`; `(cds.end - cds.start) % 3 === 0`. См. BUGS.md FIXED V50.

**Скоуп — 4 sub-fixes AA-track refactor (03.05 morning).** (A) ruler line-end label убран целиком (major ticks 10 bp покрывают); (B) `buildCdsAAMap` поддерживает strand=-1 через `frame = (seqLen − end) % 3` + walkCodons antisense от 3'-конца; (C) regression test reverse-strand CDS показывает M на правом краю top строки; (D) AA-track render разнесён по (strand, frame) на свои строки, ORF fallback убран как noise. Регрессия-guards: `aa-track.test.jsx::reverse-strand CDS shows M at the 3'-end of top strand` + `single renders M for EACH forward CDS`.

**Скоуп — Sprint Parser-Unification (03.05 morning).** Разобрали второй .dna parser. `scripts/build_features_from_snapgene.py` имел inline `parse_dna()` + `parse_features_xml()` с **тем же V50 багом**: feature start/end хранились 1-based inclusive, затем Python slicing `seq[start:end]` брал 0-based exclusive → sequences в common-features.json были сдвинуты на 2 nt. **Fix:** scripts/ импортирует `parse_dna_file` из `pvcs.snapgene_parser` как single source of truth; inline-парсеры удалены. Backup `gui/designer/public/common-features.json` → `docs/archive/common-features_v_pre_v50.json`. Rebuild дал 419 features (все CDS ÷3). 3 ⚓ в commit message: **DEC-PARSER-UNIFY-01** (pvcs.snapgene_parser — single source of truth для .dna parsing); **DEC-PARSER-UNIFY-02** (scripts/build_features_from_snapgene.py owns post-processing only); **DEC-PARSER-UNIFY-03** (rebuilds always backup previous common-features.json в docs/archive/).

**Скоуп — Sprint SnapGene Refresh (03.05 PM).** Clean restart auto-annotate БД на свежих SnapGene эталонах. Wipe `scripts/snapgene_dna/` целиком (з3.gitignore'd, локальная операция) + redownload через `download_snapgene_library.py` (rate-limit 0.3 sec/file, ~2822 файлов, ~25-40 минут wall-clock). Backup current `common-features.json` → `docs/archive/common-features_v_pre_refresh_20260503.json`. Rebuild через unified parser. Роллинг-бэкап политика: V50-era backup остаётся как историческая референс-точка, дальше последний backup. Ни один Python-скрипт не модифицирован — data-only refresh.

**Скоуп — M-B.3 SequenceView Rewrite (04.05).** Rewrite сквозь пяти sequence-related файлов (~72 KB) в одну папку `components/SequenceView/`. **DELETE 5 файлов:** SequenceMapView.jsx, SequencePane.jsx, SequencePreview.jsx, SequenceViewer.jsx, PlasmidWorkspace.jsx. **Новые суб-компоненты** (~13 файлов, наибольший `index.jsx` ~10 KB): синхронные PrimerTrack / RestrictionTrack / RulerTrack / AnnotationTrack / StrandsTrack / AATrack по (strand, frame). **5 user settings** через SettingsPopover (⛙ icon в SequenceTab header, persist в `bodgegene-ui-sequenceview` localStorage): bottom strand visibility / AA frames mode (Auto/Single/All) / auto threshold 50-95% / primer style (filled/outline) / RE labels orientation (vertical/horizontal). Multi-row stacked annotations + leader-line labels + overflow `+N more`. Read-only foundation для M-C Container Window + M-D edit через optional callbacks.

**Скоуп — 04.05 интеракционные расширения поверх B.3 baseline.** **(1) Origin reverse в MetaColumn** (supersedes DEC-MB-02 от 02.05) — биолог: «Origin/межгенные участки/применить семантически в правом sidebar'е возле топологии». SequenceTab чисто viewer-only. **(2) LinearFeatureBar drag-scrubber** — pointer capture + touchAction:'none' + живое scrolling; `scrollIntoView({block:'center'})` заменяет ручной `containerRef.scrollTop = offset` когда SequenceView живёт в родительском overflow контейнере (importer-single-tab-content). **(3) Caret synchronization** — единый `cursorPos` в SingleInspector управляет LinearFeatureBar cursor + SequenceView caret одновременно. Клавиатурная навигация: ←/→ ±1 nt, ↑/↓ ±charsPerLine, Home/End границы строки, PageUp/PageDown ±10 строк. **(4) Selection + tri-modal copy context menu** (DEC-SV-04) — «Копировать (прямая цепь) Ctrl+C» / «Копировать обратную цепь Ctrl+Alt+C» / «Копировать аминокислоты Ctrl+Shift+C»; selection highlight (бледно-розовый с прозрачным fill) корректно работает над forward+reverse strands в reverse-strand контексте (numbers count down, AA-track перевёрнут). Caret и selection coexist как separate states.

**Отложено явно (в TECH_DEBT.md):** Shift+arrow расширение выделения (Range API — TD-SEQUENCEVIEW-SHIFT-SELECTION); visible focus-ring при tab-фокусе (TD-SEQUENCEVIEW-FOCUS-RING); ORF-предсказания на LinearFeatureBar (TD-LINEAR-BAR-PREDICTIONS, смяжно с M-X.1).

**Закрытые TD:** — (V50 был пойман и закрыт в одном цикле, не посредником TD).
**Открытые TD:** TD-SEQUENCEVIEW-SHIFT-SELECTION (M-D), TD-SEQUENCEVIEW-FOCUS-RING (low priority), TD-LINEAR-BAR-PREDICTIONS (M-X.1 либо M-X.2).
**DEC-блок:** ⚓ DEC-PARSER-COORD-01 (03.05.2026, ANCHORS.md) + ⚓ DEC-PARSER-UNIFY-01..03 (кандидаты в ANCHORS.md, сейчас в commit message Parser-Unification — перенос в ANCHORS.md отложен до следующей milestone-сессии) + sprint-level в DECISIONS.md (DEC-MB-03 supersedes DEC-MB-02, DEC-SV-01..04 caret/scrollIntoView/drag-scrubber/selection-context-menu).

**Post-mortem.** Отчёты Code в CURRENT_TASK.md не были оставлены ни по одному из четырёх sub-sprint'ов 03–04.05 (V50 fix + AA-track sub-fixes + Parser-Unification + SnapGene Refresh + M-B.3) — файл был перезаписан под M-X.1 спеку 05.05. Спеки в docs/ сохранили скоуп-информацию (PRE-K1, scope, decisions), но фактические commit-хеши от K-шагов + финальные test counts в координационные файлы не дошли. **Вывод:** формат Code-отчёта в CURRENT_TASK.md должен быть append в конец файла, схраняться до следующей финализации (не оверрайдиться при написании следующей спеки). Рассмотреть: Chat при написании новой спеки в CURRENT_TASK.md всегда сначала архивирует старый Code-отчёт в RELEASES.md, иначе файл оверрайдится без ревью истории.

---

## v0.7.0 — M-B finale: Catalog tree + folder-in-folder + auto-annotate cleanup (02.05.2026)

**Тесты:** Vitest 885 / 885 (от v0.6.4 baseline 891: −6 нетто — выкинул 6 obsolete promoter/terminator/linker auto-detect ассертов в `auto-annotate.test.js`/`auto-annotate-regions.test.js`, добавил 2 «no auto-detect» guards). pytest 112 / 112.
**Build:** clean, размер примерно ~570 KB (scope не вырос значимо — удалил больше кода чем добавил).

**Catalog perf — большие списки.** SnapGene категории на 300-400 items раньше тормозили при раскрытии. Три точечных оптимизации:
- `PlasmidMiniMap` обёрнут в `React.memo` с shallow-comparator — родительские state-обновления (drag highlight, hover bridges) не перерисовывают каждую mini-map.
- `PlasmidMiniMap` inline-mode пропускает связку `useState(vbox)` + `useLayoutEffect(setVbox)` — `vbox` теперь синхронный const от `size`. Раньше на mount каждый из 400 mini-map делал лишний re-render через `setVbox`. ~30% быстрее раскрытие.
- `ItemRow` тоже `React.memo` с custom-comparator (игнорит callback ref-churn, опирается на стабильный `item` ref).

**Drag-and-drop библиотечных items между папками + read-only protections + reload restore.**
- **Drag handle ⋮⋮** слева у каждого Mine ItemRow (Chrome/Vivaldi не пускают HTML5-drag из `<button>`, поэтому отдельный `<span draggable>`). MIME `application/x-bodgegene-item-id` + `-source-folder`. Drop на любую Mine-папку — move (untag source, add target). Drop на Mine GroupHeader — ungroup в корень.
- **Folder/file creation Mine-only** — биолог: «запрети создавать папки и файлы внутри снапген демо и прочих кроме библиотеки». Canvas/Demo/SnapGene GroupHeader без `onAddChild`. `renderFolderNodes` гейтит `onAddChild`/`onAddFile`/`onItemDrop`/`onFolderDrop`/`onDelete` через `isMine && !isUntagged`.
- **«Пусто» внутри пустых папок убрано** — после удаления папки оставляло визуальный шум.
- **«В библиотеку» точное правило** — `_libraryEntryId` propagated только для Mine-source items, проверка против `state.libraryEntries`. Item уже в библиотеке → кнопка скрыта; внешний импорт → видна.
- **Untagged-fallback** — когда `mineGroups = []` (legacy маркер) но `mine.length > 0`, синтетический `__untagged__` bucket. Раньше счётчик показывал N, на expand пусто.
- **`hydrateLibrary` подключён в bootstrap** — раньше определён но не вызывался, reload показывал пустую библиотеку (rows в Dexie оставались).
- **navStack persist для importer/library** — reload в Library больше не выбрасывает на стартовую. localStorage `bodgegene-nav-top` хранит top entry если это safe-state (importer + target=library).
- **Drag highlight depth-counter** — `useRef` enter/leave счётчик чтобы yellow-dashed не флипалось при пересечении inner-элементов (chevron, label, иконки).
- **Per-folder file import** — `addFiles(files, {targetFolderTag})` пробрасывает folder-path в `editedTags`. Триггеры: `⤓` hover-icon + drag-drop на folder row.
- **Folder + container delete (×)** — folder: убирает path + sub-paths из userFoldersByGroup + untags entries (контейнеры остаются); container: routes через `markLibraryEntryPendingDelete` → `commit`. Confirm dialogs предупреждают о project references.
- **Folder-in-folder через slash-paths** — `Vectors/CRISPR`. `buildFolderTree` парсит flat list в forest, `renderFolderNodes` рекурсивно до `MAX_INDENT_DEPTH=5`. Hover `＋` на header'е каждой папки.

**Mini-map polish (catalog list)**:
- Hover overlay смещён вправо (с fallback на лево) — биолог: «сместить чтобы другие значки видны».
- `data-theme` attribute на portal-span — dark theme через body-portal каскад теперь работает.
- Overlay 180 → 144 (~20% меньше).
- `HOVER_BRIDGE_MS` 250 → 80, `GROW_DURATION_MS` 200 → 140 — снапнее dismiss.
- Inline frame только для circular (`50%` border-radius merge с backbone-кругом). Linear — голая палочка.
- Inline size 20 px.

**LinearFeatureBar — greedy interval packing.** Старый алгоритм проверял anchor-X gap `< 80`, пропускал collision'ы при противоположных `dir`. Новый: pre-compute `textLeft`/`textRight` из `dir` + truncated text width, greedy-pack по rows. Корректно на плотных плазмидах, компактно на разреженных.

**Origin-rotate переехал из MetaColumn на SequenceTab.** Биолог: «выбор точки начала для плазмид должна быть доступна только на сиквенс вью, где можно тыкнуть на нуклеотид (там хоть номера видны)». Перенёс input + apply + intergenic-hints из правого sidebar (`MetaColumn`) в верхний toolbar `SequenceTab` — над `SequenceMapView`, где видны номера позиций. MetaColumn потерял: origin Card, `originOffset` state, `useEffect` reset, `onApplyOrigin`, импорт `computeIntergenicHints`. Топология toggle + length / info / IUPAC / description / organism / source остались. SequenceTab принимает новые пропы `fileKey` + `onUpdateEdits`, рендерит control только при `topology === 'circular'`. Тесты: новый `sequence-tab-origin.test.jsx` (4 теста), `meta-column.test.jsx` обновлён (origin-тесты удалены, добавлен guard что control больше не в MetaColumn). Vitest 887/887 (было 885, -2 +4).

**Удаление папок + контейнеров + минимапы вернулись в ItemRow.**
- **Минимапы**: каждая строка в catalog tree теперь префиксует 20 px `PlasmidMiniMap` (mode='inline', `disableHoverOverlay`) — биолог опять распознаёт плазмиды по форме. Были утеряны в первой v0.7.0 переписи.
- **Удаление папки (×)** — hover-revealed на header'е любой user или tag-derived папки (кроме `__untagged__` и SnapGene категорий). Confirm dialog показывает количество affected items и явно говорит «Контейнеры НЕ удаляются — это безопасная операция». Действие: убирает folder path + все sub-paths из `userFoldersByGroup[groupKey]`, untags затронутые library entries через `updateLibraryEntryTags`. Сами контейнеры остаются в библиотеке на корне.
- **Удаление контейнера (×)** — hover-revealed на каждой Mine `ItemRow`. Confirm dialog предупреждает: «Контейнеры могут использоваться в проектах — сначала отвяжите от всех проектов». Маршрутизируется через soft-delete: `markLibraryEntryPendingDelete(id)` → `commitLibraryEntryPendingDelete(id)`. Demo/SnapGene/Canvas/__untagged__ не имеют delete — read-only или отдельный flow.
- Новые строки: `catalogDeleteFolder/Confirm`, `catalogDeleteContainer/Confirm`.
- CSS: `.importer-catalog-delete` opacity 0.5 → 1 on row hover, на hover самой иконки — danger-red. ItemRow реструктурирован в wrapper `div.item-row` + click-button + delete-button: фон/hover теперь на wrapper, не на inner button.

**Финальная UX-полировка catalog tree.** «+ Новая папка» visible button-row убран целиком — иконки `＋` (создать папку) и `⤓` (импорт файла) теперь висят и на header'е каждой top-level группы, и на каждой папке внутри. Иконки **всегда видны** при opacity 0.5 (не hover-only — биолог пропускал) → opacity 1 на row hover. Эмодзи `📥` → Unicode `⤓` (DOWNWARDS ARROW TO BAR) — соответствует стилю символов проекта (▾ ▸ ＋ ‹ ⋯ ↻). Drop file на section header «Моя библиотека» → импорт в root; drop на folder row → импорт с folder-path в `editedTags`.

**Убран глобальный `DropOverlay`** в `App.jsx` — full-screen «Drop file here (M-B feature preview)» оверлей перекрывал per-folder drop targets в CatalogColumn (биолог жаловался, что «главное окно перехватывает загрузку»). Удалены: компонент `DropOverlay`, state `dragActive`, window-listeners `dragenter`/`dragleave`, строка `STRINGS.app.dropOverlay`. Остались только `dragover` + `drop` window handlers — они нужны для DAG → Importer routing (inner folder targets делают `e.stopPropagation()`, поэтому глобальный handler срабатывает только когда никакой child не поймал drop). Dead code: `NewFolderRow`, `newFolderActionStyle`, `catalogNewFolderHint`.

**Скоуп — Catalog tree rewrite (drill-down → fully inline).** Убрал режим drilldown/`←Назад` в `CatalogColumn.jsx`. Все группы — collapsible dropdown'ы:
- Top-level (Mine / Canvas / Demo / SnapGene) — порядок по запросу биолога: **Моя библиотека первой**, далее проекты, демо, SnapGene.
- Mine tag groups + SnapGene категории — nested `NestedSubGroup` collapsible inline (lazy-load для SnapGene категорий на первое раскрытие).
- Items внутри: рендерится **полный список**, без «Показать все/меньше» пагинации.
- **Depth-based indent** до 5 уровней: `indentForDepth(d) = 12 + d*12`, capped at 72 px. `CHEVRON_GUTTER = 16` добавлен к items чтобы text лёг под parent text column (раньше — под parent chevron).
- **Per-depth translucent accent tint** (`depthBackground(d) = 2.5%·d`, max 8%) — banded визуальная иерархия. Через CSS `--depth-bg` чтобы `:hover` не блокировался inline-style'ом.

**Скоуп — User folders (per-group, folder-in-folder).** Папки теперь можно создавать **в любом разделе** каталога:
- `userFoldersByGroup: {canvas, demo, mine, snapgene}` в `pvcs-catalog-user-folders-by-group` localStorage; миграция со старого single-array `pvcs-catalog-user-folders` ⇒ `mine`.
- Видимая «+ Новая папка» кнопка одна на раздел (внизу каждой top-level группы) — inline-input заменил `window.prompt` v0.6.4. Enter сохраняет, Esc/blur отменяет.
- **Folder-in-folder** через slash-paths (`Vectors/CRISPR`). `buildFolderTree(paths)` парсит flat list в forest, `renderFolderNodes` рекурсивно рендерит до `MAX_INDENT_DEPTH=5`.
- **File-manager паттерн для sub-folder creation:** на header каждой папки hover-revealed «＋» иконка справа (одна видимая «+ Новая папка» на раздел вместо buttons-flood). CSS `.importer-catalog-add-child { opacity: 0 }` + `.importer-catalog-nested-row:hover .importer-catalog-add-child { opacity: 1 }`.
- **Per-folder file import** (для Mine): hover-revealed «📥» иконка → shared `<input type="file">` с `pendingFolderTag` ref. Drag-drop файлов на folder row → импорт + folder-path тег на каждом imported entry. `addFiles(files, {targetFolderTag})` в `importer-state.js` пробрасывает тег в `editedTags`.
- `__untagged__` — виртуальный bucket, не получает «＋»/«📥» иконок.

**Скоуп — Auto-annotate cleanup (биолог: «не надо НАСТОЛЬКО МНОГО»).** Удалил детекторы шума из `auto-annotate.js`:
- **Linker detection** в `annotateCDS` (производил 25+ «Linker N» на каждой плазмиде).
- Promoter sub-features: `-10 element`, `-35 element`, `RBS (Shine-Dalgarno)`, `TATA box`, `CAAT box` — `annotatePromoter()` целиком удалён.
- Terminator sub-features: `Poly-A signal` — `annotateTerminator()` целиком удалён.
- **Signal peptide + Pro-peptide** — биолог: «отдельно при нажатии на CDS можно выбрать через сигнал IP». Удалены из CDS auto-flow; функции `detectSignalPeptide`/`detectPropeptide` остаются в `domain-detection.js` под будущий per-CDS on-demand action.
- Все типы (`linker`, `core_promoter`, `regulatory`, `polyA_signal`, `signal_peptide`, `propeptide`) **остались** в `TYPE_GROUPS` + палитре — пользователь добавляет вручную.
- Unused helpers (`findConsensus`, `isProkaryote`, `PROKARYOTE_KEYWORDS`) удалены.

**Скоуп — Auto-annotate UI moved.** «📥 Авто-аннотация» + «авто-аннотация при импорте» checkbox перенесены из ActionsBar overflow ⋯ menu в **AnnotationsTab toolbar** (биолог: «явно вынести на вкладку аннотаций»). Manual-trigger button сейчас disabled stub (новый annotator с per-CDS SignalIP — следующая итерация); checkbox по-прежнему рабочий — конфирм-flow auto-annotates автоматически.

**Скоуп — Critical AnnotationEditor fixes.**
- **Дубликаты edit-форм при клике карандашом.** Два корня:
  1. Non-region аннотация в нескольких вложенных регионах рендерилась как child каждого. Fix: `parentMap` (annotation → AT MOST ONE region: regionId match wins, else smallest containing).
  2. **`getRegions` synthetic-id substitution** — `getRegions(annotations).map(a => a.id ? a : {...a, id: ...})` возвращает NEW objects для id-less регионов; `annotations.indexOf(synthetic) === -1` для всех → клик ✎ ставит `editingIdx=-1` → каждый id-less регион в edit mode одновременно. После авто-аннотации (которая создавала регионы без id) — массовый «edit-everywhere». Fix: `annotations.filter(a => a.level === 'region')` (reference equality).
- Edit-form coord inputs `w-12 → w-16 + tabular-nums` под 5-значные плазмидные позиции.
- Theme-aware add/edit forms через scoped CSS overrides под `.importer-annotation-editor-wrap` — Tailwind defaults (`bg-gray-50`, `text-gray-400`, `bg-blue-100/-600`) → CSS-vars (`var(--surface-1/-2)`, `var(--text-tertiary/-secondary/-primary)`, `var(--accent-500)`).

**Скоуп — UX мелочи.**
- **«В библиотеку» прячется** когда файл уже добавлен в этой сессии. `Importer/index.jsx` считает `alreadyAddedToLibrary` через `state.addedItems`, ActionsBar скрывает обе library-кнопки. SessionSummary footer entry («✓ Уже добавлено …») остаётся как подтверждение.
- **«Скопировать в библиотеку»** wording убран — везде «В библиотеку». `actionLibraryCopy` + `isCatalogSource` prop удалены.
- **Topbar contextual title** «Библиотека» при `target=library` (заменяет `projectFallback: '—'` который смущал).
- **OverviewTab mini-map column** 240 → 320 px, **PlasmidMiniMap label truncate** 14 chars + `LinearFeatureBar` clamp + dynamic availW.

**Закрытые TD:** TD-V05-IMPORTSTARTSCREEN-DELETE (legacy `components/ImportStartScreen/` уже удалён в M-B.2; в v0.7.0 окончательно подчищены orphan-строки `actionLibraryCopy/AutoAnnotateOn|Off/catalogBack/MineFlatLabel/ShowAll|Less`).
**Открытые TD:** TD-MOLECULEWORKSPACE-M-D, TD-LIBRARY-CRUD-M-D, новый **TD-DRAG-DROP-LIBRARY-CARDS** (drag library cards между папками — сейчас drag-drop работает только для файлов с диска, не для уже-импортированных entries).
**DEC-блок:** DEC-IMP-13..18 + новые DEC-DS-NN по A+v2 палитре (из v0.6.4) + новые DEC-CAT-01..04 по дизайну дерева (no drilldown / depth-tint / file-manager hover-icons / folder-as-slash-path) — ждут добавления Chat'ом в `ANCHORS.md` / `DECISIONS.md` при финальной приёмке M-B.

---

## v0.6.4 — M-B.2 Importer Rework + post-acceptance polish (02.05.2026)

**Коммиты на ветке `feature/racetrack-canvas`:** M-B.2 K1..K6 (`f2554fd` → `c36d7bc`) + catalog-scroll-anchor (`8e9debe`) + Library wipe + TagsEditor (`3281779`) + StartScreen Library link (`18e86ce`, `a547f26`) + palette A+v2 + shade + canonical-key (`23bf484`, `7146af9`) + DESIGN_SYSTEM §2.1 (`03e3c11`) + StartScreen UX (`20508d5`) + Importer Critical (`219c2d7`) + Importer High (`98172f7`) + Polish round 2 (`c1f66ed`).
**Тесты:** Vitest 891 / 891 (от v0.6.3 baseline 834: +57 нетто — добавлены M-B.2 unit + integration suites, palette canonical-key matrix, tags-editor, lazy-tabs guard, multi-inspector; удалены legacy step2-combined.test + simple-import.test). pytest 112 / 112 (backend untouched).
**Build:** clean, ~570 KB / gzip ~172 KB (от M-A.3 baseline 120.49 KB +51 KB carries весь M-B.1 K6 + M-B.2 surface).

**Скоуп — M-B.2 Importer Rework (K1..K6).** Single-screen 4-column layout (CatalogColumn 320 / Inspector flex / MetaColumn 200 / footer) заменил Step1→Step2 двухэкранный flow из M-B.1. Inspector с TabBar: Обзор (eager, lightweight) / Последовательность / Аннотации / История (conditional). SequenceTab + AnnotationsTab — React conditional render → lazy mount → V49 50-сек hang fixed. CatalogColumn 4 sources («Этот проект» / «Учебные» / «Моя библиотека» sub-grouped by tags / «Каталог SnapGene» lazy-fetch) + sticky search с length-pattern + drop zone + paste textarea. MultiInspector table с tristate master. Inline TagsEditor пишет в `perFileEdits.editedTags` → Confirm flow промотит в LibraryEntry.

**Скоуп — post-acceptance polish (3 round'а Игоря).** **Round 1 (Critical):** AppShell `min-height:100vh` → `height:100vh` + overflow:hidden чтобы footer с primary actions не уезжал за viewport · `addCatalogItem` пробрасывает `_fromFileCount` (MetaColumn перестал показывать 0 для catalog items) · EmptyInspector context-aware (target=library + libraryEmpty → 📚 onboarding) · Cancel × → ‹ Назад в left header. **Round 2 (visual + simple-mode rip):** simple/advanced toggle убран целиком — всегда advanced; «не делать аннотацию» surfaces как autoAnnotate checkbox в overflow-menu · uppercase labels (СЕЛЕКЦИЯ / ПРОМОТОРЫ / etc.) перекрашены text-tertiary → text-secondary, weight 500 → 600 · межгенные участки label-stacked monospace вместо italic-tertiary · SequenceMapView `readOnly` prop drops 120 px primer reservation, +20% chars per line · AnnotationsTab `compact=false hideBar=false` → нормальные rows + linear feature-bar v0.5-style. **Round 3 (palette):** A+v2 approved over `docs/design_assets/feature-palette-comparison.html` mockup — 4 base hex changed (CDS/promoter/resistance/reporter), warm-sepia stroke сохранён · `featureColorShaded(type, name)` HSL ±10% L / ±6° H shade keyed by `canonicalFeatureKey(name)` (30+ entries; AmpR ≡ ApR ≡ bla → одинаковый shade) · DESIGN_SYSTEM §2.1 обновлён.

**Скоуп — Library fullscreen wipe.** `components/Library/` (4 файла + test) удалён. Function (browse saved containers) переехала в Importer CatalogColumn → «Моя библиотека». Tag-editing — только при импорте через TagsEditor. Soft-delete deferred to M-D Container Window. `librarySlice` data layer kept untouched. StartScreen `Library` SidebarLink → opens Importer with target=library + full catalog visible.

**Скоуп — StartScreen UX fixes.** Recent card layout `flex 1.1/0.9` → grid `[1fr 280px]` (~600px пустоты убрано) · ▷ chevron удалён · × delete hover-only · description colour primary opacity 0.85 (was tertiary, near-illegible на dark) · sidebar Browse links gap 2→4 + amber border-left accent on hover · Topbar Guide / Settings ghost-button styling · sidebar/header padding-left aligned at 20.

**v0.6.4 ↔ v0.7.0 contract.** Все M-B.2 фиксы накатываются как patch поверх M-A.3 (incremental). Formal v0.7.0 release block будет создан Chat'ом при финальной M-B.2 acceptance + bump до v0.7.0 (CLAUDE.md схема). До тех пор v0.6.4 — рабочий snapshot для visual review.

**Закрытые TD:** TD-V49-IMPORTER-HANG (lazy-tabs guard в `lazy-tabs.test.jsx::default-overview-no-annotation-editor`).
**Открытые TD:** TD-IMPORTSTARTSCREEN-V05-DELETE (v0.5 `components/ImportStartScreen/` — dead, удалить отдельным cleanup) · TD-MOLECULEWORKSPACE-M-D (компонент keep для Container Window) · TD-LIBRARY-CRUD-M-D (soft-delete + tag-edit existing entries — M-D scope).
**DEC-блок:** DEC-IMP-13..18 (single-screen / catalog 4-source / lazy tabs / edit через perFileEdits / SessionSummary footer / MoleculeWorkspace keep) + новые decision'ы по A+v2 палитре (ждёт DEC-DS-NN от Chat'а в финализирующей сессии) — добавятся в `ANCHORS.md` / `DECISIONS.md` Chat'ом при финальной приёмке.

---

## v0.6.3 — M-A.3 Library minimal CRUD + версионирование в коде (01.05.2026)

**Коммиты:** `5fcceea` → `41b394d` → `038986d` → `c568f61` → `525cac6` → `1167bba` (6 спринт-коммитов M-A.3 + 1 параллельный Chat-task fix StartScreen) + `<TBD>` (Type C версионирование v0.6.3 — package.json bump + `lib/version.js` + StartScreen footer + 1 unit-тест) · ветка `feature/racetrack-canvas`.
**Тесты:** 901 (789 Vitest + 112 pytest). Дельта от v0.6.2: +24 Vitest (M-A.3) + 1 Vitest (версионирование). _Если итоговый счётчик из K5 verify отличается — поправь это число одной правкой._
**Build:** clean, 0 warnings, bundle 384.51 KB / gzip 120.49 KB (M-A.3 baseline; версионирование bundle-нейтральное).

**Скоуп M-A.3.** Library fullscreen: list view + tabs Containers/Primers + topology filter + tags chips inline editable + soft-delete с undo. Schema v2 расширена table `library` с indexes `id, kind, addedAt, [kind+addedAt], *tags`. Reuse v0.5 паттернов: soft-delete (DEC-MA1-02), tag suggestions (DEC-MA-04), bilingual STRINGS (DEC-MA2-01). 8 отклонений Code от спеки (все приняты). Параллельный Chat-task: `↓ Import sequence` placeholder убран из StartScreen (DEC-IMP-03 follow-up).

**Скоуп версионирования (Type C, после M-A.3 приёмки).** `gui/designer/package.json` версия `0.0.0` → `0.6.3` (K1). Новый файл `gui/designer/src/lib/version.js` — single source of truth (`APP_VERSION = '0.6.3'`, K2). Footer в `StartScreen/index.jsx`: импорт `APP_VERSION`, отображение строки `BodgeGene v{APP_VERSION}` в нижней части sidebar — Code обернул его вместе с существующей PWA-install кнопкой в общий flex-контейнер с `marginTop: auto`, `data-testid="ss-version-footer"`, `fontSize: 11` / `var(--ss-text-tertiary)` (K3). Тест добавлен в `components/__tests__/StartScreen.test.jsx` (где уже живут другие StartScreen-тесты), ассерт по импортированному `APP_VERSION` — не ломается при следующем bump (K4). 2 отклонения Code от спеки: (a) тест положил рядом с другими component-тестами, не в новый `StartScreen/__tests__/` подкаталог; (b) Code обернул PWA-install в общий контейнер с footer вместо отдельных контейнеров — оба отклонения структурно чище и приняты на визуальной приёмке.

**Якорь схемы версий.** M-A.x = patches v0.6.x (M-A=v0.6.0, M-A.1=v0.6.1, M-A.2=v0.6.2, **M-A.3=v0.6.3**). Далее M-B=v0.7.0, M-C=v0.8.0, ..., M-I=v1.4.0. Документационные milestones (kickoff'ы, реструктуризация документации) — без bump. Закреплено в шапке этого файла + `lib/version.js` комментарии + `CLAUDE.md` правило 5.

**Закрытые TD:** —  
**Открытые TD:** TD-LIBRARY-CLEANUP-PENDING-DELETES · TD-LIBRARY-PERSISTED-TAG-DB · TD-LIBRARY-SEARCH-SORT-BULK (все 3 кандидаты M-H).
**DEC-блок:** ⚓ DEC-LIB-10 (фиксация «teги только на LibraryEntry», supersedes филд `MoleculeContainer.tagIds: UUID[]` из ARCHITECTURE_v2 v1.1). ARCHITECTURE_v2.md v1.1 → v1.2.

**Отложенная приёмка.** Группы D/E/F/H (list-rows / soft-delete / tags inline / persistence reload) требуют entries в Library — в release-сборке Library стартует пустым. 10 unit-тестов в `Library.test.jsx` покрывают функционал. Визуальная приёмка этих групп — после v0.7.0 (M-B.1 Importer наполнит Library реальным импортом).

---

## v0.6.2 — M-A.2 i18n-prep (01.05.2026)

**Коммиты:** `5f536a0` → `cc98e63` → `1a876d0` → `3ee3427` + K5 HEAD (5 спринт-коммитов Code + 5 Chat-direct strings post-приёмки).
**Тесты:** 764 (652 Vitest + 112 pytest). Дельта от v0.6.1: 0 новых — только assertions обновлены в 4 правках `StartScreen.test.jsx` на STRINGS namespace.
**Build:** clean, 25807 KiB precache, 34 entries.

**Скоуп.** UI strings вынесены в централизованный `gui/designer/src/lib/strings.js` (6.6 KB) — plain JS namespace dictionary, named export `STRINGS`. 11 namespaces (`startScreen` / `topbar` / `projectInfo` / `settings` / `toast` / `pwa` / `multiTabLock` / `hotkeys` / `placeholder` / `app` / `common`). ~15 компонентов + 5 lib-модулей + 2 store slice переведены. backend `src/pvcs/` чист (никаких russian литералов). 4 отклонения Code от спеки (все приняты).

**Закрытые TD:** —  
**Открытые TD:** —
**DEC-блок:** ⚓ DEC-MA2-01 (bilingual policy — public code english, coordination docs russian); DEC-MA2-02 (3 strings правки + 3 правила перевода для M-B+, sprint-level).

---

## v0.6.1 — M-A.1 Polish (01.05.2026)

**Коммиты:** `9ffdf2d` → `ca20869` → `39af2b4` → `facd425` → `aac0b53` (5 коммитов K1–K5).
**Тесты:** 764 (652 Vitest + 112 pytest). Дельта от v0.6.0: +25 Vitest.
**Build:** clean, PWA precache 34 entries 25.78 MiB, bundle 368.84 KB / gzip 116.99 KB, CSS 64.86 KB / gzip 12.28 KB.

**Скоуп.** 6 TD-entries накопленных при финализации v0.6.0 закрыты: K1 modal guard в `runHotkeyResolver`, K2 tag suggestions tests, K3 runtime UI tests, K4 PWA setup (`vite-plugin-pwa@1.2.0`, `manifest.webmanifest`, 3 финальных иконки Hybrid B отрендерены из `docs/branding/logo.svg` через sharp), K5 Notion-style Toast queue (`components/Toast/` 4 файла + 8 тестов) + soft-delete pattern (`_pendingDelete` flag на project entity). 18/18 визуальных критериев PASS, 1-pass. 6 отклонений Code от спеки (все приняты).

**Закрытые TD:** TD-HOTKEY-MODAL-GUARD · TD-PROJECTINFO-SUGGESTIONS-NOTESTS · TD-EXPORT-DELETE-NOTESTS · TD-CMD-W-VIVALDI-LIMITATION · TD-PWA-SETUP-DEFERRED · TD-TOAST-UI-MINIMAL.  
**Открытые TD:** TD-CTRL-N-OS-FALLBACK (low priority known: в standalone PWA Ctrl+N с открытым modal → guard блокирует handler, Chrome открывает новое browser-окно как OS-fallback).
**DEC-блок:** DEC-MA1-01..04 (sprint-level): Notion-style Toast queue / soft-delete pattern / auto-dismiss timer в useEffect / `_pendingDelete` на entity.

---

## v0.6.0 — M-A core + finalization trifecta (30.04.2026)

**Коммиты:** Основные K1–K11: `b1b13b9` → `5b30e81` → `82ee848` → `4213465` → `bb8c77f` → `77c339a` → `ce4fb47` → `aa4f188` → `c08cf22` → `b33c441`. K4 retrofit: `441b53b` + `baa01c8`. M-A-fix-2: `fedbeed`. Плюс несколько Chat-direct правок (theme toggle вынос, Guide stub, back button, runtime UI, tag suggestions). **Total ~17 коммитов.**
**Тесты:** 739 · 851 (627 Vitest + 112 pytest). Базелайн до M-A был 1031 (v0.5.4-alpha) — в v0.6.0 wipe удалил 305 v0.5 тестов, добавил 95 новых v0.6.
**Build:** clean.

**Скоуп.** Первый milestone v0.6 rewrite. **Wipe всех v0.5 данных** (DEC-V2-08, ARCHITECTURE_v2 §0). M-A core (10 K-шагов): IndexedDB schema v1 (Dexie · `projects` table), store rewrite, `lib/file-system.js` helpers, App+AppShell+Topbar skeleton, StartScreen Variant B v7 wireframe (split panel 220px sidebar + Recent column), заглушки (Settings/Library/Primer pool/All projects/Group projects), lifecycle (createProject / openProject / closeProject), `.bodge` round-trip (File System Access API + fflate ZIP, fallback `<a download>`), multi-tab guard (`navigator.locks`), CSS + v0.5 wipe. K4 retrofit: `lib/hotkeys.js` 7.62 KB — hotkey registry 7 entries (`new-project`/`open-bodge`/`save-bodge`/`close-project`/`open-settings`/`escape`/`project-info`), single global keydown listener через `runHotkeyResolver`. M-A-fix-2: `ProjectInfoModal` (auto-open после createProject) + 7-й хоткей ⌘I + reducer `updateDescription` + кнопка ✏️ в Topbar.

**Закрытые TD:** — (v0.6 rewrite, baseline)  
**Открытые TD:** TD-HOTKEY-MODAL-GUARD · TD-PROJECTINFO-SUGGESTIONS-NOTESTS · TD-EXPORT-DELETE-NOTESTS · TD-CMD-W-VIVALDI-LIMITATION · TD-PWA-SETUP-DEFERRED · TD-TOAST-UI-MINIMAL (все 6 кандидаты v0.6.1).
**DEC-блок:** DEC-MA-01..04 (sprint-level): theme toggle в углу header (не Settings) / ProjectInfoModal central UI / auto-open after createProject / tag suggestions sort by frequency. Все anchor-уровневые решения уже в DEC-V2-01..30 + DEC-DS-01.

**Post-mortem.** Цикл имел 2 fix-итерации (M-A-fix-1 UX руками Игоря + M-A-fix-2 ProjectInfoModal). Root causes: theme toggle в Settings (не в углу header) и базовое редактирование name/tags out of M-A scope — оба от недостаточной эмпатии к workflow биолога в формулировке спеки. Вывод: добавить §2 playbook'а 4-й sanity вопрос «как биолог попадёт в эту функцию?» (deferred).

---

## Документационные milestones (без version bump)

**M-B Kickoff формализация (01.05.2026, между v0.6.2 и v0.6.3).** Library re-definition (личная коллекция контейнеров и праймеров, **НЕ** 3-tier ownership) + Importer scope (3 источника file/paste/cross-project, 2 контекста in-project + into-library). 15 ⚓ решений: DEC-LIB-01..09 + DEC-IMP-01..05 + DEC-REUSE-01. ARCHITECTURE_v2.md обновлён в 8 секциях (v1.0 → v1.1) одним атомарным edit_file с 12 hunks. Исходные записки `M_B_KICKOFF_NOTES.md` (7 KB) в archive/.

---

## Предыдущие версии (перед v0.6 rewrite)

**v0.5.4-alpha (28.04.2026)** — feature-complete: ~290 коммитов, 1126 тестов (1014 Vitest + 112 pytest). Sprint Catalog Polish FIX-2 финал. История в `docs/archive/SESSIONS_2026_Q2.md` (цикл ImportStartScreen + App-Decomp + IS-Final). v0.5 baseline полностью wiped при переходе на v0.6.0 (DEC-V2-08).
