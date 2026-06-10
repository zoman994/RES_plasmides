# SPRINT_T2_PIECES_MIGRATION_OP_PARAMS.md — миграция `op.params.range` → отдельные pieces

> **Тип:** A (data migration, schema bump).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-01, 03, 05, 22, 29, 30).
> **Зависимости:** T1 (требует `state.pieces` slice + helpers + invariants).
> **Размер целевой:** 30-35 KB.
> **Цель:** перевести existing operations с implicit piece (через `op.params.range`) на explicit `state.pieces` сущность. Гибридный подход — параллельное поле `op.inputPieces: pieceId[]` без big-bang переписывания `op.inputs: containerId[]`.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-operations.js` | ? (M-CANVAS-OPS K4) | soft 20 / hard 25 (.js) | +createOperationDraft расширение (~0.5 KB), 1 новый action OP_SET_INPUT_PIECES (~0.5 KB) |
| `gui/designer/src/components/CanvasSkeleton/lib/skeleton-persistence.js` | ? | soft 20 / hard 25 (.js) | +migrateV4toV5 (~1.5 KB) с генерацией pieces из op.params.range |
| `gui/designer/src/components/CanvasSkeleton/lib/op-piece-bridge.js` | — (новый) | soft 20 / hard 25 (.js) | ~6-8 KB adapter helpers (resolveOpTemplate, resolveOpInputs, isOpReadyToExecute) |
| `gui/designer/src/components/CanvasSkeleton/canvas/operations/lib-adapters.js` | ? (executeOperation orchestrator) | soft 20 / hard 25 (.js) | +piece resolution в read-path, ~1 KB |
| `gui/designer/src/components/CanvasSkeleton/canvas/operations/adapters/pcr.js` | ? | soft 20 / hard 25 (.js) | params.range → resolve from inputPieces[0].ranges[0], ~0.5 KB |
| `gui/designer/src/components/CanvasSkeleton/canvas/operations/adapters/cut.js` | ? | soft 20 / hard 25 (.js) | params.position → resolve from inputPieces if present, ~0.5 KB |
| `gui/designer/src/components/CanvasSkeleton/canvas/operations/adapters/gibson.js` | ? | soft 20 / hard 25 (.js) | +inputPieces resolution, ~0.5 KB |
| `gui/designer/src/components/CanvasSkeleton/store/selectors-pieces.js` | ~5-7 KB (T1) | soft 20 / hard 25 (.js) | +selectPiecesForOperation (~0.3 KB) |

Code обязан запустить size-check после K8 (см. §6).

---

## 1. Контекст

### 1.1 Что в коде после T1

`state.pieces: Piece[]` slice существует. CRUD pieces работает через actions. Selectors доступны. Migration v3→v4 добавила пустой `pieces: []` к pre-T1 snapshots.

**Operations НЕ интегрированы с pieces.** Existing operation shape (от M-CANVAS-OPS K4):

```javascript
op = {
  id, kind, status, position,
  inputs: containerId[],        // ← prim. legacy: id-ы containers
  outputs: containerId[],
  params: {                      // ← kind-specific. ВНУТРИ — implicit piece info
    templateId?: containerId,    // PCR: template container
    range?: {start, end},        // PCR: implicit piece range — мигрирует в T2
    primerPairId?: {fwd, rev},   // PCR: primer pair
    position?: number,           // Cut: enzyme cut site position
    enzymeName?: string,         // Cut
    userPrimers?: [{forward, reverse}],  // PCR V73
    // ... другие kind-specific
  },
  junctionRefs, createdAt, executedAt, error,
}
```

### 1.2 Что добавляется в T2

**Новое поле:** `op.inputPieces: pieceId[]` (параллельно `op.inputs: containerId[]`).

**Семантика:**
- `op.inputs` — legacy/back-compat. Содержит containerIds. Adapters могут продолжать читать.
- `op.inputPieces` — primary в 4-tier. Содержит pieceIds. Каждый piece имеет sourceIds (1+ containers) и ranges.
- Когда `op.inputPieces` непуст — adapters читают template/range из piece. Когда пуст (legacy ops до migration) — fallback к `op.inputs[0]` + `op.params.range`.

**Migration v4→v5:** для каждой existing operation:
1. Если `op.params.range` есть и `op.params.templateId` есть → создать piece с одним source (templateId) и одним range — установить `op.inputPieces = [newPieceId]`.
2. Если `op.params.range` отсутствует (просто `templateId` без range) → создать piece с full-length range — установить `op.inputPieces = [newPieceId]`.
3. Multi-input ops (Gibson / Ligate / KLD) с `op.inputs = [c1, c2, c3]` → создать piece per input, каждый с одним source = containerId и full-length range — `op.inputPieces = [pc1, pc2, pc3]`.
4. `op.inputs` оставляем как было (backward-compat для не-мигрировавших adapters).

**Origin migrated pieces** = `'legacy-migration'` (новое допустимое значение в Piece.origin enum, добавляется в T2 — это микро-расширение T1 invariant'а).

### 1.3 Почему гибрид, не жёсткое переписывание

Жёсткое переписывание `op.inputs` с containerId на pieceId ломает:
- `executeOperation(op, {containers})` — резолвит inputs как containerIds → ID lookup в containers map. Если изменить на pieceIds — каждый адаптер должен резолвить piece → containers, **40+ мест**.
- `REMOVE_CONTAINER` cascade — фильтрует ops по `op.inputs.includes(containerId)`. Жёсткое переписывание требует cascade-логику переписать.
- Tests — ~150 тестов с моками operations. Каждый mock пишет `inputs: ['c-...']` (containerId). Жёсткое переписывание ломает все тесты.
- `editorContext.tabs` — некоторые tabs имеют `containerId` ссылки на op.inputs[0] (V70 PcrModeShell). Жёсткое переписывание ломает tab restoration.

**Гибрид** позволяет:
- Adapters добавляют opt-in piece resolution (если inputPieces есть — используют, иначе legacy).
- Existing tests продолжают работать с containerId-based ops.
- Новые ops (T5 onwards) пишут оба поля (`inputs` для compat, `inputPieces` для primary).
- В Tn (cleanup post-MVP) — `op.inputs` удаляется когда **все** consumers переключены на inputPieces.

### 1.4 Что НЕ меняется в T2

- UI операций (OperationNode, PCROpPopup, JunctionMethodPicker) — продолжают видеть op.inputs как раньше.
- editor/operation-modes/PcrModeShell — V71-V76 без изменений, читает op.inputs[0] для template.
- `state.junctions` shape — junction между piece-piece (DEC-CANVAS-4T-30) — это **T-future** sprint (после T4), не T2. В T2 junctions остаются container↔container.
- Существующие тесты — продолжают использовать containerId моки.

---

## 2. Стратегия

Гибридный dual-field подход. Pure migration функция. Adapter-level lazy resolution.

**Принцип:** код, которому нужны piece-данные (T5 UI piece-creation form, T7 sequence-mode rendering), читает через `inputPieces`. Код, которому нужны container-данные (existing adapters, freeze inputs), читает через `inputs` или через `op-piece-bridge.resolveOpInputContainers(op, state)` который вернёт containers независимо от того, какое поле populated.

**Bridge helpers** в `lib/op-piece-bridge.js`:
- `resolveOpTemplate(op, state)` — returns Container | null. Для PCR: пробует `inputPieces[0]` → piece.sourceIds[0] → container; fallback `params.templateId` → container.
- `resolveOpInputContainers(op, state)` — returns Container[]. Для Gibson/Ligate: пробует inputPieces[i] → piece.sourceIds[0] → container; fallback `op.inputs[i]` → container.
- `resolveOpInputPieces(op, state)` — returns Piece[] | null. Returns pieces только если inputPieces заполнен.
- `isOpReadyToExecute(op, state)` — bool. Inputs все резолвятся? params валидны? status === 'committed'?

Migration функция `migrateV4toV5` — pure, idempotent (повторный вызов на v5 snapshot = no-op).

Origin enum расширяется через T1 invariants extension (одиночная правка `lib/piece-invariants.js`).

---

## 3. Scope IN / OUT

### IN
- Поле `op.inputPieces: pieceId[]` добавлено в shape (`createOperationDraft` extension).
- `OP_SET_INPUT_PIECES` action (новая, для T5/T8 callers; в T2 — для migration setup).
- `OP_REMOVE_INPUT_PIECE` action (cascade при REMOVE_PIECE).
- `lib/op-piece-bridge.js` — 4 resolver helpers + isOpReadyToExecute.
- Migration v4→v5 в `skeleton-persistence.js`: для каждой existing op с `params.range` ИЛИ `params.templateId` ИЛИ multi-input — создаёт piece(s) + ставит `op.inputPieces`.
- `lib/piece-invariants.js` extension — `'legacy-migration'` в Piece.origin enum.
- Adapter updates:
  - `pcr.js` — читает range из inputPieces[0].ranges[0] если populated, иначе params.range.
  - `cut.js` — позиция cut из inputPieces[0] (range.start + relative position) или params.position fallback.
  - `gibson.js` — input containers из inputPieces[i].sourceIds[0] или op.inputs[i] fallback.
  - `ligate.js`, `kld.js`, `mutagenesis.js` — аналогично.
- `state.pieces` cascade: REMOVE_PIECE удаляет pieceId из всех op.inputPieces; REMOVE_CONTAINER — ничего нового (op.inputs cascade существует с M-CANVAS-OPS K4).
- Selector `selectPiecesForOperation(state, opId)` в `selectors-pieces.js`.
- Unit + integration tests (~30 тестов).

### OUT
- Жёсткое переписывание `op.inputs` (Tn cleanup post-MVP).
- UI для inputPieces editing (T5 — PieceCreateModal будет умной, T7 — drag piece в sequence-mode).
- Auto-create new operations из piece.acquisitionMethod (T8).
- Junction между pieces (DEC-CANVAS-4T-30 — T после T4).
- Versioning operations в git-слое (post-MVP).

### NOT TOUCHED
- `state.containers`, `state.junctions` — не трогаем.
- `state.assemblyDrafts` — мигрирует в T6, не T2.
- Library / Importer / SequenceView — pieces в них не интегрированы.

---

## 4. Архитектурные решения

### DEC-T2-01 — Dual-field подход: op.inputs (legacy) + op.inputPieces (primary)
Никакого big-bang. inputPieces populated → primary. Пусто → fallback к inputs. Adapter-level lazy resolution.

### DEC-T2-02 — Origin 'legacy-migration' для migrated pieces
Различает auto-generated pieces от user-created. Полезно в T5 UI («этот piece создан миграцией, проверь имя») и в debug. Расширяет T1 Piece.origin enum.

### DEC-T2-03 — Migrated pieces получают auto-name `{containerName}({start}-{end})`
По существующему `autoPieceName` helper из T1. Биолог может renamed в T5 (этого UI пока нет, но shape позволяет).

### DEC-T2-04 — Multi-input ops (Gibson/Ligate) — один piece per input
Не один объединённый piece с N sourceIds. Каждый container — отдельный piece (origin='legacy-migration', full-length range). Это упрощает migration logic и соответствует биологическому пониманию (5 piece входят в Gibson — пять отдельных amplicon/PCR products).

OV_PCR (где один piece имеет 2 sourceIds) появляется через T5 UI или T8 auto-create, не через migration. Старые ops с overlap-pcr не были pre-T2 (это новый kind, появляется в 4-tier).

### DEC-T2-05 — acquisitionMethod для migrated pieces — выводится из op.kind
- PCR op → migrated piece имеет acquisitionMethod='pcr', acquisitionParams = { primerPairId: op.params.primerPairId } если есть.
- Cut op → 'restriction', acquisitionParams = { enzymes: [...], cutSites: [...] }.
- Gibson/Ligate/KLD/mutagenesis — input pieces получают 'undefined' (это были предполагаемые inputs, биолог не указал явный метод).
- Default fallback: 'undefined'.

### DEC-T2-06 — Idempotency migration v4→v5 через флаг
Migration функция проверяет: если все ops в snapshot уже имеют `op.inputPieces` field (массив, может пустой) — migration skip'нула этот snapshot. Schema version 5 — флаг. Повторный вызов = no-op.

### DEC-T2-07 — derivedReactionId выставляется migration'ом
Для каждой migrated op kind='pcr' — соответствующая piece получает `piece.derivedReactionId = op.id`. Это сразу включает T1's reverse-pointer pattern. Auto-create в T8 будет использовать тот же pattern для новых piece-acquisitionMethod='pcr'.

### DEC-T2-08 — Bridge helpers — pure, без mutation
`resolveOpTemplate(op, state)`, `resolveOpInputContainers(op, state)`, `resolveOpInputPieces(op, state)`, `isOpReadyToExecute(op, state)` — все pure. Принимают state, возвращают результат. Не модифицируют. Тестируются на mock state.

### DEC-T2-09 — Adapters читают через bridge, не напрямую через `inputPieces`
Не `op.inputPieces?.[0]` в каждом адаптере, а `resolveOpTemplate(op, state)`. Это упрощает Tn cleanup — когда inputs полностью удаляется, правится только bridge, не 6 adapters.

### DEC-T2-10 — REMOVE_PIECE cascade: piece удаляется из op.inputPieces, но op остаётся
Когда биолог удаляет piece, который используется в op — adapter обнаружит `inputPieces[i]` = stale ID. Bridge возвращает null. `isOpReadyToExecute` → false. UI (T8) показывает op как «нужен input». Это явно лучше чем cascade-удаление op (могут быть user-customized params которые пропадут).

Альтернативно — cascade удалить op. Это **dangerous** для биолога. Не делаем.

### DEC-T2-11 — REMOVE_CONTAINER cascade — расширяется на pieces
Существующий cascade (M-CANVAS-OPS K4) удаляет op.inputs ref. T2 добавляет: pieces где containerId в sourceIds — каскадно удаляются (если это последний source) или sourceId удаляется из sourceIds (если piece имеет другие sources, например OV_PCR с 2 sources). Если piece остаётся без sources — он удаляется.

В T1 piece-invariants требует `sourceIds.length >= 1`. T2 cascade поддерживает invariant.

### DEC-T2-12 — Backward-compat для snapshot'ов без inputPieces
loadSnapshot → migrate → snapshot имеет inputPieces. Если по какой-то причине (corrupted state) inputPieces отсутствует на op — bridge возвращает legacy fallback (op.inputs[0] → container).

### DEC-T2-13 — Frozen-on-use (⚓ DEC-MUTABILITY-FREEZE-ON-USE-01) расширяется на pieces
Когда op.status='executed' (биолог отметил «Выполнено») — каждый piece в op.inputPieces получает `frozen: true`. piece.ranges мгновенно не реагируют на изменения container.sequence (selectPieceSequence возвращает frozen snapshot). В T1 piece не имеет frozen поля — T2 добавляет (это shape extension).

Frozen recovery: если биолог делает OP_RESET (failed → committed) — frozen снимается с pieces которые перестают быть в executed op.

### DEC-T2-14 — Migrated pieces автоматически связаны с zone текущей op
op.zoneId (если T3 уже реализован — но T3 после T2) → piece.zoneId = same. В T2 порядок dependencies — T3 ещё нет, поэтому zoneId всегда null. T3 при migration v5→v6 заполнит zoneId.

### DEC-T2-15 — Tests baseline: 2683 (T1) → ~2713 (T2)
~30 новых тестов: migration v4→v5 (~8), bridge helpers (~10), adapter updates (~6), cascade REMOVE_PIECE+REMOVE_CONTAINER (~4), regression integration (~2).

---

## 5. Shape changes + actions + helpers

### 5.1 Operation shape extension

```javascript
// БЫЛО (M-CANVAS-OPS K4):
op = {
  id, kind, status, position,
  inputs: containerId[],
  outputs: containerId[],
  params: {...},
  junctionRefs, createdAt, executedAt, error,
}

