/**
 * restriction-db.js — Classical restriction enzyme database.
 *
 * Contains commercially available Type II restriction enzymes (NOT Type IIS).
 * Type IIS enzymes (BsaI, BpiI, BsmBI, BtgZI, SapI) live in golden-gate.js.
 *
 * Each entry: { site, cut: [fwd, rev], end, overhang, temp, buffer,
 *               isoschizomers: [], neoschizomers: [], supplier }
 *
 * cut: [fwd, rev] — cut positions from 5' end of recognition site
 *   fwd = cut on top strand, rev = cut on bottom strand (counted from left of site)
 *   Example: EcoRI GAATTC cut [1,5] → G|AATTC / CTTAA|G → 5' overhang AATT
 *
 * end: '5prime' | '3prime' | 'blunt'
 * overhang: the single-strand overhang sequence (null for blunt)
 */

import { RE_ENZYMES_REBASE } from './restriction-db-rebase.js';

// Curated, richly-annotated common enzymes (temp / buffer / isoschizomers / dam·dcm
// — hand-maintained NEB values). Merged UNDER the full REBASE commercial catalog
// (see below): REBASE gives breadth (~459) + supplier codes, these 62 override
// with lab metadata. The export `RE_ENZYMES` is the merged result.
const RE_ENZYMES_CURATED = {
  // ═══════════════════════════════════════════════════════
  // 6-cutters
  // ═══════════════════════════════════════════════════════
  EcoRI:   { site: 'GAATTC',  cut: [1, 5], end: '5prime', overhang: 'AATT', temp: 37, buffer: 'CutSmart', isoschizomers: ['Eco831I', 'SsoI'], neoschizomers: [], supplier: 'NEB', minFlanking: 1, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  BamHI:   { site: 'GGATCC',  cut: [1, 5], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'CutSmart', isoschizomers: ['BstI'], neoschizomers: [], supplier: 'NEB', minFlanking: 4, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  HindIII: { site: 'AAGCTT',  cut: [1, 5], end: '5prime', overhang: 'AGCT', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '80°C/20min' },
  XbaI:    { site: 'TCTAGA',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: true, dcmSensitive: false, heatInactivation: '65°C/20min' },
  XhoI:    { site: 'CTCGAG',  cut: [1, 5], end: '5prime', overhang: 'TCGA', temp: 37, buffer: 'CutSmart', isoschizomers: ['PaeR7I'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SalI:    { site: 'GTCGAC',  cut: [1, 5], end: '5prime', overhang: 'TCGA', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  NcoI:    { site: 'CCATGG',  cut: [1, 5], end: '5prime', overhang: 'CATG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  NdeI:    { site: 'CATATG',  cut: [2, 4], end: '5prime', overhang: 'TA',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PstI:    { site: 'CTGCAG',  cut: [5, 1], end: '3prime', overhang: 'TGCA', temp: 37, buffer: 'CutSmart', isoschizomers: ['BspMAI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '80°C/20min' },
  SphI:    { site: 'GCATGC',  cut: [5, 1], end: '3prime', overhang: 'CATG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  KpnI:    { site: 'GGTACC',  cut: [5, 1], end: '3prime', overhang: 'GTAC', temp: 37, buffer: 'CutSmart', isoschizomers: ['Asp718I'], neoschizomers: [], supplier: 'NEB', minFlanking: 4, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SacI:    { site: 'GAGCTC',  cut: [5, 1], end: '3prime', overhang: 'AGCT', temp: 37, buffer: 'CutSmart', isoschizomers: ['Ecl136II'], neoschizomers: ['Eco53kI'], supplier: 'NEB', minFlanking: 4, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  NheI:    { site: 'GCTAGC',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  BglII:   { site: 'AGATCT',  cut: [1, 5], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'NEBuffer 3.1', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  ClaI:    { site: 'ATCGAT',  cut: [2, 4], end: '5prime', overhang: 'CG',   temp: 37, buffer: 'CutSmart', isoschizomers: ['BspDI', 'BanIII'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: true, dcmSensitive: false, heatInactivation: '65°C/20min' },
  MfeI:    { site: 'CAATTG',  cut: [1, 5], end: '5prime', overhang: 'AATT', temp: 37, buffer: 'CutSmart', isoschizomers: ['MunI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  AgeI:    { site: 'ACCGGT',  cut: [1, 5], end: '5prime', overhang: 'CCGG', temp: 37, buffer: 'CutSmart', isoschizomers: ['PinAI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SpeI:    { site: 'ACTAGT',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  AvrII:   { site: 'CCTAGG',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: ['BlnI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  BclI:    { site: 'TGATCA',  cut: [1, 5], end: '5prime', overhang: 'GATC', temp: 50, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: true, dcmSensitive: false, heatInactivation: '65°C/20min' },
  MluI:    { site: 'ACGCGT',  cut: [1, 5], end: '5prime', overhang: 'CGCG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  NruI:    { site: 'TCGCGA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  ScaI:    { site: 'AGTACT',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 1, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  AflII:   { site: 'CTTAAG',  cut: [1, 5], end: '5prime', overhang: 'TTAA', temp: 37, buffer: 'CutSmart', isoschizomers: ['BfrI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  ApaI:    { site: 'GGGCCC',  cut: [5, 1], end: '3prime', overhang: 'GGCC', temp: 25, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  BspEI:   { site: 'TCCGGA',  cut: [1, 5], end: '5prime', overhang: 'CCGG', temp: 37, buffer: 'CutSmart', isoschizomers: ['Kpn2I', 'BsuEII'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  BsrGI:   { site: 'TGTACA',  cut: [1, 5], end: '5prime', overhang: 'GTAC', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  BstBI:   { site: 'TTCGAA',  cut: [2, 4], end: '5prime', overhang: 'CG',   temp: 65, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: 'none' },
  BstEII:  { site: 'GGTNACC', cut: [1, 6], end: '5prime', overhang: 'GTNAC', temp: 60, buffer: 'NEBuffer 3.1', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: 'none' },
  DraI:    { site: 'TTTAAA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  EagI:    { site: 'CGGCCG',  cut: [1, 5], end: '5prime', overhang: 'GGCC', temp: 37, buffer: 'CutSmart', isoschizomers: ['EclXI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  Eco53kI: { site: 'GAGCTC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['SacI'], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  EcoNI:   { site: 'CCTNNNNNAGG', cut: [5, 6], end: '5prime', overhang: null, temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  EcoRV:   { site: 'GATATC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 1, damSensitive: false, dcmSensitive: false, heatInactivation: '80°C/20min' },
  HincII:  { site: 'GTYRAC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: ['HindII'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  HpaI:    { site: 'GTTAAC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 1, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  MscI:    { site: 'TGGCCA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: ['BalI'], neoschizomers: [], supplier: 'NEB', minFlanking: 1, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  NarI:    { site: 'GGCGCC',  cut: [2, 4], end: '5prime', overhang: 'CG',   temp: 37, buffer: 'CutSmart', isoschizomers: ['KasI', 'SfoI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PmlI:    { site: 'CACGTG',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PpuMI:   { site: 'RGGWCCY', cut: [2, 5], end: '5prime', overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PvuI:    { site: 'CGATCG',  cut: [4, 2], end: '3prime', overhang: 'AT',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PvuII:   { site: 'CAGCTG',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SacII:   { site: 'CCGCGG',  cut: [4, 2], end: '3prime', overhang: 'GC',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SmaI:    { site: 'CCCGGG',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 25, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['XmaI'], supplier: 'NEB', minFlanking: 4, damSensitive: false, dcmSensitive: true, heatInactivation: 'none' },
  SnaBI:   { site: 'TACGTA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  StuI:    { site: 'AGGCCT',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  StyI:    { site: 'CCWWGG',  cut: [1, 5], end: '5prime', overhang: 'CWWG', temp: 37, buffer: 'NEBuffer 3.1', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  XmaI:    { site: 'CCCGGG',  cut: [1, 5], end: '5prime', overhang: 'CCGG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['SmaI'], supplier: 'NEB', minFlanking: 4, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  XmnI:    { site: 'GAANNNNTTC', cut: [5, 5], end: 'blunt', overhang: null, temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },

  // ═══════════════════════════════════════════════════════
  // 8-cutters (rare cutters)
  // ═══════════════════════════════════════════════════════
  NotI:    { site: 'GCGGCCGC',       cut: [2, 6], end: '5prime', overhang: 'GGCC',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 6, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  AscI:    { site: 'GGCGCGCC',       cut: [2, 6], end: '5prime', overhang: 'CGCG',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 0, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  FseI:    { site: 'GGCCGGCC',       cut: [6, 2], end: '3prime', overhang: 'CCGG',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 6, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PacI:    { site: 'TTAATTAA',       cut: [5, 3], end: '3prime', overhang: 'AT',     temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 6, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SbfI:    { site: 'CCTGCAGG',       cut: [6, 2], end: '3prime', overhang: 'TGCA',   temp: 37, buffer: 'CutSmart', isoschizomers: ['Sse8387I'], neoschizomers: [], supplier: 'NEB', minFlanking: 6, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SwaI:    { site: 'ATTTAAAT',       cut: [4, 4], end: 'blunt',  overhang: null,     temp: 25, buffer: 'CutSmart', isoschizomers: ['SmiI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: 'none' },
  SgrAI:   { site: 'CRCCGGYG',       cut: [2, 6], end: '5prime', overhang: 'RCCGGY', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  AsiSI:   { site: 'GCGATCGC',       cut: [5, 3], end: '3prime', overhang: 'AT',     temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  SfiI:    { site: 'GGCCNNNNNGGCC',  cut: [8, 5], end: '3prime', overhang: 'NNN',    temp: 50, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },
  PmeI:    { site: 'GTTTAAAC',       cut: [4, 4], end: 'blunt',  overhang: null,     temp: 37, buffer: 'CutSmart', isoschizomers: ['MssI'], neoschizomers: [], supplier: 'NEB', minFlanking: 2, damSensitive: false, dcmSensitive: false, heatInactivation: '65°C/20min' },

  // ═══════════════════════════════════════════════════════
  // Methylation-sensitive
  // ═══════════════════════════════════════════════════════
  DpnI:    { site: 'GATC', cut: [2, 2], end: 'blunt', overhang: null, temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['DpnII', 'MboI'], supplier: 'NEB', note: 'Cuts ONLY methylated DNA (dam+). Key for KLD/QuikChange.', minFlanking: 0, damSensitive: false, dcmSensitive: false, heatInactivation: '80°C/20min' },
  DpnII:   { site: 'GATC', cut: [0, 4], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'DpnII', isoschizomers: ['MboI'], neoschizomers: ['DpnI'], supplier: 'NEB', note: 'Cuts UNmethylated DNA only.', minFlanking: 0, damSensitive: true, dcmSensitive: false, heatInactivation: '65°C/20min' },
  MboI:    { site: 'GATC', cut: [0, 4], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'CutSmart', isoschizomers: ['DpnII'], neoschizomers: ['DpnI'], supplier: 'NEB', note: 'Cuts UNmethylated DNA. Isoschizomer of DpnII.', minFlanking: 0, damSensitive: true, dcmSensitive: false, heatInactivation: '65°C/20min' },
};

// Full enzyme catalog = the REBASE commercial set with the curated 62 merged on
// top, per-field (curated lab metadata wins; REBASE site/cut/supplier-codes fill
// the rest). «Все рестриктазы как в SnapGene» (Игорь 22.06) — ~459 commercial
// Type IIP. Existing code that reads RE_ENZYMES now sees the full set unchanged.
function mergeEnzymes(base, override) {
  const out = {};
  for (const n of new Set([...Object.keys(base), ...Object.keys(override)])) {
    out[n] = { ...base[n], ...override[n] };
  }
  return out;
}
export const RE_ENZYMES = mergeEnzymes(RE_ENZYMES_REBASE, RE_ENZYMES_CURATED);

// REBASE supplier code → name legend (rebase.neb.com link_emboss_s). The `suppliers`
// field on each enzyme carries these single-letter codes; UI resolves them here.
export const RE_SUPPLIERS = {
  B: 'Thermo Fisher Scientific',
  C: 'Minotech Biotechnology',
  E: 'Agilent Technologies',
  I: 'SibEnzyme',
  J: 'Nippon Gene',
  K: 'Takara Bio',
  M: 'Roche',
  N: 'New England Biolabs',
  O: 'Toyobo',
  Q: 'CHIMERx',
  R: 'Promega',
  S: 'Sigma-Aldrich',
  V: 'Vivantis',
  X: 'EURx',
};

/** Resolve REBASE supplier codes to readable names (unknown codes pass through). */
export function supplierNames(codes) {
  return (Array.isArray(codes) ? codes : []).map((c) => RE_SUPPLIERS[c] || c);
}

// ═══════════════════════════════════════════════════════
// Custom enzyme registry (RS-C2)
// ═══════════════════════════════════════════════════════
// User-defined Type II enzymes (RS-C1 customEnzymesSlice) are PUSHED here so the
// scan/digest/search engine sees them ON TOP of the 63 built-ins — WITHOUT this
// module importing the Zustand store (which imports restriction-db → would be a
// circular dep). Keyed by enzyme NAME; a custom name matching a built-in
// overrides it. Bio-invariant: the slice only ever pushes Type II enzymes here —
// never Golden Gate (Type IIS lives in golden-gate.js and is never merged in).
let _customRegistry = {};
let _effectiveCache = null;

/** Replace the custom-enzyme overlay (called by customEnzymesSlice on every change). */
export function setCustomEnzymeRegistry(byName) {
  _customRegistry = (byName && typeof byName === 'object') ? byName : {};
  _effectiveCache = null;
}

/**
 * Built-in RE_ENZYMES merged with the custom overlay. Returns the SAME RE_ENZYMES
 * reference when the registry is empty, so the no-custom path is byte-identical.
 */
export function effectiveEnzymes() {
  if (_effectiveCache) return _effectiveCache;
  _effectiveCache = Object.keys(_customRegistry).length > 0
    ? { ...RE_ENZYMES, ..._customRegistry }
    : RE_ENZYMES;
  return _effectiveCache;
}

/** Look up one enzyme by name across custom overlay + built-ins. */
function lookupEnzyme(name) {
  return _customRegistry[name] || RE_ENZYMES[name];
}

// ═══════════════════════════════════════════════════════
// IUPAC ambiguity codes for site matching
// ═══════════════════════════════════════════════════════
const IUPAC = {
  A: 'A', T: 'T', G: 'G', C: 'C',
  R: '[AG]', Y: '[CT]', M: '[AC]', K: '[GT]',
  S: '[GC]', W: '[AT]', H: '[ACT]', B: '[GCT]',
  V: '[ACG]', D: '[AGT]', N: '[ATGC]',
};

export function siteToRegex(site) {
  return new RegExp(site.split('').map(c => IUPAC[c] || c).join(''), 'gi');
}

function reverseComplement(seq) {
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G',
    R: 'Y', Y: 'R', M: 'K', K: 'M', S: 'S', W: 'W',
    H: 'D', D: 'H', B: 'V', V: 'B', N: 'N' };
  return seq.split('').reverse().map(c => comp[c.toUpperCase()] || c).join('');
}

/**
 * Search enzymes by name, recognition site, or overhang.
 * Returns array of [name, info] pairs sorted by relevance.
 */
export function searchRE(query) {
  if (!query) return Object.entries(effectiveEnzymes());
  const q = query.toUpperCase().trim();
  const results = [];

  for (const [name, info] of Object.entries(effectiveEnzymes())) {
    const nameUp = name.toUpperCase();
    const siteUp = info.site.toUpperCase();
    const ohUp = (info.overhang || '').toUpperCase();

    // Exact name match → highest priority
    if (nameUp === q) { results.push([name, info, 0]); continue; }
    // Name starts with query
    if (nameUp.startsWith(q)) { results.push([name, info, 1]); continue; }
    // Name contains query
    if (nameUp.includes(q)) { results.push([name, info, 2]); continue; }
    // Site matches
    if (siteUp.includes(q)) { results.push([name, info, 3]); continue; }
    // Overhang matches
    if (ohUp && ohUp.includes(q)) { results.push([name, info, 4]); continue; }
    // Check isoschizomers/neoschizomers names
    const allNames = [...(info.isoschizomers || []), ...(info.neoschizomers || [])];
    if (allNames.some(n => n.toUpperCase().includes(q))) { results.push([name, info, 5]); continue; }
  }

  results.sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0]));
  return results.map(([n, i]) => [n, i]);
}

/**
 * Find enzymes with compatible ends (same overhang + same end type).
 * Compatible ends can be ligated together.
 */
export function getCompatible(enzymeName) {
  const enzyme = lookupEnzyme(enzymeName);
  if (!enzyme || !enzyme.overhang || enzyme.end === 'blunt') return [];

  const compat = [];
  for (const [name, info] of Object.entries(effectiveEnzymes())) {
    if (name === enzymeName) continue;
    if (info.overhang === enzyme.overhang && info.end === enzyme.end) {
      compat.push(name);
    }
  }
  return compat;
}

/**
 * Get isoschizomers (same site, same cut) and neoschizomers (same site, different cut).
 */
export function getIsoschizomers(enzymeName) {
  const enzyme = lookupEnzyme(enzymeName);
  if (!enzyme) return { isoschizomers: [], neoschizomers: [] };
  return {
    isoschizomers: enzyme.isoschizomers || [],
    neoschizomers: enzyme.neoschizomers || [],
  };
}

/**
 * Find all occurrences of an enzyme's recognition site in a sequence (both strands).
 * Returns: [{ position, strand: '+' | '-' }]
 */
export function findSitesInSequence(enzymeName, sequence, circular = false) {
  const enzyme = lookupEnzyme(enzymeName);
  if (!enzyme || !sequence) return [];

  const seq = sequence.toUpperCase();
  const seqLen = seq.length;
  // L13 (audit) — a circular template can carry a site STRADDLING the origin
  // (last bases + first bases). Search a wrapped copy (mirrors scanAllSites) and
  // drop wrap-duplicates whose start is in the appended tail (position >= seqLen).
  const MAX_SITE = 13; // longest recognition site (SfiI)
  const searchSeq = circular ? seq + seq.slice(0, MAX_SITE) : seq;
  const sites = [];

  // Forward strand
  const fwdRe = siteToRegex(enzyme.site);
  let match;
  while ((match = fwdRe.exec(searchSeq)) !== null) {
    if (match.index < seqLen) sites.push({ position: match.index, strand: '+' });
    // Prevent infinite loop on zero-length matches
    if (match.index === fwdRe.lastIndex) fwdRe.lastIndex++;
  }

  // Reverse complement strand
  const rcSite = reverseComplement(enzyme.site);
  if (rcSite !== enzyme.site) {
    const revRe = siteToRegex(rcSite);
    while ((match = revRe.exec(searchSeq)) !== null) {
      if (match.index < seqLen) sites.push({ position: match.index, strand: '-' });
      if (match.index === revRe.lastIndex) revRe.lastIndex++;
    }
  }

  return sites;
}

/**
 * Check if an enzyme's site appears in any fragment of the assembly.
 * Returns: [{ fragmentName, fragmentIndex, sites: [{position, strand}] }]
 * Empty array = enzyme is safe to use.
 */
export function checkAssemblyForSites(enzymeName, fragments) {
  if (!fragments || !fragments.length) return [];

  const hits = [];
  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    if (!frag.sequence) continue;
    const sites = findSitesInSequence(enzymeName, frag.sequence);
    if (sites.length > 0) {
      hits.push({
        fragmentName: frag.name || `Fragment ${i + 1}`,
        fragmentIndex: i,
        sites,
      });
    }
  }
  return hits;
}

// ═══════════════════════════════════════════════════════
// Compatible overhangs table
// 5' and 3' overhangs are NOT compatible with each other!
// ═══════════════════════════════════════════════════════
export const COMPATIBLE_OVERHANGS = {
  'GATC_5prime': ['BamHI', 'BglII', 'BclI', 'MboI', 'DpnII'],
  'CTAG_5prime': ['XbaI', 'NheI', 'SpeI', 'AvrII'],
  'TCGA_5prime': ['XhoI', 'SalI'],
  'AATT_5prime': ['EcoRI', 'MfeI'],
  'CCGG_5prime': ['AgeI', 'BspEI', 'XmaI'],
  'CG_5prime':   ['ClaI', 'NarI', 'BstBI'],
  'GGCC_5prime': ['NotI', 'EagI'],
  'GGCC_3prime': ['ApaI'],
  'blunt':       ['EcoRV', 'SmaI', 'NruI', 'ScaI', 'StuI', 'HpaI', 'DraI', 'PvuII', 'SnaBI', 'SwaI', 'PmeI'],
};

/**
 * Scan sequence for ALL RE cut sites. Returns array sorted by cutCount.
 * Uses existing findSitesInSequence() with circular wrap-around fix.
 */
export function scanAllSites(sequence, options = {}) {
  const { circular = false, minSiteLen = 6 } = options;
  const seq = sequence.toUpperCase();
  const seqLen = seq.length;

  // Circular: extend to catch wrap-around sites
  const MAX_SITE = 13; // SfiI = 13bp
  const searchSeq = circular ? seq + seq.slice(0, MAX_SITE) : seq;

  const results = [];
  for (const [name, info] of Object.entries(effectiveEnzymes())) {
    // Skip methylation-only enzymes (DpnI, DpnII, MboI) — they're special
    if (name === 'DpnI' || name === 'DpnII' || name === 'MboI') continue;
    // Filter by site length (using only ATGC chars, ignoring IUPAC ambiguity)
    const pureLen = info.site.replace(/[^ATGC]/gi, '').length;
    if (pureLen < minSiteLen) continue;

    const sites = findSitesInSequence(name, searchSeq);
    // Filter: keep only sites starting within original sequence
    const filtered = sites.filter(s => s.position < seqLen);

    if (filtered.length > 0) {
      results.push({
        enzyme: name,
        site: info.site,
        siteLength: info.site.length,
        end: info.end,
        overhang: info.overhang,
        buffer: info.buffer,
        temp: info.temp,
        damSensitive: info.damSensitive || false,
        dcmSensitive: info.dcmSensitive || false,
        positions: filtered,
        cutCount: filtered.length,
        isUnique: filtered.length === 1,
      });
    }
  }

  return results.sort((a, b) => a.cutCount - b.cutCount || a.enzyme.localeCompare(b.enzyme));
}

/**
 * Detect MCS (Multiple Cloning Site) — region with dense unique RE sites.
 * Returns { start, end, siteCount } or null.
 */
export function detectMCS(sites, seqLen, windowSize = 200) {
  const uniquePositions = sites
    .filter(s => s.isUnique)
    .flatMap(s => s.positions.map(p => p.position))
    .sort((a, b) => a - b);

  if (uniquePositions.length < 4) return null;

  let bestStart = 0, bestEnd = 0, bestCount = 0;
  for (let i = 0; i < uniquePositions.length; i++) {
    let count = 0;
    for (let j = i; j < uniquePositions.length && uniquePositions[j] - uniquePositions[i] < windowSize; j++) {
      count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = uniquePositions[i];
      let endIdx = i;
      while (endIdx + 1 < uniquePositions.length && uniquePositions[endIdx + 1] - uniquePositions[i] < windowSize) endIdx++;
      bestEnd = uniquePositions[endIdx] + 10; // +10 for last site
    }
  }

  return bestCount >= 4 ? { start: bestStart, end: bestEnd, siteCount: bestCount } : null;
}

// ═══════════════════════════════════════════════════════
// Restriction cloning functions (Block 4b)
// ═══════════════════════════════════════════════════════

/**
 * Generate protective flanking bases + RE recognition site for primer tail.
 * Uses minFlanking from RE_ENZYMES database.
 * @returns {string} e.g. EcoRI → "GGAATTC" (1bp + GAATTC)
 */
export function generateRETail(enzymeName) {
  const enzyme = lookupEnzyme(enzymeName);
  if (!enzyme) return '';
  const flank = enzyme.minFlanking || 2;
  // Protective bases: alternate GC for stability
  const protective = 'GC'.repeat(Math.ceil(flank / 2)).slice(0, flank);
  return protective + enzyme.site;
}

/**
 * Check how many bases an RE site adds between vector and insert.
 * Important for maintaining reading frame in fusion constructs.
 */
export function checkReadingFrame(enzymeName) {
  const enzyme = lookupEnzyme(enzymeName);
  if (!enzyme) return { addedBases: 0, inFrame: false, containsATG: false };

  // RC-BIO-5 — addedBases = the reconstituted recognition SITE that survives ligation
  // (after two cohesive ends anneal both strands re-pair → the full ds site sits in the
  // product), NOT the single-stranded overhang. EcoRI GAATTC = 6 bp (in frame), not the
  // 4-bp AATT overhang; NdeI CATATG = 6 bp. Degenerate positions count as literal length.
  // Primer-tail protective bases (generateRETail) add MORE and are counted by the caller.
  const addedBases = enzyme.site ? enzyme.site.length : 0;
  const inFrame = addedBases % 3 === 0;
  const containsATG = enzyme.site.toUpperCase().includes('ATG');

  const result = { addedBases, inFrame, containsATG };
  if (!inFrame) {
    result.warning = `${enzymeName} adds ${addedBases} bp (not in frame)`;
    result.tip = 'Add spacer nucleotides to restore reading frame';
  }
  if (containsATG) {
    result.tip = `${enzymeName} site (${enzyme.site}) contains ATG start codon`;
  }
  return result;
}

/**
 * Check if insert sequence contains sites of the enzymes being used for cloning.
 * Returns warnings with compatible alternatives.
 */
export function checkInsertSites(insertSeq, enzyme1, enzyme2) {
  if (!insertSeq) return [];
  const warnings = [];
  const enzymes = enzyme2 ? [enzyme1, enzyme2] : [enzyme1];

  for (const eName of enzymes) {
    const sites = findSitesInSequence(eName, insertSeq);
    if (sites.length > 0) {
      // Find compatible alternatives from COMPATIBLE_OVERHANGS
      const info = lookupEnzyme(eName);
      const key = info.end === 'blunt' ? 'blunt' : `${info.overhang}_${info.end}`;
      const compatGroup = COMPATIBLE_OVERHANGS[key] || [];
      const alternatives = compatGroup.filter(n => n !== eName);

      warnings.push({
        enzyme: eName,
        count: sites.length,
        positions: sites.map(s => s.position),
        level: 'error',
        message: `Insert contains ${sites.length} ${eName} site(s) — will be cut during digestion`,
        alternatives,
      });
    }
  }
  return warnings;
}

/**
 * Check compatibility of two enzymes for simultaneous double digest.
 */
export function checkDoubleDigest(enzyme1, enzyme2) {
  const e1 = lookupEnzyme(enzyme1);
  const e2 = lookupEnzyme(enzyme2);
  if (!e1 || !e2) return { simultaneous: false, buffer: null, temp: null, warnings: ['Unknown enzyme'] };

  const warnings = [];
  const sameBuffer = e1.buffer === e2.buffer;
  const sameTemp = e1.temp === e2.temp;
  const simultaneous = sameBuffer && sameTemp;

  if (!sameBuffer) {
    warnings.push(`Different buffers: ${enzyme1} (${e1.buffer}) vs ${enzyme2} (${e2.buffer}) — use sequential digest`);
  }
  if (!sameTemp) {
    warnings.push(`Different temperatures: ${enzyme1} (${e1.temp}°C) vs ${enzyme2} (${e2.temp}°C)`);
  }
  if (e1.damSensitive) warnings.push(`${enzyme1} is Dam-sensitive — use dam⁻ strain DNA`);
  if (e2.damSensitive) warnings.push(`${enzyme2} is Dam-sensitive — use dam⁻ strain DNA`);
  if (e1.dcmSensitive) warnings.push(`${enzyme1} is Dcm-sensitive`);
  if (e2.dcmSensitive) warnings.push(`${enzyme2} is Dcm-sensitive`);

  return {
    simultaneous,
    buffer: sameBuffer ? e1.buffer : null,
    temp: sameTemp ? e1.temp : null,
    warnings,
  };
}

/**
 * Digest a circular sequence with one or two restriction enzymes.
 *
 * One enzyme with 1 site → linearize (rotate sequence from cut point)
 * One enzyme with 2 sites → excise (cut out region between sites)
 * Two enzymes each with 1 site → excise (directional cloning)
 *
 * @param {string} sequence - Circular plasmid sequence
 * @param {Array} annotations - Annotation array [{name, start, end, ...}]
 * @param {string} enzyme1 - First enzyme name
 * @param {string|null} enzyme2 - Optional second enzyme name
 * @returns {Object} Digest result
 */
export function digest(sequence, annotations, enzyme1, enzyme2 = null) {
  const e1Info = lookupEnzyme(enzyme1);
  if (!e1Info) return { error: `Unknown enzyme: ${enzyme1}` };

  // digest() operates on CIRCULAR templates (the cut adapter routes linear ones
  // to the legacy slice path) → search wrapped so origin-straddling sites count (L13).
  const sites1 = findSitesInSequence(enzyme1, sequence, true);

  // Two different enzymes → each must cut exactly once
  if (enzyme2 && enzyme2 !== enzyme1) {
    const e2Info = lookupEnzyme(enzyme2);
    if (!e2Info) return { error: `Unknown enzyme: ${enzyme2}` };

    const sites2 = findSitesInSequence(enzyme2, sequence, true);
    if (sites1.length !== 1) return { error: `${enzyme1} cuts ${sites1.length} times (need exactly 1)` };
    if (sites2.length !== 1) return { error: `${enzyme2} cuts ${sites2.length} times (need exactly 1)` };

    return _exciseTwoEnzymes(sequence, annotations, enzyme1, e1Info, sites1[0], enzyme2, e2Info, sites2[0]);
  }

  // Single enzyme
  if (sites1.length === 0) return { error: `${enzyme1} cuts 0 times in this sequence` };
  if (sites1.length === 1) return _linearize(sequence, annotations, enzyme1, e1Info, sites1[0]);
  if (sites1.length === 2) return _exciseSameEnzyme(sequence, annotations, enzyme1, e1Info, sites1[0], sites1[1]);
  return { error: `${enzyme1} cuts ${sites1.length} times (need 1 or 2)` };
}

// ── Internal helpers ──

function _computeEnd(enzymeInfo) {
  return {
    overhang: enzymeInfo.overhang,
    overhangType: enzymeInfo.end,
  };
}

function _cutPosition(sitePos, enzymeInfo) {
  // Forward cut position on top strand
  return sitePos + enzymeInfo.cut[0];
}

function _shiftAnnotations(annotations, cutPos, seqLen) {
  const rot = (p) => (((p - cutPos) % seqLen) + seqLen) % seqLen;
  const out = [];
  for (const ann of annotations) {
    // V122 fix: a feature spanning the linearization point becomes two arcs on
    // the linear molecule — split into [tail..end] + [0..head] instead of
    // producing a single start>end (invalid) annotation.
    if (ann.start < cutPos && ann.end > cutPos) {
      out.push({ ...ann, start: rot(ann.start), end: seqLen });
      out.push({ ...ann, start: 0, end: ann.end - cutPos });
      continue;
    }
    // Non-straddling: rotate both ends. A feature ending exactly at the cut
    // maps end→0, which means "the very end of the linear molecule" → seqLen.
    const s = rot(ann.start);
    const e = rot(ann.end) || seqLen;
    out.push({ ...ann, start: s, end: e });
  }
  return out;
}

function _linearize(sequence, annotations, enzymeName, enzymeInfo, site) {
  const seqLen = sequence.length;
  const cutPos = _cutPosition(site.position, enzymeInfo);

  // Rotate sequence: start from cut position
  const linearSeq = sequence.slice(cutPos) + sequence.slice(0, cutPos);
  const shiftedAnns = _shiftAnnotations(annotations, cutPos, seqLen);
  const endObj = { ..._computeEnd(enzymeInfo), enzymeUsed: enzymeName };

  return {
    type: 'linearize',
    backbone: {
      sequence: linearSeq,
      annotations: shiftedAnns,
      length: seqLen,
      leftEnd: endObj,
      rightEnd: { ...endObj },
    },
    excised: null,
    enzymes: [{ name: enzymeName, position: site.position, ...enzymeInfo }],
    isDirectional: false,
    selfLigationRisk: true, // same ends → can self-ligate
  };
}

function _exciseTwoEnzymes(sequence, annotations, name1, info1, site1, name2, info2, site2) {
  const seqLen = sequence.length;
  let pos1 = _cutPosition(site1.position, info1);
  let pos2 = _cutPosition(site2.position, info2);

  // Ensure pos1 < pos2 (swap if needed, keeping enzyme association)
  let leftName = name1, rightName = name2, leftInfo = info1, rightInfo = info2;
  if (pos1 > pos2) {
    [pos1, pos2] = [pos2, pos1];
    [leftName, rightName] = [rightName, leftName];
    [leftInfo, rightInfo] = [rightInfo, leftInfo];
  }

  // Backbone = [pos2..seqLen] + [0..pos1], Excised = [pos1..pos2]
  const backboneSeq = sequence.slice(pos2) + sequence.slice(0, pos1);
  const excisedSeq = sequence.slice(pos1, pos2);

  // Filter annotations into backbone vs excised
  const backboneAnns = annotations
    .filter(a => !(a.start >= pos1 && a.end <= pos2))
    .map(a => {
      let s = a.start, e = a.end;
      // Shift for backbone rotation
      if (s >= pos2) s -= pos2;
      else if (s < pos1) s += (seqLen - pos2);
      else return null;
      if (e >= pos2) e -= pos2;
      else if (e <= pos1) e += (seqLen - pos2);
      else return null;
      return { ...a, start: s, end: e };
    })
    .filter(Boolean);

  const leftEnd = { ..._computeEnd(leftInfo), enzymeUsed: leftName };
  const rightEnd = { ..._computeEnd(rightInfo), enzymeUsed: rightName };

  // Directional if different overhangs/types
  const sameOverhang = leftInfo.overhang === rightInfo.overhang && leftInfo.end === rightInfo.end;
  const isDirectional = !sameOverhang;

  return {
    type: 'excise',
    backbone: {
      sequence: backboneSeq,
      annotations: backboneAnns,
      length: backboneSeq.length,
      leftEnd: rightEnd, // backbone left gets the right enzyme's end (after rotation)
      rightEnd: leftEnd, // backbone right gets the left enzyme's end
    },
    excised: { sequence: excisedSeq, length: excisedSeq.length },
    enzymes: [
      { name: leftName, position: site1.position, ...leftInfo },
      { name: rightName, position: site2.position, ...rightInfo },
    ],
    isDirectional,
    selfLigationRisk: !isDirectional,
  };
}

function _exciseSameEnzyme(sequence, annotations, enzymeName, enzymeInfo, site1, site2) {
  const seqLen = sequence.length;
  let pos1 = _cutPosition(site1.position, enzymeInfo);
  let pos2 = _cutPosition(site2.position, enzymeInfo);
  if (pos1 > pos2) [pos1, pos2] = [pos2, pos1];

  const backboneSeq = sequence.slice(pos2) + sequence.slice(0, pos1);
  const excisedSeq = sequence.slice(pos1, pos2);

  const backboneAnns = annotations
    .filter(a => !(a.start >= pos1 && a.end <= pos2))
    .map(a => {
      let s = a.start, e = a.end;
      if (s >= pos2) s -= pos2;
      else if (s < pos1) s += (seqLen - pos2);
      else return null;
      if (e >= pos2) e -= pos2;
      else if (e <= pos1) e += (seqLen - pos2);
      else return null;
      return { ...a, start: s, end: e };
    })
    .filter(Boolean);

  const endObj = { ..._computeEnd(enzymeInfo), enzymeUsed: enzymeName };

  return {
    type: 'excise',
    backbone: {
      sequence: backboneSeq,
      annotations: backboneAnns,
      length: backboneSeq.length,
      leftEnd: { ...endObj },
      rightEnd: { ...endObj },
    },
    excised: { sequence: excisedSeq, length: excisedSeq.length },
    enzymes: [
      { name: enzymeName, position: site1.position, ...enzymeInfo },
      { name: enzymeName, position: site2.position, ...enzymeInfo },
    ],
    isDirectional: false,
    selfLigationRisk: true, // same enzyme → same overhangs → can self-ligate
  };
}
