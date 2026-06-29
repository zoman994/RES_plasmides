/**
 * feature-palette.js — biological feature palette for Map view + SequencePane.
 *
 * Two-layer color contract (M-B.2 follow-up after palette review 02.05.2026):
 *   - `featureColor(type, name)` — base hex for the type-family (back-compat;
 *     consumers like AnnotationEditor / FileSummaryCard / SequencePane chips
 *     where shade-variation would be visual noise).
 *   - `featureColorShaded(type, name)` — base + deterministic shade-by-name
 *     (lightness ±20%, hue ±18°, saturation ±20%) AFTER mapping the name
 *     through `canonicalFeatureKey()`. Plasmid-arc consumers (PlasmidMap,
 *     PlasmidMiniMap) use this so multiple CDS / promoters / resistance
 *     markers on the same plasmid don't collapse into one shade.
 *
 * Why canonical-key first: AmpR / ApR / β-lactamase / TEM-1 are all the
 * same gene (bla); biolog expects a single shade across synonyms. The hash
 * runs on the canonical key, not the raw name — so AmpR and bla render
 * identical, but AmpR and KanR render distinct.
 *
 * Stroke `#3A2F1F` (warm sepia) shared across all features.
 *
 * Palette base values are the Игорь-approved «warm sepia + 4 fixes» set:
 *   resistance #9BC07C → #D9836B (coral, out of green cluster)
 *   promoter   #F2C84B → #FFC400 (saturated amber, away from ori)
 *   CDS        #C8D570 → #B0C84A (brighter)
 *   reporter   #7CB49E → #5DA5C4 (sky-cyan, last green in CDS only)
 */

export const FEATURE_STROKE = '#3A2F1F';

export const FEATURE_COLORS_V2 = {
  promoter:    '#FFC400',
  ori:         '#E8B333',
  terminator:  '#D97B3B',
  CDS:         '#B0C84A',
  resistance:  '#D9836B',
  reporter:    '#5DA5C4',
  LTR:         '#ECB383',
  enhancer:    '#F2CDA9',
  signal:      '#B8AA8A',
  tag:         '#E091A2',
  his:         '#B884B8',
  linker:      '#C4B8A8',
  primer_bind: '#9EBAD9',
  operator:    '#6DA4C4',
  cap:         '#A5CFD5',
  // Detail / protein-feature types (fungal-gene annotation). These are the
  // canonical types normalizeDetailType emits; without dedicated hexes they all
  // fell through to misc (ivory), so a multi-intron / multi-domain fungal gene
  // rendered visually flat. Distinct, palette-coherent hues so introns recede and
  // signal/propeptide/domain/active-site read apart at a glance.
  intron:         '#AEB6BE', // muted slate — recedes vs exons
  signal_peptide: '#B8AA8A', // tan (matches the generic «signal»)
  transit_peptide:'#A89878', // darker tan sibling
  propeptide:     '#C9A0C9', // light mauve
  mat_peptide:    '#9FB88F', // sage — the mature chain
  domain:         '#8FB0C4', // slate blue
  motif:          '#C4A8D9', // lavender
  active_site:    '#E0A020', // gold — catalytic
  binding:        '#7FA8C9', // steel blue
  disulfide_bond: '#B8B8B8', // silver
  core_promoter:  '#FFD480', // light amber — promoter sibling
  poly_a:         '#D9B38C', // tan
  regulatory:     '#E0C060', // muted gold
  stem_loop:      '#A0C0B0', // teal-green
  misc:        '#EEE7D5',
};

const TYPE_ALIASES = {
  promotor: 'promoter',
  rep_origin: 'ori',
  terminator_region: 'terminator',
  sig_peptide: 'signal',
  polya_signal: 'signal',
  rbs: 'signal',
  primer_binding_site: 'primer_bind',
  ltr: 'LTR',
  long_terminal_repeat: 'LTR',
  rre: 'enhancer',
};

