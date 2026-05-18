# SPRINT_T9_DESIGN_AND_CLONE_VARIANTS.md — design variants vs clone variants + ветвление финалов

> **Тип:** A (data + UI + cross-domain).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-11, 16, 17, 18, 19).
> **Зависимости:** T2 (op.inputPieces), T4 (zone rendering), T8 (auto-reactions). Параллелен T10 (но T10 logically follows T9 для clones).
> **Размер целевой:** 45-55 KB.
> **Цель:** различать **design variants** (биолог рассматривает альтернативы — N reaction-узлов с разными params) и **clone variants** (биолог трансформировал N колоний из одной ligation — 1 reaction + N materializedClones). MATERIALIZE_REACTION action + ветвление финалов rendering.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `store/skeleton-state-operations.js` | ? | soft 20 / hard 25 (.js) | +materializedClones field shape + MATERIALIZE_REACTION action, ~+2 KB |
| `store/skeleton-state-pieces.js` | ~17 KB (T8) | soft 20 / hard 25 | +variantGroupId field + CREATE_DESIGN_VARIANT action, ~+1.5 KB |
| `CanvasSkeleton/lib/variant-resolver.js` | — (new) | soft 20 / hard 25 | ~6-8 KB |
| `canvas/zone-sequence-mode/BranchingVisual.jsx` | ~3-4 KB (T7 stub) | soft 30 / hard 40 (.jsx) | переписать с поддержкой design vs clone variants, ~+5 KB → ~9 KB |
| `canvas/MaterializeCloneModal.jsx` | — (new) | soft 30 / hard 40 | ~6-8 KB UI выбора колоний |
| `canvas/VariantGroupBadge.jsx` | — (new) | soft 30 / hard 40 | ~3-4 KB visual indicator для design variants |
| `canvas/CanvasLayoutView.jsx` | ~22 KB (T4+T7+T8) | soft 30 / hard 40 | +variant-group rendering (group N ops в visual cluster), ~+1.5 KB |
| `store/selectors-pieces.js` | ~8-9 KB | soft 20 / hard 25 | +selectVariantGroup, +selectMaterializedClones, ~+1 KB |
| `lib/strings.js` | ? (после T8 split possibly) | soft 20 / hard 25 | +variant strings ~+0.7 KB |

---

## 1. Контекст

### 1.1 Что после T1-T8

- piece имеет acquisitionMethod, derivedReactionId, sourceIds, ranges.
- Auto-reactions создаются finalizer'ом (T8).
- Cross-zone link badges работают.
- В graph-mode — pieces visualized как nodes, reactions слева от них.

**Что НЕ работает:**
- Биолог рассматривает 2 варианта PCR (разные primer pairs) — оба должны существовать как отдельные reaction-узлы, но visually grouped как «варианты».
- Биолог делает Gibson assembly + 4 колонии вышли — все 4 — physical clones одного и того же design. В graph они должны быть 1 reaction-узел + materializedClones[] список.

### 1.2 Семантическое различие

**Design variant** (DEC-CANVAS-4T-17 alt-A):
- Биолог проектирует РАЗНЫЕ варианты one и того же фрагмента. Например, U3 gRNA с двумя альтернативными spacer'ами.
- Two separate pieces (разные ranges, разные primers если PCR).
- Two separate reactions (auto-created T8).
- Visually grouped — VariantGroupBadge показывает что они альтернативы.
- БИОЛОГ ВЫБИРАЕТ ОДИН (или несколько) для дальнейшей сборки. Не выбранный — остаётся в zone как «парковка».

**Clone variant** (DEC-CANVAS-4T-17 alt-B):
- Биолог сделал Gibson, трансформировал, вытащил N колоний. Все одинаковый design, но biological clones (могут отличаться mutations etc.).
- One reaction (Gibson) + outputs: один original product container + materializedClones: [{containerId, label, sangerVerified, ...}] для каждой колонии.
- Visually — 1 ромб + ниже N контейнеров (1-й — оригинал product, остальные — clones).
- БИОЛОГ ВЫБИРАЕТ ОДИН VERIFIED CLONE через UI (T9) или Sanger result (T10).

