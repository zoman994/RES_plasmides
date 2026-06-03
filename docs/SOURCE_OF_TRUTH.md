# BodgeGene — единый источник правды: хотелки и статус (на 02.06.2026)

> Документ заменяет чтение десятков архивов в `docs/archive/`. Каждая хотелка аннотирована статусом и эволюцией; в скобках — док-evidence (`ANCHORS.md`, `DECISIONS.md`, `RELEASES.md`, спеки в `docs/archive/`). Версия на момент написания — **v0.8.4-alpha**, Vitest **4223 pass**, Dexie **DB_VERSION=6**, `.jsx`-компонентов 206.

---

## 1. Видение

**BodgeGene** — локальный визуальный конструктор генетических сборок (плазмид) уровня investigator-grade, нацеленный в первую очередь на **грибные экспрессионные платформы** (*Aspergillus niger*, *Trichoderma reesei*; вторично *Pichia*, *Yarrowia*). Аудитория — биолог-одиночка или малая академическая лаборатория, которому Excel + папки `which_one_is_current.gb` заменяют систему версионирования конструктов. Продукт сознательно НЕ копирует SnapGene/Benchling для general-purpose редактирования: его USP — честная provenance дизайн-намерения (откуда фрагмент, какой реакцией получен), assembly-first канвас с зонами-сборками, и интеграция доменного знания (ферменты, CAZy, промоторы) прямо в поверхность дизайна. Автор — Игорь Синельников, ФИЦ Биотехнологии РАН. Архитектура — local-first, открытый формат `.bodge` (ZIP + GenBank), без SaaS и без аккаунтов (`docs/VISION.md`, `ANCHORS.md` DEC-V2-06/07/08).

---

## 2. Хотелки по областям

### 2.1 Библиотека / Parts

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Library = единый primary workspace, весь внешний ввод через неё | ✅ готово | 🔁 Импортёр-как-fullscreen отброшен после фидбэка биолога 06.05 («раздражает отдельной сущностью»). DEC-IMP-06 (v0.8.0 K4-K11) поглотил Importer в Library. |
| Library = плоская личная коллекция (контейнеры + праймеры) | ✅ готово | 🔁 Изначально 3-tier ownership (project-local/shared/catalog) в ARCHITECTURE_v2 §2.7 → отброшено как «отвратительно ванильный Benchling». DEC-LIB-01/02 (`M_B_KICKOFF_NOTES`). |
| Дерево Library: 2 зоны (БЕЗ ПРОЕКТА / .bodge), а не 4 | ✅ готово | 🔁 Было 4 зоны (loose/active_bodge/readonly_bodge/lab_pool). Lab pool снесён из дерева (станет View «Только праймеры»). DEC-UIRREV-ZONES-MERGE-01 (10.05). |
| Read-only по умолчанию + явный pill EDITABLE (amber + pulsing dot) | ✅ готово | DEC-LIB-16 (v0.8.0). 🔁 v1 M-X.7a трижды провалилась: глобальный `readOnly={true}` стёр все аффордансы инспектора; v2 переписана как обёртка над `LibrarySingleInspector`, а не замена (Antip.8/9 в `CHAT_PLAYBOOK_APPENDIX`). |
| Onboarding через ненавязчивый nudge-баннер, не блокирующую модалку | ✅ готово | DEC-LIB-17 (v0.8.0). |
| Save flow: явный COMMIT POINT («Перезаписать» / «Сохранить как версию») + bump версии + toast | ✅ готово | DEC-LIB-K7-OVERWRITE-01, DEC-LIB-13. Гибрид: silent write-through (safety-net, не теряем при refresh) + явный revision marker. DEC-LIB-WRITE-THROUGH-HYBRID-01 (07.05). |
| Правка последовательности = manual-edit branching (новая ветка при первой правке) | 🟡 в работе | DEC-LIB-12 заменил DEC-LIB-05 (frozen forever). Confirm-modal + branch-создание готовы; character-level apply в SequenceView было отложено в TD-LIB-K10-CHARACTER-APPLY, далее доработано в editable-assembly. |
| Library ↔ project = копия (origin:library_clone, новый UUID), не ссылка | ✅ готово | DEC-LIB-06. |
| Quick-add hover-«+» на записи Library → в активный проект | ✅ готово | DEC-LIB-K8-QUICKADD-01 (v0.8.0), расширено на все bodge-zone записи (v0.8.1). |
| Library-wide search / sort / bulk-select / multi-delete | 📋 план | Не блокер при <50 записей; при 100+ Library некомфортна. TD-LIBRARY-SEARCH-SORT-BULK (M-H polish). |
| PrimerUsage back-references (от контейнера → праймеры, от праймера → контейнеры) | 📋 план | DEC-LIB-07, реализация в M-F. |
| LibrarySingleInspector декомпозиция (опц. 2-й extract, ~5-7 KB) | 📋 план | 31.28 KB > soft 30. Решение Игоря (PROJECT_STATE). |

