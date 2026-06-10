# PROJECT_STATE.md — BodgeGene snapshot

> **Версия:** **v0.8.4-alpha** — partial-detection fixes (V134/V138) + math/bio orientation audit (V118–V126) + v0.5-верстак cleanup −404 КБ (28–31.05.2026, patch; git-коммит за Игорем в терминале). Vitest **4349 pass / 17 skip / 0 fail** (4223 cf → 4328 ENGINE слои 1–2 V130/V131 → 4349 +JUNCTION слой 3 шаг 1 zone.junctions/primer-derive-on-add, 04–05.06); компоненты `.jsx` (non-test) 242→**206**, prod-файлы 497→454. Каноника — DEC-FDP-01 + DEC-PRIMER-TAIL-01 (DECISIONS), журнал — RELEASES v0.8.4. **База v0.8.3-alpha** (ниже): Four-tier architecture (T1-T10 + T4.5) + canvas UX батч + primer redesign + V82-V84 fixes + LibrarySingleInspector декомпозиция (16-18.05.2026, patch). 10 T-спринтов реализованы Code в continuous mode: T1 Pieces State → T2 op.inputPieces migration → T3 Zones data → T4 Zones rendering → T4.5 Zone 3-lane auto-layout (dagre) → T5 Piece authoring UI (4 способа) → T6 sequence-mode migration (assembly→pieces) → T7 dual-mode toggle G/S + bidirectional sync → T8 auto-reactions + cross-zone links → T9 design vs clone variants → T10 Sanger MVP lab notebook. Реверс ⚓ DEC-T3-08 + V61 17.05 (по AskUserQuestion «Полностью из state»). Bump v0.8.2 → v0.8.3-alpha (patch, по решению Игоря).
> **Тесты:** Vitest **4349 pass / 17 skip / 0 fail** (445 файлов; v0.8.4 + ENGINE слои 1–2 + JUNCTION слой 3 шаг 1 (zone.junctions, primer-derive on-add, 3-уровневая модель приоритета); baseline 4223 cf / 4328 engine). База v0.8.3: 3276 pass / 1 skip / 0 fail + 1 pre-existing flake (`primer-wizard.test.jsx`, intermittent под parallel-load, isolated 2/2 — TD-PRIMER-WIZARD-FLAKE, не связан с T-серией). **+956 новых тестов** от v0.8.2 baseline 2320 (T1 +52 / T2 +52 / T3 +56 / T4 +43 / T4.5 +45 / T5 +22 / T6 +47 / T7 +43 / T8 +33 / T9 +37 / T10 +26 + V82-V84 + canvas UX + primer redesign + декомпозиция). pytest 112/112 (не запускался — фронтовый sprint). `vite build` clean, 0 console errors.
> **Schema:** `DB_VERSION = 6` (Dexie) — 6 версий цепочкой: v1 projects+containers / v2 +library / v3 +primers / v4 library-shape +wipe (DEC-MX7A-V2-03) / v5 +snippets / **v6 +commonFeatures** (DEC-CF-02, common-features overlay, additive, исключена из clearAll). T-серия (pieces/zones/variants) — state-only, Dexie-миграций НЕ добавляла; прежняя «v=10 через v5→v6 T1 … v9→v10 T9» — фантом (×10-артефакт IDB-версии bodgegene-db + ошибочная атрибуция T-серии Dexie-миграциям), снято 02.06 по `db/dexie-schema.js`. Все идемпотентны, без потерь.
> **Архитектура:** `docs/ARCHITECTURE.md` — единый агрегатор v0.6+ (слияние ARCHITECTURE_v2 + ARCHITECTURE_CANVAS_MODEL + SPEC_M-CANVAS-FOUR-TIER, консолидация docs/ 27.05). Спеки T1-T10 + T4.5 — в `docs/archive/SPRINT_T*.md` (реализованы, ~360 KB). **64 ⚓** в `ANCHORS.md` (без изменений в v0.8.3 — реверс DEC-T3-08 + V61 записаны в v0.8.3 блок ANCHORS 28.05). Promotion-кандидаты (НЕ в счётчике 64; промоция ОТЛОЖЕНА до визуальной приёмки T-серии — статус неизвестен на 28.05): DEC-CANVAS-4T-01 (piece как первичная сущность), DEC-CANVAS-4T-07 (zone как Miro-frame), DEC-CANVAS-4T-31 (3-lane auto-layout structure). Sprint-level DEC v0.8.3-alpha sprint-block записан в `DECISIONS.md` (28.05): DEC-T1-01..15, DEC-T2-01..15, DEC-T3-01..17, DEC-T4-01..17, DEC-T4.5-01..15, DEC-T5-01..15, DEC-T6-01..15, DEC-T7-01..15, DEC-T8-01..14, DEC-T9-01..13, DEC-T10-01..12 + cross-cutting (annotator-toggle, useInspectorSelectionNav, library-selection primer-origin, реверс DEC-T3-08/V61, primer-redesign cross-portal pattern).
> **Журнал версий:** `RELEASES.md` (v0.8.3-alpha entry записан 28.05). История v0.8.2 + v0.8.1 + v0.8.0 + v0.7.x + `docs/archive/SESSIONS_2026_Q2.md`.
> **Дизайн-система:** `docs/DESIGN_SYSTEM.md` §2.1 — feature palette A+v2 + shade-by-name + canonical-key. v0.8.3 добавил: zone-frame DOM-rendering (T4) + lane-divider visual hints (T4.5) + pentagon-arrow primer glyph по обе стороны цепи (primer-redesign) + Sanger 4-status segmented control (T10) + colored-zones SegmentZonesOverlay для assembly UX (V84-period fade `.22→.10` brightness reduction).
> **Открытые TD:** см. `TECH_DEBT.md`. **v0.8.3 closed:** TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 (39.34 → 31.28 KB через extract `useInspectorSelectionNav` hook, эскалация СНЯТА). **v0.8.3 статусы переизмерены с диска (28.05):** TD-CANVAS-LAYOUTVIEW-DECOMP → **DONE** (`CanvasLayoutView.jsx` 41.35 → 14.01 KB, папка `canvas/` декомпозирована на ~40 файлов); TD-SIZE-SEQUENCEVIEW-INDEX → **Active HIGH, hard breached** (`SequenceView/index.jsx` 48.24 KB — было «~39 near-hard», занижено; decomp mandatory-first); TD-DOCS-ROTATION → **DONE** (docs/ ротация ~50 файлов до 9 выполнена 27.05; формальное закрытие в `TECH_DEBT.md` 28.05). **Carry-over Watch:** TD-SIZE-LIBRARYSINGLEINSPECTOR (31.28 KB, soft >30 на 1.28 KB), TD-ANNOTATIONTRACK-DECOMPOSE-V2 (48.54 KB hard), TD-SIZE-LIBRARYSLICE (43.9 KB), TD-CONTAINER-EDITOR-SKELETON (34.6 KB, soft over). **Опциональный 2-й extract** LibrarySingleInspector (annotation-edit pipeline, ~5-7 KB) уведёт под soft 30 — решение Игоря.
> **Открытые баги:** см. `BUGS.md` — **V51** (drag selection микролаги в SequenceView на ThinkPad 2013, OPEN, высокий, синхронно с TD-DEV-POLICY-LEGACY-HARDWARE — carry-over с v0.8.2). V52 (quick-add duplicate) → FIXED 16.05. V58-V81 canvas-skeleton bug-bash FIXED 13-16.05. V82-V84 (assembly drafts panel zone-based / gap known sequence / realise product annotations) FIXED 17.05.
> **Текущая задача / журнал:** см. `CURRENT_TASK.md`. **Common-features финализация ЗАВЕРШЕНА 02.06.2026** (Chat, Filesystem): DECISIONS (DEC-CF-01..12) + TECH_DEBT (TD-SIZE-FEATURE-DETECTION → DONE, SEQUENCEVIEW-INDEX 48.24→49.71, новый Watch feature-match-core 24.93) + COMPONENT_MAP (R5: feature-detection decomp + common-features секция) + RELEASES (common-features блок в v0.8.4) + PROJECT_STATE (Schema-строка по коду + тесты 4223 + это). **Версия НЕ бампается** (common-features в рамках v0.8.4). SPEC_COMMON_FEATURES → `docs/archive/`. Коммиты Code (Пачки 1-3, decomp→in-viewer) за Игорем в терминале. Предыдущая: **v0.8.4-alpha финализация ЗАВЕРШЕНА 31.05.2026** (эта сессия, Chat, Filesystem-only). Разнесено: version.js/package.json бамп 0.8.3→0.8.4; CLAUDE (версия + 48→206 комп); DECISIONS (DEC-FDP-01 + DEC-PRIMER-TAIL-01); RELEASES (v0.8.4 блок); SPEC_FEATURE_DETECTION_PARTIAL статус-шапка; PROJECT_STATE (шапка + тесты 4094 + «работает/дальше»); TECH_DEBT (TD-PLASMID-GIT-LOSS / TD-DEAD-REMNANT-630KB / TD-DOC-DRIFT-META-SIZE); BACKLOG (wiring-кластер A/B); COMPONENT_MAP (DEAD-секция); BUGS ротация (12 → FIXED, V119 отозван, 5 OPEN, Dexie-фантом снят); оба CODE_REPORT → `docs/archive/`. **Git-коммит (44 dead-code удаления + math/bio + partial, всё на диске, не закоммичено) — за Игорем в терминале (Filesystem git не видит).** **Post-mortem:** партиал прошёл ≥2 итерации фиксов — V138 потребовал явного разворота направления («обрезать бокс» → наоборот, тянуть до полной ДНК гена через `feat.sequence`), исходный диагноз был инвертирован; урок — на партиал-боксах сверять с импортом голого сиквенса как эталоном до выбора направления. **Отложено (housekeeping, не блокер):** archive-ротация >2-спринтовых блоков RELEASES/DECISIONS (тяжело на 130–190 КБ через Filesystem); полный рефреш архитектурной секции CLAUDE.md (дерево всё ещё частью описывает v0.5).
>
> **История (v0.8.3 финализация):** **v0.8.3-alpha Code-часть завершена 18.05.2026, Vitest 3276 pass / 1 skip / 0 fail.** Финализация Chat в процессе: Пачка 1а BUGS.md ✅ / Пачка 1b CURRENT_TASK.md ✅ (архив 202 KB → `docs/archive/`) / Пачка 1c PROJECT_STATE.md ✅ (этот файл). **Пачка 2 финализирована 28.05** (ANCHORS реверсы записаны + DECISIONS sprint-block ≈84 DEC + TECH_DEBT статусы переизмерены + RELEASES entry + version bump = no-op, package.json/version.js уже 0.8.3-alpha). **Единственное сознательное исключение:** промоция 3 four-tier кандидатов в ⚓ (DEC-CANVAS-4T-01/-07/-31) ОТЛОЖЕНА — статус визуальной приёмки T-серии не подтверждён (нужен отдельный acceptance-проход / переприёмка). Пачка 3 (архивация спек F/A/D1 + NOTES) — выполнена в рамках docs/ ротации 27.05 (~50 файлов до 9). **Следующее:** (а) переприёмка T-серии разблокирует ⚓ промоцию; (б) dead-code разнос (отдельный тред, 4 решения Игоря ждут); (в) приёмка partial seed-extend v0.8.4.