### 1.3 Что добавляется в T9

**Design variants:**
- Поле `piece.variantGroupId: string | null` — pieces в одной группе — альтернативы.
- Action `CREATE_DESIGN_VARIANT` — клонирует existing piece + new variantGroupId, allows biolog edit params.
- Visual grouping в graph — VariantGroupBadge.
- Selector `selectVariantGroup(state, variantGroupId)` returns pieces в группе.
- В T7 sequence-mode ленте — variants показываются как ветви Y-разветвителя.

**Clone variants:**
- Поле `op.materializedClones: Array<{cloneId, label, sangerVerified}>` — на operation level.
- Action `MATERIALIZE_REACTION` — биолог указал что op готова + N колоний. Создаются N container'ов как clones original output.
- UI: `MaterializeCloneModal` — биолог вводит N (число колоний), labels.
- Visual: 1 ромб + N контейнеров below.
- В T7 sequence-mode — финал может быть «N клонов» — dropdown.

**Ветвление финалов в sequence-mode** (refinement T7 stub):
- N финалов derived через T3 selectFinalProductsInZone.
- Если разные finals derived FROM same Gibson with materializedClones — это clone variants → отображаем как «1 финал, N колоний».
- Если разные finals derived FROM different reactions (variantGroupId markings) — это design variants → отображаем как «N вариантов финала».

### 1.4 Что НЕ в T9

- Sanger lab notebook UI (T10).
- Verify clone через Sanger result (T10).
- Smart pre-fill labels для clones (post-MVP).
- Animation merge variant groups → выбор (post-MVP).

---

## 2. Стратегия

**Discriminator field:**
- `piece.variantGroupId: string | null` (new T9). Default null = не вариант.
- `op.materializedClones: Array<CloneEntry> | null` (new T9). Default null = no clones materialized.

Two поля независимы — piece может быть design variant И op может иметь clones одновременно (биолог сделал PCR variant, потом Gibson, потом 4 колонии).

**Action API:**
- `CREATE_DESIGN_VARIANT(pieceId, overrides)` — клонирует piece + assign variantGroupId. Если у source piece variantGroupId есть — new piece принимает same group. Если нет — create new group (assign к both source AND new).
- `MATERIALIZE_REACTION(opId, clones)` — устанавливает op.materializedClones. clones = array of {label, optional sangerVerified: null}. Сreates N container clones (output containers с метками clone).
- `REMOVE_FROM_VARIANT_GROUP(pieceId)` — clear piece.variantGroupId.

**Auto-numbering** (per-zone):
- Когда несколько ops в zone — auto-assign номера через computed labels («PCR_1», «PCR_2»). Это implicit display feature, не stored поле.
- Для clones — auto-label «1», «2», ..., биолог может override.

**Visual rendering:**
- `VariantGroupBadge` — мелкая мaternal icon на каждой piece-карточке + reactionе которая в группе. Hover показывает группу label «Вариант 1 из 3».
- Group bounds — implicit (computed bounding box pieces+reactions с same variantGroupId). T9 — no explicit visual group frame. Variant group — это badge, не container.
- `MaterializeCloneModal` — popup. Поля: number of clones (N), template label (default «{output.name}/{n}»).
- Output containers materialized — visually присвоены ID, ниже original output (vertical stack).

**Ветвление финалов в sequence-mode (BranchingVisual rewrite):**
- Determine variant kind:
  - If finals share parent op AND parent op.materializedClones — это clones → label «{n} клонов».
  - If finals derived from different ops AND those ops share variantGroupId pieces inputs — это design variants → label «{n} вариантов».
  - Otherwise — independent finals (например, biolog has 2 different reactions in zone) → «{n} независимых финалов».
- Rendering — Y-разветвитель (T7 basic) + label с kind.

---

