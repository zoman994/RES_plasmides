/**
 * bodge-assembly-json — split assembly state into per-zone JSON.
 *
 * writeAssemblyJson(zone, pieces, operations, junctions, positions) → string
 * readAssemblyJson(jsonStr) → { zone, pieces, operations, junctions, positions }
 *
 * Each assembly = one zone + the pieces/operations/junctions whose
 * `zoneId === zone.id`. Cross-zone refs (piece.sourceIds → container in
 * another zone, or op.inputs pointing across zones) are preserved as raw
 * IDs; integrity validation lives in `validateAssemblyJson`.
 *
 * Spec §7.1: orphan refs at write time = export error; at read time =
 * warning.
 */
import { BODGE_V2_FILE_FORMAT_VERSION } from './bodge-manifest-v2';

/**
 * Build a single assembly JSON object. Inputs are slices of the global
 * four-tier state, already filtered by zoneId by the caller.
 *
 * Optional `containerIds` is the set of container IDs known to the
 * exporting project — used by validateAssemblyJson for orphan-ref check.
 */
export function writeAssemblyJson({
  zone,
  pieces = [],
  operations = [],
  junctions = [],
  positions = {},
}) {
  if (!zone || !zone.id) {
    throw new Error('writeAssemblyJson: zone with id required');
  }
  const out = {
    $schema: 'https://bodgegene.dev/schema/bodge-assembly-v2.json',
    fileFormatVersion: BODGE_V2_FILE_FORMAT_VERSION,
    id: zone.id,
    name: zone.name || '',
    createdAt: zone.createdAt || new Date().toISOString(),
    updatedAt: zone.updatedAt || new Date().toISOString(),
    zone: {
      bounds: zone.bounds || { x: 0, y: 0, width: 800, height: 600 },
      viewMode: zone.viewMode || 'graph',
      laneLayout: zone.laneLayout || 'auto',
      collapsed: !!zone.collapsed,
      notes: zone.notes || '',
      autoResize: zone.autoResize !== false,
      finalTopology: zone.finalTopology || null,
      // TOP-5 — persist the authoritative circularization + method/junction config
      // so a saved plasmid survives the round-trip (these were silently dropped).
      topology: zone.topology ? { circular: !!zone.topology.circular } : null,
      assemblyMethod: zone.assemblyMethod || null,
      junctions: zone.junctions || {},
    },
    pieces: pieces.map(p => serializePiece(p)),
    operations: operations.map(o => serializeOperation(o)),
    junctions: junctions.map(j => serializeJunction(j)),
    positions: { ...positions },
  };
  return JSON.stringify(out, null, 2);
}

function serializePiece(p) {
  // Preserve only known fields + drop runtime cruft.
  const out = {
    id: p.id,
    name: p.name || '',
    kind: p.kind || 'sourced',
    zoneId: p.zoneId || null,
    color: p.color || null,
    order: typeof p.order === 'number' ? p.order : null,
    pinned: !!p.pinned,
    frozen: !!p.frozen,
  };
  if (p.kind === 'gap') {
    out.gapLength = Number(p.gapLength) || 0;
    if (p.gapSequence) out.gapSequence = p.gapSequence;
    out.gapHint = p.gapHint || 'unknown';
  } else {
    out.sourceIds = Array.isArray(p.sourceIds) ? [...p.sourceIds] : [];
    out.ranges = Array.isArray(p.ranges) ? p.ranges.map(r => ({ ...r })) : [];
    if (p.origin) out.origin = { ...p.origin };
    if (p.acquisitionMethod) out.acquisitionMethod = p.acquisitionMethod;
    if (p.acquisitionParams) out.acquisitionParams = { ...p.acquisitionParams };
    if (p.derivedReactionId) out.derivedReactionId = p.derivedReactionId;
    if (p.variantGroupId) out.variantGroupId = p.variantGroupId;
    if (p.functionalLabel) out.functionalLabel = p.functionalLabel;
    if (p.groupId) out.groupId = p.groupId;
    if (typeof p.groupLayer === 'number') out.groupLayer = p.groupLayer;
    if (Array.isArray(p.mutations)) out.mutations = p.mutations.map(m => ({ ...m }));
  }
  return out;
}

function serializeOperation(o) {
  return {
    id: o.id,
    kind: o.kind || 'unknown',
    status: o.status || 'pending',
    position: o.position || null,
    inputs: Array.isArray(o.inputs) ? [...o.inputs] : [],
    inputPieces: Array.isArray(o.inputPieces) ? [...o.inputPieces] : [],
    outputs: Array.isArray(o.outputs) ? [...o.outputs] : [],
    params: o.params ? { ...o.params } : {},
    junctionRefs: Array.isArray(o.junctionRefs) ? [...o.junctionRefs] : [],
    zoneId: o.zoneId || null,
    createdAt: o.createdAt || null,
    executedAt: o.executedAt || null,
    error: o.error || null,
    materializedClones: Array.isArray(o.materializedClones)
      ? o.materializedClones.map(c => ({ ...c }))
      : null,
    pinned: !!o.pinned,
    isOpGroup: !!o.isOpGroup,
  };
}

