# DECISIONS_2026_Q2.md — архив архитектурных решений, Q2 2026 (апрель–июнь)

Файл наполняется при финализации каждого нового спринта: Chat переносит сюда разделы `DECISIONS.md`, которые старше **двух спринтов**, оставляя в активном файле только последний и текущий спринт.

Исключение: «фундаментальные» решения, помеченные `⚓` в начале строки, **не переезжают** — они определяют архитектуру всего проекта и должны быть доступны Chat/Code в любой сессии без загрузки архива.

Правило от `CHAT_PLAYBOOK.md §4`.

Q1 2026 (январь–март, решения 25–31.03.2026) → при необходимости `DECISIONS_2026_Q1.md` (отдельно).

---

## Критерий «фундаментальности» (⚓)

Решение помечается `⚓` и НЕ переезжает, если оно:
- определяет ключевую технологию проекта (state management, UI framework, biology algorithm base);
- задаёт инвариант модели данных (annotations 3-level, два словаря ферментов, sanitize-at-entry);
- фиксирует UX-принцип, который применяется повсеместно (принцип двух кликов, Okabe-Ito palette);
- определяет контракт между модулями, нарушение которого ломает несколько фич (chooseStrategy-context, expectedJunctionCount).

Всё остальное — **частные** решения в рамках фичи/спринта — переезжает в архив при ротации.

---

## Оглавление по спринтам

_(наполняется при первой ротации)_

- Sprint 1.6 — 21.04.2026 — Мутагенез UX v2.1
- Sprint 1.5 — 21.04.2026 — Визуальная приёмка Sprint 1 → 4 архитектурных решения
- Sprint 1 — 19–20.04.2026 — Читаемые метки, чистые стыки, настоящий мутагенез
- Этап 1.2 — 18.04.2026 — TYPE_MAP пересмотр
- Этап 1.1 — 18.04.2026 — Центральный sanitizeSequence
- Критический аудит и перепланирование — 18.04.2026
- Блок 11b — 03.04.2026
- Блок 11 — 03.04.2026
- Блок 10 — 03.04.2026
- Блок 9 — 03.04.2026
- Блок 8 — 03.04.2026
- Блок 6 — 03.04.2026
- Блок 5 — 03.04.2026
- Блок 4b — 03.04.2026
- Архитектура v2 УТВЕРЖДЕНО — 31.03.2026

---

## Содержимое

> Примечание: записи с пометкой ⚓ продолжают жить в корневом `DECISIONS.md` — там они основной источник. Здесь дублируются для целостности архивного контекста.

## Архитектура / State management

[2026-03-28] **⚓ Zustand v5 вместо useState/Context.** App.jsx был монолитом в 1350 строк с 40+ useState. Zustand даёт: granular selectors (shallow equality), middleware (persist, devtools, immer), тестируемость вне React. 5 domain slices: project, fragment, junction, primer, ui.

[2026-03-28] **⚓ React Compiler v1.0 вместо ручного useMemo/useCallback.**

[2026-03-28] **⚓ Immer middleware для иммутабельных обновлений.**

[2026-03-28] **⚓ Manual undo/redo вместо zundo.** Debounce 300ms, max 50 уровней.

[2026-03-28] **Throttled persist — localStorage writes max 1/sec.**

[2026-03-28] **devtools только в DEV.**

[2026-03-28] **Prefix sum selector для координат праймеров.** O(1) lookup.

## Биологические алгоритмы

[2026-03-28] **⚓ SantaLucia 1998 NN Tm.** ΔH/ΔS, Owczarzy 2008 Mg²+ коррекция → ±1-2°C.

[2026-03-26] **⚓ Golden Gate: 5 ферментов, 32 orthogonal overhangs.**

[2026-03-26] **⚓ KLD мутагенез по протоколу NEB #M0554.**

[2026-03-25] **⚓ Assembly strategy: Auto / All-at-once / 3 parts / 2 parts.**

## Рендеринг последовательности

[2026-03-29] **⚓ Character grid (ch units) для всех sequence views.**

[2026-03-29] **SequencePreview — единый компонент.** 60 нт/строку. Layers: ruler → label → color strip → нт → АК.

[2026-03-29] **Интроны: lowercase + hatching в sequence view, dashed arcs на circular map.**