## 3. Scope IN / OUT

### IN
- `piece.variantGroupId: string | null` shape extension.
- `op.materializedClones: Array<{cloneId, label, sangerVerified?: 'pending'|'verified'|'failed', notes?}> | null` shape extension.
- Actions: CREATE_DESIGN_VARIANT, MATERIALIZE_REACTION, REMOVE_FROM_VARIANT_GROUP.
- `lib/variant-resolver.js` — resolve variant kind + helpers.
- `canvas/VariantGroupBadge.jsx` — visual.
- `canvas/MaterializeCloneModal.jsx` — UI выбора колоний.
- Re-write `canvas/zone-sequence-mode/BranchingVisual.jsx` с поддержкой 3 kinds (clones / variants / independent).
- Selectors: selectVariantGroup, selectMaterializedClones, selectVariantKindForFinals.
- Migration v7→v8 (lossy default — все ops `materializedClones: null`, все pieces `variantGroupId: null`).
- Tests (~40).

### OUT
- Sanger lab notebook UI (T10).
- Sanger result drives clone verification status (T10).
- Smart auto-merge variant groups (post-MVP).
- Variant group bounds visualisation (T-future polish).
- Tracking какой variant был «выбран» биологом для downstream (post-MVP — может быть просто запись в zone.notes).

### NOT TOUCHED
- T8 auto-reaction finalizer — каждый piece variant имеет own derivedReactionId, finalizer работает per-piece.
- T7 ATTACH_PIECE_TO_ASSEMBLY — variant pieces могут быть attached independently.
- T6 zone-pieces-to-dag (RealiseModal) — variants не учитывает (один из вариантов отдельным realise call).

---

## 4. Архитектурные решения

### DEC-T9-01 — Variant kind discriminated by storage location, не type field
- Design variant — piece.variantGroupId (несколько pieces).
- Clone variant — op.materializedClones (несколько clones одного op output).

Это **не** один `variantKind` enum на одном объекте. Different shape, different storage, different semantics.

### DEC-T9-02 — variantGroupId — `vg-<uuid>` строка
Не auto-incrementing number. UUID stable между renames + между zones (variant group могут быть cross-zone).

### DEC-T9-03 — CREATE_DESIGN_VARIANT — нащеплён source piece
Source piece имеет variantGroupId=null → CREATE_DESIGN_VARIANT присваивает new group ID к обоим (source + new). Source piece имеет vg=X → new piece получает X. New piece — глубокая копия source с opt overrides (например ranges или primerPairId).

### DEC-T9-04 — Variant group across zones legal
Биолог может иметь piece-варианты в разных zones (например piece в zone «PCR experiments» как variant, выбранный — в zone «Final design»). Variant group binds их.

T9 — basic. Visual indication через VariantGroupBadge.

### DEC-T9-05 — MATERIALIZE_REACTION — N clones создаются как separate containers
Не один container с meta-данными. Каждая колония — independent container с own sequence (initially идентичной original output). Биолог может trace mutations в каждой через editing.

Container.materializedFromOp: opId (новое поле T9, или используем existing pointer via op.outputs[]). T9 prefers `op.materializedClones` as authoritative source.

### DEC-T9-06 — materializedClones cloneId points to container
`{cloneId: containerId, label, sangerVerified?}` — cloneId === container.id. Это для convenient lookup без duplication.

### DEC-T9-07 — Sanger verification — поле в materializedClones, но drives только T10
В T9 — поле `sangerVerified: 'pending'|'verified'|'failed'|null` хранится но НЕ управляется UI. T10 будет добавлять Sanger workflow + drives values.

В T9 default — `'pending'` для всех новых clones.

### DEC-T9-08 — Visual rendering design variants — basic в T9
- VariantGroupBadge на piece-card + reaction-node (small icon top-right).
- Hover badge → tooltip «Вариант 1 из 3».
- Click badge → selectVariantGroup + highlight all members на canvas.

T9 — нет explicit variant frame. Implicit grouping через badge.