// СТАЛО (T2):
op = {
  id, kind, status, position,
  inputs: containerId[],            // legacy, по-прежнему
  inputPieces: pieceId[],           // NEW — primary в 4-tier
  outputs: containerId[],           // outputs остаются containers (virtual до T9 materialize)
  params: {...},                    // params.range / params.templateId — становятся redundant но не удаляются (cleanup post-MVP)
  junctionRefs, createdAt, executedAt, error,
}
```

Default value `inputPieces: []` в `createOperationDraft`.

### 5.2 Piece shape extension

```javascript
// Из T1, расширяется в T2:
piece = {
  id, name, sourceIds, ranges,
  origin,                            // T1 enum: 'selection'|'feature'|'existing-primers'|'new-primers'
                                     // T2 расширение: + 'legacy-migration'
  acquisitionMethod, acquisitionParams,
  color, functionalLabel, zoneId,
  derivedReactionId,                 // T1 always null, T2 set'ится migration'ом для PCR ops
  frozen: false,                     // NEW T2 — DEC-T2-13
  createdAt, updatedAt,
}
```

`piece-invariants.js` обновляется: origin enum включает `'legacy-migration'`.

### 5.3 Actions

#### OP_SET_INPUT_PIECES (новая)

```
dispatch({ type: 'OP_SET_INPUT_PIECES', operationId, pieceIds });
```

Логика:
1. Find op. Если нет — state.
2. Validate каждый pieceId exists в state.pieces.
3. Validate op.kind compatibility:
   - PCR — pieceIds.length === 1 (single template piece).
   - OV-PCR — pieceIds.length === 1 (но piece имеет 2 sourceIds — иначе invalid).
   - Cut — pieceIds.length === 1.
   - Gibson/Ligate/KLD — pieceIds.length >= 2.
   - Mutagenesis — pieceIds.length === 1.
4. Replace op.inputPieces.

#### OP_REMOVE_INPUT_PIECE (новая, cascade helper)

```
dispatch({ type: 'OP_REMOVE_INPUT_PIECE', operationId, pieceId });
```

Логика: убрать pieceId из op.inputPieces. Используется reducer'ом piecesReducer при REMOVE_PIECE (cascade).

#### REMOVE_PIECE (T1 расширяется в T2)

T1 reducer был: filter из state.pieces. T2 расширяет:
1. Существующая логика (filter из state.pieces).
2. NEW: для каждой op в state.operations — если `op.inputPieces.includes(pieceId)` → удалить из inputPieces.
3. NEW: если piece имеет derivedReactionId → найти op, обнулить derivedReactionId reference в piece-side. (Op остаётся, его inputPieces теперь stale — bridge показывает op как «нужен input».)

#### REMOVE_CONTAINER (existing M-CANVAS-OPS, T2 расширяет)

T2 каскадно:
1. Существующая логика (canvas/operations cascade).
2. NEW: для каждой piece в state.pieces — если `piece.sourceIds.includes(containerId)`:
   - Если sourceIds.length === 1 (последний source) → remove piece целиком (с дальнейшим REMOVE_PIECE cascade).
   - Если sourceIds.length >= 2 — remove containerId из sourceIds + соответствующий range из ranges (по индексу).
3. Это **полностью внутри piecesReducer** — canvasReducer его не знает.

### 5.4 Bridge helpers (`lib/op-piece-bridge.js`)

```javascript
/**
 * Найти template container для op (PCR / Cut / Mutagenesis).
 * Сначала пробует inputPieces[0] → piece.sourceIds[0] → container.
 * Fallback: op.params.templateId → container.
 * Final fallback: op.inputs[0] → container.
 * Returns Container | null.
 */
