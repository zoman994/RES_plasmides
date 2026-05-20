/**
 * skeleton-state-operations — operations-slice sub-reducer.
 *
 * Sprint M-CANVAS-OPS K4 (12.05.2026 — DEC-OPS-03 / DEC-OPS-04). Filled
 * the K2 shell with Operation data shape + lifecycle reducer.
 *
 * Slice fields:
 *   operations: Operation[]
 *
 * Operation shape (DEC-OPS-03):
 *   {
 *     id: uuidv7,
 *     kind: 'pcr'|'cut'|'gibson'|'ligate'|'kld'|'mutagenesis'|null,
 *     status: 'draft'|'committed'|'executed'|'failed',
 *     position: {x, y},
 *     inputs: containerId[],
 *     outputs: containerId[],
 *     params: { ...kind-specific },
 *     junctionRefs: junctionId[],
 *     createdAt: ISO,
 *     executedAt: ISO|null,
 *     error: string|null,
 *   }
 *
 * Lifecycle (DEC-OPS-04):
 *   draft → committed  (OP_SET_KIND picks the kind)
 *   committed → executed | failed   (K9 — OP_EXECUTE)
 *   failed → committed              (OP_RESET retry)
 *
 * Cross-domain effects:
 *   REMOVE_CONTAINER — drops operations referencing the removed id as
 *     input OR output. (K9 will additionally unfreeze input containers
 *     when no other op references them; K4 only handles the ref-drop.)
 *
 * All reducer cases are identity-preserving — if the op id is unknown
 * or the action is a no-op for the current lifecycle stage, the same
 * state reference is returned (so the main router can `===`-compare).
 */
import { v7 as uuidv7 } from 'uuid';
import { deriveAutoPrimers } from '../lib/primer-derive';

/**
 * createOperationDraft — build a fresh draft operation.
 *
 * Used by OP_ADD and by external callers that need to seed operations
 * outside the reducer (e.g. import flows). `kind` may be pre-supplied
 * but status stays 'draft' until OP_SET_KIND triggers the transition.
 */
export function createOperationDraft({
  position = { x: 0, y: 0 },
  kind = null,
  inputs = [],
  // T2 DEC-T2-01 — primary 4-tier input refs (pieceId[]). Parallel to
  // `inputs` (containerId[], legacy). Default [] — back-compat.
  inputPieces = [],
  junctionRef = null,
  // V70: caller may pre-supply the id so it can open the op's editor
  // tab in the same tick (hover-icon → viewer flow). Default keeps the
  // generated uuid — fully backward-compatible with existing callers.
  id = null,
  // Audit-pass FIX-2 (14.05.2026): если kind задан и `commit=true` —
  // переход в committed сразу при создании. Это убирает race-condition
  // в CanvasArea/OpSuggestions где после opAdd нужно было ждать render
  // + opSetKind через useEffect. Теперь atomic.
  commit = false,
} = {}) {
  const shouldCommit = !!(commit && kind);
  return {
    id: id || uuidv7(),
    kind,
    status: shouldCommit ? 'committed' : 'draft',
    position: { x: position.x ?? 0, y: position.y ?? 0 },
    inputs: Array.isArray(inputs) ? inputs.slice() : [],
    inputPieces: Array.isArray(inputPieces) ? inputPieces.slice() : [],
    zoneId: null, // T3 DEC-CANVAS-4T-13 — loose until assigned to a zone
    outputs: [],
    params: {},
    junctionRefs: junctionRef ? [junctionRef] : [],
    // T9 DEC-T9-01 — clone variants: null until MATERIALIZE_REACTION.
    materializedClones: null,
    // T4.5 DEC-T4.5-04 — drag-override flag for 3-lane auto-layout.
    pinned: false,
    // M-CANVAS-WORKFLOW-UX (SPEC §6.2) — a plain op is not an op-group;
    // group ops are minted by the K7 grouping path with isOpGroup:true.
    isOpGroup: false,
    createdAt: new Date().toISOString(),
    executedAt: null,
    error: null,
  };
}

export function buildInitialOperationsState() {
  return {
    operations: [],
  };
}