### DEC-T9-09 — Visual rendering clone variants — vertical stack containers под op
1 ромб + 1 original product container + N-1 clone containers ниже (separated by 60px vertically). Каждый container имеет label «clone 1», «clone 2», ...

### DEC-T9-10 — Migration v7→v8 — pure, добавляет nullable fields
- piece.variantGroupId = null для existing pieces.
- op.materializedClones = null для existing ops.
- schemaVersion = 8.

Idempotent.

### DEC-T9-11 — BranchingVisual rewrite — 3 kinds
- Clones: «{N} клонов» label, vertical stack, single trunk.
- Design variants: «{N} вариантов», Y-разветвитель, parallel branches.
- Independent: «{N} независимых финалов», no trunk, side-by-side.

Determined через `selectVariantKindForFinals(state, zoneId)`.

### DEC-T9-12 — REMOVE_PIECE с variantGroupId — cleanup
Когда удаляется piece, который был последним в variant group (только 1 piece left с этим vg) — clear variantGroupId на оставшемся piece (group disbanded). Если ≥2 piece left — group существует.

### DEC-T9-13 — Tests baseline: 2945 (T8) → ~2985 (T9)
~40 новых tests.

---

## 5. Components / actions / API

### 5.1 Piece shape extension

```javascript
piece = {
  // ...existing T1-T8
  variantGroupId: string | null,  // NEW T9, default null
}
```

### 5.2 Operation shape extension

```javascript
op = {
  // ...existing T2-T8
  materializedClones: Array<{
    cloneId: string,    // === containerId
    label: string,
    sangerVerified: 'pending' | 'verified' | 'failed' | null,
    notes: string | null,
  }> | null,
}
```

### 5.3 Actions

**CREATE_DESIGN_VARIANT**

```
dispatch({
  type: 'CREATE_DESIGN_VARIANT',
  sourcePieceId,
  overrides: { ranges?, acquisitionParams?, name? },
});
```

Логика:
1. Find source piece. Validate.
2. Determine variantGroupId: source.variantGroupId || `vg-${uuidv7()}`.
3. Clone piece (deep copy) + apply overrides + new id + new color + new createdAt.
4. Set variantGroupId на обоих (source + new).
5. Append new piece к state.pieces.
6. (Finalizer T8 создаст auto-reaction для new piece если acquisitionMethod set.)

**MATERIALIZE_REACTION**

```
dispatch({
  type: 'MATERIALIZE_REACTION',
  operationId,
  clones: [
    { label: 'clone 1' },
    { label: 'clone 2' },
    // ...
  ],
});
```

Логика:
1. Find op. Validate status === 'executed'.
2. Existing op.outputs[0] — это original product container. Будет clone 1.
3. Create N-1 additional containers as clones (one per clones[i] beyond first).
4. Каждый clone — deep copy original output (same sequence + annotations).
5. Set op.materializedClones = [
     { cloneId: output[0].id, label: clones[0].label, sangerVerified: 'pending', notes: null },
     ...для всех new clone containers.
   ].
6. positions — auto-layout vertical stack под original output.

**REMOVE_FROM_VARIANT_GROUP**

```
dispatch({ type: 'REMOVE_FROM_VARIANT_GROUP', pieceId });
```

Логика:
1. Find piece. Если variantGroupId === null — no-op.
2. Save groupId. Clear piece.variantGroupId.
3. Check remaining members в группе. Если ≤ 1 — clear variantGroupId на them тоже (group disbanded).

### 5.4 variant-resolver.js