export function resolveOpTemplate(op, state) {
  if (Array.isArray(op.inputPieces) && op.inputPieces.length > 0) {
    const piece = state.pieces?.find((p) => p.id === op.inputPieces[0]);
    if (piece && piece.sourceIds.length > 0) {
      return state.containers?.find((c) => c.id === piece.sourceIds[0]) || null;
    }
  }
  if (op.params?.templateId) {
    return state.containers?.find((c) => c.id === op.params.templateId) || null;
  }
  if (Array.isArray(op.inputs) && op.inputs.length > 0) {
    return state.containers?.find((c) => c.id === op.inputs[0]) || null;
  }
  return null;
}

/**
 * Найти range для op (PCR / Cut).
 * Сначала: inputPieces[0] → piece.ranges[0].
 * Fallback: op.params.range.
 * Final fallback: full-length container range (если template найден).
 * Returns { start, end, orientation } | null.
 */
export function resolveOpRange(op, state) {
  if (Array.isArray(op.inputPieces) && op.inputPieces.length > 0) {
    const piece = state.pieces?.find((p) => p.id === op.inputPieces[0]);
    if (piece && piece.ranges.length > 0) {
      return piece.ranges[0];  // {sourceId, start, end, orientation}
    }
  }
  if (op.params?.range) {
    return { ...op.params.range, orientation: 'forward' };  // legacy default
  }
  const template = resolveOpTemplate(op, state);
  if (template) {
    return { sourceId: template.id, start: 0, end: template.sequence.length, orientation: 'forward' };
  }
  return null;
}

