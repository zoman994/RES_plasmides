# SPRINT M-CANVAS-ASSEMBLY-CONSTRUCT — Assembly Construct UX (A2)

**Дата спеки:** 15.05.2026 (batch с A1/A3/A4).
**Тип:** A (большой UX sprint, ~35-40 KB).
**Target размер спеки:** ~38 KB.
**Источник:** chat-сессия Игоря 15.05 описание workflow «копирую кусок — вставляю — следующий — RC если нужно — coloured зоны». A1 обеспечил data model (`state.assemblies`, AssemblyDraft, AssemblySegment). A2 — UI для биолога чтобы construct'ить эти drafts.
**Цепочка:** A1 (data model) → **A2 этот sprint, construct UX** → A3 Primer Design на assembly → A4 Realise as DAG.
**Статус:** черновик Chat 15.05.2026, batch.
**Зависимости:** A1 (state.assemblies + helpers) + F1 (tabs system — A2 расширяет tab.kind на 'assembly') + SequenceView (reuse как coloured-zones rendering).

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Действие в A2 |
|---|---|---|
| `editor/EditorWindowShell.jsx` | ~10 KB | +0.5-1 KB (kind='assembly' branch → mount AssemblyShell) |
| `editor/EditorTabStrip.jsx` | ~6 KB | +1 KB (assembly tab icon + label format `🧬 <name>`) |
| `editor/ContainerEditorSkeleton.jsx` | ~30 KB | без изменений (assembly не через ContainerEditorSkeleton) |
| `store/skeleton-state-editor.js` | ~10 KB (после F3+F4) | +1-2 KB (tab.kind='assembly', OPEN_EDITOR_ASSEMBLY_TAB action) |
| `Library/inspector/tabs/SequenceTab.jsx` | ? | минор +0.5-1 KB (новый prop `segmentMap` для coloured-zones overlay) |
| `SequenceView/index.jsx` | ? | +1-2 KB (рендеринг segment colored zones — backdrop под sequence) |
| `canvas/CanvasLayoutView.jsx` | ~39 KB | +1-1.5 KB (рендеринг Assembly Draft объектов на canvas если `position`) |
| `lib/strings.js` | — | +0.5 KB (новая sub-section `canvasSkeleton.assembly.*`) |

Новые файлы:
- `editor/assembly/AssemblyShell.jsx` ~10-12 KB (orchestrator: header + main view + side panel + footer).
- `editor/assembly/AssemblySequenceView.jsx` ~5-7 KB (wrapping SequenceTab + segment-colored overlay + assembly-specific selection handlers).
- `editor/assembly/AssemblySegmentsPanel.jsx` ~6-8 KB (right side panel: segments list, per-segment actions, RC toggle, drag-reorder).
- `editor/assembly/AssemblySourcePicker.jsx` ~6-8 KB (modal/popover: «Откуда взять?» — search + tabs Library / Canvas / Paste / Other Projects).
- `editor/assembly/AssemblyToolbar.jsx` ~3-4 KB (footer: «Add segment / Add gap / Realise as DAG»).
- `editor/assembly/AssemblyDraftsPanel.jsx` ~4-6 KB (sidebar panel на canvas: список assemblies проекта, открыть/удалить).
- `canvas/AssemblyDraftBlock.jsx` ~4-5 KB (visual block на canvas если assembly.position не null; clickable для open).
- `lib/assembly-palette.js` ~1.5-2 KB (deterministic colour assignment per source: hash containerId → HSL).

Все под soft limit. Декомпозиция existing — не требуется.

---

## 1. Контекст и связи перед действием (§17 R4)

### Идея

Биолог работает с Assembly Draft как с большим документом, аналогом «нового файла» в SnapGene. Внутри документа — continuous последовательность, склееная из кусков разных источников. Кусок = сегмент (sourced или gap). Каждый sourced сегмент получает **цвет** — стабильный hash от source containerId. Цвет рендерится как **backdrop** под буквами sequence в SequenceView. Biolog глазами видит границы по смене цвета.

Construction operations:
- **Add sourced segment**: drag из Library Tree (любой проект) или с canvas containers или из source picker → выбор range на source (SequenceView preview) → RC toggle → drop в текущую позицию (cursor в Assembly view ИЛИ insert-at-index в side panel).
- **Add gap**: явная кнопка «Add gap» в toolbar → выбор kind (linker/unknown/custom) + length или sequence → insert.
- **Reorder**: drag-and-drop в side panel.
- **Delete**: delete-key или delete-icon в side panel.
- **RC toggle**: toggle на segment в side panel.
- **Split**: cursor в SequenceView → context-menu «Split here» → segment разбивается.
- **Rename source label**: inline edit на segment в side panel.

