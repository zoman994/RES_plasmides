/**
 * U4 item 1 — the adapter that turns the linear kernel's per-strand occurrences into the compact
 * SearchHitSummary the search surfaces consume.
 *
 * U6-F.2 changed WHAT it returns, not what it computes: the canonical locus ENVELOPE
 * `{occurrences, locationCount, bestIndex}` rather than a bare array whose first element was
 * implicitly the winner. `occ()` below is a raw kernel occurrence, and `summaries()` unwraps the
 * envelope where a case is only about the occurrences themselves.
 *
 * ORDER MATTERS, and it is the order the review fixed: merge `+`/`-` into `both` FIRST — by
 * physical locus AND canonical edit script — and only THEN drop the script/editRuns. Merging
 * after stripping would have nothing left to prove the two strands describe the same alignment;
 * stripping first and merging by counters alone would fuse two genuinely different alignments
 * that happen to share M/X/I/D. So the script is the merge witness, consumed and discarded in one
 * step.
 *
 * The output shape is the existing SearchOccurrence contract (`location: {segments, strand,
 * wrapsOrigin}, metrics`) so it drops straight into the provider boundary and the facade — but it
 * carries NO alignment string: a search dropdown is a locator, not an alignment viewer (§5.3.1).
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/search-hit-summary.test.js
 */
import { describe, it, expect } from 'vitest';
import { toSearchHitSummaries } from '../search-hit-summary';

/** A minimal kernel occurrence, matching findOccurrences' return shape. */
function occ(over) {
  return {
    strand: '+', start: 4, targetSpan: 6, end: 10,
    M: 6, X: 0, I: 0, D: 0, gapEvents: 0, alignmentLength: 6, identityBps: 10000,
    script: '======',
    ...over,
  };
}

/** Just the window — for the cases that are about occurrences rather than about the envelope. */
const summaries = (raw, targetLength) => toSearchHitSummaries(raw, targetLength).occurrences;

describe('U4 — SearchHitSummary carries no alignment string', () => {
  it('drops the alignment STRING, and keeps the canonical editRuns (U6)', () => {
    const out = summaries([occ()], 20);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('script');
    expect(out[0].metrics).not.toHaveProperty('script');
    // U6 correction. This used to require `editRuns` to be absent too, which read as «the compact
    // protocol carries no alignment data» — but the PRODUCTION path has always emitted `editRuns` in
    // `metrics` (seq-match's `emit`), because it is canonical §3.1 data: the boundary validator
    // checks it, the §3.2 tie-break reads it, and the sequence overlay draws indel markers from it.
    // A summary without it is not «leaner», it is a different contract from the one the rest of the
    // app is written against — and it is exactly why the linear kernel's rows arrived with no X/I/D
    // breakdown to render. What must stay off the wire is the SCRIPT; the runs are the data.
    expect(out[0].metrics).toHaveProperty('editRuns');
    expect(out[0].metrics.editRuns).toEqual([{
      op: '=', length: 6, probeStart: 0, probeEnd: 6, targetOffsetStart: 0, targetOffsetEnd: 6,
    }]);
  });

  it('editRuns describe the alignment the script encodes — substitutions and both indel kinds', () => {
    // `==X=I=D=` : two matches, a substitution, a match, an insertion (query only), a match, a
    // deletion (target only), a match. The offsets are what the overlay uses to place markers, so
    // they are asserted rather than the op letters alone.
    const out = summaries([occ({ script: '==X=I=D=', M: 5, X: 1, I: 1, D: 1, alignmentLength: 8, targetSpan: 7 })], 40);
    expect(out[0].metrics.editRuns.map((r) => `${r.op}${r.length}`)).toEqual(['=2', 'X1', '=1', 'I1', '=1', 'D1', '=1']);
    const last = out[0].metrics.editRuns[out[0].metrics.editRuns.length - 1];
    // The query consumed everything except the D; the target consumed everything except the I.
    expect(last.probeEnd).toBe(7);
    expect(last.targetOffsetEnd).toBe(7);
  });

  it('preserves the biologically significant metrics', () => {
    const out = summaries([occ({ M: 5, X: 1, alignmentLength: 6, identityBps: 8333 })], 20);
    const m = out[0].metrics;
    expect(m.exactMatches).toBe(5);
    expect(m.substitutions).toBe(1);
    expect(m.insertions).toBe(0);
    expect(m.deletions).toBe(0);
    expect(m.alignmentLength).toBe(6);
    expect(m.identity).toBeCloseTo(5 / 6, 6);
  });

  it('emits the SearchOccurrence location shape the provider boundary expects', () => {
    const out = summaries([occ()], 20);
    const loc = out[0].location;
    expect(loc.strand).toBe('+');
    expect(loc.wrapsOrigin).toBe(false);
    expect(loc.segments).toEqual([{ start: 4, end: 10 }]);
  });
});

