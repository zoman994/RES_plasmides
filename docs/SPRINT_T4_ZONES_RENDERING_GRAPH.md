# SPRINT_T4_ZONES_RENDERING_GRAPH.md — рендеринг zone-фреймов + UI взаимодействия

> **Тип:** A (UI + interaction).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-07, 11, 12, 14).
> **Зависимости:** T3 (state.zones + actions). Параллелен T2/T5/T6.
> **Размер целевой:** 45-55 KB.
> **Цель:** визуально отрендерить zone-фреймы на canvas (graph-mode), реализовать drag/resize/merge, hit-detection для drop узлов в зону, cross-zone junctions warning. Sequence-mode rendering — T7.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `canvas/CanvasLayoutView.jsx` | ~16 KB | soft 30 / hard 40 (.jsx) | +ZoneLayer mount + pointer-up hit-detect, ~5 KB → ~21 KB |
| `canvas/CanvasGraphView.jsx` | ? | soft 30 / hard 40 | +ZoneLayer аналогично, ~3 KB |
| `canvas/ZoneFrame.jsx` | — (new) | soft 30 / hard 40 | ~10-12 KB |
| `canvas/ZoneLayer.jsx` | — (new) | soft 30 / hard 40 | ~5-7 KB |
| `canvas/ZoneContextMenu.jsx` | — (new) | soft 30 / hard 40 | ~4-5 KB |
| `canvas/zone-interaction.js` | — (new) | soft 20 / hard 25 (.js) | ~6-8 KB hit-detection |
| `canvas/zone-cross-junction-style.js` | — (new) | soft 20 / hard 25 | ~2 KB |
| `store/skeleton-state-zones.js` | ~12-15 KB (T3) | soft 20 / hard 25 | +DRAG_ZONE + RECOMPUTE_ZONE_BOUNDS, ~+1 KB |
| `store/skeleton-state.js` | ~14.5 KB | soft 20 / hard 25 | +finalizer auto-recompute, ~+0.5 KB |

Watch: `CanvasLayoutView.jsx` после T4 — ~21 KB, soft 30 пока OK. T7 может добавить toggle G/S header → превентивный split возможен.

---

## 1. Контекст

### 1.1 Что после T3

- `state.zones` slice + 12 actions + helpers + selectors.
- Migration v5→v6 закрыта.
- **Визуально zones невидимы** — биолог открыл canvas-skeleton, рамок нет. Zones существуют только в state.

### 1.2 Что в коде CanvasLayoutView.jsx сейчас

(По COMPONENT_MAP v0.8.2+ и V58-V81 bug-bash.)

Главный canvas component. Содержит:
- Container blocks (Placeholder + Filled).
- Operation diamonds (PCR / Cut / Gibson / etc.).
- Junction SVG layer со stitch markers + clickable badges.
- Drop targets (canvas-level от LibraryTree через MIME `application/x-bodge-entry-id`, per-block placeholder).
- `dragging` state (`kind: 'container' | 'operation'`, pointer-handlers).
- Floating «+ Операция» button (V59).

T4 добавляет **слой под узлами** — `ZoneLayer` — с прямоугольниками-рамками. Узлы рендерятся **поверх** рамок через zIndex.

### 1.3 Что добавляется в T4

**Визуал фрейма:**
- Рамка цветом `var(--zone-border)` (new CSS token).
- Header высотой 28px со zone.name + counter узлов («4 узла») + notes badge `📝` если notes.
- Collapsed state — только header (200×60). Двойной клик на header → toggle.
- Cross-zone junctions — dashed pattern + warning icon в середине.

**UI взаимодействия:**
- Drag всей zone — pointer-down на header → drag → узлы внутри двигаются вместе.
- Resize — drag 8 углов/граней (hit-boxes 12px).
- Right-click → ZoneContextMenu (rename / merge / delete / collapse / wrap loose).
- Drop node в zone (или вне zone — становится бесхозным) — hit-detection в pointer-up.

---

## 2. Стратегия

**Layered rendering.** Layers по zIndex:
1. Background grid (existing).
2. **ZoneLayer (NEW)** zIndex=1 — прямоугольники.
3. Container/Piece blocks zIndex=10.
4. Operation diamonds zIndex=20.
5. Junctions SVG zIndex=30.
6. Drag preview zIndex=40.

