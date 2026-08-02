/**
 * search-locus-summary — ONE description of a locus, shared by every surface that shows one (U5-A).
 *
 * Before this module there were two disjoint answers to «what does this hit look like». The
 * in-molecule popover rendered the full picture — basis-point identity, M/L, X·I·D, gap events,
 * strand, explicit half-open coordinates — from private helpers inside its own `.jsx`, untested and
 * with the nucleotide unit hard-coded. The global dropdown rendered a different, smaller picture: a
 * pre-joined sentence with a percentage RECOMPUTED from the float, no strand and no coordinates at
 * all. Two surfaces describing the same occurrence with different numbers is the defect; one pure
 * function that both call is the fix.
 *
 * What it deliberately does NOT do:
 *   • it does not re-derive anything. `identityBps` is the engine's own integer (floor(10000·M/L));
 *     recomputing `Math.round(identity·100)` from the float is how 99.99 % became «100 %», which
 *     tells a biologist a construct is perfect when one base is wrong;
 *   • it does not collapse a wrap. An origin-crossing hit is TWO ordered segments, and merging them
 *     into one range would name a span that does not exist on the molecule;
 *   • it does not emit alignment internals. No script, no editRuns, no mismatchPositions, no
 *     sequence — those are stripped at the worker boundary and must not reappear in a row.
 *
 * `locationCount` lives HERE too, not in each surface. It is the count of physical loci the engine
 * measured BEFORE its caps, so it can legitimately exceed the listed window (501 found, 500 listed);
 * two surfaces formatting that number apart is how one of them ends up printing the window size.
 *
 * Pure: strings for units and labels come from i18n, everything else is arithmetic on the canonical
 * metrics.
 */
import { tf } from '../i18n';

/**
 * `+` / `−` / `±`. The minus is U+2212 MINUS SIGN, not a hyphen: at 11 px a hyphen next to a digit
 * reads as part of the coordinate.
 */
export function strandSymbol(strand) {
  if (strand === 'both') return '±';
  if (strand === '-' || strand === -1) return '−';
  return '+';
}

/**
 * 0-based half-open, shown EXPLICITLY as `[start, end)` per segment — the same coordinates the jump
 * and the engine use, so the convention is unambiguous rather than guessed from the numbers.
 * A wrap keeps BOTH segments, joined: `[4980, 5000) + [0, 30)`.
 */
export function formatLocusCoords(segments) {
  return (segments || []).map((s) => `[${s.start}, ${s.end})`).join(' + ');
}

/**
 * The ONE wording of «how many physical loci are in this molecule». Used by the dropdown row's
 * locus card AND by the in-molecule popover header, so the two cannot disagree about the same
 * count — which they did: the popover printed a hard-coded Russian header of its own.
 * @param {number} count
 * @returns {string} '' when there is nothing to state (no locus, or a non-number)
 */
export function formatLocationCount(count) {
  if (!Number.isFinite(count) || count <= 0) return '';
  return tf('search.locations', { count });
}

/**
 * @param {{location?:{segments?:Array,strand?:string,wrapsOrigin?:boolean}, metrics?:Object}} occ
 * @param {{locationCount?:number}} [opts] — how many physical loci the entity has (measured before
 *   the caps). Omitted where the surface lists every locus itself (the popover).
 * @returns {null | {
 *   strand:string, strandRaw:string, coords:string, segments:Array, wrapsOrigin:boolean,
 *   identityPct:string, identityBps:number, matched:number, alignmentLength:number, ntText:string,
 *   substitutions:number, insertions:number, deletions:number, xidText:string,
 *   indelEvents:number, gapsText:string, locationCount:number|null, locationsText:string,
 * }} null when the occurrence carries no alignment numbers (a metadata or protein/enzyme hit,
 *   which has no M/L to show) — callers render nothing rather than zeros.
 */
export function locusSummary(occ, opts) {
  const m = occ && occ.metrics;
  const loc = occ && occ.location;
  if (!m || !loc || !Number.isFinite(m.identityBps) || !Number.isFinite(m.alignmentLength)) return null;
  const segments = Array.isArray(loc.segments) ? loc.segments : [];
  if (segments.length === 0) return null;
  const locationCount = Number.isFinite(opts && opts.locationCount) ? opts.locationCount : null;
  return {
    strand: strandSymbol(loc.strand),
    strandRaw: loc.strand,
    coords: formatLocusCoords(segments),
    segments,
    wrapsOrigin: !!loc.wrapsOrigin,
    // TWO decimals, straight from the engine's integer: 99.99 % must never round up to a false 100 %.
    identityPct: (m.identityBps / 100).toFixed(2),
    identityBps: m.identityBps,
    matched: m.exactMatches,
    alignmentLength: m.alignmentLength,
    ntText: tf('search.locus.nt', { exact: m.exactMatches, total: m.alignmentLength }),
    // Substitutions · insertions · deletions kept APART, and LABELLED. The legacy `indels` alias is
    // I+D, which cannot tell an insertion from a deletion — opposite events for a reading frame —
    // and a bare «1·1·1» is unreadable to a screen reader (and to anyone who has not memorised the
    // column order), so the words travel with the numbers instead of hiding in a `title`.
    substitutions: m.substitutions,
    insertions: m.insertions,
    deletions: m.deletions,
    xidText: tf('search.locus.xid', { x: m.substitutions, i: m.insertions, d: m.deletions }),
    // Gap EVENTS, not gap bases: one 3-nt gap and three 1-nt gaps are different alignments.
    indelEvents: m.indelEvents,
    gapsText: tf('search.popover.gaps', { n: m.indelEvents }),
    locationCount,
    locationsText: formatLocationCount(locationCount),
  };
}
