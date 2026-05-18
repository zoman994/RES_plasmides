> **[ARCHIVED 2026-05-16 — D1 disposition]** G2 — вторая попытка A2. Был
> вторым input'ом для Code merge stage в A2. Merge plan зафиксирован,
> реализовано в `docs/SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md` (A2): coloredZones
> + onZoneClick/onZoneHover, AssemblyModeShell, primer writing IN A2 (A3
> уточняет boundary tails). Сохранено как история.

# SPRINT M-CANVAS-ASSEMBLY-VIEW — Assembly View + Primer Writing (G2)

**Дата спеки:** 15.05.2026 (вечер, после G1 в той же batch-сессии).
**Тип:** A (большой, на верхней границе).
**Target размер спеки:** ~35-40 KB (явная санкция Игоря «максимально подробно»).
**Источник:** Тот же walkthrough что G1. G2 — UI часть assembly workflow.
**Цепочка:** G1 (data model) → **G2 этот sprint (UI editor + primer writing)** → G3 Reverse-DAG → опционально G4.
**Статус:** черновик Chat 15.05.2026, реализуется после G1 + acceptance.
**Зависимости:** опирается на G1 (data model) + F1 (tab system) + F3 V71 (SequenceView reuse pattern) + F3 V72 (decoupled selection + hotkey primer writing).

---

## Контекст и зачем

G1 даёт data model — `AssemblyDraft` живёт в state, рендерится как read-only block на canvas, биолог может создавать через action / dev console / floating button. Но **редактировать не может** — нет editor UI.

G2 строит editor: open assembly draft в F1 tab (tab.kind='assembly'), показывает continuous sequence через **тот же Library SequenceView** что F3 reuse'нул в V71. Добавляет три capabilities:

1. **Coloured zones** на sequence per segment — биолог видит границы фрагментов цветом, как в SnapGene.
2. **Drag-and-drop containers** из sidebar Library в assembly sequence на cursor position — это и есть «копирую-вставляю» workflow Игоря.
3. **Primer writing на assembly sequence** — Ctrl+R / context-menu (тот же mechanism что F3 V72), но primer привязан к **assembly** + **range на assembly**, не к op. Primer покрывающий границу сегментов = будущий junction primer (визуальный highlight).

После G2 биолог имеет полноценный SnapGene-like assembly workflow в канвасе. G3 добавит «Realise as DAG» button.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Действие |
|---|---|---|
| `Library/sequence-view/SequenceView/index.jsx` | ~39 KB (после V74/V76) | Watch | +1.5-2.5 KB (coloredZones + onZoneClick + zone hover tooltip prop) |
| `Library/inspector/tabs/SequenceTab.jsx` | ~15 KB est | +0.3-0.5 KB (pass-through coloredZones / onZoneClick) |
| `editor/ContainerEditorSkeleton.jsx` | ~30 KB (после F1 trim) | +0.5-1 KB (tab.kind='assembly' gate) |
| `editor/EditorTabStrip.jsx` | ~5.7 KB | +0.5 KB (assembly tab icon 🧬 + breadcrumb format) |
| `canvas/AssemblyDraftBlock.jsx` | ~5-7 KB (after G1) | +0.3 KB (double-click → реальный openEditorAssemblyTab) |
| `canvas/MiniProjectCanvas.jsx` | ~7 KB | Watch | +0.5-1 KB (render assembly drafts маркерами параллельно containers + ops) |
| `store/skeleton-state-editor.js` | ~? после F3 ~11 KB | +1.5 KB (tab.kind='assembly' extension + OPEN_EDITOR_ASSEMBLY_TAB + assembly primers slice) |
| `store/skeleton-state-assembly.js` | ~6-8 KB (after G1) | +2-3 KB (assemblyDraftPrimers actions) |
| `store/skeleton-context.jsx` | ~12 KB est | +1 KB (assembly editor actions) |

Новые файлы:
- `editor/assembly-mode/AssemblyModeShell.jsx` ~10-12 KB
- `editor/assembly-mode/AssemblyHeader.jsx` ~3 KB
- `editor/assembly-mode/AssemblySidebar.jsx` ~5-6 KB
- `editor/assembly-mode/SegmentList.jsx` (footer table) ~5-6 KB
- `editor/assembly-mode/SegmentDetailPanel.jsx` ~4-5 KB
- `editor/assembly-mode/RealiseAsDagButton.jsx` (stub) ~1 KB
- `editor/assembly-mode/AssemblyPrimerWriter.jsx` (orchestrator helper) ~3-4 KB
- `lib/assembly-primer-utils.js` (cross-boundary detection + Tm) ~3-4 KB

**Все новые файлы под soft limit.** Подпапка `editor/assembly-mode/` — естественная декомпозиция, как `operation-modes/` (от F3).

`SequenceView/index.jsx` остаётся в Watch zone (~39 KB → ~41 KB после G2 + потенциально V77+ багфиксов). Hard 40 KB достижим близко. **Если K1 разведка покажет что extension вырастает в 3+ KB — декомпозировать SequenceView в подзонные модули первым шагом G2.** Это не G2 scope, но возможная зависимость.

---

## 1. Контекст и связи перед действием (§17 R4)

### Где задача сядет

- **F1 tab system extension** (`store/skeleton-state-editor.js`) — `tab.kind` принимает `'assembly'`. Tab shape: `{id, kind: 'container'|'operation'|'assembly', containerId?, operationId?, assemblyDraftId?, openedAt}`.
- **`store/skeleton-context.jsx`** — новый action `openEditorAssemblyTab(draftId)` (в G1 был stub).
- **`editor/ContainerEditorSkeleton.jsx`** — gate в render: `if (tab.kind === 'assembly') return <AssemblyModeShell draftId={tab.assemblyDraftId} />`.
- **`editor/EditorTabStrip.jsx`** — breadcrumb format для assembly tab: `🧬 {draft.name} · N bp · linear/circular`. Icon 🧬, distinct от 📦 (container) и 🔬 (PCR op).
- **`editor/assembly-mode/AssemblyModeShell.jsx`** — orchestrator (как PcrModeShell после V71). Layout: header + flex row (SequenceTab центр + AssemblySidebar справа) + footer (SegmentList table).
- **`Library/sequence-view/SequenceView/index.jsx`** — **opt-in props extension**:
  - `coloredZones?: Array<{start, end, color, label?, zoneId?}>` — background fill зон.
  - `onZoneClick?: (zoneId, event) => void` — click handler на zone.
  - `onZoneHover?: (zoneId | null) => void` — hover state (для tooltip OR sidebar highlight).
  - Default off (Library/Importer/PcrModeShell не передают — back-compat).
