/**
 * op-piece-bridge — pure resolvers bridging legacy op.inputs
 * (containerId[]) and the T1 op.inputPieces (pieceId[]) hybrid
 * (DEC-T2-01 / 08 / 09). Adapters & UI read through these so the Tn
 * cleanup (drop op.inputs) touches only this file.
 *
 * Robustness: `state.containers` may be an ARRAY (canonical state) or a
 * MAP keyed by id (the existing executeOperation adapter ctx). Both are
 * accepted. All functions are pure — no mutation.
 */

function getContainer(containers, id) {
  if (!containers || id == null) return null;
  if (Array.isArray(containers)) return containers.find((c) => c && c.id === id) || null;
  return containers[id] || null;
}

function getPiece(state, id) {
  const pieces = state && Array.isArray(state.pieces) ? state.pieces : [];
  return pieces.find((p) => p && p.id === id) || null;
}

function hasInputPieces(op) {
  return Array.isArray(op && op.inputPieces) && op.inputPieces.length > 0;
}

/**
 * Template container for single-input ops (PCR / Cut / Mutagenesis / KLD).
 * inputPieces[0] → piece.sourceIds[0] → container; then params.templateId,
 * params.templateIds[0] (legacy pcr superset), op.inputs[0]. → Container|null.
 */
export function resolveOpTemplate(op, state) {
  if (!op) return null;
  if (hasInputPieces(op)) {
    const piece = getPiece(state, op.inputPieces[0]);
    if (piece && Array.isArray(piece.sourceIds) && piece.sourceIds.length > 0) {
      return getContainer(state && state.containers, piece.sourceIds[0]);
    }
  }
  const p = op.params || {};
  if (p.templateId) return getContainer(state && state.containers, p.templateId);
  if (Array.isArray(p.templateIds) && p.templateIds.length > 0) {
    return getContainer(state && state.containers, p.templateIds[0]);
  }
  if (Array.isArray(op.inputs) && op.inputs.length > 0) {
    return getContainer(state && state.containers, op.inputs[0]);
  }
  return null;
}

/**
 * Range for PCR / Cut. piece.ranges[0] → params.range (legacy forward)
 * → full-length of the resolved template. → {sourceId?,start,end,orientation}|null.
 */
export function resolveOpRange(op, state) {
  if (!op) return null;
  if (hasInputPieces(op)) {
    const piece = getPiece(state, op.inputPieces[0]);
    if (piece && Array.isArray(piece.ranges) && piece.ranges.length > 0) {
      return piece.ranges[0];
    }
  }
  if (op.params && op.params.range) {
    return { ...op.params.range, orientation: 'forward' };
  }
  const template = resolveOpTemplate(op, state);
  if (template) {
    return {
      sourceId: template.id,
      start: 0,
      end: String(template.sequence || '').length,
      orientation: 'forward',
    };
  }
  return null;
}

/**
 * Input containers for multi-input ops (Gibson / Ligate / KLD). When
 * inputPieces is set each piece resolves via sourceIds[0]; a deleted
 * piece drops out (R-T2-2 — NOT silently back-filled from op.inputs).
 * Empty inputPieces → legacy op.inputs path. → Container[].
 */
export function resolveOpInputContainers(op, state) {
  if (!op) return [];
  if (hasInputPieces(op)) {
    return op.inputPieces
      .map((pid) => {
        const piece = getPiece(state, pid);
        if (piece && Array.isArray(piece.sourceIds) && piece.sourceIds.length > 0) {
          return getContainer(state && state.containers, piece.sourceIds[0]);
        }
        return null;
      })
      .filter(Boolean);
  }
  if (Array.isArray(op.inputs) && op.inputs.length > 0) {
    return op.inputs.map((cid) => getContainer(state && state.containers, cid)).filter(Boolean);
  }
  return [];
}

/** Input pieces for op, or null when inputPieces is empty/absent. */
export function resolveOpInputPieces(op, state) {
  if (!hasInputPieces(op)) return null;
  return op.inputPieces.map((pid) => getPiece(state, pid)).filter(Boolean);
}

/** Can op be executed now? → { ok:true } | { ok:false, reason }. */
export function isOpReadyToExecute(op, state) {
  if (!op || op.status !== 'committed') return { ok: false, reason: 'not-committed' };
  if (!op.kind) return { ok: false, reason: 'no-kind' };
  const containers = resolveOpInputContainers(op, state);
  if (containers.length === 0) return { ok: false, reason: 'no-inputs' };
  if (op.kind === 'pcr' && containers.length !== 1) return { ok: false, reason: 'pcr-multi-input' };
  if (op.kind === 'gibson' && containers.length < 2) return { ok: false, reason: 'gibson-too-few' };
  return { ok: true };
}
