/**
 * custom-enzymes.js (RS-C1) — pure model for user-defined restriction enzymes
 * + named enzyme sets («наборы рестриктаз»).
 *
 * A custom enzyme is normalised into the SAME shape as restriction-db.js
 * RE_ENZYMES ({ site, cut:[fwd,rev], end, overhang, temp, buffer, ... }) so the
 * scan/digest engine (RS-C2) can merge it over the 63 built-ins transparently.
 *
 * Bio-invariant (bio-invariants skill, Rule 1): this is Type II ONLY. Custom
 * enzymes NEVER mix with Golden Gate (Type IIS, golden-gate.js). The model here
 * has no awareness of GG and must not gain any.
 */
import { RE_ENZYMES } from '../restriction-db.js';

// IUPAC nucleotide alphabet accepted in a recognition site.
const IUPAC_RE = /^[ACGTRYMKSWHBVDN]+$/;

/**
 * Derive {end, overhang} from a recognition site + cut positions.
 *  - cut [fwd, rev] are 0-based offsets from the 5′ end of the site.
 *  - fwd < rev → 5′ overhang (top strand cut left of bottom strand cut).
 *  - fwd > rev → 3′ overhang.
 *  - fwd === rev → blunt (overhang null).
 * The overhang sequence is the top-strand bases between the two cuts
 * (site.slice(lo, hi)) — matches the RE_ENZYMES convention.
 * @param {string} site uppercase recognition site
 * @param {[number, number]} cut
 * @returns {{ end: '5prime'|'3prime'|'blunt', overhang: string|null }}
 */
export function deriveEndOverhang(site, cut) {
  const [fwd, rev] = cut;
  if (fwd === rev) return { end: 'blunt', overhang: null };
  const lo = Math.min(fwd, rev);
  const hi = Math.max(fwd, rev);
  const overhang = String(site || '').slice(lo, hi) || null;
  return { end: fwd < rev ? '5prime' : '3prime', overhang };
}

/**
 * Validate a custom-enzyme payload BEFORE normalisation.
 * @param {{name, site, cut}} payload
 * @returns {{ ok: boolean, errors: Array<{field, message}> }}
 */