describe('U4 — +/- merge into a single both hit', () => {
  it('an exact palindrome at one site becomes one both occurrence', () => {
    // Same physical span, same alignment on each strand → one site, reported once.
    const plus = occ({ strand: '+' });
    const minus = occ({ strand: '-' });
    const out = summaries([plus, minus], 20);
    expect(out, 'the two strands describe the same site → one row').toHaveLength(1);
    expect(out[0].location.strand).toBe('both');
  });

  it('the merged both hit keeps the shared coordinates and metrics', () => {
    const out = summaries([occ({ strand: '+' }), occ({ strand: '-' })], 20);
    expect(out[0].location.segments).toEqual([{ start: 4, end: 10 }]);
    expect(out[0].metrics.exactMatches).toBe(6);
  });

  it('strands with the SAME counts but a different script stay two occurrences', () => {
    // The discriminating case. Both strands span the same window with M=5, X=1, I=0, D=0 — the
    // COUNTERS are identical — but the substitution sits in a different column, so the edit
    // scripts differ. Merging by counters alone would wrongly fuse them; merging by the script
    // (the actual alignment) keeps them apart. This is exactly what makes the "script, not
    // counters" merge key load-bearing, and what a counters-only mutation must trip on.
    const plus = occ({ strand: '+', M: 5, X: 1, identityBps: 8333, script: 'X=====' });
    const minus = occ({ strand: '-', M: 5, X: 1, identityBps: 8333, script: '=====X' });
    expect(plus.M === minus.M && plus.X === minus.X, 'same counters by construction').toBe(true);
    const out = summaries([plus, minus], 20);
    expect(out, 'same counters + different script must NOT be fused').toHaveLength(2);
    const strands = out.map((o) => o.location.strand).sort();
    expect(strands).toEqual(['+', '-']);
  });

  it('strands that reach the same span through visibly different edits stay two occurrences', () => {
    // The looser variant kept for coverage: different M/X entirely.
    const plus = occ({ strand: '+', M: 6, X: 0, script: '======' });
    const minus = occ({ strand: '-', M: 5, X: 1, identityBps: 8333, script: '=====X' });
    const out = summaries([plus, minus], 20);
    expect(out).toHaveLength(2);
  });

  it('hits at DIFFERENT physical loci never merge, even on opposite strands', () => {
    const a = occ({ strand: '+', start: 4, end: 10 });
    const b = occ({ strand: '-', start: 40, end: 46 });
    const out = summaries([a, b], 100);
    expect(out).toHaveLength(2);
  });

  it('same start but different span do not merge', () => {
    const a = occ({ strand: '+', start: 4, targetSpan: 6, end: 10 });
    const b = occ({ strand: '-', start: 4, targetSpan: 7, end: 11, alignmentLength: 7 });
    const out = summaries([a, b], 100);
    expect(out).toHaveLength(2);
  });
});

describe('U4 — wrapped (circular) hits build two segments', () => {
  it('an origin-crossing hit produces two ordered segments and wrapsOrigin', () => {
    // start 18, span 6 on a length-20 molecule ends physically at (18+6) mod 20 = 4.
    const wrapped = occ({ start: 18, targetSpan: 6, end: 4 });
    const out = summaries([wrapped], 20);
    const loc = out[0].location;
    expect(loc.wrapsOrigin).toBe(true);
    expect(loc.segments).toEqual([{ start: 18, end: 20 }, { start: 0, end: 4 }]);
  });

  it('a hit ending exactly at the origin does NOT wrap, and keeps a valid segment', () => {
    // The kernel reports `end` MODULO targetLength, so a hit finishing at the very end of the
    // molecule arrives as end=0, not end=20. The adapter must rebuild the physical segment from
    // start+span (= 20), never from the modular `end`: `[14, 0)` is coordinates the provider
    // validator rejects, so an exact match reaching the origin would vanish as malformed.
    const out = summaries([occ({ start: 14, targetSpan: 6, end: 0 })], 20);
    expect(out[0].location.wrapsOrigin).toBe(false);
    expect(out[0].location.segments).toEqual([{ start: 14, end: 20 }]);
  });

  it('a full-circle exact hit is one segment [0, n), not [0, 0)', () => {
    // query length == circle length: start 0, span 20, physical end 20 -> end mod 20 == 0.
    const out = summaries([occ({ start: 0, targetSpan: 20, end: 0, M: 20, alignmentLength: 20 })], 20);
    expect(out[0].location.wrapsOrigin).toBe(false);
    expect(out[0].location.segments).toEqual([{ start: 0, end: 20 }]);
  });
});

describe('U6-F.2 — the boundary answers with the canonical envelope', () => {
  it('a window, how many loci it holds, and which one is the §3.2 winner', () => {
    const env = toSearchHitSummaries([occ({ start: 40, end: 46 }), occ()], 100);
    expect(Object.keys(env).sort()).toEqual(['bestIndex', 'locationCount', 'occurrences']);
    expect(env.occurrences).toHaveLength(2);
    expect(env.locationCount).toBe(2);
    expect(env.bestIndex).toBeGreaterThanOrEqual(0);
  });

  it('an empty input is the honest miss shape, and declares no winner', () => {
    expect(toSearchHitSummaries([], 20)).toEqual({ occurrences: [], locationCount: 0, bestIndex: -1 });
  });
});

describe('U4 — deterministic ordering', () => {
  it('summaries are sorted by (start, strand) regardless of input order', () => {
    const out = summaries([
      occ({ strand: '-', start: 40, end: 46 }),
      occ({ strand: '+', start: 4, end: 10 }),
      occ({ strand: '+', start: 40, end: 46 }),
    ], 100);
    expect(out.map((o) => [o.location.segments[0].start, o.location.strand]))
      .toEqual([[4, '+'], [40, 'both']]);
  });
});