// Order matters — resistance before reporter, both before generic CDS.
// Patterns cover both common shorthand (AmpR, KanR) and canonical gene
// names (bla, aphA, cat) so featureColor + featureColorShaded land on the
// same base hex for synonyms — a precondition for «AmpR ≡ bla» shade.
const RESISTANCE_RE = /^(amp|kan|cm|hyg|neo|puro|bleo|tet|zeo|spec|sm)r?\b|^(bla|cat|hph|pac|ble|sh\s*ble|aphA?|nptII?)\b|^TEM-?1\b|β-?lactamase|chloramphenicol\s*acetyl/i;
const REPORTER_RE = /\b(EGFP|sfGFP|GFP|GFPmut|GFPuv|mCherry|mKate2?|mPlum|EYFP|YFP|Venus|ECFP|CFP|Cerulean|BFP|mTagBFP|RFP|dsRed|luciferase|luc|lacZ[αa]?|β-gal)\b/i;
const HIS_RE = /\b(6[×x]?\s*His|His[6-9]?\s*tag|HIS[- ]?tag|GST|MBP|SUMO|Halo|Strep[- _]?tag|StrepII)\b|^His[6-9]?$/i;
const TAG_RE = /\b(3[×x]?FLAG|FLAG|HA[-_]?tag|Myc|V5|T7[-_]?tag)\b/i;
const LINKER_RE = /\b(GS[- _]?linker|GGGGS|linker|TEV|PreScission|T2A|P2A|NLS)\b/i;

const CAP_NAME_RE = /\b(CAP|CRP|GATA)\b/i;

/**
 * Map a feature annotation (type + optional name) to its base palette hex.
 * No shade variation. Use `featureColorShaded` for per-name shade.
 *
 * @param {string|undefined|null} type — annotation.type (may be aliased)
 * @param {string} [name] — annotation.name, used to refine generic CDS/gene
 * @returns {string} hex color from FEATURE_COLORS_V2 (never gray)
 */
export function featureColor(type, name) {
  const t = typeof type === 'string' ? type : '';
  const n = typeof name === 'string' ? name : '';

  // 1. Direct key hit (CDS, gene handled below).
  if (t && FEATURE_COLORS_V2[t] && t !== 'CDS' && t !== 'gene') {
    return FEATURE_COLORS_V2[t];
  }

  // 2. `protein_bind` special-case: CAP/CRP/GATA → cap (cyan), otherwise operator (blue).
  if (t === 'protein_bind' || t === 'CAP_binding_site') {
    return CAP_NAME_RE.test(n) ? FEATURE_COLORS_V2.cap : FEATURE_COLORS_V2.operator;
  }

  // 3. Aliases (case-insensitive lookup).
  if (t) {
    const alias = TYPE_ALIASES[t.toLowerCase()];
    if (alias) return FEATURE_COLORS_V2[alias];
  }

  // 4. CDS / gene → refine by name.
  if (t === 'CDS' || t === 'gene') {
    if (HIS_RE.test(n)) return FEATURE_COLORS_V2.his;
    if (TAG_RE.test(n)) return FEATURE_COLORS_V2.tag;
    if (RESISTANCE_RE.test(n)) return FEATURE_COLORS_V2.resistance;
    if (REPORTER_RE.test(n)) return FEATURE_COLORS_V2.reporter;
    if (LINKER_RE.test(n)) return FEATURE_COLORS_V2.linker;
    return FEATURE_COLORS_V2.CDS;
  }

  // 5. Explicit misc / unknown → misc (ivory).
  if (!t || t === 'misc_feature' || t === 'unknown') return FEATURE_COLORS_V2.misc;

  return FEATURE_COLORS_V2.misc;
}