/**
 * Найти все input containers для multi-input op (Gibson / Ligate / KLD).
 * Сначала: inputPieces — каждый piece.sourceIds[0] → container.
 * Fallback: op.inputs.
 * Returns Container[] (длина равна op.inputs.length или op.inputPieces.length).
 */
export function resolveOpInputContainers(op, state) {
  if (Array.isArray(op.inputPieces) && op.inputPieces.length > 0) {
    return op.inputPieces.map((pid) => {
      const piece = state.pieces?.find((p) => p.id === pid);
      if (piece && piece.sourceIds.length > 0) {
        return state.containers?.find((c) => c.id === piece.sourceIds[0]) || null;
      }
      return null;
    }).filter(Boolean);
  }
  if (Array.isArray(op.inputs) && op.inputs.length > 0) {
    return op.inputs.map((cid) => state.containers?.find((c) => c.id === cid)).filter(Boolean);
  }
  return [];
}

/**
 * Найти все input pieces для op.
 * Returns Piece[] | null. Null если inputPieces пуст.
 */
export function resolveOpInputPieces(op, state) {
  if (!Array.isArray(op.inputPieces) || op.inputPieces.length === 0) return null;
  return op.inputPieces
    .map((pid) => state.pieces?.find((p) => p.id === pid))
    .filter(Boolean);
}

