/**
 * skeleton-state-canvas — canvas-slice sub-reducer.
 *
 * Owns canvas-level state: containers, positions, junctions, cascade
 * counter, legacy commits[]. Actions mutate ONLY this slice (plus
 * cross-domain field `highlightedContainerId` + `toast` which live
 * on the main state but are touched here for ergonomics).
 *
 * Sprint M-CANVAS-OPS K2 split (12.05.2026) — DEC-OPS-01. Extracted
 * verbatim from monolithic `skeleton-state.js` 22.77 KB. Behavior is
 * byte-identical; the router in `skeleton-state.js` chains this with
 * operations + editor sub-reducers.
 *
 * Slice fields:
 *   containers, positions, junctions, cascadeIndex, commits
 *
 * Cross-domain writes (also touched by editor reducer for same action):
 *   COMMIT_OPERATION → also pushes draftSessions tabs in editor slice.
 *   COMMIT_PENDING_EDITS → reads `pendingEditsByContainer[id]` (owned
 *     by editor slice) and applies to container. Chain order must be
 *     canvas → editor so editor can clear pending AFTER canvas applies.
 *   REMOVE_CONTAINER → editor slice also drops pendingEdits +
 *     selection + sequence-view-mode + editor open state for this id.
 *
 * Helper exports: containerFromLibraryEntry (used by canvas-side
 * places that don't go through the reducer, e.g. operations adapter
 * outputs in K4-K10).
 */
import { v7 as uuidv7 } from 'uuid';
import {
  SKELETON_CONTAINERS,
  SKELETON_COMMITS,
  isPlaceholderContainer,
  GHOST_HOME_POSITION,
} from '../fixture-canvas-skeleton';
import {
  detectJunctionKind,
  defaultJunctionParams,
  inferEndRequirements,
} from '../canvas/junction-styles';
import { normalizeJunction } from './selectors-junction';
import { BLOCK_LINEAR_W } from '../canvas/canvas-layout';
import { handleCutAtCursor } from './skeleton-state-canvas-cut';

/**
 * makeGhostPlaceholder — фабрика «призрачного» placeholder контейнера.
 *
 * V61 (14.05.2026): на canvas всегда должен быть РОВНО ОДИН placeholder
 * как entry-point к picker'у. После заполнения авто-создается новый.
 *
 * Позиция — слот рядом с последним заполненным контейнером (right of
 * него +280 px), либо центр canvas если ничего нет.
 */
export function makeGhostPlaceholder(opts = {}) {
  return {
    // V63 fix: полный uuidv7. `.slice(0, 8)` давал коллизию когда
    // 2 ghost'а спавнились подряд (time-prefix uuidv7 одинаков
    // в пределах миллисекунды).
    id: opts.id || `c-ghost-${uuidv7()}`,
    kind: 'molecule',
    name: '',
    topology: { circular: false },
    length: 0,
    sequence: '',
    annotations: [],
    ends: null,
    origin: { kind: 'placeholder', createdAt: new Date().toISOString() },
    position: opts.position || { x: 300, y: 220 },
    parentCommitId: null,
    zoneId: null, // T3 — ghost is loose; T4 may seed default zone visually
    pinned: false, // T4.5 DEC-T4.5-04 — auto-layout override flag
  };
}

/**
 * ensureGhostPlaceholder — гарантирует что в containers ровно один
 * placeholder. Если 0 — добавляет; ≥1 — оставляет первый, остальные
 * placeholder'ы удаляет (для idempotency). Returns {containers, positions}
 * пара для использования в reducer'е.
 *
 * @param {Array} containers — current state.containers
 * @param {Object} positions — current state.positions
 * @param {Object} [opts] — {position} для нового ghost'а если он создаётся.
 */
export function ensureGhostPlaceholder(containers, positions, opts = {}) {
  const placeholders = containers.filter(isPlaceholderContainer);
  if (placeholders.length >= 1) {
    return { containers, positions, changed: false };
  }
  // V62: ghost-home position — фиксированный верхний-левый угол.
  // Filled containers уезжают на cascade slot при FILL_PLACEHOLDER,
  // чтобы не overlap'ить с новым ghost'ом.
  const pos = opts.position || { ...GHOST_HOME_POSITION };
  const ghost = makeGhostPlaceholder({ position: pos });
  return {
    containers: [...containers, ghost],
    positions: { ...positions, [ghost.id]: pos },
    changed: true,
    ghost,
  };
}

