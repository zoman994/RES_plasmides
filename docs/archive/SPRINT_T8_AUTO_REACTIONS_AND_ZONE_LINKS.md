# SPRINT_T8_AUTO_REACTIONS_AND_ZONE_LINKS.md — auto-create reactions + связи zone→zone

> **Тип:** A (data + UI + cross-domain sync).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-05, 23, 24, 30).
> **Зависимости:** T2 (op.inputPieces + bridge), T5 (piece.acquisitionMethod set'ится через UI), T7 (ATTACH_PIECE_TO_ASSEMBLY уже dispatched).
> **Размер целевой:** 40-50 KB.
> **Цель:** при изменении piece.acquisitionMethod (или ATTACH_PIECE_TO_ASSEMBLY с заданным методом) — автоматически создаются reaction-узлы в graph-mode. Если piece имеет sourceIds → containers из другой zone — рендерится визуальная связь zone→zone (badge «← из Зоны N»).

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `store/skeleton-state-pieces.js` | ~16 KB (T7) | soft 20 / hard 25 (.js) | +auto-reaction trigger в SET_PIECE_ACQUISITION_METHOD + ATTACH_PIECE_TO_ASSEMBLY, ~+2 KB → ~18 KB |
| `store/skeleton-state-operations.js` | ? | soft 20 / hard 25 | без изменений (createOperationDraft уже умеет commit=true) |
| `CanvasSkeleton/lib/auto-reaction-builder.js` | — (new) | soft 20 / hard 25 | ~8-10 KB pure builder logic |
| `CanvasSkeleton/lib/zone-link-resolver.js` | — (new) | soft 20 / hard 25 | ~5-7 KB resolve cross-zone piece sources |
| `canvas/ZoneLinkBadge.jsx` | — (new) | soft 30 / hard 40 (.jsx) | ~4-5 KB visual badge component |
| `canvas/ZoneFrame.jsx` | ~14 KB (T7) | soft 30 / hard 40 | +mount ZoneLinkBadges в header, ~+1 KB |
| `canvas/CanvasLayoutView.jsx` | ~21 KB (T4) | soft 30 / hard 40 | +cross-zone link rendering (если выбран — highlight), ~+1 KB |
| `store/selectors-pieces.js` | ~6-8 KB | soft 20 / hard 25 | +selectCrossZoneSourcesForZone, +selectAutoCreatedReactions, ~+1 KB |
| `lib/strings.js` | ~23 KB (T7 warn) | hard 25 | +zone-link strings ~+0.5 KB → ~23.5 KB ⚠ close к hard |

**Watch lib/strings.js** — T7 уже close. T8 добавляет ~0.5 KB. Если pass hard 25 — **K1 первая задача**: split namespace `strings-pieces.js` или `strings-zones.js` отдельным файлом. См. R-T8-1.

---

## 1. Контекст

### 1.1 Что после T1-T7

- `state.pieces` slice + piece.acquisitionMethod + piece.derivedReactionId.
- `state.zones` + viewMode + nodes имеют zoneId.
- `state.operations` имеют inputPieces (T2) + bridge helpers резолвят inputs.
- T5 UI устанавливает piece.acquisitionMethod (если способ В/Г — 'pcr').
- T7 ATTACH_PIECE_TO_ASSEMBLY устанавливает piece.order в zone.
- Migration v3→v7 закрыта.

**Auto-create reactions ещё не работает.** Когда биолог установил piece.acquisitionMethod='pcr' — никакой ромб PCR не появляется в graph. T8 это фиксит.

### 1.2 Что добавляется в T8

**Auto-create reaction.** Trigger — два события:
1. **SET_PIECE_ACQUISITION_METHOD** (T1 action) — биолог изменил метод piece. Если method не 'undefined' и не 'direct' — создать reaction-узел.
2. **ATTACH_PIECE_TO_ASSEMBLY** (T7 action) — биолог добавил piece в strip. Если piece.acquisitionMethod не 'undefined' и piece.derivedReactionId ещё null — создать reaction.

Обратный trigger:
3. **SET_PIECE_ACQUISITION_METHOD на 'undefined'** или **'direct'** — удалить derivedReaction (если есть).
4. **REMOVE_PIECE** (T1) — удалить derivedReaction (cascade, расширение T2 cascade).

**Reaction shape для auto-created:**
- `op.kind` — производное от piece.acquisitionMethod:
  - 'pcr' → kind='pcr'.
  - 'ov-pcr' → kind='gibson' (overlap-PCR amplifies + Gibson assembly OR `kind='ov-pcr'` если adapter будет добавлен — в T8 не добавляем).
  - 'restriction' → kind='cut' + downstream 'ligate' (см. §4 DEC-T8-04).
  - 'synthesis' → no reaction (synthesis — external, не algorithm step).
- `op.inputPieces` = [piece.id].
- `op.params` — empty или derived (primerPairId если present в piece.acquisitionParams).
- `op.status` = 'committed' (auto-committed, биолог может OP_EXECUTE).
- `op.position` — рассчитывается слева от piece visual position (in graph).
- `op.zoneId` = piece.zoneId.

**Zone→zone links.** Если piece.sourceIds содержит container из другой zone (piece.zoneId='A', container.zoneId='B') — это **cross-zone source**. В graph-mode (на zone A) — рендерится badge в header «← из Зоны B». Click на badge → pan + focus на zone B.

T8 — basic badge + click. Animated zone-to-zone transitions — T-future polish.

### 1.3 Что НЕ в T8

- Design variants (N reaction-узлов для variants) — T9.
- Clone variants — T9.
- MATERIALIZE_REACTION (выбор одного из N variants) — T9.
- Sanger lab notebook — T10.
- Smart auto-numbering reactions per-zone — post-MVP polish.

---

## 2. Стратегия

**Auto-create через finalizer pattern.** Аналогично T4 auto-recompute zone bounds (ensureGhostPlaceholder pattern). После каждого piece-related mutation — finalizer обходит все pieces, проверяет:
- piece.acquisitionMethod != 'undefined' && piece.acquisitionMethod != 'direct'.
- piece.derivedReactionId === null (reaction ещё не создан).
- → создать reaction-узел.

И обратно:
- piece.acquisitionMethod === 'undefined' && piece.derivedReactionId !== null.
- → удалить reaction-узел + обнулить derivedReactionId.

Finalizer вызывается из router в `skeleton-state.js` после chain'а sub-reducers. Один проход.

**Performance:** N pieces — O(N) проход. На 100 pieces — fast. RAF не нужен (finalizer не запускается на каждый pointer-move, а только на dispatch).

**Builders:**
- `lib/auto-reaction-builder.js`:
  - `shouldHaveReaction(piece): boolean` — return method !== 'undefined' && method !== 'direct' && method !== 'synthesis'.
  - `buildReactionForPiece(piece, state): Operation | null` — return new op data (без id, без commit).
  - `findInsertPositionForReaction(piece, state): {x, y}` — слева от piece position, с offset.
  - `shouldHaveAdditionalDownstreamReaction(piece): boolean` — true if method='restriction' (нужен ligation downstream).
  - `buildDownstreamReaction(piece, upstreamOpId, state): Operation | null`.

**Cross-zone links:**
- `lib/zone-link-resolver.js`:
  - `selectCrossZoneSourcesForZone(state, zoneId): Array<{containerId, sourceZoneId, sourceZoneName, pieceIds: string[]}>` — group cross-zone refs by source zone.
  - `selectZoneLinkPosition(state, fromZoneId, toZoneId): {fromPoint, toPoint}` — для linkrendering.

**Visual rendering:**
- `ZoneLinkBadge.jsx` — клик-handler, label «← из Зоны N».
- Mount в ZoneFrame header (extension T7 ZoneFrame).
- При клике — pan canvas к source zone (через scroll viewport).

---

## 3. Scope IN / OUT

### IN
- `lib/auto-reaction-builder.js` — pure builders для auto-create.
- `lib/zone-link-resolver.js` — cross-zone resolution helpers.
- Finalizer в `skeleton-state.js` — auto-create / auto-remove reactions.
- `canvas/ZoneLinkBadge.jsx` — visual badge.
- ZoneFrame integration — mount badges в header.
- Selectors: `selectCrossZoneSourcesForZone`, `selectAutoCreatedReactions`.
- STRINGS extension.
- Tests (~35 новых).

### OUT
- Design variants (T9).
- Clone variants (T9).
- MATERIALIZE_REACTION action (T9).
- Smart numbering reactions per-zone (T-future).
- Animations zone-to-zone navigation (T-future polish).
- Sanger MVP (T10).

### NOT TOUCHED
- T2 op-piece-bridge — auto-created ops уже работают через bridge.
- T5 UI flow — unchanged.
- T6/T7 sequence-mode — auto-reactions показываются только в graph-mode. В sequence-mode — implicit junctions T7.
- Library / Importer / SequenceView / Annotator.

---

## 4. Архитектурные решения

### DEC-T8-01 — Finalizer pattern для auto-create
Один проход после каждого dispatch. O(N pieces). Atomic. Не reactive subscription.

Альтернатива — middleware (subscribe на SET_PIECE_ACQUISITION_METHOD, дрегать reaction). Rejected — middleware усложняет, finalizer стабильнее.

### DEC-T8-02 — Reaction auto-committed
Сразу `status='committed'` — биолог может OP_EXECUTE без extra step. Биолог уже выбрал acquisitionMethod — это implicit commit.

Альтернатива (status='draft', биолог явно commit) — extra UI step, biolog раздражается.

### DEC-T8-03 — Reaction.inputPieces = [piece.id] (single-input default)
Для pcr / ov-pcr / restriction — один input piece (target). T9 будет добавлять multi-input для variants.

Gibson / Ligate с N pieces — НЕ auto-created в T8. Это происходит через explicit OP_ADD из T7 sequence-mode `BranchingVisual` (post-T7 manual action — implicit junction promote через JunctionMethodPicker).

В T8 auto-create — только **upstream PCR-like** reactions для pieces с acquisitionMethod.

### DEC-T8-04 — Restriction → 2 reactions (Cut + Ligate downstream)
Биологически: restriction даёт фрагмент через cut, потом фрагмент идёт в Gibson/Ligate с другими piece для финальной сборки. T8 создаёт только Cut (upstream), Ligate downstream — это implicit junction T7 при ATTACH_PIECE_TO_ASSEMBLY с другими piece.

Альтернатива (одиночный 'restriction' reaction kind) — нет такого kind в existing operations. Не добавляем новый kind в T8.

### DEC-T8-05 — Reaction position — слева от piece position в graph
piece имеет position на canvas (из state.positions). Reaction inserted at piece.position.x - 220, piece.position.y. Если позиция занята — shift down.

T8 — basic. Post-MVP — smart layout (force-directed, avoid overlap).

### DEC-T8-06 — derivedReactionId как обратная ссылка
piece.derivedReactionId = op.id. Установлен finalizer'ом при создании. Удалён finalizer'ом при удалении.

При REMOVE_OPERATION (М-CANVAS-OPS K5, existing action) — cascade clear derivedReactionId на всех piece. Расширение T8.

### DEC-T8-07 — Synthesis → no reaction
Synthesis = external order vendor. Не algorithm step. UI badge на piece «Заказан» / «Получен» (T7 PieceCard может показывать), но не reaction-узел в graph.

### DEC-T8-08 — Cross-zone link rendering — badge в zone-header
Не arrow на canvas (визуально шумно при N pairs). Badge в header «← из Зоны B» — click сompact pan.

Альтернатива — arrow между zones — rejected потому что на 6 zones × N cross-zone refs = 30+ arrows = шум.

### DEC-T8-09 — Click на badge — pan canvas к source zone
Smooth scroll viewport к bounds source zone. Existing pan logic (если нет — basic `scrollIntoView` через ref).

T8 — basic. Post-MVP — smooth animation + zoom-to-fit.

### DEC-T8-10 — Cross-zone link grouping by source zone
Если piece в zone A имеет 3 sources в zone B + 1 source в zone C — badges:
- «← Зона B (3 куска)».
- «← Зона C (1 кусок)».

Не показываем individual piece-by-piece — это шум. Group by source zone.

### DEC-T8-11 — Finalizer recursion prevention
Finalizer создаёт reaction → dispatch CREATE_OPERATION → reducer chain → finalizer снова. Bath потенциально infinite.

Mitigation: finalizer use **flag в reducer cycle** — `state.__autoReactionPassDone` (transient). После prevent повторного pass'а в одном dispatch. Сбрасывается в начале нового dispatch.

Альтернатива: finalizer проверяет `piece.derivedReactionId === null` — если уже non-null, не создаёт. Это уже достаточно (не нужен flag). Используем этот path.

### DEC-T8-12 — Cleanup при method change
Если piece.acquisitionMethod меняется (например 'pcr' → 'restriction'):
- Старый derivedReaction удалён.
- Новый derivedReaction created.
- piece.derivedReactionId обновлён.

Atomic в reducer. Finalizer detects state change и обновляет cascade.

### DEC-T8-13 — Layout collision detection — basic shift
Если auto-created reaction position попадает в existing op/container — shift на (50, 50) до 10 раз. Если не нашлось — fallback к фиксированной position в углу zone.

Post-MVP — smart layout.

### DEC-T8-14 — Tests baseline: 2910 (T7) → ~2945 (T8)
~35 новых tests.

---

## 5. Components / API / actions

### 5.1 auto-reaction-builder.js

```javascript
import { v7 as uuidv7 } from 'uuid';

/**
 * Должен ли piece иметь auto-created reaction?
 */
export function shouldHaveReaction(piece) {
  if (!piece) return false;
  if (piece.kind === 'gap') return false;
  const method = piece.acquisitionMethod;
  return method !== 'undefined' && method !== 'direct' && method !== 'synthesis';
}

/**
 * Map piece.acquisitionMethod на op.kind.
 */
export function mapMethodToKind(method) {
  switch (method) {
    case 'pcr': return 'pcr';
    case 'ov-pcr': return 'pcr';  // OV-PCR amplifies через regular PCR, overlap downstream — implicit
    case 'restriction': return 'cut';
    default: return null;
  }
}

/**
 * Build reaction-операция для piece. Returns Operation data (без id, без commit).
 */
export function buildReactionForPiece(piece, state) {
  const kind = mapMethodToKind(piece.acquisitionMethod);
  if (!kind) return null;

  // Position — слева от piece.
  const piecePosition = state.positions?.[piece.id] || { x: 200, y: 200 };
  const position = findInsertPositionForReaction(piecePosition, state);

  // Params — derived from piece.acquisitionParams.
  const params = {};
  if (kind === 'pcr' && piece.acquisitionParams?.primerPairId) {
    params.primerPairId = piece.acquisitionParams.primerPairId;
    // Template — первый container из sourceIds.
    if (piece.sourceIds.length > 0) {
      params.templateId = piece.sourceIds[0];
    }
    // Range из piece.ranges[0].
    if (piece.ranges.length > 0) {
      params.range = { start: piece.ranges[0].start, end: piece.ranges[0].end };
    }
  } else if (kind === 'cut' && piece.acquisitionParams?.enzymes) {
    params.enzymeName = piece.acquisitionParams.enzymes[0];
    if (piece.acquisitionParams.cutSites?.[0]) {
      params.position = piece.acquisitionParams.cutSites[0].position;
    }
  }

  return {
    id: `op-${uuidv7()}`,
    kind,
    status: 'committed',
    position,
    inputs: piece.sourceIds.slice(),  // legacy compat
    inputPieces: [piece.id],          // primary T2 field
    outputs: [],
    params,
    junctionRefs: [],
    zoneId: piece.zoneId || null,
    createdAt: new Date().toISOString(),
    executedAt: null,
    error: null,
  };
}

/**
 * Найти место для reaction слева от piece. Если занято — shift.
 */
export function findInsertPositionForReaction(piecePosition, state) {
  let candidate = { x: piecePosition.x - 220, y: piecePosition.y };
  const positions = Object.values(state.positions || {});
  for (let i = 0; i < 10; i++) {
    const collision = positions.some((p) =>
      Math.abs(p.x - candidate.x) < 50 && Math.abs(p.y - candidate.y) < 50
    );
    if (!collision) return candidate;
    candidate = { ...candidate, y: candidate.y + 80 };
  }
  // Fallback — corner.
  return { x: 50, y: 50 };
}
```

### 5.2 zone-link-resolver.js

```javascript
/**
 * Все cross-zone sources для данной zone, grouped by source zone.
 *
 * Returns Array<{
 *   sourceZoneId,
 *   sourceZoneName,
 *   pieceIds: string[],   // pieces в данной zone которые имеют source там
 *   containerIds: string[], // container ids в source zone
 * }>
 */
export function selectCrossZoneSourcesForZone(state, zoneId) {
  const piecesInZone = (state.pieces || []).filter((p) => p.zoneId === zoneId);
  const sourceMap = new Map();  // sourceZoneId → {containerIds: Set, pieceIds: Set}

  for (const piece of piecesInZone) {
    for (const sourceId of (piece.sourceIds || [])) {
      const sourceContainer = (state.containers || []).find((c) => c.id === sourceId);
      if (!sourceContainer) continue;
      const sourceZoneId = sourceContainer.zoneId;
      if (!sourceZoneId || sourceZoneId === zoneId) continue;  // not cross-zone

      if (!sourceMap.has(sourceZoneId)) {
        sourceMap.set(sourceZoneId, {
          containerIds: new Set(),
          pieceIds: new Set(),
        });
      }
      const entry = sourceMap.get(sourceZoneId);
      entry.containerIds.add(sourceId);
      entry.pieceIds.add(piece.id);
    }
  }

  return Array.from(sourceMap.entries()).map(([sourceZoneId, entry]) => {
    const sourceZone = (state.zones || []).find((z) => z.id === sourceZoneId);
    return {
      sourceZoneId,
      sourceZoneName: sourceZone?.name || 'неизвестная зона',
      pieceIds: Array.from(entry.pieceIds),
      containerIds: Array.from(entry.containerIds),
    };
  });
}
```

### 5.3 Finalizer в skeleton-state.js

После всех T1-T7 finalizers (toast queue, ghost placeholder, zone auto-resize), добавляется новый блок:

```javascript
// T8 NEW: auto-create / auto-remove reactions для pieces с acquisitionMethod.
if (next && Array.isArray(next.pieces)) {
  let updatedNext = next;
  let needsRebuild = false;

  // 1. Создать reactions для pieces где shouldHaveReaction && derivedReactionId === null.
  for (const piece of updatedNext.pieces) {
    if (!shouldHaveReaction(piece)) continue;
    if (piece.derivedReactionId) {
      // Reaction уже существует? Validate.
      const existingOp = (updatedNext.operations || []).find((op) => op.id === piece.derivedReactionId);
      if (existingOp) continue;  // OK, exists
      // Else — stale ref, clear и пересоздать
      const updatedPieces = updatedNext.pieces.map((p) =>
        p.id === piece.id ? { ...p, derivedReactionId: null } : p
      );
      updatedNext = { ...updatedNext, pieces: updatedPieces };
      needsRebuild = true;
    }

    const newOp = buildReactionForPiece(piece, updatedNext);
    if (!newOp) continue;
    const updatedPieces = updatedNext.pieces.map((p) =>
      p.id === piece.id ? { ...p, derivedReactionId: newOp.id } : p
    );
    const updatedPositions = { ...updatedNext.positions, [newOp.id]: newOp.position };
    updatedNext = {
      ...updatedNext,
      operations: [...(updatedNext.operations || []), newOp],
      pieces: updatedPieces,
      positions: updatedPositions,
    };
  }

  // 2. Удалить reactions для pieces где !shouldHaveReaction && derivedReactionId !== null.
  for (const piece of updatedNext.pieces) {
    if (shouldHaveReaction(piece)) continue;
    if (!piece.derivedReactionId) continue;
    // Удалить op.
    const opId = piece.derivedReactionId;
    const updatedOps = (updatedNext.operations || []).filter((op) => op.id !== opId);
    const updatedPieces = updatedNext.pieces.map((p) =>
      p.id === piece.id ? { ...p, derivedReactionId: null } : p
    );
    const updatedPositions = { ...updatedNext.positions };
    delete updatedPositions[opId];
    updatedNext = {
      ...updatedNext,
      operations: updatedOps,
      pieces: updatedPieces,
      positions: updatedPositions,
    };
  }

  if (updatedNext !== next) {
    next = updatedNext;
  }
}
```

Idempotent: повторный finalizer проход — все pieces с derivedReactionId уже соответствуют, никакого мутирования.

### 5.4 REMOVE_OPERATION cascade extension

В `skeleton-state-operations.js`:
```javascript
case 'OP_REMOVE': {
  const idx = state.operations.findIndex((o) => o.id === action.operationId);
  if (idx < 0) return state;
  const next = state.operations.slice();
  next.splice(idx, 1);
  
  // T8 NEW: clear derivedReactionId на всех piece которые ссылались на этот op.
  const updatedPieces = (state.pieces || []).map((p) =>
    p.derivedReactionId === action.operationId
      ? { ...p, derivedReactionId: null }
      : p
  );
  
  return { ...state, operations: next, pieces: updatedPieces };
}
```

Это **synchronous cascade** — не зависит от finalizer.

### 5.5 ZoneLinkBadge.jsx

```javascript
function ZoneLinkBadge({ sourceZoneName, pieceCount, onClick }) {
  return (
    <button
      className="zone-link-badge"
      onClick={onClick}
      title={S.zones.linkBadge.tooltip.replace('{zone}', sourceZoneName).replace('{count}', pieceCount)}
    >
      <span className="badge-arrow">←</span>
      <span className="badge-label">{S.zones.linkBadge.label.replace('{zone}', sourceZoneName)}</span>
      {pieceCount > 1 && <span className="badge-count">{pieceCount}</span>}
    </button>
  );
}
```

### 5.6 ZoneFrame.jsx extension

В header добавляется row of ZoneLinkBadges:

```javascript
// Внутри ZoneFrame, в zone-header:
const crossZoneSources = selectCrossZoneSourcesForZone(state, zone.id);

return (
  <div className="zone-frame">
    <div className="zone-header">
      <span className="zone-name">{zone.name}</span>
      <span className="zone-counter">...</span>
      {crossZoneSources.length > 0 && (
        <div className="zone-links">
          {crossZoneSources.map((link) => (
            <ZoneLinkBadge
              key={link.sourceZoneId}
              sourceZoneName={link.sourceZoneName}
              pieceCount={link.pieceIds.length}
              onClick={() => onNavigateToZone(link.sourceZoneId)}
            />
          ))}
        </div>
      )}
      {/* existing notes badge */}
    </div>
    {/* body, resize handles — как в T4/T7 */}
  </div>
);
```

`onNavigateToZone` — callback от ZoneLayer / CanvasLayoutView. Pans canvas к bounds source zone.

### 5.7 Navigation handler (CanvasLayoutView)

```javascript
const handleNavigateToZone = useCallback((zoneId) => {
  const zone = (state.zones || []).find((z) => z.id === zoneId);
  if (!zone) return;
  
  // Pan viewport center к centre of zone bounds.
  const cx = zone.bounds.x + zone.bounds.width / 2;
  const cy = zone.bounds.y + zone.bounds.height / 2;
  
  // Scroll canvas viewport, либо CSS transform translate.
  if (canvasViewportRef.current) {
    canvasViewportRef.current.scrollTo({
      left: cx - canvasViewportRef.current.clientWidth / 2,
      top: cy - canvasViewportRef.current.clientHeight / 2,
      behavior: 'smooth',
    });
  }
  
  // Optional: highlight target zone briefly (CSS animation, 1s).
  dispatch({ type: 'HIGHLIGHT_ZONE', zoneId, durationMs: 1000 });
}, [state.zones, dispatch]);
```

`HIGHLIGHT_ZONE` action — новое поле `zone.highlightedUntil: number | null`. ZoneFrame читает, applies CSS class `highlighted` если now < highlightedUntil. Cleanup через setTimeout dispatch HIGHLIGHT_ZONE с durationMs=0.

### 5.8 Selectors

```javascript
// store/selectors-pieces.js extension
export function selectAutoCreatedReactions(state) {
  const reactionIds = new Set(
    (state.pieces || [])
      .filter((p) => p.derivedReactionId)
      .map((p) => p.derivedReactionId)
  );
  return (state.operations || []).filter((op) => reactionIds.has(op.id));
}
```

### 5.9 STRINGS extension

```javascript
zones: {
  // ...existing T3+T4+T7
  linkBadge: {
    label: '← {zone}',
    tooltip: 'Из зоны «{zone}»: {count} источников',
    countSuffix: ' ({count})',
  },
  highlighted: 'Выбрана из связи',
},
pieces: {
  // ...existing
  autoReaction: {
    createdToast: 'Создана автоматическая реакция: {kind} для куска «{piece}»',
    removedToast: 'Удалена автоматическая реакция куска «{piece}»',
  },
},
```

---

## 6. Порядок выполнения

**K1.** **Conditional first task:** проверить lib/strings.js size. Если > hard 25 KB — split на `strings-zones.js` (extract zone namespace) или `strings-pieces.js`. Если ≤ 24 KB — продолжать к K2.

**K2.** `lib/auto-reaction-builder.js` — pure builders. ~8 unit tests.

**K3.** `lib/zone-link-resolver.js` — cross-zone resolution helpers. ~5 unit tests.

**K4.** Расширить `selectors-pieces.js` — `selectCrossZoneSourcesForZone` (re-export from zone-link-resolver), `selectAutoCreatedReactions`. ~3 tests.

**K5.** Finalizer auto-create/remove reactions в `skeleton-state.js` (§5.3). ~10 integration tests:
- piece.acquisitionMethod='pcr' set → op-узел создан + piece.derivedReactionId установлен.
- piece.acquisitionMethod='undefined' set → op-узел удалён.
- piece.acquisitionMethod 'pcr' → 'restriction' → старый op удалён, новый создан.
- piece.kind='gap' → no auto-reaction.
- REMOVE_PIECE → cascade derivedReactionId clearance + op-узел удалён.
- REMOVE_OPERATION (manual) → cascade clear piece.derivedReactionId.
- shouldHaveReaction=false (synthesis) → no auto-reaction.
- Idempotency — повторный dispatch без mutation не создаёт duplicates.

**K6.** Расширить `skeleton-state-operations.js::OP_REMOVE` cascade clear derivedReactionId (§5.4). ~2 tests.

**K7.** `canvas/ZoneLinkBadge.jsx` — visual badge. ~3 component tests.

**K8.** Расширить `ZoneFrame.jsx` — mount badges в header + onNavigateToZone callback. ~2 tests.

**K9.** Расширить `CanvasLayoutView.jsx` — handleNavigateToZone + HIGHLIGHT_ZONE wiring.

**K10.** `HIGHLIGHT_ZONE` action в `skeleton-state-zones.js` + zone.highlightedUntil field. ~2 tests.

**K11.** STRINGS extension (§5.9).

**K12.** Manual smoke:
1. Открыть /canvas-skeleton. Создать piece (T5 flow) с acquisitionMethod='pcr'. Visually — ромб PCR появляется слева от piece.
2. Change method to 'undefined' через UPDATE_PIECE — ромб исчезает.
3. Change to 'restriction' — Cut ромб появляется.
4. Создать piece2 в zone B с sourceId из zone A — в header zone B появляется badge «← Зона A». Click → canvas scrolls к zone A + highlight.
5. Manual delete op (через context menu existing) — piece.derivedReactionId clears.

**K13.** Size budget check.

---

## 7. STOP-условие

Code останавливается после K13.

Отчёт:
```
## T8 Auto Reactions + Zone Links — отчёт
Commits: ...
Vitest: 2910 → 2945 pass / 1 skip / 0 fail (+35)
pytest: 112/112
vite build: clean

Size budget:
- lib/auto-reaction-builder.js: X.X KB (new) ✓
- lib/zone-link-resolver.js: X.X KB (new) ✓
- canvas/ZoneLinkBadge.jsx: X.X KB (new) ✓
- canvas/ZoneFrame.jsx: ~15 KB (+1) ✓
- skeleton-state.js: ~16 KB (+1 finalizer) ✓
- skeleton-state-pieces.js: ~17 KB (+1) ✓
- skeleton-state-operations.js: X.X KB (+0.3 cascade) ✓
- lib/strings.js: post-split X.X KB ✓ (если K1 split был)

Manual smoke:
- Set piece.acquisitionMethod=pcr → ромб PCR появляется
- Change method → ромб обновляется
- Cross-zone source → badge в header → click → pan + highlight

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 8. Что делать при регрессии

1. **Finalizer создаёт duplicates** — derivedReactionId check не сработал. Verify: `piece.derivedReactionId === null` точно проверяется ДО creation. Если existingOp validation failed — clear stale ref, потом create.

2. **OP_REMOVE existing tests падают** — cascade clear derivedReactionId сломал что-то. Existing tests могут предполагать что state.pieces не изменяется при OP_REMOVE. Update tests чтобы accept piece.derivedReactionId clearance.

3. **Cross-zone badge показывается для own-zone** — selectCrossZoneSourcesForZone не отфильтровал `sourceZoneId === zoneId`. Проверить guard в loop.

4. **Pan на ZoneLinkBadge click не работает** — `canvasViewportRef.current` undefined или нет scroll method. Verify ref attached к scrollable element.

5. **HIGHLIGHT_ZONE не cleanup** — setTimeout dispatch с durationMs=0 не сработал. Проверить cleanup в reducer (highlightedUntil < now → return state с zone.highlightedUntil cleared).

---

## 9. Риски

### R-T8-1 — lib/strings.js превысит hard 25 KB
**Risk:** T7 уже ~23 KB. T8 +0.5 → ~23.5 KB. Если фактически больше — fail.
**Mitigation:** K1 — conditional split task. Size check FIRST. Split namespace по domain (zones / pieces / etc.) в отдельные файлы.

### R-T8-2 — Finalizer infinite recursion
**Risk:** Finalizer создаёт op → dispatch CREATE_OPERATION → reducer → finalizer снова → создаёт duplicate? .
**Mitigation:** Finalizer проверяет `piece.derivedReactionId === null` — если уже non-null, не создаёт. Second pass — все pieces уже linked, no new ops. Idempotent.

### R-T8-3 — Manual OP_REMOVE при наличии piece.derivedReactionId
**Risk:** Биолог удаляет ромб через context-menu — но finalizer на следующем dispatch снова создаёт (потому что piece.acquisitionMethod ещё 'pcr').
**Mitigation:** OP_REMOVE cascade сначала clears piece.derivedReactionId — это OK. Но finalizer на следующем dispatch reasoned "shouldHaveReaction=true && derivedReactionId=null" → создаст снова.

Это **expected behavior** — биолог не может вручную убрать auto-created reaction. Если хочет убрать — должен изменить piece.acquisitionMethod на 'undefined'.

UX-warning: при OP_REMOVE на auto-created — toast «Эта реакция создана автоматически. Чтобы убрать, измените метод получения куска.»

### R-T8-4 — Cross-zone badge spam при много zones
**Risk:** Биолог имеет 6 zones. Каждая zone имеет sources из 3-4 других zones. Header overflow с 4+ badges.
**Mitigation:** Если crossZoneSources.length > 3 — показать первые 2 + «(+ N other)» badge которое expands при click. T8 — basic. Post-MVP — auto-collapse logic.

### R-T8-5 — Layout collision при auto-create
**Risk:** piece position имеет ромб слева, но там уже есть другой op-узел.
**Mitigation:** findInsertPositionForReaction shifts на 80px vertically до 10 раз. Если не нашлось — fallback corner. T8 acceptable. Post-MVP — smart layout.

### R-T8-6 — derivedReactionId stale после corrupted state
**Risk:** piece.derivedReactionId указывает на op которой больше нет (например manual REPLACE_STATE с partial data).
**Mitigation:** Finalizer §5.3 — проверяет existingOp. Если нет — clears stale ref + recreate.

### R-T8-7 — REMOVE_PIECE cascade T2 не cascades op
**Risk:** T2 cascade REMOVE_PIECE убирал piece из op.inputPieces. T8 расширяет — если piece.derivedReactionId — также удалить op.
**Mitigation:** Extend REMOVE_PIECE reducer (T1/T2) — если piece.derivedReactionId — dispatch internal OP_REMOVE. Или finalizer T8 detects stale derivedReactionId после piece removal и cleans.

T8 prefers finalizer approach — minimal disturbance T1/T2.

---

## 10. Открытые вопросы для Chat

1. Когда piece.derivedReactionId уже set'нут, и биолог меняет piece.ranges (изменяет диапазон) — auto-reaction должен пересчитать params.range? T8 default — yes (finalizer detects piece change → re-build op params).
2. Auto-created reaction visual style — отличается от manual-created? Default — same. Optional indicator (например иконка «авто») — post-MVP polish.
3. ZoneLinkBadge — место в header (right side near counter, или separate row below header)? Default — right side. Если overflow — wrap row below.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров + conditional K1 split.
- [x] Контекст + стратегия + reference на T2/T5/T7.
- [x] Scope IN/OUT.
- [x] DEC-T8-01..14.
- [x] Builders + finalizer + UI (§5).
- [x] K1-K13.
- [x] STOP-условие.
- [x] 7 рисков с митигациями.
- [x] Открытые вопросы.
- [x] Размер 40-50 KB target.
- [x] Reference на якорь + T2, T5, T7.
- [x] No design/clone variants (T9 territory).

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-05, 23, 24, 30.
**Следующий sprint:** T9 — design variants (N reactions) vs clone variants (1 reaction + materializedClones).
