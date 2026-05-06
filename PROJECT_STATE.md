# PROJECT_STATE.md — BodgeGene snapshot

> **Версия:** **v0.7.5** — M-X.5 Этап 1 Library namespace refactor (07.05.2026): hot-fix write-through для annotations на Mine entries (TD-LIBRARY-WRITE-API), git mv `Importer/` → `Library/` (45 файлов с history), internal renames (SingleInspector→LibrarySingleInspector, MetaColumn→LibraryMetaColumn, importer-state→useLibraryState, use-catalog-sources→useLibrarySources), origin migration heuristic в hydrateLibrary, route alias 'library' для 'importer', LibraryTree decomposition (CatalogColumn 64KB → 5 файлов: tree/library-folder-tree.js + LibraryGroupHeader + LibraryNestedSubGroup + LibraryItemRow + LibraryTree.jsx 38KB soft), single-vs-multi drag-drop gate с toast (multi disabled до K4 Этап 2).
> **Тесты:** Vitest 1461/1461 passing (+4 vs v0.7.4: 3 origin migration tests + stable annotator-autorun). pytest 112/112. Build clean, PWA precache 876.83 KiB.
> **Архитектура:** `docs/ARCHITECTURE_v2.md` v1.2 (~117 KB) · 52 ⚓ fundamental decisions в `ANCHORS.md` · sprint-level DEC в `DECISIONS.md` — v0.7.5 sprint block: DEC-LIB-WRITE-THROUGH-HOTFIX-01 (TD-LIBRARY-WRITE-API hot-fix через writeLibraryEntryAnnotations + updateEdits write-through), DEC-LIB-MIGRATE-HEURISTIC-01 (Q2 origin migration), DEC-LIB-K2-ROUTE-ALIAS-01 (importer↔library alias), DEC-LIB-K3-DECOMP-01 (LibraryTree.jsx 38KB soft landed), DEC-LIB-K9-MULTIDROP-DISABLE-01. **⚓ кандидаты в ANCHORS.md** (промоция в Этап 2): DEC-EDIT-PARITY-01 → DEC-LIB-14 ⚓ при K6, DEC-IMPORTER-TARGETS-01 → DEC-LIB-15 ⚓ при K9 Этап 2, DEC-IMP-06 ⚓ (Importer fullscreen abolished, Library = primary workspace) при K2 dead-code purge Этап 2, DEC-LIB-12..17 при K6/K7/K10/K5.
> **Журнал версий:** `RELEASES.md` (v0.7.5 + v0.7.4 + v0.7.3 + v0.7.2 + v0.7.1 + v0.7.0) + `docs/archive/SESSIONS_2026_Q2.md` (исторические сессии до v0.6) + `docs/archive/PROJECT_STATE_v0.6.3_pre_split.md` (полный pre-split snapshot).
> **Дизайн-система:** `docs/DESIGN_SYSTEM.md` §2.1 — feature palette A+v2 + shade-by-name + canonical-key (от v0.6.4). v0.7.4 паттерн **paint-only decorations через box-shadow inset** для accent stripes над absolute-coord overlays — DEC-LAYOUT-PAINT-ONLY-01. Animation token convention — single `.importer-tab-pane` / `.annotator-drill-in-anim` / `.save-flash-bounce` shared across surfaces, все gated `prefers-reduced-motion`.
> **Открытые TD:** см. `TECH_DEBT.md`. v0.7.5 закрыл TD-LIBRARY-WRITE-API через temporary write-through (полное закрытие в M-X.5 K7 explicit save flow). Carry-over: TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS, TD-CIRCULAR-SELECTION, TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB hard, M-X.6), TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT. От v0.7.1: TD-SEQUENCEVIEW-SHIFT-SELECTION, TD-SEQUENCEVIEW-FOCUS-RING, TD-LINEAR-BAR-PREDICTIONS. От v0.7.0: TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP. Новый soft warning: LibraryTree.jsx 38KB > 30KB soft (под hard 40KB).
> **Открытые баги:** см. `BUGS.md` — OPEN секция пуста.
> **Текущая задача:** см. `CURRENT_TASK.md` — **v0.7.5 финализирован 07.05.2026, M-X.5 Этап 1 (Library namespace refactor) закрыт**. Следующий цикл: M-X.5 Этап 2 (v0.8.0 features — K4 MultiImportView, K5 Onboarding, K6 Read-only/Editable, K7 Library Save Flow, K8 Quick-add, K10 Manual edit branching, K11 Origin icons, K12 final). Перед стартом: визуальная приёмка Этапа 1 биологом — Library должна выглядеть как старый Importer kроме переименования заголовка «Импорт» → «Library».