---

## Что работает

### Корректность алгоритмов + партиал-детекция (v0.8.4-alpha, 28–31.05.2026)
- **Партиал-детекция фич** (`feature-detection.js`): неполный фрагмент фичи с правкой на стыке не дробится и не теряет хвост (X-drop seed-extend + mergeCollinearPartials); бокс CDS покрывает всю ДНК гена (nt-refine V138). AA-дорожка транслирует только полные кодоны в кадре с минимумом стопов (V133, не тронута в v0.8.4).
- **Хвосты праймеров сборки** (`local-primer-design.js`): overlap/Gibson/OE-PCR/Golden Gate/RE-ligation — ориентация цепи приведена к pydna-конвенции (сборка собирается / фермент режет; V123/124/125). IUPAC `reverseComplement` полный (V118), digest не ломает straddling-аннотации (V122), auto-annotate стоп-кодон при длине не кратной 3 (V126).
- **Канвасовый `primer-derive.js` хвосты унифицированы** (live-junction ENGINE слои 1–2, 05.06): overlap/Gibson верны, GG rev `recognition+spacer+rc(oh)` (V124), RE fwd protective снаружи (V125); `realiseAssembly` материализует хвостатый праймер, не tailless fallback (V130). V130/V131 → FIXED. Per-enzyme recognition + ручной `buildAssemblyPrimer` — TD (слой 3 / follow-up).

