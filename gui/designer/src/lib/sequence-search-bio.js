/**
 * sequence-search-bio — exhaustive short-motif scanner (P1.5).
 *
 * The seed-and-extend engine (sequence-search.js) is right for long fuzzy DNA but
 * CANNOT do IUPAC: an ambiguous base in the seed breaks the exact index lookup, so
 * a query like `GAANTC` never seeds. Short / degenerate / circular queries instead
 * run a full window scan here, comparing each position with `iupacMatch`. This one
 * module delivers three plan items:
 *   • IUPAC compatibility (bit-mask, no expansion → degeneracy can't explode),
 *   • exact-short completeness (EVERY overlapping occurrence, which seed-extend
 *     collapses),
 *   • circular wrap (a motif spanning the origin), reusing the append-tail trick
 *     from primer-binding-search.
 *
 * Metrics (SeqMetrics): identity is NULL for a degenerate query — «compatibility»
 * (does it bind?) is a real number, «identity» (how many bases are literally equal)
 * is undefined when the query itself is ambiguous. A palindromic hit that matches
 * both strands at the same span is reported once as strand:'both'.
 *
 * Pure; reuses iupac (compare/complement/normalize/degeneracy).
 */
import {
  iupacMatch, normalizeSeq, reverseComplementIupac, degeneracy,
} from './iupac';

const DEFAULTS = Object.freeze({
  bothStrands: true,
  circular: false,
  maxMismatches: 0,
  limit: 1000,
  iupac: 'auto', // 'off' → match literally (N in the query matches only literal N)
});

/**
 * Scan `target` for occurrences of `query` (a short motif, possibly IUPAC).
 * @returns {Array<{ strand:'+'|'-'|'both', segments:{start,end}[], wrapsOrigin:boolean, metrics:Object }>}
 */
export function scanMotif(query, target, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const q = normalizeSeq(query);
  const T = normalizeSeq(target);
  const qlen = q.length;
  const tlen = T.length;
  if (qlen === 0 || tlen === 0) return [];
  if (!o.circular && qlen > tlen) return [];
  if (o.circular && qlen > tlen) return [];

  const literal = o.iupac === 'off'; // no ambiguity fallback — N matches only literal N
  const degen = !literal && degeneracy(q) > 1; // is the QUERY ambiguous? (invariant under revcomp)
  const hay = o.circular ? T + T.slice(0, qlen - 1) : T;
  const lastStart = o.circular ? tlen - 1 : tlen - qlen;

  const hits = [];
  const scanStrand = (probe, strand) => {
    for (let s = 0; s <= lastStart; s++) {
      if (hits.length >= o.limit) return;
      let exact = 0; let compatible = 0; let mm = 0;
      const mmPos = [];
      for (let i = 0; i < qlen; i++) {
        const tc = hay[s + i];
        const qc = probe[i];
        if (qc === tc) { exact += 1; compatible += 1; } else if (!literal && iupacMatch(qc, tc)) { compatible += 1; } else { mm += 1; mmPos.push((s + i) % tlen); }
        if (mm > o.maxMismatches) break;
      }
      if (mm > o.maxMismatches) continue;
      const end = s + qlen;
      const wrapsOrigin = o.circular && end > tlen;
      const segments = wrapsOrigin
        ? [{ start: s, end: tlen }, { start: 0, end: end - tlen }]
        : [{ start: s, end }];
      const uncertain = compatible - exact;
      hits.push({
        strand,
        segments,
        wrapsOrigin,
        metrics: {
          length: qlen,
          identity: degen ? null : exact / qlen, // degenerate query → compatibility, not identity
          compatibility: compatible / qlen,
          coverage: 1,
          exactMatches: exact,
          compatibleMatches: compatible,
          uncertainMatches: uncertain,
          mismatches: mm,
          indels: 0,
          mismatchPositions: mmPos,
        },
      });
    }
  };

  scanStrand(q, '+');
  if (o.bothStrands) scanStrand(reverseComplementIupac(q), '-');

  return mergePalindromic(hits);
}

/** A + hit and a − hit over the identical span (a palindrome) collapse to 'both'. */
function mergePalindromic(hits) {
  const sig = (h) => h.segments.map((s) => `${s.start}-${s.end}`).join('|');
  const byKey = new Map();
  for (const h of hits) {
    const k = sig(h);
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, h); continue; }
    if (prev.strand !== h.strand) prev.strand = 'both';
  }
  return [...byKey.values()].sort(
    (a, b) => a.segments[0].start - b.segments[0].start
      || a.strand.localeCompare(b.strand),
  );
}