```javascript
/**
 * Все pieces в variant group.
 */
export function selectVariantGroup(state, variantGroupId) {
  return (state.pieces || []).filter((p) => p.variantGroupId === variantGroupId);
}

/**
 * Все materialized clones для op.
 */
export function selectMaterializedClones(state, opId) {
  const op = (state.operations || []).find((o) => o.id === opId);
  return op?.materializedClones || [];
}

/**
 * Determine variant kind для финалов в zone.
 * Returns 'clones' | 'design-variants' | 'independent'.
 */
export function selectVariantKindForFinals(state, zoneId) {
  const finals = selectFinalProductsInZone(state, zoneId);
  if (finals.length <= 1) return 'independent';  // not branching

  // Check if all finals point back к одному op с materializedClones.
  const parentOps = finals.map((c) => {
    return (state.operations || []).find((op) => 
      op.outputs?.includes(c.id) || 
      op.materializedClones?.some((cl) => cl.cloneId === c.id)
    );
  }).filter(Boolean);

  if (parentOps.length === finals.length && parentOps.every((op) => op === parentOps[0])) {
    // Все finals share один parent op.
    if (parentOps[0].materializedClones?.length === finals.length) {
      return 'clones';
    }
  }

  // Check design variants — finals derived from ops whose inputPieces share variantGroupId.
  const inputPiecesByOp = parentOps.map((op) =>
    (op.inputPieces || []).map((pid) => (state.pieces || []).find((p) => p.id === pid)).filter(Boolean)
  );
  const variantGroupIds = inputPiecesByOp.flat().map((p) => p.variantGroupId).filter(Boolean);
  if (variantGroupIds.length >= 2 && new Set(variantGroupIds).size === 1) {
    return 'design-variants';
  }

  return 'independent';
}

/**
 * Visual label для variant group: «Вариант N из M».
 */
export function variantGroupLabel(state, variantGroupId, currentPieceId) {
  const group = selectVariantGroup(state, variantGroupId);
  const sortedByCreated = group.slice().sort((a, b) => a.createdAt - b.createdAt);
  const idx = sortedByCreated.findIndex((p) => p.id === currentPieceId);
  return `Вариант ${idx + 1} из ${group.length}`;
}
```

### 5.5 VariantGroupBadge.jsx

```javascript
function VariantGroupBadge({ piece, state, dispatch }) {
  if (!piece.variantGroupId) return null;
  const label = variantGroupLabel(state, piece.variantGroupId, piece.id);
  return (
    <span
      className="variant-group-badge"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        // Highlight all members of group.
        dispatch({ type: 'HIGHLIGHT_VARIANT_GROUP', variantGroupId: piece.variantGroupId, durationMs: 2000 });
      }}
    >
      <svg className="variant-icon">{/* branching tree icon */}</svg>
    </span>
  );
}
```

### 5.6 MaterializeCloneModal.jsx

```javascript
function MaterializeCloneModal({ operation, originalContainer, onConfirm, onCancel }) {
  const [count, setCount] = useState(1);
  const [labels, setLabels] = useState([`clone 1`]);

  const handleCountChange = (n) => {
    const safeN = Math.max(1, Math.min(96, n));  // hard cap 96 (стандартная 96-well plate)
    setCount(safeN);
    const newLabels = Array.from({length: safeN}, (_, i) => labels[i] || `clone ${i + 1}`);
    setLabels(newLabels);
  };

  return (
    <Modal title={`Materialize: ${operation.kind} → ${originalContainer.name}`}>
      <Field label="Число колоний (макс 96)">
        <NumberInput value={count} onChange={handleCountChange} min={1} max={96} />
      </Field>
      <div className="clone-labels">
        {labels.map((label, idx) => (
          <Field key={idx} label={`Колония ${idx + 1}`}>
            <input
              value={label}
              onChange={(e) => {
                const newLabels = labels.slice();
                newLabels[idx] = e.target.value;
                setLabels(newLabels);
              }}
            />
          </Field>
        ))}
      </div>
      <ModalActions>
        <Button onClick={onCancel}>Отмена</Button>
        <Button primary onClick={() => onConfirm({clones: labels.map((label) => ({label}))})}>
          Создать {count} клонов
        </Button>
      </ModalActions>
    </Modal>
  );
}
```

Open: triggered через context-menu на executed op (T9 расширяет existing op-context-menu).

### 5.7 BranchingVisual rewrite

