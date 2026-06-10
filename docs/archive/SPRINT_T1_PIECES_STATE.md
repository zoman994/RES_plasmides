# SPRINT_T1_PIECES_STATE.md — добавление `state.pieces` slice

> **Тип:** A (архитектура / data layer).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-01, 03, 04, 05, 06, 21, 27, 28).
> **Зависимости:** нет (T1 standalone).
> **Размер целевой:** 30-35 KB.
> **Цель:** добавить новую state-сущность piece по существующему паттерну sub-reducer'ов (canvas / operations / editor / assembly). Без UI, без миграции op.params.range — это T2/T5.

---

## 0. Срез размеров затрагиваемых модулей (CHAT_PLAYBOOK §2 п.0)

| Файл | Текущий размер | Лимит | Статус | Действие в T1 |
|------|----------------|-------|--------|---------------|
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state.js` | ~14 KB | soft 20 / hard 25 (.js) | OK | +1 строка импорта + 1 строка в reducer chain. ~14.2 KB после. |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-canvas.js` | ? | soft 20 / hard 25 (.js) | проверить в Code | НЕ трогаем. |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-operations.js` | ? | soft 20 / hard 25 (.js) | проверить | НЕ трогаем. |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-editor.js` | ? | soft 20 / hard 25 (.js) | проверить | НЕ трогаем. |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-assembly.js` | ~22 KB (по аналогии с assembly slice patterns) | soft 20 / hard 25 (.js) | проверить | НЕ трогаем (мигрирует в T6). |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-pieces.js` | — (новый) | soft 20 / hard 25 (.js) | new | ~10-15 KB новый sub-reducer. |
| `gui/designer/src/components/CanvasSkeleton/lib/piece-model.js` | — (новый) | soft 20 / hard 25 (.js) | new | ~6-8 KB pure helpers. |
| `gui/designer/src/components/CanvasSkeleton/lib/piece-invariants.js` | — (новый) | soft 20 / hard 25 (.js) | new | ~3-4 KB hard caps + validation. |
| `gui/designer/src/components/CanvasSkeleton/store/selectors-pieces.js` | — (новый) | soft 20 / hard 25 (.js) | new | ~5-7 KB selectors. |
| `gui/designer/src/components/CanvasSkeleton/store/skeleton-persistence.js` | ? | soft 20 / hard 25 (.js) | проверить | +schema v3→v4 migration (~1 KB добавки). |

**Декомпозиция как первый пункт спринта НЕ требуется** — `skeleton-state.js` уже разделён на router + 4 sub-reducer'а (M-CANVAS-OPS K2 + R12). Новый pieces slice следует **существующему паттерну** (как `skeleton-state-assembly.js`).

Code в **отчёте после реализации** обязан запустить `find components/CanvasSkeleton/store -name '*.js' -printf '%s %p\n' | sort -n | tail -15` и зафиксировать новые/изменённые размеры.

---

## 1. Контекст

### 1.1 Что есть в коде сейчас

`state` главного reducer'а CanvasSkeleton имеет 4 primary slice'а через композицию:

```
state = {
  // base
  view, highlightedContainerId, selectedContainerIds, toast, toasts, primers,
  // canvas slice (containers / positions / junctions / cascadeIndex / commits)
  ...buildInitialCanvasState(),
  // operations slice (operations[])
  ...buildInitialOperationsState(),
  // editor slice (editorOpen / editorContext / draftSessions / pendingEdits / selectionByTab)
  ...buildInitialEditorState(),
  // assembly slice (assemblyDrafts / assemblyDraftPrimers)
  ...buildInitialAssemblyState(),
};
```

Router в `skeleton-state.js` в default case вызывает sub-reducer'ы по цепочке `canvas → operations → editor → assembly`. Каждый sub-reducer проверяет свой action set (через `isXAction(type)` или прямо через switch с default-passthrough).

Patterns установлены DEC-OPS-01 (M-CANVAS-OPS K2, 12.05.2026):
- Один файл на slice.
- `buildInitialXState()` returns object spread в root state.
- `xReducer(state, action)` — returns new state or unchanged.
- При необходимости `isXAction(type)` — Set guard для fast-path.

### 1.2 Что добавляется в T1

Новая сущность `piece` (DEC-CANVAS-4T-01). Параллельно containers / operations / junctions / assemblyDrafts. **Не пересекается** с ними, отдельный slice.