---

## Что работает

### Annotator + Annotation Editing (M-X.2 + perf wave, v0.7.2)
- **Integrated edit-annotations workflow в SequenceView:** Del two-pass (exact → smallest covered), H key → CreateAnnotationPopup рядом с правым краем строки selection, E key → EditAnnotationModal на coords региона, drag edges с live preview rect + tooltip + 8 px hover indicator, double-click label → inline rename, double-click bar → FeatureEditorModal (tabs Feature + Subfeatures), context menu ПКМ. Ctrl+Z/Y на edit
- **Sub-features (`level: 'detail'` + `parentId`):** inset rendering, shaded color по индексу, child labels внутри child rects. Split button делит последнего ребёнка пополам
- **SBOL glyphs paired с label:** mirror на reverse strand, default fallback для unknown types
- **PreImportModal flow:** paste / drop / catalog click → name / topology / folder / tags / annotate-now checkbox; multi-file shared metadata; existing-annotations radio (keep / discard); catalog click pre-fills tags из entry
- **Embedded Annotator (default, fullscreen modal только для region-scope):** three-level LevelPanel (L1 common-features-homology auto-run на open Annotations tab, L2 structural predictors orf-scan/sigma70/stem-loop/sgrna-scaffold manual «Run», L3 BLAST stub) + PreviewTab с linear/circular sub-tabs + ghost drill-in side panel (Accept / Reject / BLAST / re-run)
- **Threshold slider live:** over-fetch PLUGIN_MIN_THRESHOLD=0.5 + render-time filter, mirrors SequenceView Settings ⚙ predictions threshold
- **Accept ghost → solid annotation:** predicted: false на принятых, render solid + non-italic. Hide-duplicates toggle (default ON). Per-level «Accept all» bulk
- **Library entry annotations frozen** (DEC-LIB-11): правки только через `perFileEdits.editedAnnotations` transient; catalog mini-map обновляется через render-time merge `liveAnnotationsByLibId` без write-through
- **Predictor Worker (DEC-PERF-WORKER-01):** L1 + L2 structural бегут off-main-thread в `lib/workers/predictor.worker.js`. Pipeline через `lib/annotator-worker-client.js` lazy singleton, vitest happy-dom через `import.meta.env.VITEST` early-return → fallback на синхронный path. BLAST stub (`requiresNetwork:true`) на main thread

### Canvas & UI
- Canvas: 4 вида (Blocks, Sequence, Map, Racetrack) + Project Flow DAG
- CSS zoom (не transform) — скролл работает корректно, auto-fit при изменении фрагментов
- Quick Start панель при пустом canvas (7 workflow actions + Каталог SnapGene)
- Smart Import modal (ImportDecisionModal) — выбор действия при file drop
- ImportPrompt — "Импортируйте вектор" при пустой библиотеке (restriction/mutagenesis)
- ActionBar: sticky панель после расчёта праймеров (протокол, заказ олигов, GenBank, завершить сборку)
- Header: polymerase/prefix в ⚙️ Настройки dropdown (position: top-full, не обрезается)
- Breadcrumb: Проект → Сборка навигация (Construct ↔ Flow)
- SnapGene Каталог (📚 Каталог в header): 2822 плазмид, 19 категорий, lazy-loaded
- Drag-and-drop фрагментов из палитры
- Click = select, двойной клик = edit, R/E/Del/Ctrl+C/Ctrl+D
- Compact header, type-dependent context menu
- Undo/Redo (50 levels)

### Library (data layer survives, fullscreen wiped в v0.6.4)
- `librarySlice` data API сохранён: `addLibraryEntry` / `checkLibraryDedup` / `getSuggestedLibraryName` / `selectVisibleLibraryEntries` / `selectAllLibraryTags` — нужны Importer Confirm flow + CatalogColumn → «Моя библиотека»
- Schema v2 table `library` без изменений
- **Library fullscreen window удалён в v0.6.4.** Browse function переехала в Importer CatalogColumn → группа «Моя библиотека»; tag-editing — только при импорте через TagsEditor; soft-delete отложен в M-D Container Window
- Тесты M-A.3 групп D/E/F/H удалены вместе с фуллскрином (`Library.test.jsx`); coverage Library data API остаётся в integration-тестах Importer

