/**
 * lib/re-match.js — the enzyme (re:) search provider (P5). This is the `ctx.reMatch`
 * producer search-facade injects; library-search already consumes it under the
 * 'enzyme' dimension (mirrors seqMatch / proteinMatch).
 *
 * `re:EcoRI` finds every recognition site of the enzyme across a molecule and maps
 * each to its NUCLEOTIDE recognition span, so the biolog sees where the enzyme cuts.
 * It is a facade over classical Type II (restriction-db.js, custom-overlay aware via
 * effectiveEnzymes) AND Type IIS (golden-gate.js GG_ENZYMES) — kept as two paths
 * because the two dictionaries are a deliberate bio-invariant separation (never
 * merged) and Type IIS cuts land OUTSIDE the recognition site.
 *
 * COORDINATE CHOICE (avoids the V155 double-offset): the returned segment is the
 * RECOGNITION SPAN [pos, pos+site.length), NOT the cut point. The cut offset lives
 * in the enzyme metadata (cut / cutOffset) for the explanation line only.
 */
import { findSitesInSequence, effectiveEnzymes } from '../restriction-db.js';
import { GG_ENZYMES } from '../golden-gate.js';
import { reverseComplementIupac } from './iupac.js';

const DEGENERATE = /[NRYWSKMBDHV]/gi;

/** Resolve an enzyme name (case-insensitive) → { kind, name (db key), info }, or null. */
export function resolveEnzyme(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const eff = effectiveEnzymes();
  if (eff[q]) return { kind: 'reII', name: q, info: eff[q] };
  if (GG_ENZYMES[q]) return { kind: 'reIIS', name: q, info: GG_ENZYMES[q] };
  const lower = q.toLowerCase();
  for (const k of Object.keys(eff)) if (k.toLowerCase() === lower) return { kind: 'reII', name: k, info: eff[k] };
  for (const k of Object.keys(GG_ENZYMES)) if (k.toLowerCase() === lower) return { kind: 'reIIS', name: k, info: GG_ENZYMES[k] };
  return null;
}

/** aa/nt-agnostic honest metrics for a recognition hit — IUPAC sites → identity null. */
function buildMetrics(siteSeq) {
  const len = siteSeq.length;
  const degCount = (siteSeq.match(DEGENERATE) || []).length;
  return {
    length: len,
    identity: degCount ? null : 1, // a degenerate (N-containing) site is a compatibility match, not identity
    compatibility: 1,
    coverage: 1,
    exactMatches: len - degCount,
    compatibleMatches: len,
    uncertainMatches: degCount,
    mismatches: 0,
    indels: 0,
    mismatchPositions: [],
  };
}

/**
 * Type IIS recognition scanner (exact, both strands, circular wrap). GG recognition
 * sites are non-degenerate, so a plain indexOf on both strands is exact. There is no
 * engine helper for this (golden-gate has no cut-coordinate scanner), so re-match
 * rolls its own — without merging GG into the Type II dict (bio-invariant).
 */
function scanRecognition(recog, seq, circular) {
  const S = String(seq || '').toUpperCase();
  const R = String(recog || '').toUpperCase();
  if (!R) return [];
  const len = S.length;
  const rc = reverseComplementIupac(R);
  const searchSeq = circular && len ? S + S.slice(0, Math.max(0, R.length - 1)) : S;
  const out = [];
  const scan = (pat, strand) => {
    if (!pat) return;
    let i = searchSeq.indexOf(pat);
    while (i !== -1) {
      if (i < len) out.push({ position: i, strand });
      i = searchSeq.indexOf(pat, i + 1);
    }
  };
  scan(R, '+');
  if (rc !== R) scan(rc, '-');
  return out;
}

/**
 * @param {string} reQuery — enzyme name (re: prefix already stripped by classify)
 * @param {Object} doc — SearchDocument (sequence + topology)
 * @param {Object} [ctx]
 * @returns {Array<{location, metrics, enzyme}>} one occurrence per recognition site
 */
export function reMatch(reQuery, doc, ctx = {}) {
  const resolved = resolveEnzyme(reQuery);
  const seq = doc && doc.sequence && doc.sequence.seq;
  if (!resolved || !seq) return [];
  // «кольцевой поиск» pref override (same semantics as seqMatch): find sites that
  // straddle the origin only when the molecule is (treated as) circular.
  const circular = ctx.circular === 'on' ? true
    : ctx.circular === 'off' ? false
      : doc.sequence.topology === 'circular';
  const seqLen = seq.length;

  let siteSeq;
  let sites;
  let meta;
  if (resolved.kind === 'reII') {
    siteSeq = resolved.info.site;
    sites = findSitesInSequence(resolved.name, seq, circular);
    meta = {
      name: resolved.name, site: siteSeq, cut: resolved.info.cut,
      overhang: resolved.info.overhang, end: resolved.info.end, typeIIS: false,
    };
  } else {
    siteSeq = resolved.info.recognition;
    sites = scanRecognition(siteSeq, seq, circular);
    meta = {
      name: resolved.name, site: siteSeq, cutOffset: resolved.info.cutOffset,
      overhangLength: resolved.info.overhangLength, typeIIS: true,
    };
  }
  if (!sites.length) return [];

  const metrics = buildMetrics(siteSeq);
  const cutCount = sites.length;
  const siteLen = siteSeq.length;
  return sites.map((s) => {
    const start = s.position;
    const rawEnd = start + siteLen;
    let segments;
    let wrapsOrigin = false;
    if (rawEnd > seqLen && seqLen > 0) {
      // recognition site straddles the origin (circular) → two segments
      wrapsOrigin = true;
      segments = [{ start, end: seqLen }, { start: 0, end: rawEnd - seqLen }];
    } else {
      segments = [{ start, end: rawEnd }];
    }
    return {
      location: { segments, strand: s.strand, wrapsOrigin },
      metrics,
      enzyme: { ...meta, cutCount },
    };
  });
}

/** Bind ctx once → the (reQuery, doc) shape library-search calls. */
export function makeReMatch(ctx = {}) {
  return (reQuery, doc) => reMatch(reQuery, doc, ctx);
}