/**
 * cascadeSlotPosition — следующая позиция filled-контейнера в auto-grid.
 *
 * V62: filled при FILL_PLACEHOLDER уезжает на cascade slot, чтобы ghost
 * мог respawn'иться в верхнем-левом без overlap'а. Grid 5 columns × N rows
 * с шагом 260×100 px, базируется от (340, 80) — справа от ghost-home.
 */
export function cascadeSlotPosition(cascadeIndex) {
  const cols = 5;
  const stepX = 260;
  const stepY = 100;
  const baseX = 340;
  const baseY = 80;
  const idx = Math.max(0, cascadeIndex);
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  return { x: baseX + col * stepX, y: baseY + row * stepY };
}

/**
 * containerFromLibraryEntry — build a skeleton container shape from a
 * production LibraryEntry (drag-from-Library-Tree path).
 *
 * NOTES_CANVAS_V2_KICKOFF §2: «одинаковую плазмиду можно класть
 * несколько раз — разные ID». No dedup; каждый drag = new container.
 * Связь с исходником через `origin.sourceEntryId`.
 */
export function containerFromLibraryEntry(entry, opts = {}) {
  const payload = entry?.payload || {};
  const seq = payload.sequence || '';
  return {
    id: uuidv7(),
    kind: 'molecule',
    name: entry?.name || 'untitled',
    topology: { circular: payload.topology === 'circular' },
    length: payload.length || seq.length,
    sequence: seq,
    annotations: Array.isArray(payload.annotations) ? payload.annotations : [],
    ends: payload.ends || null,
    origin: {
      kind: 'tree_drag',
      sourceEntryId: entry?.id || null,
      importedAt: new Date().toISOString(),
      ...(opts.originExtras || {}),
    },
    parentCommitId: null,
    zoneId: null, // T3 DEC-CANVAS-4T-13 — loose until assigned to a zone
  };
}

export function buildInitialCanvasState() {
  const positions = {};
  for (const c of SKELETON_CONTAINERS) {
    if (c.position) positions[c.id] = { ...c.position };
  }
  return {
    containers: SKELETON_CONTAINERS.slice(),
    commits: SKELETON_COMMITS.slice(),
    positions,
    cascadeIndex: 0,
    junctions: [],
  };
}