### Где задача сядет

- `editor/EditorWindowShell.jsx` — kind='assembly' branch mount'ит AssemblyShell.
- `editor/EditorTabStrip.jsx` — tab.kind='assembly' рендерит с иконкой `🧬` и label = assembly.name.
- `store/skeleton-state-editor.js` — добавляется `OPEN_EDITOR_ASSEMBLY_TAB { assemblyId }` action. Tab shape расширяется на kind='assembly', `assemblyId?: string`.
- `Library/inspector/tabs/SequenceTab` и `SequenceView/index.jsx` — добавляют prop `segmentMap` (опциональный, default null). Когда передан — рендерит coloured backdrops под буквами. Library/Importer/PCR-mode не используют → behavior preserved.
- `canvas/CanvasLayoutView.jsx` — рендерит AssemblyDraftBlock'и для assemblies с `position != null`. Click → openEditorAssemblyTab.
- На canvas появляется новая floating panel — Drafts panel (как существующий «+ Операция» button, но для assemblies). Сворачивается.
- `lib/strings.js` — новая section STRINGS для всех UI текстов.

### Что НЕ задеваем

- F1 multi-tab logic — расширение через kind, не переписывание.
- F2 junction popover, validation, selectors — без изменений. (Junctions начнут материализоваться только в A4.)
- F3 PcrModeShell — без изменений. Сосуществует как isolated-PCR.
- F4 Live Product Preview — без изменений.
- Algorithm core / lib/bio — без изменений.
- Library Tree internals — A2 только консьюмит Library entries в picker.

### Дубли check (§17 R1)

- **AssemblyShell vs PcrModeShell** — оба mount'ятся как tab content по kind. Похожий pattern (header / main / right panel / footer), но **разная начинка**: PcrModeShell для one isolated PCR, AssemblyShell для assembly draft. Это разные use case — не объединяем. Однако paths параллельные → возможен будущий рефакторинг общего «OperationTabShell» с слотами. Пока преждевременно (DRY-rule: 3 примера — тогда выделять).
- **AssemblySequenceView vs SequenceTab reuse** — это **тонкая обёртка** над SequenceTab (передаём segmentMap prop + специальные selection handlers). Не дублируем SequenceView, расширяем через prop.
- **AssemblySegmentsPanel vs PrimerSuggestionsPanel** — оба right-panel но контент разный (segments vs primer pairs). Не общий.
- **AssemblySourcePicker vs PlaceholderTreePicker (R6 ghost picker)** — похожий UX (search + sections), но входные сценарии разные: ghost picker фильтрует containers для заполнения placeholder'а, source picker для **выбора source segment + range** (двух-шаговый: container, потом range). Reuse через выделение общего `LibrarySearchableList` компонента — возможно, но это рефакторинг существующего → отложить в R5 backlog. В A2 — отдельный компонент с похожим pattern.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** AssemblyShell»: assembly view — это специальный mode editor tab, аналог PcrModeShell. F1 tabs orchestrator + AssemblyShell = расширение pattern на новый kind.
- «**Новый компонент** AssemblySegmentsPanel / AssemblyToolbar / AssemblyDraftsPanel / AssemblyDraftBlock / AssemblySourcePicker / AssemblySequenceView**: assembly UX requires new presentation surfaces которые не имеют существующих аналогов с reusable API. AssemblySequenceView максимально тонкий wrapping SequenceTab.

---

## 2. Стратегия

Assembly View = новый kind editor tab (F1 расширение). Открывается через `OPEN_EDITOR_ASSEMBLY_TAB(assemblyId)`. AssemblyShell — orchestrator: header (name, topology, palette legend), main column (AssemblySequenceView = SequenceTab + segment overlays), right side (AssemblySegmentsPanel — список сегментов с actions), footer (toolbar).

Drafts panel на canvas — floating panel слева (или toggleable в sidebar) — список всех assemblies проекта с кнопкой «+ New Draft». Pin/Unpin (есть/нет position на canvas).

Construction через 3 channels:
- **From canvas**: dropdowns на assembly или drag-from-canvas-container в assembly view.
- **From source picker (modal)**: открывается из toolbar или Ctrl+I, мощный — Library, Other Projects, Recent, Paste.
- **From context-menu в SequenceView**: «Insert RC of selection» (если biolog уже выделил кусок на исходнике).

Coloured zones — backdrop в SequenceView через новый `segmentMap` prop. Цвет — детерминированный hash от source containerId через `lib/assembly-palette.js`. Orphan segments — striped красный pattern.

A2 — UI only. Никакой алгоритмики (junction inference / primer design). Edge cases типа «двойной клик на source segment в side panel — открыть source container в новой tab» — реализуются (улучшает UX), но не критичны.

