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
import { computeAssemblySequence, segmentBoundaries } from './assembly-model';
import { documentIdentityOf } from '../../../lib/primer-live-workflow';
import {
  attachKnownPrimerSite, repairKnownAutoPrimer, sameAutoPrimerSource,
} from '../../../lib/primer-known-placement';

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

function deriveForZone(zone, state, zonePieces) {
  if (zonePieces.length === 1 && zone.topology?.circular) {
    try { return deriveSelfClosurePrimers(zonePieces[0], state, zone.assemblyMethod); } catch { return []; }
  }
  if (zonePieces.length < 2) return [];
  try {
    return deriveAutoPrimers({
      id: `zgrp-${zone.id}`,
      kind: DEFAULT_JUNCTION_METHOD,
      inputPieces: zonePieces.map((piece) => piece.id),
      zoneId: zone.id,
      circular: !!zone.topology?.circular,
    }, state);
  } catch {
    return [];
  }
}

function placementContext(zone, state) {
  try {
    const draft = draftFromZone(state, zone);
    const { sequence } = computeAssemblySequence(draft);
    const topology = draft.topology?.circular ? 'circular' : 'linear';
    const documentHash = documentIdentityOf({ sequence, topology });
    if (!sequence || !documentHash) return null;
    return { sequence, topology, documentHash, boundaries: segmentBoundaries(draft).boundaries };
  } catch {
    return null;
  }
}

function placementFor(primer, zone, context) {
  if (!context || !primer?.source?.pieceId) return null;
  const matches = context.boundaries.filter(
    (boundary) => boundary?.segmentId === primer.source.pieceId,
  );
  if (matches.length !== 1) return null;
  const boundary = matches[0];
  const targetLength = String(primer.bindingSequence || '').replace(/[^A-Za-z]/g, '').length;
  const pieceLength = boundary.endOnAssembly - boundary.startOnAssembly;
  if (!targetLength || targetLength > pieceLength) return null;
  const reverse = primer.direction === 'reverse';
  const start = reverse ? boundary.endOnAssembly - targetLength : boundary.startOnAssembly;
  return {
    entryId: zone.id,
    documentHash: context.documentHash,
    topology: context.topology,
    template: context.sequence,
    start,
    end: start + targetLength,
  };
}

function attachDerivedSites(derived, zone, context) {
  return derived.map((primer) => {
    const placement = placementFor(primer, zone, context);
    return placement ? (attachKnownPrimerSite(primer, placement) || primer) : primer;
  });
}

function repairManualSites(records, expected, zone, context) {
  return records.map((primer) => {
    const candidates = expected.filter((candidate) => sameAutoPrimerSource(primer, candidate));
    if (candidates.length !== 1) return primer;
    const placement = placementFor(candidates[0], zone, context);
    return placement ? repairKnownAutoPrimer(primer, candidates[0], placement) : primer;
  });
}

/** Pure v12→v13 normalizer: repairs only uniquely re-derived, provable records. */
export function canonicalizeAssemblyPrimerRecords(state) {
  if (!state || !Array.isArray(state.zones)) return state;
  const map = state.assemblyDraftPrimers || {};
  const nextMap = { ...map };
  let changed = false;
  for (const zone of state.zones) {
    const zonePieces = (state.pieces || [])
      .filter((piece) => piece.zoneId === zone.id)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const records = Array.isArray(map[zone.id]) ? map[zone.id] : [];
    if (!records.length) continue;
    const expected = deriveForZone(zone, state, zonePieces);
    const repaired = repairManualSites(records, expected, zone, placementContext(zone, state));
    if (repaired.some((primer, index) => primer !== records[index])) {
      nextMap[zone.id] = repaired;
      changed = true;
    }
  }
  return changed ? { ...state, assemblyDraftPrimers: nextMap } : state;
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
      // UX slice 3 / F — a new junction inherits the construct-level method AND
      // its enzyme (GG/RE), so a freshly-added fragment is realisable at once.
      else { newJ[b.pairKey] = seedJunction(zone.assemblyMethod || DEFAULT_JUNCTION_METHOD, zone.assemblyEnzyme); jChanged = true; }
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
    const rawManual = existing.filter((p) => p && p.autoMode === 'manual');
    const context = placementContext(zone, stateForDerive);
    const expected = deriveForZone(zone, stateForDerive, zonePieces);
    const manual = repairManualSites(rawManual, expected, zone, context);
    if (zonePieces.length < 2) {
      // M-CIRCULARIZE — a single-fragment CIRCULAR zone self-closes → derive its
      // 2 self-closure primers (whole-fragment amp + re-circularization tails).
      // Linear single fragment → none (just keep manual). Without this, picking
      // a plasmid fragment and circularizing it produced no primers.
      let derivedSelf = attachDerivedSites(expected, zone, context);
      if (derivedSelf.length > 0) {
        const cov = new Set(manual.map(manualCoverageKey).filter(Boolean));
        if (cov.size > 0) derivedSelf = derivedSelf.filter((d) => !cov.has(`${d.source.pieceId}:${d.source.side}`));
      }
      const nextArr = [...manual, ...derivedSelf];
      if (nextArr.length !== existing.length || derivedSelf.length > 0) {
        newMap[zone.id] = nextArr; primersChanged = true;
      }
      continue;
    }
    let derived = attachDerivedSites(expected, zone, context);
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