[2026-03-27] **⚓ 4 вида canvas: Blocks (Ctrl+1) / Sequence (Ctrl+2) / Map (Ctrl+3) / Racetrack (Ctrl+4).**

## UI / UX

[2026-03-29] **⚓ Два типа объектов: Плазмиды и Запчасти.** Плазмида = circular + ≥2 regions.

[2026-03-29] **⚓ Три режима: Canvas, PlasmidViewer, PlasmidUseWizard.**

[2026-03-29] **Группировка запчастей по 8 категориям.** Coding, Regulatory, Markers, Origins, Structural, Recombination, RNA, Other.

[2026-03-25] **⚓ Okabe-Ito color system.**

[2026-03-30] **Racetrack canvas для circular конструктов.** Овал, ширина ∝ bp (log), junctions = quadratic Bezier.

## Данные и аннотации

[2026-03-29] **⚓ Аннотации трёхуровневые: region > detail > point.**

[2026-03-29] **Common features database: 96 NCBI accessions.** Async detection (6-frame protein + DNA 96%).

[2026-03-26] **⚓ Part versioning: parent/child с derivation types.**

## Импорт / палитка

[2026-03-30] **ContextMenu.jsx через createPortal в document.body.** Flip-логика при выходе за экран.

[2026-03-30] **removePart() — отдельный action.** Part в библиотеке ≠ Fragment на canvas.

## Circular Map rendering

[2026-04-03] **⚓ PlasmidViewer/Wizard: mapFragments = [{whole plasmid}], не массив регионов.** Регионы плазмиды перекрываются (nested CDS, gene внутри operon). При передаче как отдельных "фрагментов" PlasmidMap суммирует их длины — offset превышает totalBp, арки уходят за 360°. Решение: всегда передавать одну плазмиду; PlasmidMap рисует sub-arcs по annotations с assignSubTracks() (max 4 tracks).

[2026-04-03] **presetMode в PlasmidUseWizard: instant actions vs multi-step.** Instant (view, use_whole, disassemble, mutate, versions) → execute immediately в useEffect. Multi-step (restriction_cloning, replace, extract, delete, insert) → setStep(presetMode). Нельзя использовать useState initializer — presetMode может прийти позже.

[2026-03-30] **enrichWithCommonFeatures fallback в file-import.js.** Если бэкенд 0 features → fallback на common features DB.

## Project Flow Canvas

[2026-03-31] **⚓ @xyflow/react (React Flow v12) для Project Flow DAG.**

[2026-03-31] **⚓ Два уровня: Construct View (Ctrl+1-4) + Project Flow (Ctrl+5).**

[2026-03-31] **⚓ projectFlowSlice — 6-й slice.** Не в SNAPSHOT_KEYS (undo только construct).

[2026-03-31] **5 типов нод + 3 типа edges.** plasmid/pcr/assembly/oligo/checkpoint. Edges auto-typed по target.

[2026-03-31] **MIRO+ dropdown на source handle.** Hover → + → click → dropdown операций.

[2026-03-31] **⚓ Neoschizomers: строгая терминология.** Убраны 18 ложных, добавлены настоящие (SacI↔Eco53kI, DpnI↔DpnII/MboI).

## Архитектура v2 — УТВЕРЖДЕНО 31.03.2026

[2026-03-31] **⚓ "Составной блок" — видно из чего склеен.** subFragments[], assemblyMethod, protocol status. Цветная полоска + имена.

[2026-03-31] **⚓ Привязка к протоколу: 4 статуса.** complete / in_progress / planned / manual.

[2026-03-31] **⚓ validateJunctionEnds() ПЕРЕД расчётом праймеров.** Overlap/RE/GG pre-flight checks.

[2026-03-31] **⚓ Мерж аннотаций при склейке.** Offset по фрагментам, sourceFragment для трейсабильности.

## Блок 4b — Restriction Cloning → Canvas (03.04.2026)

[2026-04-03] **⚓ digest() — чистая функция без side effects.** Принимает sequence + annotations + enzyme(s), возвращает backbone + excised + ends. Три режима: linearize (1 site), excise same enzyme (2 sites), excise two enzymes.

[2026-04-03] **generateRETail() — protective bases + RE site.** Использует `minFlanking` из RE_ENZYMES БД. Пример: EcoRI minFlanking=1 → "GGAATTC". GC-чередование для стабильности.

