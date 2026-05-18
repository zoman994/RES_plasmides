/**
 * piece-model — pure helpers for the Piece entity (T1, DEC-CANVAS-4T-01).
 *
 * Fourth-tier "piece" — a named selection over one or more containers
 * (DEC-T1-05 sourceIds[] + DEC-T1-06 parallel ranges[]). Parallels
 * assembly-model.js: every function is pure (input → new object), no
 * state side effects, no validation (that is piece-invariants, K2).
 *
 * Naming convention (DEC-T1 / R-T1-5): `piece` singular var, `Piece`
 * JSDoc typedef, `pieces` array/slice key.
 */
import { v7 as uuidv7 } from 'uuid';

/**
 * @typedef {Object} PieceRange
 * @property {string} sourceId
 * @property {number} start  0-indexed inclusive
 * @property {number} end    exclusive
 * @property {'forward'|'reverse'} orientation
 */

/**
 * @typedef {Object} Piece
 * @property {string} id  'pc-<uuidv7>'
 * @property {string} name
 * @property {string[]} sourceIds
 * @property {PieceRange[]} ranges
 * @property {'selection'|'feature'|'existing-primers'|'new-primers'|'legacy-migration'} origin
 * @property {'undefined'|'pcr'|'ov-pcr'|'restriction'|'direct'|'synthesis'} acquisitionMethod
 * @property {Object} acquisitionParams
 * @property {string} color  hex '#RRGGBB'
 * @property {string|null} functionalLabel
 * @property {string|null} zoneId            T3 sets; T1 always null
 * @property {string|null} derivedReactionId T8 sets; T1 always null
 * @property {boolean} frozen   T2 DEC-T2-13 — set on OP_EXECUTE
 * @property {string} [frozenSequence] T2 R-T2-6 — sequence snapshot cached at freeze
 * @property {number} createdAt
 * @property {number} updatedAt
 */

// DEC-T1-08 collision threshold. Kept in sync with
// piece-invariants.PIECE_CAPS.COLOR_COLLISION_THRESHOLD (same value 12);
// duplicated here so the pure colour helper has no invariants dependency.
const COLOR_COLLISION_THRESHOLD = 12;
const CLONE_SUFFIX = ' (копия)';

