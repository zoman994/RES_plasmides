> **[ARCHIVED 2026-05-16 — D1 disposition]** G1 — вторая попытка A1. Был
> вторым input'ом для Code merge stage в A1. Merge plan зафиксирован,
> реализовано в `docs/SPRINT_M-CANVAS-ASSEMBLY-MODEL.md` (A1, naming
> assemblyDrafts / discriminated source union из G1). Сохранено как история.

# SPRINT M-CANVAS-ASSEMBLY-DATA — Assembly Draft Data Model (G1)

**Дата спеки:** 15.05.2026 (вечер, после walkthrough'а assembly workflow Игоря в SnapGene).
**Тип:** A.
**Target размер спеки:** ~27 KB.
**Источник:** Чат-сессия 15.05.2026 (текущая, после bug-bash V58-V76). Walkthrough: «беру плазмиду, копирую кусок, вставляю, потом второй, RC если надо, третий, складываю конструкцию по кускам, потом overlap-PCR до разумного числа, дальше Gibson/рекомбиназа».
**Цепочка:** G1 (этот sprint — data model) → G2 Assembly View + Primer Writing → G3 Reverse-DAG Algorithm → (опционально G4 bidirectional sync DAG↔Assembly).
**Статус:** черновик Chat 15.05.2026, реализуется после стабилизации F1-F4 acceptance + V71-V76 cleanup (H spec).
**Зависимости:** опирается на schema-bump infrastructure F2 (`SCHEMA_VERSION` migration chain). Не зависит от F3/F4 реализации.

---

## Контекст и зачем эта спека вообще

Walkthrough вскрыл фундаментальный gap в моих F1-F4 спеках: я строил их под workflow «DAG-first» — биолог расставляет операции на canvas, настраивает junction'ы, исполняет. **Это не workflow Игоря в SnapGene.** Игорь работает «assembly-sequence-first»: копирует куски ДНК в новый документ, складывает финальную конструкцию буквами в одной строке, потом смотрит на границы и подбирает primers. PCR + ops + junctions — обратная задача, derived из готовой sequence.

«Цепь блоков» которую Игорь упоминал — это **continuous linear sequence в редакторе** с coloured zones по происхождению, не batch wizard поверх DAG. Это другая первичная сущность.

G1 добавляет эту сущность — `AssemblyDraft` — в data model. G2 строит viewer. G3 — алгоритм «Realise as DAG» который реверсит assembly в plan operations + junctions + primers.

**Без G1-G3 канвас не покрывает основной workflow primary user'а (Игорь).** F1-F4 закрывают use case «isolated PCR / single op execute» (полезно, но вторично). Assembly workflow — primary.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Действие в G1 |
|---|---|---|
| `store/skeleton-state.js` | 15.04 KB | +0.5 KB (router включает assembly sub-reducer) |
| `store/skeleton-context.jsx` | 10.58 KB | +1-1.5 KB (assembly actions exposed) |
| `store/skeleton-persistence.js` | 6.88 KB | +0.5 KB (schema bump + migrate) |
| `canvas/CanvasLayoutView.jsx` | 34.36 KB | Watch | +0.5-1 KB (render assemblyDrafts параллельно containers) |

Новые файлы:
- `store/skeleton-state-assembly.js` — assembly reducer, ~6-8 KB.
- `store/selectors-assembly.js` — sequence concat, boundaries, annotations aggregation, ~3-4 KB.
- `lib/segment-color-palette.js` — 12-color palette, ~1-2 KB.
- `lib/segment-annotation-transfer.js` — annotation copy at insert (in-range filter + coords adjust + RC handling), ~2-3 KB.
- `canvas/AssemblyDraftBlock.jsx` — read-only visual block on canvas, ~5-7 KB.

Все новые файлы под soft limit. CanvasLayoutView остаётся в Watch — net change minor.

---

## 1. Контекст и связи перед действием (§17 R4)

### Где задача сядет

- **`state` shape расширение** — новое поле `state.assemblyDrafts: AssemblyDraft[]` параллельно `state.containers`, `state.operations`, `state.junctions`. AssemblyDraft — это **четвёртая первичная сущность** канваса.
- **`store/skeleton-state.js::reducer` router** добавляет `assemblyReducer` sub-reducer для assembly action types. Pattern same as existing canvasReducer / operationsReducer / editorReducer.
- **`store/skeleton-persistence.js::SCHEMA_VERSION`** bump (v_N → v_N+1 где N — текущая после F2 migration или после R12). Migration adds `assemblyDrafts: []` to existing state. Backward-compat: state без поля → default empty array.
- **`canvas/CanvasLayoutView.jsx`** дополнительно рендерит `<AssemblyDraftBlock />` для каждого `state.assemblyDrafts[i]`. Не trogает existing containers / operations / junctions rendering.
- **`canvas/AssemblyDraftBlock.jsx`** новый — visual блок на canvas, показывает миниатюрную preview assembly sequence с coloured zones. Click → tab open (G2 implementation; в G1 stub).
- **`lib/segment-color-palette.js`** — палитра 12 цветов для авто-назначения segments. Stable hash from segment.id для consistency после reorder.
- **`lib/segment-annotation-transfer.js`** — pure function `transferAnnotations(parent, start, end, rc)` — копирует только annotations пересекающие range, координаты adjusted в segment-local, RC применяет reverse-complement transform.

### Что НЕ задеваем в G1

- **Editor / tabs / SequenceView** — без изменений. AssemblyDraft в G1 — read-only block на canvas, double-click stub (real editor в G2).
- **Operations / junctions / containers** state — без изменений. AssemblyDraft существует параллельно, не interfere'ит.
- **Algorithm core** (`local-primer-design`, `mutagenesis`, `golden-gate`, etc.) — без изменений.
- **F1 tab system, F2 junction contract, F3 PCR mode, F4 virtual products** — без изменений. G1 — отдельная сущность не связана с DAG-flow.
- **Library / Importer / StartScreen** — без изменений.

### Дубли check (§17 R1)

- **AssemblyDraft vs Container.** Поверхностно похожи (имеют sequence, могут показываться на canvas). Различия фундаментальные:
  - Container = **single source** ДНК-объект (плазмида / oligo / fragment). Single sequence string.
  - AssemblyDraft = **composite synthetic** конструкция из N segments. Каждый segment ссылается на source container с range.
  - Container immutable после import (правки — через ops). AssemblyDraft mutable в редакторе (биолог двигает segments, меняет range, переставляет порядок).
  - Container = node в DAG (вход/выход ops). AssemblyDraft = НЕ node в DAG (она конечная сущность; G3 realisation создаст ops из неё, но draft сам не участвует в graph).
- **AssemblyDraft vs Operation.** Operation = действие (PCR, Gibson, cut). AssemblyDraft = data (синтетическая последовательность). Не дубль.
- **AssemblyDraft vs SequenceView selection в Library.** Selection — transient UI state. AssemblyDraft — persistent сущность в state.

Не плодим дубль; AssemblyDraft — реальная новая сущность.

### Запрещённые слова §17 R3 — обоснования

- «**Новая первичная сущность** AssemblyDraft»: обоснование — walkthrough вскрыл что workflow Игоря в SnapGene НЕ выражается через containers + operations + junctions. Сборка-копипастом — отдельный класс объекта (composite synthetic sequence), не container и не operation. Заворачивать его в container с metadata «это assembly» — антипаттерн (data model скрывает реальную семантику).
- «**Новый компонент** AssemblyDraftBlock»: existing `ContainerBlock` (10.17 KB после F1+V68 → ~12 KB) заточен под single-sequence container. AssemblyDraft визуально отличается — coloured zones, multi-source, label «Assembly». Conditional branching в ContainerBlock через флаги — раздул бы Watch zone в hard. Отдельный компонент чище.
- «**Новый reducer slice** assemblyReducer»: естественное расширение существующего pattern (canvas / operations / editor sub-reducers).

### MiniMap / mini-canvas implication

`MiniProjectCanvas` (F1) сейчас показывает `state.containers` + `state.operations` маркерами. После G1 нужно extend на assemblyDrafts (опционально для G1; обязательно для G2 acceptance — биолог в editor видит assembly drafts на минимапе). В G1 — TODO marker; реализуется в G2.

---

## 2. Стратегия

`AssemblyDraft` — composite synthetic sequence из ordered segments. Каждый segment — soft reference на parent container (containerId + range + RC) с cached sequence + frozen annotations snapshot. Финальная sequence assembly = concatenation segments[].sequence. На canvas — read-only block с miniature preview (зоны окрашены по source). Действия (insert / remove / reorder / RC / range adjust) через explicit actions; реальный UI редактор — G2.

G1 — фундамент: shape, reducer, selectors, persistence, canvas block. **Не открывает editor.** Биолог в G1 может только создать draft через action из dev console / future floating button («+ Сборка»), увидеть его на canvas, но не редактировать. Полноценная работа — после G2.

---

## 3. Scope IN / OUT

### IN (G1)

- Shape `AssemblyDraft` + `Segment` + `SegmentSource` (discriminated union: `container` / `manual` / `imported`).
- Action types: `CREATE_ASSEMBLY_DRAFT`, `REMOVE_ASSEMBLY_DRAFT`, `RENAME_ASSEMBLY_DRAFT`, `SET_ASSEMBLY_DRAFT_TOPOLOGY`, `SET_ASSEMBLY_DRAFT_POSITION`, `INSERT_SEGMENT`, `REMOVE_SEGMENT`, `REORDER_SEGMENTS`, `UPDATE_SEGMENT_RANGE`, `TOGGLE_SEGMENT_RC`, `UPDATE_SEGMENT_LABEL`, `UPDATE_SEGMENT_COLOR`, `INSERT_MANUAL_SEGMENT`.
- Selectors: `selectAssemblyDraftById`, `selectAssemblyDraftSequence`, `selectAssemblyDraftLength`, `selectSegmentBoundaries`, `selectAssemblyDraftAnnotations`.
- Persistence: schema bump, migration `addEmptyAssemblyDrafts(state)`, full `state.assemblyDrafts` saved/restored.
- Color palette: 12 stable colors, auto-assigned via segment.id hash.
- Annotation transfer at insert: in-range filtering, coords adjusted to segment-local, RC handled.
- Canvas: `AssemblyDraftBlock` read-only с miniature sequence preview + zones + label.
- Double-click `AssemblyDraftBlock` → stub action `openEditorAssemblyTab(draftId)` (no-op в G1, реализация G2).
- Floating button «+ Сборка» на canvas рядом с «+ Операция» (V59) — создаёт пустой draft с cascade-position. Можно отложить до G2 (если G1 ставится только для backend) — в G1 default-on (биолог не может проверить G1 без entry).
- Tests: создание, CRUD segments, sequence concat correctness, RC, reorder, annotation transfer, persistence round-trip, schema migration.

### OUT (G1)

- **Editor / viewer** для assembly draft (G2).
- **Drag-and-drop containers** из sidebar в assembly (G2).
- **Primer writing на assembly sequence** (G2).
- **Reverse-DAG** «Realise» algorithm (G3).
- **Bidirectional sync** изменений DAG → AssemblyDraft (G4, опционально, может быть отложено).
- **Sync segment annotations с parent**: после insert annotations frozen, изменения parent не propagate. Refresh action — отложено в G2 (где biolog сам видит когда обновить).
- **Multi-assembly UX** (несколько drafts одновременно): G1 allow multiple drafts in state, но визуальная организация на canvas (например, группировка) — G2/G3.
- **Export assembly как single container** («save as container in Library»): отдельный sprint после G3.
- **GG/Type IIS assembly** segment detection: не для G1, scope G3+.
- **Inheritance segment color from parent annotations** (вместо palette): G2 enhancement, для G1 simple palette.

---

## 4. Архитектурные решения (DEC-CANVAS-ASM-NN)

### DEC-CANVAS-ASM-01 — AssemblyDraft как четвёртая первичная сущность

`state.assemblyDrafts: AssemblyDraft[]` параллельно `state.containers`, `state.operations`, `state.junctions`. Не subordinate ни к одному из них. На canvas — отдельная зона рендеринга (как containers и ops).

**Rationale:** Walkthrough вскрыл что workflow Игоря fundamentally про assembly-sequence, не про DAG. Subordinate'ить assembly под container (с флагом «это draft») или под operation (с типом «assembly op») — антипаттерн (скрывает семантику, ломает selectors / persistence / UI rendering).

### DEC-CANVAS-ASM-02 — Segment как soft reference на source

```js
Segment = {
  id: 'seg-' + uuidv7(),
  source: { type: 'container', containerId: string }
        | { type: 'manual' }
        | { type: 'imported', sourceLabel?: string },
  start: number,                  // 0-based inclusive on parent (for container source)
  end: number,                    // 0-based exclusive
  reverseComplement: boolean,
  sequence: string,               // cached (after RC if applicable)
  color: string,                  // CSS hex from palette
  label?: string,                 // user-editable
  annotations: Annotation[],      // frozen at insert, segment-local coords
}
```

`containerId` — soft reference. Если parent container delete'нут — segment остаётся (sequence cached), но визуально показывает warning «source unavailable» (G2 UI).

**Rationale:** Soft reference сохраняет данные при удалении parent (биолог не теряет работу). Direct embed (копирование полной плазмиды parent в segment) — overkill, дубль данных.

### DEC-CANVAS-ASM-03 — Sequence cached в segment

`segment.sequence` пересчитывается **только** на:
- INSERT_SEGMENT — initial compute.
- UPDATE_SEGMENT_RANGE — re-slice parent.
- TOGGLE_SEGMENT_RC — reverse-complement on cached sequence.

**НЕ** пересчитывается при modify parent container. Это **frozen snapshot semantics**. Биолог может явно «Refresh segments» в G2 (отложено).

**Rationale:** Reactive recompute на каждое изменение parent — потенциальная performance проблема + UX surprise (биолог изменил аннотацию в plasmid → assembly которая её содержит подскочила). Frozen + explicit refresh — predictable.

### DEC-CANVAS-ASM-04 — Assembly sequence = concat via selector

```js
selectAssemblyDraftSequence(state, draftId): string {
  const draft = state.assemblyDrafts.find(d => d.id === draftId);
  if (!draft) return '';
  return draft.segments.map(s => s.sequence).join('');
}
```

**Derived, не persisted.** Cached sequences хранятся **в каждом segment**, не на assembly level. Avoid duplication.

### DEC-CANVAS-ASM-05 — Topology only assembly-level + manual toggle

`AssemblyDraft.topology = { circular: boolean }`. Default `circular: false` (linear).

Биолог сам toggle'ит когда сборка готова (G2 button в header). Алгоритм «auto-detect circular if last segment 5'/3' overlaps first» — heuristic, может false-positive; не делаем автомата.

**G3 implication:** circular assembly → N junction'ов на N segments (junction между last и first). Linear → N-1.

### DEC-CANVAS-ASM-06 — Color palette stable per segment.id

`lib/segment-color-palette.js::SEGMENT_COLORS = [12 hex strings]`. Auto-assign при INSERT_SEGMENT: `nextColor(state, draftId)` = `SEGMENT_COLORS[draft.segments.length % 12]`.

Биолог может override через `UPDATE_SEGMENT_COLOR { segmentId, color }`. Override stable per `segment.id` — reorder сохраняет цвет.

**G2 enhancement (отложено):** inherit primary annotation color of parent container in range (если segment покрывает CDS → segment получает CDS color). Для G1 — pure palette, simpler.

### DEC-CANVAS-ASM-07 — Backward-compat schema migration

Schema bump `v_N → v_N+1` (точное N резолвится Code'ом на K1 — после F2 spec'и предлагали v2→v3, R12 имеет SCHEMA_VERSION в `skeleton-persistence.js`). Migration:

```js
migrateAddAssemblyDrafts(state): state {
  if (state.assemblyDrafts === undefined) {
    return { ...state, assemblyDrafts: [] };
  }
  return state;
}
```

State без поля → default `[]`. Idempotent.

### DEC-CANVAS-ASM-08 — Position в самом AssemblyDraft (как у containers)

`AssemblyDraft.position: { x, y }`. CREATE_ASSEMBLY_DRAFT action принимает optional position; если нет — cascade default (рядом с последним assembly draft или в углу canvas).

Drag через existing canvas drag infrastructure (`onPointerDown` / `dragging` state в `CanvasLayoutView`). Расширить `dragging.kind` на `'assembly'` (по аналогии с DEC от V58 для operations).

### DEC-CANVAS-ASM-09 — Annotation transfer at insert (frozen snapshot)

```js
lib/segment-annotation-transfer.js::
  transferAnnotations(parentAnnotations, start, end, rc): Annotation[]
```

Logic:
1. Filter annotations пересекающие `[start, end)`. Annotation с `[aStart, aEnd)` включается если `aStart < end && aEnd > start`.
2. Clip annotation coordinates to segment-local: new annotation `{start: max(0, aStart - start), end: min(end - start, aEnd - start), ...rest}`.
3. RC transform: если `rc === true`, координаты flipped: `{start: segLen - newEnd, end: segLen - newStart}`. Annotation strand inverted если есть.
4. Annotation IDs regenerated (avoid collision с parent на assembly level).
5. Origin attribute: `annotation.origin = { type: 'transferred', sourceContainerId, sourceAnnotationId }` — для tracking + future refresh.

**Frozen после transfer.** Изменения parent не propagate. Explicit refresh в G2 (отложено).

### DEC-CANVAS-ASM-10 — Manual segments — fully editable inline

`source.type === 'manual'` — sequence editable inline (G2 UI). Для G1 — INSERT_MANUAL_SEGMENT принимает sequence string, hosts его в segment.sequence напрямую. Annotations пусто. Color from palette.

Use case: biolog хочет вставить spacer linker `AAAA` между двумя фрагментами, либо ad-hoc восстановленную sequence без source.

### DEC-CANVAS-ASM-11 — Soft reference behaviour при удалении parent container

`REMOVE_CONTAINER` reducer extension:
- Iterate `state.assemblyDrafts[].segments[]`. Если `segment.source.type === 'container' && segment.source.containerId === removedId` — segment остаётся (sequence cached), но `segment.source.containerId` помечается как `<deleted>` (или `containerId` stays as `${origId}::deleted`).
- G2 UI показывает warning badge на segment («Source unavailable: container removed»).
- Cached sequence + annotations preserved. Биолог может либо delete segment, либо оставить (она работает как imported).

**Rationale:** не теряем работу biolog'а. Удалил parent в panic'е — assembly draft не разрушился.

---

## 5. Файлы и сигнатуры

### Новые файлы

**`store/skeleton-state-assembly.js`** (~6-8 KB)

Reducer для assembly action types. Pattern same as `skeleton-state-canvas.js` / `skeleton-state-operations.js`.

Action types handled:
- `CREATE_ASSEMBLY_DRAFT { id?, name?, position? }` — create empty draft.
- `REMOVE_ASSEMBLY_DRAFT { draftId }`.
- `RENAME_ASSEMBLY_DRAFT { draftId, name }`.
- `SET_ASSEMBLY_DRAFT_TOPOLOGY { draftId, circular }`.
- `SET_ASSEMBLY_DRAFT_POSITION { draftId, position }`.
- `INSERT_SEGMENT { draftId, atIndex, source, start, end, rc, parentSequence?, parentAnnotations? }` — inserts segment. Если source.type='container' — parent sequence/annotations передаются (vs. чтение state.containers внутри reducer — антипаттерн coupling). Если source.type='manual' — sequence в `source.sequence` field (overload — реализатор уточняет на K1).
- `REMOVE_SEGMENT { draftId, segmentId }`.
- `REORDER_SEGMENTS { draftId, fromIndex, toIndex }`.
- `UPDATE_SEGMENT_RANGE { draftId, segmentId, start, end, parentSequence?, parentAnnotations? }` — recompute sequence + re-transfer annotations.
- `TOGGLE_SEGMENT_RC { draftId, segmentId }` — RC sequence + RC annotations.
- `UPDATE_SEGMENT_LABEL { draftId, segmentId, label }`.
- `UPDATE_SEGMENT_COLOR { draftId, segmentId, color }`.
- `INSERT_MANUAL_SEGMENT { draftId, atIndex, sequence, label? }`.

Helper internal: `recomputeAssemblyModifiedAt(draft)` — touches `modifiedAt`.

**`store/selectors-assembly.js`** (~3-4 KB)

```js
selectAssemblyDraftById(state, draftId): AssemblyDraft | null;
selectAssemblyDraftSequence(state, draftId): string;
selectAssemblyDraftLength(state, draftId): number;
selectSegmentBoundaries(state, draftId): Array<{
  segmentId: string,
  segmentIndex: number,
  startOnAssembly: number,
  endOnAssembly: number,
  color: string,
  label?: string,
  source: SegmentSource,
}>;
selectAssemblyDraftAnnotations(state, draftId): Annotation[]; // aggregated, координаты на assembly
selectAssemblyDraftsByPosition(state, viewport?): AssemblyDraft[]; // for canvas rendering, optional filter
```

`selectAssemblyDraftAnnotations` — flatMap segments[].annotations с offset = segmentBoundary.startOnAssembly.

**`lib/segment-color-palette.js`** (~1-2 KB)

```js
export const SEGMENT_COLORS = [
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f59e0b', '#ef4444',
  '#10b981', '#3b82f6', '#f97316', '#a855f7', '#14b8a6', '#eab308',
];

export function getNextSegmentColor(segmentCount: number): string {
  return SEGMENT_COLORS[segmentCount % SEGMENT_COLORS.length];
}

export function getColorBySegmentId(segmentId: string): string {
  // Stable hash-based fallback for legacy / migrated segments without explicit color.
  // Уbedded simple hash: sum char codes mod 12.
}
```

Цвета — accessible palette (достаточно контрастные между собой, distinguishable colorblind users). Реализатор может уточнить набор на K1.

**`lib/segment-annotation-transfer.js`** (~2-3 KB)

```js
export function transferAnnotations(
  parentAnnotations: Annotation[],
  start: number,
  end: number,
  rc: boolean,
  sourceContainerId?: string,
): Annotation[];
```

Pure function. Steps DEC-ASM-09. Test coverage: in-range filter, partial overlap clip, full overlap, RC coord transform, RC strand invert.

**`canvas/AssemblyDraftBlock.jsx`** (~5-7 KB)

`AssemblyDraftBlock({ draft, position, isHighlighted, isDragging, onPointerDown, onClick, onDoubleClick })`. 

Layout:
```
AssemblyDraftBlock (W: 240, H: similar to ContainerBlock ~150)
├── Header (~30 px): «🧬 {draft.name}» + length info «N bp · circular/linear»
├── MiniAssemblyMap (~90 px): horizontal strip с цветными zones по segments
└── Footer (~20 px): segment count «N сегментов»
```

MiniAssemblyMap — простая horizontal bar (NOT circular даже если topology=circular; для G1 simple); каждая zone = colored rect с длиной пропорциональной segment.length / total. Tooltip per zone = `«{segment.label || source name} · N bp»`.

`onDoubleClick` → `actions.openEditorAssemblyTab(draft.id)` (stub в G1; G2 implements real tab open).

`onClick` selection — same pattern as ContainerBlock (sets highlightedContainerId? Or отдельный highlightedAssemblyDraftId? — see Open question Q1).

### Существующие файлы — изменения

**`store/skeleton-state.js`** (~+0.5 KB)

Router включает `assemblyReducer`:
```js
const ASSEMBLY_ACTIONS = new Set([
  'CREATE_ASSEMBLY_DRAFT', 'REMOVE_ASSEMBLY_DRAFT', ...
]);
if (ASSEMBLY_ACTIONS.has(action.type)) return assemblyReducer(state, action);
```

REMOVE_CONTAINER extension (DEC-ASM-11): помечает affected segments как «source unavailable».

**`store/skeleton-context.jsx`** (~+1-1.5 KB)

Exposed actions:
```js
createAssemblyDraft(opts?),
removeAssemblyDraft(draftId),
renameAssemblyDraft(draftId, name),
setAssemblyDraftTopology(draftId, circular),
setAssemblyDraftPosition(draftId, position),
insertSegment(draftId, atIndex, source, start, end, rc),
removeSegment(draftId, segmentId),
reorderSegments(draftId, fromIndex, toIndex),
updateSegmentRange(draftId, segmentId, start, end),
toggleSegmentRc(draftId, segmentId),
updateSegmentLabel(draftId, segmentId, label),
updateSegmentColor(draftId, segmentId, color),
insertManualSegment(draftId, atIndex, sequence, label),
openEditorAssemblyTab(draftId), // stub в G1; реализация G2
```

Container resolve для INSERT_SEGMENT / UPDATE_SEGMENT_RANGE (parent sequence + annotations): происходит **внутри action helper** (skeleton-context создаёт thunk, читает state, передаёт parentSequence/parentAnnotations в dispatch). Это decoupling reducer от state lookup pattern.

**`store/skeleton-persistence.js`** (~+0.5 KB)

`SCHEMA_VERSION` bump.
`migrationChain` добавляет `migrateAddAssemblyDrafts` step.

**`canvas/CanvasLayoutView.jsx`** (~+0.5-1 KB)

Render block:
```jsx
{state.assemblyDrafts.map((draft) => (
  <AssemblyDraftBlock
    key={draft.id}
    draft={draft}
    position={draft.position}
    isHighlighted={state.highlightedAssemblyDraftId === draft.id}
    isDragging={dragging.kind === 'assembly' && dragging.id === draft.id}
    onPointerDown={(e) => onAssemblyPointerDown(e, draft.id)}
    onClick={() => actions.setHighlight({ assemblyDraftId: draft.id })}
    onDoubleClick={() => actions.openEditorAssemblyTab(draft.id)}
  />
))}
```

`dragging` state расширяется на `kind: 'container' | 'operation' | 'assembly'`. Drag wire — параллельно existing patterns.

Floating button «+ Сборка» — рядом с existing «+ Операция» (V59 position bottom-right). Можно вынести в `CanvasSkeleton/index.jsx::CanvasArea` для consistency с V59.

### Тесты

Файл `__tests__/canvas-skeleton/assembly-data-model.test.jsx` (~10-12 KB).

Покрытие:

1. **CREATE_ASSEMBLY_DRAFT** — пустой draft, default name, default position, default topology=linear, segments=[].
2. **CREATE_ASSEMBLY_DRAFT с opts** — name, position, id override.
3. **INSERT_SEGMENT с source=container** — segment добавляется, sequence cached (slice of parent), annotations transferred.
4. **INSERT_SEGMENT с RC** — sequence reverse-complemented, annotations coords flipped.
5. **INSERT_SEGMENT atIndex** — middle insert работает, ordering сохраняется.
6. **INSERT_MANUAL_SEGMENT** — manual segment с inline sequence, color from palette.
7. **REMOVE_SEGMENT** — segment удаляется, остальные shift'ятся.
8. **REORDER_SEGMENTS** — moves segment в новый index, ordering correct.
9. **UPDATE_SEGMENT_RANGE** — new sequence re-sliced, annotations re-transferred.
10. **TOGGLE_SEGMENT_RC** — sequence RC'd, annotations flipped, RC flag toggles.
11. **UPDATE_SEGMENT_LABEL / COLOR** — fields update.
12. **RENAME_ASSEMBLY_DRAFT** — name updated, modifiedAt touched.
13. **SET_ASSEMBLY_DRAFT_TOPOLOGY** — circular flag toggles.
14. **SET_ASSEMBLY_DRAFT_POSITION** — position updates.
15. **REMOVE_ASSEMBLY_DRAFT** — draft removed.
16. **REMOVE_CONTAINER → segment source unavailable** (DEC-ASM-11) — segments preserved with marker.
17. **selectAssemblyDraftSequence** — concat correctness for N segments.
18. **selectAssemblyDraftLength** — sum of segment lengths.
19. **selectSegmentBoundaries** — координаты segments на assembly (cumulative).
20. **selectAssemblyDraftAnnotations** — aggregation с offset по boundary.
21. **Annotation transfer in-range** — partial overlap clipped, RC coord transform correct.
22. **Schema migration v_N → v_N+1** — state без assemblyDrafts → default [] восстанавливается.
23. **Persistence round-trip** — create + insert + reorder → save → load → restored identically.
24. **Color palette stable** — segment color preserved after reorder.

Плюс ~5 регрессионных проверок на existing tests:
- containers / operations / junctions reducer behaviour не задеты.
- REMOVE_CONTAINER на container который НЕ в assembly draft segments — behaviour same as before.

---

## 6. Порядок выполнения

### K1 — Data model + reducer

- AssemblyDraft / Segment shape.
- `skeleton-state-assembly.js` reducer для всех action types.
- `skeleton-state.js` router extension.
- Helpers `recomputeAssemblyModifiedAt`, etc.
- Tests #1-15 pass.

### K2 — Annotation transfer + color palette

- `lib/segment-annotation-transfer.js` pure function.
- `lib/segment-color-palette.js` palette + helpers.
- Tests #21, #24 pass.

### K3 — Selectors

- `store/selectors-assembly.js`.
- Tests #17-20 pass.

### K4 — Persistence + migration

- `skeleton-persistence.js` schema bump.
- `migrateAddAssemblyDrafts`.
- Tests #22-23 pass.

### K5 — REMOVE_CONTAINER cascade

- DEC-ASM-11 implementation в `skeleton-state-canvas.js` REMOVE_CONTAINER extension.
- Test #16 pass.

### K6 — Skeleton-context actions

- `skeleton-context.jsx` exposed actions.
- Thunk pattern для actions требующих parent sequence/annotations.

### K7 — Canvas block + floating button

- `AssemblyDraftBlock.jsx`.
- `CanvasLayoutView.jsx` rendering + drag wire (`dragging.kind = 'assembly'`).
- Floating button «+ Сборка» (рядом с «+ Операция»).
- Manual smoke: click «+ Сборка» → block появляется → drag → position обновляется. Reload → block restored.

### K8 — Cleanup

- Lint / build clean.
- Размеры файлов в budget.
- Финальный отчёт.

**STOP после K8.** Не финализирует координационные файлы.

---

## 7. STOP-условие и формат отчёта

Идентично F1/F2/F3 (size budget + tests count + DECISIONS sprint-block draft 11 DEC-CANVAS-ASM-NN + manual smoke + отклонения).

**Manual smoke:** «Создал draft через `actions.createAssemblyDraft()`. Создал 2 контейнера в state с разными sequences и annotations. Вызвал insertSegment для каждого. Получил assembly с 2 цветными zones. Toggle RC второго → sequence flipped. Reorder → zones swapped. Удалил parent container → segment остался с warning marker. Reload → state восстановлен».

---

## 8. Риски

### R-DEPENDS-ON-F1F2F3 — G1 опирается на F1-F4 acceptance

Если F1 acceptance вскроет API changes в editor / tabs / persistence — G1 может потребовать поправок. Митигация: G1 пишется про state shape и canvas rendering, минимально зависит от F1/F3 (нет tab integration, нет editor mount). Только schema bump в persistence — F2 уже резервировал номер. Coordination обязательна при K4.

### R1 — Cached segment.sequence raздувает state

Если biolog делает assembly из 10 segments по 5kb = 50kb in state, persisted в IndexedDB. Это OK для IndexedDB (нет лимита на blob); для in-memory React state — тоже OK (~1MB включая все assemblies — far below browser limits).

**Митигация:** не оптимизировать преждевременно. Если на acceptance большие assemblies (10+ segments, 50kb+) тормозят — отдельный perf sprint (cache externalize в IndexedDB на demand, lazy load).

### R2 — Annotation coord transform на RC сложный edge case

Annotation с strand field + range на parent. RC: новая координата `segLen - oldEnd` ... `segLen - oldStart`. Strand: forward → reverse. Tests must cover edge cases (annotation full inside range, partial overlap, exactly at boundary, annotation across origin для circular parent).

**Митигация:** test #21 покрывает все случаи. K2 имеет dedicated unit tests для `transferAnnotations` на mock inputs.

### R3 — Schema migration ломает saved snapshots

Если migration написана неправильно — биолог теряет saved state. Митигация: migration idempotent (DEC-ASM-07), addAdditive (только add field), tested round-trip (test #23 reload existing snapshot pre-migration → load → assert assemblyDrafts=[] и rest intact).

### R4 — Drag conflict с containers/operations

Дополнительный `dragging.kind = 'assembly'` extension может interfere с existing container / op drag handlers. Pattern same as V58 fix (operation drag): explicit `onAssemblyPointerDown` separate handler. Митигация: K7 test добавляет regression check на container drag (V58 не сломан).

### R5 — Floating button «+ Сборка» добавляет визуальный шум на canvas

Биолог уже привык к «+ Операция» в углу. Добавление второго button — увеличение UI density. Альтернатива: одна button «+ Создать» с dropdown (Сборка / Операция). Это extension для UX, не G1 blocker.

Митигация: в G1 — отдельная button (consistent с V59 pattern). UX refinement через feedback после G2 acceptance.

---

## 9. Открытые вопросы — закрыты дефолтами 15.05.2026 (Игорь явно сказал «удалить успеем»)

### Q1 — highlightedAssemblyDraftId vs highlightedContainerId

Дефолт: новое поле `state.highlightedAssemblyDraftId` отдельно от `highlightedContainerId`. Это позволяет одновременно highlight'ить container (например, parent одной из segments) и assembly draft.

Альтернатива: общий `state.highlightedEntity = {kind, id}`. Это рефакторинг existing, рискованнее. Take new field, separate.

### Q2 — Floating button «+ Сборка» в G1 или G2

Дефолт: **в G1**. Биолог не может проверить G1 без entry в новую функциональность. K7 включает button.

Альтернатива: G1 — backend-only, G2 добавляет button. Прячет функциональность до полного UI. Take G1 для proper smoke test.

### Q3 — Cascade-position для нового draft

Дефолт: позиция нового draft = `{x: 40, y: 40 + 200 * existingDraftsCount}` (left edge, vertical cascade). Не overlap с containers / ops.

Альтернатива: рядом с ghost-placeholder (V63) — но ghost фиксирован в верхнем-левом. Не overlap нежелателен.

Take left edge stack.

### Q4 — sourceLabel для imported segments

Дефолт: optional `source.sourceLabel?: string` для imported (через paste). Биолог может label'ить «from old protocol pET28_v2.dna», но не обязательно. На canvas / в G2 segment table показывается label если есть, иначе «imported».

### Q5 — REMOVE_CONTAINER cascade — keep with warning, or detach

Дефолт (DEC-ASM-11): keep с warning marker. Биолог не теряет работу. В G2 UI может «detach» segment (превратить в imported type) если хочет cleanup.

Альтернатива: auto-detach — segment.source.type меняется на 'imported'. Меньше warning state, но biolog теряет origin info.

Take keep with warning.

---

## Acceptance gate

После Code commit + STOP — compact + новая chat-сессия. Acceptance:

- Дев-консоль: `actions.createAssemblyDraft({name:'Test'})` — block появляется на canvas в left edge.
- Создать 2 контейнера через existing flow. Вызвать insertSegment в draft с обоих → block обновляет mini-map с 2 цветными zones.
- Drag block по canvas — position сохраняется.
- Reload — block restored с обоими segments + correct sequence + correct annotations.
- Удалить parent container из state → segment остаётся в draft с warning marker.
- Schema check: state до G1 без assemblyDrafts → migration → assemblyDrafts:[] added.
- Floating button «+ Сборка» в углу canvas работает — click → empty draft.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после H (F3 cleanup) + acceptance F1-F4. Альтернативно — параллельно с H если не пересекаются по файлам.
_Acceptance:_ отдельная chat-сессия после Code STOP.
