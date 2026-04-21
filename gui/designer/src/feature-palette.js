/**
 * feature-palette.js — biological feature palette for Map view + SequencePane.
 *
 * Reference: `design_teasers/feature_palette.html`. Colors are desaturated for
 * paper-background rendering and share a single warm-dark stroke `#3A2F1F`.
 *
 * Scope (Sprint Map-WS-1-fix):
 *   - Applied only in PlasmidMap sub-arc fills + SequencePane region chips/strands.
 *   - NOT wired into theme.js / AnnotationEditor / PartBlock / PlasmidViewer yet
 *     — global UI refresh lands in Sprint UX-1 after Map-WS-4.
 *
 * The `featureColor(type, name?)` normalizer accepts GenBank aliases and refines
 * generic CDS/gene entries to resistance/reporter/tag/linker/his via a name
 * regex. Fallback is always `misc` (ivory) — never gray.
 */

export const FEATURE_STROKE = '#3A2F1F';

export const FEATURE_COLORS_V2 = {
  promoter:    '#F2C84B',
  ori:         '#E8B333',
  terminator:  '#D97B3B',
  CDS:         '#C8D570',
  resistance:  '#9BC07C',
  reporter:    '#7CB49E',
  LTR:         '#ECB383',
  enhancer:    '#F2CDA9',
  signal:      '#B8AA8A',
  tag:         '#E091A2',
  his:         '#B884B8',
  linker:      '#C4B8A8',
  primer_bind: '#9EBAD9',
  operator:    '#6DA4C4',
  cap:         '#A5CFD5',
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
const RESISTANCE_RE = /^(amp|kan|cm|hyg|neo|puro|bleo|tet|zeo|spec)r?\b/i;
const REPORTER_RE = /\b(GFP|mCherry|mKate|mPlum|YFP|CFP|BFP|RFP|dsRed|luciferase|luc|lacZ|lacZα|β-gal)\b/i;
const HIS_RE = /\b(6[×x]?His|HIS[- ]?tag|GST|MBP|SUMO|Halo|Strep[- _]?tag)\b/i;
const TAG_RE = /\b(3[×x]?FLAG|FLAG|HA[-_]?tag|Myc|V5|T7[-_]?tag)\b/i;
const LINKER_RE = /\b(GS[-_]?linker|linker|TEV|PreScission)\b/i;

const CAP_NAME_RE = /\b(CAP|CRP|GATA)\b/i;

/**
 * Map a feature annotation (type + optional name) to a palette hex color.
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
