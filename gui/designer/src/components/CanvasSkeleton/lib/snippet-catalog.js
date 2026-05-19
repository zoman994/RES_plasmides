/**
 * snippet-catalog — M-CANVAS-WORKFLOW-UX K2 (SPEC_ASSEMBLY_WORKFLOW_UX
 * §8). Pure, account-global built-in «обвес» catalog: short sequences
 * that DON'T become their own PCR but embed into a neighbour primer's
 * 5'-tail (tags / linkers / start-stop / RE sites). Custom user
 * snippets live in the Dexie `snippets` table (dexie-schema.js) and are
 * merged at the UI layer — this module stays pure + unit-testable.
 *
 * Sequences are verbatim from SPEC §8.1-§8.3; RE sites are the
 * recognition sequence flanked by RE_PAD generic padding for efficient
 * terminal cleavage (SPEC §8.4 — biolog edits per-enzyme if needed).
 */

export const SNIPPET_CATEGORIES = [
  { id: 'tag', label: 'Tags' },
  { id: 'linker', label: 'Linkers' },
  { id: 'startstop', label: 'Start/Stop' },
  { id: 'restriction', label: 'Restriction sites' },
];

// §8.1 — affinity / epitope tags (8).
const TAGS = [
  ['6xHis', 'CATCATCATCATCATCAT'],
  ['8xHis', 'CATCATCATCATCATCATCATCAT'],
  ['FLAG', 'GATTACAAGGATGACGATGACAAG'],
  ['HA', 'TATCCATATGATGTTCCAGATTATGCT'],
  ['Myc', 'GAACAAAAACTCATCTCAGAAGAGGATCTG'],
  ['V5', 'GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACG'],
  ['Strep', 'TGGAGCCACCCGCAGTTCGAGAAA'],
  ['AviTag', 'GGCCTGAACGACATCTTCGAGGCTCAGAAAATCGAATGGCACGAA'],
];

// §8.2 — linkers (5).
const LINKERS = [
  ['GS', 'GGCAGT'],
  ['G4S', 'GGTGGCGGCGGCAGT'],
  ['2xG4S', 'GGTGGCGGCGGCAGTGGTGGCGGCGGCAGT'],
  ['T2A', 'GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT'],
  ['P2A', 'GCTACTAACTTCAGCCTGCTGAAGCAGGCTGGAGACGTGGAGGAGAACCCTGGACCT'],
];

// §8.3 — start / stop (5).
const STARTSTOP = [
  ['ATG', 'ATG'],
  ['Kozak-ATG', 'GCCACCATG'],
  ['TAA', 'TAA'],
  ['TGA', 'TGA'],
  ['TAG', 'TAG'],
];

// §8.4 — 25 common 6-cutters + 5 Type IIS = 30. Recognition sequences.
const RE_PAD = 'AAA'; // generic flanking for efficient terminal cleavage
const RE_SITES = [
  ['NdeI', 'CATATG'], ['NcoI', 'CCATGG'], ['BamHI', 'GGATCC'], ['EcoRI', 'GAATTC'],
  ['HindIII', 'AAGCTT'], ['XhoI', 'CTCGAG'], ['NotI', 'GCGGCCGC'], ['SacI', 'GAGCTC'],
  ['SalI', 'GTCGAC'], ['KpnI', 'GGTACC'], ['BglII', 'AGATCT'], ['SpeI', 'ACTAGT'],
  ['XbaI', 'TCTAGA'], ['PstI', 'CTGCAG'], ['SmaI', 'CCCGGG'], ['ApaI', 'GGGCCC'],
  ['ClaI', 'ATCGAT'], ['EcoRV', 'GATATC'], ['NheI', 'GCTAGC'], ['NaeI', 'GCCGGC'],
  ['MluI', 'ACGCGT'], ['BspEI', 'TCCGGA'], ['AflII', 'CTTAAG'], ['AvrII', 'CCTAGG'],
  ['PciI', 'ACATGT'],
  // Type IIS (Golden Gate / MoClo).
  ['BsaI', 'GGTCTC'], ['BsmBI', 'CGTCTC'], ['SapI', 'GCTCTTC'], ['BbsI', 'GAAGAC'],
  ['AarI', 'CACCTGC'],
];

function build(category, pairs, mapSeq = (s) => s) {
  return pairs.map(([name, raw]) => ({
    id: `snip-${category}-${name}`,
    name,
    sequence: mapSeq(raw),
    category,
    isCustom: false,
  }));
}

export const BUILTIN_SNIPPETS = [
  ...build('tag', TAGS),
  ...build('linker', LINKERS),
  ...build('startstop', STARTSTOP),
  ...build('restriction', RE_SITES, (site) => `${RE_PAD}${site}${RE_PAD}`),
];

const BUILTIN_BY_ID = new Map(BUILTIN_SNIPPETS.map((s) => [s.id, s]));

export function getSnippetById(id, extra = []) {
  return BUILTIN_BY_ID.get(id)
    || (Array.isArray(extra) ? extra.find((s) => s && s.id === id) : undefined)
    || null;
}

/**
 * isValidSnippetSequence — «+ Создать свой» form gate (SPEC §8.5):
 * ACGT-only, 1..200 nt. Case-insensitive.
 */
export function isValidSnippetSequence(seq) {
  return typeof seq === 'string'
    && seq.length > 0
    && seq.length <= 200
    && /^[ACGT]+$/i.test(seq);
}

/**
 * searchSnippets — case-insensitive name OR sequence substring over the
 * built-in pool plus any caller-supplied `extra` (Dexie custom rows).
 * Empty query → the whole merged pool.
 */
export function searchSnippets(query, extra = []) {
  const pool = [...BUILTIN_SNIPPETS, ...(Array.isArray(extra) ? extra : [])];
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return pool;
  return pool.filter((s) => (
    String(s.name || '').toLowerCase().includes(q)
    || String(s.sequence || '').toLowerCase().includes(q)
  ));
}