ZoneLayer — `<div>` absolute, рендерит N `<ZoneFrame>`. Каждый ZoneFrame — `<div>` со своим bounds, рамкой, заголовком, ручками resize. CSS+DOM, не SVG.

**Drop hit-detection on pointer-up** (не drag-over — меньше re-render). При pointer-up на node — определяется target zone через `findZoneAtPoint`. Если разница с current zoneId — dispatch MOVE_NODE_TO_ZONE.

**Drag zone — атомарный action.** `DRAG_ZONE(zoneId, delta)` в одном reducer call обновляет zone.bounds + positions всех узлов в zone. RAF-throttling в pointer-move handler (1 dispatch на frame).

**Auto-recompute через finalizer** в `skeleton-state.js` — после mutation реагирующих на nodes/positions — если zone.autoResize → пересчёт bounds + dispatch (или inline в reducer-cycle через next mutation).

---

## 3. Scope IN / OUT

### IN
- 5 новых компонентов: ZoneFrame, ZoneLayer, ZoneContextMenu.
- 2 новых lib файла: zone-interaction.js (hit-detection), zone-cross-junction-style.js.
- Расширения CanvasLayoutView.jsx + CanvasGraphView.jsx (ZoneLayer mount + pointer-up hit-detect).
- Action DRAG_ZONE + RECOMPUTE_ZONE_BOUNDS в skeleton-state-zones.js.
- Finalizer auto-recompute в skeleton-state.js.
- Design tokens (CSS vars) в DESIGN_SYSTEM.md + global stylesheet.
- STRINGS namespace extension.
- Tests (~37 новых).

### OUT
- Sequence-mode rendering — T7.
- Toggle G/S — T7.
- Ветвление финалов в sequence — T7.
- Auto-numbering reactions per-zone — T8.
- Connections zone→zone через badge — T8.
- Animations/transitions при collapse/expand — T-future polish.

### NOT TOUCHED
- LibraryTreeHost, Library/, Importer, SequenceView, Annotator, PcrModeShell.
- Operations adapters, executeOperation.

---

## 4. Архитектурные решения

### DEC-T4-01 — ZoneLayer как отдельный компонент
Изолирует rendering. Unit-testable. CanvasLayoutView не растёт за hard 40 KB.

### DEC-T4-02 — DOM/CSS для рамки, не SVG
Border + label — DOM. SVG только для cross-zone dashed pattern в junction layer (уже SVG). Производительность: 50 рамок DOM держатся OK; SVG может быть тяжелее при frequent drag.

### DEC-T4-03 — zIndex ZoneLayer ниже узлов (1 vs 10/20)
Рамки не перекрывают узлы.

### DEC-T4-04 — Header 28px sticky-top
Drag handle. Collapsed state — только header виден (body height=0). Click на body (не header) — propagation на canvas (биолог может кликать внутри zone не теряя ability добавить узел).

### DEC-T4-05 — 8 resize handles 12×12 visible on hover
CSS `:hover` opacity transition. Cursor: nwse-resize / nesw-resize / ns-resize / ew-resize при hover на handle.

### DEC-T4-06 — Drop hit-detection on pointer-up, не drag-over
Меньше re-renders. При drag — обычный pointer-move без обнаружения. При pointer-up — единичный hit-test через findZoneAtPoint.

Альтернатива (drag-over обновляет UI highlight target zone) — медленнее, добавляет complexity. Skip в T4. Visual hint при drag-over — T-future polish.

### DEC-T4-07 — Drag zone — атомарный action DRAG_ZONE
`DRAG_ZONE(zoneId, delta)` в одном reducer call: zone.bounds.x/y += delta + positions всех узлов в zone += delta.

Альтернатива (отдельные actions UPDATE_ZONE_BOUNDS + UPDATE_POSITIONS) — два re-render между ними, узлы могут моментально смещаться без рамки. Атомарный лучше.

### DEC-T4-08 — Resize с anchor-preservation
Drag правого нижнего — x/y не меняется, только width/height. Drag левого верхнего — x/y меняются, width/height inverse. Узлы внутри **остаются в same canvas positions** (НЕ scaled). Это противоположно «scaling drawing»: биолог ожидает что узлы не двигаются от resize рамки.

### DEC-T4-09 — Merge zones через context-menu
Не keyboard shortcut. Action в меню видим, понятен. Хоткей назначить можем позже.

### DEC-T4-10 — Context-menu — DOM popover, не radix portal
Простой `<div>` absolute. Click outside — close. Без dependency на radix-ui.

