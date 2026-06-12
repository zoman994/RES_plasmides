/**
 * skeleton-state — main reducer router for CanvasSkeleton.
 *
 * Sprint M-CANVAS-OPS K2 (12.05.2026) — DEC-OPS-01. Split monolithic
 * 22.77 KB single-switch into router + 3 sub-reducer files:
 *   - `skeleton-state-canvas.js`    (containers / positions / junctions /
 *                                   cascadeIndex / commits)
 *   - `skeleton-state-operations.js` (operations[] — K2 shell, K4 fills)
 *   - `skeleton-state-editor.js`    (editorOpen / editorContext /
 *                                   draftSessions / pendingEdits /
 *                                   selectionByTab / sequenceViewModeByTab)
 *
 * This file keeps:
 *   - Base state (view / highlightedContainerId / toast / primers)
 *   - Base actions: SET_VIEW, SET_HIGHLIGHT, CLEAR_TOAST, RESET
 *   - Router that chains the 3 sub-reducers in canvas → operations →
 *     editor order. Order matters for COMMIT_PENDING_EDITS where canvas
 *     reads the pending buffer (still owned by editor slice) BEFORE the
 *     editor reducer clears it.
 *   - Public re-exports for back-compat: `buildInitialState`,
 *     `skeletonReducer`, `containerFromLibraryEntry`, `clipAnnotations`.
 *
 * DEC-SKELETON-01 — никакого касания global Zustand. Все mutations
 * живут здесь и сбрасываются при unmount /canvas-skeleton.
 */
import { SKELETON_PRIMERS } from '../fixture-canvas-skeleton';
import {
  buildInitialCanvasState,
  canvasReducer,
  containerFromLibraryEntry,
} from './skeleton-state-canvas';
import {
  buildInitialOperationsState,
  operationsReducer,
} from './skeleton-state-operations';
import {
  buildInitialEditorState,
  editorReducer,
} from './skeleton-state-editor';
import {
  buildInitialAssemblyState,
  assemblyReducer,
} from './skeleton-state-assembly';
import {
  buildInitialPiecesState,
  piecesReducer,
} from './skeleton-state-pieces';
import {
  buildInitialZonesState,
  zonesReducer,
} from './skeleton-state-zones';
import { computeZoneBoundingBox } from '../lib/zone-model';
import { mergeBoundingBoxes } from '../lib/zone-bounds';
import { executeOperation } from '../canvas/operations/lib-adapters';
import { detectAnnotationConflicts, summarizeConflicts } from '../../../lib/bio/annotation-conflicts';
import { enrichAssemblyAnnotations } from '../canvas/operations/auto-annotate-assembly';
import { realiseAssembly, tagZoneSources, pruneZoneRealiseOutput } from '../lib/assembly-realise';
import { selectPieceSequence } from './selectors-pieces';
import { applyAutoReactions } from '../lib/auto-reaction-builder';
import { applyZoneLayouts } from '../lib/zone-layout';
import { applyJunctionConfig } from '../lib/junction-config-finalizer';

const REALISE_HARD_CAP = 5;

// Re-export for back-compat with callers that imported these from
// `./skeleton-state` directly (tests, future canvas-side helpers).
export { containerFromLibraryEntry };

export function buildInitialState(opts = {}) {
  // DEC-T3-08 REVERSED (Игорь 17.05.2026): new projects start with a
  // CLEAN canvas — no seeded «Сборка 1» zone. `opts.forceEmptyZones`
  // is still accepted (now a no-op) so existing callers don't break.
  const zones = [];
  return {
    // Base slice
    view: 'layout',
    highlightedContainerId: null,
    selectedContainerIds: [], // A6 — multi-select
    toast: null,
    // R12-2: toast queue. `toast` остаётся как «latest» для legacy;
    // `toasts` — accumulating queue, flushed by ToastBridge.
    toasts: [],
    primers: SKELETON_PRIMERS.slice(),
    // M-WORKSPACE — two-level assembly-tab workspace (replaces floating zone
    // frames). activeAssemblyId = focused top tab (a zone id); assemblyViewByZone
    // = per-assembly active view tab. Additive → old snapshots rehydrate fine.
    activeAssemblyId: null,
    assemblyViewByZone: {},
    // Composed sub-slices
    ...buildInitialCanvasState(),
    ...buildInitialOperationsState(),
    ...buildInitialEditorState(),
    ...buildInitialAssemblyState(),
    ...buildInitialPiecesState(),
    ...buildInitialZonesState(),
    zones, // override the slice default [] with the seeded default zone
  };
}

