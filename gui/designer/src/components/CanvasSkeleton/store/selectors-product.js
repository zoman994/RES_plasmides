/**
 * selectors-product — derived virtual product containers (live preview).
 * F4 M-CANVAS-PRODUCT (DEC-CANVAS-PROD-01/02). Pure — never writes
 * state.containers. CanvasLayoutView / EditorTabStrip / MiniProjectCanvas
 * consume via useMemo over [operations, containers, junctions].
 */
import { selectJunctionValidation } from './selectors-junction';
import { assembleProduct } from '../lib/operation-product-assembly';

const VIRTUAL_PREFIX = 'v-';

export function isVirtualId(id) {
  return typeof id === 'string' && id.startsWith(VIRTUAL_PREFIX);
}
export function virtualIdForOp(opId) {
  return `${VIRTUAL_PREFIX}${opId}`;
}
export function opIdFromVirtual(vid) {
  return isVirtualId(vid) ? vid.slice(VIRTUAL_PREFIX.length) : null;
}

function derivedProductName(op, inputs) {
  const base = inputs[0]?.name || 'product';
  return `${op.kind || 'op'}_${base}`;
}

// DEC-PROD-02 four-state machine (executed excluded by caller).
function computeVirtualState(op, state, inputsById) {
  if (!op.kind || !Array.isArray(op.inputs) || op.inputs.length === 0) {
    return { state: 'incomplete', warnings: ['Настройте операцию (нет inputs / kind)'] };
  }
  // disconnected — any incident junction fails F2 validation.
  const warnings = [];
  for (const j of (state.junctions || [])) {
    if (op.inputs.includes(j.fromContainerId) || op.inputs.includes(j.toContainerId)) {
      const v = selectJunctionValidation(state, j.id);
      if (!v.ok) warnings.push(...v.warnings);
    }
  }
  if (warnings.length > 0) return { state: 'disconnected', warnings };
  const asm = assembleProduct(op, inputsById);
  if (!asm.ok) {
    return { state: 'disconnected', warnings: [`Сборка невозможна: ${asm.error}`] };
  }
  return { state: 'valid', warnings: [], asm };
}

/**
 * selectVirtualOutputs(state) → VirtualContainer[] (DEC-PROD-01).
 */
export function selectVirtualOutputs(state) {
  if (!state || !Array.isArray(state.operations)) return [];
  const byId = {};
  for (const c of (state.containers || [])) byId[c.id] = c;
  const vpos = state.virtualPositions || {};
  const out = [];
  for (const op of state.operations) {
    if (op.status === 'executed') continue; // real container exists
    const inputs = (op.inputs || []).map((id) => byId[id]).filter(Boolean);
    const { state: vState, warnings, asm } = computeVirtualState(op, state, byId);
    const opPos = op.position || { x: 0, y: 0 };
    out.push({
      id: virtualIdForOp(op.id),
      name: derivedProductName(op, inputs),
      state: vState,
      sequence: asm?.sequence,
      topology: asm?.topology || { circular: false },
      annotations: asm?.annotations || [],
      warnings,
      opId: op.id,
      inputContainerIds: (op.inputs || []).slice(),
      position: vpos[op.id] || { x: opPos.x + 120, y: opPos.y },
    });
  }
  return out;
}

export function selectVirtualById(state, virtualId) {
  if (!isVirtualId(virtualId)) return null;
  return selectVirtualOutputs(state).find((v) => v.id === virtualId) || null;
}
