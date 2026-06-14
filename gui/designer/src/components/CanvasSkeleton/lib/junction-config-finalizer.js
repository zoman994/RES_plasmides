/**
 * junction-config-finalizer — JUNCTION layer 3 finalizer (J1/J2/J3 + J11).
 * Extracted from skeleton-state.js to keep the router under the .js hard
 * budget. Pure: (next, prev) → next' with seeded zone.junctions + derived
 * per-junction primers.
 *
 * Per zone it:
 *   1. seeds zone.junctions[pairKey] for the current boundaries with the
 *      default overlap config (closure junction only when topology.circular),
 *      prunes orphaned entries (reorder / split / remove), and preserves
 *      manually-edited entries (junction.autoMode:'manual' = level 2). [J1/J2/J3]
 *   2. derives the zone's primers via the IMPLICIT zone-group (pieces by
 *      createdAt) through the config-aware engine (A3) → assemblyDraftPrimers,
 *      so primers with tails appear on ADD without a manual Sew. [J11]
 *
 * Primer-source model (Igor 05.06), three levels (lower wins):
 *   1. Fully manual — the biolog rewrote the primer SEQUENCE / locked it.
 *      Carried by a PRIMER-level flag (autoMode:'manual' — set by WRITE /
 *      K12 lock / edit-save). The finalizer NEVER regenerates these, and the
 *      auto duplicate for that (piece, side) is dropped (dedup).
 *   2. Semi-manual — a NUMBER set on the junction (overlapLength/Tm,
 *      bindingLength/Tm). The primer regenerates but the engine (A3/A1b) reads
 *      the number from zone.junctions.
 *   3. Fully auto — default config; re-derived freely.
 *
 * Groups are advisory for protocol order — they do NOT own primers
 * (CREATE/REMOVE/DISBAND no longer touch assemblyDraftPrimers).
 *
 * Derive-gate: runs only when pieces or a zone's junction-config / topology
 * changed — a purely positional zone change (DRAG_ZONE) must NOT re-derive.
 */
import { draftFromZone } from './zone-pieces-to-dag';
import { deriveAutoPrimers, deriveSelfClosurePrimers } from './primer-derive';
import { allBoundaries, seedJunction, DEFAULT_JUNCTION_METHOD } from './junction-derive';

/**
 * TD-JUNC-FINALIZER-DERIVE-GATE — true when a zone was added/removed, or any
 * zone's junction config (`.junctions` ref) or circular topology changed. A
 * positional change (bounds/position via DRAG_ZONE) spreads the zone and keeps
 * the `.junctions` ref → false, so primers are NOT churned with fresh uuids.
 */
function zonesConfigChanged(prev, next) {
  const pz = prev.zones || [];
  const nz = next.zones || [];
  if (pz.length !== nz.length) return true;
  const byId = new Map(pz.map((z) => [z.id, z]));
  for (const z of nz) {
    const p = byId.get(z.id);
    if (!p) return true;
    if (p.junctions !== z.junctions) return true;
    if (!!(p.topology && p.topology.circular) !== !!(z.topology && z.topology.circular)) return true;
  }
  return false;
}

/**
 * TD-JUNC-MANUAL-AUTO-DEDUP — the (pieceId, side) a level-1 manual primer owns,
 * so the finalizer can drop the auto duplicate. A WRITE primer's source is
 * boundary/segment-kind (segmentId / leftSegmentId / rightSegmentId), matching
 * mapPrimersForSegment — so it is realise-pickable; dedup keeps exactly one
 * primer per side (the manual one).
 */
function manualCoverageKey(p) {
  const s = p.source || {};
  const side = p.direction === 'reverse' ? 'rev' : 'fwd';
  let seg = null;
  if (s.kind === 'segment') seg = s.segmentId;
  else if (s.kind === 'boundary') seg = side === 'fwd' ? s.leftSegmentId : s.rightSegmentId;
  else seg = s.pieceId; // defensive (a manual auto-group primer)
  return seg ? `${seg}:${side}` : null;
}

