# SPRINT_T7_DUAL_MODE_TOGGLE_AND_SYNC.md — toggle G/S + bidirectional graph↔sequence sync

> **Тип:** A (UI + interaction + sync logic).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-08, 09, 10, 15).
> **Зависимости:** T3 (zone.viewMode field), T4 (zone rendering), T6 (sequence-mode editor migrated to pieces).
> **Размер целевой:** 50-60 KB.
> **Цель:** реализовать toggle между graph-mode и sequence-mode для каждой zone, 3 состояния sequence-mode (пустота / палитра / собранная лента), bidirectional sync drag-piece-в-ленту → auto-create reaction в graph.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `canvas/ZoneFrame.jsx` | ~10-12 KB (T4) | soft 30 / hard 40 (.jsx) | +toggle button в header + viewMode mode switching, ~+2 KB |
| `canvas/ZoneLayer.jsx` | ~5-7 KB (T4) | soft 30 / hard 40 | conditional render: graph-content vs sequence-content в каждом frame, ~+3 KB |
| `canvas/zone-sequence-mode/index.jsx` | — (new) | soft 30 / hard 40 | ~12-15 KB rendering 3 состояний |
| `canvas/zone-sequence-mode/ZonePaletteView.jsx` | — (new) | soft 30 / hard 40 | ~6-8 KB столбец piece-лент |
| `canvas/zone-sequence-mode/ZoneAssembledView.jsx` | — (new) | soft 30 / hard 40 | ~10-12 KB горизонтальная лента + ветвление |
| `canvas/zone-sequence-mode/ZoneEmptyView.jsx` | — (new) | soft 30 / hard 40 | ~3-4 KB hint + sources list |
| `canvas/zone-sequence-mode/zone-mode-state.js` | — (new) | soft 20 / hard 25 (.js) | ~5-7 KB derive zone state (empty / palette / assembled) |
| `canvas/zone-sequence-mode/piece-drag.js` | — (new) | soft 20 / hard 25 | ~5-7 KB drag-and-drop helpers |
| `lib/hotkeys.js` | (existing) | soft 20 / hard 25 | +entry `toggle-zone-view` (G/S) ~+0.2 KB |
| `store/skeleton-state-zones.js` | ~16 KB (после T4) | soft 20 / hard 25 | +SET_ZONE_VIEW_MODE wired, +ATTACH_PIECE_TO_ASSEMBLY action, ~+1 KB |
| `store/skeleton-state-pieces.js` | ~10-15 KB (T1) | soft 20 / hard 25 | +piece.order поле (для последовательности в собранной ленте), ~+1 KB |
| `lib/strings.js` | ~22 KB | soft 20 / hard 25 | warn — close к hard. +sequence-mode strings ~+1 KB → ~23 KB |

Watch: lib/strings.js after T7 ~23 KB, close к hard 25. Превентивный split на namespace-specific files (`strings-pieces.js`, `strings-zones.js`) — recommendation для T8 или T-future polish.

---

## 1. Контекст

### 1.1 Что после T6

- `state.zones` slice + viewMode поле (T3 default 'graph').
- `state.pieces` slice + kind='sourced'|'gap'.
- ZoneLayer / ZoneFrame визуально рендерят рамки (T4).
- `editor/assembly-mode/` (renamed conceptually на sequence-mode, физическая папка та же) — UI для одной zone в sequence representation.
- Migration v6→v7 закрыла assemblyDrafts → zones.
- **Visual toggle G/S отсутствует.** Биолог видит graph всегда. Sequence-mode виден только если двойной клик на zone → editor tab kind='assembly'.

### 1.2 Что добавляется в T7

**Inline sequence-mode rendering — внутри zone-фрейма на canvas.** Не отдельный editor tab. Биолог переключает один клик в углу zone.

**3 состояния sequence-mode** (DEC-CANVAS-4T-10):
- **Empty** — в zone есть containers (sources), но нет pieces. Подсказка «Выбери диапазоны на источниках». Список sources с двойным кликом → ContainerEditorSkeleton.
- **Palette** — есть pieces, но они «свободны» (не упорядочены в сборку). Каждый piece — отдельная короткая лента в столбец, разноцветные. Drag piece в горизонтальную область → переход в Assembled.
- **Assembled** — pieces упорядочены. Горизонтальная лента с цветными зонами + стыки + overlay праймеров.

