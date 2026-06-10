# VISION.md — BodgeGene: политика программы и фичи к реализации

> **Что это.** Единый источник продуктового направления BodgeGene. Две части: **А — политика программы** (что это, для кого, чем не является, открытые стратегические вопросы) и **Б — фичи к реализации** (конкретный бэклог по темам). Часть А — про решения «что мы есть». Часть Б — про работу «что строим».
>
> **Что заменяет.** Консолидирует и замещает восемь доков: `IDEAS_PARKING_LOT.md`, `KNOWLEDGE_BACKLOG.md`, `PRODUCT_BACKLOG_INTEGRATED_WORKBENCH.md`, `COMPARATIVE_OSS_HARVEST.md`, `COMPARATIVE_OPENCLONING.md`, `COMPARATIVE_TEEMI.md`, `UX_VISION.md`, `ROADMAP_CANVAS_V2_TO_PRODUCTION.md`. Эти восемь архивированы в `docs/archive/` 27.05.2026.
>
> **Статус.** Сводка завершена 27.05.2026 (партия 1 + партия 2). Документ — компас, не контракт; перечитывается раз в месяц.
>
> **Оговорка по статусам фич.** Метки статуса в Части Б проставлены по памяти/контексту. Сверка «реализовано / в работе / план» с актуальным кодом — отдельным проходом; до неё статусы провизорны. Спринт-имена и волны re-anchor'ены: T-серия (T1–T10, v0.8.3) переработала canvas-архитектуру, поэтому спринт-разбор Волны 1 из старого ROADMAP частично устарел — несётся структура волн, не устаревший список спринтов.

---

# ЧАСТЬ А — ПОЛИТИКА ПРОГРАММЫ

## 1. Позиционирование

BodgeGene — визуальный integrated workbench для исследователя-биолога, работающего с **грибными экспрессионными платформами** (Aspergillus niger, Trichoderma reesei — основные шасси; Aspergillus fumigatus, Pichia pastoris, Yarrowia lipolytica). Покрывает цикл эксперимента: design → plan → execute → capture → analyze → iterate, не выходя из одного инструмента. Не drawing tool, не database viewer, не cloud SaaS — **investigator-grade инструмент** для одного учёного или малой лаборатории. Не SnapGene-клон: применяет UX-парадигмы 2024-era (canvas с операциями на полотне, прямые манипуляции) к биоинформатике сборки.

**Целевой пользователь.** Первичный — академический биолог / PhD, работающий с экспрессией в нитчатых грибах (свои конструкты, штаммы, эксперименты), solo либо группа 2–5 человек. Вторичный — исследователь в малом biotech (10–50 человек, своё IP, без бюджета на enterprise SaaS). Третичный — PI, использующий BodgeGene как teaching tool. **Не целевой:** E. coli-only (SnapGene/Benchling справляются), mammalian/insect/plant, synbio high-throughput (j5/Genome Compiler), enterprise-команды big pharma (Benchling Enterprise).

**Дифференциатор одной фразой.** Инструмент, который понимает контекст грибной экспрессии и помогает с design + planning + execution + interpretation — вместо того чтобы биолог сам собирал знание из пяти разных мест.

**Четыре столпа дифференциации** (реализуются в Части Б): knowledge integration (§5.7), multi-organism fungi-first (§5.3), протоколы как first-class объекты (§5.9), лабораторный журнал + auto-analysis (§5.4).

**Где в DBTL-цикле.** BodgeGene живёт в фазе DESIGN (+ зачаток BUILD — симуляция операций). teemi показывает, как выглядит покрытие всего DBTL (Design-Build-Test-Learn). Расширяться ли в BUILD/TEST/LEARN — стратегический вопрос (Q-STRAT-10), не фича: от ответа зависит data model.

**Отношение к чужому коду.** Заимствование инфраструктуры значимость не снижает — pydna под капотом у OpenCloning и teemi, эти работы не считаются менее значимыми. Граница, которую держит Chat при планировании: брать чужое как инфраструктуру, не брать то, что составляет вклад. Вклад BodgeGene — стыко-первичная сборочная модель, Canvas V2 с операциями на полотне, единый SequenceView, интеграция. Пока после вычитания заимствованного остаётся уникальное — значимость на месте.