- **`Library/inspector/tabs/SequenceTab.jsx`** — pass-through новых props.
- **Primer writing reuse F3 V72 mechanism**: existing `onSelectRange` + `onWritePrimer` props + Ctrl+R/Ctrl+Alt+R hotkeys. Но **primers attached to assembly draft, не op.**
- **`store/skeleton-state-assembly.js`** (G1) — extension с `assemblyDraftPrimers` slice + actions write/edit/remove.
- **`canvas/AssemblyDraftBlock.jsx::onDoubleClick`** (G1 stub) → `actions.openEditorAssemblyTab(draft.id)` real implementation.
- **`canvas/MiniProjectCanvas.jsx`** — render assembly drafts как маркеры параллельно containers + ops. Иконка 🧬 / rectangle с N segments indicator.

### Что НЕ задеваем в G2

- **G1 data model AssemblyDraft / Segment shape** — без изменений (G2 потребляет G1).
- **Operations / junctions / containers** — без изменений.
- **F3 PcrModeShell** — без изменений; assembly editor параллельная сущность.
- **Library / Importer / StartScreen UI** — без изменений. Sidebar в assembly editor — отдельный компонент, не reuse существующего LibraryTree (см. Q3).
- **Algorithm core** — без изменений.
- **G3 «Realise as DAG»** — stub button в G2; реальный algorithm — G3.

### Дубли check (§17 R1)

- **AssemblyModeShell vs PcrModeShell.** Оба — thin orchestrators поверх SequenceTab. Различия:
  - PcrModeShell mount'ит ОДИН SequenceTab с template (op.inputs[0]) + правая panel primers + footer order gate.
  - AssemblyModeShell mount'ит ОДИН SequenceTab с assembly sequence + правая sidebar containers (drag source) + footer segments table.
  
  Структура layout схожа, content разный. Reuse через общий abstract'ный shell — overengineering на текущей стадии (только 2 mode shells, плюс будущие mutagenesis/gibson/restriction = 5 modes max). Когда будет 5 — рефакторинг в общий `<OperationModeShellTemplate>`. Сейчас отдельные файлы — нормально.

- **AssemblySidebar vs LibraryTree.** AssemblySidebar — упрощённая flat list containers текущего проекта с drag-handles. LibraryTree — полноценное дерево с папками / зонами / search / sort. Reuse LibraryTree в sidebar — overkill (полный tree не помещается, плюс drag-and-drop в sidebar требует другой API). Минимальный flat list + filter input — отдельный компонент.

  **Альтернатива:** reuse LibraryTree через prop `compact={true}` + `enableDragSource={true}`. Это API extension существующего; снимает дубль. Take A (отдельный компонент) для G2 simplicity; в будущем рефакторинг через LibraryTree compact mode если повторится паттерн.

- **SegmentList vs существующая таблица.** Нет аналога — segments table уникальная.

- **AssemblyPrimerWriter.** Не отдельный компонент — это **helper hook** который оркеструет write logic (current selection + Ctrl+R wire + cross-boundary detection). Уровень декомпозиции — реализатор решит на K5 (либо inline в AssemblyModeShell, либо отдельный hook). Чистая логика, не UI сущность.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** AssemblyModeShell»: расширение F1 tab system на третий kind. Existing ContainerEditorSkeleton не подходит (он для single-container view), PcrModeShell тоже (для single-op view). Assembly — multi-segment composite, требует свою orchestration. Не bespoke viewer (reuse SequenceTab); orchestrator.
- «**Новые компоненты** AssemblySidebar / SegmentList / SegmentDetailPanel / AssemblyHeader**: разнесены по responsibility внутри `operation-modes/`-like подпапки `assembly-mode/`. Inline'ить всё в AssemblyModeShell.jsx → файл ~25 KB единый. Декомпозиция cleaner.
- «**Новый файл** `lib/assembly-primer-utils.js`**: cross-boundary detection + Tm для primer'ов на assembly — pure utility. Не часть AssemblyModeShell (UI), не часть selectors (вне state). Естественное место — `lib/`.

### Coupling F1 / F3 risk

G2 расширяет tab.kind (F1) на третий вариант. F3 уже extended на 'operation'. Финальный shape `kind: 'container' | 'operation' | 'assembly'`. **Если F3 acceptance вскроет что operation tab требует другой extension (например, op.kind вместо kind) — G2 синхронно поправляется.** Минимизация риска: extension аддитивная (новый case), не меняет existing 'container'/'operation' behaviour.

---

## 2. Стратегия

`AssemblyModeShell` — thin orchestrator поверх **того же Library SequenceTab** что F3 reuse'нул после V71 rework. Coloured zones — opt-in prop extension SequenceView; default off везде кроме assembly editor. Drag-and-drop containers из правой sidebar — нативный HTML5 DnD events, on drop в SequenceView вставляется segment на cursor position через `actions.insertSegment`.

Primer writing — reuse F3 V72 mechanism: Ctrl+R / Ctrl+Alt+R hotkeys + onWritePrimer context-menu prop. Но scope изменён: primer attaches к **assembly draft**, не op. Cross-boundary primer (binding spans 2+ segments) detected через `lib/assembly-primer-utils::detectCrossBoundary` — это будущие junction primer'ы (visual highlight в panel + tooltip).

Segments table в footer — read-only summary с edit-actions (delete / reorder / detail panel open). Drag-handle на каждой row для reorder через drag-and-drop. SegmentDetailPanel (right-side drawer) открывается на click row — показывает source / range / RC toggle / label / color override.

«Realise as DAG» button в header — stub в G2 (opens dialog «G3: coming soon»). G3 implementation.

---

## 3. Scope IN / OUT

### IN (G2)

- F1 tab.kind='assembly' extension + OPEN_EDITOR_ASSEMBLY_TAB action.
- AssemblyModeShell orchestrator + sub-components (Header / Sidebar / SegmentList / SegmentDetailPanel).
- SequenceView `coloredZones` + `onZoneClick` + `onZoneHover` props extension.
- SequenceTab pass-through новых props.
- Drag-and-drop containers из AssemblySidebar в SequenceView (insert segment at cursor position).
- Segment range/RC/label/color edit через SegmentDetailPanel.
- Reorder segments через drag-handle в SegmentList.
- Add manual segment (footer button «+ Spacer» → empty manual segment of 5bp default, editable).
- Primer writing на assembly sequence (Ctrl+R / Ctrl+Alt+R hotkeys + onWritePrimer right-click).
- assemblyDraftPrimers slice в state.
- Cross-boundary primer visual highlight в panel.
- Assembly draft topology toggle (linear ↔ circular) в header.
- Rename assembly draft inline в header.
- Length / segment count info в header.
- MiniProjectCanvas extension: assembly drafts маркерами параллельно containers + ops.
- AssemblyDraftBlock double-click → real openEditorAssemblyTab (replaces G1 stub).
- «Realise as DAG» stub button (G2: opens info dialog).
- Tests: tab open / shell mount / DnD insert / segment edit / primer write / cross-boundary highlight / mini-canvas marker / persistence.

