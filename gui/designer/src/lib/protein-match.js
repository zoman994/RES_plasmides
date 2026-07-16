/**
 * lib/protein-match.js — the protein (aa:) search provider (P4). This is the
 * `ctx.proteinMatch` producer that search-facade injects into runSearch; the
 * consumption seam already exists (library-search.js) and everything downstream
 * (VM / row / jump) already handles the 'protein' dimension.
 *
 * It is CDS-directed: for each translatable feature it builds the DerivedProtein
 * (splice-aware, frame-resolved) and searches the mature protein for the query
 * peptide. An aa hit is mapped back to NUCLEOTIDE coordinates via each residue's
 * per-base genomic anchor — a residue whose codon straddles an intron splits into
 * two exon segments, so the highlight lands on the real exons, never the intron.
 *
 * This is the flagship: because the search is in protein space, it finds one
 * peptide across codon-optimized (synonymous) DNA, either strand, and across
 * spliced-out introns — things a raw nucleotide search cannot do.
 *
 * Six-frame "possible ORF" translation is deliberately out of the core (plan:
 * advanced/later) — only annotated CDS/gene/marker/reporter features translate.
 */
import { deriveProteinCached } from './derived-protein.js';

// Same set the AA track / feature dim translate (SequenceView constants.js).
const TRANSLATABLE = new Set(['CDS', 'gene', 'marker', 'reporter']);
const MIN_AA_LEN = 3;

/** Uppercase + keep only amino-acid letters (X = wildcard residue). */
export function normalizeAaQuery(q) {
  if (typeof q !== 'string') return '';
  return q.toUpperCase().replace(/[^A-Z*]/g, '');
}

/** Every (overlapping) occurrence of `query` in `protein`; 'X' matches any residue. */
function findAll(protein, query) {
  const out = [];
  const n = protein.length; const m = query.length;
  if (!m || m > n) return out;
  for (let i = 0; i + m <= n; i += 1) {
    let ok = true;
    for (let j = 0; j < m; j += 1) {
      const qc = query[j];
      if (qc === 'X') continue; // wildcard
      if (protein[i + j] !== qc) { ok = false; break; }
    }
    if (ok) out.push({ aaStart: i, aaEnd: i + m });
  }
  return out;
}

/**
 * Collect the genomic base positions of residues [aaStart, aaEnd) and group
 * consecutive runs into nucleotide segments [start,end). Exon boundaries create
 * the natural gaps → multiple segments; within one exon → one segment.
 * @returns {{segments:{start,end}[], wrapsOrigin:boolean}}
 */
function residuesToSegments(aaToGenomicMap, aaStart, aaEnd) {
  const positions = [];
  for (let k = aaStart; k < aaEnd; k += 1) {
    const rec = aaToGenomicMap[k];
    if (!rec) continue;
    for (const g of rec.g) if (g >= 0) positions.push(g);
  }
  if (!positions.length) return { segments: [], wrapsOrigin: false };
  positions.sort((a, b) => a - b);
  const segments = [];
  let s = positions[0]; let prev = positions[0];
  for (let i = 1; i < positions.length; i += 1) {
    const p = positions[i];
    if (p === prev) continue; // de-dup
    if (p === prev + 1) { prev = p; continue; }
    segments.push({ start: s, end: prev + 1 });
    s = p; prev = p;
  }
  segments.push({ start: s, end: prev + 1 });
  return { segments, wrapsOrigin: false };
}

/** aa-space metrics in the SeqMetrics shape the VM / formatter expect. */
function buildMetrics(query) {
  const L = query.length;
  let wild = 0;
  for (let i = 0; i < L; i += 1) if (query[i] === 'X') wild += 1;
  const exact = L - wild;
  return {
    length: L,
    // identity = fraction of LITERALLY-matched residues (X wildcards are compatible,
    // not identical). No wildcards → 1.0; «HXHH» → 3/4. Never overclaims «100%».
    identity: L ? exact / L : 1,
    compatibility: 1, // every position matched (wildcards via X)
    coverage: 1,
    exactMatches: exact,
    compatibleMatches: L,
    uncertainMatches: wild,
    mismatches: 0,
    indels: 0,
    mismatchPositions: [],
  };
}

/**
 * @param {string} aaQuery — the peptide (aa: prefix already stripped by classify)
 * @param {Object} doc — SearchDocument (whole doc: sequence + features)
 * @param {Object} [ctx]
 * @returns {Array<{location, metrics, protein}>} occurrences (nt-space coords)
 */
export function proteinMatch(aaQuery, doc, ctx = {}) {
  const q = normalizeAaQuery(aaQuery);
  if (q.length < (ctx.minAaLen || MIN_AA_LEN)) return [];
  const seq = doc && doc.sequence && doc.sequence.seq;
  if (!seq) return [];
  const features = Array.isArray(doc.features) ? doc.features : [];
  const cdsFeatures = features.filter((f) => f && TRANSLATABLE.has(f.type));
  if (!cdsFeatures.length) return [];

  const entryId = doc.ref && doc.ref.id;
  const rev = doc.ref && doc.ref.revision;
  const occ = [];
  for (const feat of cdsFeatures) {
    // Scope the cache by entry id AND revision AND feature — two different
    // entries can share a revision value (independent counters), so the entry
    // id must be in the key. No revision → don't cache (nothing to invalidate on).
    const cacheKey = rev != null && entryId != null && feat.id != null
      ? `${entryId}:${rev}:${feat.id}` : null;
    const dp = deriveProteinCached(seq, feat, features, cacheKey);
    if (!dp || !dp.proteinSequence) continue;
    for (const h of findAll(dp.proteinSequence, q)) {
      const { segments, wrapsOrigin } = residuesToSegments(dp.aaToGenomicMap, h.aaStart, h.aaEnd);
      if (!segments.length) continue;
      occ.push({
        location: { segments, strand: dp.strand === -1 ? '-' : '+', wrapsOrigin },
        metrics: buildMetrics(q),
        protein: {
          cdsName: dp.cdsName,
          cdsRef: dp.sourceCdsRef,
          strand: dp.strand,
          frame: dp.codonStart,
          frameSource: dp.frameSource,
          geneticCode: dp.translationTable,
          nonStandardCode: dp.nonStandardCode,
          exonCount: dp.exonSegments.length,
          intronExcluded: dp.intronCount > 0,
          aaStart: h.aaStart + 1, // 1-based inclusive residue range for display
          aaEnd: h.aaEnd,
        },
      });
    }
  }
  return occ;
}

/** Bind ctx once → the (aaQuery, doc) shape library-search calls. */
export function makeProteinMatch(ctx = {}) {
  return (aaQuery, doc) => proteinMatch(aaQuery, doc, ctx);
}