**Публикация.** Реалистична: tool-paper (NAR Web Server, Bioinformatics, BMC Bioinformatics, JOSS) требует software-новизны и работающего инструмента, не оригинальности каждой строки. Прецедент плотный — pydna, teemi, OpenCloning опубликованы. Дистанция до публикации — бэклог и непринятые спринты, не лицензионный вопрос. Что публикацию ослабляет: баги, непринятые спринты, движок, который автор сам называет кривым.

## 2. OSS-ландшафт

«Взять» — четыре разных действия с разным весом лицензии: (1) идея / UX-паттерн / концепция формата — лицензия не нужна; (2) код как зависимость — нужна разрешительная; (3) код в репозиторий (вендоринг) — то же; (4) данные — отдельно, по лицензии базы. GPL заражает backend через `import`, но НЕ через границу процесса (CLI-подпроцесс = mere aggregation) и НЕ через HTTP (frontend остаётся чистым даже при GPL-backend).

**Прямые идейные соседи (изучать как референс направления):**
- **OpenCloning** (MIT) — open-source веб-приложение того же класса задач: планирование и документирование клонирования, история сборки как первоклассный объект, «family tree builder». Стек почти совпадает (React + FastAPI + pydna + LinkML; вьюер — OVE). Модель данных: `sequences` + `sources` (= наш commits-DAG; `Source` = наша операция), 16 типизированных методов клонирования. Зрелость: backend v1.3, институциональная поддержка ELIXIR. Интеграция с elabFTW. Берём как референс модели `.bodge` и data model (см. §5.5, Q-STRAT-09).
- **teemi** (MIT) — НЕ редактор плазмид и НЕ конкурент по UI: Python-библиотека всего DBTL-цикла в Jupyter-ноутбуках (institutional, DTU Biosustain, опубликована в PLOS Comp Biol). Конкурирует с *направлением* BodgeGene, не с canvas'ом. 5 модулей: DESIGN / BUILD / TEST / LEARN / LIMS. Доказательная база — реальный эксперимент: 2 DBTL-цикла, библиотека 1280 вариантов, 2000+ ML-моделей AutoML, 5× рост hit-rate. Code-first парадигму НЕ копируем (другая аудитория) — но teemi задаёт ориентир «весь DBTL» (Q-STRAT-10).

**Брать как зависимость / код — разрешительные лицензии:**
- **pydna** (BSD-3, подтв. Bioconda) — праймеры, PCR, рестрикция, лигирование, гомологичная рекомбинация, Gibson, Golden Gate, симуляция геля с генерацией изображения. Покрывает самописные `golden-gate`, `restriction-db`, `tm`, primer-логику. НЕ покрывает site-directed mutagenesis. De-facto стандарт — три независимых сигнала (OpenCloning, teemi, сам pydna).
- **SnapGeneReader**, EGF-форк (MIT) — парсинг бинарного `.dna` в dict / Biopython SeqRecord.
- **bio-parsers** из tg-oss (MIT) — GenBank / FASTA на JS-стороне.
- **biopython** (BSD-3) — уже используется (fallback-парсер).

**Референс — схему / идею берём, код нет:**
- **SBOL3 / pySBOL3** (pySBOL3 — MIT) — community-стандарт описания дизайна на всех масштабах DBTL-цикла. Кандидат: референс модели `.bodge` v2 + экспорт в SBOL3 как публикуемая фича интероперабельности.
- **OpenCloning LinkML-схема** — референс провенанс-модели (sequence ← source), плоские списки верхнего уровня, GenBank-нотация координат, версионированные миграции. Читать, не копировать.

**Осторожно / отказ:**
- **pLannotate** (GPL-3.0) — сильный auto-annotate (задокументированная feature-база, кастомные базы через YAML, webserver + CLI + модуль). Брать только как bundled CLI-подпроцесс — иначе `import` заражает весь backend GPL.
- **primer3-py** (GPLv2) — отклонён: pydna делает то же под BSD.
- **j5** — не open-source. **DIVA** — чужой стек (Angular + Java). **Open Vector Editor** — standalone-репозиторий deprecated (код в tg-oss). **PlasMapper FeatureDB / PlasMapDB** — лицензия данных неясна.

**Не проверено** (не строить планы как на факте): точная лицензия teemi и OpenCloning_LinkML, лицензия данных PlasMapper, лицензии DIVA и Edinburgh Genome Foundry tools (DNA Cauldron / DNA Weaver).