### Common-фичи: раздел + промоут + правка (v0.8.4-alpha, 01–02.06.2026)
- **Раздел common-фич** в библиотеке (узел дерева + view-swap, НЕ окно): master-detail просмотр (список + `LinearFeatureBar` + `SequenceView` + АА-дорожка) + правка прямо в вивере (editable, name/type инлайн, factory→override).
- **Промоут «Добавить в common-фичи»** из вивера (Library-инспектор + ContainerEditor) → overlay-стор → детектится впредь; дедуп protein-путь по протеину / non-CDS по ДНК ≥0.96 RC.
- **Overlay-стор** (`commonFeaturesSlice` + Dexie v6) поверх заводской `common-features.json` (read-only): net-new + оверрайды по baseId + reset. `getMergedFeatureDB` мёржит для детекции. Дедуп=детекция (общий `feature-match-core`). Common-фичи НЕ в палитру.

### Four-tier architecture (v0.8.3-alpha T-серия, 16-18.05.2026)

**Data model — 4 параллельных slice:**
- **Containers** (DEC-CANVAS-4T-21) — физический контейнер ДНК с sequence + topology + annotations + zoneId + frozen.
- **Pieces** (DEC-CANVAS-4T-01, T1+T9) — концептуальный «кусок» как первичная сущность. Поля: `sourceIds[]`, `ranges[]`, `origin` (`'selection'|'feature'|'existing-primers'|'new-primers'|'legacy-migration'|'manual-gap'`), `acquisitionMethod` (`'pcr'|'restriction'|'ov-pcr'|'synthesis'|'direct'|'undefined'`), `acquisitionParams`, `derivedReactionId` (auto-link op T8), `kind: 'sourced'|'gap'` (T6), `gapSequence?`+`gapHint` (V83), `variantGroupId?` (T9 design variants), `order?` (T7 attached-to-strip), `pinned` (T4.5), `frozen`. piece.color — stable HSL hash.
- **Operations** (legacy + T2 extension) — ромб реакции. Поля: `inputs[]` (legacy) + `inputPieces[]` (T2 primary), `outputs[]`, `kind`, `status`, `params`, `materializedClones?` (T9 clone variants, hard cap 96), `zoneId`, `pinned`. Surgical opt-in adapters (DEC-T2-09): byte-identical legacy при пустом `inputPieces`.
- **Zones** (T3+T4) — Miro-style контейнеры на canvas. Поля: `bounds {x,y,width,height}`, `viewMode: 'graph'|'sequence'`, `laneLayout: 'auto'|'manual'` (T4.5), `collapsed`, `notes`, `autoResize`. Узлы (containers/pieces/operations) держат `zoneId`. Cross-zone refs — auto-detected (T8 link badges).

