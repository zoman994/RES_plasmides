/**
 * zone-layout-rules — T4.5 K2 (DEC-T4.5-03). Pure lane classification
 * for the 3-lane zone auto-layout, DERIVED from state refs (not a
 * node.role flag): delete a junction → a container instantly reverts
 * to a source. Containers only are sources/finals; pieces + operations
 * are always intermediate.
 *
 *  - Source       — zone container with NO incoming junction AND not an
 *                    operation output (nothing in the zone produced it).
 *  - Final        — zone container with NO outgoing junction AND not an
 *                    operation input. frozen === true (executed product)
 *                    is a strong "final" signal even with an outgoing
 *                    edge, as long as it is not consumed as an op input.
 *  - Intermediate — everything else (pieces, ops, mid containers).
 *
 * Precedence source > final > intermediate; an isolated single
 * container (no edges at all) is BOTH by raw predicate, resolved to
 * source so layout is deterministic.
 */
import { nodeListInZone } from './zone-model';

/** Normalised flat node list for a zone. */
export function collectAllNodes(state, zoneId) {
  const { containers, pieces, operations } = nodeListInZone(state, zoneId);
  return [
    ...containers.map((c) => ({
      id: c.id,
      kind: 'container',
      name: c.name || c.id,
      frozen: !!c.frozen,
      // T4.5 fix — the realised final product is edge-isolated (no
      // junctions, not an op output) so the raw source/final rules
      // mis-place it; its origin is the authoritative "this is a
      // final" signal.
      isRealisedProduct: !!(c.origin && c.origin.kind === 'realised-product'),
      ref: c,
    })),
    ...pieces.map((p) => ({
      id: p.id, kind: 'piece', name: p.name || p.id, frozen: false, ref: p,
    })),
    ...operations.map((o) => ({
      id: o.id, kind: 'operation', name: o.kind || o.id, frozen: false, ref: o,
    })),
  ];
}

/** Per-zone edge context (junctions + op refs scoped to this zone). */
function zoneContext(state, zoneId) {
  const { containers } = nodeListInZone(state, zoneId);
  const zoneCnt = new Set(containers.map((c) => c.id));
  const incoming = new Set();
  const outgoing = new Set();
  for (const j of (state && state.junctions) || []) {
    if (!j) continue;
    // Scope to this zone: both endpoints are zone containers.
    if (!zoneCnt.has(j.fromContainerId) || !zoneCnt.has(j.toContainerId)) continue;
    outgoing.add(j.fromContainerId);
    incoming.add(j.toContainerId);
  }
  const opInputs = new Set();
  const opOutputs = new Set();
  for (const op of (state && state.operations) || []) {
    if (!op) continue;
    const ins = op.inputs || [];
    const outs = op.outputs || [];
    const relevant = op.zoneId === zoneId
      || ins.some((id) => zoneCnt.has(id))
      || outs.some((id) => zoneCnt.has(id));
    if (!relevant) continue;
    for (const id of ins) if (zoneCnt.has(id)) opInputs.add(id);
    for (const id of outs) if (zoneCnt.has(id)) opOutputs.add(id);
  }
  const byId = new Map(containers.map((c) => [c.id, c]));
  return {
    incoming, outgoing, opInputs, opOutputs, byId,
  };
}

function zoneContainer(state, zoneId, nodeId, ctx) {
  const c = (ctx || zoneContext(state, zoneId)).byId.get(nodeId);
  return c || null;
}

const isRealisedProduct = (cnt) => !!(cnt && cnt.origin && cnt.origin.kind === 'realised-product');

export function isSource(state, zoneId, nodeId, ctx) {
  const c = zoneContext(state, zoneId);
  const cnt = ctx ? zoneContainer(state, zoneId, nodeId, ctx) : zoneContainer(state, zoneId, nodeId, c);
  if (!cnt) return false; // only containers can be sources
  if (isRealisedProduct(cnt)) return false; // product is a final, never a source
  return !c.incoming.has(nodeId) && !c.opOutputs.has(nodeId);
}

export function isFinal(state, zoneId, nodeId, ctx) {
  const c = zoneContext(state, zoneId);
  const cnt = ctx ? zoneContainer(state, zoneId, nodeId, ctx) : zoneContainer(state, zoneId, nodeId, c);
  if (!cnt) return false;
  if (isRealisedProduct(cnt)) return true; // origin-authoritative final
  if (c.opInputs.has(nodeId)) return false; // still consumed downstream
  return !c.outgoing.has(nodeId) || cnt.frozen === true;
}

export function isIntermediate(state, zoneId, nodeId) {
  return !isSource(state, zoneId, nodeId) && !isFinal(state, zoneId, nodeId);
}

/**
 * Mutually-exclusive partition with precedence source > final > mid.
 * Returns normalised node objects (collectAllNodes shape).
 */
export function classifyZoneNodes(state, zoneId) {
  const nodes = collectAllNodes(state, zoneId);
  const ctx = zoneContext(state, zoneId);
  const sources = [];
  const finals = [];
  const intermediate = [];
  for (const n of nodes) {
    if (n.kind !== 'container') { intermediate.push(n); continue; }
    if (n.isRealisedProduct) {
      finals.push(n); // realised product is always a final (origin-authoritative)
    } else if (!ctx.incoming.has(n.id) && !ctx.opOutputs.has(n.id)) {
      sources.push(n); // source wins ties (isolated container → source)
    } else if (!ctx.opInputs.has(n.id) && (!ctx.outgoing.has(n.id) || n.frozen === true)) {
      finals.push(n);
    } else {
      intermediate.push(n);
    }
  }
  return { sources, intermediate, finals };
}