### OUT (G2)

- **G3 «Realise as DAG»** real algorithm.
- **Bidirectional sync** AssemblyDraft ↔ DAG ops (G4 — отложено).
- **Multiple assembly tabs одновременно** работают (F1 tab system уже multi-tab, G2 inherits).
- **Annotation editing на assembly** — annotations frozen from G1 transfer; explicit refresh action — отложено.
- **Inline edit assembly sequence** (direct typing в SequenceView) — disabled для container-sourced segments. Только manual segments editable. (Может быть relaxed позже.)
- **Inheritance segment color from parent annotations** — отложено.
- **Refresh segment from parent** action — отложено в G3+ (когда parent annotations changed, biolog хочет обновить frozen snapshot).
- **Save assembly as new container in Library** — отложено (post-G3 sprint).
- **Export to GenBank / SBOL** — отложено.
- **Assembly templates** (предустановленные shells для Gibson 3-fragment, GG 5-fragment, etc.) — отложено.
- **Undo/redo specific для assembly** — relies on existing skeleton-history; assembly actions добавляются в whitelist стандартным образом.

---

## 4. Архитектурные решения

### DEC-CANVAS-ASM-12 — tab.kind='assembly' extension

`editorContext.tabs[i].kind` принимает `'container' | 'operation' | 'assembly'`. Для kind='assembly' — `tab.assemblyDraftId: string`.

Action `OPEN_EDITOR_ASSEMBLY_TAB { draftId }`:
- Focus existing tab same-draftId если есть.
- Иначе create new tab `{id: 'tab-'+uuidv7(), kind:'assembly', assemblyDraftId, openedAt}` + activate.

Backward-compat с existing `OPEN_EDITOR_TAB { containerId }` сохраняется.

`useEditorTabContext()` API не меняется shape — но возвращает `{tabContainerId}` derived от active tab (для kind='assembly' tabContainerId = null, callers должны проверить tab.kind).

### DEC-CANVAS-ASM-13 — AssemblyModeShell как thin orchestrator

Same pattern что PcrModeShell после V71 (reuse SequenceTab + side panels + footer). Не bespoke viewer.

Layout:
```
AssemblyModeShell (flex 1, minHeight 0)
├── AssemblyHeader (top, ~50px)
├── flex row (flex 1, minHeight 0)
│   ├── SequenceTab (flex 1, минимум 600px width) — assembly sequence + coloredZones + primers
│   └── AssemblySidebar (right, 280px) — project containers list + drag source
└── SegmentList footer (bottom, ~180px) — segments table + add manual segment button
```

Resize handle между SequenceTab и AssemblySidebar — **отложено** (default 280px sidebar). Resize handle между body и footer — отложено.

### DEC-CANVAS-ASM-14 — SequenceView coloredZones opt-in

```
coloredZones?: Array<{
  start: number,        // inclusive position на sequence
  end: number,          // exclusive
  color: string,        // hex / CSS color
  label?: string,       // tooltip
  zoneId: string,       // for click handler dispatch
}>;
onZoneClick?: (zoneId: string, event: MouseEvent) => void;
onZoneHover?: (zoneId: string | null) => void;
```

Rendering:
- **Linear view** (default для assembly drafts unless circular): background fill rectangle позади nucleotides per zone. Top border 2px solid color для visual boundary между zones. Z-index ниже selection / cursor / primer track.
- **Circular view** (для circular assembly draft): arcs background.
- Hover на zone → onZoneHover fired + visual emphasize (slight darken).
- Click на zone → onZoneClick (opens SegmentDetailPanel в AssemblyModeShell).

`pointer-events: none` на zone fills (не блокирует cursor / selection). Click delegated на overlay layer.

**Back-compat:** props default `undefined` → не рендерится. Library / Importer / PcrModeShell не передают — поведение не меняется.

### DEC-CANVAS-ASM-15 — Drag-and-drop containers из sidebar в sequence

HTML5 DnD events:
- `AssemblySidebar` item: `draggable=true`, `onDragStart` ставит `dataTransfer.setData('application/x-bodge-container-id', containerId)`.
- SequenceTab / SequenceView: `onDragOver` — preventDefault если data type matches; рисует insertion indicator на cursor position (dashed vertical line). `onDrop` — fired action `insertSegment(activeDraftId, atIndex, source, start, end, rc)`.

**Default insert:**
- `source = { type: 'container', containerId }`.
- `start = 0`, `end = container.sequence.length` (full container).
- `rc = false`.
- `atIndex = inferFromCursorPosition()` — converted from cursor pos на assembly to segment index (boundary-aware: cursor между segments → insert между; cursor внутри segment → split logic OR insert before split index OR insert after — see Q1).

Биолог потом редактирует range / RC в SegmentDetailPanel.

**SequenceView extension для DnD:** new opt-in props `onDragOver` / `onDrop`. Default consumers (Library) не передают — DnD disabled.

### DEC-CANVAS-ASM-16 — Insert at cursor: default full container

