/**
 * selectors-zones — pure derived reads over state.zones (T3 K5).
 * Junction endpoints use the real shape fromContainerId/toContainerId
 * (spec §5.7 wrote j.from/j.to) with a defensive fallback.
 */
import { nodeListInZone } from '../lib/zone-model';

export function selectAllZones(state) {
  return (state && state.zones) || [];
}

export function selectZoneById(state, zoneId) {
  return selectAllZones(state).find((z) => z.id === zoneId) || null;
}

function findNode(state, nodeId) {
  return ((state && state.containers) || []).find((c) => c.id === nodeId)
    || ((state && state.pieces) || []).find((p) => p.id === nodeId)
    || ((state && state.operations) || []).find((o) => o.id === nodeId)
    || null;
}

export function selectZoneByNodeId(state, nodeId) {
  const node = findNode(state, nodeId);
  if (!node || node.zoneId == null) return null;
  return selectZoneById(state, node.zoneId);
}

export function selectLooseNodes(state) {
  const loose = (n) => n.zoneId == null;
  return {
    containers: ((state && state.containers) || []).filter(loose),
    pieces: ((state && state.pieces) || []).filter(loose),
    operations: ((state && state.operations) || []).filter(loose),
  };
}

export function selectNodesInZone(state, zoneId) {
  return nodeListInZone(state, zoneId);
}

function jEnds(j) {
  return [j.fromContainerId ?? j.from, j.toContainerId ?? j.to];
}

export function selectJunctionsInZone(state, zoneId) {
  return ((state && state.junctions) || []).filter((j) => {
    const [a, b] = jEnds(j);
    const na = findNode(state, a);
    const nb = findNode(state, b);
    return na && nb && na.zoneId === zoneId && nb.zoneId === zoneId;
  });
}

export function selectJunctionZoneId(state, junctionId) {
  const j = ((state && state.junctions) || []).find((x) => x.id === junctionId);
  if (!j) return null;
  const [a, b] = jEnds(j);
  const na = findNode(state, a);
  const nb = findNode(state, b);
  if (!na || !nb || na.zoneId == null || nb.zoneId == null) return null;
  return na.zoneId === nb.zoneId ? na.zoneId : 'cross-zone';
}

export function selectDefaultZone(state) {
  return selectAllZones(state)[0] || null;
}

export function selectFinalProductsInZone(state, zoneId) {
  const { containers } = nodeListInZone(state, zoneId);
  const outgoing = new Set(
    ((state && state.junctions) || [])
      .map((j) => jEnds(j)[0])
      .filter((from) => {
        const fn = findNode(state, from);
        return fn && fn.zoneId === zoneId;
      }),
  );
  return containers.filter((c) => !outgoing.has(c.id));
}