```javascript
function BranchingVisual({ finals, attachedPieces, state, zoneId }) {
  const kind = selectVariantKindForFinals(state, zoneId);

  if (kind === 'clones') {
    return (
      <div className="branching-clones">
        <div className="trunk" />
        <div className="trunk-label">{finals.length} клонов</div>
        <div className="stack">
          {finals.map((c, idx) => (
            <div key={c.id} className="clone-branch">
              <span className="clone-label">{c.name || `clone ${idx + 1}`}</span>
              {/* T10 будет показывать sangerVerified status */}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'design-variants') {
    return (
      <div className="branching-design-variants">
        <div className="trunk" />
        <div className="trunk-label">{finals.length} вариантов</div>
        <div className="branches">
          {finals.map((c, idx) => (
            <div key={c.id} className="variant-branch">
              <div className="branch-line" />
              <span className="variant-label">{c.name || `Вариант ${idx + 1}`}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // independent
  return (
    <div className="branching-independent">
      <div className="trunk-label">{finals.length} финалов</div>
      <div className="side-by-side">
        {finals.map((c, idx) => (
          <div key={c.id} className="independent-branch">
            <span className="final-label">{c.name || `Финал ${idx + 1}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5.8 HIGHLIGHT_VARIANT_GROUP action

```javascript
// В skeleton-state-pieces.js
case 'HIGHLIGHT_VARIANT_GROUP': {
  const { variantGroupId, durationMs } = action;
  const now = Date.now();
  const until = now + durationMs;
  return {
    ...state,
    ui: {
      ...state.ui,
      highlightedVariantGroup: { variantGroupId, until },
    },
  };
}
```

Pieces в highlighted group получают CSS class `highlighted-variant` (via selector в render). Cleanup через setTimeout dispatch с durationMs=0.

### 5.9 Migration v7→v8

```javascript
function migrateV7toV8(snapshot) {
  if ((snapshot.schemaVersion ?? 7) >= 8) return snapshot;
  return {
    ...snapshot,
    pieces: (snapshot.pieces || []).map((p) => ({ ...p, variantGroupId: p.variantGroupId ?? null })),
    operations: (snapshot.operations || []).map((op) => ({
      ...op,
      materializedClones: op.materializedClones ?? null,
    })),
    schemaVersion: 8,
  };
}
```

Idempotent.

### 5.10 STRINGS extension

```javascript
pieces: {
  // ...
  variantGroup: {
    badge: 'Вариант {n} из {total}',
    createVariantAction: 'Создать вариант',
    removeFromGroupAction: 'Убрать из группы вариантов',
  },
},
operations: {
  // ...
  materialize: {
    action: 'Materialize (отметить колонии)',
    modalTitle: 'Materialize: {kind} → {output}',
    cloneCountLabel: 'Число колоний (макс 96)',
    cloneLabelTemplate: 'Колония {n}',
    confirmCount: 'Создать {count} клонов',
  },
},
zones: {
  // ...
  branching: {
    clones: '{count} клонов',
    variants: '{count} вариантов',
    independent: '{count} финалов',
  },
},
```

---

## 6. Порядок выполнения

**K1.** Migration v7→v8 в `lib/skeleton-persistence.js`. ~3 tests.

**K2.** Расширить piece-model.js + piece-invariants.js — `variantGroupId` field.

**K3.** Расширить operation shape в `skeleton-state-operations.js::createOperationDraft` — `materializedClones: null` default.

**K4.** `lib/variant-resolver.js` — pure helpers. ~10 unit tests.

**K5.** Actions:
- CREATE_DESIGN_VARIANT в `skeleton-state-pieces.js`.
- MATERIALIZE_REACTION в `skeleton-state-operations.js` (cascade в containers slice).
- REMOVE_FROM_VARIANT_GROUP в `skeleton-state-pieces.js` + cleanup при ≤ 1 member.
- HIGHLIGHT_VARIANT_GROUP в `skeleton-state-pieces.js` + ui.highlightedVariantGroup.
- ~10 reducer tests.