---

## 3. Scope IN / OUT

### IN

- Tab kind extension: 'assembly' с tab.assemblyId field.
- `OPEN_EDITOR_ASSEMBLY_TAB(assemblyId)` action + breadcrumb format `🧬 <assembly.name>`.
- AssemblyShell orchestrator + sub-components.
- SequenceTab/SequenceView расширение опциональным `segmentMap` prop (coloured backdrop). Backward-compat.
- AssemblySegmentsPanel: list with reorder (drag-and-drop), RC toggle, delete, rename source label, split at cursor.
- AssemblySourcePicker: modal с tabs Library / Canvas containers / Other Projects / Paste raw sequence. Search inside каждый.
- Two-step source insertion: pick container → preview его SequenceView + range selection → optional RC → Insert.
- AssemblyToolbar: «+ Segment», «+ Gap», «Realise as DAG» (forward-link к A4 — в A2 это disabled с tooltip «следующий sprint»), undo/redo (через existing skeleton-history если работает).
- AssemblyDraftsPanel — floating panel/sidebar для list of assemblies проекта.
- AssemblyDraftBlock на canvas — visual представление если assembly.position != null. Drag-to-position. Click → open tab.
- `lib/assembly-palette.js` — deterministic colour assignment per source.
- Orphan UX в side panel: segment с warning badge «source удалён», context-menu «replace source / convert to gap / remove».
- Drag-source-to-assembly интеграция (Library Tree entry → assembly view → source range picker).
- Tests: 25-35 на orchestration, source insertion, segment ops, drag-reorder, orphan UX, palette stability.

### OUT

- Primer design в assembly view (selection → primer) — A3.
- Realise as DAG — A4 (кнопка в footer disabled stub).
- Side-by-side compare двух assemblies — отдельный sprint.
- Annotation transfer (sourced segment приносит аннотации source range → отображаются в AssemblySequenceView) — частично в A3, либо отдельный sprint.
- Export assembly draft → standalone .bodge file / FASTA — отдельный sprint (post-MVP).
- Collaborative cursor / multi-user editing — выходит за scope продукта.
- Time-travel: версии Assembly Draft с history (rollback to N steps ago) — отдельный sprint, использует skeleton-history если хватит.
- AssemblySourcePicker «Paste raw sequence» создаёт implicit container в Library — A2 НЕ создаёт. Решение: в paste режиме создаётся **gap segment** с gapSequence = pasted. Если biolog хочет real container — он создаёт его в Library отдельно.
- Cross-project source containers — partial поддержка через denormalised snapshot. «Open source in original project» action — TECH_DEBT после A2 acceptance.

---

## 4. Архитектурные решения

### DEC-CANVAS-ASM-UX-01 — Tab kind 'assembly' расширяет F1 tab shape

```
editorContext.tabs[i] = {
  id, openedAt,
  kind: 'container' | 'operation' | 'assembly',  // расширение
  containerId?, operationId?,
  assemblyId?: string,  // NEW
}
```

`OPEN_EDITOR_ASSEMBLY_TAB { assemblyId }` — focus existing или create new tab с kind='assembly'. Закрытие через × close-button (как остальные tabs).

### DEC-CANVAS-ASM-UX-02 — AssemblyShell layout

```
AssemblyShell (absolute inset:0, flex column)
├── AssemblyHeader (top, 40 px)
│   ├── Assembly name (inline-editable)
│   ├── Length info «<N> bp · <segments count> segments · <linear/circular>»
│   ├── Topology toggle (linear ↔ circular)
│   ├── Palette legend (collapsible)
│   └── × Close
├── Flex row (fills space)
│   ├── AssemblySequenceView (flex 1) — SequenceTab + segmentMap overlay
│   └── AssemblySegmentsPanel (right column 280 px) — segments list, drag-reorder
└── AssemblyToolbar (bottom, 48 px)
    ├── «+ Segment» button → AssemblySourcePicker
    ├── «+ Gap» button → InsertGapModal
    ├── «Realise as DAG» button (A2: disabled, tooltip «следующий sprint»)
    └── Right: undo / redo
```

`mini-canvas` (F1) — **hidden** в assembly tab (биолог в фокусе assembly view, проекту привязка не нужна; toggle для возврата на canvas через × close-tab). Альтернатива в Q1.

### DEC-CANVAS-ASM-UX-03 — Segment coloured zones rendering

SequenceView расширяется опциональным prop `segmentMap`:

```
segmentMap = [
  { segmentId, offsetStart, offsetEnd, color, sourceLabel, isOrphan },
  ...
]
```