/**
 * Может ли op быть выполнен сейчас?
 * - status === 'committed'.
 * - kind set.
 * - Все inputs резолвятся (containers найдены).
 * - Адаптер kind есть.
 * - Для PCR — есть primer pair либо userPrimers либо biolog подсказал auto-design.
 */
export function isOpReadyToExecute(op, state) {
  if (op.status !== 'committed') return { ok: false, reason: 'not-committed' };
  if (!op.kind) return { ok: false, reason: 'no-kind' };
  const containers = resolveOpInputContainers(op, state);
  if (containers.length === 0) return { ok: false, reason: 'no-inputs' };
  // kind-specific minimal checks
  if (op.kind === 'pcr' && containers.length !== 1) return { ok: false, reason: 'pcr-multi-input' };
  if (op.kind === 'gibson' && containers.length < 2) return { ok: false, reason: 'gibson-too-few' };
  return { ok: true };
}
```

### 5.5 Migration v4→v5 (`lib/skeleton-persistence.js`)

```javascript
function migrateV4toV5(snapshot) {
  if ((snapshot.schemaVersion ?? 4) >= 5) return snapshot;

  const containers = snapshot.containers || [];
  const operations = snapshot.operations || [];
  const existingPieces = snapshot.pieces || [];
  const newPieces = [];

  const migratedOps = operations.map((op) => {
    // Если op уже имеет inputPieces заполненным — миграция уже была, skip.
    if (Array.isArray(op.inputPieces) && op.inputPieces.length > 0) return op;

    const sourceContainerIds = op.inputs || [];
    if (sourceContainerIds.length === 0) {
      return { ...op, inputPieces: [] };  // op без inputs (drafts) — пустое.
    }

    const opInputPieceIds = [];
    for (const containerId of sourceContainerIds) {
      const container = containers.find((c) => c.id === containerId);
      if (!container) continue;  // bad ref — skip, op останется без этого piece.

      // Определяем range:
      // 1. Если op.params.range и это первый container — используем range.
      // 2. Иначе — full-length.
      let range;
      if (op.params?.range && containerId === (op.params.templateId || sourceContainerIds[0])) {
        range = { sourceId: containerId, start: op.params.range.start, end: op.params.range.end, orientation: 'forward' };
      } else {
        range = { sourceId: containerId, start: 0, end: container.sequence.length, orientation: 'forward' };
      }

      // Создаём piece
      const newPiece = {
        id: `pc-${uuidv7()}`,
        name: `${container.name}(${range.start}-${range.end})`,
        sourceIds: [containerId],
        ranges: [range],
        origin: 'legacy-migration',
        acquisitionMethod: op.kind === 'pcr' ? 'pcr'
                          : op.kind === 'cut' ? 'restriction'
                          : 'undefined',
        acquisitionParams: op.kind === 'pcr' && op.params?.primerPairId
          ? { primerPairId: op.params.primerPairId }
          : op.kind === 'cut' && op.params?.enzymeName
          ? { enzymes: [op.params.enzymeName] }
          : {},
        color: generatePieceColor(`pc-tmp`, []),  // tmp seed, переусилим reduce'ом ниже
        functionalLabel: null,
        zoneId: null,
        derivedReactionId: op.kind === 'pcr' ? op.id : null,
        frozen: op.status === 'executed',
        createdAt: typeof op.createdAt === 'string' ? new Date(op.createdAt).getTime() : Date.now(),
        updatedAt: Date.now(),
      };
      newPieces.push(newPiece);
      opInputPieceIds.push(newPiece.id);
    }

    return { ...op, inputPieces: opInputPieceIds };
  });

  // Перегенерировать цвета финально с collision check
  const allPieces = [...existingPieces, ...newPieces];
  for (let i = 0; i < newPieces.length; i++) {
    newPieces[i].color = generatePieceColor(newPieces[i].id, allPieces.slice(0, i).map((p) => p.color));
  }

  return {
    ...snapshot,
    pieces: allPieces,
    operations: migratedOps,
    schemaVersion: 5,
  };
}
```

Idempotent: повторный вызов на v5 snapshot → schemaVersion уже 5 → return как есть.

### 5.6 Selectors extension (`store/selectors-pieces.js`)

```javascript
// Все pieces используемые в данной operation.
export function selectPiecesForOperation(state, opId) {
  const op = state.operations?.find((o) => o.id === opId);
  if (!op || !Array.isArray(op.inputPieces)) return [];
  return op.inputPieces
    .map((pid) => state.pieces?.find((p) => p.id === pid))
    .filter(Boolean);
}

