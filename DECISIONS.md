# BodgeGene — Архитектурные решения

Append-only журнал. Решения не удаляются и не пересматриваются без явного обсуждения.
Формат: `[ДАТА] **Решение.** Обоснование.`

---

## Архитектура / State management

[2026-03-28] **Zustand v5 вместо useState/Context.**
App.jsx был монолитом в 1350 строк с 40+ useState. Zustand даёт: granular selectors (shallow equality), middleware (persist, devtools, immer), тестируемость вне React. 5 domain slices: project, fragment, junction, primer, ui.

[2026-03-28] **React Compiler v1.0 вместо ручного useMemo/useCallback.**

[2026-03-28] **Immer middleware для иммутабельных обновлений.**

[2026-03-28] **Manual undo/redo вместо zundo.** Debounce 300ms, max 50 уровней.

[2026-03-28] **Throttled persist — localStorage writes max 1/sec.**

[2026-03-28] **devtools только в DEV.**

[2026-03-28] **Prefix sum selector для координат праймеров.** O(1) lookup.

---

## Биологические алгоритмы

[2026-03-28] **SantaLucia 1998 NN Tm.** ΔH/ΔS, Owczarzy 2008 Mg²+ коррекция → ±1-2°C.

[2026-03-26] **Golden Gate: 5 ферментов, 32 orthogonal overhangs.**

[2026-03-26] **KLD мутагенез по протоколу NEB #M0554.**

[2026-03-25] **Assembly strategy: Auto / All-at-once / 3 parts / 2 parts.**

---

## Рендеринг последовательности

[2026-03-29] **Character grid (ch units) для всех sequence views.**

[2026-03-29] **SequencePreview — единый компонент.** 60 нт/строку. Layers: ruler → label → color strip → нт → АК.

[2026-03-29] **Интроны: lowercase + hatching в sequence view, dashed arcs на circular map.**

[2026-03-27] **4 вида canvas: Blocks (Ctrl+1) / Sequence (Ctrl+2) / Map (Ctrl+3) / Racetrack (Ctrl+4).**

---

## UI / UX

[2026-03-29] **Два типа объектов: Плазмиды и Запчасти.** Плазмида = circular + ≥2 regions.

[2026-03-29] **Три режима: Canvas, PlasmidViewer, PlasmidUseWizard.**

[2026-03-29] **Группировка запчастей по 8 категориям.** Coding, Regulatory, Markers, Origins, Structural, Recombination, RNA, Other.

[2026-03-25] **Okabe-Ito color system.**

[2026-03-30] **Racetrack canvas для circular конструктов.** Овал, ширина ∝ bp (log), junctions = quadratic Bezier.

---

## Данные и аннотации

[2026-03-29] **Аннотации трёхуровневые: region > detail > point.**

[2026-03-29] **Common features database: 96 NCBI accessions.** Async detection (6-frame protein + DNA 96%).

[2026-03-26] **Part versioning: parent/child с derivation types.**

---

## Импорт / палитка

[2026-03-30] **ContextMenu.jsx через createPortal в document.body.** Flip-логика при выходе за экран.

[2026-03-30] **removePart() — отдельный action.** Part в библиотеке ≠ Fragment на canvas.

---

## Circular Map rendering

[2026-04-03] **PlasmidViewer/Wizard: mapFragments = [{whole plasmid}], не массив регионов.** Регионы плазмиды перекрываются (nested CDS, gene внутри operon). При передаче как отдельных "фрагментов" PlasmidMap суммирует их длины — offset превышает totalBp, арки уходят за 360°. Решение: всегда передавать одну плазмиду; PlasmidMap рисует sub-arcs по annotations с assignSubTracks() (max 4 tracks).

[2026-04-03] **presetMode в PlasmidUseWizard: instant actions vs multi-step.** Instant (view, use_whole, disassemble, mutate, versions) → execute immediately в useEffect. Multi-step (restriction_cloning, replace, extract, delete, insert) → setStep(presetMode). Нельзя использовать useState initializer — presetMode может прийти позже.

[2026-03-30] **enrichWithCommonFeatures fallback в file-import.js.** Если бэкенд 0 features → fallback на common features DB.

---

## Project Flow Canvas

[2026-03-31] **@xyflow/react (React Flow v12) для Project Flow DAG.**

[2026-03-31] **Два уровня: Construct View (Ctrl+1-4) + Project Flow (Ctrl+5).**

[2026-03-31] **projectFlowSlice — 6-й slice.** Не в SNAPSHOT_KEYS (undo только construct).