**Canvas UX:**
- **Auto-layout 3-lane** (T4.5, DEC-CANVAS-4T-31) — sources lane (top) / intermediate lane (middle, dagre LR auto) / finals lane (bottom). `pinned:true` через drag — узел остаётся на месте, остальные раскладываются вокруг. Кнопка «Открепить» в context-menu. Default «авто» режим, `laneLayout='manual'` — opt-out per zone (zone-menu пункт).
- **Inline sequence-mode** (T7) — toggle `G/S` per zone. 3 состояния: empty (hint + sources list) / palette (drag-cards) / assembled (horizontal strip + implicit junctions + branching visual). Visibility hide графовых узлов при sequence-mode active. Кросс-секционная синхронизация: drag piece в strip → ATTACH_PIECE_TO_ASSEMBLY + auto-create reaction (T8 finalizer).
- **Auto-reactions** (T8 finalizer) — при `piece.acquisitionMethod != 'undefined'/'direct'/'synthesis'` создаётся auto-reaction (PCR/Cut). При смене метода — старый op удаляется + новый создаётся атомарно. Manual OP_REMOVE на auto-created → finalizer пересоздаёт (биолог убирает реакцию через смену метода).
- **Cross-zone link badges** (T8) — `← Зона N` в header zone B, если piece в B имеет sourceIds из zone A. Click → smooth pan + 1s highlight target zone. Grouped by source zone (не per-piece).
- **4-сторонние коннекторы** (canvas UX батч) — `edgeAnchors` выбирает сторону блока по доминантной оси (вместо bottom-only).
- **Wheel-zoom-к-курсору** + **бесконечный канвас** (canvasContentExtent + edge-pan-velocity edge-auto-pan).
- **Hand-pan** — pointerdown на фоне (gate by closest-target) или middle-button → scroll-pan. `userSelect:none` на канвасе чтобы не стартовало нативное выделение текста.
- **Стационарный zoom-индикатор** — внешний non-scrolling wrapper, contains scrolling canvas + absolute zoom-controls overlay.
- **«Очистить канвас»** — gated `window.confirm` RESET (bottom-right стек: +Операция / +Сборка / Сборки / Очистить).
- **Drag-release ромба** не открывает viewer (justDraggedRef guard на onOperationClick).