## 3. Принципы и отказы

**Принципы — фильтр для каждой фичи** (сведены из UX-видения и продуктового манифеста, дубли убраны):

1. **Local-first.** Работает без интернета. Optional cloud sync — бонус, не требование. Данные локально в открытом формате, пользователь владеет ими.
2. **Открытый формат.** `.bodge` публично документирован (ZIP + JSON). Lock-in невозможен, export всегда доступен.
3. **Принцип двух кликов / no friction.** Любая операция ≤ 2 клика. Каждый новый popup/dialog проходит проверку «можно ли без него».
4. **Keyboard-first.** Любая операция доступна с клавиатуры; мышь — для discovery новичком, не для daily use.
5. **Inline > wizard.** Wizard только при строго > 3 sequential steps и редко. Большинство «многошаговых» процессов = один popup с collapsible-секциями.
6. **Один источник правды.** Аннотации только в `annotations[]`, мутации в commits, sequence — через replay, не два инвариантных хранилища.
7. **Sync, не дубль.** Map ↔ Sequence ↔ Editor — синхронный курсор, не дублирующиеся фокусы.
8. **Sanitize-at-entry.** Любая последовательность очищается при вводе (BOM / whitespace / non-IUPAC) в одной точке.
9. **Громкая обратная связь на молчаливые сбои.** Frameshift при insert/delete в CDS — toast. RE-сайт внутри insert — warning. Не молчать.
10. **Знание подкреплено доказательством.** Любая подсказка системы показывает источник (PMID / запись БД / confidence), не «чёрный ящик AI говорит X».
11. **Биолог решает.** Инструмент показывает context, options, predictions с confidence — выбор за биологом. Никакого auto-apply мутаций / auto-design праймеров без явного клика.
12. **Честность важнее полировки.** Frozen-on-use lifecycle, provenance everywhere — surface complexity, не прячь за гладким UI.
13. **Доступность по умолчанию.** WCAG-AA контрасты (≥ 4.5:1), pixel-stable визуализация (карта не растягивается при resize).
14. **Python-scriptable.** Любой контейнер доступен программно (после M-OPEN-API, Волна 4).

**Отказы — что BodgeGene сознательно НЕ делает** (сведено из трёх доков):
- Real-time multi-user collaborative editing — территория Benchling. Если когда-нибудь — через optional sync, не core.
- Нативные мобильные приложения. Web responsive — возможно, не приоритет.
- 3D-визуализация структуры белка / concentric-ring карта плазмиды — территория PyMOL; single-ring — universal-стандарт.
- Drug discovery / молекулярный докинг — территория Schrödinger.
- Clinical-grade / FDA / GMP комплаенс — investigator-grade инструмент, не регуляторный.
- High-throughput screening automation — территория j5 / Twist / Inscripta.
- AI, пишущий праймеры / последовательности за биолога без его понимания — нарушает принцип «биолог решает».
- Складской учёт реагентов (stock / expiry / ordering).
- Genome editing tools (специализированный CRISPR-дизайн) — этим заняты отдельные инструменты.
- Bioinformatics workflow management — территория Snakemake / Nextflow.
- Mammalian / insect / plant экспрессия как first-class.
- IDT / Twist API ordering integration — gated партнёрскими соглашениями; v1 — CSV-экспорт достаточно.
- Hairpin / dimer 2D-рендеринг вторичной структуры — тяжёлая физика; метрики (Tm, hairpin) показываем, 2D-визуал — нет.
- Build-your-own-feature-library из текстового файла (ApE-стиль) — избыточная гибкость; common-features.json + user-аннотации + GenBank-импорт достаточно.
- Полумесяцы стыковки контейнеров на canvas — вводящая в заблуждение семантика (pipeline это план, не результат). Честный дизайн: junction-линия + kind-бейдж.
- Многошаговые wizard'ы для операций — анти-парадигма DEC-CANVAS-08.

Все «не делаем» — defensible decisions, не «может быть позже». Сдвиг любого в «может быть» требует явного пересмотра этого документа.

## 4. Стратегические вопросы (Q-STRAT)

Открытые решения, гейтящие направление. Каждый — рамка, не ответ.