// Все operations использующие данный piece (для T8 caskade).
export function selectOperationsUsingPiece(state, pieceId) {
  return (state.operations || []).filter((op) =>
    Array.isArray(op.inputPieces) && op.inputPieces.includes(pieceId)
  );
}
```

### 5.7 Adapter updates

**`canvas/operations/adapters/pcr.js`** — старый код брал `op.params.range` напрямую. Новый — через bridge:

```javascript
// БЫЛО:
const range = operation.params.range;
const template = containers[operation.params.templateId || operation.inputs[0]];

// СТАЛО:
import { resolveOpTemplate, resolveOpRange } from '../../../lib/op-piece-bridge';
const template = resolveOpTemplate(operation, { containers, pieces });
const range = resolveOpRange(operation, { containers, pieces });
// Дальше — как раньше: digest, amplify, output container.
```

**`canvas/operations/adapters/gibson.js`** / `ligate.js` / `kld.js`:

```javascript
// БЫЛО:
const inputContainers = operation.inputs.map((id) => containers[id]);

// СТАЛО:
import { resolveOpInputContainers } from '../../../lib/op-piece-bridge';
const inputContainers = resolveOpInputContainers(operation, { containers, pieces });
```

`executeOperation(op, ctx)` orchestrator (`canvas/operations/lib-adapters.js`) расширяется чтобы передавать pieces в ctx:

```javascript
// Caller (skeleton-state.js handleOpExecute):
const result = executeOperation(op, { containers: containersById, pieces: state.pieces });
```

### 5.8 freeze-on-execute

В `handleOpExecute` (skeleton-state.js, existing M-CANVAS-OPS K9):

```javascript
// БЫЛО — freeze inputs (containers):
const inputSet = new Set(op.inputs || []);
const containers = combined.map((c) => inputSet.has(c.id) ? { ...c, frozen: true } : c);

// РАСШИРЯЕТСЯ T2:
const inputPieceSet = new Set(op.inputPieces || []);
const pieces = state.pieces.map((p) => inputPieceSet.has(p.id) ? { ...p, frozen: true } : p);