[2026-04-03] **overlapTail() расширен: ligation/re_ligation → RE-тейлы.** Forward primer tail = `generateRETail(enzyme)` прямой. Reverse primer tail = `rc(generateRETail(enzyme))`. Фиксит CRIT-3 из SYSTEM_AUDIT. Обратно совместимо.

[2026-04-03] **⚓ autoAdjustJunctions() не трогает ligation junctions.** Явный guard: `if (j.type === 'ligation' || j.type === 're_ligation') return;`. Предотвращает переключение ligation → overlap при авто-подстройке.

[2026-04-03] **⚓ N+N + ligation = valid.** Два фрагмента без ПЦР + ligation junction — стандартная операция (digest + ligate). Warning "overlap невозможен" проверяет `junc.type === 'overlap'`, не срабатывает для ligation. Фиксит HIGH-4 из SYSTEM_AUDIT.

[2026-04-03] **PlasmidUseWizard: restriction_cloning = 10-й режим.** 3-step wizard: выбор ферментов (из unique cutters, sorted MCS→CutSmart) → выбор insert (library/paste/placeholder) → preview + create.

[2026-04-03] **completeAssembly определяет restriction_cloning по junction types.** Если все junctions = ligation → assemblyMethod='restriction_cloning'. Если смешанные → 're_ligation'.

## Блок 5 — Quick Start + Smart Import (03.04.2026)

[2026-04-03] **QuickStart при пустом canvas вместо "Drag parts here".** 6 кнопок: restriction, gibson, golden_gate, mutagenesis, import, free.

[2026-04-03] **ImportDecisionModal вместо молчаливого сохранения в библиотеку.** File drop → parse → сразу спросить "Что делать?".

[2026-04-03] **wizardPresetMode — bypass PlasmidUseWizard menu.** Новое state в uiSlice.

[2026-04-03] **Top-down UX: "Что хочешь сделать?" вместо bottom-up "Перетащи запчасти".**

## Блок 6 — UX Polish (03.04.2026)

[2026-04-03] **ActionBar — sticky панель "что дальше" после расчёта праймеров.**

[2026-04-03] **Header: polymerase/prefix → ⚙️ Настройки dropdown.**

[2026-04-03] **Breadcrumb "📂 Проект → Сборка" между View Switcher и AssemblyTabs.**

## Блок 8 — HIGH фиксы + SnapGene каталог (03.04.2026)

[2026-04-03] **SnapGene каталог: lazy-loaded index + on-demand category files.** plasmids-index.json (~867KB) без sequences. 19 category JSON files.

[2026-04-03] **Каталог не в parts[], пользователь явно добавляет.**

[2026-04-03] **Merge через ligation junction — заблокирован.** Биологически невозможно.

## Блок 9 — First-time User Flow (03.04.2026)

[2026-04-03] **ImportPrompt — entry point при пустой библиотеке.**

[2026-04-03] **PlasmidViewer: конкретные action buttons в footer.** Клонировать / Как backbone / Мутагенез.

## Блок 10 — Circular Map + Visual Bugfix (03.04.2026)

[2026-04-03] **⚓ mapFragments = [{whole plasmid}], не массив регионов.** Корневая причина спагетти circular map.

[2026-04-03] **PlasmidMap: onSelectRegion + selectedRegionId.**

[2026-04-03] **presetMode: instant actions vs multi-step modes.**

[2026-04-03] **Sequence sanitize: strip non-ATGCN.** Первая итерация, централизована в Этапе 1.1.

[2026-04-03] **Junction Sequence Preview в RE cloning wizard.**

## Блок 11 — Bugfix после визуального тестирования (03.04.2026)

[2026-04-03] **handleUseWhole: useRef guard + partId dedup против StrictMode double-fire.**

[2026-04-03] **designPrimersLocal + overlapTail: sanitize seq через regex.** Workaround, удалён в Этапе 1.1.

[2026-04-03] **migratePartAnnotations в handleUseWhole.**

[2026-04-03] **Inherit circular topology в handleUseWhole.**

## Блок 11b — Root cause fixes (03.04.2026)

[2026-04-03] **App.jsx useEffect: else-ветка для очистки stale праймеров.** Root cause для P1.