- **Q-STRAT-01 — публичный сервис vs self-hostable.** Самый важный. Public service — больший reach, но SaaS-инфраструктура, multi-tenancy, поддержка. Self-host — меньше friction, но затруднена дистрибуция, нет аналитики/community. Доступ к институциональному кластеру слегка склоняет к self-host + опциональный кластерный compute. Решение — до M-CANVAS-MERGE (меняет deployment-архитектуру).
- **Q-STRAT-02 — open-source vs proprietary vs hybrid лицензирование.** Влияет на community engagement и права на attribution при интеграции знаний из статей. Не блокирует разработку.
- **Q-STRAT-03 — scope AI/ML.** Локальный inference (ONNX Runtime Web / WebGPU; HyenaDNA-tiny, DNABERT-2 через LoRA) vs cloud. Локальный — privacy, без API-costs, но медленнее и ограничен 4 GB VRAM. Cloud — быстрее, крупнее модели, но зависимость. Решение — до M-KNOWLEDGE-PAPERS (Волна 3).
- **Q-STRAT-04 — pricing, если когда-нибудь.** Free для academic, paid для commercial? Donation-based? Решение отложено до валидации product-fit.
- **Q-STRAT-05 — тайминг расширения аудитории** за пределы грибов (E. coli, дрожжи, mammalian). Фундамент (multi-organism архитектура) заложен; рано — теряется fungal-дифференциатор, поздно — конкуренты заняли соседние ниши. Решение — по итогам Волны 2.
- **Q-STRAT-06 — regulatory + IP.** Где хранятся данные, кто видит конструкты, есть ли audit trail. Self-host + local-first решает большую часть; при cloud-sync нужна явная политика. Решение — до первого коммерческого пользователя.
- **Q-STRAT-07 — pydna vs самописный backend-движок.** Не рядовой пункт — задевает идентичность проекта. Три независимых сигнала, что pydna — стандарт. Подпункт: pydna НЕ покрывает мутагенез, модуль `mutagenesis` остаётся отдельным в любом случае.
- **Q-STRAT-08 — SnapGeneReader + bio-parsers для импортёра M-B.** Низкий риск, ближайший практический выигрыш.
- **Q-STRAT-09 — экспорт `.bodge` в SBOL3** как фича + SBOL3 / LinkML как референс модели данных. Сюда же: версионированные миграции `.bodge` (по образцу OpenCloning) vs текущий wipe при смене версии (DEC-V2-08) — wipe пока терпим, но при накоплении реальных `.bodge` потеря данных неприемлема.
- **Q-STRAT-10 — направление по DBTL.** BodgeGene остаётся сильным DESIGN-инструментом с отличным UX, или тянется в BUILD / TEST / LEARN (как teemi). Стратегический вопрос, не фича: от ответа зависит data model — нужны ли сущности «библиотека вариантов», «штамм», «титр». Решение — по итогам Волны 2.
- **Q-STRAT-11 — scripting-доступ к `.bodge`.** OpenCloning и teemi дают программный путь, BodgeGene — чисто визуальный. Зафиксировать: визуальный путь сознателен, или scripting-доступ (Python SDK, см. §5.8) — в бэклоге.

---

# ЧАСТЬ Б — ФИЧИ К РЕАЛИЗАЦИИ

> Формат: **название** — суть. _Статус · приоритет / волна · OSS-аналог._ Статусы провизорны до сверки с кодом.

## 5.1 Canvas / сборочный workflow

