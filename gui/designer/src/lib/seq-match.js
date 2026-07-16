/**
 * seq-match — the sequence-dimension provider (P1.5): the `ctx.seqMatch` that
 * library-search injects. It ROUTES a DNA query to the right engine and normalizes
 * the result to the SearchOccurrence contract, so the orchestrator stays engine-
 * agnostic and a worker can swap in later without touching library-search.
 *
 * Routing:
 *   • short (≤30 nt) OR degenerate (IUPAC) OR circular sequence → scanMotif
 *     (exhaustive, all overlaps, both strands, origin wrap, compatibility metrics);
 *   • otherwise → seed-and-extend (long fuzzy DNA, substitutions + 1-nt indels).
 *
 * Long + circular origin-wrap is deferred (P4 wrap-tail overlay); linear seed
 * search still finds every non-wrapping hit. Pure.
 */
import { hasIupacAmbiguity, searchSequence } from './sequence-search';
import { scanMotif } from './sequence-search-bio';

const SHORT_MAX = 30;

/**
 * @param {string} query — DNA query (may be IUPAC / RNA)
 * @param {{ seq:string, topology?:string }|null} sequence — the doc's sequence
 * @param {Object} [plan] — QueryPlan (unused today; reserved for intent hints)
 * @param {Object} [ctx]  — { bothStrands?, maxMismatches?, identityThreshold?, limit? }
 * @returns {Array<{ location:{segments,strand,wrapsOrigin}, metrics:Object }>}
 */
export function seqMatch(query, sequence, plan, ctx = {}) {
  const seq = sequence && sequence.seq;
  if (!query || !seq) return [];
  // «кольцевой поиск» pref: 'on'/'off' override the doc topology; 'auto' follows it.
  const circular = ctx.circular === 'on' ? true
    : ctx.circular === 'off' ? false
      : sequence.topology === 'circular';
  const useExhaustive = query.length <= SHORT_MAX || hasIupacAmbiguity(query) || circular;

  if (useExhaustive) {
    const hits = scanMotif(query, seq, {
      bothStrands: ctx.bothStrands !== false,
      circular,
      maxMismatches: ctx.maxMismatches ?? 0,
      limit: ctx.limit ?? 500,
      iupac: ctx.iupac || 'auto', // «неоднозначные коды»: 'off' → literal matching
    });
    return hits.map((h) => ({
      location: { segments: h.segments, strand: h.strand, wrapsOrigin: h.wrapsOrigin },
      metrics: h.metrics,
    }));
  }

  const hits = searchSequence(query, seq, {
    identityThreshold: ctx.identityThreshold ?? 0.8,
    bothStrands: ctx.bothStrands !== false,
  });
  return hits.map(normalizeSeedHit);
}

function normalizeSeedHit(h) {
  const identity = h.queryIdentity ?? h.identity ?? null;
  return {
    location: {
      segments: [{ start: h.targetStart, end: h.targetEnd }],
      strand: h.strand === -1 ? '-' : '+',
      wrapsOrigin: false,
    },
    metrics: {
      length: h.length,
      identity, //          concrete query → real identity
      compatibility: identity, // no ambiguity here → same number
      coverage: h.queryCoverage ?? 1,
      exactMatches: h.matches,
      compatibleMatches: h.matches,
      uncertainMatches: 0,
      mismatches: h.mismatches,
      indels: (h.gapsInQuery || 0) + (h.gapsInTarget || 0),
      mismatchPositions: h.mismatchPositions || [],
    },
  };
}