// ─── Canonical-key table — common plasmid biology synonyms ────────────
// Each entry: regex matches name → canonical key. Used by featureColorShaded
// so AmpR / ApR / bla / TEM-1 all hash to the same shade (one underlying
// gene). Order matters — first match wins. Keep this list curated, not
// exhaustive: ~30 most-common features cover SnapGene catalog + lab-built
// vectors. Truly unknown names fall through to raw-name hashing.
const CANONICAL_FEATURE_KEYS = [
  // ─ Resistance markers (β-lactamase / aminoglycoside / etc.) ─
  { canonical: 'bla',    re: /^(amp|ap)r?\b|^bla\b|β-?lactamase|beta-?lactamase|TEM-?1/i },
  { canonical: 'nptII',  re: /^(kan|neo|npt)r?\b|^aphA?\b|^nptII?\b|aminoglycoside.*phospho/i },
  { canonical: 'cat',    re: /^cm[rR]?\b|^cat\b|chloramphenicol\s*acetyl/i },
  { canonical: 'hph',    re: /^(hyg|hph)r?\b/i },
  { canonical: 'pac',    re: /^(puro|pac)r?\b/i },
  { canonical: 'ble',    re: /^(zeo|bleo|ble|sh\s*ble)r?\b/i },
  { canonical: 'tetA',   re: /^(tet|tcr|tetA)r?\b/i },
  { canonical: 'specR',  re: /^(spec|smr?)\b|spectinomycin/i },

  // ─ Promoters ─
  { canonical: 'lac_p',   re: /\b(lac\s*(promoter|p)|P_?lac|lacP)\b/i },
  { canonical: 'T7_p',    re: /\bT7\s*(promoter|p)\b|P_?T7\b/i },
  { canonical: 'T3_p',    re: /\bT3\s*(promoter|p)\b/i },
  { canonical: 'SP6_p',   re: /\bSP6\s*(promoter|p)\b/i },
  { canonical: 'CMV_p',   re: /\b(CMV|hCMV)\s*(promoter|p)?\b|immediate.*early.*CMV/i },
  { canonical: 'EF1a_p',  re: /\bEF1[aα]?(?:-?alpha)?\b/i },
  { canonical: 'BAD_p',   re: /\b(pBAD|P_?BAD|araBAD)\b/i },
  { canonical: 'tac_p',   re: /\b(tac|trc)\s*(promoter|p)?\b/i },
  { canonical: 'SV40_p',  re: /\bSV40\s*(promoter|p|early)?\b/i },
  { canonical: 'PGK_p',   re: /\b(PGK|hPGK)\s*(promoter|p)?\b/i },

  // ─ Origins of replication ─
  { canonical: 'pMB1',    re: /\b(pUC\s*ori|ColE1|pMB1|pBR322\s*ori)\b/i },
  { canonical: 'p15A',    re: /\bp15A\b/i },
  { canonical: 'f1_ori',  re: /\bf1\s*(ori|origin|\(\+\)|\(-\))\b|^F1\b/i },
  { canonical: '2mu',     re: /\b2[μu]\b|\b2-?micron\b/i },
  { canonical: 'oriT',    re: /\boriT\b/i },
  { canonical: 'SV40_ori',re: /\bSV40\s*ori\b/i },

  // ─ Tags ─
  { canonical: 'his6',    re: /\b6[×x]?\s*His\b|\bHis[6-9]\b|His[6-9]?\s*tag|HIS[- ]?tag|^His[6-9]?$/i },
  { canonical: 'flag',    re: /\b3?[×x]?FLAG\b/i },
  { canonical: 'ha_tag',  re: /\bHA[-_]?tag\b/i },
  { canonical: 'myc_tag', re: /\b[cn]?-?Myc\b/i },
  { canonical: 'v5_tag',  re: /\bV5\b/i },
  { canonical: 'strep_tag', re: /\bStrep[- _]?tag\b|StrepII/i },
  { canonical: 'gst_tag', re: /\bGST\b/i },
  { canonical: 'mbp_tag', re: /\bMBP\b/i },
  { canonical: 'sumo',    re: /\bSUMO\b/i },
  { canonical: 'halo',    re: /\bHalo\b/i },

  // ─ Reporters / fluorescent proteins ─
  { canonical: 'gfp',     re: /\bE?GFP\b|GFPmut|GFPuv/i },
  { canonical: 'sfgfp',   re: /\bsfGFP\b/i },
  { canonical: 'mcherry', re: /\bmCherry\b/i },
  { canonical: 'mplum',   re: /\bmPlum\b/i },
  { canonical: 'mkate',   re: /\bmKate2?\b/i },
  { canonical: 'dsred',   re: /\bdsRed\b/i },
  { canonical: 'rfp',     re: /\bRFP\b/i },
  { canonical: 'yfp',     re: /\bE?YFP\b|Venus\b/i },
  { canonical: 'cfp',     re: /\bE?CFP\b|Cerulean/i },
  { canonical: 'bfp',     re: /\bBFP\b|mTagBFP/i },
  { canonical: 'lacz',    re: /\blacZ[αa]?\b/i },
  { canonical: 'luc',     re: /\bluciferase\b|^luc\b/i },

  // ─ Linkers / cleavage ─
  { canonical: 'gs_linker', re: /\bGS\s*linker\b|GGGGS/i },
  { canonical: 'tev_site',  re: /\bTEV\s*(site|protease)?\b/i },
  { canonical: 'prescission', re: /\bPreScission\b/i },
  { canonical: 't2a',     re: /\bT2A\b/i },
  { canonical: 'p2a',     re: /\bP2A\b/i },
  { canonical: 'nls',     re: /\bNLS\b/i },
];