- **Preview операции на полотне** — затенение «что удаляем» (Cut) / подсветка «что копируем» (PCR) прямо на ContainerBlock, не только в OpPopup. Переключаемый preview-mode как hover-state. _Статус: уточнить по коду · полировка._
- **Expanded ContainerBlock** — circular minimap для плазмид, linear ribbon для фрагментов; toggle compact↔expanded (compact при N ≥ 5, expanded для review с чтением фич). _Статус: уточнить · полировка._
- **Collapse / expand multi-fragment Gibson** — кластер 5+ фрагментов сворачивается в одну иконку. _План · полировка._
- **PCR без template** — операция только из пары праймеров → output-ампликон без темплейта (синтетические гены). _План · полировка._
- **Auto-detect Type IIS overhang'ов** — если все фрагменты в Gibson-попапе несут 4-нт BsaI / BsmBI overhang'и, попап предлагает Golden Gate как default. _План · полировка._
- **Ручная кнопка «+ контейнер»** — добавление placeholder вручную (toolbar / правый клик). _План · полировка._
- **Instance-counter на ContainerBlock** — при повторе `origin.sourceEntryId` бейдж `(2)` / `⎘` + hover «Копия pUC19». Info-only. _План · полировка._
- **Drop entry на занятый контейнер** — попап «Заменить / Создать клон / Отмена» + per-session «не спрашивать снова». _План · полировка._
- **«Скрыть предков» ноды** — дешёвый приём против переполнения canvas (взят у OpenCloning). _План · полировка._
- **Multi-template PCR** — overlap-extension PCR через несколько темплейтов одной парой праймеров. _Парковка._
- **Сходящаяся метафора DAG (виртуальный штатив)** — рядом с расходящейся метафорой (DAG-as-tree, git-branches) — сходящаяся (DAG-as-recipe: «беру пробирку A + B + master mix → продукт C»). Никто из конкурентов её не визуализирует. Биолог иногда смотрит на проект как на дерево, иногда как на штатив. _Парковка · post-v1.0 (нужны накопленные DAG-данные реальных проектов)._
- _Открытый вопрос:_ re-execute операции — ручная новая vs кнопка «Re-execute» с pre-filled params.
- _Открытый вопрос:_ визуализация draft-операции — dashed-ромб на canvas vs панель «Pending operations».

## 5.2 Мутагенез

- **Saturation mutagenesis batch** — 20 аминокислот за раз на одну позицию: один попап (position select + «All 20» + «Custom»), 20 output-контейнеров как кластер с expand / collapse. _План · Волна 1–2._
- **Real mutagenesis tools в editor** — mutagenesis-таб перестаёт быть копией SequenceTab: point mutation inline, KLD / QuickChange primer design, mutation history per-container с revert. _Статус: уточнить по коду · Волна 1._
- _Примечание:_ pydna мутагенез не покрывает — `mutagenesis` остаётся самописным модулем (Q-STRAT-07). Единый редьюсер `applyMutationsBatch` для обоих entry points (canvas-операция и editor-таб).

## 5.3 Multi-organism / fungal-specific

Столп 2 дифференциации. Каждый контейнер / операция / аннотация знает organism-context; codon tables, secretion signals, promoter strength, glycosylation — organism-specific.

- **Organism как поле** — `container.meta.organism` + project-level default; Library-фильтр «показать только Aspergillus». _План · Волна 2._
- **Codon-adaptation как операция** — `CodonOptimizeOpPopup` с выбором организма; output — контейнер с оптимизированной последовательностью + annotation diff. _План · Волна 2._
- **Оценка силы грибных промоторов** — auto-detection известных (glaA / cbh1 / gpdA / amyB / gla1) при загрузке контейнера → аннотация «known promoter, expected strength». _План · Волна 2._
- **Предсказание гликозилирования** — N-linked sites (regex-level быстро) + опциональная ML-модель паттернов для нитчатых грибов. _План · Волна 2._
- **Предсказание сигналов секреции** — локальная SignalP-style модель / DeepTMHMM SLURM-job на кластере; auto при добавлении CDS или кнопка on-demand. _План · Волна 2._
- **Библиотека вариантов как сущность** — если идём в strain engineering (Q-STRAT-10), комбинаторная библиотека (промотор × ген × организм) не моделируется текущими контейнерами. Пробел data model. _Парковка · зависит от Q-STRAT-10._

## 5.4 Лабораторный журнал / capture

Столп 4 дифференциации. Wet-lab данные связываются с конкретной операцией на canvas с минимальным friction.