### 2.2 Canvas / Сборка

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Four-tier модель: Source → Piece → Reaction → Product | ✅ готово | T1-T10 (16-18.05). 4 параллельных slice: containers / pieces / operations / zones. `SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE` (30 DEC-CANVAS-4T-*). |
| Piece как первичная сущность в `state.pieces[]` (не op.params.range) | ✅ готово (⚓ кандидат) | DEC-CANVAS-4T-01 / DEC-T1-01. Promotion в ANCHORS.md ОТЛОЖЕН до визуальной приёмки T-серии. |
| Zone = Miro-frame (рамка, label, drag/resize/merge, viewMode) | ✅ готово (⚓ кандидат) | DEC-CANVAS-4T-07. Явная инициатива Игоря (Q-new-1, 16.05) — решить «кашу» из многих сборок на одном холсте. |
| 3-lane auto-layout (sources / intermediate dagre LR / finals) | ✅ готово (⚓ кандидат) | DEC-CANVAS-4T-31 / DEC-T4.5-*. Триггер — скрин 17.05 «свалка» из 16-нодного pks4 knockout. Заморожен для доработки (DECISIONS: «толком не работает»). |
| Inline sequence-mode per zone (toggle G/S, 3 состояния empty/palette/assembled) | ✅ готово | DEC-CANVAS-4T-08/09/10, T7. 🔁 Выбран inline в рамке зоны, НЕ отдельный editor-tab. |
| Auto-reactions: piece.acquisitionMethod → авто-создание PCR/Cut ромба | ✅ готово | T8. 🔁 Заменило big-bang шаг «Realise» на непрерывное авто-создание реакций. |
| Канвас = только зоны-сборки, БЕЗ свободных контейнер-нод | ✅ готово | 🔁 Крупный разворот. Было: «все контейнеры на канвасе всегда» (DEC-CANVAS-02). Стало: DEC-V0.8.3-CANVAS-FINAL-MODEL (23.05). `SPEC_CANVAS_NO_LOOSE_CONTAINERS`. zoneId:null — мёртвый путь. |
| Чистый старт: НЕТ default-зоны, НЕТ ghost-placeholder | ✅ готово | 🔁 РЕВЕРС DEC-T3-08 (default «Сборка 1») + V61 (ensureGhostPlaceholder) 17.05 по AskUserQuestion Игоря «Полностью из state». |
| Wheel-zoom-к-курсору, бесконечный канвас, hand-pan, edge-auto-pan | ✅ готово | Canvas UX батч (v0.8.3). |
| Drop entry на занятый контейнер → попап «Заменить / Клон / Отмена» | 📋 план | M-CANVAS-POLISH. |
| Instance-counter badge (⎘ «Копия pUC19») при повторе sourceEntryId | 📋 план | DEC-CANVAS-V2-INSTANCES-NOT-DEDUP-01 (дубликаты не сливаются — честность к историчности). |
| Cross-zone link badges («← Зона N» + click-to-pan) | ✅ готово | T8. UI cross-zone-связей (DEC-T3-10) частично спит — поля есть, доп. UI не строится. |
| Design variants (variantGroupId) и clone variants (materializedClones[], cap 96) | ✅ готово | T9. Разные сущности: design = N альтернативных дизайнов; clone = N колоний из одной реакции. |
| Editable assembly (печать nt в сборке → новый блок; SPLIT_PIECE; сдвиг праймеров) | 🟡 в работе | S1-S3 реализованы в working-tree (Vitest 3915→3995), ждут визуальной приёмки. Порог snippet/synthesis ~80 nt. `SPEC_EDITABLE_ASSEMBLY_S1/S2/S3`. |
| Custom-segment: одна секция «Вставить свой сиквенс» вместо 3 модалок (Обвес/Синтез/Gap) | 🟡 в работе | 🔁 Игорь: «отвратительные названия». SAFE-scope (вставка в конец) готова; cursor-split/Ctrl+V (§6) отложены до явного go. `SPEC_ASSEMBLY_CUSTOM_SEGMENT`. |
| Единый source-picker (LibrarySearchBar) для канваса и ассемблера | ✅ готово | 🔁 EmptyAssemblyLibrary удалён (−17 KB). DEC: «ассемблер не должен иметь свой picker». `SPEC_ASSEMBLY_PICKER_UNIFICATION`. |
| Per-junction конфиг стыка (метод/overlapTarget/len|Tm) инлайн на стыке | 📋 план | 🔁 Двухуровневость: внутренние {overlap,RE} vs closure {Gibson,GG,KLD,RL}. Дефолт = overlap (не detect-by-ends). Realise → только визуализация, MethodPickerCard удаляется. `SPEC_ASSEMBLY_JUNCTION_MODULE` (29.05, draft). |
| Preview операции до Execute (затенение «что режем», primer coverage, mutation-dots) | 📋 план | 🔁 Суперсежено — OpPopup-архитектура переработана four-tier. Идея сохранена в BACKLOG (follow-up). `SPRINT_M_CANVAS_OPS_PREVIEWS`. |

