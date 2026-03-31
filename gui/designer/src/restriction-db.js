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

export const RE_ENZYMES = {
  // ═══════════════════════════════════════════════════════
  // 6-cutters
  // ═══════════════════════════════════════════════════════
  EcoRI:   { site: 'GAATTC',  cut: [1, 5], end: '5prime', overhang: 'AATT', temp: 37, buffer: 'CutSmart', isoschizomers: ['Eco831I', 'SsoI'], neoschizomers: [], supplier: 'NEB' },
  BamHI:   { site: 'GGATCC',  cut: [1, 5], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'CutSmart', isoschizomers: ['BstI'], neoschizomers: [], supplier: 'NEB' },
  HindIII: { site: 'AAGCTT',  cut: [1, 5], end: '5prime', overhang: 'AGCT', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  XbaI:    { site: 'TCTAGA',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  XhoI:    { site: 'CTCGAG',  cut: [1, 5], end: '5prime', overhang: 'TCGA', temp: 37, buffer: 'CutSmart', isoschizomers: ['PaeR7I'], neoschizomers: [], supplier: 'NEB' },
  SalI:    { site: 'GTCGAC',  cut: [1, 5], end: '5prime', overhang: 'TCGA', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  NcoI:    { site: 'CCATGG',  cut: [1, 5], end: '5prime', overhang: 'CATG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  NdeI:    { site: 'CATATG',  cut: [2, 4], end: '5prime', overhang: 'TA',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  PstI:    { site: 'CTGCAG',  cut: [5, 1], end: '3prime', overhang: 'TGCA', temp: 37, buffer: 'CutSmart', isoschizomers: ['BspMAI'], neoschizomers: [], supplier: 'NEB' },
  SphI:    { site: 'GCATGC',  cut: [5, 1], end: '3prime', overhang: 'CATG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  KpnI:    { site: 'GGTACC',  cut: [5, 1], end: '3prime', overhang: 'GTAC', temp: 37, buffer: 'CutSmart', isoschizomers: ['Asp718I'], neoschizomers: [], supplier: 'NEB' },
  SacI:    { site: 'GAGCTC',  cut: [5, 1], end: '3prime', overhang: 'AGCT', temp: 37, buffer: 'CutSmart', isoschizomers: ['Ecl136II'], neoschizomers: ['Eco53kI'], supplier: 'NEB' },
  NheI:    { site: 'GCTAGC',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  BglII:   { site: 'AGATCT',  cut: [1, 5], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'NEBuffer 3.1', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  ClaI:    { site: 'ATCGAT',  cut: [2, 4], end: '5prime', overhang: 'CG',   temp: 37, buffer: 'CutSmart', isoschizomers: ['BspDI', 'BanIII'], neoschizomers: [], supplier: 'NEB' },
  MfeI:    { site: 'CAATTG',  cut: [1, 5], end: '5prime', overhang: 'AATT', temp: 37, buffer: 'CutSmart', isoschizomers: ['MunI'], neoschizomers: [], supplier: 'NEB' },
  AgeI:    { site: 'ACCGGT',  cut: [1, 5], end: '5prime', overhang: 'CCGG', temp: 37, buffer: 'CutSmart', isoschizomers: ['PinAI'], neoschizomers: [], supplier: 'NEB' },
  SpeI:    { site: 'ACTAGT',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  AvrII:   { site: 'CCTAGG',  cut: [1, 5], end: '5prime', overhang: 'CTAG', temp: 37, buffer: 'CutSmart', isoschizomers: ['BlnI'], neoschizomers: [], supplier: 'NEB' },
  BclI:    { site: 'TGATCA',  cut: [1, 5], end: '5prime', overhang: 'GATC', temp: 50, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  MluI:    { site: 'ACGCGT',  cut: [1, 5], end: '5prime', overhang: 'CGCG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  NruI:    { site: 'TCGCGA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  ScaI:    { site: 'AGTACT',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  AflII:   { site: 'CTTAAG',  cut: [1, 5], end: '5prime', overhang: 'TTAA', temp: 37, buffer: 'CutSmart', isoschizomers: ['BfrI'], neoschizomers: [], supplier: 'NEB' },
  ApaI:    { site: 'GGGCCC',  cut: [5, 1], end: '3prime', overhang: 'GGCC', temp: 25, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  BspEI:   { site: 'TCCGGA',  cut: [1, 5], end: '5prime', overhang: 'CCGG', temp: 37, buffer: 'CutSmart', isoschizomers: ['Kpn2I', 'BsuEII'], neoschizomers: [], supplier: 'NEB' },
  BsrGI:   { site: 'TGTACA',  cut: [1, 5], end: '5prime', overhang: 'GTAC', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  BstBI:   { site: 'TTCGAA',  cut: [2, 4], end: '5prime', overhang: 'CG',   temp: 65, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  BstEII:  { site: 'GGTNACC', cut: [1, 6], end: '5prime', overhang: 'GTNAC', temp: 60, buffer: 'NEBuffer 3.1', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  DraI:    { site: 'TTTAAA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  EagI:    { site: 'CGGCCG',  cut: [1, 5], end: '5prime', overhang: 'GGCC', temp: 37, buffer: 'CutSmart', isoschizomers: ['EclXI'], neoschizomers: [], supplier: 'NEB' },
  Eco53kI: { site: 'GAGCTC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['SacI'], supplier: 'NEB' },
  EcoNI:   { site: 'CCTNNNNNAGG', cut: [5, 6], end: '5prime', overhang: null, temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  EcoRV:   { site: 'GATATC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  HincII:  { site: 'GTYRAC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: ['HindII'], neoschizomers: [], supplier: 'NEB' },
  HpaI:    { site: 'GTTAAC',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  MscI:    { site: 'TGGCCA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: ['BalI'], neoschizomers: [], supplier: 'NEB' },
  NarI:    { site: 'GGCGCC',  cut: [2, 4], end: '5prime', overhang: 'CG',   temp: 37, buffer: 'CutSmart', isoschizomers: ['KasI', 'SfoI'], neoschizomers: [], supplier: 'NEB' },
  PmlI:    { site: 'CACGTG',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  PpuMI:   { site: 'RGGWCCY', cut: [2, 5], end: '5prime', overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  PvuI:    { site: 'CGATCG',  cut: [4, 2], end: '3prime', overhang: 'AT',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  PvuII:   { site: 'CAGCTG',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  SacII:   { site: 'CCGCGG',  cut: [4, 2], end: '3prime', overhang: 'GC',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  SmaI:    { site: 'CCCGGG',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 25, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['XmaI'], supplier: 'NEB' },
  SnaBI:   { site: 'TACGTA',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  StuI:    { site: 'AGGCCT',  cut: [3, 3], end: 'blunt',  overhang: null,   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  StyI:    { site: 'CCWWGG',  cut: [1, 5], end: '5prime', overhang: 'CWWG', temp: 37, buffer: 'NEBuffer 3.1', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  XmaI:    { site: 'CCCGGG',  cut: [1, 5], end: '5prime', overhang: 'CCGG', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['SmaI'], supplier: 'NEB' },
  XmnI:    { site: 'GAANNNNTTC', cut: [5, 5], end: 'blunt', overhang: null, temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },

  // ═══════════════════════════════════════════════════════
  // 8-cutters (rare cutters)
  // ═══════════════════════════════════════════════════════
  NotI:    { site: 'GCGGCCGC',       cut: [2, 6], end: '5prime', overhang: 'GGCC',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  AscI:    { site: 'GGCGCGCC',       cut: [2, 6], end: '5prime', overhang: 'CGCG',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  FseI:    { site: 'GGCCGGCC',       cut: [6, 2], end: '3prime', overhang: 'CCGG',   temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  PacI:    { site: 'TTAATTAA',       cut: [5, 3], end: '3prime', overhang: 'AT',     temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  SbfI:    { site: 'CCTGCAGG',       cut: [6, 2], end: '3prime', overhang: 'TGCA',   temp: 37, buffer: 'CutSmart', isoschizomers: ['Sse8387I'], neoschizomers: [], supplier: 'NEB' },
  SwaI:    { site: 'ATTTAAAT',       cut: [4, 4], end: 'blunt',  overhang: null,     temp: 25, buffer: 'CutSmart', isoschizomers: ['SmiI'], neoschizomers: [], supplier: 'NEB' },
  SgrAI:   { site: 'CRCCGGYG',       cut: [2, 6], end: '5prime', overhang: 'RCCGGY', temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  AsiSI:   { site: 'GCGATCGC',       cut: [5, 3], end: '3prime', overhang: 'AT',     temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  SfiI:    { site: 'GGCCNNNNNGGCC',  cut: [8, 5], end: '3prime', overhang: 'NNN',    temp: 50, buffer: 'CutSmart', isoschizomers: [], neoschizomers: [], supplier: 'NEB' },
  PmeI:    { site: 'GTTTAAAC',       cut: [4, 4], end: 'blunt',  overhang: null,     temp: 37, buffer: 'CutSmart', isoschizomers: ['MssI'], neoschizomers: [], supplier: 'NEB' },

  // ═══════════════════════════════════════════════════════
  // Methylation-sensitive
  // ═══════════════════════════════════════════════════════
  DpnI:    { site: 'GATC', cut: [2, 2], end: 'blunt', overhang: null, temp: 37, buffer: 'CutSmart', isoschizomers: [], neoschizomers: ['DpnII', 'MboI'], supplier: 'NEB', note: 'Cuts ONLY methylated DNA (dam+). Key for KLD/QuikChange.' },
  DpnII:   { site: 'GATC', cut: [0, 4], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'DpnII', isoschizomers: ['MboI'], neoschizomers: ['DpnI'], supplier: 'NEB', note: 'Cuts UNmethylated DNA only.' },
  MboI:    { site: 'GATC', cut: [0, 4], end: '5prime', overhang: 'GATC', temp: 37, buffer: 'CutSmart', isoschizomers: ['DpnII'], neoschizomers: ['DpnI'], supplier: 'NEB', note: 'Cuts UNmethylated DNA. Isoschizomer of DpnII.' },
};

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
  if (!query) return Object.entries(RE_ENZYMES);
  const q = query.toUpperCase().trim();
  const results = [];

  for (const [name, info] of Object.entries(RE_ENZYMES)) {
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
  const enzyme = RE_ENZYMES[enzymeName];
  if (!enzyme || !enzyme.overhang || enzyme.end === 'blunt') return [];

  const compat = [];
  for (const [name, info] of Object.entries(RE_ENZYMES)) {
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
  const enzyme = RE_ENZYMES[enzymeName];
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
export function findSitesInSequence(enzymeName, sequence) {
  const enzyme = RE_ENZYMES[enzymeName];
  if (!enzyme || !sequence) return [];

  const seq = sequence.toUpperCase();
  const sites = [];

  // Forward strand
  const fwdRe = siteToRegex(enzyme.site);
  let match;
  while ((match = fwdRe.exec(seq)) !== null) {
    sites.push({ position: match.index, strand: '+' });
    // Prevent infinite loop on zero-length matches
    if (match.index === fwdRe.lastIndex) fwdRe.lastIndex++;
  }

  // Reverse complement strand
  const rcSite = reverseComplement(enzyme.site);
  if (rcSite !== enzyme.site) {
    const revRe = siteToRegex(rcSite);
    while ((match = revRe.exec(seq)) !== null) {
      sites.push({ position: match.index, strand: '-' });
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
