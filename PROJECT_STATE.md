# PROJECT_STATE.md — BodgeGene

> **Обновлено:** 1 апреля 2026 (вечер)
> **Версия:** v0.4.0-alpha
> **Тесты:** ~540 (428 Vitest + 112 pytest)

---

## Что работает

- Canvas: 4 вида (Blocks, Sequence, Map, Racetrack) + Project Flow
- Drag-and-drop фрагментов из палитры
- Авто-расчёт праймеров (клиентский, без API)
- Склейка фрагментов (Ctrl+Click → floating pill → merged block с "швами")
- Развёртывание склейки (кнопка + double-click)
- validateJunctionEnds с end site scanning (RE/GG)
- Golden Gate: 5 ферментов, overhang validation, conflict resolution
- 55 RE в restriction-db с IUPAC-aware regex
- Undo/Redo (Ctrl+Z/Ctrl+Shift+Z, 50 levels)
- GenBank/FASTA/.dna import + export
- Мутагенез + KLD primer design
- Project Flow DAG (5 node types, 3 edge types, dagre layout)
- 3-level annotation model (region/detail/point)
- Auto-annotate: CDS (signal peptide, tags, domains), promoter (-10/-35/TATA/CAAT), terminator (poly-A)
- Common features DB (26 features, protein exact match + DNA identity)
- FragmentSplitter: split по аминокислотам/нуклеотидам, пресеты (SP, TATA, region boundaries)
- FragmentSplitter: режим "вставка кассеты" — фланки гомологии для knock-in
- .dna import: enrichment всегда (homology naming + detail-level аннотации)
- Feature type inference: regex word boundaries (без false positives)
- Click = select → все горячие клавиши работают (R/E/Del/Ctrl+C/Ctrl+D)

- Unified annotations: `domains` удалены, всё через `annotations[]`, AA-позиции на лету
- Type-dependent context menu (CDS → мутагенез/теги, все → замена/библиотека)
- ReplacePicker: замена фрагмента из библиотеки с фильтром по типу
- TagFusionPicker: 11 preset тегов (His6, FLAG, Strep, V5, TEV, G4S...)
- Компактный header: убран global method toggle + Mutagenesis button
- Flow planner: PCR node edit, real assemblies, MIRO+ с RE/KLD/лигирование

## Что сломано

Открытые баги: **BUGS.md** (0 критичных/высоких/средних, 1 низкий дизайн-задача).

## Что нужно сделать

- BUG-66: концепция шага/этапа в flow DAG (дизайн)
- Тесты для ReplacePicker, TagFusionPicker
- MutagenesisWizard: Step 1 skip при template prop
- Оставшиеся `expertMode &&` обёртки за пределами header

Дизайн-доки:
- `docs/TWO_CLICK_OPS.md` — 10 атомарных операций
- `docs/BLOCK_COMBINATIONS.md` — 16 комбинаций 4 типов блоков
- `docs/FLOW_V2_DESIGN.md` — Universal ReactionNode, 14 операций, primer connection
- `docs/BLOCK2_TOOLBAR_CONTEXT.md` — toolbar redesign + context menu spec
- `docs/ANNOTATION_VERSIONING.md` — unified annotation system spec

---

## Журнал сессий

| # | Дата | Что |
|---|------|-----|
| 27 | 01.04 (вечер) | **Блок 1 + Блок 2 + все баги.** Блок 1: unified annotations (удаление `domains`, 12+ мест), 3 багфикса (BUG-47/54/58), autoAnnotate always, SequenceViewer migration. Блок 2: toolbar redesign — убран global method toggle, type-dependent context menu, ReplacePicker, TagFusionPicker (11 тегов), mutagenesisTarget, junction default=overlap. Закрыты ВСЕ баги (BUG-47..65 + click=select): 23 бага за сессию. Flow planner: PCR edit, real assemblies, MIRO+ с 6 операциями. 428 тестов, build ok. |
| 26 | 01.04 | **6 задач из CURRENT_TASK.md выполнены.** Click=select (PartBlock.jsx), off-by-one fix (server.py), feature name priority + regex word boundaries (parser.py), enrichment после .dna import (file-import.js), annotation splitting при split/replace (useFragmentHandlers.js), режим "вставка кассеты" (FragmentSplitter.jsx). 421 тестов, build ok. Закрыты: BUG-57, BUG-67, BUG-68, BUG-69, BUG-71 + UX click=select. |
| 25 | 31.03 (вечер) | **Глубокий аудит аннотаций + .dna import + flow planner.** Прочитаны ВСЕ файлы pipeline: parser.py → server.py → file-import.js → import-annotations.js → auto-annotate.js → feature-detection.js → annotation-model.js. Найдено 5 корневых причин "аннотации не работают": off-by-one (BUG-67), name priority (BUG-68), pattern false positives (BUG-69), нет detail enrichment (BUG-71), split теряет annotations (BUG-57). Аудит flow planner: 5 багов (BUG-62..66). Спроектирован Flow v2 (docs/FLOW_V2_DESIGN.md). Спроектирован режим "вставка кассеты" для FragmentSplitter. Найден корень нерабочих горячих клавиш: click=select не реализован (PartBlock.jsx line 75, одна строка). Выгружены финальные CURRENT_TASK.md (6 задач с точным кодом) и BUGS.md (20 open). |
| 24 | 31.03 | Глубокая сессия: merge UI, local-primer-design.js, Two-Click концепция, BLOCK_COMBINATIONS, Expert mode → always ON. BUG-40..46. Реорганизация документации. |
| 23 | 31.03 | Phase B+C: validateJunctionEnds + smart end scanning, completeAssembly, SubFragmentBar. |
| 22 | 31.03 | Audit: 15 багов исправлено (BUG 1-21, 26-27). |
| 21 | 31.03 | PCRNode, AssemblyNode, OligoNode, CheckpointNode, FlowEdges, MIRO+, PCRPlanningPanel. |
| 20 | 31.03 | Neoschizomers cleanup. Project Flow Canvas (@xyflow/react + dagre). |
| 14-19 | 30.03 | Racetrack + Miro-flow + restriction-db + JunctionDNA. |
| 13 | 30.03 | ContextMenu, CopySeq, ПКМ. |
| 9-12 | 29.03 | Палитка, категории, импорт. |
| 6-8 | 28-29.03 | Zustand, React Compiler, Tm. |
| 1-5 | 25-27.03 | Canvas, assembly, mutagenesis. |