- **Markdown-журнал внутри `.bodge`** — `notebook/entries.json` + `notebook/attachments/`. CommonMark + GFM + кастомный `@@ref:kind:id@@` (типизированные ссылки на контейнеры / зоны / операции / праймеры / клоны / external). Два kind записи: free-text и sanger. Split-view редактор, рендер через markdown-it + DOMPurify, KaTeX лениво. _План · спринт M-FORMAT-V2-NOTEBOOK, после `.bodge` v2 CORE._
- **Camera capture** — фото с камеры → auto-OCR метаданных (дата, sample ID из labels) + привязка по времени к недавней операции, биолог подтверждает. _План · Волна 3._
- **ML-классификация геля** — success / partial / fail / unclear; грубая, не quantification; локальная CNN либо кластер. _План · Волна 3._
- **Подсчёт колоний на чашке** — фото агара → ML-count, привязка к Transform-операции. _План · Волна 3._
- **Импорт хроматограммы секвенирования** — .ab1 / .scf → auto-alignment с ожидаемым мутантом → подсветка различий → привязка к Mutagenesis / KLD; sanger-запись журнала линкуется к clone-строкам панели T10. _План · Волна 3._
- _Примечание:_ начать дёшево можно с локальной CSV-таблицы образцов (контейнер → где лежит → статус) — паттерн teemi `csv_database` / CloneCoordinate; полный capture-loop не обязан стартовать сложным.

## 5.5 Импорт / форматы

- **`.bodge` v2** — ZIP с четырьмя first-class сущностями: **containers** (каждый — валидный `.gb` GenBank-файл с COMMENT-провенансом, открывается в SnapGene без BodgeGene — выплата ⚓ DEC-INTEROP-01), **assemblies** (zone + pieces + operations + junctions на JSON), **primers** (project-scoped pool), **lab journal** (§5.4). Плюс: `README.md` в корне ZIP (zero-JS, archive longevity, читается без BodgeGene), `_recovery.json` (восстановление при повреждении ZIP), `extensions/` (bit-perfect preserve чужих vendor-данных), export-профили (full / public-supp / containers-bundle / single-assembly / custom), atomic write, `fileFormatVersion` semver в файле. _План · спринт M-FORMAT-V2-CORE, бамп до v0.9.0._
- **Импортёр на OSS-парсерах** — SnapGeneReader (.dna) + bio-parsers (GenBank / FASTA). _Кандидат · M-B · Q-STRAT-08._
- **Экспорт в SBOL3** — публикуемая фича интероперабельности. _Кандидат · Q-STRAT-09._
- _OSS-информировано:_ из OpenCloning — `schema_version` в файле, плоские списки верхнего уровня, GenBank-нотация координат, версионированные миграции (Q-STRAT-09). GenBank — лингва-франка (подтверждают и OpenCloning, и teemi): `.bodge` обязан с ним дружить.

## 5.6 Backend-движок

- **Миграция на pydna** — замена самописных `golden-gate` / `restriction-db` / `tm` / primer-логики; бонус — симуляция геля для лабжурнала. _Стратегическое решение · Q-STRAT-07._

## 5.7 Knowledge integration (M-KNOWLEDGE, Волны 2–3)

Столп 1 дифференциации. База знаний интегрирована inline в design surface, не как отдельный search-engine: система сама подсказывает в момент design-решения, с доказательством (PMID / запись БД / confidence). Не универсальный literature-tool — curated subset + контекстная поверхность. Девять категорий справочной базы:

- **Рестриктазы** — ~600 всего, грибной приоритетный subset ~50–80. Поля: recognition-site (regex), cut-position, overhang-type / sequence, изошизомеры, буфер, methylation-sensitivity, star-activity. Источник — NEB. _Волна 2 (M-KNOWLEDGE-MVP)._
- **CAZy-семейства** — GH / GT / PL / CE / AA, фокус грибной: GH18 хитиназы (личный интерес — Aspergillus chiB, Trichoderma chi18), GH7 / GH6 целлобиогидролазы (T. reesei CBH1 / CBH2), GH5 эндоглюканазы, GH61 / AA9 LPMO, GH10 / GH11 ксиланазы. _Волна 2._
- **Pfam-домены** — ~500 грибных (PF00704 Glyco_hydro_18, PF00734 CBM_1 и др.). _Волна 2._
- **Грибные промоторы** — ~30–50 с измеренными данными силы (glaA, gpdA, amyB, cbh1, alcA, niiA / niaD). _Волна 2 (M-FUNGAL-SPECIFIC)._
- **Сигналы секреции** — ~20 грибных signal peptides (GlaA SP — workhorse A. niger, CBH1 SP — T. reesei) + carrier-fusion стратегии. _Волна 2._
- **Таблицы кодонов** — A. niger, A. oryzae, T. reesei, P. pastoris, Y. lipolytica, S. cerevisiae. Источник — Kazusa / HEG. _Волна 2._
- **Векторы-бэкбоны** — ~30–50 грибных экспрессионных (pAN52, pBARGPE1, pTrex). _Этическая оговорка: scraping Addgene = нарушение ToS, запрошен официальный API; пока — только публичные метаданные / ручной ввод._ _Волна 2._
- **Reference-статьи** — ~500–1000 seed для M-KNOWLEDGE-PAPERS: интеграция через embeddings, контекстные рекомендации («3 статьи о похожей мутации в этой позиции»). _Волна 3._
- **Worked examples** — ~100–200 case studies для inline UX-подсказок (goal → конструкт → результат → PMID). _Волны 2–3._

