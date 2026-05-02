# PROJECT_STATE.md — BodgeGene snapshot

> **Версия:** **v0.6.4** — M-B.2 Importer Rework + post-acceptance polish (02.05.2026). Patch поверх v0.6.3 M-A.3; formal v0.7.0 release будет создан Chat'ом при финальной M-B.2 acceptance.
> **Тесты:** 1003 (891 Vitest + 112 pytest), build clean (~570 KB / gzip 172 KB).
> **Архитектура:** `docs/ARCHITECTURE_v2.md` v1.2 (~117 KB) · 48 ⚓ fundamental decisions в `ANCHORS.md` · sprint-level DEC в `DECISIONS.md` · DEC-IMP-13..18 + новые palette decisions ждут добавления Chat'ом в финализирующей сессии.
> **Журнал версий:** `RELEASES.md` (текущие) + `docs/archive/SESSIONS_2026_Q2.md` (исторические сессии до v0.6) + `docs/archive/PROJECT_STATE_v0.6.3_pre_split.md` (полный pre-split snapshot с журналом 6 сессий апреля).
> **Дизайн-система:** `docs/DESIGN_SYSTEM.md` §2.1 обновлена под feature palette A+v2 (warm sepia + 4 fixes) + shade-by-name + canonical-key. Mockup: `docs/design_assets/feature-palette-comparison.html`.
> **Открытые TD:** см. `TECH_DEBT.md`. Новые в v0.6.4: TD-V05-IMPORTSTARTSCREEN-DELETE, TD-LIBRARY-CRUD-M-D.
> **Открытые баги:** см. `BUGS.md` (V49 50-сек hang fixed в M-B.2 K4 lazy-mount; OPEN секция пуста).
> **Текущая задача:** см. `CURRENT_TASK.md` (M-B.2 K1..K6 + 3 round'а post-acceptance polish закрыты; финальная visual acceptance + bump до v0.7.0 ждёт Chat'а).

---

## Что работает

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

**v0.6.3 закрыт полностью** (Sprint M-A.3 Library minimal CRUD + версионирование в коде). Версия теперь отображается в StartScreen sidebar footer (`BodgeGene v{APP_VERSION}` из `lib/version.js`); `package.json` бамп на 0.6.3.

**Кандидаты следующих сессий:**

1. **M-B.1 Importer** (приоритет 1) — 3 формата (.dna PRIMARY через `snapgene_parser.py` reuse / .gb BioPython / .fasta BioPython), 2 контекста (in-project DAG-toolbar + into-library Library-toolbar, DEC-IMP-04), preview-step с PlasmidMiniMap reuse (DEC-IMP-05), wizard primer-step при primer_bind+sequence в .dna (DEC-LIB-08). Закрывает M-A.3 отложенную приёмку (D/E/F/H группы) реальным контентом.
2. **DESIGN_SYSTEM.md финализация** v1.0 → v1.1 — собрать design-decisions из M-A.1 (Notion-style Toast паттерн) + M-A.3 (Library design tokens: chips inline editing visual, hover-`×` opacity, empty state typography).
3. **All projects милстоун** — dashboard ranged Recent (DEC-V2-28 dual-context: standalone со Start screen и в проектном DAG-toolbar) с facet filters по tags/agent/lifecycle status.
4. **Ротация старых journal-записей** (27.04 + 28.04 × 3 + 30.04 × 2 = 6 записей в архивном `PROJECT_STATE_v0.6.3_pre_split.md`) → `docs/archive/SESSIONS_2026_Q2.md` — §4 playbook regular hygiene, ~30 минут сессии. Может закрыться параллельно с любой milestone-сессией в начале.

**Roadmap до v1.0** — `docs/ARCHITECTURE_v2.md` §7 (M-A start screen → M-B importer → M-C container window → M-D editable container → M-E mix workspace → M-F primer pool → M-G остальные reactions → M-H library polish → M-I DAG polish).

---

**Snapshot rotation:** при каждой финализации спринта Chat обновляет шапку (версия / тесты / коммиты), «Что работает» (новый функционал в существующие секции), «Что дальше» (актуализация candidate списка). Журнал по версиям ведётся отдельно в `RELEASES.md`. Этот файл не должен расти больше 12 KB — иначе в нём накопилось то что должно быть в RELEASES.md.
