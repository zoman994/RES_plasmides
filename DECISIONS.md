# BodgeGene — Архитектурные решения

Append-only журнал. Решения не удаляются и не пересматриваются без явного обсуждения.
Формат: `[ДАТА] **Решение.** Обоснование.`

---

## Архитектура / State management

[2026-03-28] **Zustand v5 вместо useState/Context.**
App.jsx был монолитом в 1350 строк с 40+ useState. Zustand даёт: granular selectors (shallow equality), middleware (persist, devtools, immer), тестируемость вне React. 5 domain slices: project, fragment, junction, primer, ui.

[2026-03-28] **React Compiler v1.0 вместо ручного useMemo/useCallback.**
Автоматическая мемоизация. Запрет на ручные useMemo/useCallback — компилятор справляется лучше и не ломается при рефакторинге.

[2026-03-28] **Immer middleware для иммутабельных обновлений.**
Zustand + Immer: пишем мутации (`state.fragments.push(...)`) → Immer создаёт shallow copy. Проще читать, меньше ошибок.

[2026-03-28] **Manual undo/redo вместо zundo.**
zundo (temporal middleware) несовместим с цепочкой middleware: immer + persist + devtools. Написан свой стек: pushUndo() → debounce 300ms → max 50 уровней.

[2026-03-28] **Throttled persist — localStorage writes max 1/sec.**

[2026-03-28] **devtools только в DEV.**

[2026-03-28] **Prefix sum selector для координат праймеров.**
`usePrefixSums()` — O(1) lookup позиции любого нуклеотида вместо O(n) пересчёта.

---

## Биологические алгоритмы

[2026-03-28] **SantaLucia 1998 NN Tm вместо Wallace rule.**
SantaLucia 1998 nearest-neighbor: ΔH/ΔS, Owczarzy 2008 Mg²+ коррекция → ±1-2°C.

[2026-03-26] **Golden Gate: 5 ферментов, 32 orthogonal overhangs.**

[2026-03-26] **KLD мутагенез по протоколу NEB #M0554.**

[2026-03-25] **Assembly strategy: Auto / All-at-once / 3 parts / 2 parts.**

---

## Рендеринг последовательности

[2026-03-29] **Character grid (ch units) для всех sequence views.**

[2026-03-29] **SequencePreview — единый компонент для отображения.**
Строки по 60 нт. Layers: ruler → label row → color strip → нуклеотиды → АК → нумерация.

[2026-03-29] **Интроны: lowercase + hatching в sequence view, dashed arcs на circular map.**

[2026-03-27] **Три вида canvas: Blocks (Ctrl+1) / Sequence (Ctrl+2) / Map (Ctrl+3).**

---

## UI / UX

[2026-03-29] **Два типа объектов в палитке: Плазмиды и Запчасти.**
Плазмида = `topology === 'circular' && getRegions(annotations).length >= 2`.

[2026-03-29] **Три режима приложения: Canvas, PlasmidViewer, PlasmidUseWizard.**

[2026-03-29] **Drag линейного Part → canvas. Drag плазмиды → PlasmidUseWizard. Double-click → PlasmidViewer.**

[2026-03-29] **Группировка запчастей по биологическим категориям.**
Coding, Regulatory, Markers, Origins, Structural, Recombination, RNA, Other. Student mode — подмножество.

[2026-03-29] **CDS валидация с action buttons + organism-aware.**

[2026-03-25] **Student/Expert mode.**

[2026-03-25] **Okabe-Ito color system.**

[2026-03-30] **Racetrack canvas (вариант A: стадион) для circular конструктов.**
Четвёртый viewMode (Ctrl+4). Блоки на овале, ширина ∝ bp (log scale). Junctions = quadratic Bezier. Выбран вместо: (B) двухрядный U-turn и (C) линейный + junction-block замыкания. Причины: (1) кольцевость видна из формы; (2) drag-and-drop по овалу — natural для circular; (3) масштабируется от 2 до 10 фрагментов. Спека: `docs/RACETRACK_DESIGN.md`.

[2026-03-30] **Multi-plasmid canvas — фаза 2 после racetrack.**
Несколько плазмид одновременно, каждая как racetrack. Drag Part между стадионами = subcloning. Зависит от: racetrack, state нормализация (byId), multi-assembly rendering.

---

## Данные и аннотации

[2026-03-29] **Аннотации трёхуровневые: region > detail > point.**

[2026-03-29] **Common features database: Python скрипт + NCBI.**
96 NCBI accessions. Frontend: async detection (6-frame protein + DNA sliding window 96%).

[2026-03-29] **Topology toggle в AddFragmentModal.**

[2026-03-26] **Part versioning: parent/child с derivation types.**

---

## Импорт / палитка (Блоки 8-9)

[2026-03-29] **part-categories.js — отдельный модуль для маппинга типов в категории.**

[2026-03-29] **file-import.js — общий модуль импорта файлов.**

[2026-03-29] **File drag-and-drop: фильтрация через `e.dataTransfer.types.includes('Files')`.**

[2026-03-29] **Canvas ↔ палитка — `highlightedPartId` в uiSlice.**

[2026-03-29] **Smart type detection при импорте файлов (B9 fix).**

[2026-03-29] **extractName(): feat.name первым в цепочке fallback (B11 fix).**

[2026-03-30] **ContextMenu.jsx через createPortal в document.body.**
Flip-логика при выходе за экран. Три точки входа: PartsPalette, PartBlock, SequencePreview.

[2026-03-30] **removePart() в store — отдельный action.**
Не удаляет фрагменты с canvas (Part в библиотеке и Fragment на canvas — разные сущности).

[2026-03-30] **enrichWithCommonFeatures fallback в file-import.js (B13 fix).**
Если бэкенд вернул 0 features для .dna → fallback на common features DB через dynamic import.

[2026-03-30] **parse_snapgene: try/except на каждый feature + snapgene_reader fallback (B12 fix).**
Loop с try/except вместо list comprehension — пропускаем сломанные features, парсим остальные.

---

## Процесс разработки

[2026-03-29] **Workflow: Claude Chat → спека → Claude Code → тестирование.**

[2026-03-29] **Документация: CLAUDE.md + PROJECT_STATE.md + CURRENT_TASK.md + DECISIONS.md.**

[2026-03-29] **Claude Code обязан обновлять документацию после каждой сессии.**