**K6.** REMOVE_PIECE cascade — clear variantGroupId если remaining ≤ 1.

**K7.** REMOVE_OPERATION cascade — clear op.materializedClones containers (cascade delete? OR keep as orphan?). T9 decision: keep as orphans (биолог может re-link через manual action). T-future cleanup.

**K8.** Selectors `selectVariantGroup`, `selectMaterializedClones`, `selectVariantKindForFinals`, `variantGroupLabel` (re-export from variant-resolver). ~5 tests.

**K9.** `canvas/VariantGroupBadge.jsx` — visual. ~2 component tests.

**K10.** `canvas/MaterializeCloneModal.jsx` — UI. ~3 component tests.

**K11.** Re-write `BranchingVisual.jsx` с 3 kinds (§5.7). ~5 tests:
- kind='clones' — vertical stack.
- kind='design-variants' — Y-разветвитель.
- kind='independent' — side-by-side.
- kind correctly detected для each scenario.
- single final — no BranchingVisual render.

**K12.** Mount VariantGroupBadge на piece-card в:
- `PieceCard.jsx` (T7 sequence-mode).
- Container blocks на canvas (graph-mode) — для piece-derived containers, если variantGroupId on input piece.

**K13.** Context-menu extension на op-узле — «Materialize колонии» пункт. Open MaterializeCloneModal.

**K14.** Context-menu extension на piece-card — «Создать вариант» пункт. Action CREATE_DESIGN_VARIANT с default overrides (биолог потом editing).

**K15.** STRINGS extension (§5.10).

**K16.** Tests integration:
- Create piece → CREATE_DESIGN_VARIANT → 2 pieces в группе, обе имеют variantGroupId.
- CREATE_DESIGN_VARIANT снова → 3 в группе.
- REMOVE one piece (group size 2) → still group.
- REMOVE one piece (group size 1) → variantGroupId cleared.
- MATERIALIZE_REACTION с 4 colonies → op.materializedClones.length=4 + 4 containers создано.
- BranchingVisual detects clones при 4 finals from one op.
- BranchingVisual detects design-variants при 2 finals from variant-group pieces.
- BranchingVisual detects independent для unrelated finals.
- ~10 integration tests.

**K17.** Manual smoke:
1. Создать piece (T5). Через context-menu «Создать вариант» → second piece в группе, отдельный auto-reaction (T8 finalizer).
2. Visual: badge на обеих piece-card.
3. ATTACH variant 1 в strip (T7) → BranchingVisual ne активен (только 1 final).
4. Execute op (PCR) → output container. Через op context-menu «Materialize колонии» → modal → 4 clones → 4 containers создаются (vertical stack).
5. В T7 sequence-mode для same zone — BranchingVisual показывает «4 клонов».

**K18.** Size budget check.

---

## 7. STOP-условие

Code останавливается после K18.