**Bidirectional sync** (DEC-CANVAS-4T-09):
- Drag piece в horizontal strip (Palette → Assembled или re-order в Assembled) → dispatch `ATTACH_PIECE_TO_ASSEMBLY` action. Action sets `piece.order: number` в zone (0-indexed). Если piece.acquisitionMethod != 'undefined' — auto-create reaction (это T8 functionality, но в T7 — стаб).
- Удаление piece из ленты → `DETACH_PIECE_FROM_ASSEMBLY` (piece.order = null). Piece возвращается в Palette.
- Изменение порядка в Assembled — reorder через drag, обновляет piece.order для всех затронутых.

**Ветвление при N финалах** (DEC-CANVAS-4T-11) — частично:
- Finals derived через selector (T3 selectFinalProductsInZone).
- Если N=1 — линейная лента, как обычно.
- Если N>=2 — лента имеет «общую часть» (pieces shared между ветвями) + dropdown «варианты (N)». Биолог выбирает один или «все» (стек вертикально).
- В T7 — basic дропдаун. Smart shared-prefix detection — post-MVP polish.

**Toggle G/S:**
- Хоткей `G` / `S` — global, scope-bound к focused zone (через uiSlice focusedZoneId, новая поле).
- Click toggle в углу zone-header — single zone.
- Per zone — НЕ глобально (Q-zone-1 D).

### 1.3 Что НЕ в T7

- Auto-create reactions из piece.acquisitionMethod — T8.
- Связи zone→zone через materializedFrom — T8.
- Clone variants UI — T9.
- Sanger таблица — T10.

---

## 2. Стратегия

**Inline sequence rendering inside zone-frame** — НЕ отдельный editor tab. Это minimum invasive — биолог видит smooth toggle между graph и sequence views без покидания canvas.