## 5.8 Distribution / расширяемость

- **`.bodge` round-trip + дистрибуция** — self-host vs публичный сервис связаны с Q-STRAT-01. Tauri desktop shell — отложен (DEC-ARCH-RUST-WASM-TWIN-TARGET-01). _План · зависит от Q-STRAT-01._
- **Институциональный кластер integration** — отдельный трек «backend computation»: BLAST / Pfam / dbCAN / HMMER / AUGUSTUS / DeepTMHMM / Helixer как SLURM-job-операции (sequence → кластер → аннотации). _План · трек после Волны 1._
- **M-OPEN-API** — REST/GraphQL endpoint к контейнерам / операциям / аннотациям; Python SDK для скриптинга; plugin-система для custom операций и типов аннотаций. _План · Волна 4 · реализует принцип 14 (Python-scriptable) и Q-STRAT-11._
- **Custom container kinds** — за пределами oligonucleotide: RNA, белок, маркер, сложные конструкты, через `container-kind-registry`. _План · Волна 4._

## 5.9 Протоколы как first-class объекты

Столп 3 дифференциации. Protocol — отдельная сущность, связанная с операциями на canvas. Двойной взгляд: digital design (операции-ромбы) + wet-lab steps (linked protocol с таймингами, реагентами, hands-on действиями), синхронизированы — изменил annealing temp на canvas → шаг протокола обновился.

- **Protocol entity + canvas linkage** — shape `{id, name, steps:[{description, duration, temperature, reagents, notes}], variables, related_operations, success/fail count}`; отдельная Dexie-таблица; bidirectional-связь операция ↔ протокол. _План · Волна 2 (M-PROTOCOLS-MVP)._
- **Дефолтные шаблоны** — auto-generated протокол на каждый из 6 kind операций (PCR / Cut / Gibson / Ligate / KLD / Mutagenesis), переопределяемый per-операция через inline-редактор. _План · Волна 2._
- **Экспорт протокола** — protocol-step-list для бенча: markdown с чекбоксами / PDF (print-friendly). _План · Волна 2._
- **Библиотека протоколов** — reusable-шаблоны («My Gibson with HiFi Master Mix», in-house SOP), shared между проектами; protocol history (какие конструкты собраны каким протоколом, success rate). _План · Волна 2._
- _Harvest из v0.5:_ в v0.5 протоколы «щупали» — забрать рабочие data structures / step-формат, переосмыслить UX (см. `V05_PROTOCOLS_RECAP` в архиве).

## 5.10 UX-дифференциаторы — 7 ставок

Семь точек, где BodgeGene innovate (из анализа конкурентов SnapGene / Benchling / Geneious / ApE / pLannotate). Каждая — фича к доводке.

1. **Plasmid-Git: state + time** — каждое изменение фрагмента = commit с операцией+параметрами, не file-snapshot; `applyMutationsBatch` создаёт N commits в одной транзакции; replay по HEAD реконструирует sequence; toggle commit'а. Универсальный гэп: ни один инструмент не имеет first-class staged-then-committed паттерна и two-way base-level diff. _Статус: baseline есть, two-way diff viewer / branch / tag / граф истории — нет._
2. **Mutation effect badges** — first-class значок эффекта на каждой мутации (silent / missense / frameshift / stop-gained / extension) + громкий toast при frameshift. _Статус: silent/nonsilent классификация есть; frameshift / badges / toast — нет._
3. **Tag-aware primer library** — drag-and-drop тега (His6, FLAG, V5, Strep-tag II…) из панели в 5′-extension праймера, с превью эффекта (Tm, длина, hairpin). _Статус: data layer есть (`tags-db`), UI-панели нет._
4. **Smart primer merging** — при близких мутациях (< 60–80 bp) split-алгоритм merge'ит их в один multi-site primer вместо отдельных коротких PCR-фрагментов. _Статус: нет; split плодит 30–60 bp фрагменты._
5. **Decision-modal-driven import** — явное семантическое подтверждение при импорте («детектировано: circular, X bp, Y CDS-warnings — подтвердить?»), re-index origin, выбор записи из multi-record файла. _Статус: процессуальный decision-modal есть, семантический шаг — нет._
6. **Fragment-aware annotation rendering** — аннотации с coverage < 95% рендерятся white-fill + colored-outline (pLannotate-стиль) + provenance-tooltip на hover («GenoLIB, 98% identity, 87% coverage»). _Статус: можем считать coverage, визуала нет._
7. **Command palette (Ctrl+K)** — universal fuzzy-finder по всем операциям / фичам / праймерам / RE-сайтам. _Статус: CommandPalette есть (⌘P), индексация контента — уточнить._