Это **чисто data layer**. Никакого UI:
- Нет PieceCreateModal (T5).
- Нет drag-and-drop (T7).
- Нет auto-create reactions из acquisitionMethod (T8).
- Нет миграции `op.params.range` (T2).
- Нет связи с zoneId (T3 добавит поле, селекторы для zones).

T1 покрывает: state shape + actions + selectors + invariants + persistence migration v3→v4 (no-op для существующих snapshots — pieces field initializes к `[]`) + unit-tests.

### 1.3 Почему T1 standalone

После T1 piece-объекты можно создавать через dev-console / тесты, но не через UI и не через op.params.range миграцию. Это — **сознательная декомпозиция риска**:
- T1 проверяет shape + invariants + persistence изолированно.
- T2 наслаивается с migration op.params.range → отдельные pieces (тестируется ПОВЕРХ T1 inventory).
- T5 наслаивается UI (тестируется поверх T1+T2).

Если T1 имеет дефект в shape — он ловится до того как UI и migration на нём построены.

---

## 2. Стратегия

Существующий pattern — добавление нового sub-reducer'а + extension `buildInitialState` + chain в router. Минимальная инвазивность в `skeleton-state.js` (1 импорт + 1 строка в chain).

Pure helpers (`piece-model.js`, `piece-invariants.js`) в `CanvasSkeleton/lib/` — параллельно существующим `assembly-model.js`, `assembly-invariants.js`, `assembly-primer-utils.js`.

Selectors в `store/selectors-pieces.js` — параллельно `selectors-assembly.js`, `selectors-junction.js`, `selectors-pcr.js`, `selectors-product.js`.

Persistence migration в `lib/skeleton-persistence.js` — append к existing migration chain (v2→v3 уже есть, добавляем v3→v4).

Тесты — Vitest, новые файлы в `__tests__/CanvasSkeleton/`. Изоляция от существующих тестов (никакой регрессии Library / Importer / SequenceView).

---

## 3. Scope IN / OUT

### IN
- `state.pieces: Piece[]` slice + `skeleton-state-pieces.js` sub-reducer.
- 9 actions для CRUD piece (см. §5).
- `lib/piece-model.js` — pure helpers (createPiece / computePieceSize / generatePieceColor / clonePiece).
- `lib/piece-invariants.js` — hard caps + validation.
- `store/selectors-pieces.js` — 6 selectors.
- Schema bump v3→v4 + migration в `lib/skeleton-persistence.js` (для существующих snapshots — append пустого `pieces: []`).
- Unit tests (~30 тестов на actions + selectors + invariants + persistence).
- Re-exports back-compat в `skeleton-state.js` (типа `containerFromLibraryEntry`).
- `STRINGS.canvasSkeleton.pieces.*` namespace (placeholder strings — реальный UI в T5).

### OUT (другие T)
- UI: PieceCreateModal, PiecePrimersPickModal, context-menu extensions в SequenceView, хоткей P → T5.
- Migration существующих `op.params.range` → отдельные pieces → T2.
- Поле `piece.zoneId` (опциональное, в T1 не используется — добавляется в T3 schema).
- Auto-create reactions из `piece.acquisitionMethod` → T8.
- Visual rendering на canvas (зелёные piece-карточки) → T4.
- Sequence-mode rendering piece-зон → T7.

### NOT TOUCHED (никаких правок)
- `gui/designer/src/store/` (global Zustand) — pieces живут в local skeleton-state per DEC-SKELETON-01.
- `Library/`, `Importer/`, `SequenceView/`, `Annotator/` — pieces не интегрированы.
- `state.containers`, `state.operations`, `state.junctions`, `state.assemblyDrafts` — нетронуты.
- Algorithm core (`local-primer-design.js`, `tm-calculator.js`, и т.д.).

---

## 4. Архитектурные решения

### DEC-T1-01 — Один sub-reducer файл `skeleton-state-pieces.js`
Не разбивать на pieces-crud + pieces-derived. На T1 объём ~10-15 KB — под soft 20. Если T8 (auto-create reactions) добавит логику и файл перевалит soft — расщеплять тогда, не превентивно.

### DEC-T1-02 — Pure helpers в `CanvasSkeleton/lib/piece-model.js`
Параллельно existing `lib/assembly-model.js`. Reducer-side вычисления не делаем — helpers возвращают partial state, reducer композирует. Это упрощает unit-тестирование (helpers — pure, без mock state).

