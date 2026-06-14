/**
 * op-colors — M-CANVAS-FIX.1 K5/K6. ONE place that decides an operation's
 * colour, shared by OperationNode (the diamond) and ZoneGraphContent (the
 * edges) so a reaction is the same colour on its node AND its wires.
 *
 * Canon (Игорь §0.6): junction-styles = chemistry class. So an op that IS a
 * junction method reads the junction-styles palette; an op that is NOT a
 * junction (amplification / prep) gets its own distinct colour; an unknown op
 * gets a WARM neutral — never grey, because grey reads as "inactive/disabled".
 */
import { junctionStroke, junctionFill } from './junction-styles';

// op.kind → junction.kind for the ops that ARE assembly-junction methods.
const OP_KIND_TO_JUNCTION_KIND = {
  gibson: 'overlap',
  golden_gate: 'golden_gate',
  ligate: 'ligation',
  kld: 'kld',
  restriction: 're_ligation', // RE-ligation assembly op → orange canon
};

// Non-junction ops (amplification / prep / mutate). Own distinct colours,
// chosen by design-sense to NOT collide with the chemistry canon set
// (overlap-blue / GG-green / RE-orange / ligation-red / kld-purple).
const OP_OWN_COLORS = {
  pcr: { stroke: '#0891b2', fill: '#cffafe' }, // cyan — amplification
  cut: { stroke: '#b45309', fill: '#fef3c7' }, // amber — digest
  mutagenesis: { stroke: '#be185d', fill: '#fce7f3' }, // rose — mutate
};

// Unknown / kind-not-yet-chosen. WARM neutral (taupe/sand), explicitly NOT grey
// — grey reads as "inactive". Draft state still signals "unset" via its dash.
export const OP_NEUTRAL = { stroke: '#a8917d', fill: '#f3ece1' };

/** Canonical {stroke, fill} for an operation kind. */
export function operationColor(kind) {
  const jk = OP_KIND_TO_JUNCTION_KIND[kind];
  if (jk) return { stroke: junctionStroke(jk), fill: junctionFill(jk) };
  if (kind && OP_OWN_COLORS[kind]) return OP_OWN_COLORS[kind];
  return OP_NEUTRAL;
}

/**
 * Edge colour: a graph edge inherits the colour of the operation it touches
 * (the wire is part of that reaction). A container→container edge (no op
 * endpoint) gets the warm neutral.
 */
export function edgeColorFor(fromNode, toNode) {
  // A26 (audit) — real graph nodes carry the discriminator at `node.data.kind`
  // (+ `node.type`), NOT a top-level `node.kind`. The old `n.kind === 'operation'`
  // never matched, so EVERY edge fell through to the neutral taupe and the
  // documented per-reaction edge colours (Gibson-blue / digest-amber / …) were dead.
  const isOp = (n) => n
    && (n.type === 'operation' || (n.data && n.data.kind === 'operation'))
    && n.data && n.data.operation;
  const opNode = [fromNode, toNode].find(isOp);
  if (opNode) return operationColor(opNode.data.operation.kind).stroke;
  return OP_NEUTRAL.stroke;
}