### 2.3 Sequence-вьювер и правка

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Один универсальный SequenceView (SnapGene-эталон), мульти-трек аннотации | ✅ готово | 🔁 Снесены 5 параллельных вьюверов (~72 KB: SequenceMapView, SequencePane, SequencePreview, SequenceEditor, CDSEditor). `SPRINT_M-B.3`. DEC-SQV-07: НЕТ container-импортов, plain fragments. |
| Дисплей-настройки (5 toggles в ⚙ popover): обе цепи, AA-рамки, RE-tick и т.д. | ✅ готово | Принцип «лучше удалить плохое потом, чем добавлять» (M-B.3). |
| Responsive charsPerLine (ResizeObserver, clamp 60-120, кратно 10, 80 bio-default) | ✅ готово | ⚓ (Map-WS-1-fix-B). |
| Wrap-tail: рендер призрачных строк через origin кольцевой плазмиды | ✅ готово | 🔁 Round-10: trailing-wrap схлопнут INLINE в bridge-строку (биолог: «новой строки быть не должно»). V102 — рендер аннотаций/праймеров/RE на wrap-половине (AATrack исключён). DEC-WRAPTAIL-03. |
| Выделение через origin (circular selection, каретка/клавиатура) | 📋 план | Pointer-путь готов; keyboard wrap-nav асимметричен. TD-CIRCULAR-SELECTION, TD-WRAP-KEYBOARD-NAV. |
| Все 5 виверов несут одинаковую пятёрку primer-props (синхронный primer UX) | ✅ готово | DEC-V0.8.3-VIEWER-SYNC. |
| Единый хук useSequenceSelection (3 RE-стратегии pair-select/cut/off) | ✅ готово | 🔁 Диагностика: рендерер один, дублировалась оркестрация. Все 5 call-sites мигрированы (22.05, Vitest 3917). `SPEC_VIEWER_UNIFICATION`. |
| Overlay-геометрия точна на первом рендере (без клика) | ✅ готово | V96: единый layoutEpoch на все 5 оверлеев. |
| Tm только для primer-sized выделений (~18-50 nt), иначе «Tm участка» | ✅ готово | WT-UX-14, `SPEC_ASSEMBLY_EDITOR_UX_BATCH`. |
| Decomp SequenceView/index.jsx (49.71 KB, hard breached) | 📋 план | mandatory-first для спринта, трогающего core. TD-SIZE-SEQUENCEVIEW-INDEX. |
| Shift+Arrow расширение выделения | 📋 план | TD-SEQUENCEVIEW-SHIFT-SELECTION (открыт с v0.7.1). |

### 2.4 Аннотации

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| 3-уровневая модель: region > detail > point, всё в annotations[], НЕТ domains[] | ✅ готово | ⚓ Фундаментальная. `REFACTORING_ANNOTATIONS`, `ANNOTATION_VERSIONING`. 🔁 domains[] как отдельное поле отброшено (`PART_MODEL` его ещё имел). |
| AA-координаты не хранятся — вычисляются на лету (floor(nt/3)+1) | ✅ готово | `ANNOTATION_VERSIONING`. |
| Аннотация-редактор инлайн в SequenceView (Del/H/drag-handles/double-click rename/E-modal) | ✅ готово | M-X.2 (v0.7.2). |
| Fullscreen Annotator как bulk-pass инструмент, toggle-кнопка в TabBar | ✅ готово | DEC-V0.8.3-ANNOTATOR-TOGGLE. Scope = Library/Importer + container-editor. |
| Annotator-плагины в Web Worker (переключение «быстрее мысли») | ✅ готово | DEC-PERF-WORKER-01 (06.05). |
| Структурный предиктор: confident (заливка) vs predicted (dashed+пусто) + signals[] provenance | 🟡 в работе | M-X.1. Детекторы: σ70 / stem-loop terminator / sgRNA scaffold / ORF. Predicted = transient, НЕ в .bodge. DEC-PRED-06. |
| Авто-аннотация БЕЗ шума: убраны linker / промотор-субфичи / poly-A / signal-peptide | ✅ готово | 🔁 Игорь: «не надо НАСТОЛЬКО МНОГО» (давало 25+ записей). DEC-AA-01 (v0.7.0). Типы оставлены в палитре для ручного добавления. |
| Per-CDS SignalP/Phobius по требованию (не авто) | 📋 план | TD-PER-CDS-SIGNALIP (M-D). Кнопка сейчас disabled-stub. |
| Click на имя common-фичи в Annotator → телепорт к ней в SequenceView | ✅ готово | DEC-ANN-LOCATE-01 (06.05). |
| LinearFeatureBar рендерится даже при 0 аннотаций (ghost-фичи) | ✅ готово | DEC-LINEAR-BAR-EMPTY-01 (06.05): early-return gate убран. |
| Партиал-детекция: усечённая фича не дробится/не теряет хвост; CDS-бокс = вся ДНК | ✅ готово | V134 (X-drop seed-extend + mergeCollinearPartials) + V138 (nt-refine бокса, cap=2). Принято Игорём 31.05. DEC-FDP-01. |
| Аннотации versioned как first-class commits в commits[] | 📋 план | Направление выбрано 27.04 (вариант A). TD-ARCH-ANNOTATION-VERSIONING. Блокирует V137. |
| Decomp AnnotationTrack.jsx (48.54 KB hard breached) | 📋 план | TD-ANNOTATIONTRACK-DECOMPOSE-V2 (mandatory-first). |
| Смена типа фичи обновляет существующий трек, не плодит дубль | 📋 план | V137 (OPEN, низкий, не диагностирован). Зависит от annotation-commits. |