### DEC-T1-03 — Schema version bump v3 → v4 даже для пустого `pieces: []`
Bump обязателен, потому что REPLACE_STATE / loadSnapshot должны явно знать что snapshot post-T1. Migration функция — pure / idempotent, добавляет `pieces: []` если отсутствует. Pre-T1 snapshot'ы automatically upgrade без потерь.

### DEC-T1-04 — `piece.id` префикс `pc-` + uuidv7
Существующие префиксы в codebase: `c-` (containers), `op-` (operations), `j-` (junctions), `ad-` (assembly drafts). Pieces получают `pc-`. Это даёт читаемые id в DECISIONS / BUGS / отладке (`pc-018f...` vs `c-018f...` визуально различимы).

### DEC-T1-05 — `piece.sourceIds: string[]` — массив, не одиночное поле
Сразу под derived-piece (DEC-CANVAS-4T-03). Большинство pieces в начале — selection от одного source (1 элемент в массиве). OV_PCR derived pieces (как `gRNA(275-279)`) имеют 2 элемента. Generalization не добавляет сложности — Array.isArray проверка тривиальна.

### DEC-T1-06 — `piece.ranges` параллельный массив, не вложенный в sourceIds
Альтернатива была — `piece.sources: [{sourceId, start, end, orientation}]`. Не выбрано потому что invariant `sourceIds.length === ranges.length` хочется иметь как hard-validated в invariants module, а separate массивы — explicit. Это также упрощает migration T2: `op.params.range` (одиночный {start, end}) → `piece.ranges = [{sourceId: containerId, start, end, orientation: 'forward'}]` — одиночный append, не вложенный объект.

### DEC-T1-07 — `acquisitionMethod` — string enum
Допустимые значения: `'undefined' | 'pcr' | 'ov-pcr' | 'restriction' | 'direct' | 'synthesis'`. Хранится как string (не number / не object). Invariant: при не-undefined значении должны быть `acquisitionParams` (см. § 5.7).

### DEC-T1-08 — Цвет piece — pre-computed на CREATE_PIECE, не reactive selector
HSL hash от `piece.id` (string deterministic). Хранится в `piece.color` как hex. **Не пересчитывается** при rename — это `id`-based, не `name`-based. Override через `UPDATE_PIECE_COLOR` записывает новое значение, hash больше не applied. На >12 piece — collision detection (см. invariants §6).

### DEC-T1-09 — Hard cap 500 pieces / project
Не лимит UI (биолог никогда не имеет 500 piece в реальной сборке — на бумажной диаграмме 12). Защита от runaway dev-tests или malformed import. При попытке создать 501-й — error toast + no-op.

### DEC-T1-10 — Hard cap 200 ranges на один piece
Сам piece имеет ≤200 ranges (опять же — биологически 1-2 — нормально, derived-piece OV_PCR 2). 200 — порог защиты от import-bug. При попытке split добавляющий 201-й range — error.

### DEC-T1-11 — Имя piece НЕ обязано быть уникальным глобально
Биолог может назвать два разных piece одинаково («U3 gRNA»), если это logically разные отборы. Уникальность — concern UX (toast warning при collision внутри zone в T5), не инвариант данных.