Рендерится как **backdrop layer** под буквами sequence: коричневый горизонтальный rect для каждого segment, color = stable hash от source containerId через `lib/assembly-palette.js`.

Цвет полу-прозрачный (0.25 alpha). Буквы поверх — black/white в зависимости от darkness backdrop.

Orphan segments — diagonal stripe pattern красным.

Gap segments — серая (var(--surface-3)) полоса с гриенd-overlay (нет «source»).

Если `segmentMap` не передан — рендеринг без зон (existing behavior для Library, PCR mode).

### DEC-CANVAS-ASM-UX-04 — Palette: HSL hash от containerId

`lib/assembly-palette.js::colorForSource(containerId): {h, s, l, css}`.

Deterministic hash от containerId → hue 0-360. Saturation 50%, lightness 70% (pastel-ish, чтобы буквы over читались).

Special colors:
- Orphan: red-500 (#dc2626) с stripe.
- Gap unknown: gray.
- Gap linker: light-purple (custom palette).
- Gap custom: light-yellow.

Palette legend в header показывает: для каждого уникального source в assembly — color swatch + source name. Свёрнуто по умолчанию (`collapsible`).

### DEC-CANVAS-ASM-UX-05 — AssemblySourcePicker two-step flow

Step 1 — выбор container:
- Modal с tabs: «From this project», «Library», «Other Projects» (если в state есть references), «Paste raw sequence».
- Search input. List отфильтрованный по name+sequence text match.
- Recent — last 5 used sources как quick-pick.

Step 2 — выбор range:
- Mini-SequenceView preview выбранного container.
- Biolog выделяет range через native onSelectRange.
- Optional «Reverse complement» checkbox.
- «Insert at cursor» (default — текущий cursor в Assembly view) OR «Insert at end».
- «Insert» / «Cancel» footer.

Submission → dispatch `addAssemblySegment(asmId, makeSourcedSegment({sourceContainer, rangeStart, rangeEnd, orientation}, insertAtIndex))`.

### DEC-CANVAS-ASM-UX-06 — AssemblySegmentsPanel content

Right column. Sticky scroll. Each segment-row:

```
[icon] segment.sourceLabel (или «Gap» / «Unknown»)
       <range info: «pET28 [123:567], 444 bp, forward»> | <gap: «unknown 30 bp»>
       [RC toggle] [edit-icon] [⋮ menu]
```

Drag handle на left → reorder. Drop ниже/выше другого segment → moveAssemblySegment.

Click row → highlight соответствующий segment в SequenceView (scroll-to + temporary border). Double-click row → opens source container в новой F1 tab (sourced) или editGapModal (gap).

⋮ menu:
- Replace source (если sourced) → AssemblySourcePicker step 2 для другого container.
- Convert to gap (sourced → gap; sourceContainer/range stripped).
- Split here (split segment at center).
- Delete.

### DEC-CANVAS-ASM-UX-07 — Drag-and-drop source insertion

Drag из:
- Library Tree entry → assembly view (cursor position) → triggers AssemblySourcePicker step 2 (range selection) с pre-selected container.
- Canvas ContainerBlock → assembly view → similar.
- AssemblySegmentsPanel row (segment) → reorder within panel OR drag to canvas → unlink? (TODO: not supported in A2, return-to-place fallback).

Drag-over highlight в AssemblySequenceView — vertical caret showing insertion point. Drop → dispatch action.

Если drag из source containers в canvas — но drop на пустое место canvas (не на assembly) — no-op. (Можно расширить «create new assembly from this container» в Q3, но это not в A2 scope.)

### DEC-CANVAS-ASM-UX-08 — Selection в AssemblySequenceView

Native SequenceView onSelectRange работает. В A3 этот selection будет триггерить primer design. В A2 — только caret + selection tracking + context-menu actions:

- «Split here» — split segment at cursor.
- «Insert RC of selection» — берёт selection range, делает RC, inserts в next position.
- «Copy» — copy в clipboard sequence (existing SequenceView feature).
- «Annotate selection» — opens Annotator (existing F1 integration).

### DEC-CANVAS-ASM-UX-09 — InsertGapModal

Simple modal:
- Tabs: «Known linker» (preset linkers - 6xHis, GS×4, T2A, P2A; sequence pre-filled), «Custom sequence» (paste ATCG), «Unknown length» (length only, sequence will be '?').
- Label (optional).
- «Insert at cursor» / «Insert at end».
- «Insert» / «Cancel».

Backed by `insertAssemblyGap(asmId, {gapKind, gapSequence?, length?, gapLabel?}, insertAtIndex)`.

### DEC-CANVAS-ASM-UX-10 — AssemblyDraftsPanel placement

Floating panel левая сторона canvas (как existing «+ Операция» bottom-right). Toggle button «📋 Drafts (N)» в углу. Click — открывается панель overlay (~240 px wide):

- Title «Assembly Drafts».
- «+ New Draft» button.
- List: каждая assembly — card с name, length, segments count, updated_at relative.
- Card actions: «Open» (default click), «Pin to canvas» (set position) / «Unpin» (clear position), «Delete» (confirm).

### DEC-CANVAS-ASM-UX-11 — AssemblyDraftBlock visualization on canvas

Когда `assembly.position != null` — рендерится на canvas как rectangle (300 × 80 px), dashed border (1.5 px var(--accent-500)):
- Top: 🧬 + assembly.name.
- Middle: mini-sparkline coloured zones (mini visualization of segments).
- Bottom: «<N> bp · <K> segments».

Click → openEditorAssemblyTab. Drag → setAssemblyPosition.

Не imperative для биолога — биолог может работать только в Drafts panel без position. Но position полезна если biolog хочет видеть assembly рядом с source containers как mental anchor.

### DEC-CANVAS-ASM-UX-12 — Realise as DAG button (stub в A2)

В AssemblyToolbar — button «🪄 Realise as DAG». В A2 — disabled с tooltip «Reverse-engineer operations from assembly — следующий sprint (A4)». В A4 — становится active. Это намеренно ranged: биолог в A2 уже видит куда движется feature.

### DEC-CANVAS-ASM-UX-13 — Editor history (undo/redo) для assembly

Existing `skeleton-history.js` — work-stack для skeleton state. Расширяется на assembly actions: добавление/удаление/move segments — undoable.

NAV actions (open/close assembly tab) — НЕ в undo stack (DEC-WIN-04 pattern).

В A2 — extension assembly actions в существующий history mechanism. AssemblyToolbar показывает Undo/Redo (Ctrl+Z / Ctrl+Y).

### DEC-CANVAS-ASM-UX-14 — Persistence position при switch project

Assembly.position сохраняется в `state.assemblies[i].position`. При переключении project (F1) — assemblies другого project не loaded (per-project persistence через `stateKeyFor(projectId)` из V65). Возврат в project — positions restore.

---

## 5. Файлы и сигнатуры

### Новые файлы

**`editor/assembly/AssemblyShell.jsx`** (~10-12 KB)

`AssemblyShell({ assembly })`. Layout per DEC-ASM-UX-02.

Resolves `assembly = state.assemblies.find(a => a.id === assemblyId)`. If not found — render «Draft removed» state with «Close tab» button.

Consume `useAssemblySequence(assembly.id)` → `{sequence, segmentMap, topology, orphans}`.

Mount AssemblySequenceView + AssemblySegmentsPanel + AssemblyToolbar.

Wires:
- onSelectRange → tracks selection (для A3 future + immediate Split-here context-menu).
- onInsertGap → dispatches insertAssemblyGap.
- onAddSegment → opens AssemblySourcePicker, on submit dispatch addAssemblySegment.
- onRealiseClick → noop в A2 (disabled).

**`editor/assembly/AssemblySequenceView.jsx`** (~5-7 KB)

Thin wrapper над `SequenceTab` (Library viewer reuse, DEC-ASM-UX-03):

```
AssemblySequenceView({ sequence, segmentMap, topology, onSelectRange, onContextMenuAction, ... })
```

Pass-through props к SequenceTab плюс `segmentMap` (новый prop). Extra context-menu items:
- «Split here at <position>» — onContextMenuAction({action:'split', atPosition}).
- «Insert RC of selection» — onContextMenuAction({action:'insertRC', range}).

Использует existing `onWritePrimer` API extension (V74) — но в A2 пункт «Write primer» **hidden** (primer design — A3). Контекст-меню extraItems в A2 = только split/insertRC.

**`editor/assembly/AssemblySegmentsPanel.jsx`** (~6-8 KB)

`AssemblySegmentsPanel({ assembly, segmentMap, onSelectSegment, onReorder, onUpdate, onRemove, onSplit })`.

Renders ordered list. Drag-and-drop через native HTML5 (draggable=true, dragstart/dragover/drop handlers). Visual feedback: dragged-row opacity 0.5, drop-indicator line.

Per-row controls per DEC-ASM-UX-06.

**`editor/assembly/AssemblySourcePicker.jsx`** (~6-8 KB)

Modal (overlay z 100+, как RestrictionSitePopover pattern but bigger). Two-step state machine:

- Step 1: pick source container.
- Step 2: pick range + RC.

Buttons: «← Back» (step 2 → step 1), «Cancel», «Insert».

Renders mini-SequenceView в step 2 через SequenceTab reuse (read-only).

**`editor/assembly/AssemblyToolbar.jsx`** (~3-4 KB)

Footer bar. Buttons per DEC-ASM-UX-02. Disabled state и tooltips. Hotkey hints («Ctrl+I» for add segment).

**`editor/assembly/AssemblyDraftsPanel.jsx`** (~4-6 KB)

Floating panel на canvas (DEC-ASM-UX-10). Toggle state в local React state или в skeleton state.

Cards rendering. Actions wired через context.

**`canvas/AssemblyDraftBlock.jsx`** (~4-5 KB)

`AssemblyDraftBlock({ assembly, position })`. Renders rectangle с mini-sparkline.

Sparkline = horizontal bars в pseudo-mini-view: each segment = colored block proportional to length. (Похоже на mini segments view но super-condensed.)

Drag handler → onPositionChange. Click → openEditorAssemblyTab.

**`lib/assembly-palette.js`** (~1.5-2 KB)

```
colorForSource(containerId: string): {h: number, s: number, l: number, css: string}
colorForOrphan(): {css: 'repeating-linear-gradient(...)' }
colorForGap(gapKind: 'linker'|'unknown'|'custom'): {css}
```

Hash function: simple string-hash → mod 360 для hue. Saturation/lightness fixed pastel.

### Existing файлы — изменения

**`editor/EditorWindowShell.jsx`** (~+0.5-1 KB)

Kind dispatcher уже умеет 'container' (F1) и 'operation' (F3 → opens PcrModeShell). Добавляется 'assembly' → opens AssemblyShell.

**`editor/EditorTabStrip.jsx`** (~+1 KB)

Tab kind 'assembly' → icon 🧬, label = assembly.name из state.assemblies. Если assembly не найден (orphan tab) — «Draft removed» label с warning icon.

**`store/skeleton-state-editor.js`** (~+1-2 KB)

`OPEN_EDITOR_ASSEMBLY_TAB { assemblyId }` action. Tab shape расширяется. focusExisting OR createNew logic mirror'ит OPEN_EDITOR_OP_TAB.

Removed assembly handling: REMOVE_ASSEMBLY (через A1 deleteAssembly) — закрыть все tabs с этим assemblyId (как REMOVE_CONTAINER).

**`Library/inspector/tabs/SequenceTab.jsx`** (~+0.5-1 KB)

New optional prop `segmentMap` (default null). Pass-through to SequenceView.

**`SequenceView/index.jsx`** (~+1-2 KB)

New optional prop `segmentMap`. Rendering layer:
- Before letters layer, после ruler/feature layers.
- Iterate segmentMap → render colored backdrops.
- Hover на zone → tooltip с sourceLabel.

Backward-compat — без `segmentMap` поведение неизменно (existing F1-F4 + Library viewers).

**`canvas/CanvasLayoutView.jsx`** (~+1-1.5 KB)

Render `state.assemblies` с position != null как AssemblyDraftBlock'и. Параллельно existing containers/operations.

**`lib/strings.js`** (~+0.5 KB)

`STRINGS.canvasSkeleton.assembly.*` section.

Keys: `newDraftButton`, `addSegmentButton`, `addGapButton`, `realiseAsDagButton`, `realiseDisabledTooltip`, `pickerStep1Title`, `pickerStep2Title`, `gapModalLinkerTab`, `gapModalCustomTab`, `gapModalUnknownTab`, `topologyLinear`, `topologyCircular`, `paletteLegendTitle`, `orphanWarning`, `draftRemoved`, etc.

### Тесты

`__tests__/canvas-skeleton/assembly-shell.test.jsx` (~12-15 KB).

Покрытие:

1. **Tab open:** openEditorAssemblyTab(asmId) → tab kind='assembly', AssemblyShell mounts.
2. **Tab close → state preserved:** assemblies slice unchanged.
3. **Header renders name + length + segments count.**
4. **Topology toggle:** click linear → circular → setAssemblyTopology dispatched.
5. **«+ Segment» button:** opens AssemblySourcePicker.
6. **AssemblySourcePicker step 1 → step 2:** pick container → step 2 visible with mini-viewer.
7. **AssemblySourcePicker submission:** select range + RC + Insert → addAssemblySegment dispatched with right params.
8. **«+ Gap» modal:** preset linker → insertAssemblyGap dispatched with correct gapKind/sequence.
9. **AssemblySegmentsPanel renders rows:** each segment as row с right info.
10. **Drag-reorder:** simulate drag-and-drop → moveAssemblySegment dispatched.
11. **RC toggle:** click → updateAssemblySegment with patched orientation.
12. **Delete:** click → removeAssemblySegment.
13. **Split here:** context-menu в SequenceView at position → splitAssemblySegment.
14. **Insert RC of selection:** selection in viewer → context-menu → addAssemblySegment with RC orientation, source same as current container? (Edge case — clarify Q4.)
15. **Coloured zones rendered:** SequenceView mock receives segmentMap with proper offsets.
16. **Palette deterministic:** same containerId → same hue across renders.
17. **Orphan segment styling:** segment with stale source → red stripe.
18. **AssemblyDraftsPanel renders:** list of assemblies, «+ New Draft» creates one.
19. **Pin to canvas:** setAssemblyPosition → AssemblyDraftBlock на canvas visible.
20. **AssemblyDraftBlock click → open tab.**
21. **Realise button disabled в A2** with tooltip.
22. **Undo/redo:** addSegment then undo → previous state, redo → restored.
23. **REMOVE_CONTAINER cascade:** source removed → segments stay, orphan-flagged in next render, panel shows warning.
24. **deleteAssembly cleanup tabs:** open tab on assembly → delete → tab removed.
25. **Backward-compat SequenceView без segmentMap:** Library + PCR mode render unchanged.

---

## 6. Порядок выполнения

### K1 — Tab kind extension + dispatch

- editorContext.tabs[].kind='assembly' + assemblyId field.
- OPEN_EDITOR_ASSEMBLY_TAB action.
- EditorWindowShell dispatch.
- Stub AssemblyShell (renders «Assembly <id>» placeholder).
- Tests 1-2.

### K2 — AssemblyShell + Header + Toolbar (skeleton)

- AssemblyShell layout.
- Header с inline-name-edit + length + topology toggle + palette legend stub.
- Toolbar с buttons stubs.
- Tests 3, 4, 21.

### K3 — SequenceView segmentMap prop + AssemblySequenceView

- SequenceTab + SequenceView prop extension.
- Backward-compat check (Library + PCR).
- AssemblySequenceView wrapping.
- Palette lib.
- Tests 15, 16, 25.

### K4 — AssemblySegmentsPanel + per-segment actions

- Renders list.
- Per-row actions (RC toggle, delete, edit-source-label, split).
- Tests 9, 11, 12, 13.

### K5 — Drag-and-drop reorder

- HTML5 drag handlers.
- Visual feedback.
- Tests 10.

### K6 — AssemblySourcePicker (two-step)

- Step 1: tabs Library/Canvas/Other Projects/Paste.
- Search.
- Step 2: mini-viewer + range + RC.
- Tests 5, 6, 7.

### K7 — InsertGapModal + «+ Gap» button

- Modal с tabs.
- Presets linker.
- Tests 8.

### K8 — AssemblyDraftsPanel + AssemblyDraftBlock + pin

- Floating panel.
- New Draft creation.
- Pin/Unpin position.
- AssemblyDraftBlock на canvas.
- Tests 18, 19, 20.

### K9 — Orphan UX + REMOVE_CONTAINER cascade

- Orphan visual (stripe, warning badge).
- Panel «replace source / convert to gap» actions.
- Tests 17, 23.

### K10 — Realise button stub + undo/redo

- Stub disabled button.
- Undo/redo wiring через skeleton-history.
- Tests 21, 22.

### K11 — deleteAssembly cleanup + Insert RC + cleanup

- Tab cleanup при delete.
- Insert RC of selection.
- Tests 14, 24.
- Lint, build clean, sizes audit.
- Финальный отчёт.

**STOP после K11.** Visual acceptance — отдельная сессия.

---

## 7. STOP-условие и формат отчёта

Идентично A1 + дополнительно:

- DECISIONS draft 14 DEC-CANVAS-ASM-UX-NN.
- Manual smoke длинная: «создал draft → добавил 3 segments из разных containers → RC второй → переcтавил → split первый → undo undo → редо → закрыл tab → переоткрыл → состояние сохранилось».

---

## 8. Риски

### R-DRIFT (cross-spec) — A2 опирается на A1 без acceptance gate

Митигация: ссылки на конкретные DEC-CANVAS-ASM-NN. Любые изменения A1 в реализации reflected в A2 review до Code-сессии A2.

### R1 — segmentMap prop в SequenceView ломает Library / PCR

Backward-compat: default null prop, без него рендеринг неизменный. Test 25 — explicit regression check. Если test fail → fix перед прогрессом.

### R2 — Drag-and-drop reorder UX fragile cross-browser

Native HTML5 drag-and-drop капризна. Митигация: K5 manual smoke на Chrome (primary target Tauri/Electron — Chromium). На Firefox/Safari может быть quirks — не critical для MVP. TECH_DEBT entry если что.

### R3 — AssemblyDraftBlock на canvas требует positioning logic + drag

Pattern existing (ContainerBlock дrаgable). Просто extend на assembly. Lower risk.

### R4 — Insert RC of selection ambiguous edge case

Test 14 в Q4 для clarification: selection в AssemblySequenceView (across segments?) → как создать RC? Что считать source? Sub-question Q4 ниже.

### R5 — AssemblySourcePicker «Other Projects» tab — cross-project access

Requires loading другого project state (V65 stateKeyFor). Если другой project не loaded — нужен async loader. Скорее всего в A2 — synchronous показ только currently-loaded projects (текущий + recently switched), TECH_DEBT для полного cross-project source list.

### R6 — Palette deterministic but ugly colours

Hash может выдать неприятные комбинации. Митигация: K3 manual visual check; добавить «golden ratio» offset в hue для better distribution; alternative — fixed palette из 20 хороших цветов и hash mod 20.

### R7 — AssemblyShell ~10-12 KB могут перерастить hard 30 при добавлении interactions

Митигация: K2 на skeleton (header + toolbar stubs), главная логика в sub-components. Если AssemblyShell растёт >25 KB — extract handlers в `useAssemblyShellState` hook.

---

## 9. Открытые вопросы — нужен OK Игоря до handoff Code

### Q1 — Mini-canvas (F1) в Assembly tab — show или hide?

Дефолт (hide): в assembly tab biolog в фокусе assembly, project-anchor не критичен. Mini-canvas скрыт.

Альтернатива (show): mini-canvas виден всегда, биолог может click → switch к canvas-tab.

### Q2 — AssemblySourcePicker «From this project» tab — содержит containers OR ещё assemblies + operations?

Дефолт: только containers (sourced segment ссылается на ContainerId). Assemblies-as-source — рекурсия которая ломает invariants. Operations — output containers (потенциально, если op.status='executed').

Альтернатива: добавить executed operation outputs как pseudo-containers в picker (но они уже в `state.containers` после OP_EXECUTE). То есть — нет, дефолт правильный.

### Q3 — Drop container on empty canvas → create assembly with that container as first segment?

Дефолт: no-op (drag-return to source). Biolog должен явно «+ New Draft» в Drafts panel сначала.

Альтернатива: drop на empty canvas → создаёт new assembly с этим container'ом. Это быстрее для биолога но может вызывать accidental creates. Trade-off.

### Q4 — «Insert RC of selection» context-menu — selection в AssemblySequenceView, что source у нового segment?

Selection в assembly view может cross-cut несколько segments (e.g. начинается в segment A, заканчивается в segment B). 

Дефолт варианта (a): allow только если selection лежит **внутри одного sourced segment**. RC + same source + insert as new segment after selection.

Дефолт варианта (b): always allowed — берёт computed sequence в range, RC её, создаёт **gap segment** с этим RC content (sourceless).

Дефолт (a) проще для трассировки, (b) более гибко. Take (a) — биолог обычно делает RC одного фрагмента; для multi-segment RC проще insert-gap-with-paste.

### Q5 — AssemblyShell mini-canvas (F1) показывается?

Already in Q1. Игнорировать.

### Q6 — Topology toggle effect

Дефолт: только metadata flag, sequence в SequenceView рендерится linear всегда. Circular представление — markers «5'-end joins to 3'-end» подсказка в header.

Альтернатива: circular topology в SequenceView рендерит actual circular view (round). SequenceView не поддерживает это сейчас (нет CircularSequenceView в Library) — слишком много работы для A2. Take дефолт.

---

## Acceptance gate (визуальная, отдельная сессия после Code)

- «+ New Draft» в DraftsPanel → empty assembly tab opens.
- «+ Segment» → AssemblySourcePicker → выбрать container из Library → выбрать range 100-500 → RC checkbox → Insert. Segment появился в SequenceView как coloured zone + в SegmentsPanel как row.
- Повторить × 2 для других containers. Coloured zones смежные, разные цвета.
- «+ Gap» → preset «6×His» → Insert. Серая зона между segment'ами.
- Drag-reorder segment 2 → последовательность пересчитывается, сегменты в правильном новом порядке.
- RC toggle второго segment → segment.orientation = 'reverse', sequence пересчиталась.
- Split первого segment в середине → один segment стал двумя.
- Удалить третий segment → row gone, sequence короче.
- Topology toggle → metadata flag, header показывает.
- Close tab, reopen → state preserved.
- Pin to canvas → AssemblyDraftBlock visible на canvas, click → tab open.
- Удалить source container третьего segment → orphan badge в panel + striped красный в SequenceView.
- Realise as DAG button — disabled с tooltip.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после A1 + OK Игоря по Q1-Q6 + compact (или batch).
_Acceptance:_ visual в отдельной chat-сессии после Code STOP.