function hashString(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hslToHex(hDeg, s, l) {
  const h = ((hDeg % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2;
  const ch = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/**
 * generatePieceColor — deterministic pastel from the piece id
 * (DEC-T1-08: id-based, NOT name-based — never recomputed on rename).
 * Saturation 65%, Lightness 55%, Hue = hash(id) % 360. When
 * existingColors has > threshold entries and the base colour collides,
 * the hue is stepped +20° (deterministic given id + existingColors)
 * until distinct, so a >12-piece project keeps visually separable hues.
 */
export function generatePieceColor(pieceId, existingColors = []) {
  const baseHue = hashString(pieceId) % 360;
  let color = hslToHex(baseHue, 0.65, 0.55);
  if (Array.isArray(existingColors) && existingColors.length > COLOR_COLLISION_THRESHOLD) {
    const used = new Set(existingColors);
    let hue = baseHue;
    for (let i = 0; i < 18 && used.has(color); i += 1) {
      hue = (hue + 20) % 360;
      color = hslToHex(hue, 0.65, 0.55);
    }
  }
  return color;
}

/**
 * createPiece — stamp id / colour / timestamps onto raw piece data.
 * Pure; does NOT validate (piece-invariants concern) and does NOT
 * mutate the caller's object. existingPieces feeds colour collision
 * avoidance only.
 */
export function createPiece(rawData = {}, existingPieces = []) {
  const id = `pc-${uuidv7()}`;
  const now = Date.now();
  const existingColors = (existingPieces || []).map((p) => p.color).filter(Boolean);
  const isGap = rawData.kind === 'gap';
  // V83 — a gap with a KNOWN sequence (linker preset / custom) keeps it
  // verbatim and gapLength derives from it. A sequence-less gap is the
  // genuine unknown-length placeholder (renders poly-N), unchanged.
  const gapSeq = (isGap && typeof rawData.gapSequence === 'string' && rawData.gapSequence.length > 0)
    ? rawData.gapSequence : null;
  return {
    id,
    kind: rawData.kind === 'gap' ? 'gap' : 'sourced', // T6 DEC-T6-02
    ...(isGap ? {
      gapLength: gapSeq
        ? gapSeq.length
        : (Number.isFinite(rawData.gapLength) ? rawData.gapLength : 0),
      gapHint: rawData.gapHint || 'unknown',
      ...(gapSeq ? { gapSequence: gapSeq } : {}),
    } : {}),
    name: typeof rawData.name === 'string' ? rawData.name : '',
    sourceIds: Array.isArray(rawData.sourceIds) ? rawData.sourceIds.slice() : [],
    ranges: Array.isArray(rawData.ranges)
      ? rawData.ranges.map((r) => ({ ...r }))
      : [],
    origin: rawData.origin || 'selection',
    acquisitionMethod: rawData.acquisitionMethod || 'undefined',
    acquisitionParams: rawData.acquisitionParams ? { ...rawData.acquisitionParams } : {},
    color: rawData.color || generatePieceColor(id, existingColors),
    functionalLabel: rawData.functionalLabel != null ? rawData.functionalLabel : null,
    zoneId: null,
    // T7 DEC-T7-04 — index in the zone's assembled strip; null until
    // ATTACH_PIECE_TO_ASSEMBLY. Created free (palette).
    order: null,
    // T9 DEC-T9-01/02 — design-variant group ('vg-<uuid>' | null).
    // Set only by CREATE_DESIGN_VARIANT; a plain piece is not a variant.
    variantGroupId: null,
    derivedReactionId: null,
    frozen: false,
    // T4.5 DEC-T4.5-04 — drag-override flag for 3-lane auto-layout.
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * computePieceSize — Σ(range.end - range.start). Overlapping ranges on
 * the same source are NOT de-duplicated (biologically two amplicons).
 */
export function computePieceSize(piece) {
  const ranges = (piece && Array.isArray(piece.ranges)) ? piece.ranges : [];
  let n = 0;
  for (const r of ranges) {
    const len = (Number(r.end) || 0) - (Number(r.start) || 0);
    if (len > 0) n += len;
  }
  return n;
}

/**
 * clonePiece — deep copy with a fresh id + colour, cleared
 * derivedReactionId (the clone is not bound to the original's reaction),
 * "(копия)" name suffix, and refreshed timestamps. No validation.
 */
export function clonePiece(piece, overrides = {}) {
  const copy = JSON.parse(JSON.stringify(piece || {}));
  delete copy.frozenSequence; // a clone is a fresh editable copy
  const id = `pc-${uuidv7()}`;
  const now = Date.now();
  return {
    ...copy,
    id,
    name: overrides.name != null
      ? overrides.name
      : `${piece && piece.name ? piece.name : ''}${CLONE_SUFFIX}`,
    color: generatePieceColor(id),
    zoneId: overrides.zoneId !== undefined ? overrides.zoneId : (piece ? piece.zoneId : null),
    order: null, // T7 — a clone is a fresh free piece, not attached
    // T9 — a plain clone is not a variant; CREATE_DESIGN_VARIANT sets
    // variantGroupId explicitly after cloning.
    variantGroupId: overrides.variantGroupId !== undefined
      ? overrides.variantGroupId
      : null,
    derivedReactionId: null,
    frozen: false,
    // T4.5 DEC-T4.5-04 — drag-override flag for 3-lane auto-layout.
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * autoPieceName — default name for selection / migration pieces.
 * Format: '{containerName}({start}-{end})'.
 */
export function autoPieceName(container, range) {
  const name = (container && container.name) ? container.name : '';
  const start = range ? range.start : 0;
  const end = range ? range.end : 0;
  return `${name}(${start}-${end})`;
}