[2026-03-31] **5 типов нод + 3 типа edges.** plasmid/pcr/assembly/oligo/checkpoint. Edges auto-typed по target.

[2026-03-31] **MIRO+ dropdown на source handle.** Hover → + → click → dropdown операций.

[2026-03-31] **Neoschizomers: строгая терминология.** Убраны 18 ложных, добавлены настоящие (SacI↔Eco53kI, DpnI↔DpnII/MboI).

---

## Архитектура v2 — УТВЕРЖДЕНО 31.03.2026

[2026-03-31] **"Составной блок" — видно из чего склеен.** subFragments[], assemblyMethod, protocol status. Цветная полоска + имена.

[2026-03-31] **Привязка к протоколу: 4 статуса.** complete / in_progress / planned / manual.

[2026-03-31] **validateJunctionEnds() ПЕРЕД расчётом праймеров.** Overlap/RE/GG pre-flight checks.

[2026-03-31] **Мерж аннотаций при склейке.** Offset по фрагментам, sourceFragment для трейсабилити.

---

## Сессии 24–28, Блоки 2–3 (31.03–01.04.2026)

_(решения сессий 24–28 и блоков 2–3 см. в предыдущих записях — без изменений)_

---

## Блок 4b — Restriction Cloning → Canvas (03.04.2026)

[2026-04-03] **digest() — чистая функция без side effects.** Принимает sequence + annotations + enzyme(s), возвращает backbone + excised + ends. Три режима: linearize (1 site), excise same enzyme (2 sites), excise two enzymes. Внутренние хелперы `_linearize`, `_exciseTwoEnzymes`, `_exciseSameEnzyme` — не экспортируются.

[2026-04-03] **generateRETail() — protective bases + RE site.** Использует `minFlanking` из RE_ENZYMES БД (уже заполнено для всех 63 ферментов). Пример: EcoRI minFlanking=1 → "GGAATTC". GC-чередование для стабильности.

[2026-04-03] **overlapTail() расширен: ligation/re_ligation → RE-тейлы.** Forward primer tail = `generateRETail(enzyme)` прямой. Reverse primer tail = `rc(generateRETail(enzyme))`. Фиксит CRIT-3 из SYSTEM_AUDIT. Обратно совместимо — overlap/GG/KLD не затронуты.

[2026-04-03] **autoAdjustJunctions() не трогает ligation junctions.** Явный guard: `if (j.type === 'ligation' || j.type === 're_ligation') return;`. Предотвращает переключение ligation → overlap при авто-подстройке.

[2026-04-03] **N+N + ligation = valid.** Два фрагмента без ПЦР + ligation junction — стандартная операция (digest + ligate). Warning "overlap невозможен" проверяет `junc.type === 'overlap'`, не срабатывает для ligation. Фиксит HIGH-4 из SYSTEM_AUDIT.

[2026-04-03] **PlasmidUseWizard: restriction_cloning = 10-й режим.** 3-step wizard: выбор ферментов (из unique cutters, sorted MCS→CutSmart) → выбор insert (library/paste/placeholder) → preview + create. Создаёт 2 фрагмента (backbone needsAmplification=false + insert true) + 2 ligation junctions + circular=true.

[2026-04-03] **completeAssembly определяет restriction_cloning по junction types.** Если все junctions = ligation → assemblyMethod='restriction_cloning'. Если смешанные → 're_ligation'.

---

## Блок 5 — Quick Start + Smart Import (03.04.2026)

[2026-04-03] **QuickStart при пустом canvas вместо "Drag parts here".** Условие: `fragments.length === 0 && !active.completed`. 6 кнопок: restriction, gibson, golden_gate, mutagenesis, import, free. Каждая → свой routing. Скрытый `<input type="file">` для import. НЕ modal — inline в DesignCanvas.

[2026-04-03] **ImportDecisionModal вместо молчаливого сохранения в библиотеку.** File drop → parse → сразу спросить "Что делать?". Circular: 6 действий (restriction/backbone/mutagenesis/view/library/disassemble). Linear: 2 действия (view/library). Создаёт Part автоматически и направляет в wizard с presetMode.

[2026-04-03] **wizardPresetMode — bypass PlasmidUseWizard menu.** Новое state в uiSlice. ImportDecisionModal устанавливает presetMode → PlasmidUseWizard получает prop → `useState(presetMode || 'menu')` → пропускает шаг выбора режима. Сбрасывается при close.