export function canvasReducer(state, action) {
  switch (action.type) {
    case 'COMMIT_OPERATION': {
      // Canvas slice of COMMIT_OPERATION — containers + commits +
      // positions + cascadeIndex + toast. The matching editor slice
      // pushes new tab ids into the targeted draftSession.
      const { newContainers, newCommit } = action.payload;
      const cascade = state.cascadeIndex + 1;
      const positions = { ...state.positions };
      newContainers.forEach((c, idx) => {
        const baseX = 80;
        const baseY = 80;
        const offset = (cascade + idx) * 24;
        positions[c.id] = { x: baseX + offset, y: baseY + offset };
      });
      return {
        ...state,
        containers: [...state.containers, ...newContainers],
        commits: [...state.commits, newCommit],
        positions,
        cascadeIndex: cascade,
        toast: { kind: 'success', message: `Mock commit OK · ${newContainers.map((c) => c.name).join(', ')}` },
      };
    }

    case 'SET_POSITION': {
      const positions = { ...state.positions, [action.containerId]: action.position };
      return { ...state, positions };
    }

    case 'COMMIT_ANNOTATION_EDIT': {
      const { containerId, edit } = action;
      if (!containerId || !edit) return state;
      const idx = state.containers.findIndex((c) => c.id === containerId);
      if (idx < 0) return state;
      const target = state.containers[idx];
      const annotations = Array.isArray(target.annotations) ? target.annotations : [];
      let nextAnnotations = annotations;
      let toastMsg = null;

      if (edit.kind === 'create') {
        const payload = edit.payload || {};
        const id = payload.id || `ann-mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const next = { ...payload, id };
        if (!next.level) next.level = 'region';
        nextAnnotations = [...annotations, next];
        toastMsg = { kind: 'success', message: `Аннотация «${next.name || 'без имени'}» создана` };
      } else if (edit.kind === 'update') {
        if (!edit.id) return state;
        let found = false;
        nextAnnotations = annotations.map((a) => {
          if (a.id === edit.id) {
            found = true;
            return { ...a, ...(edit.patch || {}) };
          }
          return a;
        });
        if (!found) return state;
        toastMsg = { kind: 'success', message: 'Аннотация обновлена' };
      } else if (edit.kind === 'delete') {
        if (!edit.id) return state;
        const before = annotations.length;
        nextAnnotations = annotations.filter((a) => a.id !== edit.id);
        if (nextAnnotations.length === before) return state;
        toastMsg = { kind: 'success', message: 'Аннотация удалена' };
      } else {
        return state;
      }

      const nextContainer = { ...target, annotations: nextAnnotations };
      const nextContainers = state.containers.slice();
      nextContainers[idx] = nextContainer;
      return { ...state, containers: nextContainers, toast: toastMsg };
    }

    case 'COMMIT_PENDING_EDITS': {
      // Canvas slice — applies pending edits buffer (owned by editor
      // slice) onto the container. Editor reducer runs AFTER and clears
      // the pending entry. Chain order in skeletonReducer is canvas →
      // operations → editor so this read sees the unmodified pending.
      const { containerId } = action;
      if (!containerId) return state;
      const pending = state.pendingEditsByContainer?.[containerId];
      if (!pending) return state;
      const idx = state.containers.findIndex((c) => c.id === containerId);
      if (idx < 0) return state;
      const target = state.containers[idx];
      const next = { ...target };
      if (Array.isArray(pending.editedAnnotations)) next.annotations = pending.editedAnnotations;
      if (typeof pending.editedSequence === 'string') {
        next.sequence = pending.editedSequence;
        next.length = pending.editedSequence.length;
      }
      if (pending.editedTopology) {
        if (typeof pending.editedTopology === 'string') {
          next.topology = { ...(target.topology || {}), circular: pending.editedTopology === 'circular' };
        } else {
          next.topology = pending.editedTopology;
        }
      }
      if (typeof pending.editedName === 'string') next.name = pending.editedName;

      const containers = state.containers.slice();
      containers[idx] = next;
      return {
        ...state,
        containers,
        toast: { kind: 'success', message: `Изменения «${next.name}» применены` },
      };
    }

    case 'SET_CONTAINER_NAME': {
      const { containerId, name } = action;
      if (!containerId || typeof name !== 'string') return state;
      const trimmed = name.trim();
      if (!trimmed) return state;
      const idx = state.containers.findIndex((c) => c.id === containerId);
      if (idx < 0) return state;
      if (state.containers[idx].name === trimmed) return state;
      const containers = state.containers.slice();
      containers[idx] = { ...containers[idx], name: trimmed };
      return { ...state, containers };
    }

    case 'OP_REMOVE': {
      // K9 cross-domain — unfreeze inputs uniquely referenced by the
      // removed op. Chain order is canvas → operations, so the op is
      // still present in state.operations at this point. operations
      // reducer drops the op AFTER this clause.
      const op = (state.operations || []).find((o) => o.id === action.operationId);
      if (!op) return state;
      const inputs = op.inputs || [];
      if (inputs.length === 0) return state;
      const otherInputs = new Set();
      for (const o of state.operations) {
        if (o.id === op.id) continue;
        for (const i of (o.inputs || [])) otherInputs.add(i);
      }
      const toUnfreeze = inputs.filter((i) => !otherInputs.has(i));
      if (toUnfreeze.length === 0) return state;
      const unfreezeSet = new Set(toUnfreeze);
      let touched = false;
      const containers = state.containers.map((c) => {
        if (unfreezeSet.has(c.id) && c.frozen) {
          touched = true;
          return { ...c, frozen: false };
        }
        return c;
      });
      if (!touched) return state;
      return { ...state, containers };
    }

    case 'OP_FORK_CONTAINER': {
      // K9 — Save As fork. Clone frozen container with optional pending
      // edits applied; reset frozen=false on the clone. Used by editor
      // when biolog wants to mutate a frozen (operation-locked) container.
      const { containerId, newName, applyPendingEdits = true } = action;
      const idx = state.containers.findIndex((c) => c.id === containerId);
      if (idx < 0) return state;
      const original = state.containers[idx];
      const pending = applyPendingEdits ? (state.pendingEditsByContainer?.[containerId] || null) : null;
      const cloneId = uuidv7();
      const clone = {
        ...original,
        id: cloneId,
        name: newName || (pending?.editedName) || `${original.name} (fork)`,
        frozen: false,
        parentCommitId: null,
        origin: {
          kind: 'fork',
          sourceContainerId: containerId,
          forkedAt: new Date().toISOString(),
        },
      };
      // Apply selected pending-edit fields directly into clone.
      if (pending) {
        if (typeof pending.editedSequence === 'string') {
          clone.sequence = pending.editedSequence;
          clone.length = pending.editedSequence.length;
        }
        if (Array.isArray(pending.editedAnnotations)) {
          clone.annotations = pending.editedAnnotations.slice();
        }
      }
      const origPos = state.positions[containerId] || { x: 80, y: 80 };
      return {
        ...state,
        containers: [...state.containers, clone],
        positions: { ...state.positions, [cloneId]: { x: origPos.x + 280, y: origPos.y } },
        toast: { kind: 'success', message: `Форк: ${clone.name}` },
      };
    }

    case 'REMOVE_CONTAINER': {
      // Canvas slice — drops container, position, related junctions;
      // clears highlightedContainerId if it matched. Editor reducer
      // handles editorOpen / editorContext / pendingEditsByContainer /
      // selectionByTab / sequenceViewModeByTab cleanup.
      const { containerId } = action;
      if (!containerId) return state;
      const idx = state.containers.findIndex((c) => c.id === containerId);
      if (idx < 0) return state;
      const containers = state.containers.slice();
      const removed = containers[idx];
      containers.splice(idx, 1);

      const positions = { ...state.positions };
      delete positions[containerId];

      const junctions = state.junctions.filter(
        (j) => j.fromContainerId !== containerId && j.toContainerId !== containerId,
      );

      const highlightedContainerId = state.highlightedContainerId === containerId
        ? null
        : state.highlightedContainerId;

      // V61 — гарантируем 1 ghost после удаления.
      const after = ensureGhostPlaceholder(containers, positions);
      return {
        ...state,
        containers: after.containers,
        positions: after.positions,
        junctions,
        highlightedContainerId,
        toast: { kind: 'info', message: `Удалён: ${removed.name}` },
      };
    }

    case 'RECONCILE_AUTO_JUNCTIONS': {
      // F2 DEC-CANVAS-JUNC-02/07: keep/drop by `status` (not by
      // kind==='auto'); recompute kind+params for status='auto'
      // junctions; manual junctions are never touched. Corner toast
      // when an auto kind flips.
      const { pairs } = action;
      const desired = new Set(
        (pairs || []).map((p) => `${p.fromContainerId}->${p.toContainerId}`),
      );
      const containerById = {};
      for (const c of state.containers) containerById[c.id] = c;
      const next = [];
      const existingKeys = new Set();
      let mutated = false;
      let kindChangedToast = null;
      for (const rawJ of state.junctions) {
        const j = normalizeJunction(rawJ);
        if (j !== rawJ) mutated = true; // lazy migration of legacy shape
        const k = `${j.fromContainerId}->${j.toContainerId}`;
        if (j.status === 'auto') {
          if (!desired.has(k)) { mutated = true; continue; } // dropped
          const newKind = detectJunctionKind(
            containerById[j.fromContainerId],
            containerById[j.toContainerId],
          );
          if (newKind !== j.kind) {
            const params = defaultJunctionParams(newKind);
            next.push({
              ...j,
              kind: newKind,
              autoDetectedKind: newKind,
              overlapTarget: params.overlapTarget,
              overlapLength: params.overlapLength,
              overlapTm: params.overlapTm,
              endRequirements: inferEndRequirements(
                newKind, params.overlapTarget, params.overlapLength,
              ),
            });
            mutated = true;
            kindChangedToast = `Авто-пересчёт стыка ${j.fromContainerId}→${j.toContainerId}: ${newKind}`;
          } else {
            next.push(j);
          }
          existingKeys.add(k);
        } else {
          next.push(j); // manual — preserved verbatim
          existingKeys.add(k);
        }
      }
      for (const p of (pairs || [])) {
        const k = `${p.fromContainerId}->${p.toContainerId}`;
        if (existingKeys.has(k)) continue;
        const kind = detectJunctionKind(
          containerById[p.fromContainerId],
          containerById[p.toContainerId],
        );
        const params = defaultJunctionParams(kind);
        next.push({
          id: `j-auto-${p.fromContainerId}-${p.toContainerId}`,
          fromContainerId: p.fromContainerId,
          toContainerId: p.toContainerId,
          kind,
          autoDetectedKind: kind,
          status: 'auto',
          overlapTarget: params.overlapTarget,
          overlapLength: params.overlapLength,
          overlapTm: params.overlapTm,
          endRequirements: inferEndRequirements(
            kind, params.overlapTarget, params.overlapLength,
          ),
        });
        mutated = true;
      }
      if (
        !mutated
        && next.length === state.junctions.length
        && next.every((j, i) => j === state.junctions[i])
      ) {
        return state;
      }
      const out = { ...state, junctions: next };
      if (kindChangedToast) out.toast = { kind: 'info', message: kindChangedToast };
      return out;
    }

    case 'REMOVE_JUNCTION': {
      const { junctionId } = action;
      if (!junctionId) return state;
      const next = state.junctions.filter((j) => j.id !== junctionId);
      if (next.length === state.junctions.length) return state;
      return { ...state, junctions: next };
    }

    case 'SET_JUNCTION_KIND': {
      // F2 DEC-CANVAS-JUNC-01/02: kind change resets params to the new
      // kind's defaults + flips status→manual. autoDetectedKind kept.
      // Same kind → no-op (ref equality preserved — regression guard).
      const { junctionId, kind } = action;
      if (!junctionId || !kind) return state;
      let changed = false;
      const next = state.junctions.map((j) => {
        if (j.id !== junctionId) return j;
        if (j.kind === kind) return j;
        changed = true;
        const params = defaultJunctionParams(kind);
        return {
          ...j,
          kind,
          status: 'manual',
          autoDetectedKind: j.autoDetectedKind ?? j.kind,
          overlapTarget: params.overlapTarget,
          overlapLength: params.overlapLength,
          overlapTm: params.overlapTm,
          endRequirements: inferEndRequirements(
            kind, params.overlapTarget, params.overlapLength,
          ),
        };
      });
      if (!changed) return state;
      return { ...state, junctions: next };
    }

    case 'SET_JUNCTION_PARAMS': {
      // F2 DEC-CANVAS-JUNC-01: merge patch; enforce overlapLength XOR
      // overlapTm; flip status auto→manual on any param edit.
      const { junctionId, patch } = action;
      if (!junctionId || !patch || typeof patch !== 'object') return state;
      let changed = false;
      const next = state.junctions.map((j) => {
        if (j.id !== junctionId) return j;
        changed = true;
        const merged = { ...j, ...patch };
        if ('overlapLength' in patch && patch.overlapLength != null) {
          merged.overlapTm = null;
        }
        if ('overlapTm' in patch && patch.overlapTm != null) {
          merged.overlapLength = null;
        }
        if (j.status === 'auto') merged.status = 'manual';
        return merged;
      });
      if (!changed) return state;
      return { ...state, junctions: next };
    }

    case 'RESET_JUNCTION_TO_AUTO': {
      // F2 DEC-CANVAS-JUNC-02: back to autoDetectedKind + defaults +
      // status=auto so the next reconcile may recompute it.
      const { junctionId } = action;
      if (!junctionId) return state;
      let changed = false;
      const next = state.junctions.map((j) => {
        if (j.id !== junctionId) return j;
        changed = true;
        const autoKind = j.autoDetectedKind || j.kind || 'auto';
        const params = defaultJunctionParams(autoKind);
        return {
          ...j,
          kind: autoKind,
          status: 'auto',
          overlapTarget: params.overlapTarget,
          overlapLength: params.overlapLength,
          overlapTm: params.overlapTm,
          endRequirements: inferEndRequirements(
            autoKind, params.overlapTarget, params.overlapLength,
          ),
        };
      });
      if (!changed) return state;
      return { ...state, junctions: next };
    }

    case 'FILL_PLACEHOLDER': {
      const { containerId, entry } = action;
      if (!containerId || !entry || !entry.id) return state;
      const idx = state.containers.findIndex((c) => c.id === containerId);
      if (idx < 0) return state;
      const target = state.containers[idx];
      const payload = entry.payload || {};
      const seq = payload.sequence || '';
      const filled = {
        ...target,
        kind: 'molecule',
        name: entry.name || target.name || 'imported',
        sequence: seq,
        length: payload.length || seq.length,
        topology: { circular: payload.topology === 'circular' },
        annotations: Array.isArray(payload.annotations) ? payload.annotations : [],
        ends: payload.ends || null,
        origin: {
          kind: 'tree_pick',
          sourceEntryId: entry.id,
          filledAt: new Date().toISOString(),
        },
      };
      const containers = state.containers.slice();
      containers[idx] = filled;
      // V62 — filled уезжает на cascade slot, чтобы ghost мог
      // respawn'иться в верхнем-левом углу без overlap'а.
      const cascade = state.cascadeIndex + 1;
      const cascadePos = cascadeSlotPosition(state.cascadeIndex);
      const positions = { ...state.positions, [containerId]: cascadePos };
      const after = ensureGhostPlaceholder(containers, positions);
      return {
        ...state,
        containers: after.containers,
        positions: after.positions,
        cascadeIndex: cascade,
        highlightedContainerId: containerId,
        toast: { kind: 'success', message: `Заполнен: ${filled.name}` },
      };
    }

    case 'CUT_CONTAINER_AT_CURSOR':
      // R12-4: extracted to skeleton-state-canvas-cut.js.
      return handleCutAtCursor(state, action);

    case 'ADD_CONTAINER_FROM_ENTRY': {
      const { entry, position } = action;
      if (!entry || !entry.id) return state;
      const newContainer = containerFromLibraryEntry(entry);
      const positions = { ...state.positions };
      const finalPos = position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { x: Math.max(0, position.x), y: Math.max(0, position.y) }
        : { x: 80, y: 80 };
      positions[newContainer.id] = finalPos;
      // V61 — гарантируем 1 ghost placeholder на canvas.
      const containers = [...state.containers, newContainer];
      const after = ensureGhostPlaceholder(containers, positions);
      return {
        ...state,
        containers: after.containers,
        positions: after.positions,
        highlightedContainerId: newContainer.id,
        toast: { kind: 'success', message: `Добавлено: ${newContainer.name}` },
      };
    }

    // R7-1 (14.05.2026): generic ADD_CONTAINER — для уже построенных
    // contain объектов (например, designed oligonucleotide primers).
    // В отличие от ADD_CONTAINER_FROM_ENTRY который строит из tree entry,
    // здесь action.container уже готов.
    case 'ADD_CONTAINER': {
      const { container, position } = action;
      if (!container || !container.id) return state;
      // Защита от duplicate id.
      if (state.containers.some((c) => c.id === container.id)) return state;
      const positions = { ...state.positions };
      const slotIndex = (state.cascadeIndex || 0);
      const slot = cascadeSlotPosition(slotIndex);
      const finalPos = position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { x: Math.max(0, position.x), y: Math.max(0, position.y) }
        : slot;
      positions[container.id] = finalPos;
      const containers = [...state.containers, container];
      const after = ensureGhostPlaceholder(containers, positions);
      return {
        ...state,
        containers: after.containers,
        positions: after.positions,
        cascadeIndex: slotIndex + 1,
        toast: { kind: 'success', message: `Добавлено: ${container.name || container.id.slice(0, 8)}` },
      };
    }

    default:
      return state;
  }
}
