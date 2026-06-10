# SPRINT_T3_ZONES_DATA_AND_FRAMES.md — `state.zones` slice + поле `zoneId` на узлах

> **Тип:** A (data layer + state).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-07, 08, 12, 13, 14, 27, 28, 29).
> **Зависимости:** T1 (для piece.zoneId field). Может выполняться параллельно с T2 — slices не пересекаются.
> **Размер целевой:** 40-45 KB.
> **Цель:** добавить новую state-сущность zone (фрейм в Miro style) + поле `zoneId?: string | null` на containers/pieces/operations. Без visual rendering — это T4. Только data, actions, selectors, migration v5→v6.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state.js` | ~14 KB | soft 20 / hard 25 | +2 строки (импорт + chain) |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-zones.js` | — (новый) | soft 20 / hard 25 | ~12-15 KB |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-canvas.js` | ? | soft 20 / hard 25 | +cascade clear zoneId при REMOVE_CONTAINER (~0.3 KB) |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-operations.js` | ? | soft 20 / hard 25 | +set zoneId в createOperationDraft (~0.3 KB) |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-pieces.js` | ~10-15 KB (T1) | soft 20 / hard 25 | +SET_PIECE_ZONE action wired в reducer + cascade zoneId (~0.5 KB) |
| `gui/designer/src/components/CanvasSkeleton/lib/zone-model.js` | — (новый) | soft 20 / hard 25 | ~5-7 KB pure helpers |
| `gui/designer/src/components/CanvasSkeleton/lib/zone-invariants.js` | — (новый) | soft 20 / hard 25 | ~3-4 KB hard caps + validation |
| `gui/designer/src/components/CanvasSkeleton/lib/zone-bounds.js` | — (новый) | soft 20 / hard 25 | ~5-7 KB resize/drag/merge geometry |
| `gui/designer/src/components/CanvasSkeleton/store/selectors-zones.js` | — (новый) | soft 20 / hard 25 | ~6-8 KB selectors |
| `gui/designer/src/components/CanvasSkeleton/lib/skeleton-persistence.js` | ? (после T2 + ~1.5 KB) | soft 20 / hard 25 | +migrateV5toV6 (~0.8 KB) |

**Decomp не требуется** — все новые файлы под soft. Существующие slice'ы расширяются минимально (cascade only).

**R7 риск (R-T3-1 ниже):** `skeleton-state-zones.js` может превысить soft 20 KB после T4 (resize/drag/merge поведение). T3 предусмотрел split `zone-bounds.js` отдельным файлом для geometry — это снимает основной риск.

---

## 1. Контекст

### 1.1 Что после T1+T2 в коде

State имеет 5 primary slices: containers / operations / junctions (внутри canvas) / pieces / assemblyDrafts. Pieces имеют поле `zoneId: null` в shape (DEC-T1-12), но не используются — placeholder для T3.

Бумажная диаграмма биолога (см. SPEC_M-CANVAS-FOUR-TIER §1.2) показывает 6 смысловых блоков-сборок. На бумаге они различимы layout-ом без рамок. В BodgeGene биолог явно попросил **формальные зоны** как Miro-фреймы (Q-new-1 пересмотр 16.05) для решения проблемы фокуса в проектах с множественными сборками.

### 1.2 Что добавляется в T3

**Новое:**
- `state.zones: Zone[]` slice.
- Поле `container.zoneId?: string | null` (опциональное, default null).
- Поле `piece.zoneId?: string | null` (уже в shape с T1, активируется в T3).
- Поле `operation.zoneId?: string | null` (опциональное, default null).
- Поле `junction.zoneId?: string | null` — derived (вычисляется через selector от соединяемых узлов).
- 12 actions для CRUD zone + node-zone assignment.
- Helpers `lib/zone-model.js`, `lib/zone-invariants.js`, `lib/zone-bounds.js`.
- Selectors `selectors-zones.js`.
- Migration v5→v6 — заполняет `zoneId: null` для всех existing nodes.

**Не добавляется:**
- Visual rendering фреймов на canvas (T4).
- Drag-and-drop узлов между зонами (T4 — это UI interaction).
- Resize углов рамки через drag (T4 — UI).
- Merge двух зон через context-menu (T4 — UI).
- ViewMode toggle G/S (T7).

T3 — чисто data layer. После T3 zone-объекты можно создавать через dev-console / тесты, но visual не появляется и интерактивность нулевая.

### 1.3 Backward-compat soft migration

DEC-CANVAS-4T-13: `zoneId = null` допустим. Старые projects (pre-T3) — все узлы остаются с `zoneId = null` после migration. Биолог может вручную обернуть бесхозные узлы в новую зону (action `WRAP_LOOSE_NODES_IN_ZONE`).

Новые projects (после T3) — `buildInitialState` создаёт одну пустую зону по умолчанию `Сборка 1` (DEC-T3-08). Все новые узлы автоматически получают `zoneId = defaultZone.id` при добавлении (если есть default zone).

---

## 2. Стратегия

Existing pattern — sub-reducer + buildInitial + chain. Минимальная инвазивность в `skeleton-state.js`.

**Cascade rules** — критическая часть T3:
- **CREATE_ZONE** — добавляет в state.zones.
- **REMOVE_ZONE** — удаляет zone. Узлы в этой zone — НЕ удаляются, получают `zoneId = null` (становятся бесхозными). Биолог может потом ассоциировать с другой zone.
- **MOVE_NODE_TO_ZONE** — атомарный action, перенос узла из одной zone в другую. Затрагивает junctions:
  - Если перемещаемый узел был соединён junction'ом с узлом в **исходной** zone — junction остаётся (узлы могут быть в разных zones, junction глобален).
  - **Warning toast** "перемещение узла X из зоны A в зону B: связи с N узлами зоны A сохранены — сборка может быть некорректной".
- **MERGE_ZONES** — две zones → одна. Узлы обеих получают zoneId merged. Bounds — bounding box обеих. Имя — диалог (`name` параметр в action).

**Migration v5→v6** — pure:
- Если snapshot не имеет `zones` field → добавить `zones: []`.
- Все existing узлы (containers / operations / pieces) — `zoneId = null` (бесхозные, биолог может потом обернуть).
- schemaVersion = 6.

**Default zone для новых projects** — DEC-T3-08:
- `buildInitialState()` создаёт `defaultZone = createZone({ name: 'Сборка 1', bounds: {x:40, y:40, width:600, height:400} })`.
- `state.zones = [defaultZone]`.
- Существующий `ensureGhostPlaceholder` (V61 finalizer) при creating новый placeholder — ставит `zoneId = defaultZone.id` если default zone есть.
- При REPLACE_STATE с pre-T3 snapshot — defaults применяются (см. existing REPLACE_STATE pattern в skeleton-state.js).

---

## 3. Scope IN / OUT

### IN
- `state.zones: Zone[]` slice + `skeleton-state-zones.js` sub-reducer.
- Поле `zoneId?: string | null` на containers (T3 расширяет shape), pieces (T1 имел shape, T3 активирует), operations (T3 расширяет shape).
- 12 actions: CREATE_ZONE / REMOVE_ZONE / UPDATE_ZONE_NAME / UPDATE_ZONE_BOUNDS / UPDATE_ZONE_NOTES / SET_ZONE_COLLAPSED / MOVE_NODE_TO_ZONE / WRAP_LOOSE_NODES_IN_ZONE / MERGE_ZONES / SPLIT_ZONE (post-MVP — placeholder action) / SET_ZONE_VIEW_MODE (T7 будет использовать).
- Helpers:
  - `lib/zone-model.js`: createZone, computeZoneBoundingBox, isPointInZone, nodeListInZone.
  - `lib/zone-invariants.js`: hard caps + validation.
  - `lib/zone-bounds.js`: resizeZoneBounds, dragZoneBounds, mergeBoundingBoxes (используется в T4 для UI, в T3 — pure utility для action handlers).
- Selectors `selectors-zones.js`:
  - selectAllZones, selectZoneById, selectZoneByNodeId, selectLooseNodes, selectNodesInZone, selectJunctionsInZone, selectDefaultZone, selectFinalProductsInZone.
- Migration v5→v6 в `skeleton-persistence.js`.
- Tests (~35 тестов).
- STRINGS namespace `canvasSkeleton.zones.*` placeholder.

### OUT
- Visual rendering (T4).
- UI interactions: drag node между zones, drag границ, context-menu merge (T4).
- ViewMode toggle G/S (T7).
- Auto-numbering reactions per-zone (отдельная логика T6/T7).
- Финал зоны как явное поле (computed selector — T9).
- Connection between zones (T8).

### NOT TOUCHED
- canvas/operations adapters — не знают про zones.
- Library / Importer / SequenceView — zones внутри them бессмысленны.

---

## 4. Архитектурные решения

### DEC-T3-01 — Один sub-reducer файл, но geometry в отдельном lib
`skeleton-state-zones.js` ~12-15 KB (под soft 20). Geometry pure helpers (`zone-bounds.js`) отдельно — не разрастёт reducer при добавлении resize/drag/merge UI в T4. **Превентивный split** под R-T3-1.

### DEC-T3-02 — Zone.id префикс `zn-` + uuidv7
Параллельно `pc-` (T1), `c-` (containers), `op-` (operations).

### DEC-T3-03 — Zone имеет bounds (rect), не shape
Прямоугольник `{x, y, width, height}`. Не circular / polygon — это Miro-like frame, простой rect. Округление углов — concern T4 visual rendering, в данных нет.

### DEC-T3-04 — Минимальный размер зоны 200×120
Чтобы помещалось имя + 1 узел минимально. Hard invariant. При попытке resize < минимум — clamp.

### DEC-T3-05 — Максимальный размер зоны не лимитирован
Биолог может растянуть на весь canvas. Защита от runaway — soft warning при width|height > 10000.

### DEC-T3-06 — Резиновый размер (DEC-CANVAS-4T-14)
Computed bounding box узлов внутри zone + padding 40px. При добавлении узла, не помещающегося в текущий bounds — bounds расширяется. При удалении узла — bounds НЕ сокращается автоматически (биолог может drag углов чтобы сократить).

Это **opt-in auto-resize**: zone.autoResize: boolean. Default true. Биолог может отключить если хочет фиксированную zone.

### DEC-T3-07 — Hard cap 50 zones на project
Биолог реалистично имеет 5-15 zones (бумажная диаграмма — 6). 50 — порог защиты.

### DEC-T3-08 — Default zone «Сборка 1» в новых projects
`buildInitialState()` создаёт. Pre-T3 projects (через migration) — НЕТ default zone (узлы бесхозные).

### DEC-T3-09 — REMOVE_ZONE — узлы становятся бесхозными, НЕ удаляются
DEC-CANVAS-4T-12 (zones мутируемы). Удаление zone — это удаление **группировки**, не данных.

### DEC-T3-10 — MOVE_NODE_TO_ZONE — один action для всех node типов
Не отдельный MOVE_CONTAINER_TO_ZONE / MOVE_PIECE_TO_ZONE / MOVE_OPERATION_TO_ZONE. Action принимает `nodeType: 'container'|'piece'|'operation'` + `nodeId` + `targetZoneId`. Reducer диспатчит в нужный slice.

### DEC-T3-11 — Junction.zoneId — derived через selector
Junction соединяет два узла (типа container или piece). Если оба узла в same zone — junction.zoneId = same. Если в разных zone — `selectJunctionZoneId` возвращает 'cross-zone'. Junction.zoneId НЕ хранится — это computed через selector.

В T-future (post DEC-CANVAS-4T-30 — junction между pieces) — это всё ещё computed.

### DEC-T3-12 — MERGE_ZONES — bounds = bounding box обеих, name из параметра
```
action MERGE_ZONES { zoneIds: [zoneA, zoneB], name: string }
```
1. Validate оба zone существуют.
2. New bounds = bounding box (mergeBoundingBoxes из zone-bounds.js).
3. Создать new zone с merged bounds + name.
4. Reassign все узлы из zoneA и zoneB на newZone.id.
5. Remove zoneA + zoneB.

Альтернатива «keep one zone, transfer all into it» — нет: bounds может не совпадать. Lossy. Лучше create new + transfer.

### DEC-T3-13 — WRAP_LOOSE_NODES_IN_ZONE
Action для biolog: «возьми все nodes с zoneId=null и оберни в новую zone». Параметры: `name: string`. Если loose nodes нет — no-op + info toast. Bounds — bounding box loose nodes + 40 padding.

### DEC-T3-14 — Migration v5→v6 — pure, добавляет zones: []
Старые projects получают пустой массив. Default zone НЕ создаётся (это противоречило бы pre-T3 visual — биолог открыл старый project, не видит ничего нового, узлы on canvas как были). Биолог может вручную WRAP_LOOSE_NODES_IN_ZONE.

### DEC-T3-15 — REPLACE_STATE с pre-T3 snapshot — добавляет defaults
Существующий pattern: REPLACE_STATE merge'ит `buildInitialState()` defaults с loaded state. Если loaded state не имеет zones field — defaults подставляются.

**Подводный камень:** для новых project (initial) buildInitialState создаёт `[defaultZone]`. Для loaded snapshot — `[]` ИЛИ ранее saved `[...zones]`. Это противоречие. Решение: REPLACE_STATE проверяет — если loaded snapshot имеет `zones` field (даже пустой `[]`) → keep loaded. Если field отсутствует → migration уже добавила `zones: []` (НЕ creating default zone — миграция нерасстаноrвочна).

### DEC-T3-16 — Zone notes — short string ≤2000 chars
User comments на zone (например "сборка 1, делаем pks4 knockout"). Hard cap чтобы не replicated в snapshot inflate.

### DEC-T3-17 — Tests: 2715 (T2) → ~2750 (T3)
~35 новых тестов.

---

## 5. Shape + actions + helpers

### 5.1 Zone shape

```javascript
// lib/zone-model.js
/**
 * @typedef {Object} Zone
 * @property {string} id              // 'zn-<uuidv7>'
 * @property {string} name            // user, default 'Сборка N'
 * @property {Object} bounds          // {x, y, width, height} pixels canvas coordinates
 * @property {boolean} collapsed      // T4 — collapse/expand visual; T3 — shape только
 * @property {'graph'|'sequence'} viewMode  // T7 active; T3 default 'graph'
 * @property {boolean} autoResize     // DEC-T3-06 default true
 * @property {string|null} notes      // ≤2000 chars
 * @property {number} createdAt
 * @property {number} updatedAt
 */