return { ...state, operations, containers, pieces, positions, editorContext, toast };
```

OP_RESET (failed → committed) обратно снимает frozen с pieces.

---

## 6. Порядок выполнения

**K1.** Расширить `lib/piece-invariants.js` — добавить `'legacy-migration'` в allowed origins. ~1 line.

**K2.** Расширить `lib/piece-model.js` — добавить `frozen: false` default в createPiece. Если уже было — расширить shape JSDoc.

**K3.** Создать `lib/op-piece-bridge.js` с 4 resolver helpers + isOpReadyToExecute. Pure.

**K4.** Расширить `createOperationDraft` в `skeleton-state-operations.js` — добавить `inputPieces: []` в shape.

**K5.** Добавить actions OP_SET_INPUT_PIECES + OP_REMOVE_INPUT_PIECE в operationsReducer.

**K6.** Расширить REMOVE_PIECE в `skeleton-state-pieces.js` — cascade в operations. Расширить REMOVE_CONTAINER в `skeleton-state-canvas.js` — cascade в pieces (через изменение piece-side reducer чтобы видеть REMOVE_CONTAINER action и реагировать на него; или через new finalizer в skeleton-state.js — выбрать паттерн при K6).

**K7.** Создать `migrateV4toV5` в `lib/skeleton-persistence.js`. Добавить в migration chain. Не забыть импорт `generatePieceColor`.

**K8.** Обновить adapters:
- `canvas/operations/adapters/pcr.js` — bridge resolution.
- `canvas/operations/adapters/cut.js` — bridge resolution.
- `canvas/operations/adapters/gibson.js`, `ligate.js`, `kld.js` — bridge resolution.
- `canvas/operations/adapters/mutagenesis.js` — bridge resolution.
- `canvas/operations/lib-adapters.js::executeOperation` — pass pieces в ctx.

**K9.** Расширить `handleOpExecute` в `skeleton-state.js` — freeze pieces (DEC-T2-13).

**K10.** Selector `selectPiecesForOperation` + `selectOperationsUsingPiece` в `selectors-pieces.js`.

**K11.** Tests:
- `__tests__/lib/skeleton-persistence-migration-v5.test.js` — migration v4→v5: single PCR op + multi-input Gibson + idempotency + bad refs handling. ~8 тестов.
- `__tests__/lib/op-piece-bridge.test.js` — все 4 helpers + isOpReadyToExecute на mock state. ~10 тестов.
- `__tests__/store/skeleton-state-pieces-cascade.test.js` — REMOVE_PIECE cascades в operations + REMOVE_CONTAINER cascades в pieces. ~4 теста.
- `__tests__/canvas/operations/adapters/pcr-piece-resolve.test.js` — PCR adapter с/без inputPieces. ~3 теста.
- `__tests__/integration/op-execute-with-pieces.test.jsx` — full handleOpExecute сценарий, freeze pieces. ~2 теста.
- `__tests__/store/skeleton-state-operations.test.jsx` — OP_SET_INPUT_PIECES + OP_REMOVE_INPUT_PIECE. ~3 теста.

Total: ~30 новых. Baseline 2683 → ~2713.

**K12.** Manual smoke:
- Загрузить старый projectsnapshot (pre-T2) — должен мигрировать, появляются pieces для каждой existing op.
- Создать новую PCR op через current UI (PcrModeShell hover-icon V70) — `op.inputs` ставится, `op.inputPieces` пуст. Existing flow работает.
- OP_EXECUTE на migrated op — bridge resolves template из inputPieces, runs PCR, output container создан, inputs frozen, pieces frozen.

**K13.** Size budget:
```bash
cd gui/designer/src/components/CanvasSkeleton
find . -name '*.js' -printf '%s %p\n' | sort -n | tail -20
```
Особое внимание `lib/op-piece-bridge.js` (новый), `lib/skeleton-persistence.js` (расширен).

---

## 7. STOP-условие

Code останавливается после K13. НЕ финализирует RELEASES / DECISIONS / BUGS / PROJECT_STATE / ANCHORS / TECH_DEBT / COMPONENT_MAP / CLAUDE / package.json / version.js.

Code в отчёте выдаёт:

```
## T2 Pieces Migration — отчёт
Commits: ...
Vitest: 2683 → 2715 pass / 1 skip / 0 fail (+32 new)
pytest: 112/112
vite build: clean

Size budget:
- skeleton-state-operations.js: X.X KB (was Y.Y) ✓
- lib/op-piece-bridge.js: 7.8 KB ✓ (new)
- lib/skeleton-persistence.js: X.X KB (was Y.Y, +1.5 KB) ✓
- canvas/operations/adapters/pcr.js: X.X KB (was Y.Y, +0.4 KB) ✓
- skeleton-state.js: 14.5 KB ✓ (+0.2 KB freeze-pieces)
- store/selectors-pieces.js: X.X KB (was Y.Y, +0.5 KB) ✓

Migration verification:
- Pre-T2 snapshot из тестов имеет N ops, migration создаёт M pieces (M = sum input counts), все pieces имеют origin='legacy-migration'.
- Idempotency: повторная миграция на v5 snapshot — schemaVersion stays 5, no new pieces.
- PCR op с range — migrated piece имеет правильный range, derivedReactionId set.
- Multi-input Gibson — каждый input имеет свой piece, все origin='legacy-migration', derivedReactionId=null.