### Importer (M-B.2 + post-acceptance polish, v0.6.4)
- **Single-screen 4-column layout:** CatalogColumn 320 / Inspector flex / MetaColumn 200 / footer (SessionSummary + ActionsBar). Always-advanced (simple/advanced toggle убран в v0.6.4 round 2)
- **CatalogColumn 4 sources:** «Этот проект» (containerIds resolve) / «Учебные / demo» (basic_cloning_vectors slice 0-12) / «Моя библиотека» (sub-grouped by entry.tags / flat fallback) / «Каталог SnapGene» (lazy fetchCategory). Sticky search с length-pattern (`>5kb` / `<2k` / `2k-3k`). Drop zone footer + paste textarea (Ctrl+Enter). Persistent group-state в localStorage
- **Inspector tabs lazy-mount:** Обзор (eager: PlasmidMiniMap 180px overlay + categorised summary) / Последовательность (lazy SequenceMapView readOnly) / Аннотации (lazy AnnotationEditor с linear feature-bar) / История (conditional rendered только при commits.length>0). **V49 50-сек hang fix** через React conditional render — heavy components не существуют в DOM пока tab не активен
- **MetaColumn 200px:** topology toggle / origin offset+apply / intergenic gap hints (label-stacked monospace) / from-file vs enriched counts / IUPAC warning
- **MultiInspector:** table layout с тристейт master autoAnnotate checkbox + per-row inline rename / annotate-flag / × remove
- **TagsEditor inline в SingleInspector:** chip list + add-input + suggestions из existing Library tag pool. Запись в `perFileEdits.editedTags` → Confirm flow промотит в `entry.tags`
- **AutonameModal + PrimerWizardStepModal** (M-B.1 K6 keep): collision detection через resourceHash, primer wizard с unified pool + dupe detection
- **Feature palette A+v2 + shade-by-name + canonical-key collapse:** PlasmidMap + PlasmidMiniMap arc-fills используют `featureColorShaded(type, name)` — base hex для типа + HSL ±10% L / ±6° H shade keyed by canonical-key (AmpR ≡ ApR ≡ bla → один shade)

### Assembly & Primer Design
- Авто-расчёт праймеров (клиентский, без API)
- 6 методов сборки: Overlap PCR, Gibson, Golden Gate, KLD, RE ligation, Restriction Cloning
- Merged fragments (склейка Ctrl+Click, развёртывание)
- Merge через ligation junction → заблокирован с warning
- Adaptive overlap (No-PCR сосед → full overlap)
- Tag-aware primer design (`findBindingTagAware()` — extend past low-complexity tags)
- Мутагенез + KLD primer design
- Фрагменты <18bp → warning "merge с соседним (Ctrl+Click)"
- **Single-circular self-closure primers** (Sprint X-fix K5, 26.04.2026): `designPrimersLocal` при `fragments.length === 1 && circular` генерирует пару праймеров с overhang-tails для физического самозамыкания (V24 closed)

### Plasmid-Git data model (Sprint X cycle, 26.04.2026)
- `fragment.baseSnapshot` (immutable sequence + annotations + length) + `fragment.commits[]` (упорядоченный список `op` с абсолютными координатами относительно baseline + `applied: bool`) + replay для sequence/Tm/GC%
- Mutagenesis-workflow ходит через `applyMutationsBatch` (один pushUndo на batch)
- Toggle «применить/откатить» на уровне commit (V27 closed)
- Indel-aware mutation highlights из commit op + start/end (V22 closed)
- Backward-compat: lazy migration при первом коммите (current sequence → baseSnapshot, commits=[])
- `pushUndo` захватывает snapshot синхронно при первом вызове в 300мс-окне