[2026-04-03] **Top-down UX: "Что хочешь сделать?" вместо bottom-up "Перетащи запчасти".** Биолог мыслит от цели (вставить ген в вектор), не от деталей (найти запчасть → drag → настроить junction). Quick Start и Smart Import — entry points, ведущие к правильному wizard.

---

## Блок 6 — UX Polish (03.04.2026)

[2026-04-03] **ActionBar — sticky панель "что дальше" после расчёта праймеров.** Условие: `calculated && primers.length > 0 && !active.completed`. 4 кнопки: протокол, заказ олигов, GenBank, завершить сборку. Заменяет дублирующие кнопки экспорта внизу + completeAssembly из вкладки Protocol.

[2026-04-03] **Header: polymerase/prefix → ⚙️ Настройки dropdown.** `<details>` с белым popup. Освобождает header от редко используемых настроек. Сохранены: Олиги, Запчасти, Данные, Clear.

[2026-04-03] **Breadcrumb "📂 Проект → Сборка" между View Switcher и AssemblyTabs.** Клик по "Проект" → `setProjectView('flow')`. Даёт контекст (в каком проекте/сборке находишься) и быстрый переход в Flow Canvas.

---

## Блок 8 — HIGH фиксы + SnapGene каталог (03.04.2026)

[2026-04-03] **SnapGene каталог: lazy-loaded index + on-demand category files.** plasmids-index.json (~867KB) в public/ — только метаданные, БЕЗ sequences. 19 category JSON файлов в public/plasmids-data/ — подгружаются при клике.

[2026-04-03] **Каталог не в parts[], пользователь явно добавляет.** status='draft', source='catalog'. Не загромождать палитку автоматически.

[2026-04-03] **Merge через ligation junction — заблокирован.** Биологически невозможно. Guard + apiWarning.

---

## Блок 9 — First-time User Flow (03.04.2026)

[2026-04-03] **ImportPrompt — entry point при пустой библиотеке.** pendingAction state в DesignCanvas: 4 состояния пустого canvas.

[2026-04-03] **PlasmidViewer: конкретные action buttons в footer.** Клонировать / Как backbone / Мутагенез вместо generic "В wizard".

---

## Блок 10 — Circular Map + Visual Bugfix (03.04.2026)

[2026-04-03] **mapFragments = [{whole plasmid}], не массив регионов.** Корневая причина спагетти circular map: перекрывающиеся регионы → offset > totalBp → углы > 360°.

[2026-04-03] **PlasmidMap: onSelectRegion + selectedRegionId.** Новые props для выбора региона на sub-arc. onSelectFragment остаётся для DesignCanvas.

[2026-04-03] **presetMode: instant actions vs multi-step modes.** use_whole/view/disassemble/mutate/versions → useEffect вызывает handler напрямую. Multi-step → setStep(presetMode).

[2026-04-03] **Sequence sanitize: strip non-ATGCN.** BOM/null → regex strip. (Примечание: это первая итерация, централизована в Этапе 1.1 — 18.04.2026.)

[2026-04-03] **Junction Sequence Preview в RE cloning wizard.** Inline ~20нт вокруг стыка с цветовым кодированием + reading frame indicator.

---

## Блок 11 — Bugfix после визуального тестирования (03.04.2026)

[2026-04-03] **handleUseWhole: useRef guard + partId dedup против StrictMode double-fire.** Двойной вызов при React 19 StrictMode создавал дубликаты фрагментов → stale праймеры. Защита на двух уровнях: useRef мьютекс и дедупликация по partId.

[2026-04-03] **designPrimersLocal + overlapTail: sanitize seq через regex.** `.toUpperCase().replace(/[^ATGCNRYSWKMBDHV]/g, '')` убирает BOM/null/пустые символы перед генерацией праймеров. Примечание: это workaround в месте использования, удалён в Этапе 1.1 (18.04.2026) после централизации.

[2026-04-03] **migratePartAnnotations в handleUseWhole.** Legacy plasmids без level:'region' получают primary region при добавлении как backbone.

[2026-04-03] **Inherit circular topology в handleUseWhole.** Backbone наследует topology от source plasmid — иначе circular → linear молча.

---

## Блок 11b — Root cause fixes (03.04.2026)

[2026-04-03] **App.jsx useEffect: else-ветка для очистки stale праймеров.** Было: праймеры записывались только если `autoDesigned && primers.length > 0`. Старые праймеры оставались "живыми" когда fragments → 1. Стало: если `autoDesigned !== undefined && (нет primers)` → `updateActive({ primers: [], calculated: false })`. Root cause для P1.