### 2.5 Рестрикция / Golden Gate / праймеры

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Строгое разделение: GG_ENZYMES (Type IIS) vs RE_ENZYMES (63 классич.), два файла | ✅ готово | ⚓ `ENZYME_NOTE`. Никогда не смешивать. |
| Tm = SantaLucia 1998 NN везде (не Wallace ±5°C) | ✅ готово | 🔁 V105: Wallace выпилен проектно после расхождения Tm авто-праймеров vs редактора. ⚓. |
| Хвосты праймеров сборки по pydna-конвенции (сборка собирается / фермент режет) | ✅ готово | V123 (overlap/Gibson/OE-PCR + self-closure), V124 (GG rev-tail), V125 (RE-ligation 5'-flanking). DEC-PRIMER-TAIL-01 (28.05). Тесты проверяют биологию, не строки. |
| reverseComplement сохраняет все IUPAC коды (не схлопывает в N) | ✅ готово | V118: COMPLEMENT_MAP расширен на полный IUPAC. |
| digest() режет аннотацию через cut-сайт на 2 валидные дуги (не start>end) | ✅ готово | V122 (linearize-ветка). Excise-ветки молча дропают straddling — follow-up. |
| Restriction cloning = 2-фрагментная сборка на существующем канвасе (не отдельный workflow) | ✅ готово | ⚓ `RESTRICTION_CLONING` (Фаза 1+2). digest/checkDoubleDigest/checkInsertSites/checkReadingFrame/generateRETail. |
| RE-сайт двухкликовый range-picker (фрагмент между двумя сайтами) | ✅ готово | V88. |
| Adaptive overlap для No-PCR соседей (full 30bp на ПЦР-стороне; warning если оба No-PCR) | ✅ готово | ⚓ `BLOCK_COMBINATIONS`. |
| Канвасовый primer-derive.js НЕ получил orientation-фиксы V123/124/125 | 📋 план | ⚠ V130/V131 (OPEN, высокий). Две primer-системы расходятся. Ждёт `SPEC_PRIMER_TAIL_UNIFICATION` (draft 29.05): единый `buildOverlapTail`, GG/RE приводятся к V124/125 только после pydna-golden-fixtures. |
| ORF circular wrap (ORF через origin) | 📋 план | V120 (отложен, низкий): нужен проброс topology + wrap-координаты. |
| Миграция на pydna (BSD-3) — замена самописных golden-gate/restriction-db/tm | 📋 план | Q-STRAT-07. Третий независимый сигнал (OpenCloning, teemi, pydna). primer3-py отвергнут (GPLv2). |
| Saturation mutagenesis (20 аминокислот за раз → N контейнеров) | 📋 план | M-CANVAS-MUTAGENESIS (Волна 1-2). |
| GG fidelity prediction (Potapov 2018) / overhang-ribbon (green/red/grey) | 📋 план | Из UX-референса (SnapGene/Geneious). Не начато. |

### 2.6 Импорт-экспорт `.bodge`

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| `.bodge` v2 = ZIP с first-class разделами: containers (валидный GenBank) / assemblies / primers / notebook | 📋 план | `SPEC_BODGE_FORMAT_V2_CORE` (19.05). Каждый контейнер открывается в SnapGene БЕЗ BodgeGene (выплата ⚓ DEC-INTEROP-01, не выполненной в v1). Бамп до v0.9.0. |
| Provenance в GenBank COMMENT (base64-JSON, append-only commits[]) | 📋 план | DEC-V2-26. K0 SnapGene fixture probe — эмпирический гейт перед реализацией. |
| Atomic write (.tmp + .bak + verify) + _recovery.json + README.md в ZIP | 📋 план | Переживает cloud-sync. README — archive longevity (решение Игоря 19.05). |
| schema_version в файле (заложить ДО фиксации формата) | 📋 план | Урок из OpenCloning (`COMPARATIVE_OPENCLONING`). 🔁 wipe-стратегия DEC-V2-08 → пересмотр на версионные миграции (Q-STRAT-09). |
| Markdown лаб-журнал внутри .bodge (notebook/entries.json, @@ref@@, KaTeX, DOMPurify) | 📋 план | `SPEC_BODGE_NOTEBOOK_MARKDOWN` (19.05). 2 kind: free-text/sanger. Реализуется ПОСЛЕ CORE. Построено+тесты, не примонтировано (NotebookTab). |
| Импортёр на OSS-парсерах (SnapGeneReader .dna + bio-parsers GenBank/FASTA) | 📋 план | Q-STRAT-08 (M-B). |
| Экспорт в SBOL3 (публикуемая интероперабельность) | 📋 план | Q-STRAT-09. 🔁 SBOL3 как native storage отброшен (RDF overhead) — только secondary export за feature-flag. |
| Парсер .dna: единый источник истины (snapgene_parser.py PRIMARY, BioPython FALLBACK) | ✅ готово | ⚓ DEC-PARSER-COORD-01: 0-based exclusive end сквозно, конвертация только на входе. V50 off-by-1 закрыт. `SPRINT_PARSER_UNIFICATION`. |
| Fix V103: parseFasta дропает сиквенс при «>F1 ACGT» на одной строке | ✅ готово | `SPEC_WT_B_IMPORT_BATCH` (v0.8.3). |
| Fix V104: canvas-import пропускал common-feature enrichment | ✅ готово | Унифицирован путь LibraryTreeHost с продакшн-импортёром. |
| autoAnnotate toggle в AddModal (default on) | ✅ готово | WT-D-2. Впервые user-facing контроль. |
| URL-импорт (Addgene API) | 📋 план | DEC-IMP-02: отложено v0.7+ (нужен CORS proxy + OAuth). |

### 2.7 Проект / Flow

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Один активный проект (currentProjectId), без множественных [active] | ✅ готово | ⚓ DEC-UIRREV-ACTIVE-SINGLE-01 (10.05). |
| activateProject(id) side-effect-free (только currentProjectId + MRU) | ✅ готово | ⚓ DEC-PROJSLICE-ACTIVATE-PURE-01 (10.05, после FAIL #4). Mode-switch — ответственность callsite. |
| Импорт .bodge = открыть проект (нет отдельной операции «Открыть») | ✅ готово | DEC-PROJECT-OPEN-MERGE-01. 🔁 RecentProjectsDropdown («надмозговое решение») заменён статичным breadcrumb + Command Palette + sidebar «В работе» (DEC-UIRREV-BREADCRUMB-STATIC-01). |
| Pinned-проекты («В работе») = явный жест, hard cap 15; MRU НЕ авто-пинит | ✅ готово | DEC-UIRREV-PINNED-EXPLICIT-01. «Посмотрел ≠ хочу видеть в В работе». |
| Click проекта в дереве активирует, но НЕ переключает в DAG-режим | ✅ готово | DEC-UIRREV-TREE-CLICK-LIBRARY-MODE-01. |
| DAG — режим правой панели, НЕ папка-нода дерева | ✅ готово | DEC-UIRREV-DAG-NOT-FOLDER-01. |
| Project Flow DAG (@xyflow/react, 5 node types, 3 edge types) | 🔁 переработано | Был отдельный 5-нодный DAG (Ctrl+5). Эволюционировал: DAG-as-primary → Canvas-as-primary. См. §3. |
| Group projects (мульти-агент в одном .bodge) | 📋 план | ⚓ DEC-V2-29: обязательная фича (прямая инструкция Игоря «мы их ещё сделаем»). Реализация после M-I. В M-A — disabled stub «soon». |
| Универсальный ReactionNode (14 операций) вместо 5 типизированных нод | ❌ отброшено | `FLOW_V2_DESIGN`: концепция отвергнута 22.04 в пользу 5-node схемы. Ценные под-идеи (инвентарь операций, primer auto-design) извлечены. |

### 2.8 UX «два клика»

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Любая операция ≤ 2 кликов; Expert mode = always ON | ✅ готово | ⚓ `TWO_CLICK_CONCEPT`, `TWO_CLICK_OPS`. 🔁 Student/Expert toggle отброшен — always-expert (`BLOCK2_TOOLBAR_CONTEXT`). |
| window.confirm() запрещён проектно; soft-delete + toast + 5s undo | ✅ готово | DEC-MA1-02. Notion-style toast queue (cap 3, bottom-left). DEC-MA1-01. |
| Theme toggle в углу header (1 клик), не в Settings | ✅ готово | DEC-MA-01 (после FAIL M-A-fix-1). |
| inline > wizard (мастер только при >3 шагах и редко) | ✅ готово | ⚓ принцип VISION. Большинство «мультишагов» = один popup с collapsible-секциями. |
| Keyboard-first: любая операция доступна с клавиатуры | 🟡 в работе | Принцип VISION. Command Palette (Ctrl+P/F с alternates) есть; полный fuzzy-finder по всему контенту — частично. |
| QuickStart на пустом канвасе / ImportDecisionModal при file-drop | ✅ готово | `UX_QUICKSTART`. 🔁 QuickStart сокращён до 1 entry «Начать сборку» (V45), header-кнопка Catalog убрана. |
| Sticky ActionBar после расчёта праймеров | ✅ готово | `UX_POLISH`. |
| Контекст-меню (junction/canvas/tab) как вторичная поверхность действий | ✅ готово | `TWO_CLICK_CONCEPT`. |
| Drop sequence-файла куда угодно на старте → авто-импорт в Library | 📋 план | WT/`SPEC_MAIN_SCREEN_CLEANUP`. |
| Главный экран: убрать дубли «открыть проект» / «импорт», единый ? popover | 📋 план | `SPEC_MAIN_SCREEN_CLEANUP` (deprioritized после M-ASSEMBLY-*). |

### 2.9 Лаб-журнал / Sanger / T-серия

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Sanger MVP лаб-журнал (правая панель, hotkey B, per-zone, 4-status) | ✅ готово | T10. status: pending/verified/failed/unplanned, notes ≤500, clone-dot indicators. Прямой триггер — бумажный диаграмм-набросок Игоря. |
| Click clone-indicator → focus в notebook (event-bus/ref) | 📋 план | TD-T10-SHOW-NOTEBOOK-WIRE (отложено в визуальную приёмку). |
| Force-flush pending Sanger-notes при закрытии панели | 📋 план | TD-T10-NOTES-FLUSH (edge-case потеря данных). |
| Camera capture (фото геля → OCR + temporal-link к операции) | 📋 план | M-LAB-CAPTURE-MVP (Волна 3). |
| ML-классификация геля (success/partial/fail) + подсчёт колоний | 📋 план | M-LAB-CAPTURE-ML (Волна 3). Локальный CNN / institutional cluster. |
| Импорт хроматограммы (.ab1/.scf) → авто-alignment с ожидаемым мутантом | 📋 план | Волна 3. AB1 viewer — отдельный T-future. |
| Construct table (сводная таблица финалов с фильтрами) | 📋 план | DEC-CANVAS-4T-19 (post-MVP T11). Виден на бумажном диаграмме. |
| Глобальный Sanger-view (все зоны, фильтр по зоне) | 📋 план | T-future (T10 сейчас per-zone). |

### 2.10 Common-features

| Хотелка | Статус | Заметка / эволюция (док) |
|---|---|---|
| Раздел common-фич в Library (узел дерева + view-swap, НЕ окно) | ✅ готово | DEC-CF-06. Финализировано 02.06 (Пачки 1-3). §17 R2 reuse. |
| Промоут «Добавить в common-фичи» из вивера (Library-инспектор + ContainerEditor) | ✅ готово | DEC-CF-05. 🔁 Scope = 2 вивера, не 3 — у Importer нет inline context-menu SequenceView. Дедуп: protein-путь ≥0.90 / non-CDS ДНК ≥0.96 RC. |
| Master-detail просмотр (список + LinearFeatureBar + SequenceView + AA-track) | ✅ готово | DEC-CF-10. 🔁 Пачка 1 (lean-список) ПРОВАЛЕНА на приёмке — нельзя верифицировать заводскую запись. Заменено на master-detail. |
| In-viewer editing (editable SequenceView, name/type инлайн, factory→override) | ✅ готово | DEC-CF-12. 🔁 lean-textarea (§9-B) отброшена: Игорь «у нас же всё есть» → always-editable вивер. Debounced Dexie write 400ms. |
| Overlay-стор поверх read-only common-features.json (Dexie v6, исключён из clearAll) | ✅ готово | DEC-CF-01/02/03. getMergedFeatureDB мёржит для детекции. Дедуп=детекция (общий feature-match-core). |
| Common-фичи НЕ в палитру (отдельный стор, не libraryEntries, panel не drag-source) | ✅ готово | DEC-CF-07 (держится по построению). |
| UI-строки common-features → English | ✅ готово | DEC-CF-11 (⚓ DEC-MA2-01). 🔁 RU-девиация Code отклонена. |
| common-features.json дедуплицирован (синонимы AmpR/BlaR и т.д.) | ✅ готово | DEC-COMMON-FEATURES-DEDUP-01: 419→408 (11 дублей). |

### 2.11 Формат `.bodge` v2 — сводка решений

| Решение | Статус | Заметка (док) |
|---|---|---|
| containers/<id>.gb = canonical source of truth; library/entries.json = metadata-index | 📋 план | DEC-FMT-V2-LIBRARY-CANONICAL-01 (кандидат ⚓ после 6 мес). |
| schema bump v=10→v=11 | ❌ отброшено | Внутренний state не меняется; единственная ручка — fileFormatVersion semver. |
| Academic scaffolding (ORCID, license, DOI, embargo, lastEditor) | ❌ отброшено | Игорь — единственный пользователь. Добавится semver-minor при нужде. |
| Source raw blobs (.dna/.gb/.fasta) внутри ZIP | ❌ отброшено | Достаточно provenance trail в COMMENT (решение Игоря 19.05). |
| extensions/<vendor>/ — unknown data read/write bit-perfect | 📋 план | Core никогда не валидирует/не стрипает. |
| Export profiles (full/public-supp/containers-bundle/single-assembly) | 📋 план | + .bodgeassembly portable export. |
| Auto-save в файл (Google-Docs-style) | ❌ отброшено | DEC-V2-23: «File = что я явно сохранил». IndexedDB autosave 2s/5s — safety-net. closed-no для v1.0. |

---

## 3. Что менялось (эволюция мнения)

### Архитектурная линия (главная хронология разворотов)

1. **PlasmidVCS CLI → BodgeGene SPA** (март 2026)
   *Было:* `pvcs` Python CLI с git-метафорой (semantic diff, strain registry, SQLite object-store, SnapGene как внешний редактор) — `README.md`, `docs/archive/architecture.md`.
   *Стало:* React SPA визуальный конструктор; Python остался только для .dna-парсинга. *Почему:* GUI-first сильнее для биолога без кода; диф-центричный workflow заменён assembly-центричным.

2. **3-levels навигация → v2 Project Model → Canvas-model → four-tier** (апрель-май 2026) — самая длинная цепь:
   - **3-levels** (`ARCHITECTURE_3LEVELS`, 09.05): макро DAG / мезо парт-канвас / микро Container Window. *Почему отброшено:* DEC-CANVAS-01 — парт-канвас и DAG это один датасет с разным layout; три workspace → один.
   - **Project Model v1/v1.1** (`PROJECT_MODEL_KICKOFF`, 28.04): Container = «виртуальный стол» + lazy git commits[]; MoleculeContainer vs AssemblyContainer. *Почему пересмотрено:* AssemblyContainer как класс отброшен (DEC-V2-02 — сборка = ProjectCommit-ребро, не объект).
   - **ARCHITECTURE_v2** (29.04): DAG-as-primary-view как USP. *Почему пересмотрено:* DAG-first не покрывал sequence-first workflow биолога.
   - **Canvas-model** (`ARCHITECTURE_CANVAS_MODEL`, 11.05): один Canvas с Layout/Graph view, все контейнеры всегда на холсте (DEC-CANVAS-01/02). *Почему пересмотрено:* op.params.range смешивал «выбор куска» и «параметры ПЦР».
   - **Four-tier T1-T10** (16.05, `SPEC_M-CANVAS-FOUR-TIER`): Source→Piece→Reaction→Product. *Почему:* триггер — Игорь 15.05 описал реальный SnapGene-workflow (sequence-first) + бумажный диаграмм pks4 (6 зон, 9 PCR, 3 Gibson). Piece стал first-class сущностью. Это текущая база.
   - **Финал-модель канваса** (23.05, DEC-V0.8.3-CANVAS-FINAL-MODEL): на холсте ТОЛЬКО зоны-сборки, свободных контейнеров нет. *Почему:* «полумесяцы стыковки» вводят в заблуждение (pipeline = план, не результат).

3. **Переименования вех:**
   - **M-A..M-I** (`CHAT_PLAYBOOK_CORE`): M-A start screen → M-B importer → M-C container window → M-D editable assembly → M-E mix → M-F primers → M-G reactions → M-H library → M-I DAG polish. Схема версий: M-A.x=v0.6.x, M-B=v0.7.0, M-C=v0.8.0…
   - **M-X.* ветка** (M-X.1 предиктор → M-X.5 Library-as-workspace → M-X.7a структура → M-X.8 project-hub → M-X.9 search) — параллельная серия доработок внутри v0.7-v0.8.
   - **F1-F4 → A1-A4 → T1-T10**: F-серия (Window/Junction/Product canvas) → A-серия (Assembly Drafts, sequence-first) → поглощены T-серией. Вся `docs/archive/2026-05-16-pre-four-tier/`. *Почему:* F1-F4 = DAG-first (демотировано до «isolated PCR»); A1-A4 = промежуточная попытка; T1-T10 = финальная модель с Piece.

4. **Смены модели данных:**
   - **parts[] → Library**: глобальный parts[] со статусами draft/verified/archived (`PARTS_LIFECYCLE`, `PLAN_BLOCK_3B`) → плоская Library-коллекция (DEC-LIB-01).
   - **fragment.mutations[] → Plasmid-Git**: плоский массив мутаций → baseSnapshot + commits[] + HEAD + replay (Sprint X, 26.04). *Почему:* indel-aware highlights требовали replay, не позиционного диффа. ⚠ Сейчас plasmid-git **отвалился** — был подключён только через снесённый FragmentEditor (TD-PLASMID-GIT-LOSS).
   - **containers → pieces/zones**: explicit container-nodes → pieces в зонах (T-серия).
   - **3-tier Library → flat**: project-local/shared/catalog → плоская личная (DEC-LIB-01).

5. **CHAT_PLAYBOOK CORE/APPENDIX split → remerge** (01.05 → 24.05): разбили по правилу «>15 секций», ветки разошлись, слили обратно. *Почему:* декомпозировать доки только под реальной болью, не по счётчику секций.

6. **Зелёная линия процесса:** прототип-first для крупных UX (23.04) → kickoff-interview перед спекой → режим «Звено» (24.05: читать код от симптома, править в чате, принимать в живом app, без спек на фиксы).

### Биология-driven развороты (фидбэк Игоря)

- **Per-boundary → per-group метод сборки**: нельзя смешивать Gibson на одном стыке и Restriction на следующем в одной реакции (`SPEC_ASSEMBLY_WORKFLOW_UX`).
- **Wallace → SantaLucia везде** (V105): одна плазмида показывала два Tm в двух местах UI.
- **Авто-аннотация: «не надо НАСТОЛЬКО МНОГО»** (DEC-AA-01): 25+ записей шума убраны.
- **Дефолт метода стыка = overlap, не detect-by-ends** (29.05): detectJunctionKind понижен до подсказки-бейджа.
- **lean → master-detail → editable** common-features (Пачки 1-3): дважды отвергнут lean-вариант.

---

## 4. Отброшено / заморожено

### Отброшено (❌)

| Идея | Почему (док) |
|---|---|
| Universal ReactionNode (14 операций) | Отвергнут 22.04 в пользу 5-node схемы (`FLOW_V2_DESIGN`). |
| Student/Expert progressive-disclosure toggle | Expert always ON (`BLOCK2_TOOLBAR_CONTEXT`, CLAUDE.md). |
| 3-tier Library ownership (project-local/shared/catalog) | Benchling-style «отвратительно ванильный» (DEC-LIB-01). |
| AssemblyContainer как класс с lifecycle | Сборка = ProjectCommit-ребро в DAG (DEC-V2-02). |
| MoleculeContainer.tagIds[] | Теги только на LibraryEntry (⚓ DEC-LIB-10). |
| domains[] как отдельное поле | Всё в annotations[] с level:detail (`REFACTORING_ANNOTATIONS`). |
| Lazy git (null vs [] как «untouched») | commits:[] всегда; «untouched» = length===0 (DEC-V2-15). |
| Свободные контейнер-ноды на канвасе | Только зоны-сборки (DEC-V0.8.3-CANVAS-FINAL-MODEL). |
| Полумесяцы стыковки контейнеров | Вводят в заблуждение (pipeline=план); junction-line + kind-badge. |
| Default зона «Сборка 1» + ghost-placeholder | РЕВЕРС DEC-T3-08 + V61 17.05 («Полностью из state»). |
| Step1→Step2 двухэкранный импортёр | Single-screen 4-column (V49 50-сек зависание; DEC-IMP-13). |
| Library fullscreen как отдельное окно | Свёрнута в Importer→Library (DEC-MB-01/DEC-IMP-06). |
| RecentProjectsDropdown в topbar | «Надмозговое решение»; sidebar «В работе» + ⌘P. |
| SBOL3 как native storage | RDF overhead; только secondary export (DEC-V2-10). |
| schema bump v10→v11 / academic scaffolding в .bodge | Внутренний state не меняется / единственный пользователь. |
| Source raw blobs в .bodge ZIP | Достаточно provenance в COMMENT (19.05). |
| Auto-save в файл (Google-Docs-style) | «File = что я явно сохранил» (DEC-V2-23, closed-no v1.0). |
| Open Vector Editor / @teselagen движок | Свой SequenceView лучше обоснован (`COMPARATIVE_OSS_HARVEST`). |
| primer3-py (Tm/primer бэкенд) | GPLv2; pydna (BSD-3) то же без copyleft. |
| Drawio бинарные диаграммы | Mermaid-in-Markdown (version-controllable). |
| V119 (палиндром-RE двойной счёт) | Ретракт 28.05: restriction-db.js имеет свой IUPAC-RC. |

### Заморожено / отложено далеко (📋, post-v1.0)

| Идея | Почему |
|---|---|
| Real-time multi-user collab (CRDT) | Sequences не CRDT-friendly; single-user dominant. Если когда-то — Linear-style server total order. |
| Сходящаяся метафора DAG (виртуальный штатив) | Нет накопленных реальных DAG-данных; post-v1.0 (`UX_VISION`). |
| Mobile native / responsive <1024px | Desktop-first; canvas требует экрана. |
| 3D структура белка / docking / drug discovery | PyMOL/Schrödinger территория. |
| Lab outcome tracking (трансформация-эффективность, контаминация) | BodgeGene моделирует design intent, не lab outcome (DEC-V2-10). v1.5+. |
| Tauri desktop / Rust-WASM twin-target | DEC-ARCH-RUST-WASM-TWIN-TARGET-01; UI остаётся React до PMF. v1.5+. |
| Built-in sync server | Local-first через файл + cloud-папки (DEC-V2-12). |
| Robotic execution / HPLC-MS import / high-throughput | Отдельный трек Волна 4+ / out of scope. |
| Reserved wizards (~190 KB: PlasmidUseWizard, MutagenesisWizard, OligoManager, JunctionBlock) | Заморожены до Container Window M-C.2 — не удалять (BACKLOG категория B). |

---

## 5. Текущий статус

**Версия:** `v0.8.4-alpha` (APP_VERSION в `lib/version.js`). Vitest **4223 pass / 17 skip / 0 fail** (445 файлов); pytest 112-115; `vite build` clean, 0 console errors. Dexie `DB_VERSION=6`. `.jsx`-компонентов (non-test) **206** (242→206 после cleanup −404 КБ). Ветка `feature/m-x-7a-library-structure-v2`.

### Что работает сейчас

- **Four-tier канвас** (T1-T10 + T4.5): pieces / zones / operations / containers; зоны-Miro-frames; 3-lane auto-layout; inline sequence-mode (G/S toggle, 3 состояния); auto-reactions; cross-zone link badges; design/clone variants; wheel-zoom, бесконечный канвас, hand-pan.
- **Library** как primary workspace: 2-зонное дерево, read-only-by-default + EDITABLE pill, save flow (Перезаписать/Сохранить как версию), quick-add, MultiImportView (batch).
- **SequenceView** универсальный (5 call-sites, общий useSequenceSelection), wrap-tail с рендером на обеих половинах (V102), мульти-трек аннотации, pentagon-arrow primer-глифы по обе цепи, синхронные primer-props на 5 виверах.
- **Annotator**: инлайн-правка + fullscreen toggle, Web Worker плагины, структурный предиктор (ghost-фичи), партиал-детекция (V134/V138, принято Игорём 31.05).
- **Биология-ядро**: SantaLucia NN Tm везде, хвосты праймеров по pydna-конвенции (V123/124/125 в local-primer-design.js), полный IUPAC reverseComplement (V118), digest со split аннотаций (V122), restriction cloning на канвасе.
- **Common-features**: master-detail раздел + промоут из вивера + in-viewer editing + overlay-стор (Dexie v6) — **финализировано 02.06** (Пачки 1-3 приняты).
- **Sequence search** (Ctrl+F seed-extend, queryIdentity position-invariant), **Project hub** (один активный, pinned «В работе», Command Palette).
- **Project Flow DAG** (@xyflow/react), GenBank import/export, soft-delete + toast undo, Notion-toast queue.

### Что в работе (🟡)

- **Common-features Пачки 1-3** — ✅ **завершено и принято 02.06** (формально закрывает последнюю активную задачу).
- **Editable assembly S1-S3** — в working-tree (Vitest до 3995), ждёт визуальной приёмки.
- **Custom-segment** — SAFE-scope готова, cursor-split/Ctrl+V (§6) отложены.
- **Manual-edit branching** — branch + confirm-modal готовы, character-level apply дорабатывается.
- **Структурный предиктор** — детекторы есть, Evidence-tab (M-X.2) частично.
- **Decomp SequenceView/AnnotationTrack** — оба hard-breached (49.71 / 48.54 KB), mandatory-first для соответствующих спринтов.

### Что дальше (📋, из CURRENT_TASK / BACKLOG)

1. **V130/V131** (высокий) — унификация primer-системы: канвасовый `primer-derive.js` не получил orientation-фиксы. Ждёт `SPEC_PRIMER_TAIL_UNIFICATION` (draft 29.05, 5-слойная, gated pydna-fixtures).
2. **V137** (низкий) — смена типа фичи плодит трек (зависит от annotation-commits).
3. **Wiring-спринт** forward-работы (построено+тесты, не примонтировано): лаб-журнал NotebookTab, `.bodge` v2 export/import, canvas-аффордансы T9 K13/K14, Sanger-праймеры. TD-DEAD-REMNANT-630KB (категории A/B/C).
4. **plasmid-git** — возродить в four-tier (commits на container) или похоронить. Гейт — M-C Container Window.
5. **M-FORMAT-V2-CORE** — `.bodge` v2 (бамп до v0.9.0), затем NOTEBOOK.
6. **M-C Container Window** kickoff — после визуальной приёмки T-серии (разблокирует 3 ⚓-кандидата: DEC-CANVAS-4T-01/-07/-31).
7. **Housekeeping** (не блокер): docs/ снова 13 > лимита 8 (TD-DOCS-ROTATION); ANCHORS.md ~191 КБ при описании «~61 ⚓» (TD-DOC-DRIFT-META-SIZE); ~630 КБ мёртвого кода категории C — kill ПОСЛЕ wiring-спринта.

> **Стратегические открытые вопросы (Q-STRAT, решает Игорь):** public service vs self-hostable (Q-STRAT-01), open-source лицензия (Q-STRAT-02), миграция на pydna (Q-STRAT-07), импортёр на OSS-парсерах (Q-STRAT-08), SBOL3-экспорт + OpenCloning-конвенции формата (Q-STRAT-09), расширение за пределы грибов (Q-STRAT-05), Open API + Python SDK (Q-STRAT-11). Источники: `VISION.md` §Q-STRAT, `COMPARATIVE_*.md`.