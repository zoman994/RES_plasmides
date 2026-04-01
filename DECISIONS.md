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

## Сессия 24 — Merger, Primers, Two-Click (31.03.2026)

[2026-03-31] **TDD-first: тесты пишутся ПЕРЕД кодом.** Правило #1 в CLAUDE.md. Каждая задача: red tests → green code → vitest run. Сокращает итерации "написал → сломано → переписал" в 3-4 раза.

[2026-03-31] **BUGS.md — единый трекер багов.** Claude Code читает при старте каждой сессии. Open/Fixed секции. Обнаружил → записал. Починил → отметил `[x]`.

[2026-03-31] **Один CURRENT_TASK.md, без побочных файлов.** Никаких `_1b`, `_append`. Если дополнить — дополняй основной. Claude Code гарантированно читает один файл.

[2026-03-31] **Expert mode = always ON.** Убрать toggle из toolbar и first-launch wizard. `expertMode: true` в uiSlice. Все `expertMode &&` условия в PartBlock/JunctionBlock теперь всегда true. Студенческий режим прятал 8 из 9 операций — делал app бесполезным.

[2026-03-31] **Click = single select (стандарт Finder/Figma).** Click = replace selection. Ctrl+Click = toggle в multi-select. Shift+Click = range. Click на пустое = deselect. Заменяет старую модель (Ctrl+Click для select, Click для highlight).

[2026-03-31] **Double-click фрагмент = Edit. Double-click merged = Unfold.** Стандартная метафора "двойной клик = открыть/развернуть".

[2026-03-31] **Праймеры дизайнятся для ВСЕХ фрагментов, включая "без ПЦР".** `needsAmplification` — флаг протокола (нужен ли шаг ПЦР), НЕ флаг primer design. Даже без ПЦР — фрагмент участвует в сборке, соседям нужно знать sequence для overlap tails.

[2026-03-31] **designPrimersLocal разворачивает merged блоки.** Merged [AmpR+EGFP] → expand в [AmpR, EGFP] → праймеры для каждого. Internal primers (между sub-фрагментами) помечаются `isInternal: true`. Внешние показываются на merged блоке.

[2026-03-31] **Adaptive overlap mode.** Если сосед "без ПЦР" → текущий фрагмент несёт ПОЛНЫЙ overlap (30bp вместо 15bp). Split mode автоматически переключается на `left_only`/`right_only`. Если оба без ПЦР → warning "overlap невозможен". Комбинаций 4×4=16, баги найдены в 6 (R+N, N+R, N+N, N+M, M+N). Спека: `docs/BLOCK_COMBINATIONS.md`.

[2026-03-31] **JunctionDNA вычисляет overlap из фрагментов.** Не зависит от `j.overlapSequence` (которую auto-design не устанавливает). Берёт `leftFragment.sequence.slice(-half)` + `rightFragment.sequence.slice(0, overlapLen-half)`. Общая `findPrimers()` для всех 4 типов junction с merged-safe lookup.

[2026-03-31] **assemblyMethod: linear+overlap = OV-PCR, circular+overlap = Gibson.** "Gibson" — только для кольцевой сборки. Линейная overlap PCR = "OV-PCR". Проверить 4 файла.

[2026-03-31] **10 атомарных операций Two-Click UX.** Каждая OP = 1 коммит, независима, проверяема. Нет циклических зависимостей. Спека: `docs/TWO_CLICK_OPS.md`. Порядок: 1→2→4→3→5→10→6→7→8→9.

---

## Сессия 26 — Bugfixes + Cassette Insertion (01.04.2026)

[2026-04-01] **Режим "вставка кассеты" в FragmentSplitter.** `split_for_insert` action → два `homology_arm` фрагмента (5'/3' flanks) с настраиваемой длиной (500-2000 bp). Пресеты по regions (CDS/gene). Drag кассету между фланками → overlap/Gibson сборка. Стандартный workflow для knock-in/knock-out.

[2026-04-01] **Feature name: label > product > gene > note.** Приоритет `label` над `gene` — `gene="bla"` → display name "AmpR" (из label), не "bla". Соответствует SnapGene, Benchling.

[2026-04-01] **Regex word boundaries для infer_feature_type.** Все паттерны (PROMOTER/CDS/TERMINATOR/ORIGIN) используют `\b` — "ori" не матчит "memorial", "term" не матчит "terminal".

[2026-04-01] **Enrichment всегда после .dna import (даже если features > 0).** Два шага: 1) homology naming через `enrichWithCommonFeatures()` — "bla" → "AmpR" по sequence identity. 2) detail-level через `autoAnnotate()` — signal peptides, tags, domains внутри CDS. Дедупликация по `start-end-level` key.

---

## Сессия 27 — Unified Annotations + Versioning (01.04.2026)