### DEC-T4-11 — Cross-zone junctions — dashed pattern + warning icon
Существующий junction SVG — solid + stitch markers. Cross-zone — dashed (`stroke-dasharray: 6,3`) + warning icon SVG в середине линии. Style в `zone-cross-junction-style.js` для shared usage.

### DEC-T4-12 — Auto-resize через finalizer, не inline в каждом action
Производительность: 1 finalizer call после dispatch вместо N inline recomputes. Pattern существует (ensureGhostPlaceholder, selectedContainerIds cleanup).

### DEC-T4-13 — Drop в overlapping zones — outer-most (largest area)
Intuitive — биолог обычно drag в большую zone. Маленькую (вложенную) трудно достать точно. Largest bounds wins.

### DEC-T4-14 — Drop в loose space — node.zoneId=null
Legitimate workflow (node бесхозный). Toast info объясняет. Биолог может WRAP_LOOSE_NODES_IN_ZONE позже.

### DEC-T4-15 — Collapse — visual only, не affecting interactions
Body hidden через overflow:hidden. Узлы внутри **physically существуют** на canvas (absolute positioned), но visually скрыты (clip). Junctions с узлами в collapsed zone — рисуются (линии идут "за рамку"). Не удаляет node visibility — если биолог хочет реально скрыть, pan to away.

В T-future: collapsed zone рендерит mini-thumbnail (post-MVP).

### DEC-T4-16 — RAF throttle на drag pointer-move
1 DRAG_ZONE на frame (16ms). Без throttle — 120 dispatches/sec на быстрой мыши, reducer перегружен.

```javascript
let rafId = null;
let pendingDelta = {dx: 0, dy: 0};
function onPointerMove(e) {
  pendingDelta.dx += e.movementX;
  pendingDelta.dy += e.movementY;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    dispatch({ type: 'DRAG_ZONE', zoneId, delta: {...pendingDelta} });
    pendingDelta = {dx: 0, dy: 0};
    rafId = null;
  });
}
```

### DEC-T4-17 — Tests: 2753 (T3) → ~2790 (T4)
~37 новых тестов (helpers + components + integration).

---

## 5. Components / API / actions

### 5.1 ZoneFrame.jsx

**Props:**
- `zone: Zone` — данные zone.
- `nodeCount: number` — counter из ZoneLayer.
- `finalProductCount: number` — для T9 visual hint (в T4 не используется visually, prop passing reserved).
- `onDragStart, onDragMove, onDragEnd` — drag handlers (header drag).
- `onResize: (edge, delta) => void` — resize handler.
- `onContextMenu: (e) => void` — right-click.
- `onClickHeader: (e) => void` — двойной клик → toggle collapse.

**Структура (псевдо-JSX, не код):**

```
<div className="zone-frame" style={{ position: 'absolute', left: zone.bounds.x, top: zone.bounds.y, width: zone.bounds.width, height: zone.collapsed ? 28 : zone.bounds.height, zIndex: 1 }}>
  <div className="zone-header" onPointerDown={onDragStart} onContextMenu={onContextMenu} onDoubleClick={onClickHeader}>
    <span className="zone-name">{zone.name}</span>
    <span className="zone-counter">{nodeCount} {pluralize('узел', 'узла', 'узлов', nodeCount)}</span>
    {zone.notes && <span className="zone-notes-badge" title={zone.notes}>📝</span>}
  </div>
  {!zone.collapsed && <div className="zone-body" style={{pointerEvents:'none'}} />}
  {!zone.collapsed && <ResizeHandles onResize={onResize} />}
</div>
```

`pointer-events: none` на `.zone-body` — клики проходят через body на canvas (containers, drop targets). На header и ResizeHandles — events работают.

### 5.2 ZoneLayer.jsx

**Props:**
- `state: SkeletonState`.
- `dispatch: function`.

**Логика:**