### DEC-T1-12 — `piece.derivedReactionId` — обратная ссылка, поддерживается reducer'ом
При auto-create reaction (T8) — reducer ставит `piece.derivedReactionId = newOpId`. При удалении reaction — reducer обнуляет `derivedReactionId = null` на всех piece-ах, которые на неё ссылались. В T1 это поле существует в shape, но не используется (никогда не set'ится). Полностью функционально оживёт в T8.

### DEC-T1-13 — REPLACE_STATE merging — добавление defaults без потери existing данных
Когда `REPLACE_STATE` загружает snapshot не имеющий `pieces` (pre-T1) — defaults `pieces: []` подставляются из `buildInitialState()`. Уже работающий pattern (см. F1 DEC-CANVAS-WIN-01 для editorContext.tabs). Расширяется на pieces.

### DEC-T1-14 — Idempotent migration v3→v4
Функция `migrateV3toV4(snapshot)` детектирует версию (`snapshot.schemaVersion ?? 3` — pre-bump snapshot'ы не имели поля), bump'ит до 4, добавляет `pieces: []` если отсутствует. Повторный вызов — no-op (`schemaVersion === 4` → ничего не делает).

---

## 5. Shape + actions + сигнатуры

### 5.1 Piece shape

```
// lib/piece-model.js — типы (JSDoc, не TypeScript — проект на JS)
/**
 * @typedef {Object} PieceRange
 * @property {string} sourceId      // container id
 * @property {number} start         // 0-indexed, inclusive
 * @property {number} end           // exclusive
 * @property {'forward'|'reverse'} orientation
 */

/**
 * @typedef {Object} Piece
 * @property {string} id                      // 'pc-<uuidv7>'
 * @property {string} name                    // user-given или auto «{containerName}({start}-{end})»
 * @property {string[]} sourceIds             // 1+ container ids
 * @property {PieceRange[]} ranges            // параллельно sourceIds, length === sourceIds.length
 * @property {'selection'|'feature'|'existing-primers'|'new-primers'|'legacy-migration'} origin
 *   // 'legacy-migration' — T2 для migrated op.params.range
 * @property {'undefined'|'pcr'|'ov-pcr'|'restriction'|'direct'|'synthesis'} acquisitionMethod
 * @property {Object} acquisitionParams       // см. §5.7
 * @property {string} color                   // hex '#RRGGBB' или 'hsl(...)' (T1 hex)
 * @property {string|null} functionalLabel    // user, опционально
 * @property {string|null} zoneId             // T3 добавит set, T1 всегда null
 * @property {string|null} derivedReactionId  // T8 set, T1 всегда null
 * @property {number} createdAt               // ms
 * @property {number} updatedAt               // ms
 */
```

### 5.2 Initial state + reducer skeleton

`buildInitialPiecesState()` returns `{ pieces: [] }`.

`piecesReducer(state, action)`:
- `case 'CREATE_PIECE':` — validate via piece-invariants, create piece, prepend or append.
- `case 'UPDATE_PIECE':` — find by id, merge, bump updatedAt.
- `case 'REMOVE_PIECE':` — filter out by id. Если piece используется в reaction (T8) — будет рассмотрено там; в T1 — просто удаляет.
- `case 'CLONE_PIECE':` — глубокое копирование source piece, новый id, имя «{originalName} (копия)».
- `case 'SET_PIECE_ACQUISITION_METHOD':` — set method + acquisitionParams.
- `case 'SET_PIECE_COLOR':` — set color (override).
- `case 'SET_PIECE_FUNCTIONAL_LABEL':` — set label.
- `case 'SET_PIECE_ZONE':` — set zoneId (T3 будет вызывать; в T1 admitted shape).
- `case 'BUMP_PIECE_ORIGIN':` — change origin (для migration T2).
- default: `return state;`

`isPieceAction(type)` — Set guard с 9-ю action types.

### 5.3 Action: CREATE_PIECE

```
dispatch({
  type: 'CREATE_PIECE',
  piece: {
    name,
    sourceIds,
    ranges,
    origin,
    acquisitionMethod,
    acquisitionParams,
    functionalLabel?,
  },
});
```

Логика reducer:
1. Validate через `piece-invariants.validateCreate(state, action.piece)`:
   - Hard cap 500 (state.pieces.length < 500).
   - sourceIds.length >= 1 && sourceIds.length === ranges.length.
   - Каждый sourceId существует в state.containers.
   - Каждый range — `{start: int, end: int, orientation: 'forward'|'reverse'}`, start < end, start >= 0, end <= containerLength.
   - origin ∈ enum.
   - acquisitionMethod ∈ enum.
   - При `acquisitionMethod !== 'undefined'` — acquisitionParams non-empty.
2. Если invalid → return state + toast error.
3. Если valid → создать piece через `piece-model.createPiece(rawData)`:
   - id = `'pc-' + uuidv7()`.
   - color = `generatePieceColor(id, existingColors)`.
   - createdAt = updatedAt = Date.now().
   - zoneId = null, derivedReactionId = null.
4. Append к state.pieces (порядок — append, не prepend, потому что хочется visual stability в T4 rendering).

### 5.4 Action: UPDATE_PIECE

```
dispatch({
  type: 'UPDATE_PIECE',
  pieceId,
  changes: { name?, ranges?, functionalLabel?, ... },
});
```

Логика:
1. Find piece by id. Если нет — return state.
2. Validate changes через `piece-invariants.validateUpdate(state, piece, changes)`.
3. Merge: `{ ...piece, ...changes, updatedAt: Date.now() }`.
4. Если ranges изменились — пересчитать `sourceIds` (если changes.sourceIds не задан) и провалидировать `sourceIds.length === ranges.length`.
5. Replace в state.pieces.

### 5.5 Action: REMOVE_PIECE

```
dispatch({ type: 'REMOVE_PIECE', pieceId });
```

Логика:
1. Filter out. Если piece не существовал — return state.
2. В T8 будет дополнено: каскадное удаление derivedReaction если есть. В T1 — просто filter.

### 5.6 Action: CLONE_PIECE

```
dispatch({ type: 'CLONE_PIECE', pieceId, overrides?: { name?, zoneId? } });
```

Логика:
1. Find. Если нет — return state.
2. Hard cap check (501-ый не создастся).
3. Глубокое копирование (JSON-roundtrip OK для plain object):
   - Новый id, новые createdAt/updatedAt.
   - color — сгенерировать заново через `generatePieceColor(newId, existingColors)`.
   - derivedReactionId = null (клон не наследует связь с reaction).
   - name = overrides.name ?? `${original.name} (копия)`.
   - zoneId = overrides.zoneId ?? original.zoneId.
4. Append.

### 5.7 acquisitionParams shape

Discriminated по acquisitionMethod:
- `'undefined'` → params не используется (можно пустой `{}`).
- `'pcr'` → `{ primerPairId: {forward: primerEntryId, reverse: primerEntryId} | {forward: 'pending', reverse: 'pending'} }`. Pending — праймеры будут designed в T5 / T8.
- `'ov-pcr'` → `{ primerPairs: [{forward, reverse}, {forward, reverse}] }` — массив пар, по одной на input source.
- `'restriction'` → `{ enzymes: ['BsaI', 'XhoI'], cutSites: [{enzymeName, position}, ...] }`.
- `'direct'` → `{}` (источник = piece весь как есть).
- `'synthesis'` → `{ orderStatus: 'pending'|'ordered'|'received', vendor?, orderedAt? }`.

T1 не использует params в логике (просто хранит). T5+T8 наполняют их реально.

### 5.8 Action: SET_PIECE_ACQUISITION_METHOD

```
dispatch({
  type: 'SET_PIECE_ACQUISITION_METHOD',
  pieceId,
  method,
  params?,
});
```

Логика:
1. Find. Validate method ∈ enum, params shape для method.
2. Если method меняется с 'pcr'/'ov-pcr' на 'undefined' или 'direct' — `derivedReactionId` обнуляется (T8 каскад там же).
3. В T1 — просто merge: `{ ...piece, acquisitionMethod: method, acquisitionParams: params || {}, updatedAt: Date.now() }`.

### 5.9 Helpers (`lib/piece-model.js`)

```
// createPiece(rawData, existingPieces) — returns Piece
//   Стamps id, color, timestamps. Pure function, no state.
//   Не валидирует — это invariants module concern.
export function createPiece(rawData, existingPieces) { ... }

// computePieceSize(piece) — returns number
//   Σ (range.end - range.start) для всех ranges. Если pieces overlap по source —
//   это не вычитается (биологически это два отдельных amplicon'а если разные orientation).
export function computePieceSize(piece) { ... }

// generatePieceColor(pieceId, existingColors?) — returns hex string
//   HSL hash от pieceId. Saturation 65%, Lightness 55% (pastel). Hue = hash % 360.
//   Если existingColors массив hex'ов содержит >12 elements — collision detection:
//   shift hue на ±20° чтобы избежать визуального дубля.
export function generatePieceColor(pieceId, existingColors = []) { ... }

// clonePiece(piece, overrides) — returns Piece (без validation)
//   Глубокое копирование + new id + new color + null derivedReactionId.
export function clonePiece(piece, overrides = {}) { ... }

// autoPieceName(container, range) — returns string
//   Format: '{containerName}({start}-{end})'.
//   Используется как default name для CREATE_PIECE через UI (T5) или migration (T2).
export function autoPieceName(container, range) { ... }
```

### 5.10 Invariants (`lib/piece-invariants.js`)

```
export const PIECE_CAPS = {
  MAX_PIECES: 500,
  MAX_RANGES_PER_PIECE: 200,
  MIN_RANGE_LENGTH: 1,         // bio: один nt — минимально валидно
  MAX_NAME_LENGTH: 200,
  COLOR_COLLISION_THRESHOLD: 12,
};

// validateCreate(state, rawPiece) — returns { ok: true } | { ok: false, error: string }
//   Все hard checks из §5.3.
export function validateCreate(state, rawPiece) { ... }

// validateUpdate(state, existingPiece, changes) — returns { ok, error? }
//   Те же checks применительно к merged shape.
export function validateUpdate(state, existingPiece, changes) { ... }

// validateRangeOnContainer(range, container) — returns { ok, error? }
//   start >= 0, end <= container.sequence.length, start < end, orientation ∈ enum.
export function validateRangeOnContainer(range, container) { ... }
```

### 5.11 Selectors (`store/selectors-pieces.js`)

```
// selectAllPieces(state) — все pieces.
export function selectAllPieces(state) { return state.pieces || []; }

// selectPieceById(state, pieceId) — piece | null.
export function selectPieceById(state, pieceId) { ... }

// selectPiecesByZoneId(state, zoneId) — pieces в зоне. T1 всегда [] (zoneId always null).
//   T3 наполнит реально.
export function selectPiecesByZoneId(state, zoneId) { ... }

// selectPieceSequence(state, pieceId) — derived sequence через слияние ranges.
//   Идёт по piece.ranges, для каждого вытаскивает container.sequence.slice(start, end),
//   reverseComplement если orientation==='reverse', конкатенирует. Возвращает string или null.
export function selectPieceSequence(state, pieceId) { ... }

// selectPiecesUsingContainer(state, containerId) — pieces у которых containerId в sourceIds.
//   Для каскадного удаления / warning при удалении container.
export function selectPiecesUsingContainer(state, containerId) { ... }

// selectPiecesByOrigin(state, origin) — фильтр по origin.
//   Для debug / тестов / dev-tools.
export function selectPiecesByOrigin(state, origin) { ... }
```

### 5.12 Persistence migration (`lib/skeleton-persistence.js` extension)

```
// Existing migration chain (упрощённо):
function migrate(snapshot) {
  let s = snapshot;
  if ((s.schemaVersion ?? 0) < 1) s = migrateV0toV1(s);
  if ((s.schemaVersion ?? 1) < 2) s = migrateV1toV2(s);
  if ((s.schemaVersion ?? 2) < 3) s = migrateV2toV3(s);
  // T1 добавляет:
  if ((s.schemaVersion ?? 3) < 4) s = migrateV3toV4(s);
  return s;
}

function migrateV3toV4(snapshot) {
  if (snapshot.schemaVersion === 4) return snapshot;
  return {
    ...snapshot,
    pieces: Array.isArray(snapshot.pieces) ? snapshot.pieces : [],
    schemaVersion: 4,
  };
}
```

Idempotent: повторный вызов на snapshot с schemaVersion=4 возвращает его без изменений.

### 5.13 Integration в router

`skeleton-state.js` минимальные изменения:

```javascript
// Импорт нового slice
import {
  buildInitialPiecesState,
  piecesReducer,
} from './skeleton-state-pieces';

// buildInitialState() — добавить ...buildInitialPiecesState() в spread.
export function buildInitialState() {
  return {
    // ...existing base + slices...
    ...buildInitialPiecesState(),  // NEW
  };
}

// Router default case — добавить в chain ПОСЛЕ assembly:
default: {
  next = canvasReducer(state, action);
  next = operationsReducer(next, action);
  next = editorReducer(next, action);
  next = assemblyReducer(next, action);
  next = piecesReducer(next, action);  // NEW — после assembly
  break;
}
```

Порядок piecesReducer **последний** потому что в T8 он будет реагировать на cascading changes от других slice'ов (например removal container → cascade removal piece). На T1 порядок не критичен, но фиксируется здесь как convention.

### 5.14 STRINGS namespace placeholder

`lib/strings.js` добавляет namespace `canvasSkeleton.pieces`:

```
pieces: {
  errorTooMany: 'Превышен лимит {limit} кусков на проект',
  errorInvalidRange: 'Недопустимый диапазон для куска',
  errorContainerNotFound: 'Источник для куска не найден',
  errorTooManyRanges: 'Превышен лимит {limit} диапазонов на один кусок',
  errorNameTooLong: 'Имя куска слишком длинное (макс {max})',
  errorInvalidMethod: 'Недопустимый метод получения куска',
  pieceClonedSuffix: ' (копия)',
  autoNameTemplate: '{name}({start}-{end})',
},
```

Эти строки используются в error toast'ах, autoName helper, clone action. T5 расширит namespace.

---

## 6. Порядок выполнения для Code

**K1.** Создать `lib/piece-model.js` со всеми helpers (§5.9). Pure, без зависимостей от state.

**K2.** Создать `lib/piece-invariants.js` (§5.10). Чистые validation functions.

**K3.** Создать `store/skeleton-state-pieces.js` (§5.2-5.8). buildInitial + reducer + isPieceAction.

**K4.** Создать `store/selectors-pieces.js` (§5.11). 6 selectors.

**K5.** Интеграция в `store/skeleton-state.js` (§5.13). 2 строки: импорт + chain.

**K6.** Schema migration в `lib/skeleton-persistence.js` (§5.12). `migrateV3toV4` + bump в chain.

**K7.** STRINGS namespace (§5.14).

**K8.** Unit tests:
- `__tests__/lib/piece-model.test.js` — createPiece / clonePiece / computePieceSize / generatePieceColor / autoPieceName. ~10 тестов.
- `__tests__/lib/piece-invariants.test.js` — validateCreate / validateUpdate / validateRangeOnContainer. ~8 тестов.
- `__tests__/store/skeleton-state-pieces.test.jsx` — 9 actions через dispatcher + state inspection. ~15 тестов.
- `__tests__/store/selectors-pieces.test.js` — все 6 selectors на mock state. ~6 тестов.
- `__tests__/lib/skeleton-persistence-migration-v4.test.js` — migration v3→v4 idempotent, pre-T1 snapshot upgrades. ~3 теста.

Total: ~42 теста. Vitest baseline после T1: 2641 → ~2683 pass.

**K9.** Manual smoke в dev-console (с открытым `/canvas-skeleton`):
```javascript
window.skeletonDispatch({
  type: 'CREATE_PIECE',
  piece: {
    name: 'Test U3 gRNA',
    sourceIds: ['c-...'],  // существующий container id из state.containers
    ranges: [{ sourceId: 'c-...', start: 100, end: 200, orientation: 'forward' }],
    origin: 'selection',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
  },
});
window.skeletonStore.getState().pieces;  // должен показать новый piece
```

**K10.** Size budget check (CHAT_PLAYBOOK §2 п.0):
```bash
cd gui/designer/src/components/CanvasSkeleton
find . -name '*.js' -printf '%s %p\n' | sort -n | tail -15
```
Все новые файлы должны быть под soft 20 KB. Если новый `skeleton-state-pieces.js` > 15 KB — recommendation для T8 split.

---

## 7. STOP-условие

Code останавливается после K10 и НЕ финализирует:
- `RELEASES.md` (Chat финализирует после visual acceptance — здесь acceptance dev-console smoke + unit-tests).
- `DECISIONS.md` — Chat вставляет DEC-T1-NN block.
- `BUGS.md` — без изменений.
- `PROJECT_STATE.md` — Chat обновит snapshot.
- `CLAUDE.md`, `ANCHORS.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md`, `package.json`, `version.js` — без изменений (T1 без bump'а версии, накапливаем T1+T2 в один minor bump).

Code в отчёте выдаёт:
1. **Commit range** (от первого commit T1 до K10).
2. **Vitest counters** — baseline 2641 → ожидание +42 → ~2683. Если меньше — указать пропущенные тесты.
3. **pytest** — 112/112 (T1 backend не трогает).
4. **Vite build** — clean.
5. **Spec deviations** — что отклонено от спеки и почему.
6. **Size budget** — вывод `find` + анализ.
7. **Manual smoke result** — что сработало в dev-console K9.
8. **Открытые вопросы для Chat** — если возникли.

---

## 8. Формат отчёта Code

В CURRENT_TASK.md или PR description:

```
## T1 Pieces State — отчёт

**Commits:** abc1234..def5678 (8 commits)
**Vitest:** 2641 baseline → 2685 pass / 1 skip / 0 fail (+44 new)
**pytest:** 112/112 unchanged
**vite build:** clean (warnings: none)

**Size budget:**
- skeleton-state-pieces.js: 12.4 KB ✓
- lib/piece-model.js: 7.2 KB ✓
- lib/piece-invariants.js: 3.8 KB ✓
- store/selectors-pieces.js: 5.1 KB ✓
- skeleton-state.js (modified): 14.3 KB ✓ (+0.2 KB)
- skeleton-persistence.js (modified): X.X KB ✓ (+0.6 KB)

**Spec deviations:**
- [none] / [list ...]

**Manual smoke:**
- CREATE_PIECE через dispatch — piece появился в state.pieces, color сгенерирован
- UPDATE_PIECE — name обновлён, updatedAt бамп
- CLONE_PIECE — копия с (копия) суффиксом, новый id, новый color
- Migration v3→v4 — pre-T1 snapshot из localStorage upgrade'нулся с pieces: []

**Открытые вопросы:** [none] / [list ...]
```

---

## 9. Что делать при регрессии

Если после K8 какой-то существующий тест упал:
1. **canvas/operations/editor/assembly slice тесты** — Code НЕ должен ничего в них менять. Если упало — это указывает на side-effect в новом piecesReducer. Расследовать.
2. **Library / Importer / SequenceView тесты** — Code НЕ должен трогать соответствующий код. Если упало — это unrelated regression, отдельный bugfix вне T1.
3. **Migration v3→v4 не идемпотентна** — добавить guard `if (snapshot.schemaVersion === 4) return snapshot;` первой строкой.
4. **Hard cap (500) случайно срабатывает в тестах** — проверить что тестовый buildInitialState не предзаполняет 500 pieces из старого snapshot.

---

## 10. Риски

### R-T1-1 — Code может попытаться сделать UI сразу
**Mitigation:** Scope IN явный — UI в T5. Если Code начнёт писать PieceCreateModal — STOP и блокировать.

### R-T1-2 — Code может попытаться сразу мигрировать op.params.range
**Mitigation:** Scope OUT явный — migration в T2. T1 standalone именно для разделения риска. Если Code начнёт писать migrateOpParamsRangeToPieces — STOP.

### R-T1-3 — HSL hash collisions на маленьких projects
**Risk:** На 5 piece все могут получить близкие hue.
**Mitigation:** generatePieceColor принимает существующие colors, при <12 шагает hue фиксированными interval'ами (`hue = (hash + i*30) % 360`). На большем масштабе collision detection с shift.

### R-T1-4 — `state.pieces` не персистится из-за upstream bug в `skeleton-persistence`
**Risk:** Code забыл добавить `pieces` в whitelist полей сохраняемых на disk.
**Mitigation:** K8 включает test «pieces persist round-trip — saveSnapshot затем loadSnapshot восстанавливает pieces unchanged».

### R-T1-5 — Code запутается в naming `piece` vs `Piece` vs `pieces`
**Mitigation:** Convention:
- `piece` — singular variable name (Piece object).
- `Piece` — JSDoc typedef name.
- `pieces` — array variable / state slice key.
- `PieceX` — component name (T5 onwards).

---

## 11. Открытые вопросы для Chat (если возникли)

T1 — pure data layer, ожидается **0 вопросов** от Code. Если возникли — Code останавливается на K3-K5 и спрашивает Chat. Особенно:
- Если piece-model.js хочет импортировать что-то из global state — НЕТ, не должен. Только container/sequence helpers из существующих lib/.
- Если invariants хочет проверить что-то про zoneId — НЕТ, zoneId в T1 always null, validation для него в T3.

---

## 12. Pre-handoff чеклист Chat (SPEC_CHECKLIST.md compliance)

- [x] Срез размеров затрагиваемых модулей в §0.
- [x] Контекст + стратегия (§1-2).
- [x] Scope IN / OUT (§3).
- [x] Архитектурные решения пронумерованы (§4, DEC-T1-01..14).
- [x] Файлы / сигнатуры helpers / структура тестов (§5).
- [x] Порядок выполнения K1-K10 (§6).
- [x] STOP-условие и формат отчёта (§7-8).
- [x] Риски с митигациями (§10).
- [x] Открытые вопросы (§11).
- [x] Размер спеки 30-35 KB — близко к target.
- [x] Никакого copy-paste кода >10 строк (сигнатуры + bullet'ы что делает).
- [x] Никакого «нового workspace / окна / fullscreen» (§17 R3 CHAT_PLAYBOOK) — T1 без UI.
- [x] Reference на якорь архитектуры в заголовке.
- [x] Связи с existing компонентами в §1.1 (по §17 R4).

---

**Дата:** 16.05.2026.
**Автор:** Chat.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-01, 03, 04, 05, 06, 21, 27, 28.
**Следующий sprint:** T2 — миграция `op.params.range` → отдельные pieces (зависит от T1).