[2026-04-03] **AnnotationEditor opacity: regions 0.9, details 0.7.** Было 0.5/0.85 — regions блёклые, белый текст невидим. Инверсия: яркие regions + чуть темнее details для визуального различия.

---

## Критический аудит и перепланирование (18.04.2026)

[2026-04-18] **Отмена type-driven рефакторинга с нуля.** После критического аудита кода v0.5.0-alpha установлено: annotation-model + domain-detection + auto-annotate + intron-utils + cds-validation + feature-detection + import-annotations + orf-detection уже образуют рабочую type-driven систему через level:'region'/'detail'/'point'. Переписывание в registry/TypeSpec — рефакторинг ради имён без ценности для пользователя, ценой 660+ тестов и 2+ месяцев до публикации. Вместо этого: точечные улучшения в рамках существующей архитектуры + фокус на стабилизацию + публикация v1.0 через 3-5 недель.

[2026-04-18] **App.jsx декомпозиция отложена до v1.1.** 37KB в одном файле с 14 modals — технический долг. Но рискованно ломать работающее до публикации. После v1.0: вынести modals в ModalStack, effects в useAppEffects hook.

[2026-04-18] **Крупные компоненты (>30KB) декомпозиция отложена до v1.1.** FragmentEditor (54KB), PlasmidUseWizard (39KB), AddFragmentModal (35KB), DesignCanvas (33KB), PlasmidMap (33KB), PartsPalette (31KB). На стабилизацию до v1.0 не тратим.

[2026-04-18] **Derived primers vs imperative push отложено до v1.1.** P1 архитектурно неправильный (useEffect + useMemo + getActive/updateActive). Правильно: primers = derived selector от (fragments, junctions). Сейчас — workaround (else-ветка из Блока 11b).

---

## Этап 1.1 — Центральный sanitizeSequence (18.04.2026)

[2026-04-18] **sanitize-at-entry как архитектурный контракт.** Ранее ДНК санитизировалась в 3+ местах использования через разные regex (defensive depth). Теперь: `sanitizeSequence()` вызывается один раз при входе данных (paste, file import, API response), далее в кодобазе данные считаются чистыми. Inline workarounds из `local-primer-design.js` (3 места) и `PlasmidViewer.jsx` удалены. Тесты обновлены под этот контракт (crit-fixes P2 тестирует sanitize-at-entry, не defensive depth). Trade-off: новая точка входа без sanitize — тесты не поймают. Решение: через code review + чеклист в CLAUDE.md.

[2026-04-18] **Канонический IUPAC-порядок: `ATGCNRYSWKMBDHV`.** В кодобазе было 4 варианта buggy-regex: `[^ATGCNRYSWKMBDHV]` (local-primer-design), `[^ATGCNRYWSMKHBVD]` (SequenceEditor), `[^ATGCN]` (PlasmidUseWizard — без IUPAC вообще, скрытый баг P-wizard-iupac), `[^ATCGNatcgn]` (AddFragmentModal — без IUPAC, скрытый баг P-addfrag-iupac). Все схлопнуты в один источник через `sanitizeSequence()` в `sequence-utils.js`.

[2026-04-18] **Экспортируемые regex-константы как anti-drift механизм.** `IUPAC_DNA_REGEX` и `IUPAC_DNA_CHAR_REGEX` экспортированы из sequence-utils. Используются в AddFragmentModal cursor-position logic (строки 169/177), где нужна синхронизация между sanitizeSequence и подсчётом символов. Без этого любое изменение алфавита приводило бы к рассинхронизации курсора.

[2026-04-18] **Store migration v6→v7 санитизирует legacy-данные.** Persist version bump с 6 до 7. Миграция проходит по `persisted.parts[*].sequence` и `persisted.assemblies[*].fragments[*].sequence` через `sanitizeSequence`. `subFragments` не обрабатываются отдельно — производные от `parent.sequence`.

[2026-04-18] **COMPLEMENT_MAP без IUPAC — known limitation v1.1.** `reverseComplement()` превращает R/Y/S/W/K/M/B/D/H/V в N. Если реальные данные потребуют — расширить до полной IUPAC complement таблицы. Пока в BUGS.md как TODO.

---

## Этап 1.2 — TYPE_MAP пересмотр в import-annotations.js (18.04.2026)