[2026-04-01] **Удаление `domains` как отдельного поля.** Вся информация хранится в `annotations[]` с `level: 'detail'`. AA-координаты нигде не хранятся — вычисляются на лету: `aaPos = Math.floor(ntStart / 3) + 1`. Мосты `convertDomainsToAnnotations()` и `detectDomainsAsAnnotations()` остаются как deprecated для миграции старых данных. 7 мест в коде: fragmentSlice (createFragFromPart, createMutant, splitPart, fuseParts, flipFragment), useFragmentHandlers (handleFragmentSplit, handleSaveFragment).

[2026-04-01] **autoAnnotate() вызывается ВСЕГДА при addPart().** Заменяет `generateAutoAnnotations()` (которая пропускала Parts с existing annotations). autoAnnotate() сохраняет existing regions + manual annotations, добавляет details и points поверх. Ручные аннотации (`auto: false`) никогда не удаляются при пересчёте.

[2026-04-01] **Кассета = view, не data.** `detectCassettes(annotations)` вычисляет кассеты на лету из смежных regions: promoter → CDS/marker → terminator, gap ≤ 50bp. Не создаём отдельную сущность в store. Опциональные подсказки `cassette`/`cassetteOrder` на region-annotations для ускорения — но UI работает и без них.

[2026-04-01] **Универсальный координатный сдвиг `shiftAnnotations(annotations, editPoint, deltaL)`.** Единый алгоритм для всех операций, меняющих длину: deletion, insertion, region replacement. Аннотации после editPoint → shift(ΔL). Аннотации, перекрывающие editPoint → end += ΔL. До editPoint → без изменений.

[2026-04-01] **Четыре правила наследования аннотаций.** (1) Координатный сдвиг при ΔL≠0. (2) Scope операции определяет что удалять/добавлять. (3) Versioning: minor (<100bp change) / major (structural). (4) autoAnnotate пересчитывается для затронутых CDS-регионов после каждой операции.

[2026-04-01] **Версии: semver-like (major.minor).** Minor: substitution, малый тег <100bp. Major: deletion, insertion ≥100bp, замена региона, замена кассеты, flip, intron removal. `derivation.operations[]` — структурированный лог для semantic diff.

[2026-04-01] **`annotationDiff(parent, child)` для semantic diff.** Сопоставление regions по имени → типу → overlap координат. Классификация: deleted, inserted, replaced, resized, mutated. Результат: "замена кассеты PglaA+XynTL+TtrpC → PcbhI+BGL1+TcbhI" вместо "1500 nucleotide differences".

[2026-04-01] **Множественные делеции (интроны) от конца к началу.** Reverse order предотвращает сбой координат. Каждая делеция применяется последовательно: detail удалён → region shrinks → downstream shift.

[2026-04-01] **Двойная адресация в UI.** CDS-детали: `Signal peptide: 1–22 а.о. (1–66 п.н.)`. Не-CDS детали: `TATA box: 803–809 п.н.`. Определяется через `REGION_RENDER_RULES[parentRegion.type].showTranslation`.

[2026-04-01] **Документация: ANNOTATION_VERSIONING.md (техническая) + USER_GUIDE_ANNOTATIONS.md (для биологов).** Полная спецификация всех операций с edge cases. Руководство пользователя — без кода, для биологов.

---

## Блок 2 — Toolbar Redesign + Context Menu (01.04.2026)

[2026-04-01] **Удаление глобального переключателя метода сборки из header.** `assemblyType` больше не управляется из toolbar. Каждый junction настраивается индивидуально в JunctionBlock. `addFragment()` всегда создаёт junction type='overlap' по умолчанию. `setAssemblyType()` остаётся в store для backward compat, из UI убран.

[2026-04-01] **Мутагенез — через контекстное меню фрагмента, не через toolbar.** Правый клик по CDS → «Точечная мутация» или «Мутагенез wizard». `showMutagenesis` → `mutagenesisTarget: index | null`. MutagenesisWizard получает prop `template` → пропускает Step 1.

[2026-04-01] **Type-dependent контекстное меню PartBlock.** CDS/gene/marker: мутагенез + тег/fusion. Промотор/терминатор: только замена. Плазмида: замена кассеты, вставка, делеция, дерево версий.

[2026-04-01] **ReplacePicker — мини-modal.** Parts library фильтруется по типу. `replaceFragment(index, newPart)` — новый store action.

[2026-04-01] **TagFusionPicker — пресеты тегов.** His6, FLAG, Strep-II, V5 (C-term). MBP, GST, SUMO (N-term). TEV, Thrombin (cleavage). (G₄S)×3 (linker). `insertTagAtFragment()` — новый store action.

[2026-04-01] **ContextMenu расширен.** Поля: shortcut, description, danger. Обратно совместим.

[2026-04-01] **Toolbar = только глобальные панели и настройки.** Parts, Oligos, Data, Polymerase, Prefix, Clear. Нет операций над фрагментами. Спека: `docs/BLOCK2_TOOLBAR_CONTEXT.md`.
