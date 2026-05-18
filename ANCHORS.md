# ANCHORS.md — BodgeGene Architectural Anchors

> **Назначение.** Этот файл содержит все ⚓ фундаментальные решения проекта — те которые определяют архитектуру всего приложения. **Не переезжают в архив.** Не отменяются без явного обсуждения и superseding-записи.
>
> **Что здесь, что в DECISIONS.md, что в archive.**
> - **ANCHORS.md** (этот файл) — ⚓ fundamentals · читается в milestone-сессиях · растёт медленно (только фундаментальные вводы/supersede).
> - **DECISIONS.md** — sprint-level решения без ⚓ (DEC-XX-NN) последних 2 спринтов · читается всегда · ротация старше 2 спринтов → archive.
> - **`docs/archive/DECISIONS_2026_Q2.md`** — исторический архив sprint-level решений.
>
> **Формат записи:** `[ДАТА] **⚓ Решение.** Обоснование.`. Append-only — решения не удаляются, изменения фиксируются новым решением с superseding-ссылкой.
>
> **Структура.** Далее идёт §1 с тематическими блоками fundamentals (state mgmt / биология / рендеринг / UX / данные), дальше §2–§15 — sprint-блоки исторических спринтов с их ⚓ решениями (Map-WS-1 · Sprint X cycle · Annotation-Commits planned · Project-Model FINAL = DEC-V2-01..27 · M-A Wireframe = DEC-DS-01 + DEC-V2-28..30 · M-A.2 = DEC-MA2-01 · M-B Kickoff = DEC-LIB-01..09 + DEC-IMP-01..05 + DEC-REUSE-01 + DEC-LIB-10).
>
> **Общее количество ⚓ fundamental:** **64** (на v0.8.0: 52 предыдущих + DEC-PARSER-COORD-01 от 03.05.2026 + DEC-IMP-06 + DEC-LIB-12..17 от 07.05.2026 — Library as Primary Workspace; +2 после v0.8.0: DEC-SIZE-CALIBRATION-01 от 08.05.2026 — калибровка лимитов размера; DEC-INTEROP-01 от 08.05.2026 — обратная совместимость форматов как first-class concern; **+3 в v0.8.2 (10–11.05.2026): DEC-UIRREV-ACTIVE-SINGLE-01, DEC-UIRREV-ZONES-MERGE-01, DEC-PROJSLICE-ACTIVATE-PURE-01 — promotion из sprint-level после подтверждения реальным workflow M-X.8 / M-X.9**).

---

## Оглавление

> **Навигация по файлу.** Два вида индекса: **эпохи** (по времени) для быстрого «когда было», **домены** (по смыслу) для «правило в этой зоне». Ссылки — на section headings этого файла. По большинству доменов anchor'ы разбросаны по нескольким секциям — даю связку «дата + лейбл + секция» вместо перечисления всех ID.

### По эпохам

| Эпоха | Даты | Основные блоки | ⚓ кол-во |
|-------|------|-------------------|----------|
| **0. Pre-v0.5 baseline** | 25–29 марта 2026 | State mgmt + биология + UX-инварианты + Project Flow + Архитектура v2 baseline | ~16 |
| **1. v0.5 era** | 3 апреля – 28 апреля 2026 | Restriction Cloning, Sanitize contract, Sprint 1 (мутагенез), Sprint 1.7 (topology), Map-WS-1, размеры модулей, Sprint X (Plasmid-Git), Sprint App-Decomp, kickoff-интервью и prototype-first, Annotation-Commits planned | ~25 |
| **2. v0.6 wipe & ARCHITECTURE_v2** | 29 апреля 2026 | DEC-V2-01..27 — контейнер = молекулярная единица, ProjectCommit hyperedge, Origin vs Provenance, .bodge, persistence, multi-tab, sync, cross-project import | 27 |
| **3. M-A series** | 30 апреля – 1 мая 2026 | Start screen design (DEC-DS-01 + DEC-V2-28..30), M-A FINAL (sprint-level DEC-MA-01..04), M-A.1 polish (DEC-MA1-01..04), M-A.2 i18n (DEC-MA2-01 ⚓) | 8 |
| **4. M-B series** | 1 мая – 2 мая 2026 | M-B Kickoff (Library = personal collection, DEC-LIB-01..10 + DEC-IMP-01..05 + DEC-REUSE-01), v0.6.4 → v0.7.0 (DEC-IMP-15 lazy-mount, DEC-DS-02 palette A+v2 + shade, DEC-CAT-04 folder-as-slash) | 18 |
| **5. M-X.5 Library = primary** | 3 мая – 7 мая 2026 | DEC-PARSER-COORD-01 (0-based exclusive end), DEC-IMP-06 (Importer fullscreen abolished), DEC-LIB-12..17 (manual edit branching, save flow, edit parity, import targets, read-only default, onboarding nudge) | 8 |
| **6. Process calibration** | 8 мая 2026 | DEC-SIZE-CALIBRATION-01 — cliff → review-point + rate-of-change/entanglement triggers | 1 |
| **7. Interoperability** | 8 мая 2026 | DEC-INTEROP-01 — `.bodge` / `.bodgebox` как valid GenBank + plain JSON, никаких proprietary fields | 1 |

| **8. v0.8.2 promotion** | 10–11 мая 2026 | UI revision + project hub + sequence search promotion: «один activeProject» + «зон 2» + side-effect-free actions — всё подтверждено реальным workflow | 3 |