// R12-2: toast id stamping. ToastBridge использует id чтобы не
// дублировать flush'ы.
let toastCounter = 0;
function stampToast(toast) {
  if (!toast) return null;
  if (toast.id) return toast;
  toastCounter += 1;
  return {
    ...toast,
    id: `t-${Date.now()}-${toastCounter}`,
    kind: toast.kind || 'info',
    timestamp: Date.now(),
  };
}

// M-WORKSPACE — the per-assembly view tabs (second level).
const ASSEMBLY_VIEW_KINDS = new Set(['sequence', 'dag', 'primers', 'pipeline']);

export function skeletonReducer(state, action) {
  let next;
  // Base actions resolved first; они set `next` и break чтобы дойти
  // до финализатора (toast queue, ghost placeholder, multi-select cleanup).
  switch (action.type) {
    case 'SET_VIEW':
      next = { ...state, view: action.view };
      break;
    // M-WORKSPACE — two-level tabs. SET_ACTIVE_ASSEMBLY = focus a top (assembly)
    // tab; SET_ASSEMBLY_VIEW = pick the per-assembly view tab (validated set).
    case 'SET_ACTIVE_ASSEMBLY':
      next = state.activeAssemblyId === (action.zoneId || null)
        ? state : { ...state, activeAssemblyId: action.zoneId || null };
      break;
    case 'SET_ASSEMBLY_VIEW':
      if (!action.zoneId || !ASSEMBLY_VIEW_KINDS.has(action.view)) { next = state; break; }
      next = {
        ...state,
        assemblyViewByZone: { ...(state.assemblyViewByZone || {}), [action.zoneId]: action.view },
      };
      break;
    case 'SET_HIGHLIGHT':
      next = { ...state, highlightedContainerId: action.containerId };
      break;
    case 'TOGGLE_SELECTION': {
      const id = action.containerId;
      if (!id) { next = state; break; }
      const sel = state.selectedContainerIds || [];
      const newSel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      next = { ...state, selectedContainerIds: newSel };
      break;
    }
    case 'CLEAR_SELECTION':
      next = (!state.selectedContainerIds || state.selectedContainerIds.length === 0)
        ? state
        : { ...state, selectedContainerIds: [] };
      break;
    case 'SET_SELECTION_BULK':
      next = { ...state, selectedContainerIds: Array.isArray(action.ids) ? action.ids.slice() : [] };
      break;
    case 'CLEAR_TOAST': {
      // R12-2: clear by id (если задан) или drain queue целиком.
      if (action.toastId) {
        const filtered = (state.toasts || []).filter((t) => t.id !== action.toastId);
        const newest = filtered.length > 0 ? filtered[filtered.length - 1] : null;
        next = { ...state, toasts: filtered, toast: newest };
      } else {
        next = { ...state, toast: null, toasts: [] };
      }
      break;
    }
    case 'SHOW_TOAST':
      // R5-12: dispatch arbitrary toast (для UX feedback из UI).
      if (!action.toast || typeof action.toast.message !== 'string') {
        next = state;
      } else {
        next = { ...state, toast: action.toast };
      }
      break;
    case 'RESET':
      return buildInitialState();
    case 'REPLACE_STATE':
      // R12-3: merge с initial defaults чтобы заполнить transient UI поля
      // которые были stripped перед save. Загруженный state имеет
      // persistent data (containers, operations, junctions, positions,
      // pendingEdits...), но не имеет view / toasts / selectedContainerIds —
      // их берём из buildInitialState defaults.
      if (action.state && typeof action.state === 'object' && Array.isArray(action.state.containers)) {
        const defaults = buildInitialState();
        return {
          ...defaults,
          ...action.state,
          // Transient UI поля — НЕ from snapshot. Используем defaults.
          view: defaults.view,
          highlightedContainerId: defaults.highlightedContainerId,
          selectedContainerIds: defaults.selectedContainerIds,
          toast: defaults.toast,
          toasts: defaults.toasts,
          // F1 DEC-CANVAS-WIN-01: editorOpen + editorContext (tabs)
          // restore from snapshot when present; defaults fill in for
          // pre-F1 snapshots that never persisted them.
          editorOpen: typeof action.state.editorOpen === 'boolean'
            ? action.state.editorOpen
            : defaults.editorOpen,
          editorContext: (action.state.editorContext
            && Array.isArray(action.state.editorContext.tabs))
            ? action.state.editorContext
            : defaults.editorContext,
        };
      }
      return state;
    case 'OP_EXECUTE':
      next = handleOpExecute(state, action);
      break;

    case 'ASSEMBLY_REALISE':
      next = handleAssemblyRealise(state, action);
      break;

    default: {
      // Chain: canvas → operations → editor.
      // Order matters for COMMIT_PENDING_EDITS: canvas reads
      // state.pendingEditsByContainer[id] (owned by editor slice) to
      // apply onto the container; editor then clears that entry. If
      // editor ran first, canvas would see empty pending.
      next = canvasReducer(state, action);
      next = operationsReducer(next, action);
      next = editorReducer(next, action);
      next = assemblyReducer(next, action);
      next = piecesReducer(next, action);
      // zonesReducer LAST (T3 §5.9): reacts to cascading node-removal in
      // a later sprint; also rewrites node.zoneId cross-slice on
      // REMOVE_ZONE / MOVE_NODE_TO_ZONE / WRAP / MERGE.
      next = zonesReducer(next, action);
      break;
    }
  }
  // V61 REVERSED (Игорь 17.05.2026): no auto ghost placeholder — a
  // clean canvas. New fragments come via the bottom-right buttons /
  // library drag-drop, not a seeded ghost block.
  // R3-13 (14.05.2026): cleanup orphan refs из selectedContainerIds
  // когда соответствующие контейнеры удалены. R12-2 (15.05.2026):
  // condition тighter — раньше cleanup бежал на каждом action и
  // тестам пришлось убирать early-returns; теперь cleanup только если
  // containers count DECREASED (т.е. что-то реально удалилось).
  if (
    next
    && Array.isArray(next.selectedContainerIds)
    && next.selectedContainerIds.length > 0
    && Array.isArray(next.containers)
    && Array.isArray(state.containers)
    && next.containers.length < state.containers.length
  ) {
    const validIds = new Set(next.containers.map((c) => c.id));
    const filtered = next.selectedContainerIds.filter((id) => validIds.has(id));
    if (filtered.length !== next.selectedContainerIds.length) {
      next = { ...next, selectedContainerIds: filtered };
    }
  }
  // R12-2 (15.05.2026): toast queue maintenance. Любой sub-reducer
  // мог записать `next.toast = {...}` (legacy single-slot pattern).
  // Если toast новый (≠ prev.toast и не из toasts queue) — stamp + push.
  if (next && next.toast && next.toast !== state.toast) {
    const stamped = stampToast(next.toast);
    const queue = next.toasts || [];
    // Не push если уже в queue (например после CLEAR_TOAST с toastId
    // оставшийся newest restored как state.toast).
    if (!queue.some((t) => t.id === stamped.id)) {
      next = { ...next, toast: stamped, toasts: [...queue, stamped] };
    } else if (stamped !== next.toast) {
      next = { ...next, toast: stamped };
    }
  }
  // T8 DEC-T8-01 — auto-create / auto-remove derived reactions for
  // pieces whose acquisitionMethod warrants one. Runs BEFORE the zone
  // auto-resize so new reaction-op positions are included in bounds.
  // Idempotent (returns same ref when in sync → no loop, R-T8-2).
  if (next && Array.isArray(next.pieces)) {
    next = applyAutoReactions(next);
  }
  // JUNCTION layer 3 (J1/J2/J3/J11) — seed/prune zone.junctions for the
  // current boundaries (default overlap; closure only when circular) and
  // derive each zone's primers via the implicit zone-group (config-driven,
  // engine A3) so primers with tails appear on ADD without a manual Sew.
  // Manual primers (autoMode:'manual') are preserved. Runs only when pieces
  // or zones changed (add / reorder / split / remove / topology / config).
  if (next && Array.isArray(next.zones) && next.zones.length > 0) {
    next = applyJunctionConfig(next, state);
  }
  // T4 DEC-T4-12 — auto-recompute zone bounds for autoResize zones.
  // GROW-ONLY union (correctness fix vs spec §5.7 shrink-to-fit): per
  // DEC-T3-06 auto-resize only grows (manual drag shrinks), AND this is
  // what stops the finalizer fighting DRAG_ZONE — a translated zone's
  // members stay inside, so union === current bounds → no change.
  // Idempotent: union(B, box⊆B) === B → same zone ref → no loop (R-T4-2).
  if (next && Array.isArray(next.zones) && next.zones.length > 0) {
    const touched = next.positions !== state.positions
      || next.containers !== state.containers
      || next.pieces !== state.pieces
      || next.operations !== state.operations
      || next.zones !== state.zones;
    if (touched) {
      const recomputed = next.zones.map((zone) => {
        if (zone.autoResize === false) return zone;
        // T4.5 fix (Игорь 17.05.2026): auto + graph zones are sized
        // deterministically by applyZoneLayout (constant size, x/y
        // user-controlled). The grow-only union here would chase the
        // fixed-offset lanes and elongate the frame without bound when
        // the zone is dragged by the top — so skip them. Manual /
        // sequence-mode zones keep the original grow-only behaviour.
        const autoOwned = zone.laneLayout !== 'manual' && zone.viewMode !== 'sequence';
        if (autoOwned) return zone;
        const tight = computeZoneBoundingBox(next, zone.id, 40);
        if (!tight) return zone;
        const u = mergeBoundingBoxes([zone.bounds, tight]); // grow-only
        const b = zone.bounds;
        if (u.x === b.x && u.y === b.y && u.width === b.width && u.height === b.height) {
          return zone;
        }
        return { ...zone, bounds: u, updatedAt: Date.now() };
      });
      if (recomputed.some((z, i) => z !== next.zones[i])) {
        next = { ...next, zones: recomputed };
      }
    }
  }
  // T4.5 DEC-T4.5-06 — 3-lane auto-layout, LAST finalizer (after the
  // T8 auto-reactions + T4 bounds recompute, so it sees freshly-created
  // reaction nodes and current bounds). Lays only unpinned nodes of
  // auto / graph-mode zones. Idempotent: returns the same ref when the
  // canvas is already arranged → no finalizer loop (R2, top-anchored
  // lanes make computeZoneLayout a fixed point).
  if (next && Array.isArray(next.zones) && next.zones.length > 0) {
    next = applyZoneLayouts(next);
  }
  return next;
}