---

# 6. Волны (roadmap-скелет)

Структура волн — durable; конкретный спринт-разбор пишется в спрейт-кикофф сессиях. T-серия (T1–T10) переработала canvas-архитектуру внутри Волны 1.

- **Волна 1 — Canvas V2 → production.** Цель: vertical slice одного эксперимента end-to-end (импорт pUC19 + insert → canvas → операции PCR/Cut/Gibson → editor → мутагенез → save `.bodge` → reload). После закрытия — фундамент для остального бэклога. _В работе._
- **Волна 2 — Integrated workbench.** Knowledge integration + multi-organism + протоколы MVP — 3 из 4 столпов дифференциации на минимально работающем уровне.
- **Волна 3 — Lab-capture + papers.** Wet-lab capture loop + интеграция статей через embeddings — 4-й столп; знание становится контекстным.
- **Волна 4 — AI + расширяемость.** Локальный AI-inference (ONNX / WebGPU), открытый API + Python SDK, custom container kinds.
- **Волна 5+ — открыто.** Расширение аудитории за пределы грибов (Q-STRAT-05), regulatory-фичи при коммерциализации (Q-STRAT-06), направление по DBTL (Q-STRAT-10). Формируется по итогам Волн 1–4 + реальный feedback.

---

# 7. Карта источников

Чем заменяется каждый старый док — для доказуемо безопасной архивации.

| Раздел VISION.md | Источник (старый док) |
|---|---|
| 1 Позиционирование | COMPARATIVE_OSS_HARVEST §0; PRODUCT_BACKLOG §1; COMPARATIVE_TEEMI §7 (DBTL) |
| 2 OSS-ландшафт | COMPARATIVE_OSS_HARVEST §1–5; COMPARATIVE_OPENCLONING; COMPARATIVE_TEEMI |
| 3 Принципы и отказы | UX_VISION §3–5; PRODUCT_BACKLOG §4, §6; IDEAS_PARKING_LOT §2 |
| 4 Q-STRAT | PRODUCT_BACKLOG §2; COMPARATIVE_OSS_HARVEST §6; COMPARATIVE_OPENCLONING §7; COMPARATIVE_TEEMI §7; IDEAS_PARKING_LOT §1 |
| 5.1–5.4 Фичи | IDEAS_PARKING_LOT §1; UX_VISION §0.1; PRODUCT_BACKLOG столп 4; SPEC_BODGE_NOTEBOOK_MARKDOWN |
| 5.5 `.bodge` v2 | SPEC_BODGE_FORMAT_V2_CORE; COMPARATIVE_OPENCLONING §3 |
| 5.6 Движок | COMPARATIVE_OSS_HARVEST; COMPARATIVE_TEEMI §4 |
| 5.7 Knowledge | KNOWLEDGE_BACKLOG; PRODUCT_BACKLOG столп 1 |
| 5.8 Distribution | ROADMAP §5 (Q3); PRODUCT_BACKLOG Волна 4 |
| 5.9 Протоколы | PRODUCT_BACKLOG столп 3 |
| 5.10 UX-ставки | UX_VISION §3 |
| 6 Волны | PRODUCT_BACKLOG §5; ROADMAP §2–4 |

---

_Создан 27.05.2026. Партия 1 + партия 2 сведены. Восемь исходных доков архивированы в `docs/archive/` 27.05.2026._