```
function ZoneLayer({ state, dispatch }) {
  const zones = selectAllZones(state);
  const [draggingZoneId, setDraggingZoneId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // {zoneId, x, y} or null

  return (
    <>
      {zones.map((zone) => (
        <ZoneFrame
          key={zone.id}
          zone={zone}
          nodeCount={countNodesInZone(state, zone.id)}
          finalProductCount={selectFinalProductsInZone(state, zone.id).length}
          onDragStart={(e) => { setDraggingZoneId(zone.id); /* RAF setup */ }}
          onDragMove={(delta) => dispatch({ type: 'DRAG_ZONE', zoneId: zone.id, delta })}
          onDragEnd={() => setDraggingZoneId(null)}
          onResize={(edge, delta) => dispatch({ type: 'UPDATE_ZONE_BOUNDS', zoneId: zone.id, edge, delta })}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({zoneId: zone.id, x: e.clientX, y: e.clientY}); }}
          onClickHeader={(e) => dispatch({ type: 'SET_ZONE_COLLAPSED', zoneId: zone.id, collapsed: !zone.collapsed })}
        />
      ))}
      {contextMenu && (
        <ZoneContextMenu
          {...contextMenu}
          state={state}
          dispatch={dispatch}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

function countNodesInZone(state, zoneId) {
  const { containers, pieces, operations } = nodeListInZone(state, zoneId);
  return containers.length + pieces.length + operations.length;
}
```

### 5.3 ZoneContextMenu.jsx

Popover при right-click на zone. DOM `<div>` absolute, click-outside closes.

**Пункты:**
- «Переименовать» → inline edit на header (через InlineEditableTitle existing component).
- «Удалить зону» → confirm dialog → dispatch REMOVE_ZONE.
- «Объединить с...» → submenu список других zones → dispatch MERGE_ZONES.
- «Свернуть» / «Развернуть» → dispatch SET_ZONE_COLLAPSED.
- «Заметки...» → open inline notes textarea → dispatch UPDATE_ZONE_NOTES.
- «Обернуть бесхозные» → dispatch WRAP_LOOSE_NODES_IN_ZONE (с suggested name).

Структура — простой `<ul>` с `<li>` элементами. Hover highlights. Click — dispatch + close.

### 5.4 zone-interaction.js

```javascript
import { isPointInZone } from './zone-model';  // или из lib/zone-model

// Outer-most zone содержащая point (DEC-T4-13).
export function findZoneAtPoint(zones, point) {
  const matches = zones.filter((z) => isPointInZone(point, z));
  if (!matches.length) return null;
  return matches.sort((a, b) =>
    (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height)
  )[0];
}

// Какой resize handle активирован, или null.
// Returns 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'|null.
export function hitTestResizeHandle(zone, point, handleSize = 12) {
  const {x, y, width, height} = zone.bounds;
  const hs = handleSize;
  // Углы:
  if (Math.abs(point.x - x) <= hs && Math.abs(point.y - y) <= hs) return 'nw';
  if (Math.abs(point.x - (x + width)) <= hs && Math.abs(point.y - y) <= hs) return 'ne';
  if (Math.abs(point.x - x) <= hs && Math.abs(point.y - (y + height)) <= hs) return 'sw';
  if (Math.abs(point.x - (x + width)) <= hs && Math.abs(point.y - (y + height)) <= hs) return 'se';
  // Грани (middle):
  if (point.x > x + hs && point.x < x + width - hs) {
    if (Math.abs(point.y - y) <= hs) return 'n';
    if (Math.abs(point.y - (y + height)) <= hs) return 's';
  }
  if (point.y > y + hs && point.y < y + height - hs) {
    if (Math.abs(point.x - x) <= hs) return 'w';
    if (Math.abs(point.x - (x + width)) <= hs) return 'e';
  }
  return null;
}

// Compute new bounds после resize (delegate в lib/zone-bounds.js).
// Re-export для convenience.
export { resizeZoneBounds as computeResizeNewBounds } from '../lib/zone-bounds';
```

### 5.5 zone-cross-junction-style.js

```javascript
export const CROSS_ZONE_DASH = '6,3';   // SVG stroke-dasharray
export const CROSS_ZONE_COLOR = 'var(--zone-cross-warning)';
export const CROSS_ZONE_ICON_SIZE = 14;

export function isJunctionCrossZone(junction, state) {
  const z = selectJunctionZoneId(state, junction.id);
  return z === 'cross-zone';
}

// SVG path для warning triangle icon.
export const CROSS_ZONE_ICON_PATH = 'M7 1 L13 12 L1 12 Z'; // simple triangle
```

### 5.6 CanvasLayoutView.jsx changes