**editor/assembly-mode/** остаётся как **fullscreen editor tab** для deeper editing (примерно как «full focus mode»). T7 — inline view, T6 migrated был fullscreen view. Оба сосуществуют:
- Inline sequence (T7) — quick view + reorder + simple actions.
- Fullscreen editor (T6) — detail editing + RealiseModal + primer writing + complex source picker.

Биолог переключает между ними через двойной клик на zone-header (открывает fullscreen) или toggle на canvas (остаётся inline).

**Conditional rendering в ZoneFrame:**

```javascript
function ZoneFrame({ zone, ... }) {
  return (
    <div className="zone-frame" style={...}>
      <ZoneHeader zone={zone} onToggleViewMode={...} />
      {!zone.collapsed && (
        zone.viewMode === 'graph'
          ? <div className="zone-body-graph" />  // pointer-events: none — узлы видны "из-под"
          : <ZoneSequenceMode zone={zone} state={state} dispatch={dispatch} />
      )}
      {!zone.collapsed && <ResizeHandles />}
    </div>
  );
}
```

В graph-mode — zone-body просто прозрачная (узлы рендерятся ZoneFrame НЕ владея ими).
В sequence-mode — zone-body заполнена ZoneSequenceMode component, который рендерит 3 состояния.

**Когда sequence-mode active** — внешние узлы (containers / pieces / operations с zoneId == zone.id) **скрываются** (visibility: hidden) на canvas. ZoneSequenceMode полностью представляет содержимое zone.

**Drag-and-drop piece в strip** — HTML5 drag API. piece имеет drag handle (в Palette). Strip — drop target. На drop — compute insert position по mouse X coordinate → dispatch ATTACH_PIECE_TO_ASSEMBLY.

**Junction между pieces в Assembled** — derived. Каждые два соседних attached piece — implicit junction. Method — derived от piece.acquisitionMethod (PCR → overlap, restriction → ligation). Биолог может override через клик на стык (open JunctionMethodPicker existing).

В T7 — junction между pieces — derived only, **не stored** в state.junctions. T-future может persist для customization.

---

## 3. Scope IN / OUT

### IN
- ZoneSequenceMode (inline rendering): 3 sub-components — Empty, Palette, Assembled.
- Toggle G/S in ZoneFrame header.
- Hotkey G/S global with zone focus.
- Drag-and-drop piece в strip (Palette → Assembled).
- Reorder pieces в Assembled (drag re-ordering).
- Ветвление при N финалов (basic dropdown).
- Action ATTACH_PIECE_TO_ASSEMBLY + DETACH_PIECE_FROM_ASSEMBLY + REORDER_PIECES_IN_ZONE.
- piece.order поле (new T7 shape extension, nullable).
- Selector `selectZoneSequenceState(state, zoneId)` returns 'empty'|'palette'|'assembled'.
- Tests (~35 новых).
- STRINGS extension.

### OUT
- Auto-create reactions из piece.acquisitionMethod (T8 territory).
- Materialized connection zone→zone (T8).
- Clone variants ветвление UI (T9).
- Smart shared-prefix detection в N финалах branching (T-future polish).
- Animations between toggle G/S (post-MVP polish).

### NOT TOUCHED
- ZoneLayer rendering containers/operations (sequence-mode скрывает их через visibility).
- editor/assembly-mode/ fullscreen editor — продолжает работать как раньше после T6.
- PcrModeShell V71-V76.
- Library / Importer / Annotator.

---

## 4. Архитектурные решения

### DEC-T7-01 — Inline sequence-mode in zone-frame, NOT отдельный editor tab
Smooth toggle без покидания canvas. Editor tab для fullscreen — separate path (двойной клик).

### DEC-T7-02 — Conditional rendering в ZoneFrame based on zone.viewMode
Не отдельный component <SequenceZoneFrame>. Single ZoneFrame branches по viewMode. Это keeps zone frame state (bounds, drag, resize) единым.

### DEC-T7-03 — Узлы graph-mode visibility:hidden при sequence-mode active
Альтернатива (display:none) — re-render expensive. visibility:hidden — keeps DOM, fast toggle. positioning preserved.

Цена: occupied DOM space (узлы существуют, не interactive в sequence-mode). Приемлемо.

### DEC-T7-04 — piece.order — nullable number
- `null` — piece не attached (находится в Palette).
- `0, 1, 2, ...` — attached, индекс в горизонтальной ленте.

Sorting в Assembled view — по piece.order ascending. Уникальность не строгая — два piece с одинаковым order рендерятся в порядке createdAt secondary.

### DEC-T7-05 — Sequence-state derived через selector
`selectZoneSequenceState(state, zoneId): 'empty'|'palette'|'assembled'`
- empty: pieces.length === 0 (только sources).
- palette: pieces.length > 0 && все piece.order === null.
- assembled: at least one piece.order !== null.

### DEC-T7-06 — Drag piece в strip — HTML5 drag-and-drop
- MIME `application/x-bodge-piece-id`.
- drag source — piece-card в Palette.
- drop target — strip area + между existing pieces в Assembled.
- onDrop — compute insert position by mouse X → dispatch ATTACH_PIECE_TO_ASSEMBLY.

### DEC-T7-07 — Reorder в Assembled через drag piece-card
Same MIME, source = piece в Assembled. Drop position = insert между existing pieces. onDrop → REORDER_PIECES_IN_ZONE.

### DEC-T7-08 — Junction между pieces в Assembled — derived, не stored
В T7 — implicit. Method derives:
- piece(i).acquisitionMethod='pcr' + piece(i+1).acquisitionMethod='pcr' → 'overlap-pcr' default.
- piece(i)='restriction' + piece(i+1)='restriction' → 'ligation'.
- Other combinations → 'gibson' default.

Биолог override через клик на implicit junction → JunctionMethodPicker (existing) → persist override в `state.junctions` (как regular junction).

T-future: implicit junctions могут быть auto-promoted к state.junctions для customization.

### DEC-T7-09 — Ветвление при N финалах — basic dropdown в T7
Single dropdown в header sequence-mode: «Финал: P43_U3afu_Hyg/1 ▾». Click → menu со всеми finals → select switches view на конкретный final.

«Все варианты» опция — stacked vertical layout (N лент one above other). Useful для biolog сравнения.

Smart shared-prefix detection — post-MVP.

### DEC-T7-10 — Hotkey G/S — focused zone scope
- Global registered.
- При press — checks `state.ui.focusedZoneId` (или derived from mouse hover position).
- Toggle viewMode на focused zone.

`focusedZoneId` — derived from последнего ZoneFrame hover/click. Stored в uiSlice (extension T7).

Альтернатива: всегда применять к `state.zones[0]` (first zone) — confusing.
Альтернатива: focus only when user typed G/S после click внутри zone — strict, но user-friendly.

Выбираем: hover-based focus с fallback к last-interacted zone. Tested in K11.

### DEC-T7-11 — Toggle button — иконка G/S в углу zone-header
Не в context menu. Single click toggle. Tooltip «G — графовый режим / S — режим последовательности».

### DEC-T7-12 — Sequence-mode rendering layouts based on zone width
- Width >= 600 — full layout (palette column + assembled strip side-by-side).
- Width < 600 — vertical stack (palette above, strip below).

T7 — basic responsive. Post-MVP — fine-tuning breakpoints.

### DEC-T7-13 — Ветвление визуально через ASCII-art-like Y-разветвитель
Не overly fancy. Линия идёт вверх к разделению, потом fork-out на N branches вниз. Каждая branch имеет свой суффикс в имени (/1, /2, /3, /4). Цвета branches могут быть тинт от parent piece color.

### DEC-T7-14 — onDoubleClick zone header — opens fullscreen editor tab (T6)
Existing behavior. Keep.

### DEC-T7-15 — Tests baseline: 2871 (T6) → ~2910 (T7)
~39 новых tests.

---

## 5. Components / API / actions

### 5.1 ZoneSequenceMode.jsx (inline rendering)

**Props:**
- `zone: Zone`.
- `state: SkeletonState`.
- `dispatch`.

**Логика:**

```javascript
function ZoneSequenceMode({ zone, state, dispatch }) {
  const sequenceState = selectZoneSequenceState(state, zone.id);
  const pieces = selectPiecesByZoneId(state, zone.id);
  const sources = selectContainersInZone(state, zone.id);
  const finals = selectFinalProductsInZone(state, zone.id);

  // Determine layout based on width.
  const layout = zone.bounds.width >= 600 ? 'horizontal' : 'vertical';

  return (
    <div className={`zone-sequence-mode layout-${layout}`}>
      {sequenceState === 'empty' && (
        <ZoneEmptyView sources={sources} dispatch={dispatch} zoneId={zone.id} />
      )}
      {sequenceState === 'palette' && (
        <ZonePaletteView pieces={pieces} state={state} dispatch={dispatch} zoneId={zone.id} />
      )}
      {sequenceState === 'assembled' && (
        <ZoneAssembledView 
          pieces={pieces}
          finals={finals}
          state={state}
          dispatch={dispatch}
          zoneId={zone.id}
        />
      )}
    </div>
  );
}
```

### 5.2 ZoneEmptyView.jsx

```javascript
function ZoneEmptyView({ sources, dispatch, zoneId }) {
  return (
    <div className="zone-empty-view">
      <div className="hint">{S.zones.sequenceMode.emptyHint}</div>
      <div className="available-sources">
        <div className="label">{S.zones.sequenceMode.availableSources}:</div>
        {sources.map((c) => (
          <button
            key={c.id}
            className="source-link"
            onDoubleClick={() => dispatch({type:'OPEN_EDITOR_FOR_CONTAINER', containerId: c.id})}
            title={`${c.sequence.length} нт`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 5.3 ZonePaletteView.jsx

```javascript
function ZonePaletteView({ pieces, state, dispatch, zoneId }) {
  // Sorted by createdAt — order стабильный
  const sortedPieces = pieces.slice().sort((a, b) => a.createdAt - b.createdAt);

  // Strip — горизонтальная drop target для перехода в assembled
  return (
    <div className="zone-palette-view">
      <div className="palette-column">
        <div className="label">{S.zones.sequenceMode.palette}:</div>
        {sortedPieces.map((piece) => (
          <PieceCard
            key={piece.id}
            piece={piece}
            sequence={selectPieceSequence(state, piece.id)}
            draggable
            onDragStart={(e) => onPieceDragStart(e, piece.id)}
            onDoubleClick={() => /* open piece editor — future */}
          />
        ))}
      </div>
      <div 
        className="strip-drop-target"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onStripDrop(e, dispatch, zoneId, /*insertAt=*/0)}
      >
        <div className="drop-hint">{S.zones.sequenceMode.dragHere}</div>
      </div>
    </div>
  );
}
```

### 5.4 ZoneAssembledView.jsx

```javascript
function ZoneAssembledView({ pieces, finals, state, dispatch, zoneId }) {
  const attachedPieces = pieces
    .filter((p) => p.order !== null && p.order !== undefined)
    .sort((a, b) => a.order - b.order);
  
  const detachedPieces = pieces.filter((p) => p.order === null || p.order === undefined);

  const [selectedFinal, setSelectedFinal] = useState(finals[0]?.id || null);

  return (
    <div className="zone-assembled-view">
      {finals.length > 1 && (
        <FinalSelector finals={finals} selected={selectedFinal} onSelect={setSelectedFinal} />
      )}

      <div className="strip-area">
        {attachedPieces.map((piece, idx) => (
          <React.Fragment key={piece.id}>
            <PieceCard
              piece={piece}
              sequence={selectPieceSequence(state, piece.id)}
              draggable
              onDragStart={(e) => onPieceDragStart(e, piece.id)}
              variant="strip"
            />
            {idx < attachedPieces.length - 1 && (
              <ImplicitJunction
                fromPiece={piece}
                toPiece={attachedPieces[idx+1]}
                onClick={() => openJunctionMethodPicker(piece, attachedPieces[idx+1])}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {detachedPieces.length > 0 && (
        <div className="detached-palette">
          <div className="label">{S.zones.sequenceMode.detachedHint}</div>
          {detachedPieces.map((piece) => (
            <PieceCard key={piece.id} piece={piece} sequence={selectPieceSequence(state, piece.id)} draggable variant="palette" />
          ))}
        </div>
      )}

      {finals.length > 1 && (
        <BranchingVisual finals={finals} attachedPieces={attachedPieces} />
      )}
    </div>
  );
}
```

### 5.5 PieceCard.jsx (re-usable)

```javascript
function PieceCard({ piece, sequence, draggable, onDragStart, variant = 'palette', ...props }) {
  return (
    <div
      className={`piece-card variant-${variant}`}
      style={{ background: piece.color, opacity: 0.3, border: `1px solid ${piece.color}` }}
      draggable={draggable}
      onDragStart={onDragStart}
      data-piece-id={piece.id}
      {...props}
    >
      <div className="piece-name">{piece.name}</div>
      <div className="piece-size">{sequence?.length || 0} нт</div>
      {piece.functionalLabel && <div className="piece-label">{piece.functionalLabel}</div>}
      {/* для variant='strip' — sequence preview как горизонтальная лента */}
      {variant === 'strip' && <div className="piece-strip" style={{ width: sequence?.length * 0.2 }} />}
    </div>
  );
}
```

### 5.6 zone-mode-state.js

```javascript
export function selectZoneSequenceState(state, zoneId) {
  const pieces = (state.pieces || []).filter((p) => p.zoneId === zoneId);
  if (pieces.length === 0) return 'empty';
  if (pieces.every((p) => p.order === null || p.order === undefined)) return 'palette';
  return 'assembled';
}

export function selectContainersInZone(state, zoneId) {
  return (state.containers || []).filter((c) => c.zoneId === zoneId);
}

export function selectPiecesByZoneId(state, zoneId) {
  return (state.pieces || []).filter((p) => p.zoneId === zoneId);
}

export function selectAttachedPieces(state, zoneId) {
  return selectPiecesByZoneId(state, zoneId)
    .filter((p) => p.order !== null && p.order !== undefined)
    .sort((a, b) => a.order - b.order);
}
```

### 5.7 piece-drag.js

```javascript
export function onPieceDragStart(e, pieceId) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/x-bodge-piece-id', pieceId);
  // Optional drag image — use card preview
  // ...
}

export function readPieceIdFromDrop(e) {
  return e.dataTransfer.getData('application/x-bodge-piece-id') || null;
}

/**
 * Compute insert position based on mouse X coordinate в strip.
 * Returns index (0-based) where piece should be inserted.
 */
export function computeInsertPosition(stripEl, mouseX, attachedPieces) {
  const stripRect = stripEl.getBoundingClientRect();
  const relativeX = mouseX - stripRect.left;
  // Approx — each piece-card имеет width ~120px (with sequence preview).
  // Real implementation — measure actual card positions.
  const cardWidth = 120;
  return Math.floor(relativeX / cardWidth);
}

export function onStripDrop(e, dispatch, zoneId, defaultInsertIdx) {
  e.preventDefault();
  const pieceId = readPieceIdFromDrop(e);
  if (!pieceId) return;
  const insertIdx = defaultInsertIdx ?? computeInsertPosition(e.currentTarget, e.clientX, []);
  dispatch({
    type: 'ATTACH_PIECE_TO_ASSEMBLY',
    pieceId,
    zoneId,
    order: insertIdx,
  });
}
```

### 5.8 Actions

**ATTACH_PIECE_TO_ASSEMBLY**

```
dispatch({ type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId, zoneId, order });
```

Логика:
1. Find piece. Validate piece.zoneId === zoneId (или null — допустимо, тогда set zoneId тоже).
2. Shift order всех piece в zone с order >= incoming order: order+1 (insertion).
3. Set piece.order = incoming order.
4. (T8) — auto-create reaction если piece.acquisitionMethod != 'undefined'. В T7 — stub (TODO).

**DETACH_PIECE_FROM_ASSEMBLY**

```
dispatch({ type: 'DETACH_PIECE_FROM_ASSEMBLY', pieceId });
```

Логика:
1. Find piece. Если piece.order === null — no-op.
2. Save oldOrder = piece.order.
3. Set piece.order = null.
4. Shift order всех piece в same zone с order > oldOrder: order-1.

**REORDER_PIECES_IN_ZONE**

```
dispatch({ type: 'REORDER_PIECES_IN_ZONE', zoneId, newOrderIds: [pid1, pid2, pid3] });
```

Логика:
1. Find pieces in zone with order != null.
2. Validate newOrderIds — все exist, все attached в этой zone.
3. Update each piece.order = idx в newOrderIds.

**SET_ZONE_VIEW_MODE** (existing T3, wired в T7)

```
dispatch({ type: 'SET_ZONE_VIEW_MODE', zoneId, viewMode: 'graph'|'sequence' });
```

### 5.9 Hotkey toggle-zone-view

`lib/hotkeys.js`:
```javascript
HOTKEYS['toggle-zone-view-graph'] = {
  keys: [{ key: 'g', ctrl: false, alt: false, shift: false }],
  scope: 'global',
  description: 'Переключить активную зону в режим графа',
};
HOTKEYS['toggle-zone-view-sequence'] = {
  keys: [{ key: 's', ctrl: false, alt: false, shift: false }],
  scope: 'global',
  description: 'Переключить активную зону в режим последовательности',
};
```

Handler в `CanvasLayoutView` / `CanvasSkeleton/index.jsx`:
```javascript
useHotkey('toggle-zone-view-graph', () => {
  const focusedZoneId = state.ui?.focusedZoneId;
  if (focusedZoneId) dispatch({ type:'SET_ZONE_VIEW_MODE', zoneId: focusedZoneId, viewMode: 'graph' });
});
useHotkey('toggle-zone-view-sequence', () => {
  const focusedZoneId = state.ui?.focusedZoneId;
  if (focusedZoneId) dispatch({ type:'SET_ZONE_VIEW_MODE', zoneId: focusedZoneId, viewMode: 'sequence' });
});
```

`state.ui.focusedZoneId` — new uiSlice field. Set через `SET_FOCUSED_ZONE` action, dispatched когда ZoneFrame получает hover/click.

### 5.10 ImplicitJunction.jsx

Junction между pieces в Assembled. Тонкая визуальная связь:
- Lineа между двумя piece-cards (width ~20px).
- Цвет — derived от method (Gibson → blue, Restriction → orange, OV-PCR → green).
- Click → open JunctionMethodPicker existing.

```javascript
function ImplicitJunction({ fromPiece, toPiece, onClick }) {
  const method = derivedJunctionMethod(fromPiece, toPiece);
  return (
    <div className="implicit-junction" onClick={onClick} title={S.zones.sequenceMode.junctionMethod[method]}>
      <span className={`junction-line method-${method}`} />
      <span className="method-label">{S.zones.sequenceMode.junctionMethodShort[method]}</span>
    </div>
  );
}

function derivedJunctionMethod(fromPiece, toPiece) {
  // T7 simple heuristic
  if (fromPiece.acquisitionMethod === 'pcr' && toPiece.acquisitionMethod === 'pcr') return 'overlap-pcr';
  if (fromPiece.acquisitionMethod === 'restriction' && toPiece.acquisitionMethod === 'restriction') return 'ligation';
  return 'gibson';
}
```

### 5.11 BranchingVisual.jsx

Когда finals.length > 1 — рисуется Y-разветвитель:

```javascript
function BranchingVisual({ finals, attachedPieces }) {
  return (
    <div className="branching-visual">
      <div className="trunk" />
      <div className="branches">
        {finals.map((final, idx) => (
          <div key={final.id} className="branch">
            <div className="branch-line" />
            <div className="branch-label">{final.name || `Финал /${idx + 1}`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5.12 STRINGS extension

```javascript
zones: {
  // ...existing T3+T4
  sequenceMode: {
    toggleToGraph: 'Режим графа (G)',
    toggleToSequence: 'Режим последовательности (S)',
    emptyHint: 'Выбери диапазоны на источниках чтобы увидеть сборку',
    availableSources: 'Доступные источники',
    palette: 'Палитра кусков',
    dragHere: 'Перетащи кусок сюда, чтобы добавить в сборку',
    detachedHint: 'Свободные куски (не в сборке)',
    junctionMethod: {
      'overlap-pcr': 'Overlap-PCR',
      'ligation': 'Лигаза',
      'gibson': 'Gibson',
      'golden-gate': 'Golden Gate',
      'kld': 'KLD',
    },
    junctionMethodShort: {
      'overlap-pcr': 'OV',
      'ligation': 'L',
      'gibson': 'G',
      'golden-gate': 'GG',
      'kld': 'KLD',
    },
    finalSelector: 'Финал:',
    allBranches: 'Все варианты',
  },
}
```

---

## 6. Порядок выполнения

**K1.** Create `canvas/zone-sequence-mode/zone-mode-state.js` — pure selectors + helpers. ~5 tests.

**K2.** Create `canvas/zone-sequence-mode/piece-drag.js` — drag helpers. ~5 tests.

**K3.** Расширить piece-model.js + piece-invariants.js — `piece.order` поле (nullable number).

**K4.** Actions в `skeleton-state-pieces.js`:
- ATTACH_PIECE_TO_ASSEMBLY.
- DETACH_PIECE_FROM_ASSEMBLY.
- REORDER_PIECES_IN_ZONE.

Шифты order — careful invariants. ~6 tests.

**K5.** Расширить `skeleton-state-zones.js` action SET_ZONE_VIEW_MODE (если ещё не wired, T3 был placeholder).

**K6.** uiSlice extension — focusedZoneId field + SET_FOCUSED_ZONE action. ~3 tests.

**K7.** Create `canvas/zone-sequence-mode/index.jsx` (main ZoneSequenceMode component).

**K8.** Create `ZoneEmptyView.jsx` + `ZonePaletteView.jsx` + `ZoneAssembledView.jsx` + `PieceCard.jsx` + `ImplicitJunction.jsx` + `BranchingVisual.jsx`. ~6 component tests.

**K9.** Расширить `ZoneFrame.jsx` — toggle button + conditional render based on viewMode.

**K10.** Расширить `ZoneLayer.jsx` — pass state/dispatch для sequence-mode.

**K11.** Hotkey G/S в `lib/hotkeys.js` + handler в `CanvasLayoutView.jsx` / `CanvasSkeleton/index.jsx`.

**K12.** Recipe: hover на zone → SET_FOCUSED_ZONE.

**K13.** STRINGS extension (§5.12).

**K14.** Hide узлов graph (containers/operations) когда zone.viewMode='sequence' — visibility:hidden in CSS / inline style. ContainerBlock / OperationNode добавляют check.

**K15.** Tests integration:
- Toggle G/S через хоткей.
- Toggle через click button.
- Drag piece из palette в strip → ATTACH dispatched + piece.order set.
- Drag piece из strip обратно в palette → DETACH.
- Reorder piece в strip — REORDER.
- Multi-final → BranchingVisual visible.
- visibility:hidden графовых узлов работает.
- ~10 integration tests.

**K16.** Manual smoke:
1. Открыть /canvas-skeleton. Default zone имеет 0 pieces → click S → empty hint.
2. Create piece (T5 flow) → click S → palette с 1 piece-card. Drag в strip → переход в assembled. piece.order=0.
3. Создать второй piece. В palette. Drag в strip перед первым → first piece.order=1, new piece.order=0.
4. Удалить piece — DETACH → возвращается в palette.
5. Click G → zone снова graph-mode. Узлы видны.
6. Hover на zone → focused. Hotkey S — переключает.
7. Multi-final scenario (через dev-console seed) — BranchingVisual visible.

**K17.** Size budget check. lib/strings.js close к hard 25 — alarm если pass.

---

## 7. STOP-условие

Code останавливается после K17.

Отчёт:
```
## T7 Dual Mode Toggle + Sync — отчёт
Commits: ...
Vitest: 2871 → 2910 pass / 1 skip / 0 fail (+39)
pytest: 112/112
vite build: clean

Size budget:
- canvas/zone-sequence-mode/index.jsx: ~13 KB (new) ✓
- canvas/zone-sequence-mode/ZonePaletteView.jsx: ~7 KB (new) ✓
- canvas/zone-sequence-mode/ZoneAssembledView.jsx: ~11 KB (new) ✓
- canvas/zone-sequence-mode/ZoneEmptyView.jsx: ~3 KB (new) ✓
- canvas/zone-sequence-mode/zone-mode-state.js: ~6 KB (new) ✓
- canvas/zone-sequence-mode/piece-drag.js: ~6 KB (new) ✓
- canvas/ZoneFrame.jsx: ~14 KB (+2) ✓
- canvas/ZoneLayer.jsx: ~9 KB (+3) ✓
- store/skeleton-state-pieces.js: ~16 KB (+1 attach/detach/reorder) ✓
- piece-model.js: ~9 KB (+1 order field) ✓
- lib/strings.js: ~23 KB ⚠ close к hard 25, превентивный split в T8 recommended

Manual smoke:
- Toggle G/S works (хоткей + click)
- Drag piece палитра↔strip works
- Multi-final BranchingVisual visible
- Узлы graph скрыты при sequence-mode

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 8. Что делать при регрессии

1. **Узлы visible в sequence-mode** — visibility:hidden не applied. Проверить ContainerBlock/OperationNode читают zone.viewMode правильно.

2. **piece.order shifts ломаются (дубликаты или пропуски)** — ATTACH_PIECE_TO_ASSEMBLY reducer math некорректен. Verify через test «attach piece 3 at position 1 → existing piece.order 1 → 2, 2 → 3».

3. **Drag-and-drop вообще не работает** — MIME type типicality. Test: `e.dataTransfer.types.includes('application/x-bodge-piece-id')` в onDrop.

4. **Hotkey G/S активируется в input fields** — useHotkey resolver не проверяет event.target. Existing pattern из V72 должен это уже делать.

5. **ZoneFrame conditional render корпускулярит DOM** — каждый render создаёт новый DOM tree для ZoneSequenceMode. Memo через React.memo может помочь.

---

## 9. Риски

### R-T7-1 — visibility:hidden на узлах не работает потому что zIndex
**Risk:** Узлы containers/operations имеют zIndex 10/20. ZoneFrame zIndex 1 (background). visibility:hidden на узле — узел скрыт, но zone-sequence-content тоже сидит зальный zIndex 1 + у sequence-mode внутри zone bigger zIndex tree.
**Mitigation:** В sequence-mode — zone-sequence-content получает zIndex 100 (above containers). При viewMode='sequence' конкретной zone — узлы в этой zone скрыты visibility:hidden.

### R-T7-2 — Drag-and-drop конфликтует с zone drag (header)
**Risk:** Piece drag start может triggered zone header drag.
**Mitigation:** PieceCard `pointer-events: auto` + zone-header `pointer-events: auto` — события идут к first element under cursor. Piece card внутри zone-body — pointer на card, не на header.

### R-T7-3 — Reorder math сложна
**Risk:** REORDER_PIECES_IN_ZONE с массивом ids — должно валидировать что все pieces в zone, все attached.
**Mitigation:** Unit tests на reducer (~3 tests). Если validation fail — error toast + no-op.

### R-T7-4 — Hotkey G в input → biolog печатает имя.
**Risk:** Биолог редактирует zone name → нажал G → переключает viewMode.
**Mitigation:** useHotkey resolver guard (V72 pattern) — пропускает события с event.target.tagName в input/textarea/contenteditable. Tests verifies.

### R-T7-5 — BranchingVisual не рендерится при N=1
**Risk:** Если только 1 final — BranchingVisual ne нужен, но компонент может рендериться.
**Mitigation:** Conditional `{finals.length > 1 && <BranchingVisual />}` — explicit guard.

### R-T7-6 — Performance: 50 pieces в Palette
**Risk:** Render 50 piece-cards с sequence previews — медленно.
**Mitigation:** Virtualization (react-window) — post-MVP. В T7 — basic. UX-проверка на real data: реальные сборки имеют 4-12 pieces, не 50.

### R-T7-7 — focusedZoneId stale после удаления zone
**Risk:** Биолог focused zone X → удалил zone X → focusedZoneId=X stale → hotkey G/S не работает.
**Mitigation:** Reducer для REMOVE_ZONE clears state.ui.focusedZoneId если === removed zoneId. Cascade.

---

## 10. Открытые вопросы для Chat

1. focusedZoneId derivation — hover-based, click-based, или explicit? T7 default hover-based. Может irritate biolog когда mouse случайно над zone.
   - Дефолт: hover с debounce 200ms (фокус не теряется на коротких passes).
2. piece.order — `null` vs `undefined` vs `-1` для "не attached"? T7 — null. Backward-compat при migration v7→v8 (если будет) добавляет null defaults.
3. JunctionMethodPicker на implicit junction — стоит ли persist в state.junctions, или keep implicit? T7 — persist при override (биолог явно выбрал — это data, не derived). Default — implicit.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров.
- [x] Контекст + стратегия + reference на T6.
- [x] Scope IN/OUT.
- [x] DEC-T7-01..15.
- [x] Components + actions + helpers (§5).
- [x] K1-K17.
- [x] STOP-условие.
- [x] 7 рисков.
- [x] Открытые вопросы.
- [x] Размер 50-60 KB target.
- [x] Reference на якорь + T3, T4, T6.
- [x] Bidirectional sync defined (DEC-CANVAS-4T-09).

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-08, 09, 10, 11, 15.
**Следующий sprint:** T8 — auto-create reactions из piece.acquisitionMethod + связи zone→zone.