export function operationsReducer(state, action) {
  switch (action.type) {
    case 'OP_ADD': {
      // FIX-2: payload может содержать `commit: true` для atomic create+commit.
      const op = createOperationDraft(action.payload || {});
      return { ...state, operations: [...state.operations, op] };
    }

    case 'OP_REMOVE': {
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const next = state.operations.slice();
      next.splice(idx, 1);
      // T8 DEC-T8-06/§5.4 — synchronous cascade: drop the dangling
      // derivedReactionId. (If the piece still warrants a reaction the
      // T8 finalizer re-creates it next dispatch — expected, R-T8-3.)
      const pcs = state.pieces || [];
      const cascaded = pcs.some((p) => p.derivedReactionId === action.operationId)
        ? pcs.map((p) => (
          p.derivedReactionId === action.operationId
            ? { ...p, derivedReactionId: null }
            : p
        ))
        : pcs;
      return { ...state, operations: next, pieces: cascaded };
    }

    // T9 K5 (§5.3, DEC-T9-05/06/07, R-T9-2) — clone variants. Requires
    // an executed op with an output container; clone 1 = the original
    // output, clones 2..N = deep-copied sibling containers stacked
    // below it. op.outputs is left untouched (DEC §K7).
    case 'MATERIALIZE_REACTION': {
      const op = state.operations.find((o) => o.id === action.operationId);
      if (!op || op.status !== 'executed') return state;
      const clones = Array.isArray(action.clones) ? action.clones : [];
      if (clones.length === 0) return state;
      const originalId = (op.outputs || [])[0];
      const original = (state.containers || []).find((c) => c.id === originalId);
      if (!original) return state;

      const basePos = (state.positions && state.positions[originalId]) || { x: 200, y: 200 };
      const newContainers = [];
      const newPositions = {};
      const materialized = clones.map((cl, i) => {
        if (i === 0) {
          return {
            cloneId: originalId, label: cl.label || 'clone 1',
            sangerVerified: 'pending', notes: null,
          };
        }
        const cid = `cnt-${uuidv7()}`;
        newContainers.push({
          ...JSON.parse(JSON.stringify(original)),
          id: cid,
          name: cl.label || `${original.name}/${i + 1}`,
          origin: { kind: 'materialized-clone', fromOp: op.id, index: i },
        });
        newPositions[cid] = { x: basePos.x, y: basePos.y + i * 60 };
        return {
          cloneId: cid, label: cl.label || `clone ${i + 1}`,
          sangerVerified: 'pending', notes: null,
        };
      });

      return {
        ...state,
        operations: state.operations.map((o) => (
          o.id === op.id ? { ...o, materializedClones: materialized } : o
        )),
        containers: [...(state.containers || []), ...newContainers],
        positions: { ...(state.positions || {}), ...newPositions },
      };
    }

    // ── T10 K3 (§5.1) — Sanger lab notebook clone mutations ─────────
    case 'SET_CLONE_SANGER_STATUS':
    case 'SET_CLONE_NOTES':
    case 'SET_CLONE_LABEL': {
      const op = state.operations.find((o) => o.id === action.operationId);
      if (!op || !Array.isArray(op.materializedClones)) return state;
      const ci = op.materializedClones.findIndex((c) => c.cloneId === action.cloneId);
      if (ci < 0) return state;
      const cur = op.materializedClones[ci];
      let patch;
      if (action.type === 'SET_CLONE_SANGER_STATUS') {
        patch = { sangerVerified: action.status ?? null };
      } else if (action.type === 'SET_CLONE_NOTES') {
        patch = { notes: String(action.notes ?? '').slice(0, 500) };
      } else {
        const label = String(action.label ?? '').trim();
        if (!label || label === cur.label) return state; // blank/no-op
        patch = { label };
      }
      const nextClones = op.materializedClones.slice();
      nextClones[ci] = { ...cur, ...patch };
      const operations = state.operations.map((o) => (
        o.id === op.id ? { ...o, materializedClones: nextClones } : o
      ));
      const next = { ...state, operations };
      if (action.type === 'SET_CLONE_SANGER_STATUS') {
        next.toast = {
          kind: 'info',
          message: `Колония «${cur.label}» → ${action.status || 'не запланирован'}`,
        };
      }
      return next;
    }

    case 'OP_SET_POSITION': {
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      const nx = action.position?.x ?? op.position.x;
      const ny = action.position?.y ?? op.position.y;
      if (op.position.x === nx && op.position.y === ny) return state;
      const next = state.operations.slice();
      next[idx] = { ...op, position: { x: nx, y: ny } };
      return { ...state, operations: next };
    }

    case 'OP_SET_KIND': {
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      // Lifecycle gate: only draft → committed. Re-picking kind on a
      // committed/executed/failed op is silently ignored (UI surface
      // should never offer it — guard is defensive).
      if (op.status !== 'draft') return state;
      if (!action.kind) return state;
      const next = state.operations.slice();
      next[idx] = { ...op, kind: action.kind, status: 'committed' };
      return { ...state, operations: next };
    }

    case 'OP_SET_PARAMS': {
      // R4-BIO-4 (14.05.2026): lifecycle gate. Executed/failed ops уже
      // консумировали params и создали outputs (или failed). Изменение
      // params без сброса/re-execute путает биолога (params изменены, но
      // outputs от старых params). Только draft/committed allow params edit.
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const patch = action.params;
      if (!patch || typeof patch !== 'object') return state;
      const op = state.operations[idx];
      if (op.status !== 'draft' && op.status !== 'committed') return state;
      const next = state.operations.slice();
      next[idx] = { ...op, params: { ...op.params, ...patch } };
      return { ...state, operations: next };
    }

    case 'OP_ADD_INPUT': {
      // A5 — drag-to-connect adds containerId в op.inputs[].
      // AUDIT-R2-C: гейт по lifecycle. Executed/failed ops замёрзшие
      // (outputs created based на inputs at execute time); добавление
      // input'а постфактум — confusing UX. Reset через OP_RESET сначала.
      const { operationId, containerId } = action;
      const idx = state.operations.findIndex((o) => o.id === operationId);
      if (idx < 0 || !containerId) return state;
      const op = state.operations[idx];
      if (op.status !== 'draft' && op.status !== 'committed') return state;
      if (op.inputs.includes(containerId)) return state;
      const next = state.operations.slice();
      next[idx] = { ...op, inputs: [...op.inputs, containerId] };
      return { ...state, operations: next };
    }

    case 'OP_REMOVE_INPUT': {
      const { operationId, containerId } = action;
      const idx = state.operations.findIndex((o) => o.id === operationId);
      if (idx < 0 || !containerId) return state;
      const op = state.operations[idx];
      // AUDIT-R2-C: тот же гейт для symmetry.
      if (op.status !== 'draft' && op.status !== 'committed') return state;
      if (!op.inputs.includes(containerId)) return state;
      const next = state.operations.slice();
      next[idx] = { ...op, inputs: op.inputs.filter((i) => i !== containerId) };
      return { ...state, operations: next };
    }

    case 'OP_SET_USER_PRIMERS': {
      // F3 DEC-CANVAS-PCR-07 — manual / reused primer override.
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      if (op.status !== 'draft' && op.status !== 'committed') return state;
      const next = state.operations.slice();
      next[idx] = { ...op, params: { ...op.params, userPrimers: action.primers } };
      return { ...state, operations: next };
    }

    case 'OP_CONFIRM_ORDER': {
      // F3 DEC-CANVAS-PCR-08 — explicit order confirmation gate result.
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      if (op.status !== 'draft' && op.status !== 'committed') return state;
      const next = state.operations.slice();
      next[idx] = {
        ...op,
        params: {
          ...op.params,
          orderConfirmedAt: action.orderedAt || new Date().toISOString(),
        },
      };
      return { ...state, operations: next };
    }

    case 'OP_RESET': {
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      // Lifecycle gate: failed → committed for retry. Other statuses
      // are silently ignored.
      if (op.status !== 'failed') return state;
      const next = state.operations.slice();
      next[idx] = { ...op, status: 'committed', error: null };
      return { ...state, operations: next };
    }

    case 'OP_SET_INPUT_PIECES': {
      // T2 DEC-T2-01 — set the primary 4-tier inputs. Validates every
      // pieceId exists + kind arity (§5.3). Identity-preserving on any
      // rejection so the router chain stays `===`-stable.
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      const pieceIds = Array.isArray(action.pieceIds) ? action.pieceIds : null;
      if (!pieceIds || pieceIds.length === 0) return state;
      const pieces = state.pieces || [];
      const allExist = pieceIds.every((pid) => pieces.some((p) => p.id === pid));
      if (!allExist) return state;
      const SINGLE = new Set(['pcr', 'ov-pcr', 'cut', 'mutagenesis']);
      const MULTI = new Set(['gibson', 'ligate', 'kld']);
      if (SINGLE.has(op.kind) && pieceIds.length !== 1) return state;
      if (MULTI.has(op.kind) && pieceIds.length < 2) return state;
      const next = state.operations.slice();
      next[idx] = { ...op, inputPieces: pieceIds.slice() };
      return { ...state, operations: next };
    }

    case 'OP_REMOVE_INPUT_PIECE': {
      // Cascade helper — called by piecesReducer on REMOVE_PIECE and by
      // T5/T8 UI. Op survives (DEC-T2-10) — only the ref is dropped.
      const idx = state.operations.findIndex((o) => o.id === action.operationId);
      if (idx < 0) return state;
      const op = state.operations[idx];
      const cur = Array.isArray(op.inputPieces) ? op.inputPieces : [];
      if (!cur.includes(action.pieceId)) return state;
      const next = state.operations.slice();
      next[idx] = { ...op, inputPieces: cur.filter((pid) => pid !== action.pieceId) };
      return { ...state, operations: next };
    }

    case 'REMOVE_CONTAINER': {
      // Cross-domain: drop operations referencing the removed id as
      // input OR output. Identity-preserving — if no op references it,
      // returns the same state reference so the router chain stays
      // `===`-stable.
      const removedId = action.containerId;
      if (!removedId) return state;
      const refsId = (op) =>
        op.inputs.includes(removedId) || op.outputs.includes(removedId);
      const hasRefs = state.operations.some(refsId);
      if (!hasRefs) return state;
      return {
        ...state,
        operations: state.operations.filter((op) => !refsId(op)),
      };
    }

    // M-CANVAS-WORKFLOW-UX K7 (SPEC §3 Шаг 2) — explicit grouping. The
    // biolog highlights ≥2 continuous pieces in a zone and «сшивает» them
    // into one op-group (one reaction). The intermediate output piece is
    // derived by the K15 finalizer.
    case 'CREATE_OP_GROUP': {
      const { zoneId, kind, name, pieceIds } = action;
      if (!zoneId || !Array.isArray(pieceIds) || pieceIds.length < 2) return state;
      const zones = state.zones || [];
      if (!zones.some((z) => z.id === zoneId)) return state;
      const pieces = state.pieces || [];
      const inZoneSorted = pieces
        .filter((p) => p.zoneId === zoneId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const order = inZoneSorted.map((p) => p.id);
      const selected = pieceIds.slice();
      const indices = selected.map((id) => order.indexOf(id));
      if (indices.some((i) => i < 0)) return state;
      indices.sort((a, b) => a - b);
      for (let k = 1; k < indices.length; k += 1) {
        if (indices[k] !== indices[k - 1] + 1) return state;
      }
      // All selected must currently be un-grouped.
      const selSet = new Set(selected);
      if (inZoneSorted.some((p) => selSet.has(p.id) && p.groupId)) return state;
      const op = createOperationDraft({ kind, position: { x: 0, y: 0 } });
      op.isOpGroup = true;
      op.zoneId = zoneId;
      op.inputPieces = selected.slice();
      op.groupLayer = 0;
      if (name) op.params = { ...(op.params || {}), groupName: name };
      const now = Date.now();
      const nextPieces = pieces.map((p) => (
        selSet.has(p.id) ? { ...p, groupId: op.id, updatedAt: now } : p
      ));
      const withOpGroup = {
        ...state,
        operations: [...(state.operations || []), op],
        pieces: nextPieces,
      };
      // K15 (T8.5) — derive auto primers for the new op-group from the
      // FRESH state (pieces now carry groupId), then append to the
      // zone's primer pool. Manual primers (if any) are untouched.
      const derived = deriveAutoPrimers(op, withOpGroup);
      if (derived.length === 0) return withOpGroup;
      const map = withOpGroup.assemblyDraftPrimers || {};
      const cur = map[zoneId] || [];
      return {
        ...withOpGroup,
        assemblyDraftPrimers: { ...map, [zoneId]: [...cur, ...derived] },
      };
    }

    case 'REMOVE_OP_GROUP': {
      const op = (state.operations || []).find((o) => o.id === action.opId && o.isOpGroup);
      if (!op) return state;
      const setIds = new Set(op.inputPieces || []);
      const now = Date.now();
      const nextPieces = (state.pieces || []).map((p) => (
        setIds.has(p.id) ? { ...p, groupId: null, updatedAt: now } : p
      ));
      // K15 (T8.5) — drop auto primers tied to this op-group; keep
      // any manual-locked ones (the biolog explicitly edited them).
      const map = state.assemblyDraftPrimers || {};
      const zoneId = op.zoneId;
      const arr = (map[zoneId] || []).filter((p) => !(
        p && p.origin && p.origin.kind === 'auto-from-group'
        && p.origin.opGroupId === action.opId
        && p.autoMode !== 'manual'
      ));
      return {
        ...state,
        operations: (state.operations || []).filter((o) => o.id !== action.opId),
        pieces: nextPieces,
        assemblyDraftPrimers: zoneId ? { ...map, [zoneId]: arr } : map,
      };
    }

    default:
      return state;
  }
}
