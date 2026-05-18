/**
 * variant-resolver — T9 K4 (§5.4, DEC-T9-01/11). Pure helpers that
 * distinguish design variants (multiple pieces, shared variantGroupId)
 * from clone variants (one op, op.materializedClones) and derive the
 * finals branching kind for sequence-mode.
 */
import { selectFinalProductsInZone } from '../store/selectors-zones';

export function selectVariantGroup(state, variantGroupId) {
  if (!variantGroupId) return [];
  return ((state && state.pieces) || []).filter((p) => p.variantGroupId === variantGroupId);
}

export function selectMaterializedClones(state, opId) {
  const op = ((state && state.operations) || []).find((o) => o.id === opId);
  return (op && Array.isArray(op.materializedClones)) ? op.materializedClones : [];
}

/**
 * { index, total } of currentPieceId within its variant group (ordered
 * by createdAt). Formatting (i18n) is the badge's concern, not the
 * resolver's — deviation from spec's string-return for separation.
 */
export function variantGroupLabel(state, variantGroupId, currentPieceId) {
  const group = selectVariantGroup(state, variantGroupId)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const idx = group.findIndex((p) => p.id === currentPieceId);
  return { index: idx + 1, total: group.length };
}

/** 'clones' | 'design-variants' | 'independent' for a zone's finals. */
export function selectVariantKindForFinals(state, zoneId) {
  const finals = selectFinalProductsInZone(state, zoneId);
  if (!finals || finals.length <= 1) return 'independent';

  const ops = (state && state.operations) || [];
  const pieces = (state && state.pieces) || [];

  const parentOps = finals
    .map((c) => ops.find((op) => (
      (Array.isArray(op.outputs) && op.outputs.includes(c.id))
      || (Array.isArray(op.materializedClones)
        && op.materializedClones.some((cl) => cl.cloneId === c.id))
    )))
    .filter(Boolean);

  // All finals trace back to ONE op carrying matching materializedClones.
  if (parentOps.length === finals.length
    && parentOps.every((op) => op === parentOps[0])) {
    const mc = parentOps[0].materializedClones;
    if (Array.isArray(mc) && mc.length === finals.length) return 'clones';
  }

  // Finals from ops whose inputPieces all share ONE variantGroupId.
  const vgIds = parentOps
    .flatMap((op) => (op.inputPieces || []))
    .map((pid) => pieces.find((p) => p.id === pid))
    .filter(Boolean)
    .map((p) => p.variantGroupId)
    .filter(Boolean);
  if (vgIds.length >= 2 && new Set(vgIds).size === 1) return 'design-variants';

  return 'independent';
}