[2026-04-18] **`normalizeGeneType(feat)` — gene-семантика из qualifiers, не из type.** Раньше `gene → CDS` через TYPE_MAP — теряли ncRNA-gene и UTR-семантику. Теперь: `gene` не в TYPE_MAP, `normalizeType(type, feat)` делегирует `normalizeGeneType` который читает `/ncRNA_class` → `ncRNA`, `/product` matches `\btrna\b` → `tRNA`, matches `\b(rrna|ribosomal\s+rna|16s|23s|5s|18s|28s)\b` → `rRNA`, иначе → `gene`. Free-text `/note` эвристики не применяем — источник регрессий.

[2026-04-18] **Gene-filter расширен до всех CDS/RNA детей.** `GENE_CHILD_TYPES = {CDS, mRNA, tRNA, rRNA, ncRNA, misc_RNA}`. Раньше фильтр пропускал `gene` только при наличии CDS-child — `gene` + `tRNA` внутри создавали дубль-регионы. Теперь любой RNA/CDS ребёнок делает `gene` избыточным.

[2026-04-18] **Migration v7→v8 НЕ ДЕЛАЕМ.** Legacy annotations с типом `catalytic` (из `mat_peptide`/`domain`/`region` до 1.2) в store нельзя корректно мигрировать: нужен оригинальный INSDC-тип, которого нет. Information loss необратим. Известное ограничение в BUGS.md: для корректных типов — переимпортировать `.gb`/`.dna`. Render от `catalytic` не ломается (цвет `#2563EB` существует).

[2026-04-18] **`oriT` ≠ `rep_origin`.** Биологически разные (конъюгация vs репликация). Собственный region-тип + цвет `#7C3AED` (violet-700) в `ANNOTATION_COLORS`. Раньше `oriT → rep_origin` через TYPE_MAP смешивал их семантику.

[2026-04-18] **`mRNA` как собственный region-тип, без разбора на UTR+CDS.** Разбор mRNA на 5'UTR + CDS + 3'UTR — отдельная задача v1.1. В плазмидах встречается редко; сейчас важнее корректность типа, чем UX декомпозиции. `EXON_BEARING_TYPES = {CDS, gene, mRNA}` покрывает intron-извлечение из `qualifiers.exons`.

[2026-04-18] **`D-loop` как собственный тип, не `misc_feature` fallback.** Встречается редко (митохондриальная ДНК), но раз добавляем — корректно. Цвет `#E0E7FF` (indigo-100). Аналогично `mobile_element`, `repeat_region` — собственные типы с сдержанными серыми цветами.

[2026-04-18] **`domain/region/mat_peptide/motif → identity` без эвристик.** INSDC имеет отдельный `active_site` именно для каталитической активности. Free-text эвристики на `/note` (например «если `/note='catalytic site'` → `catalytic`») отвергнуты как источник регрессий. `domain` и `region` — общие INSDC-типы, не означают catalytic. `motif` не обязательно binding.

[2026-04-18] **Backend `_TYPE_MAP` — минимальный diff.** Только `'gene': 'CDS'` → `'gene': 'gene'` в `snapgene_parser.py`. Остальное (`signal_peptide → sig_peptide`, `origin of replication → rep_origin`) не трогаем — работает корректно через frontend двойную нормализацию. Полный backend рефакторинг — не в scope 1.2.

[2026-04-18] **`REGION_RENDER_RULES` не трогаем в 1.2.** Grep подтвердил: объект в `annotation-model.js:16` нигде не импортируется компонентами. Расширять под новые типы без потребителей — мёртвый код. Вернёмся когда появится detail-picker UI или подобный consumer.

[2026-04-18] **`ApEinfo_revcolor` для strand=-1.** APE-формат указывает revcolor для reverse-strand features. `extractColor` теперь: `strand === -1 && q.ApEinfo_revcolor → revcolor`, иначе `fwdcolor`/`SnapGene:color`/`color`. Detail-level annotations также получают поле `strand` в 3 push-путях (detail/point/unknown-heuristic).

[2026-04-18] **`variation`/`modified_base` остаются POINT в 1.2.** Не переносим в DETAIL. В большинстве случаев 1-nt изменения. Если реальные данные потребуют detail-уровня для больших variations — отдельная эвристика `span > 1 → detail` в v1.1.

---

## Sprint 1 — Читаемые метки, чистые стыки, настоящий мутагенез (19–20.04.2026)

[2026-04-20] **Контраст текста на аннотациях через WCAG luminance.** `getTextColor(bgHex)` в `src/lib/color-utils.js` использует формулу `0.299*R + 0.587*G + 0.114*B` с threshold `0.55` → `#1F2937` для светлых фонов, `#FFFFFF` для тёмных. Threshold откалиброван под `ANNOTATION_COLORS` palette (жёлтый `#FBBF24` читается тёмным, синий `#2563EB` — белым). Fallback на белый при malformed hex. Не делаем сложнее (WCAG contrast ratio 4.5:1 полностью) — текущий threshold покрывает palette visually; strict WCAG можно добавить когда появятся кастомные цвета пользователя.