```javascript
// Импорты:
import ZoneLayer from './ZoneLayer';
import { findZoneAtPoint } from './zone-interaction';
import { selectZoneByNodeId } from '../store/selectors-zones';

// JSX — ZoneLayer первым (ниже nodes):
return (
  <div className="canvas-area" {...pointerHandlers}>
    <BackgroundGrid />
    <ZoneLayer state={state} dispatch={dispatch} />  {/* NEW */}
    {/* existing: containers, operations, junctions, drag preview */}
    {containers.map((c) => <ContainerBlock ... />)}
    {operations.map((op) => <OperationNode ... />)}
    <JunctionLayer state={state} />
    <DropPreviewOverlay />
  </div>
);

// pointer-up handler — добавление T4 hit-detection после existing logic:
function onPointerUp(e) {
  // ...existing logic для drag container/operation/piece, drag-to-connect, ghost-respawn...

  // T4 NEW: drop hit-detection в zone.
  if (dragging && dragging.hasMoved && ['container', 'operation', 'piece'].includes(dragging.kind)) {
    const canvasPoint = canvasPointFromEvent(e, canvasRef);
    const targetZone = findZoneAtPoint(state.zones || [], canvasPoint);
    const currentZone = selectZoneByNodeId(state, dragging.nodeId);
    const targetZoneId = targetZone?.id ?? null;
    const currentZoneId = currentZone?.id ?? null;
    if (currentZoneId !== targetZoneId) {
      dispatch({
        type: 'MOVE_NODE_TO_ZONE',
        nodeType: dragging.kind,
        nodeId: dragging.nodeId,
        targetZoneId,
      });
    }
  }
}
```

### 5.7 skeleton-state.js finalizer extension

После всех sub-reducers + ensureGhostPlaceholder + selectedContainerIds cleanup:

```javascript
// T4 NEW: auto-recompute zone bounds для zones с autoResize=true.
if (next && Array.isArray(next.zones) && next.zones.length > 0) {
  const positionsChanged = next.positions !== state.positions;
  const containersChanged = next.containers !== state.containers;
  const piecesChanged = next.pieces !== state.pieces;
  const operationsChanged = next.operations !== state.operations;
  const zonesChanged = next.zones !== state.zones;
  if (positionsChanged || containersChanged || piecesChanged || operationsChanged || zonesChanged) {
    const recomputedZones = next.zones.map((zone) => {
      if (!zone.autoResize) return zone;
      const newBounds = computeZoneBoundingBox(next, zone.id, 40);
      if (!newBounds) return zone;  // empty zone — keep
      if (
        newBounds.x === zone.bounds.x &&
        newBounds.y === zone.bounds.y &&
        newBounds.width === zone.bounds.width &&
        newBounds.height === zone.bounds.height
      ) return zone;
      return { ...zone, bounds: newBounds, updatedAt: Date.now() };
    });
    if (recomputedZones.some((z, i) => z !== next.zones[i])) {
      next = { ...next, zones: recomputedZones };
    }
  }
}
```

Idempotent: повторный вызов на already-recomputed state — bounds equal → return same reference.

### 5.8 New actions in skeleton-state-zones.js

**DRAG_ZONE**

```
dispatch({ type: 'DRAG_ZONE', zoneId, delta: {dx, dy} });
```

Логика:
1. Find zone. Если нет — state.
2. Find все узлы в zone (containers + pieces + operations) через nodeListInZone.
3. Update zone.bounds.x += delta.dx, y += delta.dy.
4. Update positions[nodeId].x += delta.dx, y += delta.dy для каждого узла в zone.
5. Return new state. Один атомарный mutation.

**RECOMPUTE_ZONE_BOUNDS**

```
dispatch({ type: 'RECOMPUTE_ZONE_BOUNDS', zoneId });
```

Логика:
1. Find zone. Если autoResize=false — state (no-op).
2. computeZoneBoundingBox(state, zoneId, 40).
3. Если bounds physically equal — state. Иначе update bounds.

В T4 этот action вызывается **редко** (manual через context-menu «Подогнать под узлы»). Finalizer выполняет auto-recompute automatically — отдельный action нужен только для manual trigger.

### 5.9 STRINGS extension