**Variants (T9):**
- **Design variants** — `piece.variantGroupId` (`vg-<uuid>`). Источник + новая копия с opt overrides попадают в одну группу. `VariantGroupBadge` "N/M" + highlight всех членов на click. Auto-reactions T8 создаются per piece, варианты группируются визуально.
- **Clone variants** — `op.materializedClones[]` (hard cap 96). `MATERIALIZE_REACTION` создаёт N-1 deep-copy output containers (vertical stack). `BranchingVisual` rewrite 3 kinds: `clones` (vertical stack) / `design-variants` (Y-разветвитель) / `independent` (side-by-side).

**Sanger lab notebook (T10, MVP):**
- Right panel, hotkey `B`, per-zone scope (focusedZoneId).
- 4-status segmented control (pending / verified / failed / unplanned), filter, notes ≤500 chars (blur-saved).
- BranchingVisual clones получают цветной dot indicator (✓ verified / ✗ failed / ○ pending / нет — unplanned).

**Реверс ⚓ (17.05, по прямому запросу Игоря):**
- **DEC-T3-08 РЕВЕРС** — `buildInitialState` больше НЕ сидит default zone «Сборка 1»; `zones:[]` всегда. Чистый канвас.
- **V61 РЕВЕРС** — `ensureGhostPlaceholder` финализатор отключён в `skeletonReducer`. Чистый старт без авто-госта. Новые фрагменты — через кнопки/drag-drop.

**Primer redesign (18.05):**
- `PrimerFromSelectionModal` (имя/ПСО/RC-toggle) во всех 5 виверах (right-click «праймер» → модал, не сразу запись). Esc/backdrop close. Cross-portal pattern: backdrop гасит keydown+pointer+contextmenu (React-bubbling по дереву компонентов, портал DOM-изоляции событий НЕ даёт).
- **Pentagon-arrow glyph** по обе стороны цепи (forward сверху над top-strand, reverse снизу под bottom-strand) с вписанными binding-буквами (`<text>` lengthAdjust spacingAndGlyphs grid-aligned). Selected primer: bold ring + colour-halo + full-opacity arrow.
- **Кликабельность везде** (`onPrimerClick`/`selectedPrimerKeys` props). Back-compat: без callback — декоративный (`pointer-events:none`).
- **Double-click → редактирование** через ту же модалку (`primerDraft.name` pre-fill, submit = re-write через `onWritePrimer`).
- **Flank-highlight только fwd+rev** (биоинвариант: fwd-fwd / rev-rev не задают ампликон; `flankedSpan(a,b)` returns null для same-direction).

**Viewer-sync (cross-cutting):**
- Все 5 дизайн-виверов (Library/Importer-инспектор, ContainerEditor×2 [sequence + mutagenesis], Assembly, PCR) несут одинаковую пятёрку: `primers` + `onWritePrimer` + `showSelectionTm` + caret + selection.
- Annotator preview (`PreviewTab`) тоже получил `primers`/`onWritePrimer` (точка 4-точечного primer UX).
- `useEntryPrimers` hook (origin-scoped через `origin.kind='library-selection'`) — `ContainerEditorSkeleton` (K10-заглушка `primersForActive=[]` закрыта) + `LibrarySingleInspector`. Persistent через unified primer pool.
- `hydratePrimers()` теперь вызывается в проде (Library/Container inspector path) — раньше dead code.

**Annotator-toggle:**
- Вкладка «Аннотации» → toggle-кнопка в общем `TabBar.showAnnotations/onToggleAnnotator/annotatorActive`. `aria-pressed`, accent-wash. Scope: Library/Importer-инспектор + ContainerEditor. Assembly/PCR не тронуты (synthetic/template seq, аннотатор там семантически неопределён — открытое решение).