/**
 * handleOpExecute — atomic cross-domain transition (DEC-OPS-07).
 *
 * Lookup operation, assert committed, dispatch to adapter, then:
 *   - success → status='executed', append outputs to canvas containers,
 *     freeze inputs, layout outputs right-of-operation, toast.
 *   - error → status='failed', error message stored, toast.
 *
 * Невозможные переходы (executed/failed → executed) — block (return
 * state unchanged) per DEC-OPS-04. Retry path = OP_RESET first
 * (failed → committed), then OP_EXECUTE.
 */
function handleOpExecute(state, action) {
  const op = (state.operations || []).find((o) => o.id === action.operationId);
  if (!op) return state;
  if (op.status !== 'committed') return state;

  const containersById = Object.fromEntries(
    state.containers.map((c) => [c.id, c]),
  );
  const result = executeOperation(op, { containers: containersById, pieces: state.pieces });
  const now = new Date().toISOString();

  if (result.error) {
    const operations = state.operations.map((o) => (
      o.id === op.id
        ? { ...o, status: 'failed', error: result.error, executedAt: now }
        : o
    ));
    return {
      ...state,
      operations,
      toast: { kind: 'warning', message: `Операция ${op.kind}: ${result.error}` },
    };
  }

  let outputs = Array.isArray(result.outputs) ? result.outputs : [];
  // R9-4 (14.05.2026): для assembly ops (Gibson / Ligate / GG / KLD) +
  // Cut — обогащаем annotations RE-сайтами + start/stop codons. PCR
  // outputs не enrich'аются (amplicon = sub-region родителя, sites
  // уже в parent annotation).
  const enrichKinds = new Set(['gibson', 'ligate', 'golden_gate', 'kld', 'cut']);
  if (enrichKinds.has(op.kind)) {
    outputs = outputs.map((c) => {
      if (c.kind !== 'molecule') return c;
      try {
        const enriched = enrichAssemblyAnnotations(c);
        return { ...c, annotations: enriched };
      } catch (_) {
        return c;
      }
    });
  }
  const outputIds = outputs.map((c) => c.id);

  // Position outputs right-of-operation, fan vertically.
  const positions = { ...state.positions };
  for (let i = 0; i < outputs.length; i += 1) {
    positions[outputs[i].id] = {
      x: (op.position?.x || 0) + 220,
      y: (op.position?.y || 0) + (i - (outputs.length - 1) / 2) * 84,
    };
  }

  // Freeze inputs (containers referenced by op.inputs).
  const inputSet = new Set(op.inputs || []);
  const combined = [...state.containers, ...outputs];
  const containers = combined.map((c) => (
    inputSet.has(c.id) ? { ...c, frozen: true } : c
  ));

  // T2 DEC-T2-13 / R-T2-6 — freeze the op's input pieces and snapshot
  // their sequence (computed against the still-unfrozen state, so
  // selectPieceSequence live-computes here; later reads return the
  // cached frozenSequence). OP_RESET thaws them (piecesReducer).
  const inputPieceSet = new Set(op.inputPieces || []);
  let pieces = state.pieces || [];
  if (inputPieceSet.size > 0) {
    pieces = pieces.map((p) => {
      if (!inputPieceSet.has(p.id)) return p;
      const snap = p.frozenSequence != null
        ? p.frozenSequence
        : selectPieceSequence({ containers: state.containers, pieces: state.pieces }, p.id);
      return snap == null
        ? { ...p, frozen: true }
        : { ...p, frozen: true, frozenSequence: snap };
    });
  }

  const operations = state.operations.map((o) => (
    o.id === op.id
      ? {
          ...o,
          status: 'executed',
          outputs: outputIds,
          executedAt: now,
          error: null,
        }
      : o
  ));

  // R4-BIO-1 (14.05.2026): bio-fidelity warnings. Adapter populates
  // origin.missingOverlap (Gibson), origin.overlaps (Ligate). Surface
  // them as warning toast чтобы биолог знал что overlap не найден и
  // реальная сборка может не сработать.
  let toast = {
    kind: 'success',
    message: `${op.kind}: ${outputs.length} output${outputs.length === 1 ? '' : 's'}`,
  };
  const firstOutput = outputs[0];
  if (firstOutput?.origin) {
    const ori = firstOutput.origin;
    if (op.kind === 'gibson' && ori.missingOverlap > 0) {
      toast = {
        kind: 'warning',
        message: `Gibson: ${ori.missingOverlap} junction'ов без homology overlap (≥15bp). Реальная сборка не пройдёт без homology arms.`,
      };
    } else if (op.kind === 'ligate' && ori.ends === 'sticky' && Array.isArray(ori.overlaps)) {
      const zeroOverhang = ori.overlaps.filter((k) => k === 0).length;
      if (zeroOverhang > 0) {
        toast = {
          kind: 'warning',
          message: `Ligate sticky: ${zeroOverhang} junction'ов без совпадающего overhang'а. Концы не лигируются.`,
        };
      }
    }
  }

  // R9-1 (14.05.2026): scan outputs for annotation conflicts; promote
  // existing warning's severity если найдены serious issues (CDS frame
  // shift / no stop / overlapping CDS). Биолог СРАЗУ видит что merge
  // повредил frame, без необходимости открывать editor.
  for (const out of outputs) {
    if (!out || !Array.isArray(out.annotations) || out.annotations.length === 0) continue;
    const conflicts = detectAnnotationConflicts(out);
    if (!conflicts || conflicts.length === 0) continue;
    const serious = conflicts.filter((c) => c.severity === 'high' || c.severity === 'medium');
    if (serious.length === 0) continue;
    const summary = summarizeConflicts(serious);
    // Не перезатираем уже существующий warning (Gibson missingOverlap etc).
    if (toast.kind !== 'warning') {
      toast = {
        kind: 'warning',
        message: `${op.kind}: annotation conflicts в "${out.name || 'output'}" — ${summary}.`,
      };
    } else {
      // Append conflict summary к existing warning message.
      toast = {
        ...toast,
        message: `${toast.message} Also: ${summary} в "${out.name || 'output'}".`,
      };
    }
    break; // одного warning достаточно — не спамим за multiple outputs.
  }

  // F4 DEC-CANVAS-PROD-05 — atomic virtual→real tab substitution.
  // Any tab showing this op's virtual preview ('v-'+opId) is swapped
  // to the freshly-created real container so the biolog keeps context.
  let editorContext = state.editorContext;
  const virtualTabId = `v-${op.id}`;
  if (
    editorContext
    && Array.isArray(editorContext.tabs)
    && editorContext.tabs.some((t) => t.containerId === virtualTabId)
    && outputIds.length > 0
  ) {
    editorContext = {
      ...editorContext,
      tabs: editorContext.tabs.map((t) => (
        t.containerId === virtualTabId
          ? { ...t, containerId: outputIds[0] }
          : t
      )),
    };
    toast = {
      kind: 'info',
      message: `Продукт создан → вкладка переключена на «${outputs[0]?.name || 'результат'}»`,
    };
  }

  return {
    ...state,
    operations,
    containers,
    pieces,
    positions,
    editorContext,
    toast,
  };
}