function serializeJunction(j) {
  return {
    id: j.id,
    kind: j.kind || 'overlap',
    leftPieceId: j.leftPieceId || null,
    rightPieceId: j.rightPieceId || null,
    overlapLength: typeof j.overlapLength === 'number' ? j.overlapLength : null,
    ggOverhang: j.ggOverhang || null,
    enzyme: j.enzyme || null,
  };
}

/**
 * Parse an assembly JSON string back to a state object. Does NOT validate
 * cross-refs — that's the writer's job before serialization, and the
 * reader emits warnings (not throws) for any orphans found.
 */
export function readAssemblyJson(jsonStr) {
  if (!jsonStr) throw new Error('readAssemblyJson: input required');
  const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  if (!parsed.id) throw new Error('readAssemblyJson: assembly id missing');
  return {
    id: parsed.id,
    name: parsed.name || '',
    createdAt: parsed.createdAt || null,
    updatedAt: parsed.updatedAt || null,
    zone: { ...(parsed.zone || {}), id: parsed.id },
    pieces: Array.isArray(parsed.pieces) ? parsed.pieces : [],
    operations: Array.isArray(parsed.operations) ? parsed.operations : [],
    junctions: Array.isArray(parsed.junctions) ? parsed.junctions : [],
    positions: parsed.positions || {},
  };
}

/**
 * Validate cross-refs (export side) — orphan refs are export errors.
 * Returns `{ok, errors}`. Caller throws on !ok.
 *
 * containerIds: Set<string> of container IDs known to the project.
 * pieceIds: Set<string> of piece IDs known to the project (across zones).
 * opIds: Set<string> of operation IDs known to the project.
 */
export function validateAssemblyJson(assembly, {
  containerIds = new Set(),
  pieceIds = new Set(),
  opIds = new Set(),
} = {}) {
  const errors = [];
  for (const p of assembly.pieces || []) {
    for (const sid of p.sourceIds || []) {
      if (!containerIds.has(sid)) errors.push(`piece ${p.id}: sourceId "${sid}" unknown`);
    }
    if (p.derivedReactionId && !opIds.has(p.derivedReactionId)) {
      errors.push(`piece ${p.id}: derivedReactionId "${p.derivedReactionId}" unknown`);
    }
  }
  for (const o of assembly.operations || []) {
    for (const inp of o.inputs || []) {
      if (!containerIds.has(inp)) errors.push(`op ${o.id}: input "${inp}" unknown container`);
    }
    for (const ip of o.inputPieces || []) {
      if (!pieceIds.has(ip)) errors.push(`op ${o.id}: inputPiece "${ip}" unknown`);
    }
    for (const out of o.outputs || []) {
      if (!containerIds.has(out)) errors.push(`op ${o.id}: output "${out}" unknown container`);
    }
    for (const clone of o.materializedClones || []) {
      if (clone.cloneId && !containerIds.has(clone.cloneId)) {
        errors.push(`op ${o.id}: materialized clone "${clone.cloneId}" unknown`);
      }
    }
  }
  for (const j of assembly.junctions || []) {
    if (j.leftPieceId && !pieceIds.has(j.leftPieceId)) {
      errors.push(`junction ${j.id}: leftPieceId "${j.leftPieceId}" unknown`);
    }
    if (j.rightPieceId && !pieceIds.has(j.rightPieceId)) {
      errors.push(`junction ${j.id}: rightPieceId "${j.rightPieceId}" unknown`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Same checks as validateAssemblyJson but soft — returns warnings instead
 * of errors. Used by reader to attach warnings to readBodge result.
 */
export function checkAssemblyOrphans(assembly, {
  containerIds = new Set(),
  pieceIds = new Set(),
} = {}) {
  const warnings = [];
  for (const p of assembly.pieces || []) {
    for (const sid of p.sourceIds || []) {
      if (!containerIds.has(sid)) warnings.push(`piece ${p.id}: orphan sourceId "${sid}"`);
    }
  }
  for (const o of assembly.operations || []) {
    for (const inp of o.inputs || []) {
      if (!containerIds.has(inp)) warnings.push(`op ${o.id}: orphan input container "${inp}"`);
    }
    for (const out of o.outputs || []) {
      if (!containerIds.has(out)) warnings.push(`op ${o.id}: orphan output container "${out}"`);
    }
  }
  return warnings;
}
