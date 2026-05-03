# PROJECT_STATE.md — BodgeGene snapshot

> **Версия:** **v0.6.3** — Sprint M-A.3 Library minimal CRUD complete (01.05.2026).
> **Тесты:** 900 (788 Vitest + 112 pytest), build clean.
> **Архитектура:** `docs/ARCHITECTURE_v2.md` v1.2 (~117 KB) · 48 ⚓ fundamental decisions в `ANCHORS.md` · sprint-level DEC в `DECISIONS.md`.
> **Журнал версий:** `RELEASES.md` (текущие) + `docs/archive/SESSIONS_2026_Q2.md` (исторические сессии до v0.6).
> **Открытые TD:** см. `TECH_DEBT.md` (3 кандидата M-H по Library + 1 known TD-CTRL-N-OS-FALLBACK).
> **Открытые баги:** см. `BUGS.md` (пуст на v0.6.3).
> **Текущая задача:** см. `CURRENT_TASK.md`.

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
- Toggle «применить/откатить» на уровне commit (V27 closed: ✕ в Mutations panel теперь реально откатывает sequence)
- Indel-aware mutation highlights из commit op + start/end (V22 closed: нет ложного красного хвоста на indel'ах)
- Backward-compat: lazy migration при первом коммите (current sequence → baseSnapshot, commits=[])
- `pushUndo` захватывает snapshot синхронно при первом вызове в 300мс-окне (Sprint X-fix-3 K-fix3-1: был pre-existing баг debounced timing, выходил на поверхность при batch-apply)

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
- CRIT-1 fixed: DNA insert/delete в FragmentEditor сдвигает аннотации
- CRIT-2 fixed: autoAnnotate() перезапускается после мутаций (useEffect 500ms debounce)
- CRIT-4 fixed: flipFragment в GG → re-run autoDesignGGOverhangs() + apiWarning
- HIGH-1 fixed: flipFragment инвертирует strand аннотаций

### Import/Export
- .dna import: свой binary парсер (snapgene_parser.py) PRIMARY, BioPython FALLBACK
- .gb/.gbk import: parseGenBank (frontend) + enrichment pipeline
- .fasta import: sequence only + enrichment
- Enrichment: common-features.json (415 фичей из 2822 SnapGene плазмид) + ORF detection
- GenBank export, протокол export, clipboard

### Parts Library
- 94+ parts, draft/verified/archived lifecycle
- Duplicate detection при добавлении
- Part variants (мутагенез → новый part)
- Split/fuse/insert/delete operations
- Двойной клик "Создать фланки" — protection от дублирования

### Project Flow
- 5 node types (PlasmidNode, PCRNode, AssemblyNode, OligoNode, CheckpointNode)
- 3 edge types, dagre layout
- PCR node edit, real assemblies, MIRO+ с RE/KLD/лигирование

## Открытые баги

**BUGS.md** — 2 критичных (P1, V1), 2 высоких (P4, V7). 11 средних, 7 низких. 1 feature request (F1: custom primers).

## Что дальше

**Текущий статус:** Блоки 4b–10d завершены (03.04.2026). Визуальное тестирование проведено.

### Roadmap до публикации
1. Оставшиеся MED/LOW баги (один блок)
2. Docker Compose deployment
3. GitHub README + screenshots
4. Статья (Bioinformatics / JOSS)

---

## Журнал сессий

### Сессия 01.05.2026 (четвёртая) — Sprint M-A.3 Library minimal CRUD финализация (визуальная приёмка PASS на структуру; D/E/F/H отложены после M-B.1)

**Контекст.** После M-A trifecta + M-B Kickoff (третья сессия 01.05.2026) Sprint M-A.3 закрывает Library skeleton: list view + tabs Containers/Primers + topology filter + tags chips inline editable + soft-delete с undo. Без detail pane (Q3 → отдельный kickoff после M-A.3 release), без add-pathway (M-B.1 закроет import → library). Library в release-сборке стартует пустым. Спека `docs/SPRINT_M-A-3.md` (27.14 KB), реализация Code в 6 коммитов. Приёмка fixture в dev console (4 entries из How-to отчёта Code) Игорем не проводилась — визуальная верификация ограничена структурными пунктами (Topbar / toolbar / empty state / disabled `+ Import` / topology dropdown visibility / tab switcher), функциональные группы D/E/F/H покрыты 10 unit-тестами `Library.test.jsx` и будут приняты на следующей приёмке после M-B.1 Importer (когда Library наполнится реальным импортом).

**Коммиты Code (ветка `feature/racetrack-canvas`, 6 спринт-коммитов + параллельный fix StartScreen):**
- K1 schema v2 + helpers + 6 db-тестов: `5fcceea`
- K2 librarySlice + 8 store-тестов: `41b394d`
- K5 i18n namespace `library`: `038986d`
- K3a Library + LibraryToolbar + LibraryListRow: `c568f61`
- K3b TagsInlineEditor + 10 component-тестов: `525cac6`
- K4 App + Topbar + canvasSlice + StartScreen wiring: `1167bba`
- Параллельный Chat-task Игоря→Code: удаление `↓ Import sequence` button со StartScreen sidebar + удаление соответствующего теста (тип D следствие DEC-IMP-03: после Library + M-B.1 Importer through-Library workflow placeholder больше не нужен). STRINGS keys `startScreen.importSequence` + `importSequenceComingSoon` остались dead code в `lib/strings.js` (data-файл не лимитируется).

K5 закоммичен раньше K3 потому что K3-компоненты импортируют `STRINGS.library.*` и тесты K3 их проверяют — порядок коммитов выбран так, чтобы каждый промежуточный коммит был зелёным.

**Числа.** Vitest 764 (M-A.2 baseline) → **788** (+24 новых: 6 K1 + 8 K2 + 10 K3, спека ждала ~21). Test files 63 → 66 (+3: `dexie-schema-library.test.js`, `librarySlice.test.js`, `Library.test.jsx`). pytest 112/112 (бэкенд не трогался). `vite build` clean, 0 warnings, 0 errors. Bundle 384.51 KB (gzip 120.49 KB).

**Архитектурный итог.** Schema v2 расширена table `library` с indexes `id, kind, addedAt, [kind+addedAt], *tags`. Новый `librarySlice` + 5 db-helpers (`putLibraryEntry` / `getLibraryEntry` / `listLibraryEntries` / `deleteLibraryEntry` / `listAllLibraryTags`). Library fullscreen в `components/Library/`: `index.jsx` 1.83 KB + `LibraryToolbar.jsx` 3.02 KB + `LibraryListRow.jsx` 5.37 KB + `TagsInlineEditor.jsx` 5.18 KB. Wiring: `activeFullscreen === 'library'` в App.jsx + Topbar back-button context + StartScreen sidebar SidebarLink + `'library'` в `FULLSCREENS` whitelist `canvasSlice.js`. Все файлы в green-зоне (.jsx soft 30 KB).

**Reuse предыдущих M-A паттернов.** Soft-delete (DEC-MA1-02): `markLibraryEntryPendingDelete` → toast 5s undo → `commit*` / `unmark*`. Tag suggestions (DEC-MA-04): derived `selectAllLibraryTags` distinct + frequency + alphabetical. Tag inline editor паттерн ProjectInfoModal с `onMouseDown preventDefault` на suggestions. Bilingual (DEC-MA2-01): UI strings через `STRINGS.library.<key>` (~12 keys).

**Архитектурное решение DEC-LIB-10 (⚓).** Q1 collision из M-B Kickoff закрыт: `MoleculeContainer.tagIds: UUID[]` убирается из data-model; теги живут только на LibraryEntry. Spec §4.1 + §10.2 обосновали выбор. **DECISIONS.md** DEC-LIB-10 (⚓, развёрнутая формулировка ~30 строк) добавлена при spec-writing в третьей сессии 01.05. **ARCHITECTURE_v2.md §2.1** Chat-direct правка (тип D): поле `tagIds: UUID[]` удалено из MoleculeContainer interface, NB-комментарий со ссылкой на DEC-LIB-10 + версия документа 1.1 → 1.2 + changelog entry. Обе правки выполнены проактивно в сессии spec-writing — в финализации этой сессии только верификация присутствия.

**Визуальная приёмка PASS на структуру (1-pass).**
- **Группа A — Навигация.** Library открывается из StartScreen sidebar (`SidebarLink → pushFullscreen('library')`), Topbar title `Library` корректен, back-button возвращает на Start.
- **Группа B — Tabs Containers/Primers.** Switcher переключает `filterKind` в slice.
- **Группа C — Topology filter.** Visible на Containers, hidden на Primers (§4.5 спеки).
- **Группа G — `+ Import` button.** Disabled с tooltip `Available in M-B.1` (DEC-IMP-04 placeholder).
- **Empty state.** Text `Library is empty. Import containers and primers from project DAG (coming in M-B).` рендерится при пустом state.

**Отложенная приёмка (D/E/F/H в M-B.1 finalization session).** Группы list-rows (D) / soft-delete (E) / tags inline editor (F) / persistence reload (H) требуют entries в Library. В M-A.3 release-сборке Library стартует пустой, fixture в dev console Игорь не запускал. 10 unit-тестов в `components/__tests__/Library.test.jsx` покрывают функциональные пути; визуальная приёмка этих групп после M-B.1 (DEC-IMP-04 in-project context: import → containerCommit + library_clone) когда Library наполнится реальным импортом. Регресса не будет — unit-тесты PASS.

**Отклонения Code от спеки (8 шт., все приняты):**
1. Soft-delete actions переименованы `markPendingDelete` etc. → `markLibraryEntryPendingDelete` etc. — коллизия с projectSlice (в root state живут рядом), контракт идентичен.
2. `'library'` добавлено в FULLSCREENS whitelist в `canvasSlice.js` (1 строка) — без этого `pushFullscreen({ fullscreen: 'library' })` молча отбрасывался.
3. Soft-delete persistance в IndexedDB через `_pendingDelete: true` фактическая запись (fire-and-forget); GC `cleanupPendingDeletes` отложен на M-H per §8.4 спеки.
4. `hydrateLibrary` читает с `includeDeleted: true` чтобы поддержать undo после reload (entry в state с флагом, фильтр в selector). Альтернатива (db-уровень фильтр) сделала бы undo невозможным.
5. `onMouseDown={e => e.preventDefault()}` на suggestion-кнопках в TagsInlineEditor — без этого blur-on-click закрывал бы редактор без добавления тега.
6. `payload.length` детект для container/primer subtitle — спека §3 не давала точную формулу, реализовано в духе skeleton.
7. Selectors как pure functions от плоского state (`selectVisibleLibraryEntries({ libraryEntries, filterKind, filterTopology })`), не через `useStore(selector)` — обходит infinite re-render в R19 strict + Compiler-friendly мемоизация derived state.
8. App.jsx уменьшился (9.22 → 8.72 KB), а не вырос +0.3 как прогнозировал spec — позитивное расхождение.

**Параллельный Chat-task (тип D, не в scope M-A.3).** Кнопка `↓ Import sequence` (disabled placeholder) удалена со StartScreen sidebar. Reasoning: после Library в M-A.3 + M-B.1 Importer through-Library workflow кнопка теряет смысл (две disabled placeholder кнопки `Import` — путаница; одна `+ Import` в Library toolbar достаточна). Code обновил StartScreen.jsx + удалил соответствующий test. STRINGS keys `startScreen.importSequence` + `importSequenceComingSoon` оставлены как dead code в `lib/strings.js` (data-файл не лимитируется).

**Размеры (size budget — CLAUDE.md §7).** Все новые файлы в green-зоне. Изменённые в green-зоне. Новых нарушителей нет. Warning signal (>5 KB рост) нет. **Size budget: OK.** Контекст по существующим soft/near-hard вне скоупа: `FragmentEditor/index.jsx` 39.55 KB (на грани .jsx hard 40 KB), `PlasmidUseWizard.jsx` 38.79 KB (soft) — не трогались, известные кандидаты на M-H полировку.

**Архивация по §4 playbook.** `docs/SPRINT_M-A-3.md` 27.14 KB → `docs/archive/SPRINT_M-A-3.md` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 01.05.2026`. CURRENT_TASK.md → заглушка. BUGS.md без изменений (M-A.3 не открывал багов, OPEN остаётся пустым на v0.6). TECH_DEBT.md обновляется: 3 новых OPEN кандидата в M-H (TD-LIBRARY-CLEANUP-PENDING-DELETES — GC `cleanupPendingDeletes`; TD-LIBRARY-PERSISTED-TAG-DB — cross-project Tag-DB; TD-LIBRARY-SEARCH-SORT-BULK — advanced search/sort/bulk-select).

**Post-mortem (§4 п.6 playbook):** не применяется. M-A.3 1-pass: spec → Code → приёмка PASS без FAIL-итераций.

**Снимок размеров координационных файлов.** PROJECT_STATE.md ~85 → ~91 KB (эта запись); DECISIONS.md уже содержал DEC-LIB-10 после spec-writing (без изменений в этой сессии); ARCHITECTURE_v2.md уже v1.2 после spec-writing (без изменений в этой сессии); TECH_DEBT.md +3 новых TD ~+1 KB; CURRENT_TASK.md 11.55 KB → ~1 KB (заглушка); BUGS.md 1.54 KB (без изменений). docs/ — активные файлы под лимитом 8 после move SPRINT_M-A-3.md → archive (`SPRINT_M-A.md` 1.49 KB заглушка-redirect остаётся до ручного PowerShell delete Игорем).

**Следующий шаг.** Compact обязателен (§7 playbook — после финализации спринта всегда). Кандидаты следующей сессии: (1) **спека M-B.1 Importer** — 3 формата (`.dna` / `.gb` / `.fasta`), 2 контекста (in-project + into-library, DEC-IMP-04), preview-step с rich PlasmidMiniMap reuse (DEC-IMP-05), wizard primer-step при primer_bind+sequence (DEC-LIB-08); (2) **DESIGN_SYSTEM.md финализация** v1.0 → v1.1 (в M-A.3 затронуты Library design tokens — chips inline editing, hover-`×` opacity, empty state typography); (3) **All projects милстоун** dashboard ranged Recent с facet filters (DEC-V2-28 dual-context). Игорь решает приоритет в начале следующей сессии. Ротация старых записей журнала (27.04 + 28.04 × 3 + 30.04 × 2 = 6 записей) → `docs/archive/SESSIONS_2026_Q2.md` отложена в следующую сессию (объём работы порядка получаса, лучше отдельным ходом).

### Сессия 01.05.2026 (третья) — Sprint M-B Kickoff формализация (Library re-definition + Importer scope)

**Контекст.** В двух предыдущих сессиях 01.05.2026 (M-A.1 polish + M-A.2 i18n) закрыт активный M-A trifecta. M-B kickoff (также 01.05, без отдельного journal entry) переопределил Library и зафиксировал scope Importer'а в личном snapshot Игоря `M_B_KICKOFF_NOTES.md` (7 KB). Третья сессия формализовала решения как 15 ⚓ записей в DECISIONS.md и обновила ARCHITECTURE_v2.md.

**Главные переопределения.** Library — личная коллекция контейнеров и праймеров вне проектов (аналог `~/SnapGene Files/`), **НЕ 3-tier ownership** как было в первом draft ARCHITECTURE_v2 §2.7 (29.04.2026). Importer — точка входа **внешних** данных (file/paste/cross-project `.bodge`); Library как источник Importer'а — исключено (свои данные, парсить нечего). Три разделённые операции: импорт в library / импорт в проект / добавление из library (последняя — library picker, не Importer). v0.5 visualization фиксируется как first-class reuse в M-B/M-C/M-E (PlasmidMiniMap, PlasmidMap, PlasmidViewer, SequenceMapView, SequencePreview, AnnotationEditor, RacetrackView).

**Что сделано в этой сессии.**

1. **DECISIONS.md** — добавлены 15 ⚓ записей в блоке «Sprint M-B Kickoff Formalization»: 9 DEC-LIB-01..09 (Library), 5 DEC-IMP-01..05 (Importer), 1 DEC-REUSE-01 (visualization first-class reuse). 98.19 KB → 117.27 KB (+19 KB). DEC-LIB-01 явно supersedes хвост-ссылку «3 tier ownership» в DEC-V2-27 (сама механика cross-project import остаётся валидной). Суммарно в DECISIONS.md теперь **47 ⚓ fundamental** (DEC-V2-01..27 + DEC-DS-01 + DEC-V2-28..30 + DEC-MA2-01 + DEC-LIB-01..09 + DEC-IMP-01..05 + DEC-REUSE-01).

2. **ARCHITECTURE_v2.md обновлён в 8 секциях** (версия 1.0 → 1.1, один атомарный edit_file с 12 hunks):
   - **§2.2** `library_clone` description — «3-tier ownership» заменено на «личная коллекция» + DEC-LIB-06 link;
   - **§2.7 Library — полная замена** под DEC-LIB-01..09: flat collection, два kind (`container` / `primer`), frozen sequence, library_clone copy semantics, PrimerUsage back-refs, primer wizard step при .dna, flat tagging, M-A.3 implementation note;
   - **§3.1 Primary actions** — убран `↓ Import sequence` со стартового экрана по DEC-IMP-03; M-A scope содержимого обновлён под факты 30.04+01.05;
   - **§3.5 Importer — полная перепись**: 3 источника (file M-B.1 / paste M-B.2 / cross-project M-B.3, URL → v0.7+), 2 контекста (in-project + into-library), no-project контекст удалён, primer wizard step;
   - **§3.7 Mermaid** — Library label «personal collection», удалено ребро Start → Importer, добавлено Library → Importer;
   - **§7 Roadmap v0.6.0** — M-A bullets развёрнуты: M-A core ✅ + M-A.1 ✅ + M-A.2 ✅ + M-A.3 Library minimal CRUD (следующий); M-B bullets разбиты на M-B.1 / M-B.2 / M-B.3 sub-sprints; M-H переформулирован как «финальная полировка» (базовый CRUD в M-A.3);
   - **§8.1 Visualization first-class reuse** — новый блок-таблица 7 компонентов с размерами и таргет-милстоунами;
   - **§10 «Не делаем»** — добавлены 6 пунктов (Library 3-tier / sharing / features-browser / folder-hierarchy / auto-extract primers / `↓ Import sequence` / URL-import);
   - **§11 Глоссарий** — переписаны: Library, Clone-on-import, Frozen sequence (было Frozen lineage), Library entry, Library picker, PrimerUsage;
   - **Footer** — версия 1.0 → 1.1 + changelog block.

3. **Архивация по §4 playbook'а.** `M_B_KICKOFF_NOTES.md` 7 KB → `docs/archive/M_B_KICKOFF_NOTES.md`. Будет помечен штампом `✅ ФОРМАЛИЗОВАНО 01.05.2026` при финальной правке самого файла в archive/.

**Открытый вопрос от M-B kickoff (не блокер текущей сессии).** После DEC-LIB-04 (kind=feature и kind=plan убраны из Library) поле `MoleculeContainer.tagIds: UUID[]` (§2.1) теряет исходный ref-таргет (раньше refs на LibraryEntry kind=feature по DEC-V2-30 комментарию). Нужно отдельное решение: (a) `tagIds` перевести на flat `tags: string[]` (симметрия с Project.tags + DEC-LIB-09 paradigm); (b) оставить UUID refs но переориентировать на LibraryEntry kind=container/primer; (c) ввести отдельный уровень тагирования контейнеров вне Library. Решить в начале M-A.3 либо M-B.1 спеки.

**Post-mortem (§4 п.6 playbook).** Сессия имела особенность: предыдущая Chat-инкарнация применила правки DECISIONS.md (15 ⚓) и архивацию M_B_KICKOFF_NOTES, но не успела довести правки ARCHITECTURE_v2.md (файл оставался в 91 KB исходной версии) — видимо MCP timeout или tool-budget run-out в серии мелких edit_file. Отражает §16 playbook'а «одно решающее edit_file/write_file вместо серии мелких». Эта сессия (recovery) применила ARCHITECTURE_v2 правки одним атомарным edit_file с 12 hunks — правильный паттерн. **Vyvod:** §16 playbook'а работает; иллюстрация второго раза подряд (первый — сессия 30.04 по ARCHITECTURE_v2.md cleanup).

**Следующий шаг.** Compact обязателен (§7 playbook'а — после финализации спринта всегда). Кандидаты следующей сессии: (1) **спека M-A.3** (Library minimal CRUD — browse + add + delete + tags + filter, depends от M-B.1 importer trigger или может идти параллельно); (2) **спека M-B.1** (Importer wizard, 3 формата, оба контекста, rich preview, primer wizard step). Игорь решает приоритет в начале следующей сессии. Параллельно — открытые вопросы Q3-Q6 из M_B_KICKOFF_NOTES (drag-drop, preview-step heavy/light, identity auto-detect, no-project onboarding) и `tagIds` collision — решаются inline в спеке либо отдельным mini-kickoff.

**Снимок размеров координационных файлов.** DECISIONS.md 98.19 → 117.27 KB (+19.08); ARCHITECTURE_v2.md 90.76 → ~96 KB (+5 KB после 12 hunks); PROJECT_STATE.md ~80 → ~85 KB (эта запись); CURRENT_TASK.md — обновится вслед под «Kickoff формализован, кандидаты M-A.3 / M-B.1»; M_B_KICKOFF_NOTES.md 7 KB в archive/. docs/ — стабильно 8 активных файлов под лимитом (добавился пункт в archive, но не в активных).

### Сессия 01.05.2026 (вторая) — Sprint M-A.2 i18n-prep финализация (визуальная приёмка PASS, 1-pass)

**Контекст.** После Sprint M-A.1 (первая сессия 01.05.2026) v0.6 active UI surface содержал mix русского и английского текста. Игорь решил: время выносить i18n-foundation — сейчас active surface узкий (~15 файлов), после M-B Importer + M-C Container Window + M-D Editable будет в 3–5× больше. Chat написал спеку `docs/SPRINT_M-A.2.md` (25.71 KB, тип C). Code реализовал 5 K-шагов.

**Коммиты ветки `feature/racetrack-canvas` (5 коммитов Code + 1 Chat-direct):**

- `5f536a0` — i18n-prep: add lib/strings.js skeleton with namespaces.
- `cc98e63` — i18n-prep K2: StartScreen + AppShell + placeholders → english.
- `1a876d0` — i18n-prep K3: ProjectInfoModal + SettingsModal → english.
- `3ee3427` — i18n-prep K4: Toast + multi-tab + PWA → english.
- K5 (HEAD при приёмке) — i18n-prep K5: hotkeys + file-system + store + App + final proofread.
- Chat-direct по итогам приёмки (тип D, без тестовой верификации): 3 правки в `lib/strings.js` («Done selecting»→«Done» / «Download .bodge files»→«Export .bodge files» / «Confirming…»→«Taking over…») + 2 правки в `main.jsx` ErrorBoundary («Ошибка рендеринга»→«Render error» / «Очистить данные и перезагрузить»→«Clear data and reload»).

**Ключевые изменения.** Новый `gui/designer/src/lib/strings.js` (6.6 KB) — plain JS object с named export `STRINGS`, namespace структура по компонентам (11 namespaces: startScreen / topbar / projectInfo / settings / toast / pwa / multiTabLock / hotkeys / placeholder / app / common), интерполяционные функции для строк с переменными. ~15 компонентов и ~5 lib-модулей + 2 store slice переведены. Проверено: backend `src/pvcs/` чист (русских строк не найдено). Приёмка прошла 1-pass: 6 PASS по файловому аудиту (`lib/strings.js` чист, StartScreen / Topbar / ProjectInfoModal без inline russian литералов, размеры модулей в green zone), 5 визуальных PASS по скриншотам Игоря. 15 неуверенных переводов Code'а прошли ревью: 12 OK, 3 поправлены (DEC-MA2-02).

**Числа.** Vitest 764/764 (M-A.1 baseline не изменился, только assertions обновлены в 4 правках `StartScreen.test.jsx` — импорт STRINGS, `getByText('Recent projects')` → `getByText(STRINGS.startScreen.recentProjects)`, `formatRelativeTimeAgo` 7 assertions обновлены на timeAgo namespace), pytest 112/112, `npx vite build` clean (25807 KiB precache, 34 entries). `lib/strings.js` 6.6 KB. Размеры в green zone: `App.jsx` 8.7 KB, `StartScreen/index.jsx` 11.6 KB, `ProjectInfoModal.jsx` 12.0 KB, `lib/hotkeys.js` 8.4 KB. Size budget OK.

**Архитектурные решения.** DECISIONS.md пополнился: ⚓ DEC-MA2-01 (bilingual policy, фундаментальное) + DEC-MA2-02 (3 правки strings + 3 правила перевода для M-B+, sprint-level).

**Отклонения Code от спеки (приняты).** Четыре отклонения в отчёте Code'а, все приняты на приёмке: (1) `ReadOnlyForced.jsx` включён в K4 (парный multi-tab UX-экран к `MultiTabBlocked`, namespace `multiTabLock` покрывает оба); (2) добавлен «STRINGS.app» namespace для drop-overlay в App.jsx (семантически не вписывалось в placeholder или toast); (3) `STRINGS.hotkeys.actionLabels` структура чуть отличается от §5 спеки (модификаторы `Ctrl/Win/Alt/Shift/Esc` остались литералами в `_formatCombo` как UI-конвенция, namespace хранит пер-action labels видимые в title-tooltips); (4) `store/projectSlice.js` + `uiSlice.js` touched, no strings (toast generators живут в компонентах/App, не в store — спека §3.4 ожидала иначе).

**Chat-direct правки (тип D по §13 CHAT_PLAYBOOK).** После приёмки Chat применил 5 правок напрямую через `Filesystem:edit_file` (вне store/hooks/lib-алгоритмических зон): 3 strings в `lib/strings.js` + 2 строки в `main.jsx` ErrorBoundary. Общий объём диффа ~10 строк, без алгоритмов, следующая Code-сессия проверит (тесты assert через STRINGS namespace, не литералы — поэтому правки в strings.js не ломают тесты).

**Архивация по §4 playbook'а.** `docs/SPRINT_M-A.2.md` 25.71 KB → `docs/archive/SPRINT_M-A.2.md` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 01.05.2026`. CURRENT_TASK.md очищен до заглушки «Sprint M-A.2 закрыт. Кандидаты следующего: M-B kickoff (Importer + MoleculeContainer на DAG), All projects милстоун, DESIGN_SYSTEM.md финализация». BUGS.md без изменений (OPEN пуст на старте спринта и остаётся пустым). TECH_DEBT.md без изменений (M-A.2 не закрывал TD, не добавлял TD).

**Post-mortem.** Пункт §4.6 плайбука пропускается — приёмка 1-pass.

### Сессия 01.05.2026 — Sprint M-A.1 Polish финализация (визуальная приёмка PASS)

6 TD entries накопленных при финализации Sprint M-A закрыты за один спринт. Визуальная приёмка без FAIL-итераций (1-pass), 4 блока (K1 hotkeys / K4 PWA / K5 Toast / K5 soft-delete) — 18/18 визуальных критериев PASS.

**Коммит-цепочка (ветка `feature/racetrack-canvas`, 5 коммитов).** K1 `9ffdf2d` (modal guard в `runHotkeyResolver` + 2 регрессии-теста + правка hotkey-flow integration теста). K2 `ca20869` (3 теста tag suggestions в `ProjectInfoModal.test.jsx`). K3 `39af2b4` (4 теста runtime UI в `StartScreen.test.jsx`; soft-delete-related #4+sub переехали в K5). K4 `facd425` (PWA setup: `vite-plugin-pwa@1.2.0`, `manifest.webmanifest`, 3 финальные иконки Hybrid B отрендерены из `docs/branding/logo.svg` через sharp + скрипт `gui/designer/scripts/render-pwa-icons.mjs` детерминирован, `lib/pwa-install.js`, beforeinstallprompt wiring, `canInstallPwa` в store). K5 `aac0b53` (Notion-style Toast queue: `components/Toast/{Toast.jsx,ToastStack.jsx,toast-icons.jsx,index.jsx}` + `Toast.test.jsx` 8 тестов + soft-delete pattern в `projectSlice.js` через `_pendingDelete` на project entity + 2 soft-delete теста в StartScreen + удаление 2 устаревших confirm-flow тестов + замена `state.toast = null` → `state.toasts = []` в 9 reset() helpers).

**Приёмка 4 блока (все PASS).**
- **Блок 1 — K1 modal guard.** ProjectInfoModal открыт + ⋌Н/Ctrl+N → guard блокирует handler, modal остаётся открытым, новый проект не создаётся. Esc закрывает modal. ⋌С/Ctrl+S работает при открытом modal. ⋌N/⋌O/⋌W/⋌, в обычном Chrome tab перехватываются на OS-уровне раньше keydown — проверяется в standalone окне (Блок 2). При приёмке всплыло известное OS-поведение: в standalone PWA Ctrl+N с открытым modal → guard блокирует handler (preventDefault НЕ вызывается) → Chrome открывает новое browser-окно как OS-fallback. Modal не ломается, проект не создаётся — игорь подтвердил интерпретацию как «new feature» / known limitation, записано отдельным TD-CTRL-N-OS-FALLBACK в TECH_DEBT.
- **Блок 2 — K4 PWA.** Manifest (name BodgeGene / theme `#f59e0b` / 3 иконки Hybrid B финальные, не placeholder), SW activated (workbox precache 34 entries 25.78 MiB, `dist/sw.js` + `dist/workbox-*.js`), address bar install icon ⊕ виден, footer «Install as desktop app» кнопка вызывает native install prompt, иконка в Windows taskbar финальная Hybrid B, Ctrl+W в проекте закрывает проект без закрытия окна.
- **Блок 3 — K5 Notion-style Toast.** Bottom-left placement (24 px), dark fill `#262626` в обеих темах, 4 иконки (✓ зелёная / ✕ красная / ⚠ amber / i серая), manual close ×, stack capacity 3 (FIFO drop), auto-dismiss 3.5 s default + 5 s custom — все пункты работают. `column` вместо `column-reverse` (newest внизу stack'а — Notion / Linear / Sonner pattern, явное уточнение Игоря при approve plan'а 01.05).
- **Блок 4 — K5 soft-delete.** Click × на RecentCard → проект исчезает из списка немедленно + toast «Проект «…» удалён» с кнопкой «Отменить» в bottom-left. Click «Отменить» → проект возвращается. 5 s без клика → проект actually удаляется из IndexedDB (подтверждено через reload — проект не возвращается). Закрытие окна до timeout → проект снова виден после reopen (known risk §8 спеки, намеренное поведение).

**Финальные числа.** Vitest 764/764 PASS (delta vs 739 baseline = +25). pytest 112/112 (бэкенд не трогался). `npx vite build` clean (PWA precache 34 entries 25.78 MiB, bundle 368.84 KB / 116.99 KB gzip, CSS 64.86 KB / 12.28 KB gzip). **Size budget OK** — ни одного нового нарушителя hard-лимита, App.jsx даже похудел 9.49 → 8.66 KB, StartScreen.test.jsx +3.86 KB в soft-зоне (люфт 3 KB до hard 25 KB).

**Отклонения от спеки (6 шт., все приняты без претензий).** (1) `column` вместо `column-reverse` в ToastStack — явное уточнение Игоря при approve plan'а (newest внизу, Notion / Linear / Sonner pattern). (2) Auto-dismiss timer живёт в `Toast.jsx::useEffect` с опциональным callback `onAutoDismiss` — спека разрешала middleware или useEffect, Code выбрал useEffect (проще + soft-delete commit запускается только при auto-dismiss, не при manual ×). (3) Inline SVG иконок с `data-testid="toast-icon-{kind}"` вместо «4 SVG 16×16» — функционально эквивалентно + тестируемо. (4) K3 выдал 4 теста вместо 5+sub — #4+sub (soft-delete flow) переехали в K5 коммит вместе с handleDelete реимплементацией. (5) Hotkey integration test fix — «⋌W closes the project» тест был брокен после K1 deny-list (Ctrl+N теперь auto-open ProjectInfoModal), добавлен Esc перед Ctrl+W для предварительного закрытия modal. (6) `state.toast = null` → `state.toasts = []` в 9 reset() helpers — побочка переименования API.

**Soft-delete реализация.** Flag на project entity (`project._pendingDelete: boolean`) через Immer mutations: `markPendingDelete(id)` / `unmarkPendingDelete(id)` / `commitPendingDelete(id)`. RecentList фильтрует `recentProjectIds.map(id => projects[id]).filter(p => p && !p._pendingDelete)`. Race-protection: `commitPendingDelete` silent return если `_pendingDelete !== true`. Альтернатива (`ui.pendingDeletes: Set<string>`) отвергнута — добавила бы synchronization layer без выгод.

**Известные limitations и known behaviors (в TECH_DEBT.md как known, не блокеры).**
- **TD-CTRL-N-OS-FALLBACK** (новый): в standalone PWA Ctrl+N с открытым modal — guard блокирует handler, Chrome открывает новое browser-окно как OS-fallback. Modal не ломается, проект не создаётся. Fix (если понадобится в будущем) — `event.preventDefault()` в `runHotkeyResolver` при modal-block, но это блокнёт и OS-fallback в обычных браузерах где Chrome перехватывает ⋌N вообще — нужен обдуманный trade-off, не fix-в-слепую.
- **5 MiB cache limit** (`maximumFileSizeToCacheInBytes` в vite.config.js): нужен для plasmids-index.json (~867 KB — с большим запасом). Если в M-B (Importer) появятся data-files >5 MiB — пересмотреть стратегию (runtime caching через CacheFirst + expiration plugin Workbox). OK до M-B.
- **Vivaldi PWA install icon** (§8 спеки риск 6): Vivaldi PWA support нестабилен. Target-браузеры Chrome / Edge (address-bar install ⊕ работает гарантированно) + Firefox (install через menu). Vivaldi — best-effort, не блокер M-A.1.

**Архивация по §4 playbook'а.** `docs/SPRINT_M-A.1.md` 32.31 KB → `docs/archive/SPRINT_M-A.1.md` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 01.05.2026`. CURRENT_TASK.md очищен до заглушки «Sprint M-A.1 закрыт. Кандидаты следующего: M-B kickoff / All projects милстоун / DESIGN_SYSTEM.md финализация». BUGS.md без изменений (OPEN пуст на старте и остаётся пустым). TECH_DEBT.md — 6 OPEN → DONE (TD-HOTKEY-MODAL-GUARD / TD-PROJECTINFO-SUGGESTIONS-NOTESTS / TD-EXPORT-DELETE-NOTESTS / TD-CMD-W-VIVALDI-LIMITATION / TD-PWA-SETUP-DEFERRED / TD-TOAST-UI-MINIMAL), 1 новый OPEN (TD-CTRL-N-OS-FALLBACK, low priority known).

**Новые решения в DECISIONS.md «Sprint M-A.1 FINAL» блок (4 sprint-level, без ⚓).** DEC-MA1-01 (Notion-style Toast queue как проектный toast-pattern); DEC-MA1-02 (soft-delete pattern: mark → toast с undo → commit on auto-dismiss — применяется ко всем будущим destructive actions); DEC-MA1-03 (auto-dismiss timer в Toast.jsx useEffect, не middleware — простота над архитектурой); DEC-MA1-04 (`_pendingDelete` на project entity, не `ui.pendingDeletes: Set` — Immer-friendly).

**Post-mortem (§4 п.6 playbook):** не применяется. Sprint M-A.1 прошёл 1-pass: spec → Code → приёмка PASS без FAIL-итераций. Post-mortem срабатывает только при ≥2 FAIL-fix итераций.

**Снимок размеров координационных файлов после финализации.** PROJECT_STATE.md ~73 → ~80 KB (эта запись); DECISIONS.md ~84 → ~87 KB (+ Sprint M-A.1 FINAL block ~3 KB); TECH_DEBT.md ~37 → ~37 KB (6 OPEN → DONE без роста объёма, +1 новый короткий); CURRENT_TASK.md 27.31 KB → ~1 KB (заглушка); BUGS.md 1.54 KB (без изменений); CLAUDE.md / CHAT_PLAYBOOK.md — без изменений. docs/ — 7 активных файлов (SPRINT_M-A.1.md в archive), под лимитом 8.

**Следующий шаг.** Compact обязателен (§7 playbook'а). Кандидаты следующей сессии — в CURRENT_TASK.md (M-B kickoff / All projects милстоун / DESIGN_SYSTEM.md финализация). Игорь решает приоритет в начале следующей сессии.

---

### Сессия 30.04.2026 (третья) — Sprint M-A финализация (core + fix-1 UX + fix-2 ProjectInfoModal + runtime additions + tag suggestions)

Полный цикл первого милстоуна v0.6: M-A core (10 K-шагов) → K4 retrofit hotkey infrastructure → M-A-fix-1 (UX правки руками Игоря) → M-A-fix-2 (ProjectInfoModal через mini-spec) → runtime additions Игоря (auto-open / export mode / delete) → tag suggestions (Chat прямой правкой через Filesystem:edit_file). Sprint M-A полностью функционирует, тесты PASS, визуальная приёмка через Chrome MCP DOM/JS — 18/18 критериев PASS, 1 minor edge case в TECH_DEBT.

**Коммит-цепочка.** M-A core: `b1b13b9` (K1 Dexie) → `5b30e81` (K2 store rewrite) → `82ee848` (K3 helpers) → `4213465` (K5 App+AppShell+Topbar skeleton) → `bb8c77f` (K6 StartScreen) → `77c339a` (K7 заглушки) → `ce4fb47` (K8 lifecycle) → `aa4f188` (K9 .bodge round-trip) → `c08cf22` (K10 multi-tab) → `b33c441` (K11 CSS+v05-cleanup). K4 retrofit: `441b53b` (lib/hotkeys.js + 6 базовых хоткеев) + `baa01c8` (consumer-rewire через registry + tooltips). M-A-fix-2: `fedbeed` (ProjectInfoModal + 7-й хоткей `'project-info'` ⌘I + reducer updateDescription + кнопка ✏️ в Topbar + Esc-handler приоритет). M-A-fix-1 + runtime additions Игоря — несколько коммитов руками после Code (theme toggle вынос, Guide stub, back button, handleNewProject auto-open, export mode toggle, delete button с confirm, downloadBlob helper в file-system.js, tag suggestions блок добавлен Chat'ом через Filesystem). **Total ~17 коммитов в ветке `feature/racetrack-canvas`**, последний — поверх `fedbeed`.

**Что работает (полная картина после M-A).**
- **Стартовый экран (Variant B v7 wireframe):** split panel layout 220px sidebar + Recent column. Header: amber wordmark BodgeGene + Guide (стуб M-A.1) + Settings + ☀/🌙 ThemeToggle. Sidebar 4 primary actions: `+ New project` (amber filled, ⌘N), `↑ Open .bodge…` (outline, ⌘O), `↓ Import sequence` (disabled, M-B), `⤓ Export .bodge…` (toggle, disabled при empty Recent). Sidebar Browse: Library (M-H) / Primer pool (M-F) / All projects (TBD) / Group projects (disabled `soon`). Footer: «Install as desktop app» (M-A.1).
- **Recent карточка:** name (или italic «Untitled») + meta `time-since · N containers · saved/unsaved` + path (monospace или italic placeholder) + tags chips (или italic placeholder) + description (italic 3-line clamp или italic placeholder). Hover: delete `×` bottom-right (opacity 0.55 → 1.0, danger color, `window.confirm()` подтверждение). В export mode: чекбоксы top-right, click toggle selection, header «Выбор для экспорта · N выбрано», кнопка «Скачать выбранные (N)» через `writeBodge` + `downloadBlob` с 80ms паузой между файлами.
- **In-project (после createProject):** Topbar = back-button `‹` (popFullscreen или closeProject) + project name + ✏️ кнопка info-modal + dirty-dot + filename (monospace) + save-status справа + Settings + ThemeToggle. DAG canvas = серый placeholder «Empty project. Push containers from Importer (coming in M-B).» (M-B заменит на @xyflow/react).
- **ProjectInfoModal (⌘I / Ctrl+I / клик ✏️):** name + description + tags. Auto-open после createProject. Tag suggestions из всех проектов в IndexedDB derived через store, exclude already-added, sort by frequency then alphabetical, click chip → add to active. Save применяет diff через renameProject + updateDescription + addTag/removeTag, closeProjectInfo, toast «Сохранено». Cancel/Esc/backdrop = close без сохранения.
- **Hotkey registry (`lib/hotkeys.js` 7.62 KB):** 7 entries (`new-project` / `open-bodge` / `save-bodge` / `close-project` / `open-settings` / `escape` / `project-info`). System-fixed (no rebind, no cheat-sheet popup). Single global keydown listener в App.jsx через `runHotkeyResolver`. Scope priority: `'fullscreen:X'` > `'context-aware'` > `'global-with-project'` > `'global'`. Skip-in-input default true, override `allowInInput: true` для `save-bodge` + `escape`. Esc context-aware: `modals.projectInfo` > `modals.settings` > `popFullscreen` > no-op. Tooltips через `formatHotkey(id, platform)` — Mac «⌘S» / Win-Linux «Ctrl+S». Все consumer-кнопки рендерят `title=`.
- **Persistence двухуровневый (DEC-V2-23):** IndexedDB autosave throttle 2s + debounce 5s через Dexie + `.bodge` explicit save через ⌘S (File System Access API + fflate ZIP с manifest.json + project.json, fallback на `<a download>`). Multi-tab guard через `navigator.locks`. recentProjectIds в localStorage, sync с Dexie на init. v0.5 wipe migration на первом запуске (один-shot helper `lib/v05-cleanup.js`).
- **Theme:** `data-theme="light|dark"` атрибут на root, CSS-vars в index.css mapped из DESIGN_SYSTEM tokens. Persist в localStorage `bodgegene-theme`. ThemeToggle в Topbar/StartScreen header (☀/🌙 иконка инверсная — показывает куда переключиться).
- **Toasts:** минимальный inline `<ToastBar/>` в App.jsx (single toast, auto-dismiss 3.5s). Используется при Save success, export complete, .bodge с containers warning. Custom Toast с queue — M-A.1.

**Финальные числа.** Vitest 739/739 passed (баzeline до M-A был 1031, удалено 305 v0.5 тестов, добавлено 95 новых v0.6: 81 от core + 14 от K4 retrofit и K7 sanity → 712. После M-A-fix-2 +13 новых: 8 ProjectInfoModal + 3 hotkeys (mac/win + scope-gate + map-shape) + 1 hotkey-flow integration + 1 K6 sanity → 739). pytest 112/112 (бэкенд не трогался). vite build clean. **Размер budget OK** для всех затронутых файлов: App.jsx 9.22 KB / 40 hard, lib/hotkeys.js 7.62 KB / 25 hard, ProjectInfoModal.jsx 9.45 KB + tag suggestions ~+1 KB / 40 hard, Topbar.jsx 5.04 KB / 40, SettingsModal.jsx 9.63 KB / 40, projectSlice.js 13.74 KB / 25.

**Известные edge cases / технодолг (вынесено в TECH_DEBT.md).**
- **TD-HOTKEY-MODAL-GUARD:** ⌘N inside открытой ProjectInfoModal/SettingsModal создаёт новый Untitled проект и переоткрывает modal. Не теряет данные (предыдущий сохранён в Recent если был сохранён), но переключает контекст без явного действия. Симптом: 4 Untitled проекта от Ctrl+N edge case в моей визуальной приёмке. Fix — в `runHotkeyResolver` блокировать `'new-project'` / `'open-bodge'` / `'close-project'` / `'open-settings'` когда `modals.projectInfo || modals.settings`, кроме `'escape'`.
- **TD-PROJECTINFO-SUGGESTIONS-NOTESTS:** мой tag suggestions блок без unit-тестов. 3 теста добавить: (a) excludes already-added; (b) sort by frequency then alphabetical; (c) click adds + closes block если был последний.
- **TD-EXPORT-DELETE-NOTESTS:** runtime UI Игоря (auto-open, export toggle/checkboxes/handleExportSelected, delete confirm flow) без тестов. ~5 тестов в `StartScreen.test.jsx`.
- **TD-CMD-W-VIVALDI-LIMITATION:** Vivaldi/Chrome/Edge перехватывают Cmd+W. Fallback через `‹` back-button. Решение M-A.1: PWA install (`manifest.json` + service worker) — standalone window отключает chrome-уровневые хоткеи.
- **TD-PWA-SETUP-DEFERRED, TD-TOAST-UI-MINIMAL** — кандидаты M-A.1.

**Архитектурные решения (DECISIONS.md, новый блок «Sprint M-A FINAL»).** 4 sprint-level DEC-MA-01..04 (без ⚓): theme toggle в правом углу header а не Settings; ProjectInfoModal как central UI редактирования project metadata; auto-open ProjectInfoModal после createProject; tag suggestions derived из store.projects sort by frequency. Все anchor-уровневые решения уже зафиксированы в DEC-V2-01..30 + DEC-DS-01.

**Архивация по §4 playbook.** `docs/SPRINT_M-A.md` 54.80 KB → `docs/archive/SPRINT_M-A.md` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 30.04.2026 (включая M-A-fix-1 UX, M-A-fix-2 ProjectInfoModal, runtime additions, tag suggestions)`. CURRENT_TASK.md очищен до заглушки «Sprint M-A закрыт. Следующий шаг — M-B kickoff (Importer + первый MoleculeContainer на DAG) в новой сессии». BUGS.md без изменений (M-A не открывал багов, OPEN остаётся пустым на старте v0.6). TECH_DEBT.md — добавлены 6 новых TD entries (см. выше).

**Post-mortem (§4 п.6 playbook).** Цикл M-A прошёл с двумя fix-итерациями: M-A-fix-1 (UX, FAIL → fix руками Игоря) + M-A-fix-2 (ProjectInfoModal, FAIL после визуальной приёмки M-A → mini-spec → fix). Обе итерации успешны с первого захода. Post-mortem срабатывает (≥2 fix цикла).

**Root causes не выловленные изначально.** (a) Theme toggle в Display tab Settings — стандартное место по моим прежним опытам, но Игорь хотел сразу-видно-сразу-доступно (☀/🌙 в углу). Корень: я по умолчанию пихнул в Settings без вопроса «насколько часто биолог хочет переключать тему?». Если бы вопрос был задан — Игорь сказал бы «часто, должно быть на видном месте». Закрывается sanity check §2 playbook'а (вопрос про workflow биолога). (b) UX gap «Untitled проект без UI редактирования» — я в M-A spec явно написал «out of scope: Tag autocomplete (M-H Library)» но не подумал что **базовое редактирование name/description/tags само по себе тоже out of scope в моей спеке**. Корень: спека M-A была про lifecycle/persistence skeleton, и я не задал вопрос «как биолог задаёт имя проекта после createProject?». Если бы задал — было бы сразу включено в scope. (c) Auto-open ProjectInfoModal после createProject — Игорь добавил руками, и это правильно, но я в mini-spec M-A-fix-2 написал «modal открывается из Topbar ✏️ либо ⌘I». Не подумал что биолог только что создал проект и хочет тут же дать имя (UX-симметрия с большинством apps — Notion, Figma, etc.). Корень тот же — недостаточная эмпатия к workflow биолога в формулировке spec'и.

**Вывод.** Sanity check §2 в playbook'е (3 вопроса перед спекой) реально работает на масштабе anchor-decisions / архитектуры, но **проседает на UX-конкретике** (где разместить кнопку, что должно открываться сразу). Для UX итераций уровня «UX-fix» (тип C по §13) полезно добавить четвёртый sanity-вопрос: **«Как биолог попадёт в эту функцию? — primary action / hotkey / icon button / автоматически после related action?»** Это явно адресует пробел (a) + (c). Записать как поправку §2 playbook'а в следующую сессию (M-A.1 либо M-B kickoff).

**Снимок размеров координационных файлов после финализации.** PROJECT_STATE.md ~42 → ~50 KB (эта запись добавлена); DECISIONS.md ~78 → ~80 KB (+ Sprint M-A FINAL block ~2 KB); TECH_DEBT.md 29.30 → ~32 KB (+6 TD entries); CURRENT_TASK.md ~63 KB → ~2 KB (заглушка); BUGS.md 1.54 KB (без изменений); CLAUDE.md / CHAT_PLAYBOOK.md — без изменений в этой сессии. docs/ — 7 активных файлов (SPRINT_M-A.md в archive), под лимитом 8.

**Следующий шаг.** Compact обязателен (§7 playbook — после финализации спринта всегда). После compact — кандидаты следующих сессий: (1) **M-A.1 polish** (PWA install + custom Toast компонент + тесты для runtime additions + TD-HOTKEY-MODAL-GUARD fix + TD-PROJECTINFO-SUGGESTIONS-NOTESTS тесты + TD-EXPORT-DELETE-NOTESTS тесты), (2) **M-B kickoff** (Importer + первый MoleculeContainer на DAG + backend wiring + @xyflow/react). Игорь решает приоритет в начале следующей сессии. Параллельно: userMemories sync через `memory_user_edits` (deferred — нет инструмента в текущем functions block, либо Игорь приложит руками либо следующая сессия Chat сделает первым делом).

---

**Сессии старше Sprint M-A core** (M-A wireframe selection 30.04.2026; Систематизация репо v0.6+ 30.04.2026; цикл ImportStartScreen 28.04.2026 ×3 — Catalog Polish FIX-2 / App-Decomp / IS-Final; Sprint Import-Start-Screen 27.04.2026; Sprint X cycle 26.04.2026; UX Vision 26.04.2026; Sprint UX-1 prototype 23.04.2026; Sprint 2a.1 23.04.2026; Sprint 2a 23.04.2026; Sprint 1.7 22.04.2026; Sprint Map-WS-1 cycle 21.04.2026; Sprint 1.6 21.04.2026; Sprint 1.5 20–21.04.2026; Sprint 1 acceptance 20.04.2026; MUTWIZ-SANITIZE 20.04.2026; Sprint 1 19–20.04.2026; Этап 1.1 и 1.2 18.04.2026; 12 сессий 03.04.2026, блоки 4b–11b) → архив `docs/archive/SESSIONS_2026_Q2.md`.