[2026-04-03] **AnnotationEditor opacity: regions 0.9, details 0.7.**

## Критический аудит и перепланирование (18.04.2026)

[2026-04-18] **Отмена type-driven рефакторинга с нуля.** Точечные улучшения + фокус на стабилизацию и публикацию v1.0.

[2026-04-18] **App.jsx декомпозиция отложена до v1.1.**

[2026-04-18] **Крупные компоненты (>30KB) декомпозиция отложена до v1.1.**

[2026-04-18] **Derived primers vs imperative push отложено до v1.1.**

## Этап 1.1 — Центральный sanitizeSequence (18.04.2026)

[2026-04-18] **⚓ sanitize-at-entry как архитектурный контракт.** `sanitizeSequence()` вызывается один раз при входе данных (paste, file import, API response), далее в кодобазе данные считаются чистыми.

[2026-04-18] **⚓ Канонический IUPAC-порядок: `ATGCNRYSWKMBDHV`.** Единый источник для всех regex.

[2026-04-18] **Экспортируемые regex-константы как anti-drift механизм.**

[2026-04-18] **Store migration v6→v7 санитизирует legacy-данные.**

[2026-04-18] **COMPLEMENT_MAP без IUPAC — known limitation v1.1.**

## Этап 1.2 — TYPE_MAP пересмотр в import-annotations.js (18.04.2026)

[2026-04-18] **`normalizeGeneType(feat)` — gene-семантика из qualifiers, не из type.**

[2026-04-18] **Gene-filter расширен до всех CDS/RNA детей.**

[2026-04-18] **Migration v7→v8 НЕ ДЕЛАЕМ.**

[2026-04-18] **`oriT` ≠ `rep_origin`.** Биологически разные.

[2026-04-18] **`mRNA` как собственный region-тип, без разбора на UTR+CDS.**

[2026-04-18] **`D-loop` как собственный тип.**

[2026-04-18] **`domain/region/mat_peptide/motif → identity` без эвристик.**

[2026-04-18] **Backend `_TYPE_MAP` — минимальный diff.**

[2026-04-18] **`REGION_RENDER_RULES` не трогаем в 1.2.**

[2026-04-18] **`ApEinfo_revcolor` для strand=-1.**

[2026-04-18] **`variation`/`modified_base` остаются POINT в 1.2.**

## Sprint 1 — Читаемые метки, чистые стыки, настоящий мутагенез (19–20.04.2026)

[2026-04-20] **Контраст текста на аннотациях через WCAG luminance.** `getTextColor(bgHex)` в `color-utils.js`.

[2026-04-20] **`resetJunctionForType(j, newType)` как единый источник сброса junction-state.**

[2026-04-20] **⚓ Единый источник правды мутагенеза — `computeMutagenesisStrategy`.** Оба UX-пути ходят через одну функцию выбора стратегии.

[2026-04-20] **Чистая функция `buildMutagenesisPayload(result, ctx)` как тонкий слой project-naming + protocolSteps.**

[2026-04-20] **`isMutagenesis` guard в обеих ветках useEffect на `autoDesigned`.**

[2026-04-20] **⚓ `junction.overlapSequence` — расширение контракта `local-primer-design.js`.**

[2026-04-20] **Аннотации при split фрагмента: overlap-filter + trim-flag.**

[2026-04-20] **⚓ No-PCR guard для two/multi_fragment мутагенеза.** Биологически: нельзя ПЦР'ить кусками то, что само по себе не амплифицируется. KLD на No-PCR-фрагменте разрешён.

[2026-04-20] **Migration circular plasmid + two_fragment split — отложено до v1.1.**

## Визуальная приёмка Sprint 1 → 4 архитектурных решения для Sprint 1.5 (20.04.2026)

[2026-04-20] **⚓ `chooseStrategy` принимает `fragmentContext`** (V14). KLD возможен ТОЛЬКО при `topology === 'circular' && isStandalone === true`. Биологический контракт.

[2026-04-20] **FragmentEditor — mode switcher разделяет edit от mutagenesis** (V12, Вариант C).

[2026-04-20] **MutagenesisWizard принимает initial template через props** (V13).

[2026-04-20] **`makeKLDStrategy` вычисляет Tm и GC через `calcTmNN`** (V11).
