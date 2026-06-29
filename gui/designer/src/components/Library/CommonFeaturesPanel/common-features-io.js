/**
 * common-features-io — FEAT-CF-SHARE (gap-research): export/import the user's
 * curated common-features overlay (net-new userFeatures + factory overrides) as a
 * portable JSON set. The overlay lives only in this browser's Dexie and is lost on
 * the v0.6 data-wipe (⚓ DEC-V2-08), so this is the lab's backup + sharing path
 * (Benchling/SnapGene both distribute feature libraries).
 *
 * Pure (headless-testable): no Dexie, no DOM, no Date inside serialize so output
 * is deterministic for tests — the caller stamps `exportedAt` if it wants one.
 */

const FORMAT = 'bodgegene-common-features';
const VERSION = 1;

/** Keep only the portable fields of a feature record (drop Dexie/runtime cruft). */
function pickFeature(r) {
  const out = { name: r.name || '(unnamed)', type: r.type || 'misc_feature' };
  if (r.sequence) out.sequence = r.sequence;
  if (r.protein) out.protein = r.protein;
  return out;
}
function pickOverride(r) {
  const out = pickFeature(r);
  out.baseId = r.baseId || r.id;
  return out;
}

/**
 * @param {{userFeatures?:object, overrides?:object}} overlay — the store's
 *   `commonFeatures` slice (id-keyed maps).
 * @param {{exportedAt?:string}} [meta]
 * @returns {string} pretty JSON.
 */
export function serializeCommonFeatures(overlay, meta = {}) {
  const o = overlay || {};
  const userFeatures = Object.values(o.userFeatures || {}).map(pickFeature);
  const overrides = Object.values(o.overrides || {}).map(pickOverride);
  const doc = { format: FORMAT, version: VERSION, userFeatures, overrides };
  if (meta.exportedAt) doc.exportedAt = meta.exportedAt;
  return JSON.stringify(doc, null, 2);
}

/**
 * Parse + validate an exported set. Lenient: accepts a bare array of features
 * (treated as userFeatures) and tolerates a missing `overrides`. A feature must
 * carry a non-empty name AND at least one of sequence/protein, else it is dropped.
 *
 * @returns {{ok:boolean, userFeatures:Array, overrides:Array, error?:string}}
 */
export function parseCommonFeatures(text) {
  let doc;
  try {
    doc = JSON.parse(String(text || ''));
  } catch {
    return { ok: false, userFeatures: [], overrides: [], error: 'Не JSON' };
  }
  // Bare array → treat as userFeatures.
  const rawUsers = Array.isArray(doc) ? doc : (Array.isArray(doc.userFeatures) ? doc.userFeatures : []);
  const rawOverrides = (!Array.isArray(doc) && Array.isArray(doc.overrides)) ? doc.overrides : [];
  if (!Array.isArray(doc) && doc.format && doc.format !== FORMAT) {
    return { ok: false, userFeatures: [], overrides: [], error: 'Чужой формат файла' };
  }

  const validFeature = (r) => r && typeof r === 'object'
    && typeof r.name === 'string' && r.name.trim().length > 0
    && (typeof r.sequence === 'string' || typeof r.protein === 'string');

  const userFeatures = rawUsers.filter(validFeature).map(pickFeature);
  const overrides = rawOverrides
    .filter((r) => validFeature(r) && (r.baseId || r.id))
    .map(pickOverride);

  if (userFeatures.length === 0 && overrides.length === 0) {
    return { ok: false, userFeatures, overrides, error: 'Нет валидных фич в файле' };
  }
  return { ok: true, userFeatures, overrides };
}