[2026-04-20] **`resetJunctionForType(j, newType)` как единый источник сброса junction-state.** Любая смена типа стыка (ligation↔GG↔KLD↔overlap) должна чистить enzyme/overhang поля предыдущего типа. Раньше spread `...j` их сохранял — JunctionDNA рендерил NcoI рядом со стыком Golden Gate, `overlapTail` читал stale enzyme для расчёта tail. Теперь 6 call-sites в `JunctionBlock.jsx` + 1 bulk-операция в `App.jsx` ходят через helper. Сохраняются: id + overlap-геометрия. GG default enzyme = `BsaI`, ligation/re_ligation mirror reEnzyme→enzyme (JunctionDNA читает `j.enzyme`).

[2026-04-20] **Единый источник правды мутагенеза — `computeMutagenesisStrategy`.** Оба UX-пути (Wizard + FragmentEditor in-place) теперь ходят через одну и ту же функцию выбора стратегии (KLD для 1 мутации или 2 близких; two_fragment для 2 далёких; multi_fragment для 3+). Раньше `handleSaveFragment` использовал упрощённый `designInlineKLDPrimers` — для любого числа мутаций получалась KLD, даже если биологически нужен fragment-assembly. Сломанный in-place путь привёл к тому, что в canvas ничего не дробилось, а олиги либо не создавались, либо моментально стирались auto-design'ом.

[2026-04-20] **Чистая функция `buildMutagenesisPayload(result, ctx)` как тонкий слой project-naming + protocolSteps.** Отделяет «что делать» (strategy engine) от «как это показать в проекте» (primerPrefix naming, templateName, PCR_MIXES). Используется обоими путями (Wizard и in-place). Тестируется изолированно без mock'ов store. KLD protocol = pcr + dpni + kld_asm + transform + screening + sequencing. two/multi protocol = pcr_parts + overlap_pcr + transform + screening + sequencing (primers приходят через auto-design, не из strategy).

[2026-04-20] **`isMutagenesis` guard в обеих ветках useEffect на `autoDesigned`.** Раньше guard был только в else-ветке (после P1v2 фикса для случая 1 фрагмент). В первой ветке (≥2 фрагмента) guard отсутствовал — KLD-олиги, записанные `handleSaveFragment`, через мгновение перезаписывались стандартными overlap-олигами. Новое поведение: если активная assembly несёт мутагенезные олиги — не трогать primers, обновить только apiWarnings+calculated. Это также защищает two/multi_fragment сценарий: сам strategy ставит `primers: []` и `calculated: false`, auto-design пересчитывает с учётом `overlapSequence` (не помечая primers как isMutagenesis) — guard не срабатывает ошибочно.

[2026-04-20] **`junction.overlapSequence` — расширение контракта `local-primer-design.js`.** Раньше overlap-тейл всегда собирался из WT-флангов соседних фрагментов (`prevFrag.slice(-half)` + `nextFrag.slice(0, half)`). Для two_fragment мутагенеза это неправильно: амплифицируем WT, мутация живёт только в `junction.overlapSequence` (strategy генерирует mutant-containing bridge). Теперь в split-mode ветке `overlapTail`: если `j.overlapSequence` задана — тейл берётся из неё (первая половина → RC → fwd-тейл; вторая половина → rev-тейл). Если не задана — существующая логика без изменений (регрессия-тест). Расширение применимо не только к мутагенезу — любой случай, где overlap нужно задать явно.

[2026-04-20] **Аннотации при split фрагмента: overlap-filter + trim-flag.** `handleSaveFragment` в two/multi_fragment ветке для каждого нового sub-фрагмента берёт аннотации, которые пересекают его `[templateStart, templateEnd)` диапазон, сдвигает координаты в локальное пространство фрагмента и ставит `trimmed: true` если аннотация выходит за границы. Это simpler чем паттерн в `handleFragmentSplit` (там split-inside/straddles/outside ветвление), но эквивалентно для split'а, производного от мутаций — cut-points определяются strategy между мутациями, аннотации могут лежать где угодно.