### PlasmidViewer
- Circular map: track-based arc layout (features по дорожкам, не пересекаются)
- Single-plasmid rendering (mapFragments = [{whole plasmid}], не массив регионов)
- Region selection: onSelectRegion callback → подсветка на карте + scroll к последовательности
- Sequence view: двуцепочечная + AA-трансляция + region labels + цветовой фон
- Первый нуклеотид: sanitize (strip BOM/null) — без артефакта ∅/N
- Footer action buttons: 🔪 Клонировать / ⚗️ Как backbone / 🔄 Мутагенез / 🧬 cDNA / GenBank
- presetMode instant actions: "Как backbone" → сразу на canvas (handleUseWhole), без меню
- RE sites toggle (1x / ≤2x / All)
- CDS validation warnings

### Restriction Cloning
- 3-step wizard: ферменты → insert → preview + создание на canvas
- Junction Sequence Preview на шаге 3: backbone + RE-site + insert, цветовое кодирование
- Reading frame check: "в рамке" / "не в рамке" warning
- digest() + checkDoubleDigest() + checkInsertSites() + checkReadingFrame() + generateRETail()
- RE-тейлы на праймерах (protective bases + site)
- Ligation junction display (🔪, red-400)

### SnapGene Каталог
- plasmids-index.json (~867KB): 2822 плазмид, 19 категорий, без sequences
- plasmids-data/*.json (19 файлов): lazy-loaded по категориям
- CatalogPanel: поиск по имени/feature, фильтр по категории
- Действия: В библиотеку / Просмотреть / Клонировать / Как backbone
- HTML в описаниях: stripHtml()
- Attribution: snapgene.com/resources

### Annotations
- 3-level model: region > detail > point (НЕТ отдельного domains[])
- Auto-annotate: CDS (signal peptide, tags, domains), promoter (-10/-35/TATA/CAAT), terminator (poly-A)
- RE sites: 63 фермента с IUPAC regex (restriction-db.js)
- ORF detection: ATG→stop ≥100aa, обе цепи, 3 рамки

### Import/Export
- .dna import: свой binary парсер (snapgene_parser.py) PRIMARY, BioPython FALLBACK
- .gb/.gbk import: parseGenBank (frontend) + enrichment pipeline
- .fasta import: sequence only + enrichment
- Enrichment: common-features.json (415 фичей из 2822 SnapGene плазмид) + ORF detection
- GenBank export, протокол export, clipboard

### Parts Library (v0.5 legacy, по дорожной карте v0.6 мигрирует в LibraryEntry)
- 94+ parts, draft/verified/archived lifecycle
- Duplicate detection при добавлении
- Part variants (мутагенез → новый part)
- Split/fuse/insert/delete operations

### Project Flow
- 5 node types (PlasmidNode, PCRNode, AssemblyNode, OligoNode, CheckpointNode)
- 3 edge types, dagre layout
- PCR node edit, real assemblies, MIRO+ с RE/KLD/лигирование

### v0.6 infrastructure (M-A core, M-A.1, M-A.2, M-A.3)
- IndexedDB schema v2 (Dexie · `projects` + `library` tables)
- Multi-tab guard (`navigator.locks`) + multi-tab UI overlay (DEC-MA1-XX)
- `.bodge` round-trip (File System Access API + fflate ZIP, fallback `<a download>`)
- Hotkey registry 7 entries (`new-project`/`open-bodge`/`save-bodge`/`close-project`/`open-settings`/`escape`/`project-info`) + ⌘I
- ProjectInfoModal (auto-open after createProject + edit)
- PWA setup (`vite-plugin-pwa@1.2.0`, `manifest.webmanifest`, 3 иконки Hybrid B)
- Notion-style Toast queue + soft-delete pattern (`_pendingDelete` flag + race-protected commit)
- i18n-prep: STRINGS namespace dictionary (`lib/strings.js` 6.6 KB, 11 namespaces, ~15 компонентов переведены)
- App version footer в StartScreen sidebar (`BodgeGene v{APP_VERSION}` из `lib/version.js`, single source of truth, обновляется при финализации каждого спринта)

## Открытые баги

См. `BUGS.md`. На v0.6.3 OPEN секция пуста — v0.6 wipe phase, баги появятся по мере реализации M-A.4..M-I функционала. Исторические v0.5 баги → `docs/archive/BUGS_v05.md` (38 KB, последняя запись 28.04.2026: Sprint Catalog Polish + FIX cycle закрыл 11 import-related багов V35–V48).

## Что дальше

**v0.7.5 закрыт полностью** (M-X.5 Этап 1 Library namespace refactor: hot-fix annotations write-through, K1 namespace skeleton + migration heuristic, K2 route alias, K3 LibraryTree decomposition, K9 multi-drop gate). Pure refactor — функционально идентично v0.7.4.

**v0.7.4 был закрыт 06.05.2026** (M-X.3 wrap-tail rounds 12–18: trailing wrap-tail restored, bridge wrap-half extended-domain caret, paint-only inset accent stripe — CSS layout shift fix, common-features dedup 419→408, Annotator click→teleport, empty-plasmid LinearFeatureBar, ghost feature edit/save через CREATE conversion).

**Active sprint: M-X.5 Library as Primary Workspace** (план apply'нут, kickoff approved). Спека `docs/SPRINT_M-X.5_LIBRARY_AS_WORKSPACE.md`. План `~/.claude/plans/delightful-hugging-backus.md`. Архитектурный rewrite Library/Importer — **2 этапа**:

- **Этап 1 — v0.7.5 Refactor (K1-K3 + K9):** Library namespace skeleton + migration (rename Importer→Library); удалить Importer fullscreen + dead code (MultiInspector, EmptyInspector, ActionsBar, SessionSummary); LibraryTree decomposition (CatalogColumn 64 KB → 6 sub-components ≤30 KB); single-vs-multi drag-drop routing с disable-toast для multi в Этапе 1. Pure refactor, zero new UX. Acceptance — undistinguishable from v0.7.4 functionally.
- **Этап 2 — v0.8.0 Features (K4-K8 + K10-K11 + K12):** MultiImportView с per-batch + per-file annotation choice, Onboarding nudge + curated 7 категорий, Read-only/Editable toggle для SequenceView (DEC-LIB-16 ⚓), Library Save Flow (Перезаписать / Сохранить как версию, DEC-LIB-13 ⚓), Quick-add icon hover-revealed, Manual edit branching (DEC-LIB-12 ⚓), visual origin icons. Major bump v0.8.0 — **DEC-IMP-06 ⚓ Importer fullscreen abolished, Library = primary workspace**.

**Open questions Q1-Q5 закрыты** в плане: hybrid catalog (выбранные онбордингом → IndexedDB, остальные virtual в public/plasmids-data); heuristic origin migration (demo-tag → demo_category, иначе file_import); manual-edit confirm scope per-mount; default version name `${parent.name} (v2)` через autoname collision; soft-deleted parent → hard fail с toast.

**Параллельно / после M-X.5:**

1. **TD-ANNOTATIONTRACK-DECOMPOSE-V2** (41.6 KB hard violation остаётся) — отложено в M-X.6 polish после M-X.5 acceptance.
2. **M-C Container Window kickoff** — следующий milestone по Roadmap. Использует SequenceView (B.3 foundation) + caret sync (DEC-SV-01) + scrollIntoView pattern (DEC-SV-02) + wrap-tail (DEC-WRAPTAIL-01..05). После M-X.5 acceptance.
3. **TD-CIRCULAR-SELECTION** — полноценная wrap-aware navigation (round-8 partial, click on wrap-tail остаётся blocked).
4. **Sprint NCBI GenBank Integration** (TD-OPEN-PLASMID-REPOS roadmap step 1) — public domain, fungal-focused queries.
5. **Sprint Addgene Integration** (TD-ADDGENE-API-PENDING) — после approval'а от developers.addgene.org.

**Roadmap до v1.0** — `docs/ARCHITECTURE_v2.md` §7 (M-A start screen → M-B importer → M-C container window → M-D editable container → M-E mix workspace → M-F primer pool → M-G остальные reactions → M-H library polish → M-I DAG polish). Wave 1 M-X.1..M-X.5 — параллельная backend annotator track (frontend baseline → Analyze Modal → Pfam → SignalP → AUGUSTUS), интегрируется в Container Window M-C/M-D через UI hooks.

---

**Snapshot rotation:** при каждой финализации спринта Chat обновляет шапку (версия / тесты / коммиты), «Что работает» (новый функционал в существующие секции), «Что дальше» (актуализация candidate списка). Журнал по версиям ведётся отдельно в `RELEASES.md`. Этот файл не должен расти больше 12 KB — иначе в нём накопилось то что должно быть в RELEASES.md.