/**
 * handleAssemblyRealise — A4 atomic multi-domain mutation
 * (DEC-CANVAS-ASM-REAL-09). Reverse-engineers the assembly draft into
 * ops + junctions + containers via the pure `realiseAssembly`, then
 * applies the diff in one shot. Multi-realise bumps the revision
 * (hard cap 5, DEC-REAL-08/R1); old entities are NOT auto-deleted.
 */
function handleAssemblyRealise(state, action) {
  const { draftId, perBoundaryMethods } = action;
  const draft = (state.assemblyDrafts || []).find((d) => d.id === draftId);
  // T6 K11 — dual-resolve. A zone target has no draft; realiseAssembly
  // (K5) reads its pieces. Zones carry no realiseRevision (the Realise
  // multi-revision cap is a draft concept) → revision is always 1
  // (documented deviation; pre-T8 single-shot realise).
  const isZone = !draft && (state.zones || []).some((z) => z.id === draftId);
  if (!draft && !isZone) return state;
  const nextRev = draft ? (draft.realiseRevision || 0) + 1 : 1;
  if (nextRev > REALISE_HARD_CAP) {
    return {
      ...state,
      toast: { kind: 'warning', message: `Лимит ${REALISE_HARD_CAP} ревизий Realise — удалите старые ops сначала` },
    };
  }
  const r = realiseAssembly(state, draftId, perBoundaryMethods || {}, { revision: nextRev });
  if (!r.ok) {
    return { ...state, toast: { kind: 'error', message: `Realise: ${r.error}` } };
  }
  const { diff } = r;
  // ZONE target: tag every new container/op with the zoneId so the 3-lane
  // finalizer has members to sort; sources are pulled in by tagZoneSources.
  const zoneTag = isZone ? draftId : null;
  const diffContainers = zoneTag
    ? diff.containers.map((c) => ({ ...c, zoneId: zoneTag }))
    : diff.containers;
  const diffOperations = zoneTag
    ? diff.operations.map((o) => ({ ...o, zoneId: zoneTag }))
    : diff.operations;
  // Idempotent re-realise (Игорь 11.06): drop this zone's PRIOR realise output
  // before appending, so re-clicking «Реализовать» regenerates, not duplicates.
  const prev = isZone ? pruneZoneRealiseOutput(state, draftId) : state;
  // Fix B (10.06) — pull PCR sources into the zone (source→PCR→frag).
  const baseContainers = tagZoneSources(prev.containers, diffOperations, zoneTag);
  const positions = {
    ...prev.positions,
    ...diff.positionsLayout.operations,
    ...diff.positionsLayout.containers,
  };
  const assemblyDrafts = draft
    ? (state.assemblyDrafts || []).map((d) => (
      d.id === draftId
        ? { ...d, realiseRevision: nextRev, lastRealisedAt: Date.now() }
        : d
    ))
    : state.assemblyDrafts;
  const opN = diff.operations.length;
  const junN = diff.junctions.length;
  return {
    ...state,
    containers: [...baseContainers, ...diffContainers],
    operations: [...prev.operations, ...diffOperations],
    junctions: [...prev.junctions, ...diff.junctions],
    positions,
    assemblyDrafts,
    toast: {
      kind: diff.layoutShifted ? 'warning' : 'success',
      message: diff.layoutShifted
        ? `Реализовано: ${opN} операций, ${junN} стыков (сдвинуто ниже)`
        : `Реализовано: ${opN} операций, ${junN} стыков`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Standalone helpers — kept exported from this file for back-compat.
// ─────────────────────────────────────────────────────────────────────

// Helper: build a `sliceAnnotations(annotations, start, end)` clip
// for new linear products derived from a parent selection.
export function clipAnnotations(annotations, start, end) {
  if (!Array.isArray(annotations)) return [];
  const out = [];
  for (const a of annotations) {
    if (typeof a?.start !== 'number' || typeof a?.end !== 'number') continue;
    const lo = Math.max(a.start, start);
    const hi = Math.min(a.end, end);
    if (hi <= lo) continue;
    out.push({ ...a, start: lo - start, end: hi - start });
  }
  return out;
}