Spec deviations: [none / list ...]
Manual smoke: [results]
Открытые вопросы: [none / list ...]
```

---

## 8. Что делать при регрессии

1. **PCR/Cut/Gibson tests падают** — bridge resolution может вернуть undefined вместо null. Adapter должен trust bridge возвращает Container | null. Если undefined — bug в bridge.
2. **Migration v4→v5 теряет op.inputs** — migration должна **сохранять** op.inputs (back-compat), только добавлять op.inputPieces. Если op.inputs пропал — bug в migrateV4toV5.
3. **freeze на pieces не работает при OP_EXECUTE** — проверить порядок: freeze pieces должен быть ПОСЛЕ создания outputs (чтобы output piece если есть не frozen'ился — но в T2 outputs остаются containers, pieces input-only).
4. **REMOVE_CONTAINER каскад путается** — порядок reducer chain в router: canvas → operations → editor → assembly → pieces. REMOVE_CONTAINER action сначала canvas обрабатывает (container исчез), затем pieces видит изменение и удаляет соответствующие pieces. Если pieces видит state где container ещё есть — порядок неверный, fix в router.

---

## 9. Риски

### R-T2-1 — Migration v4→v5 теряет данные для corrupted snapshots
**Risk:** Op с bad container reference → piece не создаётся → op.inputPieces.length < op.inputs.length → adapter не может резолвить.
**Mitigation:** В migration — graceful skip (continue), не выкидывание. В тестах — explicit test case с broken container ref.

### R-T2-2 — Bridge fallback chains скрывают баги
**Risk:** Если `inputPieces` корректно настроен но piece deleted → bridge падает на fallback `op.inputs` → adapter получает container, но логически piece deletion должен быть detected.
**Mitigation:** Tests с deleted piece явно проверяют что bridge returns null (а не fallback). Adapter сам решает что делать с null — toast warning или error.

### R-T2-3 — Migration v4→v5 создаёт ДУБЛИКАТЫ pieces для одного container в разных ops
**Risk:** Container c-A используется в op1 (PCR full-length) и op2 (Gibson full-length). Migration создаёт два разных piece (origin='legacy-migration') с одним sourceId и одинаковым range. Это **корректное поведение** — биолог может думать о них как о разных amplicon'ах. Но визуально на T4 канвасе будет два зелёных piece-карточек у одного container.
**Mitigation:** Принимаем это поведение. T5 UI имеет «слить дубликаты» action (post-T2 enhancement). В T2 — explicit DEC-T2-NN решение: migration не дедуплицирует, биолог разруливает позже.

### R-T2-4 — Tests на T1 могут случайно сломаться от extension origin enum
**Risk:** Test fixture в T1 проверяет `Piece.origin` ∈ {selection, feature, existing-primers, new-primers}. Т2 добавляет `legacy-migration`. Если test проверяет «invalid origin returns error» — это всё ещё работает (new origin не invalid). Если test проверяет «допустимые origins» массивом — может сломаться.
**Mitigation:** Code не модифицирует T1 тесты. Если тест сломался — fix в test (добавить `'legacy-migration'` в allowed set).

### R-T2-5 — `executeOperation` orchestrator не передавал pieces в ctx ранее
**Risk:** В existing code `executeOperation(op, { containers })` — pieces не в ctx. Если K8 не обновит вызов в handleOpExecute — bridge внутри adapter упадёт на `state.pieces` undefined.
**Mitigation:** K8 явно обновляет вызов. Bridge gracefully handles ctx без pieces (возвращает null). Test verifies.

### R-T2-6 — frozen на piece не учитывается selectPieceSequence
**Risk:** T1 selectPieceSequence не знал о frozen. T2 добавляет frozen — но selectPieceSequence читает container.sequence на ходу. Если piece.frozen=true и container изменился — sequence изменилась хотя должна остаться same.
**Mitigation:** Когда piece становится frozen (OP_EXECUTE) — **snapshot sequence в piece.frozenSequence: string**. selectPieceSequence сначала проверяет frozenSequence, fallback к live compute. Это shape extension в T2.

Эта подзадача добавляется в K6 (расширение REMOVE_PIECE) — нет, в K9 (handleOpExecute freeze). Phrasing:

```javascript
// При freeze в handleOpExecute:
const pieces = state.pieces.map((p) => {
  if (!inputPieceSet.has(p.id)) return p;
  // Compute & cache sequence (если ещё не cached).
  const frozenSequence = p.frozenSequence ?? computeFromState(p, state);
  return { ...p, frozen: true, frozenSequence };
});
```

`computeFromState` — local helper в handleOpExecute или reuse selectPieceSequence.

---

## 10. Открытые вопросы для Chat

T2 — migration. Code должен спрашивать Chat если:
1. Multi-source piece в legacy snapshot обнаружен (теоретически невозможно, но если есть corrupt data) — что делать?
2. Op с `kind === 'mutagenesis'` имеет специфическую structure в params — какой acquisitionMethod ставить?

**Дефолты:**
1. Skip op, log warning toast «миграция: op X имела multi-source piece references, не мигрирована».
2. Mutagenesis → acquisitionMethod='undefined' (mutagenesis — это special op, его outputs — не piece-derived containers а mutated containers; не PCR-amplification).

---

## 11. Pre-handoff чеклист

- [x] Срез размеров в §0.
- [x] Контекст + стратегия (§1-2).
- [x] Scope IN/OUT (§3).
- [x] DEC-T2-01..15 (§4).
- [x] Shape/actions/helpers (§5).
- [x] K1-K13 (§6).
- [x] STOP-условие (§7).
- [x] 6 рисков (§9).
- [x] Открытые вопросы (§10).
- [x] Размер 30-35 KB target.
- [x] Никакого UI (явный scope OUT).
- [x] Reference на якорь + T1 в заголовке.
- [x] Гибридный подход явный — DEC-T2-01.

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-01, 03, 05, 22, 29, 30 + T1 SPRINT_T1_PIECES_STATE.md.
**Следующий sprint:** T3 — zones data + frames (параллельно с T5/T6 после T1-T2 acceptance).