Дефолт «полный контейнер вставляется на cursor position» — соответствует workflow Игоря в SnapGene (копировал кусок целиком, потом trim'ил range в редакторе). Альтернатива: при drag показать pop-up с range selector до drop — overkill для default flow.

Workflow detail:
- Drag from sidebar → drop на cursor (или near-boundary snap).
- Segment вставляется с **полным** parent sequence.
- AssemblyModeShell автоматически выделяет новую segment (highlight zone) + opens SegmentDetailPanel где biolog adjust'ит range / RC если нужно.
- Биолог может **закрыть panel** если full container ОК.

### DEC-CANVAS-ASM-17 — Cursor position → segment boundary detection

`onDrop` логика:
```
cursorPosOnAssembly = SequenceView reports drop x → maps to position on sequence
findBoundary(cursorPos, segments):
  - if cursor <= 0: atIndex = 0 (insert before first)
  - if cursor >= assembly.length: atIndex = segments.length (insert after last)
  - else: find segment containing cursor, snap to nearest boundary (start or end of that segment)
return atIndex
```

**Insert никогда не splits существующий segment** — biolog должен явно adjust range existing segment если хочет «вставить внутрь». Snap-to-boundary — predictable.

Альтернатива: drop в middle of segment → split на два с new segment между. Сложнее UX (биолог не ожидает auto-split). Не делаем.

### DEC-CANVAS-ASM-18 — Cross-boundary primer detection

Primer написан на assembly с `range: {start, end}`. После write — `lib/assembly-primer-utils::detectCrossBoundary(range, segmentBoundaries)`:
- Returns array of segments crossed.
- Если ≥ 2 — это cross-boundary primer (потенциальный junction primer).

Visual в `PrimerSuggestionsPanel`:
- Cross-boundary primer получает icon ⚡ + tooltip «Покрывает границу: <colorA → colorB>». 
- В list сортируется на верх (важнее обычных PCR primers).
- Подсказка биологу: «Это потенциальный junction primer для Gibson/overlap сборки. G3 Realise сгенерирует op + junction».

### DEC-CANVAS-ASM-19 — assemblyDraftPrimers slice

```
state.assemblyDraftPrimers: { [draftId: string]: Primer[] }

Primer = {
  id: 'asmprm-' + uuidv7(),
  draftId: string,
  range: { start: number, end: number },  // на assembly sequence
  direction: 'forward' | 'reverse',
  sequence: string,                        // final ordered oligo string
  bindingSequence: string,                 // для PrimerTrack matching
  tm: number,                              // computed via tm-calculator
  name: string,                            // auto: 'asm-fwd-{N}' / 'asm-rev-{N}'
  source: 'manual' | 'auto' | 'imported',
  notes?: string,                          // user-editable
  createdAt: number,
  // cross-boundary metadata (derived но cached для performance):
  crossesBoundaries?: string[],            // segment IDs crossed
}
```

Actions:
- `WRITE_ASSEMBLY_PRIMER { draftId, range, direction, source }` — recomputes binding from range, computes Tm, creates primer, adds to slice.
- `REMOVE_ASSEMBLY_PRIMER { draftId, primerId }`.
- `UPDATE_ASSEMBLY_PRIMER_NAME { draftId, primerId, name }`.
- `UPDATE_ASSEMBLY_PRIMER_NOTES { draftId, primerId, notes }`.
- (G3 future: PROMOTE_ASSEMBLY_PRIMER_TO_OP — после Realise.)

Persistence: assemblyDraftPrimers сохраняется через debouncedSaver, schema bump из G1 уже handles.

### DEC-CANVAS-ASM-20 — Primer writing reuse F3 V72 mechanism

Ctrl+R / Ctrl+Alt+R hotkeys через existing `lib/hotkeys.js` `pcr-primer-forward` / `pcr-primer-reverse` registered. **Та же id**, lifecycle через AssemblyModeShell mount.

Но action dispatch разный: PcrModeShell → `opSetUserPrimers`; AssemblyModeShell → `writeAssemblyPrimer`. Hotkey resolver видит зарегистрированный handler от currently-mounted shell (PcrModeShell ИЛИ AssemblyModeShell, не оба одновременно — discriminated по tab.kind).

Альтернатива: новые hotkey IDs (`assembly-primer-forward` / `assembly-primer-reverse`). Чище, но user-facing один hotkey = одно действие («написать прямой праймер»), независимо от context. Take A (один ID, разный handler).

`onWritePrimer` prop в SequenceView — тот же; AssemblyModeShell передаёт handler который вызывает `writeAssemblyPrimer`.

### DEC-CANVAS-ASM-21 — AssemblySidebar — flat list containers проекта

Отображает containers from `state.containers` (current project). Простой scrollable list. Each item:
- Mini-plasmid-map preview (60×40px).
- Container name.
- Length info.
- Topology icon (circle/line).
- `draggable=true` → drag source.

Filter input (single text field) сверху — case-insensitive match по name + по annotation labels.

**НЕ показывает:**
- Containers other projects.
- Operations.
- Library tree structure / folders.

Если biolog хочет добавить container который не в текущем проекте — должен сначала добавить его в проект через Library (existing flow). Соответствует current project scoping (DEC-V2-08).

Альтернатива: показывать all Library tree с tabs «текущий проект / коллекция / другие». Overkill для G2; default Игорь работает с containers в active project.

### DEC-CANVAS-ASM-22 — Segment edits через SegmentDetailPanel

Right-side drawer (slides over SequenceTab right edge). Opens:
- On click zone в SequenceView (через onZoneClick).
- On click row в SegmentList footer.
- On insert new segment (auto-open).

Fields:
- **Source** (read-only): «From container X» / «Manual» / «Imported». Click → opens parent container в new tab (если container).
- **Range** (editable for container source): start / end numeric inputs. Validation 0 ≤ start < end ≤ parent.length.
- **RC toggle** (checkbox).
- **Label** (text input, optional).
- **Color** (color picker swatches — 12 palette colors + custom).
- **Length info** (read-only): «N bp».
- **Annotations** (collapsible list, read-only): annotations transferred from parent. Future: refresh button.
- **Delete segment** button (с confirm).

Apply change → dispatch action (`updateSegmentRange` etc.). SequenceView mini-update via reactive state.

### DEC-CANVAS-ASM-23 — Realise as DAG button stub

Header right side: `[🔄 Realise as DAG]` button. В G2 click → opens info dialog:

> «Realise as DAG — algorithm reverses your assembly draft into PCR operations + junctions + primers, placed on canvas. Coming in next sprint (G3). For now you can plan your assembly здесь; finished workflow available after G3.»

Кнопка disabled if draft.segments.length === 0.

### DEC-CANVAS-ASM-24 — MiniProjectCanvas extension для assembly drafts

`MiniProjectCanvas` (F1) рендерит:
- Containers (existing).
- Operations (existing, rhombi).
- **NEW: Assembly drafts** — rectangle с иконкой 🧬 (или просто distinct color/shape). Size ~10×8 px. Click → switch tab to that assembly's editor tab (if open), else openEditorAssemblyTab.

Active state highlight (если current tab.kind='assembly' и tab.assemblyDraftId matches) — accent stroke / fill.

Опционально (если эстетически чисто): для assembly draft показать N маленьких colored squares внутри rectangle reflecting first N segments — biolog видит миниатюру segments в mini-canvas. **TODO для G2** (если не помещается визуально — пропускаем для простоты, segments видны только в polnoramnom editor).

---

## 5. Файлы и сигнатуры

### Новые файлы

**`editor/assembly-mode/AssemblyModeShell.jsx`** (~10-12 KB)

```jsx
function AssemblyModeShell({ draftId }) {
  const draft = useSkeletonState(s => selectAssemblyDraftById(s, draftId));
  const sequence = useSkeletonState(s => selectAssemblyDraftSequence(s, draftId));
  const boundaries = useSkeletonState(s => selectSegmentBoundaries(s, draftId));
  const primers = useSkeletonState(s => s.assemblyDraftPrimers[draftId] || []);
  const annotations = useSkeletonState(s => selectAssemblyDraftAnnotations(s, draftId));
  
  // local state
  const [caretPos, setCaretPos] = useState(0);
  const [caretAnchor, setCaretAnchor] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [realiseDialogOpen, setRealiseDialogOpen] = useState(false);
  
  // coloredZones derived from boundaries
  const coloredZones = useMemo(() => boundaries.map(b => ({
    start: b.startOnAssembly, end: b.endOnAssembly,
    color: b.color, label: b.label, zoneId: b.segmentId,
  })), [boundaries]);
  
  // primer writing handlers (mirror PcrModeShell from F3 V72)
  const writePrimerForRange = useCallback((direction, lo, hi) => {
    if (!draft || hi - lo < 18) {
      actions.showToast({ kind:'warning', message:'Участок слишком короткий' });
      return;
    }
    actions.writeAssemblyPrimer({ draftId, range:{start:lo, end:hi}, direction, source:'manual' });
  }, [draft, draftId, actions]);
  
  useHotkey('pcr-primer-forward', () => writePrimerForRange('forward', ...));
  useHotkey('pcr-primer-reverse', () => writePrimerForRange('reverse', ...));
  
  // DnD handlers
  const onDrop = useCallback((e, dropPos) => {
    const containerId = e.dataTransfer.getData('application/x-bodge-container-id');
    if (!containerId) return;
    const atIndex = findInsertIndexAtPosition(dropPos, boundaries);
    actions.insertSegment(draftId, atIndex, { type:'container', containerId },
                          0, container.sequence.length, false);
  }, [draftId, boundaries, actions]);
  
  // PrimerTrack-format primers для SequenceView render
  const viewerPrimers = useMemo(() => primers.map(p => ({
    name: p.name, sequence: p.sequence, bindingSequence: p.bindingSequence,
    direction: p.direction, tmBinding: p.tm,
    crossesBoundaries: p.crossesBoundaries,  // for visual emphasize
  })), [primers]);
  
  return (
    <div data-testid="assembly-mode-shell" data-draft-id={draftId} style={...}>
      <AssemblyHeader draft={draft} length={sequence.length}
                      onRename={...} onToggleTopology={...} onRealise={...} />
      <div style={{flex:1, display:'flex'}}>
        <div style={{flex:1, minWidth:0, padding:12, display:'flex', flexDirection:'column'}}>
          <SequenceTab
            sequence={sequence}
            annotations={annotations}
            topology={draft?.topology?.circular ? 'circular' : 'linear'}
            name={draft?.name}
            editable={false}
            isReadOnlyZone={false}
            caretPos={caretPos}
            caretAnchor={caretAnchor}
            onCaretChange={setCaretPos}
            onSelectRange={(s,e,m,strand) => { setCaretAnchor(s); setCaretPos(e); }}
            onWritePrimer={({direction,start,end}) => writePrimerForRange(direction, start, end)}
            showSelectionTm
            primers={viewerPrimers}
            coloredZones={coloredZones}
            onZoneClick={(zoneId) => { setSelectedSegmentId(zoneId); setDetailPanelOpen(true); }}
            onZoneHover={setHoveredSegmentId}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={onDrop}
          />
        </div>
        <AssemblySidebar projectContainers={...} onDragStart={...} />
        {detailPanelOpen && <SegmentDetailPanel segmentId={selectedSegmentId}
                                                draftId={draftId}
                                                onClose={() => setDetailPanelOpen(false)} />}
      </div>
      <SegmentList draftId={draftId} draft={draft}
                   selectedSegmentId={selectedSegmentId}
                   hoveredSegmentId={hoveredSegmentId}
                   onSegmentClick={setSelectedSegmentId}
                   onAddManual={...} onReorder={...} />
      {realiseDialogOpen && <RealiseAsDagButton draftId={draftId}
                                                onClose={() => setRealiseDialogOpen(false)} />}
    </div>
  );
}
```

**`editor/assembly-mode/AssemblyHeader.jsx`** (~3 KB)

`AssemblyHeader({ draft, length, onRename, onToggleTopology, onRealise })`.

Layout:
- Left: InlineEditableTitle (existing component, reuse from Library) — draft name.
- Center: text info «{length} bp · {N} segments · {circular|linear}».
- Right: topology toggle button + «🔄 Realise as DAG» button (disabled if segments=[]).

**`editor/assembly-mode/AssemblySidebar.jsx`** (~5-6 KB)

`AssemblySidebar({ projectContainers, filter, onFilterChange })`.

Layout:
- Top: filter input.
- Scrollable list: `<div draggable onDragStart={...}>` для каждого container, mini-map preview.
- Empty state: «No containers in project. Add via Library».

Read `state.containers` filtered by current project (via existing pattern, see Q2).

**`editor/assembly-mode/SegmentList.jsx`** (~5-6 KB)

`SegmentList({ draftId, draft, selectedSegmentId, hoveredSegmentId, onSegmentClick, onAddManual, onReorder })`.

Layout:
- Header: «Segments» + button «+ Spacer» (adds manual segment with empty sequence, editable inline).
- Table:
  ```
  | # | Color | Source | Range | Length | RC | Label | Actions |
  ```
- Each row: clickable, drag-handle on left, click → selectSegmentId, dblclick → opens detail panel.
- Hover state syncs с zone hover в SequenceView.
- Reorder via drag-handle (existing pattern from Library tree reorder?).

**`editor/assembly-mode/SegmentDetailPanel.jsx`** (~4-5 KB)

Right-side drawer. Fields per DEC-CANVAS-ASM-22.

```jsx
function SegmentDetailPanel({ segmentId, draftId, onClose }) {
  const segment = useSkeletonState(s => 
    s.assemblyDrafts.find(d => d.id === draftId)?.segments.find(seg => seg.id === segmentId));
  const parent = useSkeletonState(s => 
    segment?.source?.type === 'container'
      ? s.containers.find(c => c.id === segment.source.containerId)
      : null);
  
  // controlled state for editing
  const [localStart, setLocalStart] = useState(segment?.start ?? 0);
  // ... etc.
  
  const applyRange = () => actions.updateSegmentRange(draftId, segmentId, localStart, localEnd);
  // ... etc.
  
  return (
    <aside data-testid="segment-detail-panel" style={{position:'absolute', right:0, top:0, bottom:0, width:320, background:'var(--surface-2)', borderLeft:'1px solid var(--border-subtle)', padding:16, zIndex:20}}>
      <header>...</header>
      <field>Source: {segment.source.type}...</field>
      {parent && <div>From: {parent.name}</div>}
      <field>Range: <input value={localStart} ... /> .. <input value={localEnd} ... /></field>
      <field><label><input type="checkbox" checked={localRc} ... /> RC</label></field>
      <field>Label: <input value={localLabel} ... /></field>
      <field>Color: <ColorPicker ... /></field>
      <details><summary>Annotations ({segment.annotations.length})</summary>
        <ul>{segment.annotations.map(a => <li>{a.name} · {a.start}-{a.end}</li>)}</ul>
      </details>
      <button onClick={applyRange}>Apply</button>
      <button onClick={() => actions.removeSegment(draftId, segmentId)}>Delete</button>
      <button onClick={onClose}>Close</button>
    </aside>
  );
}
```

**`editor/assembly-mode/RealiseAsDagButton.jsx`** (~1 KB, stub)

`RealiseAsDagButton({ draftId, onClose })`. Просто info dialog для G2.

**`lib/assembly-primer-utils.js`** (~3-4 KB)

```js
export function detectCrossBoundary(range, segmentBoundaries) {
  // returns array of segment IDs crossed by [range.start, range.end)
  const crossed = [];
  for (const b of segmentBoundaries) {
    if (b.startOnAssembly < range.end && b.endOnAssembly > range.start) {
      crossed.push(b.segmentId);
    }
  }
  return crossed;
}

export function deriveAssemblyPrimer(assemblySequence, range, direction) {
  // takes range on assembly, direction; returns binding sequence + Tm
  const slice = assemblySequence.slice(range.start, range.end);
  const binding = direction === 'forward' ? slice : reverseComplement(slice);
  const tm = calcTm(binding);
  return { sequence: binding, bindingSequence: binding, tm };
}

export function findInsertIndexAtPosition(cursorPosOnAssembly, segmentBoundaries) {
  // converts cursor pos to atIndex (segments array insertion index)
  // snap to nearest boundary
  if (segmentBoundaries.length === 0) return 0;
  if (cursorPosOnAssembly <= 0) return 0;
  const lastBoundary = segmentBoundaries[segmentBoundaries.length - 1];
  if (cursorPosOnAssembly >= lastBoundary.endOnAssembly) return segmentBoundaries.length;
  // find segment containing cursor, snap
  for (let i = 0; i < segmentBoundaries.length; i++) {
    const b = segmentBoundaries[i];
    if (cursorPosOnAssembly >= b.startOnAssembly && cursorPosOnAssembly < b.endOnAssembly) {
      // snap: if closer to start → insert before (atIndex = i), else after (atIndex = i+1)
      const midpoint = (b.startOnAssembly + b.endOnAssembly) / 2;
      return cursorPosOnAssembly < midpoint ? i : i + 1;
    }
  }
  return segmentBoundaries.length;
}
```

### Существующие файлы — изменения

**`Library/sequence-view/SequenceView/index.jsx`** (~+1.5-2.5 KB)

New opt-in props per DEC-CANVAS-ASM-14:
- `coloredZones?` → render background fills.
- `onZoneClick?` / `onZoneHover?` → click/hover handlers.
- `onDragOver?` / `onDrop?` → DnD passthrough.

Rendering coloredZones: новый layer `<g data-testid="sequence-view-zones">` под main sequence, above background. Linear: `<rect>` per zone. Circular: `<path>` arc per zone (reuse existing arc-drawing utility).

Z-index order (bottom to top): background → coloredZones → sequence text → annotations track → primers track → selection overlay → cursor.

**`Library/inspector/tabs/SequenceTab.jsx`** (~+0.3-0.5 KB)

Pass-through coloredZones / onZoneClick / onZoneHover / onDragOver / onDrop.

**`editor/ContainerEditorSkeleton.jsx`** (~+0.5-1 KB)

Gate:
```jsx
if (tab.kind === 'assembly') {
  return <AssemblyModeShell draftId={tab.assemblyDraftId} />;
}
if (tab.kind === 'operation') {
  return <PcrModeShell op={...} />;  // existing F3
}
// existing container view
```

**`editor/EditorTabStrip.jsx`** (~+0.5 KB)

Breadcrumb format:
- kind='container' → `📦 {container.name}` + 🔒 if frozen.
- kind='operation' → `🔬 {op.kind name} · {inputs joined}`.
- kind='assembly' → `🧬 {draft.name}`.

**`canvas/AssemblyDraftBlock.jsx`** (~+0.3 KB, G1 stub → real)

```jsx
onDoubleClick={() => actions.openEditorAssemblyTab(draft.id)}
```

**`canvas/MiniProjectCanvas.jsx`** (~+0.5-1 KB)

Render assembly drafts параллельно containers + ops. Iterate `state.assemblyDrafts`, для каждого rectangle marker (distinct from container's). Click → switch tab если открыт, иначе openEditorAssemblyTab.

**`store/skeleton-state-editor.js`** (~+1.5 KB)

- editorContext.tabs[].kind extension на 'assembly'.
- tab.assemblyDraftId field.
- `OPEN_EDITOR_ASSEMBLY_TAB { draftId }` reducer case (DEC-ASM-12).
- `CLOSE_EDITOR_TAB` extended: если tab.kind='assembly' — handled same as other kinds.

**`store/skeleton-state-assembly.js`** (~+2-3 KB extension after G1)

`assemblyDraftPrimers` slice + reducer cases:
- `WRITE_ASSEMBLY_PRIMER { draftId, range, direction, source }` — computes primer (binding + Tm) via `lib/assembly-primer-utils::deriveAssemblyPrimer`, adds to slice. Cross-boundary detection runs here too (sets crossesBoundaries cache).
- `REMOVE_ASSEMBLY_PRIMER { draftId, primerId }`.
- `UPDATE_ASSEMBLY_PRIMER_NAME / NOTES`.

`REMOVE_ASSEMBLY_DRAFT` cascade — clears assemblyDraftPrimers[draftId].

**`store/skeleton-context.jsx`** (~+1 KB)

```js
openEditorAssemblyTab(draftId),
writeAssemblyPrimer({draftId, range, direction, source}),
removeAssemblyPrimer(draftId, primerId),
updateAssemblyPrimerName(draftId, primerId, name),
updateAssemblyPrimerNotes(draftId, primerId, notes),
```

### Тесты

Файл `__tests__/canvas-skeleton/assembly-mode.test.jsx` (~12-15 KB).

Покрытие:

1. **tab.kind='assembly' → AssemblyModeShell mounted** — OPEN_EDITOR_ASSEMBLY_TAB → tab created → ContainerEditorSkeleton renders AssemblyModeShell.
2. **AssemblyHeader renders** — name editable, length, topology toggle.
3. **SequenceTab receives coloredZones** prop with boundaries from G1 selector.
4. **AssemblySidebar lists project containers** — filter input filters by name.
5. **Drag container from sidebar → drop on SequenceView** — insertSegment dispatched with correct atIndex и parent sequence.
6. **Drop at cursor=0** → atIndex=0. Drop at cursor=end → atIndex=segments.length.
7. **Drop in middle of segment** → snap to nearest boundary.
8. **Insert new segment auto-opens SegmentDetailPanel** — user может adjust range immediately.
9. **SegmentDetailPanel — range edit** dispatches updateSegmentRange.
10. **SegmentDetailPanel — RC toggle** dispatches toggleSegmentRc.
11. **SegmentDetailPanel — color picker** dispatches updateSegmentColor.
12. **SegmentDetailPanel — delete** dispatches removeSegment.
13. **SegmentList renders all segments** with correct columns.
14. **SegmentList — click row** opens detail panel.
15. **SegmentList — drag-handle reorder** dispatches reorderSegments.
16. **«+ Spacer» button** adds manual segment (default sequence 'AAAAA', editable in detail panel).
17. **Primer writing — Ctrl+R** на selection → writeAssemblyPrimer dispatched with direction='forward'.
18. **Primer writing — Ctrl+Alt+R** → direction='reverse'.
19. **Primer writing — onWritePrimer (context menu)** — same result.
20. **Cross-boundary primer detection** — primer range spanning 2 segments → crossesBoundaries populated → ⚡ icon в panel.
21. **PrimerSuggestionsPanel renders assembly primers** — sorted (cross-boundary first), each with source tag.
22. **«Realise as DAG» button** disabled if segments=[]. Click → info dialog open (stub).
23. **MiniProjectCanvas renders assembly drafts** — additional markers параллельно containers+ops.
24. **MiniProjectCanvas click on assembly marker** → openEditorAssemblyTab or switch tab.
25. **Persistence round-trip** — primers preserved on reload.
26. **Tab close → assembly state preserved** — re-open shows same state (G1 already covers state; G2 verifies tab does not lose primer panel content).
27. **EditorTabStrip breadcrumb** для assembly tab format correct.
28. **F3 PcrModeShell не задет** — открытие PCR op tab все ещё работает.
29. **Library / Importer SequenceView** не показывает coloredZones (back-compat).

---

## 6. Порядок выполнения

### K1 — SequenceView coloredZones extension

- Add opt-in props `coloredZones`, `onZoneClick`, `onZoneHover`.
- Linear rendering layer.
- Circular rendering layer (arcs).
- z-index order correct.
- Pointer-events для click delegation.
- Tests #3 + back-compat #29.

### K2 — F1 tab.kind='assembly' extension

- editorContext.tabs[].kind extension.
- OPEN_EDITOR_ASSEMBLY_TAB action.
- ContainerEditorSkeleton gate.
- EditorTabStrip breadcrumb.
- Tests #1, #27.

### K3 — AssemblyModeShell + SequenceTab integration

- AssemblyModeShell skeleton (header + body + footer placeholders).
- SequenceTab mounted с coloredZones from G1 selectors.
- AssemblyHeader (name, length, topology, realise button).
- Tests #2.

### K4 — AssemblySidebar + DnD

- AssemblySidebar component.
- HTML5 DnD handlers (dragstart on sidebar items, dragover/drop on SequenceView via passthrough props).
- SequenceView opt-in onDragOver / onDrop.
- AssemblyModeShell wires drop to insertSegment.
- Auto-open SegmentDetailPanel for new segment.
- Tests #4-8.

### K5 — SegmentList footer + SegmentDetailPanel

- SegmentList component (table + reorder + add manual).
- SegmentDetailPanel component (range / RC / color / label / delete).
- Hover/select sync с SequenceView.
- Tests #9-16.

### K6 — Primer writing on assembly

- `lib/assembly-primer-utils.js` (detectCrossBoundary, deriveAssemblyPrimer, findInsertIndexAtPosition).
- assemblyDraftPrimers slice + actions.
- Reuse Ctrl+R / Ctrl+Alt+R hotkeys (same IDs от F3 V72).
- onWritePrimer wire через SequenceView (same prop as F3 V74).
- PrimerSuggestionsPanel rendering assembly primers (с cross-boundary highlight).
- Tests #17-21.

### K7 — Realise stub + MiniProjectCanvas extension

- RealiseAsDagButton (stub info dialog).
- MiniProjectCanvas renders assembly drafts markers.
- AssemblyDraftBlock double-click → real openEditorAssemblyTab.
- Tests #22-24.

### K8 — Persistence + regression

- Verify all new state (tabs.kind, assemblyDraftPrimers) saved via debouncedSaver.
- Reload test.
- F3 PcrModeShell regression (#28).
- Tests #25-26.

### K9 — Cleanup

- Lint / build clean.
- Размеры под budget.
- Финальный отчёт.

**STOP после K9.** Не финализирует координационные файлы.

---

## 7. STOP-условие и формат отчёта

Идентично F1/F2/F3 (size budget + tests count + DECISIONS sprint-block draft 13 DEC-CANVAS-ASM-NN (extension G1) + manual smoke + отклонения).

**Manual smoke (полный workflow):**

1. Click «+ Сборка» на canvas → block появляется.
2. Double-click block → editor tab opens с AssemblyModeShell.
3. AssemblySidebar показывает 2-3 containers project'а.
4. Drag container A → drop в виде на cursor 0 → segment появляется. Detail panel opens auto.
5. Apply default full range. Detail panel closes.
6. Drag container B → drop в конце → segment 2 появляется.
7. Toggle RC segment 2 в detail panel → sequence flipped.
8. SequenceView показывает 2 цветные zones, segments table — 2 rows.
9. Select region spanning boundary segment1/segment2 → Ctrl+R → primer written, ⚡ icon в panel.
10. Click «Realise as DAG» → info dialog «coming in G3».
11. Reload → state preserved.

---

## 8. Риски

### R-DEPENDS-ON-G1-F1-F3 — G2 build'ится на G1 + F1 + F3 V71-V72

Митигация: G2 опирается на стабильные API (F1 tab system, F3 V71 SequenceView reuse pattern, F3 V72 hotkey decoupled write). После G1 acceptance — G2 review против actual G1 implementation до Code-сессии.

### R1 — SequenceView raздувается за hard 40 KB

`SequenceView/index.jsx` сейчас ~39 KB. G2 extension +1.5-2.5 KB → может перейти hard 40 KB. **Декомпозиция SequenceView — отдельный sprint после G2 если K1 разведка покажет рост >2.5 KB.**

Альтернатива: extension через wrapper component `<SequenceViewWithZones>` (опциональный wrapper, делегирует на base). Сложнее integration. Take direct extension первым шагом; декомпозиция на second pass если нужно.

### R2 — HTML5 DnD события flaky cross-browser

HTML5 DnD имеет известные particularitäten (firefox требует setData even on no-op). Митигация: K4 explicit tests + manual cross-browser smoke (Chrome / Firefox / Safari).

Альтернатива: react-dnd library — overkill для G2 simple case. Native API достаточно.

### R3 — Cross-boundary primer false positive

Primer range спан 2 segments — но если этот primer **не на границе** а просто длинный (purely within segment 1 + few bp into segment 2 без overlap purpose) — он detected как cross-boundary но biolog не имел того intent.

Митигация: визуальный highlight только flag — biolog решает значение. Tooltip объясняет «Покрывает границу X→Y. Это может быть junction primer для overlap-PCR сборки. Используется в G3 Realise». Не блокирует написание primer'ов, не auto-changes anything.

### R4 — Drop в middle of segment — ambiguous UX

DEC-ASM-17 snap-to-boundary — но biolog может expect split semantics. Митигация: smoke test показывает clear visual (insertion line на boundary, не на cursor middle). Если ожидание split — биолог может явно split manually (УДАЛИТЬ existing segment + INSERT 3 segments: pre-cursor part / new content / post-cursor part). Это редкий workflow.

### R5 — Реordering segments через drag-handle в footer table

UI drag-and-drop reorder в table — нетривиально (HTML5 DnD на row level, индикаторы insertion position). Pattern existing — есть ли в Library tree reorder? Если нет — K5 имеет ad-hoc реализацию.

Митигация: альтернатива — up/down кнопки в каждой row для reorder (без DnD). Проще. Take DnD если pattern существует; up/down если нет.

### R6 — AssemblyModeShell файл размер

10-12 KB target. Если orchestration выходит за 15 KB — декомпозировать (Header / Sidebar / SegmentList / DetailPanel уже отдельные; main shell — handlers + integration).

---

## 9. Открытые вопросы — закрыты дефолтами 15.05.2026

### Q1 — Drop в middle of segment

Дефолт (DEC-ASM-17): snap to nearest boundary, not split. Биолог явно split'ит если хочет.

Альтернативы: (A) split на 3 segments. (B) reject drop в middle of segment (only at boundaries). 

Take snap. Простая UX.

### Q2 — Sidebar — containers текущего проекта только?

Дефолт (DEC-ASM-21): containers в текущем проекте. Если biolog хочет другой проект — добавляет container в активный проект через Library.

Альтернатива: tabs «Project / Loose / Other projects» в sidebar. Overkill для G2 MVP.

Take current project only. Сompound source workflows через explicit add to project.

### Q3 — Reuse LibraryTree в AssemblySidebar?

Дефолт: отдельный flat list (AssemblySidebar). Простая компонента.

Альтернатива: reuse LibraryTree через `compact={true}` + `enableDragSource={true}` props. Cleaner reuse но требует API changes в LibraryTree (новые props default false).

Take отдельный flat list для G2. Refactor если паттерн повторится в Mutagenesis/Restriction/Gibson sidebars (вряд ли — те modes не имеют sidebar).

### Q4 — Hotkey ID — same as PCR или новый?

Дефолт (DEC-ASM-20): same ID (`pcr-primer-forward` / `pcr-primer-reverse`). Discriminated через lifecycle (PcrModeShell vs AssemblyModeShell, не одновременно). User-facing Ctrl+R = «написать прямой» независимо от mode.

Альтернатива: новые IDs (`assembly-primer-forward` / `assembly-primer-reverse`). Чище инфраструктурно, но дублирует user-facing meaning.

Take same ID. Hotkey scheme проще для биолога.

### Q5 — «Realise as DAG» button position

Дефолт (DEC-ASM-23): top-right в AssemblyHeader. Виден сразу.

Альтернатива: footer right (рядом с «+ Spacer»). Менее prominent.

Take header. Главное action для assembly workflow.

### Q6 — onZoneClick — opens SegmentDetailPanel inline или separate dialog?

Дефолт (DEC-ASM-22): right-side drawer (slide-in), не отдельное modal окно. SegmentDetailPanel sits внутри AssemblyModeShell.

Альтернатива: modal окно poверх. Прерывает workflow.

Take drawer.

### Q7 — Inline edit assembly sequence (typing nucleotides) — разрешено?

Дефолт (DEC-ASM-16 from G1): только manual segments editable inline. Container-sourced segments read-only sequence (range/RC/label editable).

Альтернатива: inline edit any nucleotide → если внутри container segment — auto-split segment в три (pre + inserted manual + post). Сложно.

Take strict G1 default (only manual segments editable inline).

---

## Acceptance gate

После Code commit + STOP — compact + новая chat-сессия.

- Click «+ Сборка» на canvas → AssemblyDraftBlock появляется.
- Double-click block → editor tab opens с AssemblyModeShell. Breadcrumb 🧬 правильный.
- Sidebar показывает containers проекта. Filter работает.
- Drag container в SequenceView → segment появляется. Detail panel auto-opens.
- Detail panel: range adjust → sequence updates в viewer. RC toggle → sequence flipped. Color change → zone color updates.
- 2-3 segments → SequenceView показывает coloured zones корректно.
- Ctrl+R / Ctrl+Alt+R + selection → primer written, виден в panel + ⚡ если cross-boundary.
- onWritePrimer (right-click context menu) — same.
- Realise button → info dialog stub.
- MiniProjectCanvas показывает assembly drafts маркером.
- Reload — все preserved (segments, primers, tab open).
- F3 PcrModeShell не задет — открытие PCR op tab все ещё работает.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после G1 acceptance.
_Acceptance:_ отдельная chat-сессия.