/**
 * Map a feature name to its canonical key (one underlying gene/element).
 * Returns `null` if no entry matches — caller should fall back to raw
 * name so unknown features still get deterministic shades.
 *
 * @param {string} [name]
 * @returns {string|null}
 */
export function canonicalFeatureKey(name) {
  if (!name || typeof name !== 'string') return null;
  for (const entry of CANONICAL_FEATURE_KEYS) {
    if (entry.re.test(name)) return entry.canonical;
  }
  return null;
}

// ─── HSL math + name → shade ──────────────────────────────────────────
// Lightweight; no external dep. Hash is FNV-ish DJB2.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hexToHsl(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  const r = parseInt(m[0], 16) / 255;
  const g = parseInt(m[1], 16) / 255;
  const b = parseInt(m[2], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
      default: h = 0;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  const sN = s / 100, lN = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n) => {
    const c = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Deterministic shade variant of a base hex, keyed by `name`. Same name
 * always produces the same shade. Spread: lightness ±10%, hue ±6° —
 * subtle but visible. Saturation is preserved (no modulation) so the
 * family stays cohesive. Strong enough to tell AmpR from KanR, narrow
 * enough that biolog still reads «family of resistance markers» at a
 * glance.
 *
 * @param {string} baseHex — palette base (e.g. FEATURE_COLORS_V2.CDS)
 * @param {string} [name] — feature name (already canonicalized by caller, or raw)
 * @returns {string} hex
 */
export function shadeFromName(baseHex, name) {
  if (!name) return baseHex;
  const hash = hashStr(name);
  const lOffset = ((hash % 1000) / 1000 - 0.5) * 20;            // -10..+10
  const hOffset = (((hash >> 10) % 1000) / 1000 - 0.5) * 12;    // -6..+6
  const [h, s, l] = hexToHsl(baseHex);
  const nh = (h + hOffset + 360) % 360;
  const nl = Math.max(25, Math.min(78, l + lOffset));
  return hslToHex(nh, s, nl);
}

/**
 * Like `featureColor`, but applies `shadeFromName` keyed by
 * `canonicalFeatureKey(name) ?? name`. Use in plasmid-arc consumers
 * (PlasmidMap, PlasmidMiniMap) where multiple same-type features need
 * to be visually distinct without breaking the hue family.
 *
 * @param {string|undefined|null} type
 * @param {string} [name]
 * @returns {string} hex
 */
export function featureColorShaded(type, name) {
  const base = featureColor(type, name);
  if (!name) return base;
  const key = canonicalFeatureKey(name) ?? name;
  return shadeFromName(base, key);
}