```
zones: {
  // ...T3 existing
  contextMenu: {
    rename: 'Переименовать',
    remove: 'Удалить зону',
    mergeWith: 'Объединить с...',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    editNotes: 'Заметки...',
    wrapLoose: 'Обернуть бесхозные узлы',
    fitToNodes: 'Подогнать под узлы',
  },
  headerCounter: '{count} {nodes}',
  crossZoneTooltip: 'Связь между зонами «{a}» и «{b}»',
  collapsedHint: 'Зона свёрнута. Двойной клик для разворота.',
  confirmRemove: 'Удалить зону «{name}»? Узлы внутри станут бесхозными.',
  moveSuccessToZone: '«{node}» перемещён в «{zone}»',
  moveSuccessToLoose: '«{node}» стал бесхозным',
},
```

### 5.10 Design tokens (DESIGN_SYSTEM.md extension)

```
--zone-border: rgba(0, 0, 0, 0.15);
--zone-border-active: rgba(0, 0, 0, 0.3);    /* during drag/resize */
--zone-bg: rgba(0, 0, 0, 0.02);              /* subtle tint */
--zone-header-bg: rgba(0, 0, 0, 0.05);
--zone-header-fg: var(--text-2);
--zone-header-counter-fg: var(--text-3);
--zone-resize-handle: var(--accent-1);
--zone-resize-handle-hover: var(--accent-1-hover);
--zone-cross-warning: var(--warning-fg, #d97706);
--zone-context-menu-bg: var(--surface-1);
--zone-context-menu-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
```

Dark theme — соответствующие inverse значения.

### 5.11 Cross-zone junction visualization

Existing JunctionLayer в CanvasLayoutView читает `state.junctions` и рисует SVG `<path>` для каждого. T4 расширяет — для каждой junction перед draw проверяется `isJunctionCrossZone(j, state)`:

```javascript
{state.junctions.map((j) => {
  const isCross = isJunctionCrossZone(j, state);
  return (
    <path
      key={j.id}
      d={pathFromJunction(j, state.positions)}
      stroke={isCross ? 'var(--zone-cross-warning)' : 'var(--junction-stroke)'}
      strokeDasharray={isCross ? '6,3' : 'none'}
      ...
    />
    {isCross && (
      <CrossZoneWarningIcon
        position={midpointOf(j, state.positions)}
        tooltip={crossZoneTooltipText(j, state)}
      />
    )}
  );
})}
```

`CrossZoneWarningIcon` — маленький inline SVG (triangle 14×14) absolute positioned в midpoint линии. Hover показывает tooltip («Связь между зонами «A» и «B»»).

---

## 6. Порядок выполнения

**K1.** `canvas/zone-interaction.js` — pure helpers (findZoneAtPoint, hitTestResizeHandle, re-export computeResizeNewBounds).

**K2.** `canvas/zone-cross-junction-style.js` — style constants + isJunctionCrossZone + icon SVG path.

**K3.** `canvas/ZoneFrame.jsx` — single frame component. Структура §5.1. ResizeHandles inline или sub-component.

**K4.** `canvas/ZoneContextMenu.jsx` — right-click popover. Все 7 пунктов dispatching.

**K5.** `canvas/ZoneLayer.jsx` — wrapper рендерящий все zones. RAF throttle для drag.

**K6.** Action DRAG_ZONE в `skeleton-state-zones.js` (§5.8).

**K7.** Action RECOMPUTE_ZONE_BOUNDS в `skeleton-state-zones.js`.

**K8.** Расширить `CanvasLayoutView.jsx`:
- Импорт ZoneLayer + findZoneAtPoint + selectZoneByNodeId.
- Render ZoneLayer (после BackgroundGrid, перед containers).
- pointer-up расширение для drop hit-detection (§5.6).

**K9.** Расширить `CanvasGraphView.jsx` аналогично.

**K10.** Finalizer auto-recompute в `skeleton-state.js` (§5.7).

**K11.** Cross-zone junction visualization в CanvasLayoutView / CanvasGraphView (§5.11).

**K12.** Design tokens в DESIGN_SYSTEM.md + добавление CSS variables в global stylesheet.

**K13.** STRINGS namespace расширения (§5.9).