[2026-04-20] **No-PCR guard для two/multi_fragment мутагенеза.** Если `fragments[editTarget].needsAmplification === false` (pre-synthesized, ordered, merged product) и strategy выбрала two/multi_fragment — split блокируется, выдаётся `apiWarning`: «помечен как без ПЦР — многофрагментный мутагенез невозможен. Используйте одну точечную мутацию (KLD) или включите амплификацию». Биологически: нельзя ПЦР'ить кусками то, что само по себе не амплифицируется. KLD на No-PCR-фрагменте разрешён (обратная ПЦР всей плазмиды валидна для любой ДНК-матрицы).

[2026-04-20] **Migration circular plasmid + two_fragment split — отложено до v1.1.** Если фрагмент на canvas — product circular плазмиды, после two_fragment split получаем 2 linear фрагмента и 1 overlap-стык. Для замыкания в circular нужен второй overlap-стык между концами. В v1.0 это поведение приемлемо: пользователь видит 2 linear куска, закольцовывает через Gibson вручную. Автоматическое добавление замыкающего junction добавит час-два на спринт и риск регрессий. Вернёмся, когда появится реальный запрос.

## [2026-04-20] Визуальная приёмка Sprint 1 — 4 новых архитектурных решения для Sprint 1.5

После визуальной приёмки Sprint 1 зафиксированы три архитектурных долга и одно UX-дизайнерское решение, которые пойдут в Sprint 1.5 (см. `docs/SPRINT_1_5_MUTAGENESIS_V2.md`).

**1. `chooseStrategy` принимает `fragmentContext`** (V14).
Выбор стратегии мутагенеза (KLD / two_fragment / multi_fragment) зависит не только от количества и расстояния мутаций, но и от:
- `topology` ('circular' | 'linear')
- `isStandalone` (фрагмент один на canvas = полная плазмида, либо часть сборки)
- `length`

KLD возможен ТОЛЬКО при `topology === 'circular' && isStandalone === true`. Линейные фрагменты и фрагменты в составе сборки всегда идут через two_fragment/multi_fragment overlap PCR. Это биологическое требование KLD-реакции (нужна матрица для back-to-back линеаризации + backbone для лигирования концов).

Причина ошибки первой итерации V4-D: `chooseStrategy` смотрел только на mutations, автоматически выдавая KLD для единичной мутации на любом фрагменте. На линейном куске это биологически невозможный workflow.

**2. FragmentEditor — mode switcher разделяет edit от mutagenesis** (V12, Вариант C).
Рассмотрены три варианта (A: разные tabs, B: выбор в popup, C: top-level mode switcher). Выбран C.

Обоснование: bookkeeping-правка sequence (исправление документации по секвенированию) и мутагенез (планирование эксперимента) — принципиально разные операции, которые случайно делят жест клика по нуклеотиду. Mode switcher в заголовке FragmentEditor делает выбор явным и сохраняет разные state-пути через разные handlers (`handleSaveEdit` vs `handleSaveMutagenesis`).

Мутации, накопленные в Mode=edit, теперь не могут быть сохранены через мутагенез-путь — они просто не записываются в `mutations[]`. Переключение режимов требует confirm'а, если есть накопленные мутации.

**3. MutagenesisWizard принимает initial template через props** (V13).
Wizard используется из трёх точек входа:
- QuickStart → пустой Wizard, пользователь выбирает template из dropdown или textarea
- Каталог → Посмотреть → footer Мутагенез → ожидается pre-filled template = эта плазмида
- FragmentEditor in-place (не Wizard, а direct handleSaveFragment через strategy engine)

До V13 только первая точка работала — Wizard всегда стартовал на Step 1 пустой. Теперь Wizard принимает `initialTemplateSeq/Name/Organism/CdsStart/CdsEnd` и при наличии `initialTemplateSeq` стартует на Step 2.

Альтернатива — hydrate state через `useEffect` на mount — тоже работает, но менее декларативна. Выбран props-first подход.

**4. `makeKLDStrategy` вычисляет Tm и GC через `calcTmNN`** (V11).
Хардкодные плейсхолдеры `tmBinding: 0, gcPercent: 0` в KLD-стратегии ломали annealTemp-расчёт в `buildMutagenesisPayload::protocolSteps`. Tm-calculator уже импортирован в mutagenesis.js — достаточно его использовать. Почему не сделали сразу в V4: `tmBinding` логически принадлежит primer-дизайну, KLD-primers в `makeKLDStrategy` назначались как back-to-back sequences без отдельного Tm-шага. Решение — Tm вычисляется на стадии strategy, чтобы вся primer-информация приезжала в UI целиком.

---

## Sprint 1.6 — Мутагенез UX v2.1 + приёмка (21.04.2026)