```

### 5.2 Node shape extensions

```javascript
// containers, pieces, operations — все получают:
{
  ...existing fields...,
  zoneId: null | string,   // zone.id или null (бесхозный)
}

// junctions — derived через selector, поле НЕ хранится.
```

### 5.3 Actions

**CREATE_ZONE**

```
dispatch({
  type: 'CREATE_ZONE',
  zone: { name, bounds, notes? },
});
```

Логика:
1. Validate bounds (width >= 200, height >= 120).
2. Hard cap (state.zones.length < 50).
3. Create zone с id `'zn-' + uuidv7()`, defaults (collapsed: false, viewMode: 'graph', autoResize: true).
4. Append к state.zones.

**REMOVE_ZONE**

```
dispatch({ type: 'REMOVE_ZONE', zoneId });
```

Логика:
1. Find. Если нет — state.
2. Set zoneId=null на всех containers/pieces/operations с этим zoneId (узлы становятся бесхозными).
3. Remove zone из state.zones.

**UPDATE_ZONE_NAME / UPDATE_ZONE_BOUNDS / UPDATE_ZONE_NOTES / SET_ZONE_COLLAPSED / SET_ZONE_VIEW_MODE**

Стандартные merge-updates. Validate bounds. Bump updatedAt.

**MOVE_NODE_TO_ZONE**

```
dispatch({
  type: 'MOVE_NODE_TO_ZONE',
  nodeType: 'container' | 'piece' | 'operation',
  nodeId,
  targetZoneId: null | string,  // null = бесхозный
});
```

Логика:
1. Validate target zone exists (если не null).
2. Find node в нужном slice. Если не найден — state.
3. Set node.zoneId = targetZoneId. Bump updatedAt (если nodes имеют updatedAt — pieces да; containers нет, добавить НЕ в T3).
4. Toast info: «{nodeName} перемещён в {targetZoneName}» или «{nodeName} стал бесхозным».
5. Junctions с этим узлом — НЕ удаляются (derived zoneId через selector reflects новое состояние; если cross-zone — warning visualizes в T4).
6. Optional warning toast если junction теперь cross-zone: «связь {junctionId} стала cross-zone — сборка может быть некорректной».

**WRAP_LOOSE_NODES_IN_ZONE**

```
dispatch({
  type: 'WRAP_LOOSE_NODES_IN_ZONE',
  zoneName: string,
});
```

Логика:
1. Find все nodes с zoneId=null (containers + pieces + operations).
2. Если pусто — no-op + info toast «нет бесхозных узлов».
3. Compute bounding box loose nodes (через `lib/zone-bounds.js::computeBoundingBox`).
4. Create new zone с bounds = boundingBox + padding 40.
5. Set zoneId=newZone.id на всех loose nodes.

**MERGE_ZONES**

```
dispatch({
  type: 'MERGE_ZONES',
  zoneIds: [zoneAId, zoneBId, ...],
  mergedName: string,
});
```

Логика:
1. Validate ≥2 zones, все exist.
2. Compute merged bounds (boundingBox обеих).
3. Create new zone с merged name + bounds + notes (concatenated если есть).
4. Reassign всех узлов из zoneA/B/... на newZone.id.
5. Remove zoneA/B/... из state.zones.

**SPLIT_ZONE** (placeholder для post-MVP)

```
dispatch({ type: 'SPLIT_ZONE', zoneId, splitLine: 'horizontal'|'vertical', position: number });
```

В T3 — заглушка, возвращает state + warning toast «split не реализован». Реальный split — post-MVP.

### 5.4 Helpers (`lib/zone-model.js`)

```javascript
export function createZone({ name, bounds, notes = null }) {
  return {
    id: `zn-${uuidv7()}`,
    name: name || 'Без названия',
    bounds: { ...bounds },
    collapsed: false,
    viewMode: 'graph',
    autoResize: true,
    notes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Узлы в zone — все nodes с zoneId === zone.id, по типам.
export function nodeListInZone(state, zoneId) {
  return {
    containers: (state.containers || []).filter((c) => c.zoneId === zoneId),
    pieces: (state.pieces || []).filter((p) => p.zoneId === zoneId),
    operations: (state.operations || []).filter((op) => op.zoneId === zoneId),
  };
}

// Computed bounds от узлов + positions. Used в auto-resize.
export function computeZoneBoundingBox(state, zoneId, padding = 40) {
  const { containers, pieces, operations } = nodeListInZone(state, zoneId);
  const positions = state.positions || {};
  const points = [];
  for (const c of containers) {
    const pos = positions[c.id];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  for (const p of pieces) {
    const pos = positions[p.id];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  for (const op of operations) {
    const pos = op.position || positions[op.id];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  if (points.length === 0) return null;
  const minX = Math.min(...points.map((p) => p.x)) - padding;
  const minY = Math.min(...points.map((p) => p.y)) - padding;
  const maxX = Math.max(...points.map((p) => p.x)) + BLOCK_LINEAR_W + padding;
  const maxY = Math.max(...points.map((p) => p.y)) + BLOCK_LINEAR_H + padding;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Test point in bounds.
export function isPointInZone(point, zone) {
  return point.x >= zone.bounds.x
      && point.x <= zone.bounds.x + zone.bounds.width
      && point.y >= zone.bounds.y
      && point.y <= zone.bounds.y + zone.bounds.height;
}
```

### 5.5 Geometry (`lib/zone-bounds.js`)

```javascript
// Resize zone preserving anchor (т.е. drag правого нижнего угла).
export function resizeZoneBounds(zone, edge, delta) {
  // edge: 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'
  // delta: {dx, dy}
  // Returns new bounds clamped к минимуму (200×120).
}

// Drag zone (move all corners by same delta).
export function dragZoneBounds(zone, delta) {
  return {
    ...zone.bounds,
    x: zone.bounds.x + delta.dx,
    y: zone.bounds.y + delta.dy,
  };
}

// Bounding box нескольких rect'ов.
export function mergeBoundingBoxes(rects) {
  if (!rects.length) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Bounding box нескольких точек (для wrap loose nodes).
export function computeBoundingBox(points, padding = 40) {
  if (!points.length) return null;
  const minX = Math.min(...points.map((p) => p.x)) - padding;
  const minY = Math.min(...points.map((p) => p.y)) - padding;
  const maxX = Math.max(...points.map((p) => p.x)) + padding;
  const maxY = Math.max(...points.map((p) => p.y)) + padding;
  return { x: minX, y: minY, width: Math.max(200, maxX - minX), height: Math.max(120, maxY - minY) };
}
```

### 5.6 Invariants (`lib/zone-invariants.js`)

```javascript
export const ZONE_CAPS = {
  MAX_ZONES: 50,
  MIN_WIDTH: 200,
  MIN_HEIGHT: 120,
  SOFT_MAX_DIMENSION: 10000,
  MAX_NAME_LENGTH: 200,
  MAX_NOTES_LENGTH: 2000,
};

export function validateZoneCreate(state, rawZone) {
  if ((state.zones || []).length >= ZONE_CAPS.MAX_ZONES) {
    return { ok: false, error: `Превышен лимит ${ZONE_CAPS.MAX_ZONES} зон на проект` };
  }
  if (typeof rawZone.name !== 'string' || rawZone.name.length > ZONE_CAPS.MAX_NAME_LENGTH) {
    return { ok: false, error: `Имя зоны слишком длинное (макс ${ZONE_CAPS.MAX_NAME_LENGTH})` };
  }
  if (!rawZone.bounds || rawZone.bounds.width < ZONE_CAPS.MIN_WIDTH || rawZone.bounds.height < ZONE_CAPS.MIN_HEIGHT) {
    return { ok: false, error: `Размер зоны меньше минимума (${ZONE_CAPS.MIN_WIDTH}×${ZONE_CAPS.MIN_HEIGHT})` };
  }
  return { ok: true };
}

export function validateZoneUpdate(state, existingZone, changes) {
  // Аналогичные проверки applied к merged shape.
}
```

### 5.7 Selectors (`store/selectors-zones.js`)

```javascript
// Все zones.
export function selectAllZones(state) { return state.zones || []; }

// Zone по id или null.
export function selectZoneById(state, zoneId) { ... }

// Zone которой принадлежит node (containerId / pieceId / operationId).
export function selectZoneByNodeId(state, nodeId) {
  const allNodes = [
    ...(state.containers || []),
    ...(state.pieces || []),
    ...(state.operations || []),
  ];
  const node = allNodes.find((n) => n.id === nodeId);
  if (!node || !node.zoneId) return null;
  return selectZoneById(state, node.zoneId);
}

// Все loose nodes (zoneId=null).
export function selectLooseNodes(state) {
  return {
    containers: (state.containers || []).filter((c) => c.zoneId === null || c.zoneId === undefined),
    pieces: (state.pieces || []).filter((p) => p.zoneId === null || p.zoneId === undefined),
    operations: (state.operations || []).filter((op) => op.zoneId === null || op.zoneId === undefined),
  };
}

// Все nodes в zone (= nodeListInZone из zone-model).
export function selectNodesInZone(state, zoneId) {
  return nodeListInZone(state, zoneId);  // re-export
}

// Junctions с обоими концами в zone (если cross-zone — НЕ в этой).
export function selectJunctionsInZone(state, zoneId) {
  return (state.junctions || []).filter((j) => {
    const fromNode = findNode(state, j.from);
    const toNode = findNode(state, j.to);
    return fromNode?.zoneId === zoneId && toNode?.zoneId === zoneId;
  });
}

// Junction.zoneId derived — 'cross-zone' если разные, zoneId если одинаковые, null если хотя бы один loose.
export function selectJunctionZoneId(state, junctionId) {
  const j = (state.junctions || []).find((x) => x.id === junctionId);
  if (!j) return null;
  const fromNode = findNode(state, j.from);
  const toNode = findNode(state, j.to);
  if (!fromNode?.zoneId || !toNode?.zoneId) return null;
  if (fromNode.zoneId !== toNode.zoneId) return 'cross-zone';
  return fromNode.zoneId;
}

// Default zone (первая в порядке создания) — для seed новых node при auto-assign.
export function selectDefaultZone(state) {
  return (state.zones || [])[0] || null;
}

// Final products в zone — узлы containers без исходящих junctions (висящие концы).
// T9 будет использовать. В T3 — basic implementation.
export function selectFinalProductsInZone(state, zoneId) {
  const { containers } = nodeListInZone(state, zoneId);
  const outgoing = new Set((state.junctions || []).filter((j) => {
    const from = findNode(state, j.from);
    return from?.zoneId === zoneId;
  }).map((j) => j.from));
  return containers.filter((c) => !outgoing.has(c.id));
}

function findNode(state, nodeId) {
  return (state.containers || []).find((c) => c.id === nodeId)
      || (state.pieces || []).find((p) => p.id === nodeId)
      || (state.operations || []).find((op) => op.id === nodeId)
      || null;
}
```

### 5.8 Migration v5→v6

```javascript
function migrateV5toV6(snapshot) {
  if ((snapshot.schemaVersion ?? 5) >= 6) return snapshot;
  return {
    ...snapshot,
    zones: Array.isArray(snapshot.zones) ? snapshot.zones : [],
    containers: (snapshot.containers || []).map((c) => ({ ...c, zoneId: c.zoneId ?? null })),
    pieces: (snapshot.pieces || []).map((p) => ({ ...p, zoneId: p.zoneId ?? null })),
    operations: (snapshot.operations || []).map((op) => ({ ...op, zoneId: op.zoneId ?? null })),
    schemaVersion: 6,
  };
}
```

Idempotent: v6 snapshot вернётся unchanged.

### 5.9 Integration в router

`skeleton-state.js`:

```javascript
import {
  buildInitialZonesState,
  zonesReducer,
} from './skeleton-state-zones';

export function buildInitialState() {
  return {
    // ...existing base + slices...
    ...buildInitialPiecesState(),
    ...buildInitialZonesState(),  // NEW — после pieces
  };
}

// Router default case:
default: {
  next = canvasReducer(state, action);
  next = operationsReducer(next, action);
  next = editorReducer(next, action);
  next = assemblyReducer(next, action);
  next = piecesReducer(next, action);
  next = zonesReducer(next, action);  // NEW — последний
  break;
}
```

Zones reducer **последний** в chain потому что в T8 будет реагировать на cascade от REMOVE_NODE actions.

### 5.10 Cascade REMOVE_CONTAINER → zone не теряется
REMOVE_CONTAINER (existing M-CANVAS-OPS K4) удаляет container. T2 расширил: cascade в pieces. T3 расширяет: zone остаётся (она не зависит от naodes), но autoResize triggered — bounds могут пересчитаться если zone.autoResize=true.

Pseudo:
```
В canvasReducer.REMOVE_CONTAINER (после filter container):
  // T3 extension
  if (Array.isArray(state.zones)) {
    state.zones = state.zones.map((z) => {
      if (!z.autoResize) return z;
      // Если в этой zone был removed container — пересчитать bounds.
      // ...
    });
  }
```

Зональный recompute — может пересчитываться через `zonesReducer` action `RECOMPUTE_ZONE_BOUNDS` (auto-dispatched через finalizer в router после REMOVE_CONTAINER / ADD_CONTAINER / MOVE_NODE_TO_ZONE).

### 5.11 STRINGS namespace placeholder

```
zones: {
  defaultName: 'Сборка {n}',
  emptyZoneHint: 'Зона пуста',
  errorTooMany: 'Превышен лимит {limit} зон на проект',
  errorTooSmall: 'Размер зоны меньше минимума',
  errorNameTooLong: 'Имя зоны слишком длинное',
  moveSuccess: '{node} → {zone}',
  moveToLoose: '{node} стал бесхозным',
  wrapLooseSuccess: 'Бесхозные узлы обёрнуты в зону «{name}»',
  wrapLooseEmpty: 'Нет бесхозных узлов',
  mergeSuccess: 'Зоны объединены в «{name}»',
  splitNotImplemented: 'Разделение зон будет реализовано позже',
  removeWarning: 'Удаление зоны не удалит узлы — они станут бесхозными',
  crossZoneWarning: 'Связь {junction} стала cross-zone',
},
```

---

## 6. Порядок выполнения

**K1.** `lib/zone-model.js` — pure helpers (createZone, nodeListInZone, computeZoneBoundingBox, isPointInZone).

**K2.** `lib/zone-bounds.js` — geometry (resizeZoneBounds, dragZoneBounds, mergeBoundingBoxes, computeBoundingBox).

**K3.** `lib/zone-invariants.js` — caps + validate functions.

**K4.** `store/skeleton-state-zones.js` — buildInitialState + zonesReducer + 12 actions + isZoneAction.

**K5.** `store/selectors-zones.js` — 8 selectors.

**K6.** Расширить container shape — `containerFromLibraryEntry` (в `skeleton-state-canvas.js`) добавить `zoneId: defaultZoneId || null`.

**K7.** Расширить piece shape — `createPiece` (в `lib/piece-model.js`) — DEC-T3 уже учитывал `zoneId: null`. Возможно добавить opt-in `zoneId` в createPiece args для T5.

**K8.** Расширить operation shape — `createOperationDraft` (в `skeleton-state-operations.js`) добавить `zoneId: null` в shape.

**K9.** Integration в `skeleton-state.js` (§5.9). 2 строки.

**K10.** Default zone в `buildInitialState()` — `state.zones = [createZone({ name: 'Сборка 1', bounds: {...default} })]`. Возможно условно — только если `forceEmpty === false` (для тестов).

**K11.** Migration v5→v6 в `lib/skeleton-persistence.js`.

**K12.** Расширить REMOVE_CONTAINER cascade — добавить optional auto-recompute zone bounds (через finalizer в router после действия).

**K13.** Расширить existing actions:
- `ADD_CONTAINER_FROM_ENTRY` — auto-assign zoneId если есть default zone.
- `FILL_PLACEHOLDER` — zoneId сохраняется (placeholder уже имел zoneId? — yes, через extension K6).
- `OP_ADD` — auto-assign zoneId если op.position попадает в bounds какой-то zone (через selectZoneByPoint helper — opt-in).

**K14.** STRINGS namespace в `lib/strings.js`.

**K15.** Tests:
- `__tests__/lib/zone-model.test.js` — ~6 тестов.
- `__tests__/lib/zone-bounds.test.js` — ~5 тестов.
- `__tests__/lib/zone-invariants.test.js` — ~4 теста.
- `__tests__/store/skeleton-state-zones.test.jsx` — 12 actions через dispatcher, ~14 тестов.
- `__tests__/store/selectors-zones.test.js` — 8 selectors, ~6 тестов.
- `__tests__/lib/skeleton-persistence-migration-v6.test.js` — migration, ~3 теста.

Total ~38 тестов. Vitest baseline после T2 ~2715 → ~2753 после T3.

**K16.** Manual smoke (dev-console):
```javascript
// Создать zone:
window.skeletonDispatch({
  type: 'CREATE_ZONE',
  zone: { name: 'Сборка тест', bounds: {x: 100, y: 100, width: 600, height: 400} },
});

// Переместить container в zone:
const containerId = window.skeletonStore.getState().containers[0]?.id;
const zoneId = window.skeletonStore.getState().zones[0]?.id;
window.skeletonDispatch({
  type: 'MOVE_NODE_TO_ZONE',
  nodeType: 'container',
  nodeId: containerId,
  targetZoneId: zoneId,
});

// Wrap loose nodes:
window.skeletonDispatch({ type: 'WRAP_LOOSE_NODES_IN_ZONE', zoneName: 'Тест wrap' });

// Selectors:
window.skeletonStore.getState().zones;
selectLooseNodes(window.skeletonStore.getState());
```

**K17.** Size budget check.

---

## 7. STOP-условие

Code останавливается после K17. НЕ финализирует координационные файлы.

Отчёт:
```
## T3 Zones — отчёт
Commits: ...
Vitest: 2715 → 2753 pass / 1 skip / 0 fail (+38)
pytest: 112/112
vite build: clean

Size budget:
- skeleton-state-zones.js: X.X KB (new) ✓
- lib/zone-model.js: X.X KB (new) ✓
- lib/zone-bounds.js: X.X KB (new) ✓
- lib/zone-invariants.js: X.X KB (new) ✓
- store/selectors-zones.js: X.X KB (new) ✓
- skeleton-state.js: 14.4 KB (+0.2) ✓
- skeleton-persistence.js: X.X KB (+0.8) ✓

Migration verification:
- Pre-T3 snapshot — zones: [], все nodes zoneId=null.
- v6 idempotent — повторный вызов = no-op.
- buildInitialState — создаёт 1 default zone.

Spec deviations: [list]
Manual smoke: [results]
Открытые вопросы: [list]
```

---

## 8. Риски

### R-T3-1 — `skeleton-state-zones.js` может вырасти за soft 20 KB после T4
**Risk:** T4 добавит UI actions (drag handles bounds, context-menu logic).
**Mitigation:** Превентивный split geometry в `zone-bounds.js` (DEC-T3-01). T4 расширения должны идти в `zone-bounds.js` или новый `zone-interaction.js`, не в reducer.

### R-T3-2 — Migration v5→v6 случайно перетирает existing zoneId
**Risk:** Если pre-T3 snapshot имеет `zoneId` field (теоретически невозможно) — migration `zoneId: c.zoneId ?? null` сохраняет.
**Mitigation:** Уже учтено в коде §5.8 — `??` chain.

### R-T3-3 — Default zone в buildInitialState ломает existing skeleton tests
**Risk:** Тесты ожидают `state.zones.length === 0` или undefined.
**Mitigation:** buildInitialState принимает `{ forceEmptyZones?: boolean }` opt — для тестов. Default false (создаёт default zone). Тесты T1/T2 которые сейчас зелёные не должны сломаться так как `state.zones` для них irrelevant.

### R-T3-4 — Cascade REMOVE_CONTAINER → autoResize zone — infinite loop
**Risk:** REMOVE_CONTAINER → recompute zone bounds → bounds change → autoResize triggers another recompute.
**Mitigation:** Recompute idempotent — second call возвращает same bounds. Тест явно verifies.

### R-T3-5 — selectJunctionsInZone / selectJunctionZoneId — O(N²) для большого state
**Risk:** Каждый junction делает 2 findNode (O(N) в containers+pieces+operations). Большой state — медленно.
**Mitigation:** В T3 — basic implementation. T4 (visual rendering) может потребовать оптимизацию (memoization через reselect или derived state). В T3 — accept basic perf.

### R-T3-6 — MOVE_NODE_TO_ZONE с null target — node теряет zoneId
**Risk:** UI biolog случайно перетащит node за границы zone → MOVE_NODE_TO_ZONE с null target.
**Mitigation:** Это **legitimate workflow** (node становится бесхозным). Toast info объясняет. Биолог может WRAP_LOOSE_NODES_IN_ZONE обратно.

---

## 9. Открытые вопросы для Chat

T3 — data layer без UI. Code должен спрашивать если:
1. Default zone bounds — что выбрать? Дефолт: `{x:40, y:40, width:600, height:400}` — место для 4-6 контейнеров.
2. Auto-assign zoneId при ADD_CONTAINER_FROM_ENTRY — если drop position попадает в bounds zone? Дефолт: yes, через `selectZoneByPoint`. Если в нескольких zone (overlapping) — outer-most.

---

## 10. Pre-handoff чеклист

- [x] Срез размеров в §0, decomp covered (превентивный zone-bounds.js).
- [x] Контекст + стратегия (§1-2).
- [x] Scope IN/OUT (§3).
- [x] DEC-T3-01..17.
- [x] Shape/actions/helpers/selectors/migration (§5).
- [x] K1-K17.
- [x] STOP-условие.
- [x] 6 рисков.
- [x] Открытые вопросы.
- [x] Размер 40-45 KB target.
- [x] Никакого UI rendering (явный scope OUT, T4 territory).
- [x] Reference на якорь + T1.

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-07, 08, 12, 13, 14, 27, 28, 29.
**Следующий sprint:** T4 — visual rendering zones + drag/resize/merge UI.