**Декомпозиция (cross-cutting):**
- `LibrarySingleInspector.jsx` 39.34 → **31.28 KB** через extract `useInspectorSelectionNav` hook (~170 строк caret/selection/LinearFeatureBar-навигации). TD-SIZE эскалация СНЯТА, 8.7 KB запаса до hard 40. Behavior-preserving refactor — нулевая регрессия на полной test suite.

### Annotator + Annotation Editing (M-X.2 + perf wave, v0.7.2 — unchanged)
- Integrated edit-annotations workflow в SequenceView (Del two-pass, H/E hotkeys, drag edges, dbl-click, context menu).
- Sub-features (level: 'detail' + parentId), SBOL glyphs, PreImportModal flow.
- Embedded Annotator с three-level LevelPanel + PreviewTab + ghost drill-in.
- Predictor Worker (DEC-PERF-WORKER-01) off-main-thread.

### Canvas & UI (unchanged)
- Canvas 4 вида + Project Flow DAG.
- CSS zoom, Quick Start панель, Smart Import modal.
- SnapGene Каталог (2822 плазмид, 19 категорий, lazy-loaded).
- Header / Breadcrumb / Compact context menu / Undo-Redo 50 levels.

### Library / Importer (M-B.2 + post-acceptance polish, v0.6.4 — unchanged)
- `librarySlice` data API: addLibraryEntry / checkLibraryDedup / getSuggestedLibraryName / selectVisibleLibraryEntries / selectAllLibraryTags.
- Single-screen 4-column layout (CatalogColumn 320 / Inspector / MetaColumn 200 / footer).
- Inspector tabs lazy-mount (Обзор / Последовательность / Аннотации / История).
- TagsEditor inline в SingleInspector, AutonameModal + PrimerWizardStepModal.
- Feature palette A+v2 + shade-by-name + canonical-key collapse.

### Assembly & Primer Design (existing + four-tier integration)
- 6 методов сборки: Overlap PCR, Gibson, Golden Gate, KLD, RE ligation, Restriction Cloning.
- Авто-расчёт праймеров клиентский, tag-aware primer design.
- Мутагенез + KLD primer design, adaptive overlap (No-PCR сосед).
- Single-circular self-closure primers (Sprint X-fix K5).
- **NEW T6:** assembly-mode UI (`editor/assembly-mode/*`) мигрирован на pieces shape через dual-source dual-resolution. `assembly-realise.js` → `zone-pieces-to-dag.js` (читает pieces из zone, гнерирует ops+junctions+containers). Adapter `segment-to-piece-adapter.js` для back-compat. `assemblyReducer` остаётся живым (T6 K14 deviation — литеральный no-op §5.9 заблокирован ~50 legacy assembly-тестами).
- **NEW V83:** gap-piece с известной ПСО (T2A linker / своя ПСО) сохраняется в `piece.gapSequence`, не подменяется поли-N.
- **NEW V84:** realise-продукты наследуют аннотации источника через `transferAnnotations` (DRY с legacy путём) + новый `concatSegmentAnnotations` для `-product` контейнера со сдвигом по offset в конкатенации.

### Plasmid-Git data model (Sprint X cycle, 26.04.2026 — unchanged)
- fragment.baseSnapshot + fragment.commits[] + replay.
- Mutagenesis через applyMutationsBatch (один pushUndo на batch).
- Toggle apply/revert на уровне commit.

### PlasmidViewer (unchanged)
- Circular map track-based arc layout, single-plasmid rendering, region selection.
- Sequence view двуцепочечная + AA-translation + region labels.
- RE sites toggle (1x / ≤2x / All), CDS validation warnings.
- presetMode instant actions.

### Restriction Cloning (unchanged)
- 3-step wizard, Junction Sequence Preview, reading frame check.

### SnapGene Каталог / Annotations / Import-Export / Parts Library (unchanged)

### Project Flow (unchanged)
- 5 node types, 3 edge types, dagre layout.

### v0.6 infrastructure (M-A core, M-A.1, M-A.2, M-A.3 — unchanged)
- IndexedDB schema v2 (Dexie), multi-tab guard, `.bodge` round-trip.
- Hotkey registry, ProjectInfoModal, PWA setup.
- Notion-style Toast queue + soft-delete pattern.
- STRINGS namespace dictionary, App version footer.