export function applyJunctionConfig(next, prev) {
  if (!next || !Array.isArray(next.zones) || next.zones.length === 0) return next;
  if (next.pieces === prev.pieces && !zonesConfigChanged(prev, next)) return next;

  const pieces = next.pieces || [];
  let zonesChanged = false;

  // (1) Seed / prune zone.junctions per current boundaries (J1/J2/J3).
  const seeded = next.zones.map((zone) => {
    const zonePieces = pieces.filter((p) => p.zoneId === zone.id);
    if (zonePieces.length < 2) {
      if (zone.junctions && Object.keys(zone.junctions).length > 0) {
        zonesChanged = true;
        return { ...zone, junctions: {} };
      }
      return zone;
    }
    let bounds;
    try {
      bounds = allBoundaries(draftFromZone(next, zone));
    } catch {
      return zone;
    }
    const validKeys = new Set(bounds.map((b) => b.pairKey));
    const curJ = zone.junctions || {};
    const newJ = {};
    let jChanged = false;
    for (const b of bounds) {
      if (curJ[b.pairKey]) newJ[b.pairKey] = curJ[b.pairKey]; // keep (incl. manual)
      // UX slice 3 — a new junction inherits the construct-level method.
      else { newJ[b.pairKey] = seedJunction(zone.assemblyMethod || DEFAULT_JUNCTION_METHOD); jChanged = true; }
    }
    for (const k of Object.keys(curJ)) {
      if (!validKeys.has(k)) jChanged = true; // orphan dropped (not copied)
    }
    if (jChanged) { zonesChanged = true; return { ...zone, junctions: newJ }; }
    return zone;
  });
  const zones = zonesChanged ? seeded : next.zones;

  // (2) Derive primers per-junction via the implicit zone-group (J11).
  const stateForDerive = zonesChanged ? { ...next, zones } : next;
  const map = next.assemblyDraftPrimers || {};
  const newMap = { ...map };
  let primersChanged = false;
  for (const zone of zones) {
    const zonePieces = pieces
      .filter((p) => p.zoneId === zone.id)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const existing = map[zone.id] || [];
    // Level 1 — primer-level manual flag (WRITE / lock / edit) is preserved
    // verbatim; listed FIRST so realise's mapPrimersForSegment prefers them.
    const manual = existing.filter((p) => p && p.autoMode === 'manual');
    if (zonePieces.length < 2) {
      // M-CIRCULARIZE — a single-fragment CIRCULAR zone self-closes → derive its
      // 2 self-closure primers (whole-fragment amp + re-circularization tails).
      // Linear single fragment → none (just keep manual). Without this, picking
      // a plasmid fragment and circularizing it produced no primers.
      let derivedSelf = [];
      if (zonePieces.length === 1 && zone.topology && zone.topology.circular) {
        try { derivedSelf = deriveSelfClosurePrimers(zonePieces[0], stateForDerive); } catch { derivedSelf = []; }
        const cov = new Set(manual.map(manualCoverageKey).filter(Boolean));
        if (cov.size > 0) derivedSelf = derivedSelf.filter((d) => !cov.has(`${d.source.pieceId}:${d.source.side}`));
      }
      const nextArr = [...manual, ...derivedSelf];
      if (nextArr.length !== existing.length || derivedSelf.length > 0) {
        newMap[zone.id] = nextArr; primersChanged = true;
      }
      continue;
    }
    let derived = [];
    try {
      derived = deriveAutoPrimers({
        id: `zgrp-${zone.id}`,
        kind: DEFAULT_JUNCTION_METHOD,
        inputPieces: zonePieces.map((p) => p.id),
        zoneId: zone.id,
        // G/TOP-3 — tell the engine to wrap the terminal pieces' tails so the
        // closure junction gets its homology/overhang (the ring can close).
        circular: !!(zone.topology && zone.topology.circular),
      }, stateForDerive);
    } catch {
      derived = [];
    }
    // Dedup — a manual primer owns its (piece, side); drop the auto duplicate
    // so exactly one primer per side reaches realise + the panel.
    const covered = new Set(manual.map(manualCoverageKey).filter(Boolean));
    if (covered.size > 0) {
      derived = derived.filter((d) => !covered.has(`${d.source.pieceId}:${d.source.side}`));
    }
    newMap[zone.id] = [...manual, ...derived];
    primersChanged = true;
  }

  let result = next;
  if (zonesChanged) result = { ...result, zones };
  if (primersChanged) result = { ...result, assemblyDraftPrimers: newMap };
  return result;
}