Отчёт:
```
## T9 Variants — отчёт
Commits: ...
Vitest: 2945 → 2985 pass / 1 skip / 0 fail (+40)
pytest: 112/112
vite build: clean

Size budget:
- lib/variant-resolver.js: X.X KB (new) ✓
- canvas/VariantGroupBadge.jsx: X.X KB (new) ✓
- canvas/MaterializeCloneModal.jsx: X.X KB (new) ✓
- canvas/zone-sequence-mode/BranchingVisual.jsx: ~9 KB (was 3) ✓
- store/skeleton-state-operations.js: X.X KB (+2) ✓
- store/skeleton-state-pieces.js: ~18 KB (+1.5) ✓
- lib/skeleton-persistence.js: X.X KB (+0.8 v7→v8) ✓

Migration verification:
- Pre-T9 snapshot — все pieces variantGroupId=null + ops materializedClones=null.
- Idempotent v8 повторно.

Manual smoke:
- CREATE_DESIGN_VARIANT работает
- MATERIALIZE_REACTION создаёт N clone containers
- BranchingVisual 3 kinds работают

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 8. Что делать при регрессии

1. **variantGroupId stale после disband group** — REMOVE_FROM_VARIANT_GROUP не cleanup осталог. Verify: после removal — если group size ≤ 1, clear ALL remaining members.

2. **MaterializeCloneModal создаёт duplicates** — повторный open модала на already-materialized op. Если op.materializedClones != null — disable действие (или offer «добавить ещё клонов» — T-future).

3. **BranchingVisual kind misdetect** — `selectVariantKindForFinals` логика может ошибаться при сложных scenarios. Edge cases: 3 clones + 1 independent final → kind='independent' (most permissive). Tests verify.

4. **MATERIALIZE_REACTION cascade containers ломает existing op.outputs** — output[0] — original. Clones — new containers. Verify op.outputs остаётся unchanged (только original).

---

## 9. Риски

### R-T9-1 — Confusion biolog между design vs clone variants
**Risk:** Биолог не понимает разницу, путает action.
**Mitigation:** Tooltips + STRINGS objяснительные. UX-приёмка обязательна с биологом. Если confusion persistent — добавить onboarding hint в T-future.

### R-T9-2 — MATERIALIZE_REACTION на op без status=executed
**Risk:** Биолог хочет «pre-plan» N колоний до execution.
**Mitigation:** Initially block (require executed). Если biolog complains — T-future change to allow planning. T9 — strict.

### R-T9-3 — Variant group fragments между zones — UX confusion
**Risk:** Piece variant 1 в zone A, variant 2 в zone B — биолог теряет track.
**Mitigation:** VariantGroupBadge highlights both при click. Cross-zone link badge (T8) tangentially помогает if cross-zone source.

### R-T9-4 — Performance: 96 clones × full container clone
**Risk:** 96 deep-copies containers — slow + heavy snapshot.
**Mitigation:** Container clone — shallow copy для sequence reference (containers immutable в practical sense; bio edits — это new piece, не container mutation). T9 — basic full clone. Optimization — T-future если real bottleneck.

### R-T9-5 — REMOVE_OPERATION leaves orphan clone containers
**Risk:** Удалили op — clones в containers становятся orphans (no parent).
**Mitigation:** Decision (DEC §K7) — keep orphans. Биолог может удалить manually. T9 acceptable, T-future cleanup options.

### R-T9-6 — Migration v7→v8 не handles edge cases
**Risk:** Snapshots с corrupted pieces / ops fields.
**Mitigation:** Migration defensive: `p.variantGroupId ?? null`, `op.materializedClones ?? null`. Не assume shape.

---

## 10. Открытые вопросы для Chat

1. Materialize action — изначально triggers через op context-menu, либо как часть OP_EXECUTE flow (биолог exec'нул, сразу спрашиваем "сколько колоний")? T9 default — отдельный context-menu action. Если UX hint biolog'у нужен — T-future.
2. Design variants — нужен ли способ «merge variants back» (отметить «эти 2 варианта были рассмотрены, оставляем variant 1, удаляем variant 2»)? Default — биолог manually delete piece. T-future — explicit «выбрать вариант» action.
3. Variant group label — «Вариант 1 из 3» (ordering по createdAt) или «Вариант A», «Вариант B» (ordering по добавлению с буквами)? Default — numeric с createdAt order. Изменить можно в STRINGS.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров.
- [x] Контекст + стратегия + reference на T2/T4/T8.
- [x] Scope IN/OUT.
- [x] DEC-T9-01..13.
- [x] Shape extensions + actions + UI components.
- [x] K1-K18.
- [x] STOP-условие.
- [x] 6 рисков.
- [x] Открытые вопросы.
- [x] Размер 45-55 KB target.
- [x] Reference на якорь + T2, T8.
- [x] Sanger NOT touched (T10 scope).

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-11, 16, 17, 18, 19.
**Следующий sprint:** T10 — Sanger MVP lab notebook (right panel per-zone).