## Открытые баги

См. `BUGS.md`. **V51** carry-over OPEN (drag selection микролаги, ThinkPad 2013, требует перфо-спринт C-типа). Остальное закрыто в v0.8.3.

## Что дальше

### v0.8.4-alpha follow-ups (партиал + math/bio + cleanup, 28–31.05.2026)

**Открытые после v0.8.4:**
- **V130/V131 — ✅ FIXED 05.06** (live-junction ENGINE слои 1–2: `buildOverlapTail` унифицировал ориентацию V124/V125 + V130 realise-match, коммиты `20d2978`/`4b9e5d5`/`ba423c1`). **Слой 3 шаг 1 ✅ 05.06** (`zone.junctions` + per-junction primer-derive on-add + 3-уровневая модель приоритета — DEC-JUNC-PRIMER-01, promotion candidate). **Дальше — шаг 2** (`JunctionControl` UI из `JunctionPopover` + zone-strip), затем шаги 3–7, PIECE_MODEL, CANVAS_LIVE_PROJECTION, слой 5 (пул) по CURRENT_TASK. **Новые OPEN canvas-UX:** V139–V141 (клик-ромб / зона-drag-resize / панель-обрезка — BUGS, отдельная canvas-сессия).
- **V137** (OPEN, низкий) — смена типа фичи в Annotator плодит новый трек. Не диагностирован, отдельное звено.
- **V120** (ОТЛОЖЕН) — circular ORF wrap: нужен проброс topology через `detectORFs`/`runPredictors` + wrap-координаты. **V121** — SapI cutOffset, мёртвые метаданные. **V122 excise-ветка** — `_exciseTwoEnzymes`/`_exciseSameEnzyme` всё ещё дропают straddling-аннотации (lossy, не corrupting).

**Forward-работа «dark» (построено + тесты, НЕ примонтировано — кандидаты на wiring-спринт, см. BACKLOG):** лабораторный журнал (notebook markdown), `.bodge` v2 export/import, canvas-аффордансы операций (T9 K13/K14), Sanger-праймеры. plasmid-git — **отвалившаяся фича** (была подключена только через мёртвый FragmentEditor; four-tier не перенесла) → возродить/похоронить, см. TECH_DEBT.

### Sprint v0.8.3-alpha — Four-tier architecture (T1-T10 + T4.5 + canvas UX + primer redesign), 16-18.05.2026

10 T-спринтов реализованы Code в continuous mode (T1 → T2 → T3 → T4 → T4.5 → T5 → T6 → T7 → T8 → T9 → T10) + canvas UX батч 17.05 + primer redesign 18.05 + V82-V84 fixes + LibrarySingleInspector декомпозиция. **≈84 sprint-level DEC записаны** в DECISIONS.md (28.05). 3 ⚓ кандидата на promotion в ANCHORS.md: DEC-CANVAS-4T-01 (piece как первичная сущность), DEC-CANVAS-4T-07 (zone как Miro-frame), DEC-CANVAS-4T-31 (3-lane auto-layout). 2 ⚓ реверса: DEC-T3-08 + V61.

**Финализация Chat:**
- **Пачка 1а ✅** — BUGS.md OPEN→FIXED ротация, OPEN секция компактная (V51 only).
- **Пачка 1b ✅** — CURRENT_TASK.md 202 KB scratchpad → 13 KB handoff (архив 202 KB сохранён `docs/archive/CURRENT_TASK_HISTORY_2026_05_16_to_18_T_series.md`).
- **Пачка 1c ✅** — этот файл (PROJECT_STATE.md).
- **Пачка 2 ✅ (28.05; 3 ⚓ кандидата НЕ промоутнуты — отложено до приёмки T-серии):** ANCHORS.md (реверс DEC-T3-08 + V61, добавить 3 ⚓ кандидата) + DECISIONS.md (sprint-block 84 DEC) + TECH_DEBT.md (статусы переизмерены с диска 28.05: LibrarySingleInspector → Closed [уже был], CanvasLayoutView → **DONE** [декомпозирован 14.01 KB, НЕ Active], SequenceView → Active HIGH hard-breached 48.24 KB) + RELEASES.md (v0.8.3-alpha entry) + package.json/version.js bump.
- **Пачка 3 ✅ (выполнена в docs/ ротации 27.05):** устаревшие спеки F1-F4 + A1-A4 + D1 + NOTES_*_DRAFT вынесены из активного docs/ (корень ~50 файлов до 9; archive/ + подпапки). TD-DOCS-ROTATION закрыт в TECH_DEBT 28.05.