[2026-04-21] **Бельок в режиме Правка — read-only (K5).**
Bookkeeping-edit белка невозможен: из одной AA нельзя выбрать codon, нужна исходная ДНК. Поэтому в `mode='edit'` tab «Белок» показывает синюю полосу «Режим просмотра» + кнопку «→ Мутагенез». AA-span теряет `cursor: pointer` и `onClick`; `openMutMenu` сохраняет early-return guard как defence-in-depth. Semantics после K5: **Правка = только ДНК**, **Мутагенез = ДНК + AA**. Радио-лейблы mode switcher'а из Sprint 1.5 K2 не меняются.

[2026-04-21] **Биологически корректная обрезка аннотаций при split — `lib/split-annotations.js` (K6).**
Coordinate-only map+filter в `handleSaveFragment` был филологически верным, но биологически слеп: signal peptide в середине sub-фрагмента, половина restriction-сайта, трёхбуквенный start-codon в несуществующем месте. Введён helper `trimAnnotationsForSubFragment(parentAnns, sf)` с тремя классами правил: N-terminal (signal_peptide/transit_peptide/propeptide) — drop на partial overlap, survive только при fully-inside + `subStart === 0` + `a.start === 0`; point-like (restriction_site/primer_bind/mutation/variation/modified_base) — drop на любой partial overlap (половина не работает); start_codon — только при `a.start === subStart`; stop_codon — только при `a.end === subEnd`; CDS/gene — rename с (5' trimmed) / (3' trimmed) / (trimmed) суффиксом. Идемпотентность: `!a.name.includes('trimmed')` guard. Всё остальное — trim + flag без rename. `useFragmentHandlers.handleSaveFragment` делегирует helper'у.

[2026-04-21] **Split-группа как явная сущность данных — `splitGroupId` + метаданные (K7).**
При two_fragment/multi_fragment split новые фрагменты несут `splitGroupId` (shared), `splitGroupParentName`, `splitGroupIndex`, `splitGroupTotal`. `DesignCanvas` группирует consecutive same-groupId элементы в `.split-group-container` с 4 визуальными эффектами (dashed border + tinted backdrop + badge + connector line). Internal junctions (между членами группы) рендерятся внутри контейнера; external (группа ↔ соседний фрагмент/next row/circular close) — снаружи. KLD не создаёт группу (single fragment in place). **Финальное решение по визуалу** (какие из 4 эффектов оставить) — после приёмки; решено отложить в Sprint 1.7.

[2026-04-21] **Подсветка мутаций относительно parent-part — `computeMutationHighlights` (K8, partial).**
FragmentEditor вычисляет per-nt мутации через `sequenceDiff(parent.sequence, fragment.sequence, cdsRegions)` и рисует red/yellow backdrop + underline (nonsilent/silent). Fallback на `fragment.mutations` если parent не найден — conservatively nonsilent. Protein view: per-codon priority (any nonsilent nt → весь AA nonsilent). **Известный дефект (V16):** diff не учитывает `fragment.templateStart` → для sub-фрагментов после split подсветка ложная. Исправление перенесено в Sprint 1.7 K9.

[2026-04-21] **`isMutated` по `label.includes(String(pos))` — баг, не работает для цифр (V15).**
В `FragmentEditor.jsx` (~строки 760, 852) подсветка «применённых» мутаций использовала `mutations.some(m => m.label?.includes(String(pos)))`. Для мутаций с номерами `G26A, R135A, G77C, C403G, G404C` любая AA-позиция, номер которой встречается как подстрока в номере любой мутации, подсвечивалась ложно. **Ключевое правило для будущего:** сопоставление позиций всегда через числовое сравнение полей `codonStart` / `position`, никогда через `.label.includes(String(pos))`. Если сравнивать надо через label — минимум word-boundary regex (`\bNNN\b`) и числовой парсинг. Переделка в Sprint 1.7 K10 Unified Editor.

[2026-04-21] **Unified Editor — направление Sprint 1.7.**
Tabs (Последовательность / Белок) в FragmentEditor — артефакт Sprint 1.5 K2: добавлены чтобы вместить radio mode switcher. Правильная информационная модель: **sequence = primary view**, аннотации/белок/список мутаций — panel(s) под ней или сбоку. Mode (Правка / Мутагенез) остаётся как ортогональная ось — он меняет семантику кликов, а не разделение контента. Реализация в Sprint 1.7 K10 Unified Editor. До тех пор: K2 mode switcher, `switchMode` helper, identity-guard в `handleSaveFragment` — сохраняются как база.