**K14.** Tests:
- `__tests__/canvas/zone-interaction.test.js` — findZoneAtPoint (outer-most logic, empty list, single match) + hitTestResizeHandle (8 углов/граней + outside) + computeResizeNewBounds delegates. ~8 тестов.
- `__tests__/canvas/ZoneFrame.test.jsx` — render correctly (name, counter, notes badge) + drag handler dispatches DRAG_ZONE + resize handler dispatches UPDATE_ZONE_BOUNDS + collapsed state hides body + double-click toggle. ~10 тестов.
- `__tests__/canvas/ZoneLayer.test.jsx` — N zones renders + RAF throttle (mocked rAF) + context-menu open/close. ~5 тестов.
- `__tests__/canvas/ZoneContextMenu.test.jsx` — все 7 пунктов dispatching + click outside close. ~7 тестов.
- `__tests__/integration/canvas-layout-zones.test.jsx`:
  - Drag node в zone — MOVE_NODE_TO_ZONE dispatched + node.zoneId обновлён.
  - Drag node в loose space — node.zoneId=null.
  - Drag zone — все child nodes перемещаются.
  - Resize zone — bounds change + nodes positions НЕ изменяются.
  - Drop в overlapping zones — outer-most.
  - Cross-zone junction rendered with dashed pattern.
  - ~6 тестов.
- `__tests__/integration/canvas-zone-finalizer.test.jsx`:
  - autoResize=true пересчитывает bounds после ADD_CONTAINER.
  - autoResize=false bounds unchanged.
  - Finalizer idempotent (repeated dispatch не loops).
  - ~3 теста.

Total ~39 тестов. Baseline 2753 (T3 ожидаемый) → ~2792.

**K15.** Manual smoke:
1. Открыть /canvas-skeleton. Default zone «Сборка 1» visible (из T3).
2. Drag header — zone перемещается. Узлы внутри тоже двигаются.
3. Resize правого нижнего угла — рамка расширяется. Узлы остаются в same canvas positions.
4. Right-click → меню. «Удалить» → confirm → zone исчезает, узлы остаются (zoneId=null).
5. Создать вторую zone через context-menu существующей («Обернуть бесхозные» если есть бесхозные, иначе через dev-console).
6. Drag container из первой во вторую — counter в обеих обновляется. Junction (если был) — visualizes cross-zone dashed.
7. Двойной клик на header — collapse. Тело прячется, header остаётся. Снова двойной клик — expand.
8. Right-click → «Объединить с...» → submenu вторая zone → merge — обе → одна, merged bounds, merged name.

**K16.** Size budget check:
```bash
cd gui/designer/src/components/CanvasSkeleton
find . -name '*.jsx' -printf '%s %p\n' | sort -n | tail -15
find . -name '*.js' -printf '%s %p\n' | sort -n | tail -15
```

Особое внимание `CanvasLayoutView.jsx` (~21 KB ожидается). Если > 25 KB — alarm, T7 декомпозиция required раньше.

---

## 7. STOP-условие

Code останавливается после K16. НЕ финализирует RELEASES / DECISIONS / BUGS / PROJECT_STATE / ANCHORS / TECH_DEBT / COMPONENT_MAP / CLAUDE / package.json / version.js.

Отчёт:

```
## T4 Zones Rendering — отчёт
Commits: ...
Vitest: 2753 → 2792 pass / 1 skip / 0 fail (+39)
pytest: 112/112
vite build: clean

Size budget:
- CanvasLayoutView.jsx: 21.X KB (was 16, +5) ✓
- CanvasGraphView.jsx: X.X KB (+3) ✓
- canvas/ZoneFrame.jsx: X.X KB (new) ✓
- canvas/ZoneLayer.jsx: X.X KB (new) ✓
- canvas/ZoneContextMenu.jsx: X.X KB (new) ✓
- canvas/zone-interaction.js: X.X KB (new) ✓
- canvas/zone-cross-junction-style.js: X.X KB (new) ✓
- skeleton-state-zones.js: ~16 KB (+1 DRAG_ZONE + RECOMPUTE) ✓
- skeleton-state.js: ~15 KB (+0.5 finalizer) ✓

Manual smoke:
- Zone visible, drag/resize works
- Drop node — MOVE_NODE_TO_ZONE dispatches
- Cross-zone junction dashed + warning icon
- Context-menu все actions работают
- Collapse/expand toggle двойным кликом

Spec deviations: [none / list]
Открытые вопросы: [none / list]
```

---

## 8. Что делать при регрессии

1. **CanvasLayoutView existing pointer-handlers падают** — ZoneLayer mount нарушил event propagation. Проверить `pointer-events: none` на `.zone-body`. ZoneLayer не должен capture pointer events на body.

2. **Drag node случайно вызывает DRAG_ZONE** — pointer-down на node проходит через zone body. Проверить `pointer-events: none` на body, `pointer-events: auto` на header только.