export function validateCustomEnzyme(payload) {
  const errors = [];
  const p = payload || {};
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name) errors.push({ field: 'name', message: 'Имя обязательно' });

  const site = typeof p.site === 'string' ? p.site.trim().toUpperCase() : '';
  if (!site || site.length < 2) {
    errors.push({ field: 'site', message: 'Сайт узнавания — минимум 2 нт' });
  } else if (!IUPAC_RE.test(site)) {
    errors.push({ field: 'site', message: 'Сайт содержит недопустимые символы (только IUPAC: ACGT RYMKSW HBVDN)' });
  }

  const cut = p.cut;
  const siteLen = site.length;
  if (!Array.isArray(cut) || cut.length !== 2) {
    errors.push({ field: 'cut', message: 'Позиции реза — два числа [верх, низ]' });
  } else {
    for (const c of cut) {
      if (!Number.isInteger(c) || c < 0 || (siteLen > 0 && c > siteLen)) {
        errors.push({ field: 'cut', message: `Позиция реза должна быть целым числом в [0, ${siteLen || 'длина сайта'}]` });
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Normalise a custom-enzyme payload into an RE_ENZYMES-shaped record. Fills
 * end/overhang (derived from site+cut unless explicitly given) and sensible
 * defaults; stamps `isCustom: true`. Pass {id, createdAt} for the stored record.
 * @param {object} payload
 * @param {{ id?: string, createdAt?: string }} [meta]
 * @returns {object} enzyme record
 */
export function normalizeCustomEnzyme(payload, meta = {}) {
  const p = payload || {};
  const name = (typeof p.name === 'string' ? p.name : '').trim();
  const site = (typeof p.site === 'string' ? p.site : '').trim().toUpperCase();
  const cut = Array.isArray(p.cut) ? [Number(p.cut[0]) | 0, Number(p.cut[1]) | 0] : [0, 0];
  const derived = deriveEndOverhang(site, cut);
  const rec = {
    name,
    site,
    cut,
    end: p.end || derived.end,
    overhang: p.overhang !== undefined ? p.overhang : derived.overhang,
    temp: typeof p.temp === 'number' ? p.temp : 37,
    buffer: p.buffer || 'CutSmart',
    supplier: p.supplier || 'custom',
    isoschizomers: Array.isArray(p.isoschizomers) ? p.isoschizomers : [],
    neoschizomers: Array.isArray(p.neoschizomers) ? p.neoschizomers : [],
    minFlanking: typeof p.minFlanking === 'number' ? p.minFlanking : 2,
    damSensitive: !!p.damSensitive,
    dcmSensitive: !!p.dcmSensitive,
    isCustom: true,
  };
  if (meta.id != null) rec.id = meta.id;
  if (meta.createdAt != null) rec.createdAt = meta.createdAt;
  return rec;
}

// Methylation-dependent enzymes — excluded from supplier cloning sets (they're
// not used to cut a target for cloning the way classical RE are).
const METHYLATION_ONLY = new Set(['DpnI', 'DpnII', 'MboI']);

// Supplier presets are DATA-DRIVEN from the REBASE supplier codes carried on each
// enzyme (`suppliers: [...]`): code 'N' = New England Biolabs, 'B' = Thermo Fisher
// Scientific (REBASE legend). So «NEB» / «Thermo» = exactly the enzymes those
// suppliers sell, per REBASE — always accurate to the catalog.
const bySupplierCode = (code) => Object.keys(RE_ENZYMES)
  .filter((n) => Array.isArray(RE_ENZYMES[n].suppliers)
    && RE_ENZYMES[n].suppliers.includes(code) && !METHYLATION_ONLY.has(n))
  .sort((a, b) => a.localeCompare(b));
const NEB_ENZYMES = bySupplierCode('N');
const THERMO_ENZYMES = bySupplierCode('B');

/**
 * Built-in preset enzyme sets. Members are all real RE_ENZYMES keys (Type II).
 * Presets are code constants — not persisted; the store's selector merges them
 * with the user's Dexie-backed sets. Supplier presets (NEB / Thermo) let the
 * biolog filter to «what I can actually buy / have in the freezer» (Игорь 22.06).
 */
export const BUILTIN_ENZYME_SETS = [
  {
    id: 'preset:frequent',
    name: 'Частые рестриктазы',
    isPreset: true,
    enzymes: ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'SalI', 'NotI', 'NcoI', 'XbaI', 'KpnI', 'SacI'],
  },
  {
    id: 'preset:mcs-puc19',
    name: 'MCS pUC19',
    isPreset: true,
    enzymes: ['EcoRI', 'SacI', 'KpnI', 'SmaI', 'BamHI', 'XbaI', 'SalI', 'HincII', 'PstI', 'SphI', 'HindIII'],
  },
  {
    id: 'preset:neb',
    name: 'NEB',
    isPreset: true,
    enzymes: NEB_ENZYMES,
  },
  {
    id: 'preset:thermo',
    name: 'Thermo Scientific',
    isPreset: true,
    enzymes: THERMO_ENZYMES,
  },
];

/**
 * Merge custom enzymes (keyed by store id) OVER the 63 built-ins, re-keyed by
 * enzyme NAME (the scan engine's lookup key). A custom enzyme whose name matches
 * a built-in overrides it (last-write-wins, like the common-features overlay).
 * @param {Record<string, object>|null} customById
 * @returns {Record<string, object>} merged enzyme dict
 */
export function mergeREEnzymes(customById) {
  if (!customById) return { ...RE_ENZYMES };
  const merged = { ...RE_ENZYMES };
  for (const rec of Object.values(customById)) {
    if (rec && rec.name) merged[rec.name] = rec;
  }
  return merged;
}

/**
 * Resolve an enzyme set to the enzyme names that actually exist in the merged
 * dict (drops members that reference a deleted/unknown enzyme).
 * @param {{ enzymes: string[] }} set
 * @param {Record<string, object>} mergedEnzymes
 * @returns {string[]}
 */
export function resolveEnzymeSet(set, mergedEnzymes) {
  const names = set && Array.isArray(set.enzymes) ? set.enzymes : [];
  return names.filter((n) => mergedEnzymes && mergedEnzymes[n]);
}