**Быстрый переход:**
- [v0.8.2 UI rev + project hub](#sprint-v082--ui-revision--project-hub--store-actions-purification-1011052026)
- [Pre-v0.5 baseline](#1-фундаментальные-решения----не-переезжают-в-архив) · [v0.5 era — Map-WS-1](#sprint-map-ws-1-cycle--plasmidworkspace--sync-cursor--feature-palette-21042026) · [v0.5 era — размеры](#архитектурная-гигиена-22042026) · [v0.5 era — процесс](#процесс--chat--code-координация-23042026) · [v0.5 era — Plasmid-Git](#sprint-x-cycle--plasmid-git-data-model--corrected-undo-timing-2426042026)
- [v0.6 ARCHITECTURE_v2](#sprint-project-model-final--architecture_v2md-29042026) · [M-A](#sprint-m-a-final--стартовый-экран--persistence--hotkey-infra--projectinfomodal-30042026) · [M-A.1](#sprint-m-a1-final--polish-pwa--notion-style-toast--soft-delete-01052026) · [M-A.2](#sprint-m-a2-final--i18n-prep-ui-strings--english-01052026) · [M-B](#sprint-m-b-kickoff-formalization--library-re-definition--importer-scope-01052026-третья-сессия) · [v0.7.0](#sprint-m-b-final--importer-rework--post-acceptance-polish--catalog-tree-rewrite-02052026-v064--v070)
- [v0.8.0 Library = primary](#library-as-primary-workspace-m-x5-v080) · [Calibration](#архитектурная-гигиена-calibration-08052026)

### По доменам

#### A. Технологии и state management
- Zustand v5 + Immer + React Compiler + Manual undo (28.03.2026) → [§1 State management / технологии](#state-management--технологии)
- pushUndo синхронный snapshot capture (26.04.2026) → [Sprint X cycle](#sprint-x-cycle--plasmid-git-data-model--corrected-undo-timing-2426042026)
- UI/modal читают store через useStore.getState() (28.04.2026) → [Sprint App-Decomp](#sprint-app-decomp--modalstack--useappeffects-extract-28042026)

#### B. Биологические алгоритмы
- SantaLucia Tm + Golden Gate + KLD + Assembly strategy (25–28.03.2026) → [§1 Биологические алгоритмы](#биологические-алгоритмы)
- Restriction Cloning: digest() / autoAdjustJunctions guard / N+N+ligation (03.04.2026) → [Restriction Cloning](#restriction-cloning-блок-4b-03042026)
- Sprint 1 мутагенез: resetJunctionForType / computeMutagenesisStrategy / overlapSequence / no-PCR guard / chooseStrategy fragmentContext (19–20.04.2026) → [Sprint 1](#sprint-1--мутагенез-192004-2026)
- Sprint 1.7 topology: fragment.topology + expectedJunctionCount + тесты соразмерны коду (22.04.2026) → [Sprint 1.7](#sprint-17--unified-editor--virtual-full-sequence--topology-22042026)
- Plasmid-Git data model (baseSnapshot + commits[] + replay) (26.04.2026) → [Sprint X cycle](#sprint-x-cycle--plasmid-git-data-model--corrected-undo-timing-2426042026)
- Annotation-Commits (planned, 27.04.2026): annotations as first-class commits + parentPos baseline-coords + sanity-warning policy → [Sprint Annotation-Commits](#sprint-annotation-commits-planned--plasmid-git-расширение-на-аннотации-27042026)

#### C. Рендеринг и каноны последовательности
- Character grid + 4 view modes (27–29.03.2026) → [§1 Рендеринг последовательности](#рендеринг-последовательности)
- Circular Map: mapFragments = [{whole plasmid}] (03.04.2026) → [Circular Map](#circular-map)
- Map-WS-1 cycle: getRegions id contract + feature-palette + responsive charsPerLine (21.04.2026) → [Sprint Map-WS-1](#sprint-map-ws-1-cycle--plasmidworkspace--sync-cursor--feature-palette-21042026)
- Feature palette A+v2 + shade-by-canonical-key (DEC-DS-02, 02.05.2026) → [Sprint M-B FINAL](#sprint-m-b-final--importer-rework--post-acceptance-polish--catalog-tree-rewrite-02052026-v064--v070)
- Lazy-mount heavy tab content (DEC-IMP-15, 02.05.2026) → [Sprint M-B FINAL](#sprint-m-b-final--importer-rework--post-acceptance-polish--catalog-tree-rewrite-02052026-v064--v070)

#### D. UX-инварианты и навигация
- 2 типа объектов + 3 режима + Okabe-Ito (25–29.03.2026) → [§1 UX-инварианты](#ux-инварианты)
- Stack-навигация «← Назад» (DEC-V2-09, 29.04.2026) → [Immutable принципы DEC-V2-01..12](#immutable-принципы-dec-v2-0112-architecture_v2-1)
- Start screen вариант B + amber accent (DEC-DS-01, 30.04.2026) → [Sprint M-A Wireframe](#sprint-m-a-wireframe-selection--start-screen-design-30042026)
- Theme toggle в header / ProjectInfoModal центральный / auto-open после createProject / tag suggestions (DEC-MA-01..04, 30.04.2026) → [Sprint M-A FINAL](#sprint-m-a-final--стартовый-экран--persistence--hotkey-infra--projectinfomodal-30042026)
- Notion-style Toast queue + soft-delete (DEC-MA1-01..04, 01.05.2026) → [Sprint M-A.1 FINAL](#sprint-m-a1-final--polish-pwa--notion-style-toast--soft-delete-01052026)
- Bilingual policy: english code / russian docs (DEC-MA2-01, 01.05.2026) → [Sprint M-A.2 FINAL](#sprint-m-a2-final--i18n-prep-ui-strings--english-01052026)
- Read-only по умолчанию + Onboarding nudge (DEC-LIB-16, DEC-LIB-17, 07.05.2026) → [Library as Primary Workspace](#library-as-primary-workspace-m-x5-v080)

#### E. Data model — entities и операции
- 3-level annotations (region > detail > point) + part versioning (29.03.2026) → [§1 Данные и аннотации](#данные-и-аннотации)
- Plasmid-Git: baseSnapshot + commits[] + HEAD + replay (26.04.2026) → [Sprint X cycle](#sprint-x-cycle--plasmid-git-data-model--corrected-undo-timing-2426042026)
- Project = root, Container = молекулярная единица (DEC-V2-01..03, 29.04.2026) → [Immutable принципы DEC-V2-01..12](#immutable-принципы-dec-v2-0112-architecture_v2-1)
- ProjectCommit hyperedge (N→M) + ContainerCommit ≠ ProjectCommit (DEC-V2-13..14, 29.04.2026) → [Data model DEC-V2-13..18](#data-model-dec-v2-1318-architecture_v2-2)
- Origin (immutable) vs Provenance (mutable) (DEC-V2-16, 29.04.2026) → [Data model DEC-V2-13..18](#data-model-dec-v2-1318-architecture_v2-2)
- `.bodge` ZIP формат (DEC-V2-07 + DEC-V2-18, 29.04.2026) → [Immutable принципы](#immutable-принципы-dec-v2-0112-architecture_v2-1) + [Data model](#data-model-dec-v2-1318-architecture_v2-2)
- DAG-as-primary-view (DEC-V2-06, 29.04.2026) → [Immutable принципы](#immutable-принципы-dec-v2-0112-architecture_v2-1)
- Cross-project import через fullscreen modal + readOnly DagView (DEC-V2-27, 29.04.2026) → [Cross-project import](#cross-project-import-dec-v2-27-architecture_v2-24--library-3)
- Group projects = мультитим в одном .bodge + Project.tags (DEC-V2-29..30, 30.04.2026) → [Sprint M-A Wireframe](#sprint-m-a-wireframe-selection--start-screen-design-30042026)
- Либрари dual-context (DEC-V2-28, 30.04.2026) → [Sprint M-A Wireframe](#sprint-m-a-wireframe-selection--start-screen-design-30042026)

#### F. Data model — координаты и парсеры
- DEC-PARSER-COORD-01: 0-based exclusive end end-to-end (03.05.2026) → [§1 Данные и аннотации](#данные-и-аннотации)
- Sanitize-at-entry contract + IUPAC канонический порядок (18.04.2026) → [Sanitize contract](#sanitize-contract-этап-11-18042026)
- normalizeGeneType (gene-семантика из qualifiers) + oriT ≠ rep_origin (18.04.2026) → [Import-annotations](#import-annotations-этап-12-18042026)
- getRegions id-backfill contract (21.04.2026) → [Sprint Map-WS-1](#sprint-map-ws-1-cycle--plasmidworkspace--sync-cursor--feature-palette-21042026)
- extractItemName приоритет имен Part'а + addFragmentDirect vs addFragment (27.04.2026) → [Sprint Import-Start-Screen fix](#sprint-import-start-screen--fix-цикл-27042026)

#### G. Persistence + lifecycle + multi-tab
- Dexie IndexedDB схема v1 (DEC-V2-22, 29.04.2026) → [Persistence + Lifecycle](#persistence--lifecycle--multi-tab-dec-v2-2226-architecture_v2-4--56)
- Двухуровневый lifecycle: IndexedDB autosave + .bodge explicit save (DEC-V2-23, 29.04.2026) → [Persistence + Lifecycle](#persistence--lifecycle--multi-tab-dec-v2-2226-architecture_v2-4--56)
- Multi-tab блокируется через navigator.locks (DEC-V2-24, 29.04.2026) → [Persistence + Lifecycle](#persistence--lifecycle--multi-tab-dec-v2-2226-architecture_v2-4--56)
- Conflict detection через lastModified (DEC-V2-25, 29.04.2026) → [Persistence + Lifecycle](#persistence--lifecycle--multi-tab-dec-v2-2226-architecture_v2-4--56)
- GenBank export с structured COMMENT-block для provenance (DEC-V2-26, 29.04.2026) → [Persistence + Lifecycle](#persistence--lifecycle--multi-tab-dec-v2-2226-architecture_v2-4--56)

#### H. Distribution + identity + sync
- Hosted web app + open-source self-host + PWA (DEC-V2-19, 29.04.2026) → [Distribution / Identity / Sync](#distribution--identity--sync-dec-v2-1921-architecture_v2-5)
- Identity = label, не account (DEC-V2-11, DEC-V2-20, 29.04.2026) → [Immutable принципы](#immutable-принципы-dec-v2-0112-architecture_v2-1)
- Sync через файл/cloud-folder/Drive API (3 уровня, DEC-V2-12, DEC-V2-21, 29.04.2026) → [Distribution / Identity / Sync](#distribution--identity--sync-dec-v2-1921-architecture_v2-5)

#### I. Library + Importer + Workflow
- Library = личная коллекция flat tagging (DEC-LIB-01..10, 01.05.2026) → [Sprint M-B Kickoff Formalization](#sprint-m-b-kickoff-formalization--library-re-definition--importer-scope-01052026-третья-сессия)
- Importer = точка входа внешних данных (DEC-IMP-01..05, 01.05.2026) → [Sprint M-B Kickoff Formalization](#sprint-m-b-kickoff-formalization--library-re-definition--importer-scope-01052026-третья-сессия)
- v0.5 visualization first-class reuse (DEC-REUSE-01, 01.05.2026) → [Sprint M-B Kickoff Formalization](#sprint-m-b-kickoff-formalization--library-re-definition--importer-scope-01052026-третья-сессия)
- v0.7.0 catalog tree rewrite — folder-as-slash-path (DEC-CAT-04, 02.05.2026) → [Sprint M-B FINAL](#sprint-m-b-final--importer-rework--post-acceptance-polish--catalog-tree-rewrite-02052026-v064--v070)
- v0.8.0 Library = primary workspace — Importer fullscreen abolished (DEC-IMP-06, 07.05.2026) → [Library as Primary Workspace](#library-as-primary-workspace-m-x5-v080)
- Manual edit branching (DEC-LIB-12, 07.05.2026) → [Library as Primary Workspace](#library-as-primary-workspace-m-x5-v080)
- Annotations save flow: Перезаписать / Сохранить как версию (DEC-LIB-13, 07.05.2026) → [Library as Primary Workspace](#library-as-primary-workspace-m-x5-v080)
- Edit parity SequenceView ↔ Annotator через single dispatcher (DEC-LIB-14, 07.05.2026) → [Library as Primary Workspace](#library-as-primary-workspace-m-x5-v080)
- Import targets: Library only / Library + project (DEC-LIB-15, 07.05.2026) → [Library as Primary Workspace](#library-as-primary-workspace-m-x5-v080)

#### J. Процесс и архитектурная гигиена
- Размер модулей: hard 40/25 KB + soft 30/20 KB (22.04.2026) → [Архитектурная гигиена 22.04](#архитектурная-гигиена-22042026)
- Декомпозиция закрывает hard в одном спринте (23.04.2026) → [Архитектурная гигиена 22.04](#архитектурная-гигиена-22042026)
- DEC-SIZE-CALIBRATION-01: cliff → review-point + rate-of-change/entanglement/stable-file exemption (08.05.2026) → [Архитектурная гигиена calibration](#архитектурная-гигиена-calibration-08052026)
- Kickoff-интервью перед спекой + зона записи .claude/skills/ + Prototype-first (23.04.2026) → [Процесс Chat ↔ Code](#процесс--chat--code-координация-23042026)
- Тесты side-effect функций проверяют observable state (26.04.2026) → [Sprint X cycle](#sprint-x-cycle--plasmid-git-data-model--corrected-undo-timing-2426042026)
- Bilingual policy: english code / russian docs (DEC-MA2-01, 01.05.2026) → [Sprint M-A.2 FINAL](#sprint-m-a2-final--i18n-prep-ui-strings--english-01052026)

#### K. Project Flow / DAG
- @xyflow/react + Construct/Project Flow + projectFlowSlice + Неошизомеры (31.03.2026) → [Project Flow](#project-flow)
- Архитектура v2: «Составной блок» + Протокол 4 статуса + validateJunctionEnds + Мерж аннотаций (31.03.2026) → [Архитектура v2 — утверждено](#архитектура-v2--утверждено-31032026)

---

## §1. Фундаментальные решения (⚓) — не переезжают в архив

### State management / технологии

[2026-03-28] **⚓ Zustand v5 вместо useState/Context.** App.jsx был монолитом 1350 строк с 40+ useState. Zustand: granular selectors (shallow equality), middleware (persist, devtools, immer), тестируемость вне React. 5 domain slices: project, fragment, junction, primer, ui.

[2026-03-28] **⚓ React Compiler v1.0 вместо ручного useMemo/useCallback.**

[2026-03-28] **⚓ Immer middleware для иммутабельных обновлений.**

[2026-03-28] **⚓ Manual undo/redo вместо zundo.** Debounce 300ms, max 50 уровней.

### Биологические алгоритмы

[2026-03-28] **⚓ SantaLucia 1998 NN Tm.** ΔH/ΔS, Owczarzy 2008 Mg²+ коррекция → ±1-2°C.

[2026-03-26] **⚓ Golden Gate: 5 ферментов, 32 orthogonal overhangs.**

[2026-03-26] **⚓ KLD мутагенез по протоколу NEB #M0554.**

[2026-03-25] **⚓ Assembly strategy: Auto / All-at-once / 3 parts / 2 parts.**

### Рендеринг последовательности

[2026-03-29] **⚓ Character grid (ch units) для всех sequence views.**

[2026-03-27] **⚓ 4 вида canvas: Blocks (Ctrl+1) / Sequence (Ctrl+2) / Map (Ctrl+3) / Racetrack (Ctrl+4).**

### UX-инварианты

[2026-03-29] **⚓ Два типа объектов: Плазмиды и Запчасти.** Плазмида = circular + ≥2 regions.

[2026-03-29] **⚓ Три режима: Canvas, PlasmidViewer, PlasmidUseWizard.**

[2026-03-25] **⚓ Okabe-Ito color system.**

### Данные и аннотации

[2026-03-29] **⚓ Аннотации трёхуровневые: region > detail > point.**

[2026-03-26] **⚓ Part versioning: parent/child с derivation types.**

[2026-05-03] **⚓ DEC-PARSER-COORD-01 — 0-based exclusive end конвенция end-to-end.** SnapGene .dna XML хранит 1-based inclusive; парсер обязан конвертировать в 0-based exclusive end в точке входа (`xml_start - 1`, `xml_end` остаётся как-есть и становится exclusive). Дальше по пайплайну (`pvcs/parser.py` → API JSON → frontend) координаты **не трогаются**, никакого двойного `+1` / `-1`. Инварианты: `length = end - start`; для CDS region `(end - start) % 3 === 0`; AA-translation всегда работает в frame `0` от start (forward) или frame `(seqLen − end) % 3` без дополнительных смещений (reverse). **Никакой код после парсера не переобрабатывает координаты** — это ловушка V50 (каскадный off-by-1, FIXED 03.05.2026 PRE-K1). Распространяется на все future parsers (GenBank, FASTA с features, custom). При любом новом парсере — unit test всегда проверяет `(cds.end - cds.start) % 3 === 0` на reference test fixture. **Это fundamental** — нарушение ломает frame, AA-translation, primer design (Tm расчёт по смещённым секвенсам), restriction site detection (окрестность сайта), Plasmid-Git commits (позиции мутаций).

### Library as Primary Workspace (M-X.5, v0.8.0)

[2026-05-07] **⚓ DEC-IMP-06 — Importer fullscreen abolished, Library = primary workspace.** Supersedes DEC-IMP-01..05 (which had Importer as separate fullscreen with Library as flat collection downstream). Биолог feedback 06.05.2026: «Импортер как отдельная сущность раздражает. SnapGene catalog отдельно от моей Library — путаница. Единые законы для всего.» Library теперь — единственная точка входа для external sequence data: drag-drop / paste / file picker / catalog click — все идут через Library workspace. Импорт = появление в Library; открытие плазмиды = LibrarySingleInspector; batch-mode = только при многофайловом drop через MultiImportView; SnapGene catalog растворяется в общий Library tree через onboarding (DEC-LIB-17). **Реализация:** v0.7.5 namespace rename (Importer/ → Library/), v0.8.0 features (K4-K11). Carry-over: 'importer' literal остаётся valid alias для 'library' route (backward-compat callsites flip → M-X.6 cleanup TD-LIB-K2-DEAD-CODE-PURGE).

[2026-05-07] **⚓ DEC-LIB-12 — Sequence in library entry mutable through manual-edit branching.** Supersedes DEC-LIB-05 (which had sequence frozen после первой загрузки, mutable только через library_clone в проект). Биолог: «manual edit sequence — это новая ветка», не overwrite parent. Любая character-level правка sequence создаёт новую entry с `origin: { kind: 'manual_edit', parentEntryId, parentEntryHash, editedAt }` + `manualEditFlag: true`. Original entry **не изменяется**. Per-LibrarySingleInspector mount confirm scope (Q3): switching plasmid resets the latch. Q5 plan guard: parent.pendingDelete → hard-fail. Implementation: `librarySlice.createManualEditBranch` + `useManualEditDetection` hook + `ManualEditConfirmModal`. Caveat (M-X.6): character-level apply в SequenceView требует useSequenceKeyboard.js extension — сейчас branch создан с identical sequence to parent, biolog mutates annotations on the copy.

[2026-05-07] **⚓ DEC-LIB-13 — Annotations mutable through explicit save flow only.** Extends DEC-LIB-06 (library_clone reference в проект остаётся как было). Library entries раньше были frozen (DEC-LIB-11 v0.7.2 candidate) — now mutable через явный пользовательский «commit point»: `Перезаписать` (overwriteLibraryEntryAnnotations с version bump) либо `Сохранить как версию` (saveLibraryEntryAsVersion с parent reference + copy-on-write). Hybrid persistence model (DEC-LIB-WRITE-THROUGH-HYBRID-01): silent write-through safety-net coexists с explicit save buttons — refresh страницы не теряет правки, но biolog имеет visible commit point с version bump. Q5 plan guard: parent.pendingDelete → hard-fail. Q4 plan: default version name `${parent.name} (v2)` через existing `getSuggestedLibraryName` autoname collision.

[2026-05-07] **⚓ DEC-LIB-14 — Edit parity SequenceView ↔ Annotator через single dispatcher.** Любая annotation edit использует один dispatcher `applyAnnotationEdit` через `onUpdateEdits` callback. Annotator embedded в AnnotationsTab и SequenceView в Sequence tab прокидывают одни и те же handlers. Two mode-specific edit paths запрещены — round-18 ghost-edit fix (07.05.2026) подтвердил value pattern'а: single-dispatcher with `existsConfirmed` precondition handles все cases (ghost CREATE conversion, regular UPDATE, DELETE).

[2026-05-07] **⚓ DEC-LIB-15 — Import targets: Library only / Library + project.** Третий вариант (только в проект, не в Library) **не существует**. Каждая плазмида проходит через Library — это место canonical хранения. Если biolog работает в проекте + хочет добавить плазмиду — drop / paste / catalog click → entry в Library + автоматически в `currentProject.containerIds` (если target = project). Quick-add icon (DEC-LIB-K8-QUICKADD-01) переносит existing Library entry в активный проект без duplicate creation.

[2026-05-07] **⚓ DEC-LIB-16 — Read-only по умолчанию для sequence editing.** SequenceView рендерится в read-only режиме когда entry открыт в LibrarySingleInspector. Биолог явно жмёт READ-ONLY pill в title row → переключается в EDITABLE → может вводить characters. Защита от случайных правок (DEC-LIB-12 manual-edit branch создаётся только при характерах в sequence). Annotation editing (drag handles, rename, FeatureEditorModal) **доступен в обоих режимах** — это не sequence editing, это metadata.

[2026-05-07] **⚓ DEC-LIB-17 — Onboarding through nudge, not modal.** При первом запуске (либо когда Library пустая) — Library открывается с inline nudge banner «Добавить базовые плазмиды по категориям». Banner неинтрузивный, биолог может игнорить и сразу drag-drop'нуть свой файл. Modal-blocking onboarding **запрещён**. Click → CategoryPickerModal с curated 7 категориями (Q1 plan: hybrid catalog — selected categories materialise в IndexedDB; other 12 categories accessible через future «Browse all demo» mode).

### Circular Map

[2026-04-03] **⚓ PlasmidViewer/Wizard: mapFragments = [{whole plasmid}], не массив регионов.** Регионы плазмиды перекрываются (nested CDS, gene внутри operon). При передаче массивом offset > totalBp, арки уходят за 360°. Решение: всегда одна плазмида; PlasmidMap рисует sub-arcs по annotations с assignSubTracks() (max 4 tracks).

### Project Flow

[2026-03-31] **⚓ @xyflow/react (React Flow v12) для Project Flow DAG.**

[2026-03-31] **⚓ Два уровня: Construct View (Ctrl+1-4) + Project Flow (Ctrl+5).**

[2026-03-31] **⚓ projectFlowSlice — 6-й slice.** Не в SNAPSHOT_KEYS (undo только construct).

[2026-03-31] **⚓ Neoschizomers: строгая терминология.** Убраны 18 ложных, добавлены настоящие (SacI↔Eco53kI, DpnI↔DpnII/MboI).

### Архитектура v2 — утверждено 31.03.2026

[2026-03-31] **⚓ «Составной блок» — видно из чего склеен.** subFragments[], assemblyMethod, protocol status. Цветная полоска + имена.

[2026-03-31] **⚓ Привязка к протоколу: 4 статуса.** complete / in_progress / planned / manual.

[2026-03-31] **⚓ validateJunctionEnds() ПЕРЕД расчётом праймеров.** Overlap/RE/GG pre-flight checks.

[2026-03-31] **⚓ Мерж аннотаций при склейке.** Offset по фрагментам, sourceFragment для трейсабильности.

### Restriction Cloning (Блок 4b, 03.04.2026)

[2026-04-03] **⚓ digest() — чистая функция без side effects.** sequence + annotations + enzyme(s) → backbone + excised + ends. Три режима: linearize (1 site), excise same enzyme (2 sites), excise two enzymes.

[2026-04-03] **⚓ autoAdjustJunctions() не трогает ligation junctions.** Guard: `if (j.type === 'ligation' || j.type === 're_ligation') return;`. Предотвращает переключение ligation → overlap при авто-подстройке.

[2026-04-03] **⚓ N+N + ligation = valid.** Два фрагмента без ПЦР + ligation junction — стандартная операция digest+ligate. Warning «overlap невозможен» проверяет `junc.type === 'overlap'`.

### Sanitize contract (Этап 1.1, 18.04.2026)

[2026-04-18] **⚓ sanitize-at-entry как архитектурный контракт.** `sanitizeSequence()` вызывается один раз при входе данных (paste, file import, API response), далее в кодобазе данные считаются чистыми. Inline workarounds из `local-primer-design.js` и `PlasmidViewer.jsx` удалены. Trade-off: новая точка входа без sanitize — тесты не поймают; защита через code review + чеклист в CLAUDE.md.

[2026-04-18] **⚓ Канонический IUPAC-порядок: `ATGCNRYSWKMBDHV`.** Все regex приведены через `sanitizeSequence()` в `sequence-utils.js`. `IUPAC_DNA_REGEX` и `IUPAC_DNA_CHAR_REGEX` экспортируются как anti-drift механизм (синхронизация курсора в AddFragmentModal).

### Import-annotations (Этап 1.2, 18.04.2026)

[2026-04-18] **⚓ `normalizeGeneType(feat)` — gene-семантика из qualifiers, не из type.** `gene` не в TYPE_MAP; `normalizeType(type, feat)` делегирует `normalizeGeneType`, читающую `/ncRNA_class` → `ncRNA`, `/product` matches → `tRNA`/`rRNA`, иначе → `gene`. Free-text `/note` эвристики отвергнуты как источник регрессий.

[2026-04-18] **⚓ `oriT` ≠ `rep_origin`.** Биологически разные (конъюгация vs репликация). Собственный region-тип, цвет `#7C3AED`.

### Sprint 1 — мутагенез (19–20.04.2026)

[2026-04-20] **⚓ `resetJunctionForType(j, newType)` как единый источник сброса junction-state.** Любая смена типа стыка (ligation↔GG↔KLD↔overlap) должна чистить enzyme/overhang поля предыдущего типа. 7 call-sites ходят через helper. Сохраняются: id + overlap-геометрия. GG default = `BsaI`, ligation/re_ligation mirror reEnzyme→enzyme.

[2026-04-20] **⚓ Единый источник правды мутагенеза — `computeMutagenesisStrategy`.** Оба UX-пути (Wizard + FragmentEditor in-place) ходят через одну функцию выбора стратегии (KLD для 1 мутации или 2 близких; two_fragment для 2 далёких; multi_fragment для 3+). Раньше in-place путь использовал упрощённый `designInlineKLDPrimers` — сломанная стратегия для любого числа мутаций.

[2026-04-20] **⚓ `junction.overlapSequence` — расширение контракта `local-primer-design.js`.** В split-mode ветке `overlapTail`: если `j.overlapSequence` задана — тейл берётся из неё (первая половина → RC → fwd-тейл; вторая половина → rev-тейл). Если не задана — существующая логика без изменений (регрессия-тест). Применимо не только к мутагенезу — любой случай, где overlap нужно задать явно.

[2026-04-20] **⚓ No-PCR guard для two/multi_fragment мутагенеза.** `needsAmplification === false` + two/multi split → блокировка + apiWarning. Биологически: нельзя ПЦР'ить кусками то, что само по себе не амплифицируется. KLD на No-PCR-фрагменте разрешён (обратная ПЦР всей плазмиды валидна для любой ДНК-матрицы).

[2026-04-20] **⚓ `chooseStrategy` принимает `fragmentContext`** (V14). KLD возможен ТОЛЬКО при `topology === 'circular' && isStandalone === true`. Линейные фрагменты и фрагменты в составе сборки всегда идут через two/multi_fragment overlap PCR. Биологическое требование KLD-реакции (нужна матрица для back-to-back линеаризации + backbone для лигирования концов).

### Sprint 1.7 — Unified Editor + Virtual Full Sequence + Topology (22.04.2026)

[2026-04-22] **⚓ `fragment.topology` как persisted per-fragment поле (`linear` \| `circular`).** Ранее topology была атрибутом всей сборки (circular-flag на project), что ломало смешанные сценарии (линейный insert в circular backbone). Теперь каждый фрагмент несёт собственную topology; split-группа → все sub'ы `linear`; single-fragment circular → self-closure через overhang-tails. Data-model инвариант, влияет на junction-расчёт, primer design, assembly semantics.

[2026-04-22] **⚓ `expectedJunctionCount(fragments)` как source of truth для junction-валидации.** Контракт: single-circular = 0 (self-closure без отдельного junction-объекта; реальное замыкание через +30 bp tails на PCR-праймерах), N linear = N−1, N circular = N (включая замыкающий). Любой UI-рендер стыков и любой invariant-check в assembly ходят через эту функцию. Нарушение → регрессия V17 (decorative junction у single-linear).

[2026-04-22] **⚓ Тесты соразмерны коду, а не наращиваются ради галочки.** TDD-first для биологических алгоритмов (mutagenesis strategy, primer design, Tm/GC, split helpers), state slices (reducers, migrations) и data-model инвариантов. Для UX-компонентов (рендеры, тулбары, модалки) — happy path + 1–2 edge case, не больше. Ориентир: рост код/тесты 1:1 — допустим, 1:2+ — сигнал пересмотра объёма спринта. Наблюдение по ходу приёмки Sprint 1.7: +38 Vitest на 4 коммита воспринимается как избыточный темп. Целевой коридор на следующих спринтах средней сложности — ≤20 новых тестов.

---

## Sprint Map-WS-1 cycle — PlasmidWorkspace + sync cursor + feature palette (21.04.2026)

[2026-04-21] **⚓ `getRegions(annotations)` — read-path id contract.** Функция в `annotation-model.js` гарантирует, что все возвращённые region'ы имеют `id`. Если у исходной annotation id отсутствует (типично: whole-plasmid catalog импорт через Plasmid Use Wizard, старые `.bodgegene` проекты) — backfill детерминистическим форматом `region:${start}:${end}:${type || 'unknown'}:${name || ''}`. Функция не мутирует исходный объект (spread `...a`, новый object), id stable между рендерами (pure function from invariant fields). **Upstream id-generation в импортере (`snapgene_parser.py`, `auto-annotate.js`, GenBank parser) отложена до v1.0** из-за backward-compat с сохранёнными `.bodgegene` проектами пользователя — read-path normalize закрывает и future imports, и legacy storage в одном месте. Любой consumer region'ов (PlasmidMap `rawSubs`, SequencePane `handleNucleotideClick`, PlasmidWorkspace `regionsByFragment`, PlasmidViewer region-select) обязан ходить через `getRegions`, не через рукописный `filter(a.level === 'region')` — иначе id-инвариант ломается. Корень выявленный при приёмке Map-WS-1-fix: catalog плазмида «Сборка 7» (pDHG25-family, 6107 bp, импорт через «use whole») давала все regions без id → `sub.id = undefined` в PlasmidMap → forward и back sync ломались одновременно.

[2026-04-21] **⚓ `feature-palette.js` — данный контракт цветов biological-feature семейств.** 15 базовых типов (CDS/resistance/reporter/his/tag/linker, promoter, terminator, origin/ori, primer_bind, restriction_site, misc_feature, gene, repeat_region, polyA_signal, intron, signal_peptide, source) + misc fallback, все pastel (частично hue-based по SBOL-традиции). Единственный stroke-цвет `FEATURE_STROKE = '#3A2F1F'` (warm-dark-brown) для label text, direction-arrow markers, highlight-ring на selected-arc. `featureColor(type, name?)` — normalizer с CDS→refine-by-name (AmpR→resistance, GFP→reporter, 6xHis→his, FLAG→tag, linker→linker), GenBank-alias mapping. **Контракт:** все UI-компоненты, которые рисуют region-цвета, должны ходить через `featureColor` — не через собственные `ANNOTATION_COLORS` / `FEATURE_COLORS` словари. Текущие consumers: PlasmidMap sub-arc, SequencePane region backgrounds. Планируемые consumers (Sprint UX-1): PartBlock, AnnotationEditor, PlasmidViewer, SequenceMapView, `theme.js`.

[2026-04-21] **⚓ Responsive `charsPerLine` в SequencePane, GenBank-habit-compat clamp.** `ResizeObserver` на containerRef пересчитывает `charsPerLine` из `offsetWidth / CHAR_PX` (7.3 для JetBrains Mono 11px), clamp `[60, 120]`, snap до кратности 10. 80 — биологический default (GenBank печатные отчёты), остальные кратные 10 читаются без обучения. Выше 120 — строка слишком длинная для глаза, ниже 60 — тесно для AA-стрипа. Runtime `typeof ResizeObserver === 'undefined'` fallback сохраняет 80 в браузерах без RO. UX-паттерн — не ⚓: может пересматриваться при расширении clamp'а (жалоба на 4K пустоту → max 160).

---

### Архитектурная гигиена (22.04.2026)

[2026-04-22] **⚓ Лимит размера модулей.** Принято после Sprint 1.7 (FragmentEditor вырос с 62 до 70 KB за один спринт, чтение целиком в одну Chat-сессию невозможно).

- **`.jsx` компонент:** soft warning 30 KB, hard лимит **40 KB** (обязательная декомпозиция в текущем или ближайшем спринте).
- **`.js` helper / algorithm:** soft warning 20 KB, hard лимит **25 KB**.
- **Data-файлы** (словари, константы, локали — `restriction-db.js`, `i18n.js`, `tags-db.js`, `part-descriptions.js`) — не лимитируются. Дробление по алфавиту бессмысленно.

**Enforcement:**
- Chat при написании спеки читает размер затрагиваемых модулей (`list_directory_with_sizes`). Если цель правки — модуль ≥ hard, первым пунктом спеки идёт декомпозиция, не новая функциональность (см. CHAT_PLAYBOOK.md §2).
- Code после реализации спринта сообщает в отчёте: (а) файлы, переросшие hard за этот спринт (новые нарушители); (б) файлы, выросшие >5 KB за спринт (warning signal) (см. CLAUDE.md §7).

**Текущие нарушители (снимок 22.04.2026):** `FragmentEditor.jsx` 70 KB, `App.jsx` 39 KB, `PlasmidUseWizard.jsx` 39 KB, `DesignCanvas.jsx` 38 KB, `AddFragmentModal.jsx` 35 KB (красная зона). `PlasmidMap.jsx` 33 KB, `PartsPalette.jsx` 31 KB, `JunctionBlock.jsx` 29 KB, `ProtocolTracker.jsx` 28 KB, `PartBlock.jsx` 26 KB (граничная зона, контроль). Плановая декомпозиция красной зоны — Sprint 3 «Decomposition» сразу после V7 InsertionClock.

[2026-04-23] **⚓ Декомпозиция: если core-файл после всех явных выносов прогнозируется > hard-лимита, обязательный дополнительный шаг (split panels / extract state-hook) идёт в ту же спеку, а не откладывается в следующий спринт.** Принято после Sprint 2a: спека разделила `FragmentEditor.jsx` (72 KB) на 8 модулей, 7 вынесено в явные файлы (suma 30 KB), но Chat математику прикинул «на глаз» и §3 явно отложил K10 collapsible panels (~280 строк JSX) и state-hook как **OUT**. Результат — `FragmentEditor/index.jsx` вышел 46 KB, над hard-лимитом 40 KB (⚓ 22.04.2026). Пришлось заводить Sprint 2a.1 (один дополнительный коммит, EditorPanels.jsx) как «хвост» Sprint 2a — неочевидный для пользователя шаг, который должен был быть пунктом исходной спеки.

**Правило для Chat при написании декомпозиционной спеки:** после инвентаризации блоков (строки, блоки JSX) суммировать вес оставляемого в core-файле. Если прогноз core ≥ hard — в §3 IN добавляется ещё один вынос (обычно панели или hook-выделение state), даже если это делает спринт на 20% больше. Отложить в «следующий спринт» = оставить файл в красной зоне после спринта-декомпозиции. Трейсабильность: эта ошибка в Sprint 2a спеке `docs/archive/SPRINT_2A_FRAGMENTEDITOR_DECOMP.md` §3 (OUT: «Вынос state-handlers из index.jsx в отдельные хуки (useFragmentEditorState и т.п.). Если index.jsx уложился в ≤22 KB — этого достаточно») — прогноз ≤22 KB был ошибочным.

---

## Sprint 2a — FragmentEditor decomposition (23.04.2026)

_Sprint 2a — чистый рефакторинг без функциональных изменений. Единственное архитектурное решение записано ⚓ выше, в «Архитектурной гигиене»: «декомпозиция должна закрывать hard-лимит целиком в рамках одного спринта»._

---

## Процесс — Chat ↔ Code координация (23.04.2026)

[2026-04-23] **⚓ Kickoff-интервью перед спекой для feature / refactor / unclear-bugfix.** Источник паттерна — `/feature-dev` команды Claude Code (Boris Cherny, публичное интервью Feb 2026): «first ask me what exactly I want, build the specification, and then build a detailed plan». Адаптация под dual-agent BodgeGene: Chat проводит kickoff-интервью через `ask_user_input_v0` батчами по 2–3 закрытых вопроса, ответы фиксируются в **§0.5 спеки** как источник истины. Цель — уменьшить §5 «Предположения» до короткого хвоста непокрытого (инварианты кода, смежные модули, поведение библиотек) и убрать класс FAIL-итераций из assumptions, которые Игорь мог бы закрыть одним ответом. Корень уроков: Map-WS-1 cycle (3 итерации FAIL-fix, 21.04.2026) = assumption «все annotations имеют id» никем не проверялся. §0.5 **никогда не правится** после написания — снимок, уточнения в §0.6/§0.7 с датой. Критерий когда интервью обязательно, когда короткое, когда не нужно — CHAT_PLAYBOOK.md §1.5 матрица типов задач. Trade-off: 10–20 мин на kick-off; окупается, если сокращает одну FAIL-итерацию (≈1–2 ч Code + сессия Chat).

[2026-04-23] **⚓ `.claude/skills/*` — зона записи Chat'а.** До 23.04.2026 CHAT_PLAYBOOK.md §6 Антипаттерн 5 перечислял разрешённые для Chat пути (CURRENT_TASK.md, docs/*.md, BUGS.md, DECISIONS.md, PROJECT_STATE.md); `.claude/skills/` не был включён, скиллы для Code должны были писаться через промежуточный драфт в `docs/project_knowledge/`. После разового запроса Игоря на прямую запись (в сессии 23.04.2026, когда писалась первая партия из 9 скиллов для Code) и успешного применения — пункт §6 Антипаттерн 5 расширен, Chat пишет в `.claude/skills/*` напрямую. Граница с Code остаётся: `src/`, `tests/`, git-коммиты — зона Code, не Chat.

[2026-04-23] **⚓ Prototype-first для крупных UX-спринтов.** Перед полной спекой UX-изменений, затрагивающих ≥3 компонента разного класса (canvas / viewer / modal) или меняющих design-system (палитра / chrome / typography), Chat сначала пишет спеку «прототипа» на 2–3 поверхностях, Code реализует, Игорь проводит визуальный review на живых React-компонентах с живыми данными — и только после review пишется полная спека UX-спринта. Источник паттерна — `/feature-dev` команды Claude Code (Boris Cherny, публичное интервью Feb 2026: «PRDs are dead: prototypes replaced them»), адаптация под dual-agent модель BodgeGene. Цель — избежать ситуации, когда спека-на-глаз на 5+ компонентов запускает большой спринт, который на review оказывается не тем (семейство-based палитра не работает на малых элементах PartBlock, paper/ink chrome конфликтует с legacy `theme.js` и т.п.). Ортогонально kickoff-интервью (⚓ выше): интервью формирует scope прототипа, прототип формирует scope полного UX-спринта. Не применяется к малым UX-фиксам (1–2 компонента) и bugfix'ам с ясной симптоматикой. Trade-off: +1 спринт в цикле (prototype → review → полная спека → реализация vs прямая спека → реализация), окупается при экономии одной FAIL-итерации визуальной приёмки большого UX-спринта. Первый применяющий случай — Sprint UX-1 prototype (23.04.2026, scope: Canvas Blocks + PlasmidViewer + одна модалка, спека `docs/SPRINT_UX_1_PROTOTYPE.md`).

---

## Sprint X cycle — Plasmid-Git data model + corrected undo timing (24–26.04.2026)

[2026-04-26] **⚓ Plasmid-Git data model: `baseSnapshot` + `commits[]` + `HEAD` + replay.** До Sprint X `fragment.mutations[]` хранил мутации в координатах applied sequence (после всех предыдущих изменений), без immutable baseline. Coordinate-remap при удалении мутации из середины был невозможен (V27); positional diff с parent ломался на indel'ах в sub-фрагменте (V22); single-circular self-closure не имел места для primer-генерации (V24). Sprint X вводит Git-аналогию: `fragment.baseSnapshot` (immutable исходные sequence + annotations + length), `fragment.commits[]` (упорядоченный список с `op`, абсолютными координатами относительно baseline и `applied: bool` flag), `fragment.HEAD` (виртуальный курсор, пока не используется в UI — задел на panel истории в Sprint X+1). Sequence/length/Tm/GC% пересчитываются через replay applied commits на baseSnapshot. Toggle «применить/откатить» на уровне commit (V27 закрыт). Indel-aware classification highlights — из commit op + start/end (V22 закрыт). Single-circular self-closure имеет место в `designPrimersLocal` перед early-return (V24 закрыт). Реализация: `lib/plasmid-git-reducers.js` (5.02 KB) + extension `local-primer-design.js` + workflow rewire `FragmentEditor::handleSaveMutagenesis` + `applyMutationsBatch` reducer. **Backward-compat:** старые fragments без baseSnapshot/commits получают lazy migration при первом коммите (current sequence → baseSnapshot, commits=[]). **Roadmap:** Sprint X+1 — panel истории мутаций в UI (точка возврата на любой commit, branching как первоклассная сущность UX). Архитектурный сдвиг одного порядка с Zustand-миграцией (28.03.2026).

[2026-04-26] **⚓ `pushUndo` захватывает snapshot синхронно при первом вызове в 300мс-окне; debounce только для merge нескольких pushUndo в один undo step.** До Sprint X-fix-3 `pushUndo` в `store/index.js` снимал `shallowSnapshot(get())` внутри setTimeout-callback (через 300мс после вызова). При batch-apply (несколько mutations за один тик) последующий set() успевал выполниться раньше setTimeout, и snapshot фиксировал post-apply state. Undo возвращал тот же post-apply — визуально ничего не менялось. Pre-existing баг с момента введения debounced undo, не проявлялся на одиночных user-actions из-за пауз >300мс между кликами. Fix: module-level `_pendingSnapshot = null`. Первый `pushUndo` в окне захватывает `shallowSnapshot(get())` синхронно, до любого set(); последующие в окне продлевают timer, но `_pendingSnapshot` не перезаписывают (guard `if (_pendingSnapshot === null)`). По срабатыванию timeout snapshot уходит в `_undoStack`, `_pendingSnapshot` и `_pushTimeout` обнуляются. Семантика debounce 300мс для merge быстрых действий в один Ctrl+Z step сохранена. **Race-condition «apply → Ctrl+Z <300мс → новый apply»** закрывается обязательной очисткой `_pendingSnapshot` + `_pushTimeout` в `undo()` / `redo()` — без неё следующий pushUndo получил бы stale snapshot предыдущей операции. **Объём:** ~12 строк в `store/index.js` (10.7 → 12.06 KB), 2 регресс-теста в `store/__tests__/undo-batch.test.js` (batch + single applyMutation возвращают baseline после undo). **Значение:** фундаментальное решение для всех reducer'ов, которые вызывают pushUndo в батч или внутри тика (текущие и будущие: applyMutationsBatch, toggleCommit, archiveCommit, multi-fragment edits, drag step-batch). Не мигрирует в архив.

[2026-04-26] **⚓ Тесты для side-effect функций (debounced/setTimeout/async) проверяют конечный observable state, не только вызов функции.** Наблюдение из пост-мортема цикла Sprint X / X-fix / X-fix-2 / X-fix-3. Sprint X-fix-2 вводил `applyMutationsBatch` вместо цикла `applyMutationGit`, и тест K-fix2-1 «pushUndo called exactly once for batch» spy-ил вызов функции (один вызов на batch — PASS), но не проверял результат (`_undoStack` содержимое и эффект `undo()`). pushUndo timing баг (Sprint X-fix-3 K-fix3-1) остался не выявленным до visual acceptance 26.04.2026. Правило: когда функция имеет отложенный эффект (debounce, setTimeout, microtask, async), spy на вызове недостаточно — тест обязан использовать `vi.useFakeTimers()` (или эквивалент) и ассертить конечный observable state после advanceTimersByTime / awaiting microtasks. Для undo/redo это означает: end-to-end через store, ассерт sequence/length/commits после `undo()`. **Применение:** добавить этот паттерн в `_TEMPLATE_SPEC.md` «Структура тестов» как обязательный чек-пункт при писании спеки с debounced/async-функциями. CHAT_PLAYBOOK.md §2 «Предположения» будет тянуть сюда.

---

## Sprint Import-Start-Screen — fix-цикл (27.04.2026)

[2026-04-27] **⚓ `addFragment` vs `addFragmentDirect` разделение: hijack PlasmidUseWizard легитимен только для «named-entry» (palette / library / contextMenu); ImportStartScreen `На канвас` ходит прямым путём.** До Sprint Import-Start-Screen-fix `fragmentSlice.addFragment` для circular + ≥2 regions ставил `wizardPlasmid` и short-circuit'ил push в fragments — это «presetMode bypass»-flow от старого `ImportDecisionModal`, сохранённый при переходе на ImportStartScreen. Проблема (F-A): import-flow сам по себе явный выбор «импортируем как backbone» — wizard «Что сделать с «N»?» избыточен, и биолог видит модалку поверх ImportStartScreen, что ожидается как «выбрал → сразу на canvas». Решение (Kfix-2 commits `e2afb4e` + `f672dc8`): введён отдельный reducer `addFragmentDirect(fragment)` — push в fragments без hijack-ветки. ImportStartScreen `handleAction('canvas')` вызывает `addFragmentDirect`, все остальные entry points (drag из PartsPalette, action из PlasmidUseWizard «view»-режима, action из CatalogPanel/CatalogTree, contextMenu PartBlock) ходят через legacy `addFragment` — hijack сохранён для сценариев, где выбор «что сделать с этой плазмидой» остаётся осмысленным. **Правило разделения:** new entry point без явного выбора биологом «что сделать» (явный = клик по «На канвас» / «В библиотеку» / «Аннотировать») — ходит через `addFragmentDirect`. Entry point с явным выбором (drag-из-палитры — «что сделать с этой плазмидой» осмысленный, contextMenu PartBlock, action button в PlasmidViewer) — ходит через `addFragment`. Не смешивать. Закрывает класс багов «импорт открывает избыточный wizard» и общий вопрос «когда wizard — легитимный». Реализация: `gui/designer/src/store/fragmentSlice.js` ± новый `addFragmentDirect` рядом с `addFragment`; в ImportStartScreen `handleAction` из push-флоу вызывает новый reducer внутри await/then, push в SessionSummary `addedItems` — после успеха. **Тесты:** интеграционный в `import-start-screen` (canvas action → addFragment вызван 1 раз → ни одной новой модалки) + регрессия (PlasmidUseWizard всё ещё открывается из contextMenu PartBlock + drag из PartsPalette всё ещё идёт через старый hijack). Приёмка 27.04.2026 F-A regression — PASS.

[2026-04-27] **⚓ `extractItemName(parsed, file)` приоритет имён Part'а при импорте + backend filename pass-through.** До Sprint Import-Start-Screen-fix backend pipeline (`gui/api/server.py` + `src/pvcs/snapgene_parser.py`) для SnapGene `.dna` файлов с пустым внутренним metadata.name возвращал `Path(NamedTemporaryFile.name).stem` («tmp{XXXX}») в `parsed.name` — биолог видел техническое имя в палитре/canvas/SessionSummary вместо ожидаемого (либо LOCUS/FASTA-header, либо оригинальное имя файла). **Двухслойный fix (Kfix-1 commit `6335c52`):** (1) backend (`gui/api/server.py`) — если parser вернул `meta.name == tmp_path.stem`, перезаписываем на `Path(file.filename).stem` (оригинальное имя из multipart FormData); (2) frontend (`gui/designer/src/file-import.js`) — новый helper `extractItemName(parsed, file)` с приоритетом: **(а)** `parsed.metadata.name` (LOCUS из `.gb`, FASTA-header `>name` из `.fasta`, SnapGene internal metadata из `.dna`) если задано и не пустое; **(б)** `file.name.replace(/\.[^.]+$/, '')` если файловый upload (режект `tmpXXX`-pattern и `<unknown…>`-маркеров); **(в)** `part_${N}` fallback (incremental counter из существующих parts либо session-counter). Backend fix — источник (оригинальное имя возвращается в ответе pipeline); frontend fix — defense-in-depth (сработает даже если backend лёжит либо Ctrl+V paste-flow без file-upload). **Правило:** любой entry point импорта (drag-drop, file picker, Ctrl+V paste, batch parsing) ходит через `extractItemName`. Ручные вхождения вида `parsed.name || file.name` в кодбазе запрещены. **Тесты:** 2 unit на `extractItemName` (приоритет internal > file.name; fallback `part_N`). Закрывает класс багов «Part приходит с техническим именем вместо ожидаемого» для всех форматов.

---

## Sprint Annotation-Commits (planned) — Plasmid-Git расширение на аннотации (27.04.2026)

[2026-04-27] **⚓ Annotations версионируются как first-class commits в едином `commits[]` (variant A).** До Sprint Annotation-Commits Plasmid-Git модель (⚓ 26.04.2026) версионировала только sequence-mutations (substitution / deletion / insertion); annotations были derived state — чистая функция от `baseSnapshot.annotations` + indel-shifts в `replay()`. Manual annotation-edits (add/remove/edit/rename) в `f.annotations` затираются при следующем `_applyReplay`. Это блокировало V40 (manual annotation editor из ImportStartScreen) и делало Sprint X+1 (panel истории) неполным — биолог не видит «когда я добавил эту CDS». Решение: расширить `commit.type` на annotation-операции (рабочий набор `add_annotation` / `remove_annotation` / `edit_annotation`; финальный набор — в спеке), применяемые `replay()` после indel-shifts в createdAt-order. Единая ось истории, единый undo/redo, единый applied-toggle и archive — симметрия с sequence-commits. Отклонённые варианты: (B1) mutable `baseSnapshot.annotations` — ломает immutability-контракт baseSnapshot и дважды-работа если Sprint X+1 всё равно потребует annotation-history; (C) параллельные `annotationCommits[]` — в UX panel всё равно сводятся к объединённой timeline = семантически (A) с большей storage-сложностью; (E) snapshot-history — несимметрична с sequence-ops, дороже по памяти. Принцип выбора: качество архитектуры выше скорости реализации (явная формулировка Игоря в сессии 27.04.2026: ««А» однозначно — качество превыше скорости»). **Стоимость реализации:** ~6–10 ч Code, спека 25–30 KB, +30–50 unit tests, plasmid-git.js растёт с ~7 KB до ~12–15 KB (в hard 25 KB). **Реализация:** отдельный спринт Sprint Annotation-Commits, запланирован после mini-fix-2 (V38+V39+V41).

[2026-04-27] **⚓ Annotation-commit `parentPos` хранится в координатах `baseSnapshot.sequence` (positional anchor, не content anchor).** Следствие ⚓ выше. Симметрия с sequence-commits: parentPos commit'а фиксируется в baseline-coords в момент создания. Биолог в AnnotationEditor работает в HEAD-coords — reducer переводит HEAD → baseline обратным remap'ом через cumulative indel из applied sequence-commits с ловер parentPos. **Edge case at toggle:** при отключении предшествующего indel'а visual position annotation’а смещается (CDS добавлена в HEAD-pos 250 после deletion — 30 nt в pos 100; при toggle deletion off CDS окажется в HEAD-pos 280, на другом нуклеотидном контексте). Математически корректно (parentPos фиксирован в baseline), семантически может смутить — решается sanity-warning'ами на UI-слое (см. следующее решение), не на уровне data-model. Content anchor (хранить фрагмент sequence для повторной локализации) отвергнут как оверинжинеринг: в 95% случаев неотличим от positional для биолога, в 5% (конфликт после toggle) — anchor «выпадает» без явного объяснения. Positional + warning явнее объясняет биологу «эта аннотация привязана к baseline pos N, sequence сейчас другая — проверьте». **Следствие для V40 wiring:** AnnotationEditor.onChange вызывает новые reducer'ы (`addAnnotationCommit`/`removeAnnotationCommit`/`editAnnotationCommit`), не пишет в `f.annotations` напрямую.

[2026-04-27] **⚓ `applied: false` на add_annotation commit = annotation скрыта без удаления из истории.** Симметрия с toggleCommit для sequence-mutations. Биолог получает «hide annotation» бесплатно: в panel истории видит «disabled» commit (как для перезаписанных substitutions сейчас), может вернуть. **archive_annotation** (жёсткое удаление commit'а из истории) — через тот же archiveCommit reducer, работает универсально по всем типам commit'ов.

[2026-04-27] **⚓ `bootstrapBaseSnapshot` триггерится first-mutation-OR-first-annotation-edit (whichever first).** До Sprint Annotation-Commits bootstrap происходил только при первом `applyMutationGit`/`Batch` (`if (!f.baseSnapshot) bootstrap` в `_applyOneCommit`). До этого момента `f.annotations` editable напрямую — был невидимый bistable баг: редактирование аннотаций работало до первой мутации, потом резко ломалось. Решение: bootstrap при любом первом commit'е (любого типа). После bootstrap `f.annotations` и `f.sequence` становятся строго derived state, запись в них напрямую — баг.

[2026-04-27] **⚓ Replay ордеринг: indel-shifts annotations применяются ПЕРВЫМИ, annotation_ops ВТОРЫМИ.** Для каждого applied annotation_op `parentPos` ремапится в current-sequence index через cumulative indel из всех applied sequence-commits с ловер parentPos. Порядок annotation_ops между собой — createdAt-order (тоже что для sequence-commits). Результат детерминирован. Альтернатива «interleaved order по глобальному createdAt» отклонена: в ней indel-shift при sequence-commit'е бы зависел от annotation_ops между ними, и результат не эквивалентен финальному состоянию «биолог сделал все эти операции». Two-pass (sequence → annotations) проще и корректнее.

[2026-04-27] **⚓ Sanity-warning policy на UI-слое при расхождении annotation HEAD-pos и baseline-content.** Для каждой annotation после replay вычисляется флажок `coordIntegrity` (или эквивалент) — sanity-check, что первые N нуклеотидов от annotation.start в HEAD-sequence совпадают с baseline-content (из baseSnapshot.sequence от parentPos по parentPos+N). Расхождение = sequence-toggle вывел annotation в другой nucleotide-context. UI показывает warning-бадж «⚠ позиция могла сместиться» рядом с annotation в AnnotationEditor + arc-overlay в PlasmidMap. Annotation остаётся в data-model (не выпадает) — политика «показываем, но предупреждаем». Конкретные правила (N=? нуклеотидов сравнения, что делать при выходе за сиквенс после deletion'ов) — в спеке.

**Open questions для спеки (не блокируют решение):**
- Финальный набор annotation commit-типов (отдельные add/remove/edit/rename, или edit покрывает rename + coord-shift). Решается kickoff-интервью перед спекой.
- Auto-override для annotations (два add на одну coord-range — replace previous vs allow duplicates). Предложение: отложить на v2 implementation (первая версия — allow duplicates без override).
- Связь с Sprint X+1 (panel истории): в одном спринте (Annotation-Commits включает panel) или в двух (данные → panel). Предложение: в двух (Sprint Annotation-Commits = data-model + V40 wiring; Sprint X+1 = panel сразу на полной модели).
- Migration уже сохранённых fragments: все существующие commits[] без annotation_ops продолжают работать (пустой annotation-history); fragments без baseSnapshot bootstrap'ируются при первом annotation-edit по новому правилу. Риск-левел низкий, migration script не нужен.

---

## Sprint App-Decomp — ModalStack + useAppEffects extract (28.04.2026)

[2026-04-28] **⚓ UI/modal-компоненты читают store actions/setters через `useStore.getState()` напрямую — через props идут только composite handlers.** До Sprint App-Decomp ожидалось, что экстракт ModalStack из App.jsx потребует prop-drilling 12–15 selectors/setters из родителя. Code при реализации применил устоявшийся в своём коде паттерн (примеры — PartsPalette.jsx, DesignCanvas.jsx, FragmentEditor/EditorPanels.jsx): внутри компонента вызов `useStore.getState()` в handler'ах/render'е вытаскивает actions/setters напрямую, props-контракт сужается до composite handlers (handler из useFragmentHandlers + локальных state-переменных родителя) — всё чисто store-происходящее берётся локально. Результат на ModalStack: 7 props вместо прогнозируемых 12–15; размер ModalStack.jsx — 7.91 KB вместо ожидавшихся 12–15 KB. **Trade-off:** хуже тестируемость изолированного рендера компонента (уже не pure-functional от props), лучше читаемость в реальном коде (нет prop-drilling боилерплейта на каждый modal). **Правило:** выбор между props vs `useStore.getState()` идёт по семантике: если значение из store одинозначно и не предполагает локальных вариаций или mock-подмен (action `setFoo`, selector `bar`) — через `useStore.getState()`; если это composite handler, собирающийся в родителе из нескольких источников, или callback с локальной родительской семантикой — через props. Используется в экстрактах любых компонентов из App.jsx (декомпозиция), но не в письме новых pure-presentation компонентов (там props-контракт остаётся более чистым). **Реализация:** Sprint App-Decomp коммит `301db04` (ModalStack.jsx 7.91 KB из App.jsx). **Следствие для спек:** при планировании extract из крупных root-компонентов (App.jsx, DesignCanvas.jsx, PlasmidUseWizard.jsx) Chat не фиксирует в §6 «Contract props» полный список пробросываемых selectors — явно разрешает Code выбрать между props и `useStore.getState()` по этому правилу. Для ревью: в отчёте Code фиксирует фактическое количество props нового компонента + список selectors, взятых через `useStore.getState()`.

---

## Sprint Project-Model (planned) — kickoff завершён (28.04.2026)

[2026-04-28] **Kickoff Project + Container + DAG модели завершён, документ-результат: `docs/PROJECT_MODEL_KICKOFF.md` (28.04.2026).** Заменяет `docs/CONTAINER_ARCHITECTURE_DRAFT.md` (27.04.2026, статус «🟡 в обсуждении») — все его положения инкорпорированы либо явно отмечены как переформулированные. По итогу kickoff'а — **16 кандидатов в ⚓ DECISIONS**, которые становятся якорными после написания полной архитектурной спеки `ARCHITECTURE_PROJECT_MODEL.md`. Кандидаты живут в kickoff-документе до архитектурной спеки, чтобы DECISIONS.md не загромождался не финализированными положениями. Ключевые ставки модели: контейнер как «виртуальный операционный стол» с одной активной молекулой (изоморфизм data ↔ протокол), Project + Container + DAG трёхслойная архитектура, lazy git (commits[] инициализируется при первой операции), Library = пул контейнеров с историей (clone-on-import + frozen lineage), Primers as first-class project entity с гибридным pool (origin project + локальная копия с back-reference), primer-synthesized container как новый origin для MoleculeContainer, разделение операций на внутри-контейнерные (commits[]) и между-контейнерные (узлы DAG: assembly N→1, split 1→2, опционально clone 1→1). Закрыта слабость 1 (external source через importer; primers; primer-synthesized container). Зафиксированы слабости 2–9 для последующих итераций (visual weight внутри-контейнерной истории на канвасе, формализация триггера lazy git, frozen snapshot data volume, clone vs personal scratch в library, дедупликация при clone-on-import, AssemblyContainer immutability, migration path с v0.5, обязательное чтение реального кода перед спекой). Открытые архитектурные вопросы вне слабостей: persistence формат, стартовая страница UX, граница project↔library, UI внутри контейнера, display-fold rules, inventory операций v1, hyperedge vs цепочка для multi-fragment assembly, auto-protocol traversal. **План перехода:** N+1 сессия — закрытие слабостей 2/3/7/5 после обязательного чтения `parts-slice.js` / `fragment-slice.js` / `plasmid-git.js` / `plasmid-git-reducers.js` (закрытие слабости 9); N+2 — закрытие оставшихся слабостей и архитектурных вопросов; N+3 — архитектурная спека `ARCHITECTURE_PROJECT_MODEL.md` (тип A по §13 playbook'а, размер 25–30 KB), фиксация 16 кандидатов в ⚓ DECISIONS, sprint plan нижнего уровня (4–6 sprint-спек: data model + store rewiring → start screen → library overlay → DAG canvas → persistence → migration). **Переезд DRAFT'а:** старый `CONTAINER_ARCHITECTURE_DRAFT.md` → `docs/archive/` со штампом «🟢 ЗАМЕЩЁН docs/PROJECT_MODEL_KICKOFF.md (28.04.2026)» при следующей ротации §4 playbook.

---

## Sprint Project-Model FINAL — ARCHITECTURE_v2.md (29.04.2026)

**Контекст.** 28.04.2026 завершён kickoff Project+Container+DAG (`docs/archive/PROJECT_MODEL_KICKOFF_v1.1.md`, 130 KB, 24 ⚓-кандидата). 29.04.2026 в параллельной сессии написан агрегатор всех апрельских обсуждений `docs/ARCHITECTURE_v2.md` (91 KB) + `docs/DESIGN_SYSTEM.md` — central reference для v0.6+. По трём фундаментальным конфликтам с kickoff v1.1 решение Игоря 30.04.2026: **DEC-V2 (29.04) приоритет**. Kickoff морально устарел в части data-model, остаётся как research-history (биологическое обоснование контейнер-как-virtual-operating-table, primer-synthesized container, origin vs provenance разделение — перенесены в ARCHITECTURE_v2). Старая запись «Sprint Project-Model (planned) — kickoff завершён» выше — **superseded** этим блоком. Все DEC-V2-NN ниже — ⚓ fundamental, не переезжают в архив.

### Immutable принципы (DEC-V2-01..12, ARCHITECTURE_v2 §1)

[2026-04-29] **⚓ DEC-V2-01: Контейнер = единственная единица «молекулярной сущности».** Один тип артефакта в проекте: `MoleculeContainer`. Никаких AssemblyContainer / PrimerContainer / FragmentContainer как отдельных классов. Primers — отдельная сущность (не молекулы в том же смысле), Library entries — отдельная. ARCHITECTURE_v2 §1.1.

[2026-04-29] **⚓ DEC-V2-02: Сборка = операция уровня проекта (ProjectCommit), не объект.** Mix (Gibson/GG/RE/KLD/blunt), PCR, digest split, clone-on-import — это рёбра в DAG проекта. У них есть метаданные (reaction class, params, agent, timestamp), но нет lifecycle planning/ready/committed. Операция атомарна: либо состоялась (commit), либо нет. **Конфликт с kickoff ⚓ #8 / #19** (AssemblyContainer как узел с lifecycle planning→committed) — разрешён в пользу DEC-V2-02. Семантически: «операция между контейнерами» а не «пробирка с реакцией». ARCHITECTURE_v2 §1.2 + §2.4 (ProjectCommit) + §10 (что НЕ делаем).

[2026-04-29] **⚓ DEC-V2-03: Концы контейнера — first-class свойство.** Для linear контейнера ends (5'/3' с overhang-info) видны в UI и валидируются при операциях. Для circular — концов нет (`ends: null`). Tools для модификации концов: PCR (создаёт ампликон с primer-tails), digest (генерирует overhangs), modify-ends (явная правка в Container Window). ARCHITECTURE_v2 §1.3.

[2026-04-29] **⚓ DEC-V2-04: Сшивающий участок (overlap/homology) не имеет отдельной сущности.** Overlap из primer-tails — это часть концов исходных ампликонов, не отдельный объект. После операции mix overlap'ы материализуются в один шов в продукте, провенанс трекается через цепочку commits. ARCHITECTURE_v2 §1.4.

[2026-04-29] **⚓ DEC-V2-05: Provenance = side-effect каждой операции, не отдельная фича.** Каждая операция (ContainerCommit или ProjectCommit) автоматически создаёт provenance-запись. PROV-O семантика как vocabulary (Entity / Activity / used / wasGeneratedBy / wasDerivedFrom / hadPlan), но plain JSON на хранении, не RDF. ARCHITECTURE_v2 §1.5.

[2026-04-29] **⚓ DEC-V2-06: DAG-as-primary-view.** Корневой workspace проекта = DAG, не список / tree / table. Список — projection (side-panel toggle). Это USP проекта, отличающая от SnapGene / ApE / Benchling-в-OS. ARCHITECTURE_v2 §1.6 + §3.3.

[2026-04-29] **⚓ DEC-V2-07: Local-first, открытый формат `.bodge`.** ZIP с manifest.json + per-container .gb (с structured COMMENT-block для provenance) + dag.json. RO-Crate metadata в v0.9 для FAIR-claims. Файл живёт на диске пользователя, не в облаке. Никакого SaaS. Альтернативное имя `.bdg` отвергнуто (занято MIME — BadgeMaker). ARCHITECTURE_v2 §1.7 + §4.0.

[2026-04-29] **⚓ DEC-V2-08: Скорость не приоритет, качество и гибкость важнее.** Решение для UX-развилок (fragment-insert и т.п.). Прорабатываем через прототипы и дизайн-сессии, не оптимизируем под «сделать в один клик». **Распространяется на data-model выбор:** в трёх конфликтах с kickoff'ом (AssemblyContainer / Lazy git / Clone) выбрана более продуманная семантика, не более экономная по числу классов или памяти. ARCHITECTURE_v2 §1.8.

[2026-04-29] **⚓ DEC-V2-09: Stack-навигация.** Из любого фулскрина «← Назад» возвращает на предыдущий с сохранением state. Mix Workspace draft = unsaved tab, не закрывается при уходе на другой фулскрин. ARCHITECTURE_v2 §1.9 + §3.2.

[2026-04-29] **⚓ DEC-V2-10: Honest scope.** BodgeGene модели design intent provenance, не lab outcome verification. НЕ трекаем transformation efficiency, sequencing-verify, contamination, errors. Это design tool, не lab simulator. Открыто для v1.5+: failed experiments флаг, sequencing-verify как ProjectCommit, transformation/strain context. ARCHITECTURE_v2 §1.10 + §2.10.

[2026-04-29] **⚓ DEC-V2-11: Identity = label, не account.** В системе нет понятия user account. `agent` (name + email) — это label для commit attribution, без auth/permissions. Файл — единственный источник правды. Несколько agents в одном файле — нормальное явление. Backend остаётся stateless calculation service, не user service. ARCHITECTURE_v2 §1.11 + §5.2.

[2026-04-29] **⚓ DEC-V2-12: Sync через файл, не через сервер.** `.bodge` файл — primary unit обмена. Cloud sync делается через third-party providers (Drive Desktop / Dropbox / OneDrive) через File System Access API. Активная Google Drive API integration — opt-in convenience, не замена. Никакого built-in sync server, никакого real-time collab. ARCHITECTURE_v2 §1.12 + §5.3.

### Data model (DEC-V2-13..18, ARCHITECTURE_v2 §2)

[2026-04-29] **⚓ DEC-V2-13: 4 entities + Hyperedge.** Project / MoleculeContainer / ContainerCommit / ProjectCommit. ProjectCommit с N inputs / M outputs (hyperedge) — стандарт SBOL/PROV/Benchling/Nextflow. Multi-fragment assembly = один ProjectCommit с массивом inputs, не цепочка pairwise рёбер. ARCHITECTURE_v2 §2.1 + §2.4.

[2026-04-29] **⚓ DEC-V2-14: ContainerCommit vs ProjectCommit разделение.** ContainerCommit = правка ВНУТРИ одного контейнера (substitution / insertion / deletion / annotation_edit / mutagenesis). ProjectCommit = операция МЕЖДУ контейнерами (mix / pcr_amplify / digest_split / cut_extract / clone). Не смешивать. Каждый контейнер имеет свой `commits[]`, проект имеет отдельный `projectCommitIds[]` topologically ordered. ARCHITECTURE_v2 §2.3 + §2.4.

[2026-04-29] **⚓ DEC-V2-15: Lazy commits НЕ используем — `commits: []` всегда.** Двойственность null vs пустой массив не оправдывает экономию памяти. Контейнер прямо после import имеет `commits: []` + `currentHash = baseSnapshot.hash`. **Конфликт с kickoff ⚓ #7 / #18** (lazy git как маркер «не тронут») — разрешён в пользу DEC-V2-15. Семантический маркер «не тронут» = `commits.length === 0`, не отличающийся от null концептуально, но проще в коде. ARCHITECTURE_v2 §10 (что НЕ делаем).

[2026-04-29] **⚓ DEC-V2-16: Origin (immutable) vs Provenance (mutable) — разные поля.** `origin` — discriminated union с полями типа `imported_from_file` / `assembled_in_project` / `cloned_from_library` / `primer_synthesized` / `external_source`, immutable после создания контейнера. `provenance` — mutable per-project metadata о том, где/когда контейнер использован в workflows (не где он «родился»). В коде v0.5 эти концепции collide'ятся в одном поле — в v0.6 разведены явно. ARCHITECTURE_v2 §2.2 (Origin) + §2.2.1 (origin vs provenance, перенесено из kickoff §4.1.2).

[2026-04-29] **⚓ DEC-V2-17: `commit.warnings[]` vs `ProjectCommit.warnings[]` — два разных канала.** ContainerCommit warnings = sanity-warnings внутри-контейнерных правок (например coord-shift для annotation_edit при toggle indel'а). ProjectCommit warnings = warnings для reaction (palindrome overhang в GG, internal RE site, low-Tm primer). В UI рендерятся в разных местах: ContainerCommit warnings — в panel истории Container Window, ProjectCommit warnings — на ребре DAG + в Mix Workspace. ARCHITECTURE_v2 §2.3.1 (перенесено из kickoff §4.1.3).

[2026-04-29] **⚓ DEC-V2-18: Имя формата проекта — `.bodge`.** ZIP-архив с manifest + per-container .gb + container/projectCommits content-addressable + primers/library/refs JSON. Этимология: «to bodge» (брит. инженерный жаргон) = «склеить наспех, наколхозить» — самоиронично отражает реальность wet-lab cloning. `.bodge` побеждает `.bdg` (MIME занят). ARCHITECTURE_v2 §4.0.

### Distribution / Identity / Sync (DEC-V2-19..21, ARCHITECTURE_v2 §5)

[2026-04-29] **⚓ DEC-V2-19: Distribution model — hosted web app (`bodgegene.dev`) + open-source self-host + PWA.** Hosting на Cloudflare Pages / Vercel / Netlify (свободный tier до десятков тысяч users/мес). Self-host через `git clone + npm run build` deploy `dist/` на любой static server. PWA installable с offline-кэшем (Workbox через `vite-plugin-pwa`), IndexedDB как primary storage. Desktop app (Tauri) отложен до v1.5+. **НЕ делаем:** App Store / Play Store, Snap / Flatpak / AUR, Docker для frontend (статика, overhead не нужен). ARCHITECTURE_v2 §5.1.

[2026-04-29] **⚓ DEC-V2-20: Identity model — local-only attribution.** Identity = label (`agent: { name, email }`) для commit attribution, не unit security/permissions. Backend stateless, никаких user accounts / passwords / sessions / OAuth для собственного auth. Если user захочет sync через Google Drive — OAuth там opt-in для Drive API, не для BodgeGene. ARCHITECTURE_v2 §5.2.

[2026-04-29] **⚓ DEC-V2-21: Sync — три уровня (file / cloud-folder / Drive API), все через third-party.** Уровень 1: manual file transfer (USB / email / GitHub release). Уровень 2: cloud folder integration через File System Access API — `.bodge` сохранённый в Drive Desktop / Dropbox / iCloud / OneDrive folder автосинкается провайдером, BodgeGene не знает что это cloud. Уровень 3: opt-in Active Google Drive API integration (file picker, save without Drive Desktop client) — convenience, не замена. **Conflict resolution = manual:** при параллельном редактировании через cloud-папку провайдер создаёт conflicted-copy, user открывает оба, решает вручную. **НЕ делаем:** built-in sync server, sharing links, real-time collab, auto-merge .bodge через Merkle-DAG (research direction для v1.5+). ARCHITECTURE_v2 §5.3 + §5.4.

### Persistence + Lifecycle + Multi-tab (DEC-V2-22..26, ARCHITECTURE_v2 §4 + §5.6)

[2026-04-29] **⚓ DEC-V2-22: Persistence — IndexedDB через Dexie.js + `.bodge` ZIP как explicit file save.** IndexedDB схема v1: projects / containers / containerCommits / projectCommits / primers / primerUsage / library / blobs / refs. Indexes: `[projectId+kind]`, `[containerId+createdAt]`, `[primerId+containerId]`, `[kind+ownership]`. .bodge формат описан в DEC-V2-18. **НЕ используем:** localStorage (5–10 MB hard limit стрельнёт сразу при container'ах с frozen snapshots). ARCHITECTURE_v2 §4.1 + §4.2.

[2026-04-29] **⚓ DEC-V2-23: Двухуровневый lifecycle — IndexedDB autosave (continuous) + .bodge explicit save.** IndexedDB autosave throttle 2s + debounce 5s, невидимо для user — safety net, максимум 5s работы потеряно при crash. .bodge save = explicit user action (Cmd/Ctrl+S), no auto-save в файл (отвергнут Google Docs-style auto-save для v1.0). Mental model биолога: «Файл — то, что я сохранил» / «Рабочая копия — в браузере, не теряется». Crash recovery через `cleanShutdown` флаг + IndexedDB transactions atomic. ARCHITECTURE_v2 §5.6.

[2026-04-29] **⚓ DEC-V2-24: Multi-tab блокируется в v0.6 через `navigator.locks`.** При открытии проекта exclusive lock `bodge-project-${projectId}`. Если lock уже held — экран «Проект уже открыт в другой вкладке» с кнопкой «Перенять контроль» (force release через BroadcastChannel). Первая вкладка → read-only при потере lock. **Reasoning:** настоящий multi-tab sync через CRDT/OT — серьёзная работа, не оправдана для pet-проекта без collaboration story. Пересмотр в v0.8+ возможен. ARCHITECTURE_v2 §5.6.8.

[2026-04-29] **⚓ DEC-V2-25: Conflict detection при save = простая проверка `lastModified`, manual resolve.** Перед write через File System Access API: сравниваем `handle.getFile().lastModified` vs `fileLastKnownModified`. Расхождение → warning «Файл изменился на диске. Перезаписать / Сохранить как новый файл / Отмена». **НЕ делаем:** continuous polling за внешними изменениями (overkill), auto-merge (manual через cloud-conflicted-copy). Stale handle через `queryPermission` + re-prompt банер. ARCHITECTURE_v2 §5.6.9 + §5.6.10.

[2026-04-29] **⚓ DEC-V2-26: GenBank export per container с structured COMMENT-block для provenance.** `##BodgeGene-Provenance-START##` / `payload :: <base64-json>` / `##BodgeGene-Provenance-END##`. NCBI-blessed pattern: SnapGene / Benchling / Geneious / ApE / BioPython сохраняют COMMENT byte-for-byte. При re-import в BodgeGene — DAG восстанавливается из payload. При import в другие tools — sequence/features читаются нормально, COMMENT игнорируется. Real interop без потери provenance. ARCHITECTURE_v2 §4.3.

### Cross-project import (DEC-V2-27, ARCHITECTURE_v2 §2.4 / Library §3)

[2026-04-29] **⚓ DEC-V2-27: Cross-project import через fullscreen modal с read-only DAG view donor'а.** Биолог выбирает контейнер из чужого `.bodge` — открывается fullscreen modal, рендерящий DagView donor'а с `readOnly:true`, биолог кликает узел, нажимает «Импортировать в текущий проект» → создаётся локальный MoleculeContainer с `origin: { kind: 'cloned_from_external_project', sourceProjectId, sourceContainerId, sourceProjectFile }` и frozen lineage (sequence + annotations + topology + ends + первые N commits снаружи замораживаются как baseSnapshot, дальше внутри-проектные правки — новые commits). Симметрично с clone-on-import из Library (3 tier ownership). Реюзит DagView с `readOnly:true` props — не отдельный компонент. ARCHITECTURE_v2 §2.4 (clone) + §3.1 (Library).

---

**Status changes 30.04.2026:**
- 24 ⚓-кандидата kickoff v1.1 → не финализированы как отдельные ⚓ DECISIONS, поглощены DEC-V2-01..27 либо отвергнуты (см. DEC-V2-02 / DEC-V2-15 — три фундаментальных конфликта).
- Запись «Sprint Project-Model (planned) — kickoff завершён (28.04.2026)» выше — **superseded** этим блоком.
- `docs/PROJECT_MODEL_KICKOFF.md` v1.1 → `docs/archive/PROJECT_MODEL_KICKOFF_v1.1.md` (архивирован 30.04.2026 в Этап 2 систематизации).
- `docs/CONTAINER_ARCHITECTURE_DRAFT.md` → `docs/archive/CONTAINER_ARCHITECTURE_DRAFT.md` (архивирован 30.04.2026).
- Архитектурная спека `docs/ARCHITECTURE_PROJECT_MODEL.md` (планировалась N+3) **не пишется** — заменена `docs/ARCHITECTURE_v2.md` 91 KB.

---

## Sprint M-A Wireframe Selection — Start screen design (30.04.2026)

**Контекст.** Первая дизайн-сессия M-A series (M-A → M-I по ARCHITECTURE_v2 §7) — wireframe selection для стартового экрана. Из трёх равновесных вариантов (A minimal centered, B split panel, C dashboard) Игорь выбрал B и итерировал его от v1 до v7 (project tags + paths + отдельный All projects entry + Recent description + scrollable list + theme toggle). По итогу фиксируем четыре решения: одно дизайн-системное (DEC-DS-01) и три архитектурных (⚓ DEC-V2-28..30) — последние ⚓ потому что трогают data-model (Project.tags) и фундаментальную семантику (Browse entries dual-context, Group projects).

[2026-04-30] **DEC-DS-01: Start screen layout = вариант B (split panel) с amber accent.** Двухколоночный layout: сидбар 220 px слева (Primary actions верхний блок / Browse entries нижний блок / Footer «Install as desktop app»), Recent projects справа (scrollable, 10 last). Акцентный цвет — amber-warm (`#BA7517` light / `#FAC775` dark): wordmark «BodgeGene» в header, кнопка `+ New project` (filled amber), выделения в hover-states. Остальные кнопки (`↑ Open .bodge…`, `↓ Import sequence`) и sidebar links (Library / Primer pool / All projects) — outline с muted text-color, без fill. **Карточка Recent:** name (text-primary, 14 px medium) + meta `time-since · N containers · saved/unsaved` (text-tertiary, 12 px) + path в monospace (text-tertiary, 11 px) + tags chips (bg-tertiary, 10 px, multiple) + description (text-secondary, italic, 12 px, 3-line clamp) в правой колонке. **Empty states** для Untitled проектов: name italic с пометкой «Untitled», поля path/tags/description заменяются на italic placeholder («no file location yet» / «no tags yet» / «no description yet») в muted-text — явно видно что пустое, без dash'ей / N/A. **Тема:** с первого релиза (M-A) поддерживаются Light и Dark, переключатель в Settings; переключение через `data-theme` атрибут на root container, CSS-variables флипаются. **`!important` на критичных text/bg colors** обязателен для button/link элементов — default UI button styling (из host CSS или system theme) пробивает class-specificity и выигрывает color без `!important` (вывод из v6 → v7 регрессии white-on-white). Реализация в React 19: root компонент `<StartScreen data-theme={theme}>`, CSS-variables `--ss-bg-primary` / `--ss-bg-secondary` / `--ss-bg-tertiary` / `--ss-text-primary` / `--ss-text-secondary` / `--ss-text-tertiary` / `--ss-border-tertiary` / `--ss-border-secondary` / `--ss-accent-amber` / `--ss-accent-amber-bg` / `--ss-accent-amber-text` определены в двух attribute-selectors `[data-theme="light"]` и `[data-theme="dark"]`. **Отвергнутые варианты:** A (minimal centered, без Recent в первом виде — Игорь: «Recent должен быть сразу виден»), C (dashboard-style, ровный grid Recent — Игорь: «обрезанные подписи не нравятся»). **Wireframe HTML:** полный код v7 в visualize:show_widget call '`start_screen_variant_b_v7_theme_toggle`' в чат-сессии 30.04.2026; будет включён в M-A spec как fenced code block или переписан как React-компонент `components/StartScreen/index.jsx` при реализации Code'ом. **Live preview:** widget рендерится в чате интерактивно — click Light/Dark toggle переключает тему на лету.

[2026-04-30] **⚓ DEC-V2-28: Library / Primer pool / All projects = dual-context entries.** Три фулскрина доступны двумя путями: со Start screen (sidebar Browse, no project) и из in-project DAG-toolbar (с открытым `.bodge` на background). Семантика идентична — те же компоненты, те же данные в IndexedDB (catalog Library, кросс-проектный primer pool, реестр `.bodge` проектов). Различие только в навигации возврата: `← Назад` со Start ведёт обратно на Start, из DAG — обратно в DAG того же проекта. **Обоснование:** Library и Primer pool являются кросс-проектными ресурсами (биолог ищет fragments / primers вполне своих всех проектов, не только в текущем); All projects — reach-tool «просмотреть все мои .bodge файлы». Без dual-context биолог вынужден открывать рандомный проект чтобы добраться до Library / Primer pool / All projects — unnatural в mental model. **M-A scope:** все три в фулскрин-заглушках «В разработке». Полная реализация: Primer pool в M-F, Library в M-H, All projects — отдельным милстоуном между M-A и M-B (название TBD). **Reuse паттерн:** реализуется одним компонентом с prop'ом context «`standalone` | `inProject`» — различается только back-button лейбли и stack target. ARCHITECTURE_v2 §3.1 (таблица фулскринов + специальный параграф «dual-context»).

[2026-04-30] **⚓ DEC-V2-29: Group projects = мультитим в одном `.bodge`, без folder hierarchy.** Group projects — это фича для коллаборации нескольких agents в одном файле (несколько agents в commit history `.bodge`), НЕ folder hierarchy для организации разных `.bodge`-файлов. Связывается с DEC-V2-11 (Identity = label, а не account) и DEC-V2-23 (multi-tab блокируется в v0.6 через navigator.locks). Групповая работа реализуется через file sync (cloud-folder/Drive API, DEC-V2-21) + multiple-agent фиксация в commits[]/projectCommits[]. **Обязательная фича**, не nice-to-have (прямая инструкция Игоря в сессии 30.04.2026: «мы их еще сделаем»). Реализация после M-I (после core flow M-A..H и статьи v0.9). **M-A scope:** sidebar entry «Group projects» — disabled с badge `soon`, click не реагирует. Визуально подчёркивает «это будет» без преждевременного раскрытия. **Отличие от SnapGene Cloud / Benchling:** там folder hierarchy и user accounts; у нас — файл с множественными contributor'ами, без server-side hierarchy. Связан с принципами 1.7 (Local-first) и 1.11 (Identity = label).

[2026-04-30] **⚓ DEC-V2-30: Project entity получает поле `tags: string[]`.** Project-level chips для категоризации в Recent / All projects (примеры: `bacterial`, `gfp`, `e.coli`, `cloning`, `t7-promoter`, `mammalian`, `plant`, `binary-vector`, `mating-type`). **Отличие от `MoleculeContainer.tagIds: UUID[]`** (уже в ARCHITECTURE_v2 §2.1) — container tags являются Library-uuid'ами (refs на LibraryEntry kind=feature/plasmid/primer/plan), живут в библиотеке и используются для molecular-level организации внутри проекта. Project-level `tags: string[]` — это free-form строки без фиксации в Library, ориентированы на user-defined категоризацию «это мои plant cloning проекты». **Не ref'ы на LibraryEntry** (отличает от container tags) — простые strings, поиск/фильтр закрывается на IndexedDB index `tags` (multi-entry). **UI:** в Recent card рендерятся как chips ниже path; в All projects (#7) — facet filter слева. **Обрезка:** soft-limit 10 tags на project (в UI показывает все; без запрета со стороны data-model). **Migration:** все existing projects (нет в v0.6 — wipe data) инициализируются `tags: []`. ARCHITECTURE_v2 §2.1 обновлён.

---

## Sprint M-A FINAL — Стартовый экран + persistence + hotkey infra + ProjectInfoModal (30.04.2026)

**Контекст.** Первый милстоун v0.6 рабочего frontend (после wipe v0.5). Реализованы: Dexie schema v1 + store rewrite + multi-tab guard + .bodge ZIP round-trip + AppShell/Topbar + StartScreen Variant B v7 + UnderConstruction/DAG-placeholder/SettingsModal заглушки + 7-entry hotkey registry + ProjectInfoModal с tag suggestions + auto-open после createProject + export mode с чекбоксами + delete с confirm. ~17 коммитов в ветке `feature/racetrack-canvas`. Тесты vitest 739/739, pytest 112/112, vite build clean. Все anchor-уровневые архитектурные решения уже зафиксированы в DEC-V2-01..30 + DEC-DS-01. Ниже — sprint-level decisions (без ⚓), специфичные для M-A UX-итераций; кандидаты на ⚓ promotion при M-B/M-C если паттерн воспроизведётся.

[2026-04-30] **DEC-MA-01: Theme toggle живёт в правом углу header (StartScreen + Topbar), не в Settings modal.** Изначально theme переключался через Display tab в SettingsModal — стандартное место. После визуальной приёмки M-A FAIL (M-A-fix-1, Игорь руками): вынесен в header как ☀/🌙 icon button рядом с Settings. Иконка инверсная — показывает куда переключиться. Обоснование: биолог переключает тему часто (днём light для презентаций / collab, ночью dark для длинной работы), Settings требует 2 клика, угол — 1 клик. Display tab из SettingsModal удалён полностью (TABS = Identity + Advanced). Применимость: все будущие фулскрины (Container window, Mix workspace, Library, Importer) тоже несут ThemeToggle в правом углу своих Topbar'ов.

[2026-04-30] **DEC-MA-02: ProjectInfoModal как central UI для редактирования project metadata (name + description + tags).** Mini-spec M-A-fix-2: биолог создавал «Untitled» проект и не имел UI чтобы дать имя/описание/теги. Из 4 вариантов (A inline rename, B floating modal, C sidebar-drawer, D отложить) выбран B: floating modal с overlay backdrop, name + description + tags в одном экране. Точки входа: клик `✏️` в Topbar; хоткей `⌘I / Ctrl+I` (scope `'global-with-project'`, allowInInput false); auto-open после createProject (DEC-MA-03). Save применяет diff renameProject + updateDescription + addTag/removeTag. Esc-приоритет в App.jsx: `modals.projectInfo > modals.settings > popFullscreen > no-op`. Применимость: этот же modal будет триггериться из RecentCard hover-меню (M-A.1) и из in-DAG context menu.

[2026-04-30] **DEC-MA-03: Auto-open ProjectInfoModal сразу после createProject.** Runtime addition Игоря руками: `handleNewProject` в StartScreen вызывает `createProject('Untitled')` + `openProjectInfo()` синхронно. UX flow: ⌘N → проект создан → ProjectInfoModal автоматически открыт с фокусом на name input. Биолог сразу даёт имя, не оставляет «Untitled» сиротой в Recent. Обоснование: UX-симметрия с большинством design tools (Notion, Figma, Linear). Не применяется при `Open .bodge…` (там name уже есть из файла). Edge case (TD-HOTKEY-MODAL-GUARD): ⌘N inside открытой ProjectInfoModal создаёт ещё один Untitled и переоткрывает modal — fix в M-A.1 (блокировать `'new-project'`/`'open-bodge'`/`'close-project'`/`'open-settings'` когда `modals.projectInfo || modals.settings`).

[2026-04-30] **DEC-MA-04: Tag suggestions derived из `store.projects` через useMemo, sort by frequency then alphabetical, exclude already-added.** В spec'е M-A-fix-2 я написал «out of scope: Tag autocomplete (M-H Library + Tag-DB)». После релиза Игорь заметил что базовый случай «теги, которые биолог уже использовал в других проектах» решается без Library через простой derived state из существующего `projects` map. Реализовано Chat'ом прямой правкой в `ProjectInfoModal.jsx` через `Filesystem:edit_file` (тип D правка): useMemo собирает `Map<tag, count>` из всех `projects[].tags`, фильтрует `tagsSet`, сортирует `b[1] - a[1] || a[0].localeCompare(b[0])`. UI блок «Использованные раньше:» между активными chips и input row, dashed border + transparent bg + `+ {tag}` префикс. Дешёвый вариант полной Library-автокомплет: не требует Tag-DB / cross-project sync / persistence. Trade-off: показывает только теги из проектов **загруженных в текущую сессию IndexedDB** — биолог не видит теги из `.bodge` файлов которые ещё не открывал. В M-H Library полное решение через persisted Tag-DB. TD-PROJECTINFO-SUGGESTIONS-NOTESTS: добавлено без unit-тестов, 3 теста запланированы в M-A.1.

---

---

## Sprint M-A.1 FINAL — Polish: PWA + Notion-style Toast + soft-delete (01.05.2026)

**Контекст.** Полирующий спринт после Sprint M-A. Закрыт 6 TD entries (TD-HOTKEY-MODAL-GUARD / TD-PROJECTINFO-SUGGESTIONS-NOTESTS / TD-EXPORT-DELETE-NOTESTS / TD-PWA-SETUP-DEFERRED / TD-TOAST-UI-MINIMAL / TD-CMD-W-VIVALDI-LIMITATION). 5 коммитов K1–K5 в ветке `feature/racetrack-canvas`: `9ffdf2d` `ca20869` `39af2b4` `facd425` `aac0b53`. Vitest 764/764, build clean, визуальная приёмка 1-pass (4 блока PASS, 18/18 критериев). Ниже — 4 sprint-level decisions (без ⚓), фиксируют проектные UX-паттерны для повторного использования в M-B+.

[2026-05-01] **DEC-MA1-01: Notion-style Toast queue как проектный toast-паттерн.** Старый inline `<ToastBar/>` в App.jsx (single toast, auto-dismiss 3.5 s, оверрайт при втором toast'е) заменён на компонентный stack с queue. **Параметры:** placement bottom-left (24 px от left/bottom), dark fill `#262626` в обеих темах (light/dark), иконка слева информирует о типе (✓ зелёная / ✕ красная / ⚠ amber / i серая), manual close `×` справа, опциональная undo-кнопка (под текстом, link-style amber-400). Stack capacity 3 (FIFO drop), `column` ориентация — newest внизу (Notion / Linear / Sonner pattern, уточнено Игорем при approve plan'а). Auto-dismiss настраивается пер toast через `autoDismissMs` (default 3500). **API:** `useStore.getState().showToast(msg, kind, options)` возвращает id, `clearToast(id?)` убирает один или все (overload для обратной совместимости). **Применимость:** все будущие toast events в M-B..M-I (Importer success/error, reaction warnings, save status, multi-tab guard messages) идут через этот store API. Новые inline ToastBar-лики не создавать. Реализация: `components/Toast/{Toast.jsx,ToastStack.jsx,toast-icons.jsx,index.jsx}` — 4 файла суммарно ~5.2 KB; tests `Toast.test.jsx` 8 тестов.

[2026-05-01] **DEC-MA1-02: Soft-delete паттерн для destructive actions.** Раньше RecentCard `×` вызывал `window.confirm()` + immediate `removeProjectFromIndexedDB`. Заменено на soft-delete: (1) `markPendingDelete(id)` выставляет флаг на entity, RecentList фильтрует out; (2) показывается toast «Проект «…» удалён» с кнопкой «Отменить» (`autoDismissMs: 5000`); (3) если user жмёт «Отменить» — `unmarkPendingDelete(id)`, проект возвращается; (4) если timer истёк — `commitPendingDelete(id)` вызывает actually `removeProjectFromIndexedDB`. **Trade-offs.** Pro: отменяемое действие без modal-confirmation overhead, mobile-friendly UX (один тап на ack, один тап на undo). Con: в «tab-closed-before-timeout» сценарии проект остаётся не удалённым в IndexedDB (known risk §8 спеки) — user увидит «удалённый» проект снова после reopen. Решено как приемлемый trade-off (лучше чем потерять файл при раннем закрытии; реальный user-flow «delete и тут же закрыл вкладку» маловероятен). **Применимость:** паттерн распространяется на все будущие destructive actions в BodgeGene: delete container (M-C/M-D), delete primer from pool (M-F), delete library entry (M-H), revert commit (M-I DAG polish). Везде: mark + toast + 5 s undo + commit. `window.confirm()` modals больше не используем.

[2026-05-01] **DEC-MA1-03: Auto-dismiss timer в Toast.jsx::useEffect, не в reducer middleware.** Спека K5 оставляла Code на выбор между (a) middleware в reducer'е (чище архитектурно — все timing-side-effects централизованы) и (b) `useEffect` с setTimeout в `Toast.jsx` (проще — timer живёт рядом с component lifecycle, cleanup отменяет автоматически при manual close). **Выбрано (b).** Обоснование: (1) размер проекта и количество timing-side-effects не оправдывает middleware infrastructure; (2) cleanup-on-manual-close решается бесплатно через useEffect cleanup function; (3) opt-in callbacks `onUndo` + `onAutoDismiss` в toast options позволяют caller'у различать ветви (manual close — cleanup без коллбеков; undo — onUndo + dismiss; timeout — onAutoDismiss + dismiss). **Следствие для soft-delete:** `commitPendingDelete` вызывается из `onAutoDismiss`, не из `onDismiss`. Manual close × не commit'ит delete — соответствует mental model «закрыл toast без явного undo, и без commit'а». **Применимость:** при росте проекта (больше timing-side-effects, холистические lifecycle hooks) пересмотреть — но для Toast'ов этот паттерн фиксируется как «prostotа > архитектуры».

[2026-05-01] **DEC-MA1-04: `_pendingDelete` flag на project entity, не в `ui.pendingDeletes: Set`.** Спека оставляла Code на выбор между (a) `project._pendingDelete: boolean` на entity и (b) `ui.pendingDeletes: Set<string>` (separate ui-state). **Выбрано (a).** Обоснование: (1) Immer работает с entity мутациями лучше чем с Set (autoFreeze и structural sharing native); (2) RecentList фильтрует `recentProjectIds.map(id => projects[id]).filter(p => p && !p._pendingDelete)` — одна строка без дополнительных lookup'ов; (3) `Set` при (b) требовал бы synchronization layer между флагами и реальным projects[] — выгоды нет. **Race-protection:** `commitPendingDelete` silent return если `_pendingDelete !== true` (защита от ситуации, когда user undo'нул одновременно с timeout). **Применимость:** все будущие soft-delete флаги на entity-уровне (не в `ui` slice), фильтрация в selectors. Для «временных ui-states» (например «hover-card preview») ui slice остаётся правильным местом — различие по «svyazano с lifecycle entity» (entity flag) vs «svyazano с визуальным session-state» (ui slice).

---

## Sprint M-A.2 FINAL — i18n-prep: UI strings → English (01.05.2026)

**Контекст.** Подготовка foundation перед M-B Importer и публикацией (GitHub OSS, статья). На момент M-A.1 финализации v0.6 active UI surface (~15 файлов в `components/` + `lib/` + `store/`) содержал mix русского и английского текста. После обсуждения 01.05.2026 принят раздел языков: **публичный код english / координационные доки русский**. Реализован Code'ом за 5 коммитов (`5f536a0` `cc98e63` `1a876d0` `3ee3427` + K5 HEAD) в ветке `feature/racetrack-canvas`. Vitest 764/764, pytest 112/112, build clean, визуальная приёмка 1-pass. Один ⚓ DEC-MA2-01 — фундаментальное проектное правило, не sprint-specific.

[2026-05-01] **⚓ DEC-MA2-01: Bilingual policy — публичный код english, координационные доки русский. UI strings — централизованный `lib/strings.js` namespace dictionary без i18next infrastructure.** Раздел: **English** — все user-facing UI strings (через `STRINGS.<namespace>.<key>`), code comments + JSDoc в `gui/designer/src/`, throw / console.error / console.warn, имена переменных и функций, README.md в корне (когда будет переписан под публикацию), коммит-сообщения (с момента M-A.2). **Русский** — `CLAUDE.md` / `BUGS.md` / `CURRENT_TASK.md` / `PROJECT_STATE.md` / `DECISIONS.md` / `CHAT_PLAYBOOK.md` / `TECH_DEBT.md`, все файлы в `docs/` (спеки, ARCHITECTURE_v2, DESIGN_SYSTEM, ACCEPTANCE_ALGORITHM, CODE_HANDOFF_PROTOCOL, UX_VISION, etc.), журнал сессий, чат-обсуждения Игорь ↔ Chat. **Реализация UI strings:** `gui/designer/src/lib/strings.js` (6.6 KB) — plain JS object с named export `STRINGS`, namespace структура по компонентам (`startScreen` / `topbar` / `projectInfo` / `settings` / `toast` / `pwa` / `multiTabLock` / `hotkeys` / `placeholder` / `app` / `common`), интерполяционные функции для строк с переменными (`projectDeletedToast(name) => 'Project "…" deleted'`) — i18next-compatible сигнатура для будущей миграции через one-pass swap `STRINGS.x.y` → `t('x.y')` без рефакторинга компонентов. **Тесты импортируют `STRINGS`, не дублируют литералы** (защита от drift'а). **Dev-only текст** (throw, console.error/warn) — литералы english at call site, не в STRINGS. **Применимость на M-B+:** при первом касании любого v0.5 legacy файла в milestone'ах M-B / M-D / M-E (по reuse-списку ARCHITECTURE_v2 §8) — перевод его strings + comments входит в скоуп того спринта. Backend `src/pvcs/` чист (русских строк не найдено). Локализация (французский / японский для конференции) — отдельный milestone после v0.9, не сейчас. Стандарт индустрии для bioinfo-tools (SnapGene / Benchling / Geneious / ApE / pLannotate — все english-only без i18n инфраструктуры в первой версии).

[2026-05-01] **DEC-MA2-02: 3 правки строк на визуальной приёмке — UX consistency over literal translation.** На приёмке Игорь ↔ Chat прошлись по 15 неуверенным переводам Code'а; 12 OK, 3 поправлены: (1) `Done selecting` → `Done` (короче, стандарт exit-selection в Linear/Notion); (2) title-attr `Download .bodge files` → `Export .bodge files` (consistency с button label `⤓ Export .bodge…` — один глагол на action); (3) multi-tab takeover busy state `Confirming…` → `Taking over…` (создаёт смысловую цепочку `Take control` → `Taking over…`, убирает вопрос «что подтверждаем»). **Применимость:** при следующих переводах в M-B+ Code следует трём правилам: (a) предпочесть короткое если контекст однозначен; (b) выровнять глагол title-attr с button label (consistency); (c) busy-state глагол строится от action verb, не нейтральным `Confirming…`/`Loading…`. Также исправлен ErrorBoundary fallback в `main.jsx` (вне M-A.2 IN scope, тип D правка Chat-direct): `Ошибка рендеринга` → `Render error`, `Очистить данные и перезагрузить` → `Clear data and reload`.


---

## Sprint M-B Kickoff Formalization — Library re-definition + Importer scope (01.05.2026, третья сессия)

**Контекст.** В двух предыдущих сессиях 01.05.2026 (Sprint M-A.1 polish + Sprint M-A.2 i18n-prep) закрыт активный M-A trifecta и v0.6 frontend готов к расширению на следующие милстоуны. M-B kickoff в той же сессии 01.05 (без отдельного journal entry) переопределил Library и зафиксировал scope Importer в личном snapshot Игоря `M_B_KICKOFF_NOTES.md`. Третья сессия 01.05.2026 формализует решения как 15 ⚓ записей (9 LIB + 5 IMP + 1 REUSE) и обновляет ARCHITECTURE_v2.md секции §2.7 / §3.1 / §3.5 / §3.7 / §7 / §8.1 / §10 / §11. Снимок решений — `docs/archive/M_B_KICKOFF_NOTES.md` ✅ ФОРМАЛИЗОВАНО.

### Library (DEC-LIB-01..09, ARCHITECTURE_v2 §2.7 + §11)

[2026-05-01] **⚓ DEC-LIB-01: Library = личная коллекция контейнеров и праймеров вне проектов.** Library — flat personal collection пользователя BodgeGene, концептуально аналог `~/SnapGene Files/` или Benchling Inventory. **НЕ 3-tier ownership** (project-local / shared / catalog) как было в первом draft ARCHITECTURE_v2.md §2.7 от 29.04.2026. **Supersedes** хвост-ссылку «*симметрично с clone-on-import из Library (3 tier ownership)*» в DEC-V2-27 (механика cross-project import остаётся валидной — fullscreen modal с readOnly DagView, симметрия с library_clone сохраняется концептуально, просто Library теперь flat). UX-ориентиры: SnapGene (hotkeys + density), ApE (минимализм + скорость), pLannotate (compact data-density), частично Geneious. **Бенчлинг отвергнут как референс** — «отвратительно ванильный, функционал размазан, нет горячих клавиш» (формулировка Игоря). Реализация data-model: единая IndexedDB table `library` (DEC-V2-22) с двумя kinds: `container` и `primer`. Фильтрация в UI через kind + tags (DEC-LIB-09).

[2026-05-01] **⚓ DEC-LIB-02: Контейнеры в Library — единый класс (плазмиды + линейные), не два типа.** Топология (`circular` vs `linear`) — это атрибут MoleculeContainer (DEC-V2-13), не разделение на классы. В Library контейнеры сидят в одной коллекции, различие через топологию-фильтр в UI tab/dropdown (Все / Плазмиды / Линейные). Снимает дублирование инфраструктуры (browse, search, edit, clone) и упрощает добавление будущих вариаций (single-strand, multi-chromosome, RNA) без новых классов. Симметрия с in-project DAG где плазмида и линейный фрагмент — узлы одного типа.

[2026-05-01] **⚓ DEC-LIB-03: Праймеры — отдельный раздел Library, не вместе с контейнерами.** В Library UI два tab/filter: «Контейнеры | Праймеры». Праймеры являются ДНК-молекулами семантически, но операционно (workflow + поиск + preview) — отдельный сорт сущности (короткие, single-strand, без annotations, у них Tm/GC/binding-region а не topology/ends). Раздел сидит в той же IndexedDB table `library` через kind discriminator. Альтернативный подход «всё-в-одной-коллекции с фильтром by length / topology» отвергнут — биолог думает «праймер» и «плазмида» разными категориями.

[2026-05-01] **⚓ DEC-LIB-04: Features — derived state контейнеров, не browsable отдельно.** Аннотации (CDS, promoter, terminator, tag, etc.) живут внутри контейнера как разметка sequence (Snapshot.regions/details/points + ContainerCommit `annotation_edit`). В Library нет third-tier «Features browser» с возможностью browse'ть аннотации в отрыве от контейнеров. Library остаётся плоской двухсекционной коллекцией (Контейнеры | Праймеры). Альтернатива (отдельный Feature browser как в SnapGene Common Features pane) отвергнута — feature без context контейнера малоинформативна для биолога. **NB:** `common-features.json` (415 verified) остаётся как source для **авто-аннотатора** (`auto-annotate.js` в M-D), но не как Library tier.

[2026-05-01] **⚓ DEC-LIB-05: Sequence заморожен после первой загрузки в Library.** После добавления контейнера/праймера в Library его sequence (и базовые baseline-аннотации для контейнера) immutable. Изменение sequence — **только два пути**: (1) момент первой загрузки в Importer wizard preview-step (правка ДО commit-в-library); (2) клонирование в проект — копия живёт своей жизнью внутри проекта с собственными ContainerCommits, исходник в Library не затрагивается. Library entry — это «trusted reference catalog», не source-of-truth для редактирования. Reasoning: shared mutable references в коллекции обмена → confusing dependency graph; immutable Library + clone-by-value → predictable workflow. Симметрично frozen `baseSnapshot` (DEC-V2-13) на уровне MoleculeContainer.

[2026-05-01] **⚓ DEC-LIB-06: Связь library ↔ project — копия (origin: library_clone), не ссылка.** Контейнер из Library в проекте получает новый UUIDv7 и `origin: { kind: 'library_clone', sourceLibraryEntryId, sourceLibraryEntryHash, clonedAt }` (immutable, DEC-V2-16). Изменения в проектной копии **не влияют** на Library entry. Обновлений Library от проекта нет — explicit re-import, если хочется обновить (биолог явно делает `+ Импорт` в Library с тем же файлом, Library entry overwrites через replace flow). Подтверждает иммутабельность Library (DEC-LIB-05) на уровне reference-семантики.

[2026-05-01] **⚓ DEC-LIB-07: PrimerUsage back-references как core feature.** При просмотре контейнера видны все ассоциированные с ним праймеры (table `primerUsage` из DEC-V2-22 schema, computed из projectCommits.inputs.primerIds + containerCommits с праймером-as-input). Симметрично — на праймере видно где он используется (containers + projectCommits, derived/cached в той же table). Без back-references workflow «найти все праймеры этого backbone» требует O(N) проход по всем primerIds проекта — медленно при ≥100 праймеров. Реализация: M-F (Primer Pool + back-refs side-panel в Container Window).

[2026-05-01] **⚓ DEC-LIB-08: При импорте .dna с primer_bind+sequence → wizard step с checkbox-list, не silent extract.** SnapGene .dna файлы могут содержать primer_bind features с прикреплённой sequence (внутренние библиотеки primers). При парсинге в Importer wizard, если primer_bind features найдены **и у них есть sequence** — добавляется extra step: «В файле найдено N праймеров с известной последовательностью: [☑ M13F, ☑ T7-rev, ...]. Добавить отмеченные в библиотеку → раздел Праймеры?» Default: все галочки ☑. Если в файле primer_bind есть только как имена-метки (без sequence) — step **не показывается** вообще. **НЕ silent auto-extract** — anti-pattern «half-broken auto-extraction злит больше чем отсутствие фичи» (формулировка Игоря). Реализация: M-B.1 спека.

[2026-05-01] **⚓ DEC-LIB-09: Library — flat tagging (`tags: string[]`), без folder hierarchy.** В Library нет folder structure для организации, organization строится исключительно через теги (`tags: string[]` на каждом LibraryEntry, multi-entry IndexedDB index). Папки эмулируют filesystem mental model которая для биологии мешает: плазмида одновременно относится к проекту X, к backbone-коллекции и к серии E.coli expression — папки требуют выбора **одного** parent, теги нет. Альтернатива «вложенные folders» явно отвергнута. Симметрия с `Project.tags: string[]` (DEC-V2-30) — единый паттерн tags-based категоризации в продукте на двух уровнях (project-level + library-level).

[2026-05-01] **⚓ DEC-LIB-10: Теги живут только на LibraryEntry, поле `MoleculeContainer.tagIds: UUID[]` убирается из data-model.** Закрытие Q1 collision, оставленного в M-B Kickoff (third сессия 01.05.2026, journal): после DEC-LIB-04 (kind=feature/plan убраны из Library) поле `MoleculeContainer.tagIds: UUID[]` (ARCHITECTURE_v2 §2.1 исходный draft 29.04.2026) потеряло исходный ref-таргет. Разрешено в пользу варианта ±а (выбор Игоря при спеке M-A.3): теги ликвидируются из MoleculeContainer interface полностью. Реализация: ARCHITECTURE_v2 §2.1 патч (Chat-direct тип D, бамп версии v1.1 → v1.2). Обоснование: (а) filter «найти все bacterial backbones» работает через `LibraryEntry.tags` на слое Library, биолог не теряет use-case; (б) в проекте организация молекул идёт через DAG-навигацию + future provenance breadcrumb (M-C); (в) симметрия с DEC-V2-30 (Project.tags = flat strings) и DEC-LIB-09 (Library = flat tagging) — в продукте один паттерн tags-based категоризации (на LibraryEntry + Project), не два. Отвергнутые варианты: (b) `tagIds` реориентировать на LibraryEntry kind=container/primer рефы — сложнее ментальной модели («реф на себя из себя»), дублирование информации; (c) flat `tags: string[]` на MoleculeContainer сепаратно от LibraryEntry — два source-of-truth для тегов одной молекулы, риск drift при clone-on-import. **Кэйсы биолога разрешены:** тегирование (на LibraryEntry в Library UI), clone-on-import (теги остаются в Library, клон в проекте без тегов и без ref-связи), filter (по `LibraryEntry.tags` в Library list view, M-A.3 skeleton → M-H полный search/sort). **Риск:** биолог хочет «быстро пометить контейнер в текущем проекте» — в v0.6 решается через (1) name/description на MoleculeContainer (свободный текст); (2) DAG-навигация (роль видна из связей с ProjectCommit'ами). Если в v0.7+ понадобятся теги внутри проекта — добавим как separate concern (не ковенвенциируем с Library tags, разная семантика). **Migration cost:** нулевой — v0.6 wipe data (DEC-V2-08), контейнеры не существуют. ARCHITECTURE_v2 §2.1 v1.1 → v1.2 оформляет patch официально. **Будущие supersede:** если в v0.7+ введём «container-level tags within project» фичу — это будет новый DEC с явным «supersedes DEC-LIB-10 в части этого use-case'а», не реверт решения.

### Importer (DEC-IMP-01..05, ARCHITECTURE_v2 §3.5 + §3.1 + §3.7)

[2026-05-01] **⚓ DEC-IMP-01: Importer = точка входа внешних данных в BodgeGene в целом, не «выбор источника контейнера».** Importer — фулскрин для парсинга **внешних** форматов в внутренние сущности BodgeGene. Источники: внешний файл (`.dna` / `.gb` / `.fasta`), pasted sequence (textarea), cross-project `.bodge` (другой проект). **Library как источник Importer'а — НЕТ**: Library содержит уже-внутренние данные BodgeGene, парсить там нечего. Доступ к Library из проекта реализуется отдельной операцией «Add from library» (library picker compact UI), не через Importer. Семантически три разделённые операции:

| Операция | Триггер | Источник | Куда попадает |
|----------|---------|----------|---------------|
| Импорт в library | `+ Импорт` в Library toolbar | external file/paste/`.bodge` | только library |
| Импорт в проект | `+ Импорт` в DAG toolbar | external file/paste/`.bodge` | DAG + автоматом library |
| Добавить из library | `+ Из библиотеки` в DAG toolbar | library picker | DAG (как `library_clone` копия) |

Третья — это **library picker**, не Importer.

[2026-05-01] **⚓ DEC-IMP-02: M-B.1 — все 3 формата файлов одновременно, paste отложено в M-B.2, cross-project в M-B.3, URL в v0.7+.** В первом sub-sprint M-B.1 поддерживается file-import всех трёх форматов сразу: `.dna` PRIMARY (через `snapgene_parser.py` reuse без изменений), `.gb` через BioPython, `.fasta` через BioPython. Скоуп растёт ~×1.1 по сравнению с одним форматом, не ×3 — три формата уже работают в backend, frontend делает диспатч по extension. **M-B.2** добавляет paste-source (textarea + sequence-format detection); **M-B.3** добавляет cross-project import с readOnly DagView modal (§3.4). **URL-импорт (Addgene API и т.п.) — отложено в v0.7+** (требует CORS proxy, OAuth для некоторых registries — separate workstream).

[2026-05-01] **⚓ DEC-IMP-03: Стартовый экран — без `↓ Import sequence`.** Кнопка `↓ Import sequence` удаляется из Primary actions сидбара стартового экрана (DEC-DS-01 + ARCHITECTURE_v2 §3.1). Reasoning: без открытого проекта импортировать **в проект** некуда. Биолог с файлом без `.bodge` идёт `+ New project` → Importer из DAG-toolbar (двухступенчатый flow, но логически чистый). Принцип 1.8 (скорость не приоритет) — приоритет чистоте mental model. Импорт **в Library без проекта** возможен через separate trigger из Library fullscreen toolbar (после M-A.3 Library implementation). Старая ссылка «через Importer §3.5» в §3.1 удаляется, остаются только `+ New project` + `↑ Open .bodge…` в Primary actions.

[2026-05-01] **⚓ DEC-IMP-04: M-B.1 skeleton — оба контекста (in-project + library) одновременно.** Importer запускается из двух мест в M-B.1: (a) **DAG toolbar (in-project context)** — результат: контейнер появляется в DAG проекта + автоматически копируется в Library (одна операция импорта = два места); (b) **Library toolbar (into-library context)** — результат: контейнер появляется в Library только (без открытого проекта или с открытым — поведение симметрично, проект не модифицируется). Реализация: единый Importer фулскрин-компонент с prop `target: 'project' | 'library'`, различается только финальный шаг «куда положить результат» — парсинг + preview + wizard primer-step (DEC-LIB-08) одинаковы. Старый «Контекст A: запущен с no-project state» из ARCHITECTURE_v2 §3.5 (29.04.2026) удаляется (DEC-IMP-03).

[2026-05-01] **⚓ DEC-IMP-05: Rich preview default в Importer (reuse v0.5 visualization).** Importer wizard preview-step рендерит rich preview, не minimal text-only. Reuse `PlasmidMiniMap.jsx` (Importer preview-карточка) + 3-section structure (map / annotations / sequence) для контейнерных файлов; для праймеров — простой sequence-card с Tm/GC. Минимальный preview (text only с counts features/length/topology) был кандидатом — отвергнут. У нас **готовая экосистема визуализации v0.5** (DEC-REUSE-01) — использовать её в Importer экономически дешевле и более информативно для биолога чем строить минимальный preview с нуля. Биолог принимает решение «импортировать или отменить» по визуалу, не по числам.

### v0.5 visualization reuse (DEC-REUSE-01, ARCHITECTURE_v2 §8.1)

[2026-05-01] **⚓ DEC-REUSE-01: v0.5 visualization → first-class reuse в M-B (preview) и M-C (Container Window).** Полная экосистема визуализации v0.5 переиспользуется в v0.6 milestones M-B / M-C / M-E как базовые building blocks, не «временные адаптеры». Wipe data — да, wipe code — нет. Полгода работы над минимапами / парсером / аннотатором / трёх-секционным viewer'ом — first-class basis новой архитектуры.

| Компонент | Размер | Где применяется |
|-----------|--------|-----------------|
| `PlasmidMiniMap.jsx` | 20.6 KB | Importer wizard preview (M-B); Container Window header minimap (M-C) |
| `PlasmidMap.jsx` | 34.3 KB | Container Window full circular viewer (M-C) — feature arcs, sub-tracks, RE sites + MCS, primer arcs, junction zones, zoom/pan |
| `PlasmidViewer.jsx` | 20.1 KB | Container Window read-only modal **основа** (M-C) — three-section: map + annotations table + colored sequence + AA + RE markers. Почти готовая база. |
| `SequenceMapView.jsx` | 21.8 KB | Container Window sequence section (M-C) — SnapGene-style double-strand, primer tracks, AA, hotkeys P/R/Ctrl+C для primer-from-selection |
| `SequencePreview.jsx` | 15.0 KB | Inline preview в Importer wizard и других местах (region labels, AA, ruler) |
| `AnnotationEditor.jsx` | 15.1 KB | Features table read-only mode в M-C, editable mode в M-D |
| `RacetrackView.jsx` | 8.2 KB | Mix Workspace stadium view для circular (M-E, **не M-B**) |

Backend reuse без изменений: `snapgene_parser.py` PRIMARY .dna парсер, BioPython fallback для `.gb` / `.fasta`, `common-features.json` (415 verified features) как source для авто-аннотатора (DEC-LIB-04). Это дополняет общий list reuse в ARCHITECTURE_v2 §8.1 — там уже было `FragmentEditor/`, `annotation-model.js`, расчётные модули. Эта запись оформляет visualization-стэк как явный first-class block.

---

**Status changes 01.05.2026 (третья сессия):**
- `M_B_KICKOFF_NOTES.md` 7 KB → `docs/archive/M_B_KICKOFF_NOTES.md` со штампом `**Статус:** ✅ ФОРМАЛИЗОВАНО 01.05.2026`.
- ARCHITECTURE_v2.md обновлён в 8 секциях (§2.7 Library полная замена; §3.1 убран `↓ Import sequence`; §3.5 Importer 3 источника + 2 контекста + wizard primer-step; §3.7 Mermaid схема обновлена; §7 v0.6.0 M-A.3 + детализация M-B.1/B.2/B.3; §8.1 visualization first-class reuse block; §10 + DEC-LIB-01 reasoning; §11 Глоссарий Library + Clone-on-import).
- 4 открытых вопроса для следующих kickoff'ов (Q3 drag-drop в Importer, Q4 preview-step lightweight vs heavy, Q5 identity нового container auto-detect vs confirmation, Q6 no-project flow без `↓ Import sequence` onboarding) — могут решиться inline в спеке M-B.1, либо отдельным mini-kickoff.


---

## Архитектурная гигиена calibration (08.05.2026)

**Контекст.** Правило размеров от 22.04.2026 (⚓ выше, «Архитектурная гигиена») калибровалось эмпирикой одного case (FragmentEditor 62 KB реально болел) с cliff-cutoff 40 KB / 25 KB. После 6 закрытых спринтов (Sprint X cycle, App-Decomp, M-A series, M-B series, M-X.* track, Library refactor) собрана статистика: декомпозиция окупается не от формального размера, а от **rate-of-change × entanglement** конкретного файла. PlasmidUseWizard 38.79 KB сидит в soft-зоне почти 2 года stable — формальное превышение в 39 KB не болит. AnnotationTrack 41.6 → 48.54 KB за 2 спринта — реально болит, потому что paint-only stripe / bridge wrap / sub-features render переплетены. LibrarySingleInspector 32 → 45.94 KB за один спринт (K6/K7/K10/K11 wiring) — реально болит, потому что edit-flow зон конфликтует. Соответственно правило 22.04.2026 нуждается в калибровке: cliff-применение даёт false-positive (TD-galочки на стабильных файлах) и false-negative (rate-of-change ловит позже чем нужно). Не отменяет 22.04.2026 anchor — расширяет его триггерами.

[2026-05-08] **⚓ DEC-SIZE-CALIBRATION-01 — лимит размера модулей: cliff → review-point с rate-of-change и entanglement triggers.** Калибровка ⚓ 22.04.2026 «Лимит размера модулей». Lim­it'ы 30/40 KB (.jsx) и 20/25 KB (.js) **остаются как trigger «пора думать»**, не как hard cliff. Формальное превышение hard НЕ автоматически требует декомпозицию первым пунктом спеки. Вместо этого:

1. **Soft (30 KB .jsx / 20 KB .js)** — watch signal. Chat в drift check фиксирует, Code в отчёте упоминает рост >2 KB. Никакого блокирующего правила.
2. **Hard (40 KB .jsx / 25 KB .js)** — review point, не cliff. Code в отчёте после спринта **обязан** дать строку: «файл [имя] X KB, growth за спринт Y KB, entanglement: [есть / нет]. Decomp: [нужен сейчас / отложен потому что причина]». Chat читает строку и спорит если нужно. Без этой строки — отчёт неполный.
3. **Rate-of-change trigger** — если файл вырос >5 KB за спринт **два спринта подряд** — обязательная декомпозиция в следующий спринт. Это ловит AnnotationTrack-паттерн (41.6 → 48.54 за 2 спринта) до того как файл становится untouchable. Stable файлы в soft-зоне (рост ≤1 KB / спринт) не задеваются.
4. **Entanglement check** — вторая колонка hard-violation review: «правка одной фичи в этом файле может сломать другую: [да / нет]». AnnotationTrack — да (sub-features через regions через wrap-tail). LibrarySingleInspector — да (K6 edit состояние конфликтует с K7 save state). PlasmidUseWizard — нет (10 режимов изолированы). Если entanglement=нет — формальный размер не повод декомпозировать; entry в TECH_DEBT держится в watch list, не блокер.
5. **Stable-file exemption** — если файл стабилен 2+ спринта подряд (рост ≤1 KB) при формальном превышении hard, **не триггер декомпозиции** до факта роста или explicit правки в этой зоне. TD entry перемещается из «Активный decomp» в «Watch list».

**Не отменяет ⚓ 22.04.2026** (декомпозиция в скоупе спеки на active growth zone остаётся обязательной — сейчас это LibrarySingleInspector / AnnotationTrack / SequenceView/index.jsx). Не отменяет ⚓ 23.04.2026 (декомпозиция должна закрывать hard в одном спринте — остаётся валидной, при условии что декомпозиция вообще начата). Расширяет: добавляет триггеры для решения «начинать декомпозицию сейчас или отложить».

**Применение к открытым TD-SIZE-* пунктам (snapshot 08.05.2026):**

| Пункт | Размер | Активный / Watch | Триггер |
|---|---|---|---|
| TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 | 45.94 KB | **Активный** | Rate-of-change (32→45.94 за 1 спринт) + entanglement=да |
| TD-ANNOTATIONTRACK-DECOMPOSE-V2 | 48.54 KB | **Активный** | Rate-of-change (41.6→48.54 за 2 спринта) + entanglement=да |
| TD-SIZE-SEQUENCEVIEW-INDEX | 38.78 KB | **Активный** | Каждый M-X.* round +1-2 KB, M-X.6 K2/K3 трогают |
| TD-SIZE-AATRACK | 38.91 KB | Watch | Stable после V50 fix, нет active расширения |
| TD-SIZE-PLASMID-USE-WIZARD | 38.79 KB | Watch | Stable 6+ месяцев, entanglement=нет (10 режимов изолированы) |
| TD-SIZE-DESIGN-CANVAS | 37.06 KB | Watch | Stable, 4 view modes изолированы |
| TD-SIZE-PLASMID-MAP | 35.59 KB | Watch | Stable после Map-WS-1 cycle |
| TD-SIZE-ADD-FRAGMENT-MODAL | 35.51 KB | Watch | Stable, не задевается активными спринтами |
| TD-SIZE-PROTOCOL-TRACKER | 31.03 KB | Watch | Stable, ждёт M-E (тогда повышается) |
| TD-SIZE-JUNCTION-BLOCK | 29.23 KB | Watch | Stable, ждёт M-E |
| TD-SIZE-PLASMID-MINI-MAP | 29.68 KB | **Удалить из TD** | Рост стабилизировался, не превышает soft 30 KB |

Правило для TECH_DEBT.md: «Активный decomp» — реальная работа в ближайших спринтах; «Watch list» — мониторинг, действие триггерится правилом 3 / 5 выше; формальные violations без активного impact — удалять из TECH_DEBT, не нести как мёртвый груз.

**Trade-off / risk.** Calibration делает правило менее автоматическим: Chat должен судить «entanglement да или нет?» и «active growth или нет?». Это субъективнее cliff'а. Митигация: критерии явно (rate >5 KB × 2 спринта; entanglement = «правка одной фичи может сломать другую»), Code отчёт стандартизирован (5 пунктов выше), Chat drift check проверяет применение в каждой milestone-сессии. Если 2-3 спринта подряд решения по hard violations расходятся между Chat и Code — пересматриваем правило, возвращаем cliff.

**Применимость на v0.6+:** все будущие милстоуны M-C / M-D / M-E / M-F / M-G / M-H / M-I + M-X.* track. Не применимо к v0.5 legacy без активной правки (PlasmidUseWizard, DesignCanvas, AddFragmentModal, PlasmidMap, JunctionBlock, ProtocolTracker — Watch до момента, когда соответствующий milestone их трогает).

---

## ⚓ DEC-CSSVAR-NO-FALLBACK-01 (09.05.2026) — hex fallback в inline styles запрещён

**Контекст.** v0.6+ codebase должен корректно рендериться в обеих темах (light + dark). Биолог работает в dark theme; многие design assets нарисованы под light. Распространённый антипаттерн в inline styles: `style={{ background: 'var(--surface-1, #ffffff)' }}` — hex fallback («if var не определён, используй #ffffff») выглядит безобидно на light, но ломается на dark: если token не определён в dark theme overlay, фаллбек `#ffffff` даёт белую поверхность в тёмном UI (инвертированный тон). M-X.7a inventory вывел 35 расхождений, немалая часть из которых (§G2 inventory) именно из-за hex fallbacks.

**Решение.** В inline styles **запрещены** hex fallbacks в форме `var(--token, #hex)`. Два приемлемых подхода:

1. **Без fallback'а:** `style={{ background: 'var(--surface-1)' }}`. Если token не определён — браузер отрендерит transparent, биолог увидит visible degradation и сообщит (явный bug, ловится в первую же приёмку).
2. **CSS module / global stylesheet:** вынести стили из inline в .css файл, где token используется без fallback'а. Cascade работает корректно через `[data-theme="dark"]` overrides.

**Чего НЕ делать:** `var(--token, #hex)` — hex fallback почти всегда tone-incorrect хотя бы в одной из тем. Исключения нет; tone-correct fallback для обеих тем в одном hex невозможен.

**Применение.**
- **Новый код (все спринты после 09.05.2026):** запрещено. Code в отчёте `[G2] theme audit` перечисляет все случаи fallback'ов в тронутых файлах и их удаление.
- **Существующий код:** мигрирует постепенно по мере правок (Code при любой правке файла убирает hex fallbacks в этом файле заодно). Cross-cutting cleanup-спринт не делается специально — вынуждающий trigger будет visual incident в теме.

**Вывод.** Token или ничего. Никаких hex.

**Связь с другими anchor'ами:** DESIGN_SYSTEM.md tokens — single source of truth (все tokens определены там для обеих тем).

---

## Sprint v0.8.2 — UI revision + project hub + store actions purification (10–11.05.2026)

**Общий итог ANCHORS.md после v0.8.2:** **64 ⚓** (было 61). Три sprint-level DEC промоутированы в ⚓ после visual acceptance M-X.8 + M-X.9 + Фикс 7 (11.05.2026).

Три sprint-level DEC промоутированы в ⚓ после visual acceptance M-X.8 + M-X.9 + Фикс 7. Полные формулировки sprint-level — в `DECISIONS.md` sprint block v0.8.2.

**[2026-05-10] ⚓ DEC-UIRREV-ZONES-MERGE-01 — Tree зон 2 (`loose` + `bodge`), не 4.** `library-zones.js::classifyEntryZone` возвращал 4 варианта: `loose | active_bodge | readonly_bodge | lab_pool`. После M-X.7c K3 — две зоны. «Active» / «readonly» — состояние UI, не свойство записи. Различение между проектами — через `entry.projectId`, не через зону. Lab pool = View, не Zone (`inLabStock` — флаг на entry). Lazy migration: legacy зоны мапятся в hydrate. **Подтверждено M-X.8** — паттерн «2 зоны + projectId как discriminator» переехал в реальный workflow Tree current-first / pinned others / collapsible all-others без нареканий. **Применимость:** любые grouping-решения в codebase — zone хранится в энтити только если entity онтологически принадлежит zone; UI-states (active / readonly / view-filtered) никогда не записываются в zone field.

**[2026-05-10] ⚓ DEC-UIRREV-ACTIVE-SINGLE-01 — Один активный проект одновременно.** `projectSlice.currentProjectId` (ожидалось rename из `activeProjectId`, но codebase уже использовал currentProjectId — rename не потребовался) — единственное поле определяющее активный проект. Тег `[active]` / pill / ★ marker рендерятся только когда `entry.projectId === currentProjectId`. Никаких множественных `[active]` (старая интерпретация «открыт хотя бы раз» удалена). **Подтверждено M-X.8** — `pinnedProjectIds[]` (явное «в работе» — не активное), `recentProjectIds[]` (MRU — не активное) — всё это параллельные семантики, не заменяют currentProjectId. **Применимость:** любое «текущее» / «фокусное» / «выбранное» state в store — одно поле, не array; multi-select / multi-pin и прочие являются отдельными semantics, не supersede.

**[2026-05-10] ⚓ DEC-PROJSLICE-ACTIVATE-PURE-01 — Store actions side-effect-free: action = canonical state, mode = callsite.** Корень FAIL #4 (Tree click в non-current проект переключал workspace в DAG): `projectSlice.activateProject(id)` мутировал `state.canvas.activeFullscreen='dag'` + navStack вместе с currentProjectId+MRU. После фикса — action делает только canonical state. Workspace mode — responsibility callsite (Sidebar ставит 'library', DAG хендлеры 'dag'). **Применимость:** инвариант для всех store actions в BodgeGene. Actions мутируют canonical state (то что персистится / выражает домен), не UI-derived state. UI-mode switches, navigation, scroll-position и прочие transient view-states переключают callsites (component handlers, hooks). Нарушение — reopen issue: action с hidden side-effect ломает тесты и интуицию при reuse. Спеки новых actions явно прописывают canonical-only invariant. **Обслуживается спец regression test:** `does NOT mutate canvas.activeFullscreen` (добавлен в `projectSlice-activate-project.test.js`, M-X.7c FAIL-fix #4).

**Связь с другими anchor'ами:**
- DEC-PROJSLICE-ACTIVATE-PURE-01 **развивает DEC-MA1-XX state-management invariants** (multi-tab guard, recent MRU, soft-delete) — все store actions берутся под то же правило.
- DEC-UIRREV-ACTIVE-SINGLE-01 **совместим с DEC-V2-13..18** (data-model project hierarchy) — currentProjectId на store-уровне мапится в single Project entity в ProjectsTable.
- DEC-UIRREV-ZONES-MERGE-01 **в линии DEC-LIB-10** (tags на LibraryEntry, не на container) — «свойства хранятся где онтологически принадлежат» как sweep паттерн.

**Trade-offs.**
- *Pro:* тестируемость actions радикально растёт — unit-тест проверяет только canonical state выхода.
- *Pro:* reuse actions безопасен — можно вызвать из разных UI без опасения hidden side-effects.
- *Con:* callsites становятся «умнее» — каждый обязан выбрать mode явно. Митигация: convenience wrappers в hooks (`useActivateAndOpenLibrary(id)` вызывает activateProject + setWorkspaceActive('library')) — это composition, не action.

**Open questions.** Связка правила с `canvas.activeFullscreen` (legacy navigation state с navStack) vs `workspace.active` (новый) — это два navigation-state field'а сосуществуют (дубль в COMPONENT_MAP). Слияние в одно поле — отдельный sprint, до этого правило касается обоих state симметрично.

---

## Sprint v0.8.3-alpha — Four-tier architecture — sprint-level reversals + promotion candidates (16–18.05.2026)

**Контекст.** Спринт v0.8.3-alpha (T1-T10 + T4.5 + canvas UX + primer redesign) вводит в canvas-skeleton четырёх-уровневую архитектуру (containers / pieces / operations / zones) по якорю `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md`. 84 sprint-level DEC записаны в DECISIONS.md sprint-block v0.8.3-alpha. Эта секция фиксирует (а) реверс двух sprint-level решений (никогда не бывших ⚓, но важных для истории) и (б) 3 promotion candidate на ⚓ статус — подтверждение после визуальной приёмки T-серии и 1-2 спринтов живучести в production code.

### Sprint-level reversals (17.05.2026)

[17.05.2026] **Реверс DEC-T3-08 (Default zone seeded в buildInitialState).** По AskUserQuestion Игоря «Полностью из state». Изначально DEC-T3-08 (16.05) записывала: «new project получает default zone "Сборка 1" в buildInitialState — biolog видит рамку сразу вместо blank canvas». После визуальной приёмки 17.05 Игорь решил: blank canvas предпочтительнее — сборка создаётся явно через «+ Сборка», не сидится из state. `buildInitialState` больше НЕ сидит zone; `zones:[]` всегда на свежем снапшоте. Сопутствующе реверснута V61 (см. ниже) — «полностью из state» подразумевает и ghost-respawn отключён.

[17.05.2026] **Реверс V61 / DEC-CANVAS-GHOST-RESPAWN (`ensureGhostPlaceholder` финализатор).** V61 спринт (14.05.2026) вводил: «на canvas всегда РОВНО 1 ghost; при fill — новый ghost auto-respawn'ится в углу». После 17.05 (в составе canvas cleanup) — ensureGhostPlaceholder финализатор отключён. Чистый старт без авто-госта. Новые фрагменты — через explicit действия (кнопки «+ Сборка» / «+ Операция» / drag-drop из LibraryTree). `justDraggedRef` guard (V62 часть) сохранён и расширен на op-drag (drop-release ромба не открывает viewer).

**Оба реверса — sprint-level, никогда не являлись ⚓ fundamentals.** Эта запись — append-only history fact, не суперсед ANCHORS записи. Изначальные решения DEC-T3-08 и V61 остаются в DECISIONS.md sprint-block v0.8.3-alpha с пометкой «REVERSED 17.05.2026».

### Promotion candidates на ⚓ (ждут подтверждения production-workflow)

[18.05.2026] **DEC-CANVAS-4T-01 — Piece как первичная сущность.** Piece — concept-ориентированная сущность «кусок ДНК» живёт в `state.pieces[]`, НЕ в op.params или container.fragments[]. Свойства: sourceIds[] (откуда взят) + ranges[] (какие диапазоны) + origin (selection/feature/existing-primers/new-primers/legacy-migration/manual-gap) + acquisitionMethod (pcr/restriction/ov-pcr/synthesis/direct/undefined) + acquisitionParams + derivedReactionId (auto-link op T8) + frozen + kind (sourced/gap) + color (stable HSL hash). Это fundamental рефактор от segments-as-implicit к pieces-as-first-class (ранее было: segment embedded в assemblyDraft, не reusable, не имел acquisitionMethod). **Promotion blocker:** подтвердить в живом визуальном workflow биолога что «piece-first» эргономичнее чем «segment-first» предыдущих версий. Кандидат на ⚓ промоцию после 1-2 спринтов живучести в production code.

[18.05.2026] **DEC-CANVAS-4T-07 — Zone как Miro-frame.** Zone — визуальный контейнер на canvas с bounds {x,y,width,height} + viewMode («graph»/«sequence») + laneLayout («auto»/«manual») + collapsed + notes + autoResize. Узлы (containers/pieces/operations) держат `zoneId`. Рамка рендерится как DOM/CSS frame (не SVG) с drag/resize/merge возможностями. Cross-zone refs auto-detected (T8 link badges). Это supersedes «один плоский canvas со всеми узлами» predecessor design. Zone supersedes `assemblyDraft` concept (T6 migration v8→v9). **Promotion blocker:** подтвердить на практике pks4 knockout (16-node scenario из бумажной диаграммы Игоря) что Miro-frame подход лучше «плоского canvas» или «отдельных tabs per assembly». Кандидат на ⚓ промоцию.

[18.05.2026] **DEC-CANVAS-4T-31 — 3-lane auto-layout structure (T4.5).** Внутри zone узлы разлагаются по 3 рядам слева-направо: sources lane (top, containers без incoming junctions) / intermediate lane (middle, dagre LR auto, всё остальное + intermediate-products) / finals lane (bottom, containers без outgoing junctions и frozen=true). `node.pinned: false` field default; drag узла → auto-pin (финалайзер не пересчитывает pinned). Context-menu «Открепить». `zone.laneLayout: 'auto'|'manual'` per zone (default 'auto'). dagre как npm dependency (~40 KB bundle, Mermaid uses, proven). Это решение «свального греха» видимого на скрине 17.05 (pks4 16-узловый хаос). **Promotion blocker:** подтвердить на реальных сборках (не только pks4) что 3-lane превосходит варианты A (plain dagre flat), B (radial), C (no-auto-layout manual). Кандидат на ⚓ промоцию.

**Наблюдаемые инварианты этого спринта:** schema v=10 (6 миграций все идемпотентны), Vitest 3276 pass / 1 skip / 0 fail (+956 от v0.8.2), `vite build` clean. 84 DEC в sprint-block DECISIONS.md — полный список с обоснованиями. ~32 KB якоря-спека `SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` + ~360 KB sprint-спек `SPRINT_T*.md` — референсы для всех 84 DEC.

---

**Исторические записи старше Sprint 2a (с полными формулировками):** `docs/archive/DECISIONS_2026_Q2.md`.

---

## Mutability semantics — freeze-on-use in operation (15.05.2026)

**Контекст.** Walkthrough-сессия 15.05.2026 закрыла модель Canvas V2 (16 решений, документ `docs/NOTES_CANVAS_V2_KICKOFF.md` §9). Q4 из §5 этого же документа (mutability pattern) оставался открытым с 11.05 kickoff'а. Развилка: A (free editability — теряет историю) / B (lab journal — freeze on use) / C (Git-style explicit commits). Игорь выбрал B1 + git-составляющая в roadmap как отдельный sprint позже.

[2026-05-15] **⚓ DEC-MUTABILITY-FREEZE-ON-USE-01: filled container становится immutable когда впервые используется как input в operation. До использования — свободно редактируется. Изменение frozen container = создание child-version, исходный остаётся в Tree как frozen entry.**

**B-subvariants проанализированы.** B1 (freeze-on-use-in-operation) выбран. B2 (freeze-on-canvas-drop) отклонён — слишком строго, биолог может опечататься в имени до первого использования. B3 (freeze-on-save-to-Tree) отклонён — размывает Tree, черновики на canvas остаются вне versioning'а.

**Реализация.**
- Computed property `container.frozen`: true если `container.id ∈ ⋃ operation.inputs` по всем ops проекта. Реализовывается через Zustand selector `isContainerFrozen(state, containerId)` (computed-on-demand) либо denormalized cache `container.frozen: boolean` — выбор в Spec 1.
- UI: frozen container получает визуальный маркер (lock icon / серая заливка / outline — развилка для Spec 1).
- Edit-attempt на frozen container → modal «Создать новую версию» с автогенерацией имени (`name + "-v2"`) и pre-applied edit. Cancel → отмена.
- Child-version имеет `parentContainerId` ref для history tracing (фундамент будущего git-слоя).

**Связь с git-составляющей.** B1 — implicit pseudo-commit на момент использования. Git-слой в roadmap (после F4 Live Product Preview) перекроет это explicit commit/branch/diff моделью; B1 не противоречит, остаётся fallback для quick edits до явного commit. Container с git-историей будет: `frozen=true` после первого commit, child-versions = git branches.

**Влияние на спеки F1-F4.** Перед Spec 1 Window System Foundation. Skeleton-state schema должна поддерживать `frozen` semantics с самого первого спринта, иначе миграция дороже после написания 4-х спек.

**Trade-offs.**
- *Pro:* история не теряется, биолог через неделю может проследить «откуда взялся pET28a-v2».
- *Pro:* конкурентное преимущество против SnapGene (где нет history) — главное лицо «AI-ready agent-readiness» из обсуждения 15.05.
- *Pro:* B1 — мягчайший из freeze-вариантов, не пугает биолога-новичка («положил на canvas — frozen» из B2 страшнее).
- *Con:* при множественных мелких правках до первого использования биолог не получает versioning. Митигация: git-слой в roadmap.
- *Con:* конкретный визуальный indicator frozen vs unfrozen — открытая UX-развилка для Spec 1.

**Открытые вопросы.**
1. Как пересекается с PreImportModal / AddModal флоу? При импорте экспортированного .bodge с frozen-containers — ресторятся ли связи frozen status? Ответ — в Spec 1 после чтения кода.
2. Как отображается frozen container в SequenceView Editor? Нельзя редактировать, но можно просматривать, выделять, копировать selection? Ответ — в Spec 3 PCR Operation Mode (вьювер в operation-aware режиме на frozen container'е).
3. Множественные child-versions одного парента (pET28a-v2, pET28a-v3, ...) — как биолог навигирует между ними? Tree показывает все версии флатом или collapsible parent-with-versions? Ответ — в Spec 1 либо отложить до git-слоя.

---

## Sprint M-B FINAL — Importer rework + post-acceptance polish + Catalog tree rewrite (02.05.2026, v0.6.4 → v0.7.0)

**Контекст.** Первый user-facing milestone v0.6+ реализован в три этапа в одной ветке `feature/racetrack-canvas`: M-B.1 (`1e25c7d` → `65aada3`) Step1→Step2 flow + MoleculeWorkspace + primer wizard + autoname collision; **M-B.2 rework** (`f2554fd` → `c36d7bc`) — single-screen 4-column layout заменил двухэкранный flow, lazy-mount табов закрыл V49 50-сек hang; **post-acceptance polish 3 round'а** — `8e9debe` (catalog scroll-anchor) → `3281779` (Library wipe + TagsEditor) → `18e86ce` `a547f26` (StartScreen Library link) → `23bf484` `7146af9` (palette A+v2 + shade + canonical-key) → `03e3c11` (DESIGN_SYSTEM §2.1) → `20508d5` (StartScreen UX) → `219c2d7` `98172f7` (Importer Critical/High) → `c1f66ed` (Polish round 2: simple-mode rip); **v0.7.0 catalog tree rewrite + folder-in-folder + auto-annotate cleanup** — следующая серия коммитов по биологу-вождю фидбэку (см. RELEASES.md v0.7.0 скоупы). **Vitest 885/885, pytest 112/112, build clean.** **Sprint-level decisions** — в `DECISIONS.md` (DEC-IMP-13..14, DEC-IMP-16..18, DEC-CAT-01..03, DEC-AA-01, DEC-MB-01..02). Ниже — три ⚓ fundamental, извлечённых после всех трёх этапов — это паттерны, выходящие за Importer-specific scope и воспроизводящиеся в M-D / M-E / M-H.

[2026-05-02] **⚓ DEC-IMP-15: Lazy-mount heavy tab content as performance & memory invariant.** Табы в fullscreen UI рендерят heavy components (sequence viewers, annotation editors, plasmid maps, DAG views) ЧЕРЕЗ РЕАКТИВНЫЙ CONDITIONAL RENDER `{activeTab === 'X' && <HeavyComponent .../>}`, НЕ через `display: none` / `visibility: hidden` / `<Hidden show={...}>` паттерны. Обоснование: V49 показал что даже с hidden-DOM heavy mount съедает ~50 сек на средней плазмиде под React 19 reconciler'ом — SequenceMapView с двуцепочечной 5333×2 + ~1700 AA codon rows + AnnotationEditor compact = 12–15K DOM nodes выживают hidden-render но всё равно mount'ятся. Lazy conditional render обнуляет cost до нуля пока биолог не кликнул таб. **Применимость:** все будущие fullscreen UIs с табами — Container Window M-D (Map / Sequence / Annotations / History / Mutagenesis tabs), Mix Workspace M-E (Reactions / Components / Protocol tabs), Library polish M-H (Containers / Primers / Tags filter view), Project DAG с fullscreen-modal'ами. Регрессия-guard паттерн — `<feature>/__tests__/lazy-tabs.test.jsx::default-tab-no-<heavy-component>` PASS (обязательный в каждой fullscreen-спеке с tabs).

[2026-05-02] **⚓ DEC-DS-02: Feature palette A+v2 + `featureColorShaded(type, name)` HSL shade-by-canonical-key — единый источник цвета для всех plasmid renderer'ов.** Базовые hex-цвета (CDS зелёный / promoter оранжевый / resistance ярко-оранжевый / reporter розовый / origin / terminator / tag / linker / signal_peptide / propeptide / regulatory / polyA_signal / core_promoter / restriction_site / ...) живут в едином `feature-palette.js` (warm-sepia stroke `FEATURE_STROKE` сохранён из v0.5). **Shade-by-name** — `featureColorShaded(type, name)` выдаёт base hex для типа плюс HSL shade ±10% L / ±6° H keyed by `canonicalFeatureKey(name)` — это делает различимыми соседние features одного типа (два CDS не сливаются в одно пятно). **Canonical-key collapse** — словарь из 30+ entries схлопывает synonym'ы в один shade (AmpR ≡ ApR ≡ bla → один оттенок во всех рендерах плазмиды). **Применимость:** PlasmidMap, PlasmidMiniMap, RacetrackView, OverviewTab summary chips, Inspector tag chips — все рендереры ходят через `featureColorShaded(type, name)`. Не hardcode'ить hex в компоненте; не создавать local palette overrides. **Supersedes** Okabe-Ito v0.5 base (⚓ в §1 «UX-инварианты») — Okabe-Ito остаётся как accent для UI chrome (toast / accent buttons / focus rings), feature palette — собственная. DESIGN_SYSTEM.md §2.1 — source of truth для hex и canonical-key map.

[2026-05-02] **⚓ DEC-CAT-04: Folder-as-slash-path — иерархия через string с separator'ом, не вложенная object-tree в data model.** Папки в любых user-organizable коллекциях (Library, Importer Catalog, future Project Files, future Mix Workspace) хранятся как flat list слаш-путей (`Vectors/CRISPR`, `Backbones/Pichia/AOX1`). `buildFolderTree(paths)` парсит flat list в forest для UI render'а, `MAX_INDENT_DEPTH` ограничивает visual depth (5 в v0.7.0). **Persistence:** `userFoldersByGroup: {canvas, demo, mine, snapgene}` в localStorage / IndexedDB как `string[]`. **Преимущества:** (а) move подпапки = string-replace `s/^Old\//New\//` в одном месте; (б) backup/restore — plain text export/import; (в) merge folders = объединить два path'а в один (string concat); (г) нет risk'а orphan'ов (все paths видны в flat list, не потеряются внутри nested object). **Отвергнутые альтернативы:** (a) nested `Folder = {name, children: Folder[], items: ItemId[]}` — сложнее reducer'ы, immer-недружественно на deep moves; (b) tags вместо folders (⚓ DEC-LIB-09 в Library context) — не работает как navigation paradigm в поверхностях где биолог хочет file-manager mental model (Importer catalog browse). **Совместимость с DEC-LIB-09:** ⚓ DEC-LIB-09 фиксировал «Library — flat tagging, без folder hierarchy» как data-model contract LibraryEntry. DEC-CAT-04 НЕ supersede это: на LibraryEntry теги остаются как организация content-level (search/filter «bacterial backbones»). Folders — это UI organization layer НАД entries («я положил pUC19 в папку Backbones/E.coli»), живут в separate userFoldersByGroup state, реализуются через tag prefix с separator'ом в `LibraryEntry.tags` (т. е. tag `Backbones/E.coli` плюс membership-membership через filter, final pattern уточнён в DEC-CAT-03 и DECISIONS.md sprint-block). Оба паттерна сосуществуют: tags = что это (semantic), folders = где это (location). **Применимость:** Library M-H polish (search по tags + folder tree); Importer catalog v0.7.0 (все 4 источника используют схему); future Project Files (импорт / draft / archive); future Mix Workspace component grouping.

---

**Исторические записи старше Sprint 2a (с полными формулировками):** `docs/archive/DECISIONS_2026_Q2.md`.

---

## Sprint Interoperability — форматы файлов как обязательство перед экосистемой (08.05.2026)

**Контекст.** Сессия по сути продукта и первому экрану. При разделении actions на Start screen на блоки PROJECT (`.bodge`) / SEQUENCE (single molecule файлы) / BROWSE (Library / Primer pool / All projects) всплыли два вопроса. Первый — как называть BodgeGene-родный формат одного контейнера (аналог SnapGene `.dna`) — биолог предложил `.bodgebox`, этимологически парный к `.bodge` (project) + семантика «коробка с одной молекулой» ложится на «imorphism data ↔ протокол» (принцип 1.13 ARCHITECTURE_v2). Второй, ключевой — «он должен нормально восприниматься программами кушающими .gb. Надо чтобы обратная совместимость была максимальная. Мы не можем себе позволить проприетарные форматы». Это переопределяет всю стратегию: форматы BodgeGene не «наш ZIP с внутренними файлами», а valid GenBank плюс опциональный провенанс-слой в standard COMMENT block. **Extends DEC-V2-26** (29.04.2026, GenBank export per container с structured COMMENT для provenance) — это внутренний export pattern становится public format spec, primary-путём распространения данных проекта.

[2026-05-08] **⚓ DEC-INTEROP-01: Все BodgeGene-родные форматы — valid GenBank с opt-in provenance в COMMENT block. Никаких proprietary fields, бинарных кодировок вне base64-json, или custom encodings в core data.** Обратная совместимость с экосистемой — first-class обязательство, не nice-to-have. Каждый BodgeGene-файл перед отправкой коллеге без BodgeGene остаётся полезным.

**Два родных расширения.**

- **`.bodgebox`** (один контейнер) — валидный GenBank файл в raw виде (не ZIP). LOCUS / DEFINITION / FEATURES / ORIGIN по стандарту NCBI. BodgeGene-provenance в структурированном COMMENT block. Переименование в `.gb` — bit-perfect эквивалент, открывается в SnapGene/ApE/Geneious/BioPython без потерь sequence + features. Provenance round-trip сохраняется везде где эти tools презервируют COMMENT verbatim (NCBI-blessed).
- **`.bodge`** (весь проект) — ZIP с N валидных GenBank файлов по контейнеру + plain JSON manifest/dag/primers/library/refs. Переименование в `.zip` + extract = working multi-file «backup» проекта. Внутри любой получатель без BodgeGene видит N отдельных GenBank-плазмид и открывает по одной в своём инструменте; DAG-связи теряются, sequence + features + per-container provenance сохраняются. Graceful degradation, не lock-in.

**Provenance COMMENT block.** Паттерн из DEC-V2-26 в общем виде:

```
COMMENT       ##BodgeGene-Provenance-START##
              schema      :: https://bodgegene.dev/schema/v1
              format      :: base64-json
              payload     :: <base64-encoded JSON пары ~5–50 KB>
              ##BodgeGene-Provenance-END##
```

Payload содержит: `containerId`, `baseSnapshotHash`, `currentHash`, `topology`, `ends`, `origin` (discriminated union), `provenance` (project context, agent, createdAt), `commits[]` (все ContainerCommits применённые к baseSnapshot), `primersEmbedded[]` (при экспорте вместе с праймерами связанными через PrimerUsage). Base64-кодирование обязательно — NCBI ограничивает COMMENT по 80 символов в строке и нейтрализует спецсимволы JSON; raw JSON в COMMENT ломается на reformatting. Опциональный gzip+base64 если payload >50 KB (длинные commits[]).

**Custom GenBank qualifiers** (non-breaking GenBank extensions, ignored by other tools):

- `/bodge_id=01ABC...` — stable feature ID для round-trip identity (без этого qualifier при ре-импорте все features получат новые UUID и история annotation_edit коммитов рвётся).
- `/parent_feature=01ABC...` — связь sub-feature → parent (родная BodgeGene иерархия `level: 'detail'` + `parentId` из DEC-LIB-04). GenBank не имеет нативной parent-child структуры; SnapGene видит sub-feature как обычный overlapping feature.
- `/note=sequence:ATCG...` на `primer_bind` — SnapGene-симметричный паттерн прямикрепления primer sequence к feature; round-trip с SnapGene .dna работает без потерь (и питает wizard primer-step из DEC-LIB-08).

**Fallback re-detection** при потерянных custom qualifiers (файл прошёл через tool, который strip'ает unknown qualifiers): sub-features ре-детектятся через coordinate inclusion (sub.start ≥ parent.start, sub.end ≤ parent.end, same strand, parent type в white-list `CDS`/`promoter`/`mRNA`). Heuristic, не идеальный но работает для 99% реальных каскадов.

**External-edit detection.** Главный edge case round-trip: SnapGene-юзер правит sequence в .gb файле экспортированном из BodgeGene, COMMENT остаётся прежним (`payload.baseSnapshotHash` и `payload.currentHash` больше не совпадают с recomputed hash текущей sequence). При ре-импорте в BodgeGene: (1) recompute hash, (2) сравнить с payload, (3) если расходятся — toast warning «External edit detected. Last BodgeGene state: <date>. Current sequence differs from provenance baseline» с выбором [Treat as new] / [Restore baseline & lose external edits]. Никогда не восстанавливаем линию молча. Симметрично с `cleanShutdown`-recovery из §5.6.7 ARCHITECTURE_v2.

**Область совместимости по программам (на 08.05.2026, ожидает round-trip верификацию):**

| Программа | sequence + features | COMMENT preserved | round-trip lineage |
|---|---|---|---|
| SnapGene Viewer / Pro | ✓ | ✓ verbatim | ✓ |
| ApE | ✓ | ✓ verbatim | ✓ |
| Geneious Prime | ✓ | ✓ verbatim | ✓ |
| BioPython `SeqIO` | ✓ | ✓ через `record.annotations['comment']` | ✓ |
| Benchling | ✓ | ◐ может pretty-print'ить — **тестировать** | ◐ |
| NCBI tools (Entrez/E-utilities) | ✓ | ✓ | N/A |
| pLannotate / IGV / SeqBuilder | ✓ read-only | N/A | N/A |

Benchling — единственный риск, нужен реальный round-trip тест на экспортированном .gb до claim'а full round-trip support. Если Benchling pretty-print'ит COMMENT (перепаковывает строки) — BodgeGene при ре-импорте видит это как external edit и покажет toast.

**Связь с другими anchor'ами:**
- **Extends DEC-V2-26** (29.04.2026) — внутренний GenBank export pattern становится public format spec.
- **Совместим с DEC-V2-07 + DEC-V2-18** (.bodge как ZIP с manifest + .gb по контейнеру) — эта запись раскрывает что .gb внутри .bodge — тот же .bodgebox-подобный формат без ZIP-обёртки. Reuse export pipeline 95%.
- **Связан с DEC-LIB-04** (sub-features живут в annotations[] с parentId) — round-trip через `/parent_feature` qualifier + coordinate-inclusion fallback.
- **Связан с DEC-LIB-08** (wizard primer-step при import .dna с primer_bind+sequence) — SnapGene-симметрия через `/note=sequence:...` qualifier.
- **Supersedes обоснование DEC-IMP-03** в части «без открытого проекта импортировать некуда». После DEC-IMP-06 (Library = primary workspace) импорт в Library без проекта — первоклассный flow. `↑ Import sequence…` возвращается на Start screen в блок SEQUENCE; фиксируется при имплементации как sprint-level DEC-IMP-07 в DECISIONS.md.

**Последствия для Start screen.** SEQUENCE block принимает 4 формата через file picker и drag-drop: `.bodgebox` (recommended, preserves history) / `.gb` / `.dna` / `.fasta`. PROJECT block принимает `.bodge`. Разные иконки / цвета (рекомендация: `.bodge` амбер = primary brand, `.bodgebox` второй цвет — теплый серый либо teal) — дизайн-система, не data model.

**Trade-offs.**
- *Pro:* honest interop — биолог без BodgeGene открывает наш файл в своём привычном tool, ничего не ломается. FAIR-claims для статьи — формат по умолчанию интероперабельный (NCBI-blessed COMMENT verbatim preservation).
- *Pro:* lock-in-free, biologist trust. Биолог видит «это .gb с доп метаданными» — не экспериментальный формат, портивший 7 лет SnapGene-накопленных файлов.
- *Con:* payload в base64-энкодинге при больших commits[] раздувает файл. Для типичной плазмиды 5–10 KB с ~20 commits выходит ~30–60 KB GenBank файл. При 100+ commits — полумегабайтные файлы. Митигация: gzip+base64 при payload >50 KB; в v0.7+ опция «export without history» для лёгких sharing.
- *Con:* recompute-hash на каждом импорте — 5–10 ms на типичной плазмиде, не блокер но в коде явно присутствует.
- *Con:* `.bodgebox` extension начинается так же как `.bodge` — риск перепутать в file picker'е при быстром взгляде. Митигация через разные иконки / цвета в OS file manager — деталь реализации, не этого решения.

**Open questions для спеки по формату (M-D или separate sprint).**

1. Порядок полей в base64-payload — alphabetical sort с deterministic JSON serialization (canonical JSON из §2.8) для content-addressable hash stability между сериализациями.
2. Schema versioning. В v1 схема `https://bodgegene.dev/schema/v1`. Добавлять в v0.7+ schema migration логику или break-on-mismatch?
3. Round-trip integration tests с BioPython — обязательный suite перед объявлением support'а. ~10–20 plasmids, разные topology / commits depth.
4. Benchling round-trip — реальный тест нужен (игнорирует ли unknown qualifiers, preserves COMMENT verbatim).
5. SBOL3 export как secondary в v0.7+ (упомянут в §10 «NOT делаем» как primary — остаётся отвергнутым как primary; secondary export — вопрос v0.9+).

**Применимость.** Любой формат в BodgeGene, выходящий во внешний мир — валидный стандарт (GenBank / FASTA / SBOL2 / RO-Crate / SBOL3) плюс BodgeGene-экстеншены в opt-in полях. Никаких binary blob'ов, никаких close-source encodings, никаких «первооткрывательских» хитростей в core data layer. Ревью при любой новой export поверхности (экспорт библиотеки, экспорт primer pool, экспорт DAG как image) — в первую очередь вопрос должен быть: «в какой стандарт это легает». Наблюдаемый invariant во всём жизненном цикле проекта вплоть до v1.0 публикации.

---

**Исторические записи старше Sprint 2a (с полными формулировками):** `docs/archive/DECISIONS_2026_Q2.md`.