### Открытые follow-ups (для решения Игорь+Chat в визуальной приёмке)

1. **Annotator-toggle scope** — распространять `TabBar.showAnnotations/onToggleAnnotator` на Assembly/PCR (сейчас scope = Library/Importer + container-editor)?
2. **LibrarySingleInspector опциональный 2-й extract** — annotation-edit pipeline ~5-7 KB уведёт под soft 30 (31.28 → 24-26 KB). Решение Игоря.
3. **T9 K13/K14 + graph-block badge** — wire trigger-пункты CREATE_DESIGN_VARIANT / MATERIALIZE_REACTION в op context-menu (substance готова, entry-point в 36 KB CanvasLayoutView отложен).
4. **T10 SHOW_SANGER_LAB_NOTEBOOK** — click clone indicator → focus в notebook через event-bus/ref (отложено в визуальную приёмку).
5. **T8 piece.ranges change** — auto-reaction `params.range` recompute при том же методе и изменённом range (сейчас НЕ пересчитывается).
6. **T6 §5.9 vs Открытый-вопрос-#1** — закрепить «assemblyReducer kept живым, no-op в T-future» в DECISIONS.
7. **Orphan-UX в zone-mode** (T6) — piece удаляется вместо badge/convert.
8. **Op/PCR-консьюмеры primer-name** (T5/primer-redesign) — имя из модала не сохраняется по их create-пути.

### Roadmap до v1.0

- `docs/ARCHITECTURE_v2.md` §7 + `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (новый якорь для T-серии).
- Wave 1 backend annotator track (M-X.1..M-X.5) — параллельно.
- M-C Container Window kickoff — после T-серии acceptance.
- M-X.10 Tauri shell — по DEC-ARCH-RUST-WASM-TWIN-TARGET-01 (отложено).
- Архитектура навигации (DAG / Парт-канвас / Container Window) — `docs/ARCHITECTURE_CANVAS_MODEL.md`.

### Параллельно / после T-series acceptance

1. **Этап 2/3 kill** (`docs/SPRINT_KILL_DEAD.md`) — harvest FragmentEditor helpers в `lib/`, снос старого верстака ~402 KB.
2. **R4 + Этап 4 kill** — Library/index.jsx legacy + useLibraryState.js + importer-strings.js.
3. **TD-CANVAS-LAYOUTVIEW-DECOMP** — ✅ DONE (28.05): `CanvasLayoutView.jsx` 41.35 → 14.01 KB, папка `canvas/` декомпозирована на ~40 файлов.
4. **TD-SIZE-SEQUENCEVIEW-INDEX** (48.24 KB — **hard breached**, было «~39 near-hard») — Active HIGH, decomp mandatory-first для спринта, трогающего SequenceView core.
5. **TD-ANNOTATIONTRACK-DECOMPOSE-V2** (48.54 KB hard) — первый sprint трогающий AnnotationTrack.
6. **TD-LIB-K10-CHARACTER-APPLY** — character-level edit в SequenceView через useSequenceKeyboard.js extension.
7. **TD-DOCS-ROTATION** — ✅ DONE: docs/ ротация ~50 файлов до 9 (27.05); формальное закрытие в TECH_DEBT 28.05.
8. **DEC-CONTAINER-DIFF-STORAGE-01** (09.05.2026) — diff-режим в `.bodge` для версий плазмиды.

---

**Snapshot rotation:** при каждой финализации спринта Chat обновляет шапку (версия / тесты / коммиты), «Что работает» (новый функционал в существующие секции), «Что дальше» (актуализация candidate списка). Журнал по версиям ведётся отдельно в `RELEASES.md`. Этот файл ~23 KB на v0.8.3 за счёт large sprint-block (T-серия). Пачка 2 финализирована 28.05 — часть истории (sprint-block T-серии) можно опционально ротировать в `docs/archive/SESSIONS_2026_Q2.md` / `_Q3.md` при следующем росте (квартальная ротация).