3. **Finalizer infinite loop** — bounds equality check возвращает false когда должно true. Проверить numeric comparison (целые числа, не floats — округлить через Math.round при write если drag floats).

4. **Tests T3 zone-model падают после T4** — T4 не должен трогать T3 lib. Если упало — bug в T4 zone-interaction overriding pure functions.

5. **Cross-zone junction не визуализируется** — порядок: junction render должен прочитать isJunctionCrossZone после того как pieces/containers загружены. Проверить useMemo deps или re-render trigger.

---

## 9. Риски

### R-T4-1 — Performance: 50 zones × N nodes × 60 fps drag
**Risk:** При drag zone — каждый pointer-move dispatches DRAG_ZONE → reducer пересчитывает positions всех nodes. На 50 nodes — приемлемо. 200+ — может тормозить.
**Mitigation:** RAF throttling (DEC-T4-16). Один dispatch на frame. Tests с mocked rAF.

### R-T4-2 — Finalizer auto-recompute infinite loop
**Risk:** Recompute возвращает different bounds → next render triggers reducer → bounds recomputed → … .
**Mitigation:** Strict equality check на 4 numeric fields (DEC-T4-12). Return original zone reference если equal. React `===` останавливает re-render.

### R-T4-3 — ZoneFrame перехватывает события containers
**Risk:** Container под рамкой не получает pointer-down.
**Mitigation:** `pointer-events: none` на `.zone-body` (DEC-T4-04). Header и ResizeHandles — `pointer-events: auto`. Tests верифицируют что click на canvas через body доходит до container.

### R-T4-4 — Resize угла математика сложна для NW
**Risk:** При drag NW нужно одновременно x/y += delta + width/height -= delta. Easy to bug.
**Mitigation:** Использовать `resizeZoneBounds` из T3 `zone-bounds.js` (уже unit-tested). Component test passes через эту функцию.

### R-T4-5 — Drop в overlapping zones — биолог попадает не туда
**Risk:** 2 zones overlap, маленькая поверх большой → drop в маленькую вместо большой.
**Mitigation:** DEC-T4-13 outer-most. Largest area wins. UX-acceptance с биологом обязательна — если "мелкая" intuitively ожидается → реверс DEC-T4-13.

### R-T4-6 — Cross-zone junction icon перекрывает stitch markers
**Risk:** Cross-zone warning icon в midpoint линии может попасть в место где уже stitch marker (Gibson overhang badge).
**Mitigation:** Smart positioning: если midpoint near existing marker → shift на 20px вдоль линии. T4 — простая реализация (center), T-future polish — smart shift.

### R-T4-7 — Browser context menu vs custom ZoneContextMenu
**Risk:** Right-click на zone должен показать наш menu, но browser default menu может перекрыть если `e.preventDefault()` не сработал.
**Mitigation:** В ZoneFrame `onContextMenu` — `e.preventDefault()` обязательно. Tests verifies.

---

## 10. Открытые вопросы для Chat

1. Default zone bounds в buildInitialState (T3) — `{x:40, y:40, width:600, height:400}`. После K15 smoke — visually OK? Если узлы вылезают за bounds — увеличить дефолт.
2. Collapsed zone height — 60px (только header + 32 padding). Норм или больше нужно?
3. Resize handle size — 12×12 visible on hover. Достаточно intuitive или нужно 16×16?
4. Cross-zone junction — кроме dashed + warning icon — нужен ещё confirm dialog при попытке dispatch OP_EXECUTE для op с cross-zone inputs? (Биологически реакция возможна, но композиция сборки спутана.)

Дефолт ответа: оставить как описано, корректировать на UX-приёмке.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров в §0, нет блокирующего decomp.
- [x] Контекст + стратегия (§1-2), reference на existing canvas layer pattern.
- [x] Scope IN/OUT (§3).
- [x] DEC-T4-01..17.
- [x] Components + actions + finalizer (§5).
- [x] K1-K16.
- [x] STOP-условие + формат отчёта (§7).
- [x] 7 рисков с митигациями (§9).
- [x] Открытые вопросы (§10).
- [x] Размер 45-55 KB target.
- [x] Reference на якорь + T3 в заголовке.
- [x] Никакого Sequence-mode (явный scope OUT, T7).

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-07, 11, 12, 14.
**Следующий sprint:** T5 — 4 способа задать piece (UI authoring).
