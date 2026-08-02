/**
 * search-ranker — U5.1. WHICH locus is the best one, and in WHAT order do the molecules appear.
 *
 * The dropdown is a locator/ranker, not an alignment viewer (SPEC §5.3.1): one molecule is one row,
 * carrying its best confirmed occurrence and the count of the others. Everything decidable here is
 * decided on INTEGERS — a percentage is a rendering, never a sort key.
 *
 * Two things this file exists to pin, because both were wrong before it:
 *   • «best» used to be `max(float percent)`, first-wins (`search-result-vm.js`). Two occurrences at
 *     the same percentage were resolved by array order — i.e. by scan order, which is not a rule.
 *   • row order used to be [dimension, relation, title.toLowerCase()] (`library-search.js`), so a
 *     100 % hit sorted below an 87 % one whenever the title happened to come first in the alphabet.
 */
import { describe, it, expect } from 'vitest';
import { pickBestOccurrence, rankSearchRows, compareSummaryOccurrence } from '../search-ranker';
import { toSearchHitSummaries } from '../search-hit-summary';

/** A facade-shaped occurrence: exactly what survives the worker boundary (no script, no editRuns). */
function occ({
  start = 0, end = null, strand = '+', M = 10, X = 0, I = 0, D = 0, gapEvents = 0,
  segments = null,
} = {}) {
  // The metric contract (`search-sequence-contract.js`), not free-form numbers:
  //   queryLength = M+X+I · alignmentLength = M+X+I+D · targetSpan = M+X+D · bps = floor(10000·M/L)
  const L = M + X + I + D;
  const queryLength = M + X + I;
  const targetSpan = M + X + D;
  const e = end == null ? start + targetSpan : end;
  return {
    location: {
      segments: segments || [{ start, end: e }],
      strand,
      wrapsOrigin: !!(segments && segments.length > 1),
    },
    metrics: {
      length: queryLength, queryLength, alignmentLength: L, targetSpan,
      identity: L ? M / L : 0, coverage: 1,
      exactMatches: M, substitutions: X, insertions: I, deletions: D,
      indelBases: I + D, indelEvents: gapEvents, editDistance: X + I + D,
      mismatches: X, indels: I + D,
      identityBps: L ? Math.floor((10000 * M) / L) : 0,
    },
  };
}

/** A SearchResult as `runSearch` emits it. */
function result(entityKey, occurrences, { dimension = 'sequence', providerPending = false } = {}) {
  return {
    entityKey,
    entityRef: { kind: 'entry', id: entityKey.split(':')[1] || entityKey },
    matches: [{ dimension, relation: 'approximate', highlights: [], occurrences }],
    primaryMatchId: dimension,
    providerPending,
  };
}

describe('pickBestOccurrence — SPEC §3.2, not «max percent, first wins»', () => {
  it('groups nothing and returns null on an empty list', () => {
    expect(pickBestOccurrence([])).toBe(null);
    expect(pickBestOccurrence(undefined)).toBe(null);
  });

  it('rule 1: identity ratio is compared by CROSS MULTIPLICATION, never as a float', () => {
    // 2/3 vs 667/1000: as IEEE doubles 0.6666666666666666 < 0.667, and cross multiplication agrees —
    // but the pair below is the one that matters: equal-looking floats with a real integer winner.
    const a = occ({ M: 2, X: 1 });                 // 2/3   = 6666 bps
    const b = occ({ M: 667, X: 333 });             // 667/1000 = 6670 bps
    expect(pickBestOccurrence([a, b])).toBe(b);
    expect(pickBestOccurrence([b, a])).toBe(b);    // input order must not decide
  });

  it('rule 2: at an EQUAL ratio, more matched bases wins (4/4 beats 2/2)', () => {
    const short = occ({ M: 2, queryLength: 2 });
    const long = occ({ M: 4, queryLength: 4 });
    expect(short.metrics.identityBps).toBe(long.metrics.identityBps); // both 100 %
    expect(pickBestOccurrence([short, long])).toBe(long);
    expect(pickBestOccurrence([long, short])).toBe(long);
  });

  it('rule 3 cannot fire for an ACCEPTED hit (M > 0) — the arithmetic forces the tie', () => {
    // The claim needs its precondition stated. Under the DNA scalar contract
    // (`search-sequence-contract.js`: L = M+X+I+D, editDistance = X+I+D) we have editDistance ≡ L−M.
    // If rules 1 and 2 tie then M/L and M are equal, hence L is equal, hence editDistance is equal.
    // That holds for every hit the product actually ACCEPTS, because a positive identity threshold
    // means M > 0 — which is the missing condition, see the next test.
    const a = occ({ M: 8, X: 2, I: 2 });
    const b = occ({ M: 8, X: 4 });
    expect(a.metrics.identityBps).toBe(b.metrics.identityBps);
    expect(a.metrics.exactMatches).toBe(b.metrics.exactMatches);
    expect(a.metrics.editDistance).toBe(b.metrics.editDistance); // forced equal by the arithmetic
    expect(a.metrics.exactMatches).toBeGreaterThan(0);
  });

  it('rule 3 DOES fire at M = 0 — so the comparator step is live, not decorative', () => {
    // 0/1 and 0/2 both cross-multiply to 0, and M ties at 0, so rules 1–2 cannot separate them.
    // Rule 3 then picks the smaller edit distance. Such a hit is below any positive threshold and
    // the product never shows it — but the comparator is general, and this is why the step stays.
    const oneEdit = occ({ M: 0, X: 1 });
    const twoEdits = occ({ M: 0, X: 2 });
    expect(oneEdit.metrics.identityBps).toBe(0);
    expect(twoEdits.metrics.identityBps).toBe(0);
    expect(oneEdit.metrics.exactMatches).toBe(twoEdits.metrics.exactMatches);
    expect(oneEdit.metrics.editDistance).toBeLessThan(twoEdits.metrics.editDistance);
    expect(compareSummaryOccurrence(oneEdit, twoEdits)).toBeLessThan(0);
    expect(pickBestOccurrence([twoEdits, oneEdit])).toBe(oneEdit);
  });

  it('rule 4: same ratio, M and edit distance — fewer gap EVENTS wins (one indel, not two)', () => {
    const twoGaps = occ({ M: 8, I: 1, D: 1, gapEvents: 2 });
    const oneGap = occ({ M: 8, I: 1, D: 1, gapEvents: 1 });
    expect(pickBestOccurrence([twoGaps, oneGap])).toBe(oneGap);
  });

  it('rule 5: the span closest to the query length wins — even with a LATER end', () => {
    // The diagnostic pair. Rules 1–4 are all forced equal, so rule 5 is the ONLY thing that can
    // decide, and it has to decide AGAINST rule 6:
    //   A: 8M 2I   → L 10, query 10, span  8, |span−query| = 2, ends at 8
    //   B: 8M 1X 1I → L 10, query 10, span  9, |span−query| = 1, ends at 9  ← wins, though later
    const a = occ({ M: 8, I: 2, gapEvents: 1 });
    const b = occ({ M: 8, X: 1, I: 1, gapEvents: 1 });
    expect(a.metrics.identityBps).toBe(b.metrics.identityBps);       // rule 1
    expect(a.metrics.exactMatches).toBe(b.metrics.exactMatches);     // rule 2
    expect(a.metrics.editDistance).toBe(b.metrics.editDistance);     // rule 3
    expect(a.metrics.indelEvents).toBe(b.metrics.indelEvents);       // rule 4
    expect(Math.abs(a.metrics.targetSpan - a.metrics.queryLength)).toBe(2);
    expect(Math.abs(b.metrics.targetSpan - b.metrics.queryLength)).toBe(1);
    expect(b.location.segments[0].end).toBeGreaterThan(a.location.segments[0].end); // rule 6 favours A

    expect(pickBestOccurrence([a, b])).toBe(b);
    expect(pickBestOccurrence([b, a])).toBe(b);
  });

  it('rule 6: everything else equal, the EARLIER physical end wins', () => {
    const late = occ({ start: 900 });
    const early = occ({ start: 100 });
    expect(pickBestOccurrence([late, early])).toBe(early);
    expect(pickBestOccurrence([early, late])).toBe(early);
  });

  it('rule 6 on a wrapped hit uses the LAST segment — the physical end, not segments[0].end', () => {
    // A hit crossing the origin: [4980,5000) + [0,30). Its physical end is 30, not 5000, so it must
    // win against a straight hit ending at 900. Reading segments[0].end would order it dead last.
    const wrapped = occ({ segments: [{ start: 4980, end: 5000 }, { start: 0, end: 30 }] });
    const straight = occ({ start: 880 }); // ends at 890
    expect(pickBestOccurrence([straight, wrapped])).toBe(wrapped);
  });

  it('is a total order on a shuffled fixture: the winner never depends on input order', () => {
    const pool = [
      occ({ M: 10 }), occ({ M: 9, X: 1 }), occ({ M: 8, X: 2 }),
      occ({ M: 10, start: 50 }), occ({ M: 10, start: 5 }), occ({ M: 20, queryLength: 20 }),
    ];
    const winner = pickBestOccurrence(pool);
    for (let shift = 0; shift < pool.length; shift += 1) {
      const rotated = [...pool.slice(shift), ...pool.slice(0, shift)];
      expect(pickBestOccurrence(rotated)).toBe(winner);
    }
    expect([...pool].reverse()).toHaveLength(pool.length);
    expect(pickBestOccurrence([...pool].reverse())).toBe(winner);
  });

  it('does not mutate or reorder the caller’s array', () => {
    const pool = [occ({ M: 8, X: 2 }), occ({ M: 10 })];
    const snapshot = [...pool];
    pickBestOccurrence(pool);
    expect(pool).toEqual(snapshot);
    expect(pool[0]).toBe(snapshot[0]);
  });

  it('survives an occurrence with no metrics (protein/enzyme dims) instead of throwing', () => {
    // A metric-less occurrence cannot win a comparison it has no numbers for, but it must still be
    // returned when it is all there is — a protein/enzyme locus is a real place on the molecule.
    const bare = { location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false } };
    const scored = occ({ M: 10 });
    expect(() => pickBestOccurrence([bare])).not.toThrow();
    expect(pickBestOccurrence([bare])).toBe(bare);
    expect(pickBestOccurrence([bare, scored])).toBe(scored);
    expect(pickBestOccurrence([scored, bare])).toBe(scored);
  });
});

describe('rule 6 on a CIRCLE needs the molecule, not just the segments (U5.1.1)', () => {
  // `physicalEndpoint` in the kernel is `circular ? ((start+span) % n + n) % n : start+span`. Two
  // degenerate hits therefore end at 0, not at n — and no amount of staring at `segments` can tell
  // you that, because the segment end IS n and n is not in the payload. So topology and
  // sequenceLength travel with the comparison.
  const RING = { circular: true, sequenceLength: 5000 };

  it('a hit ending exactly AT the origin ends at 0, so it beats an earlier-looking one', () => {
    const atOrigin = occ({ segments: [{ start: 4990, end: 5000 }] });  // physical end 5000 % 5000 = 0
    const earlyish = occ({ segments: [{ start: 10, end: 20 }] });      // physical end 20
    expect(pickBestOccurrence([earlyish, atOrigin], RING)).toBe(atOrigin);
    expect(pickBestOccurrence([atOrigin, earlyish], RING)).toBe(atOrigin);
  });

  it('a FULL-CIRCLE hit also ends at 0', () => {
    // Both hits are the WHOLE molecule — 5000 matched bases, span 5000 — so rules 1–5 tie and only
    // the endpoint can decide. (A 5000-mer against a 10-mer would have been settled by rule 2 long
    // before rule 6, which is what made the first version of this fixture prove nothing.)
    const fromOrigin = occ({ M: 5000, segments: [{ start: 0, end: 5000 }] });          // end 0
    const fromMiddle = occ({ M: 5000, segments: [{ start: 2500, end: 5000 }, { start: 0, end: 2500 }] }); // end 2500
    expect(fromOrigin.metrics.targetSpan).toBe(5000);
    expect(fromMiddle.metrics.targetSpan).toBe(5000);
    expect(fromOrigin.metrics.identityBps).toBe(fromMiddle.metrics.identityBps);
    expect(pickBestOccurrence([fromMiddle, fromOrigin], RING)).toBe(fromOrigin);
    expect(pickBestOccurrence([fromOrigin, fromMiddle], RING)).toBe(fromOrigin);
  });

  it('the SAME segments on a LINEAR molecule keep their raw end (no wrap-around arithmetic)', () => {
    const atEnd = occ({ segments: [{ start: 4990, end: 5000 }] });
    const early = occ({ segments: [{ start: 10, end: 20 }] });
    const LINE = { circular: false, sequenceLength: 5000 };
    expect(pickBestOccurrence([atEnd, early], LINE)).toBe(early);
    expect(pickBestOccurrence([atEnd, early])).toBe(early); // and with no molecule info at all
  });

  it('a wrapped hit keeps working — its last segment is already the physical end', () => {
    const wrapped = occ({ segments: [{ start: 4980, end: 5000 }, { start: 0, end: 30 }] });
    const straight = occ({ segments: [{ start: 880, end: 890 }] });
    expect(pickBestOccurrence([straight, wrapped], RING)).toBe(wrapped); // 30 < 890
  });
});

describe('rule 7 crosses the compact boundary as ORDER, never as an invented rule (U5.1.1)', () => {
  /** A raw kernel occurrence — the shape that still HAS a script. */
  const raw = ({ strand, script, start = 0, M = 5, X = 1 }) => ({
    strand, start, script, M, X, I: 0, D: 0, gapEvents: 0,
    alignmentLength: M + X, targetSpan: M + X, end: start + M + X,
    identityBps: Math.floor((10000 * M) / (M + X)),
  });

  // THE counter-example. One locus, identical metrics, two strands whose only difference is WHERE
  // the substitution sits. §3.2 rule 7 compares scripts 5′→3′ with `= < D < I < X`, so `=====X`
  // beats `X=====` — the MINUS strand wins. Any tiebreak invented downstream from strand or start
  // would answer `+`: a different strand, and therefore a different biological claim.
  const PLUS_LATE = raw({ strand: '+', script: 'X=====' });
  const MINUS_EARLY = raw({ strand: '-', script: '=====X' });

  // U6-F.2. This used to read «the boundary emits the winner FIRST», which made the array ORDER do
  // two jobs at once — the positional window a biologist reads AND rule 7's verdict — and the two
  // are not the same list. The production engine has always kept them apart: a positional window,
  // with `bestIndex` naming the winner beside it. The boundary now answers in that same shape, so
  // the winner is read from the index rather than from position 0, and the emitted order is
  // positional exactly as production's is.
  it('the boundary names the rule-7 winner by index — the minus strand here, not the plus', () => {
    const env = toSearchHitSummaries([PLUS_LATE, MINUS_EARLY], 20);
    expect(env.occurrences).toHaveLength(2);
    expect(env.occurrences[env.bestIndex].location.strand).toBe('-');
    expect(env.occurrences.map((o) => o.location.strand), 'the WINDOW is positional').toEqual(['+', '-']);
  });

  it('…and it does so whichever order the scanner emitted them in', () => {
    for (const order of [[MINUS_EARLY, PLUS_LATE], [PLUS_LATE, MINUS_EARLY]]) {
      const env = toSearchHitSummaries(order, 20);
      expect(env.occurrences[env.bestIndex].location.strand).toBe('-');
    }
  });

  it('INTEGRATION raw → compact → winner: permuting the raw input never changes the winner', () => {
    const pool = [
      raw({ strand: '+', script: 'X=====' }),
      raw({ strand: '-', script: '=====X' }),
      raw({ strand: '+', script: '==X===', start: 40 }),
      raw({ strand: '-', script: '===X==', start: 40 }),
    ];
    const winnerOf = (order) => {
      const env = toSearchHitSummaries(order, 200);
      const best = env.occurrences[env.bestIndex];
      return `${best.location.strand}@${best.location.segments[0].start}`;
    };
    const expected = winnerOf(pool);
    expect(expected).toBe('-@0'); // rule 7 through the whole chain, not strand preference
    for (let shift = 1; shift < pool.length; shift += 1) {
      expect(winnerOf([...pool.slice(shift), ...pool.slice(0, shift)])).toBe(expected);
    }
    expect(winnerOf([...pool].reverse())).toBe(expected);
  });

  it('rule 7 is NOT recoverable downstream — which is why the index has to carry it', () => {
    // `pickBestOccurrence` runs rules 1–6 on the compact summaries, where no script survives. On
    // this pair those rules tie, so it keeps the first element it was given — the plus strand. That
    // is not a defect in the ranker; it is the reason the verdict must travel as `bestIndex`.
    const env = toSearchHitSummaries([PLUS_LATE, MINUS_EARLY], 20);
    expect(pickBestOccurrence(env.occurrences).location.strand).toBe('+');
    expect(env.occurrences[env.bestIndex].location.strand).toBe('-');
  });

  it('inside the ranker a visible tie STAYS a tie — no strand or start fallback', () => {
    const plus = occ({ M: 10, start: 7, strand: '+' });
    const minus = occ({ M: 10, start: 7, strand: '-' });
    expect(compareSummaryOccurrence(plus, minus)).toBe(0);
    expect(compareSummaryOccurrence(minus, plus)).toBe(0);
    // …so «best» is simply the first, which upstream already ordered by rule 7.
    expect(pickBestOccurrence([minus, plus])).toBe(minus);
    expect(pickBestOccurrence([plus, minus])).toBe(plus);
  });
});

describe('rankSearchRows — one molecule, one row', () => {
  it('collapses every occurrence of one entity into a single row with locationCount', () => {
    const rows = rankSearchRows([
      result('entry:pBG-104', [occ({ M: 10, start: 1240 }), occ({ M: 9, X: 1, start: 4980 })]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].entityKey).toBe('entry:pBG-104');
    expect(rows[0].locationCount).toBe(2);
    expect(rows[0].best.location.segments[0].start).toBe(1240); // the 100 % one
  });

  it('counts locations across ALL dimensions of the entity, not just the first match', () => {
    const r = result('entry:x', [occ({ M: 10 })]);
    r.matches.push({ dimension: 'protein', relation: 'approximate', highlights: [], occurrences: [occ({ M: 8, X: 2 }), occ({ M: 7, X: 3 })] });
    const rows = rankSearchRows([r]);
    expect(rows[0].locationCount).toBe(3);
  });

  it('sorts by identityBps DESCENDING — not by title, the way relevanceKey used to', () => {
    const rows = rankSearchRows([
      result('entry:aaa-low', [occ({ M: 87, X: 13, queryLength: 100 })]),   // 87 %
      result('entry:zzz-high', [occ({ M: 100, queryLength: 100 })]),        // 100 %
      result('entry:mmm-mid', [occ({ M: 94, X: 6, queryLength: 100 })]),    // 94 %
    ]);
    expect(rows.map((r) => r.entityKey)).toEqual(['entry:zzz-high', 'entry:mmm-mid', 'entry:aaa-low']);
  });

  it('breaks an identity tie with the §3.2 comparator on the best occurrences', () => {
    // Both 100 %; the one with more matched bases is the stronger biological claim.
    const rows = rankSearchRows([
      result('entry:short', [occ({ M: 6, queryLength: 6 })]),
      result('entry:long', [occ({ M: 40, queryLength: 40 })]),
    ]);
    expect(rows.map((r) => r.entityKey)).toEqual(['entry:long', 'entry:short']);
  });

  it('breaks a FULL tie stably by entityRefKey, never by input order', () => {
    const a = result('entry:bbb', [occ({ M: 10, start: 5 })]);
    const b = result('entry:aaa', [occ({ M: 10, start: 5 })]);
    expect(rankSearchRows([a, b]).map((r) => r.entityKey)).toEqual(['entry:aaa', 'entry:bbb']);
    expect(rankSearchRows([b, a]).map((r) => r.entityKey)).toEqual(['entry:aaa', 'entry:bbb']);
  });

  it('keeps pending rows OUT of the confirmed ranking (§5.3.1) and after it', () => {
    const rows = rankSearchRows([
      result('entry:pending-perfect', [occ({ M: 100, queryLength: 100 })], { providerPending: true }),
      result('entry:confirmed-weak', [occ({ M: 81, X: 19, queryLength: 100 })]),
    ]);
    expect(rows.map((r) => r.entityKey)).toEqual(['entry:confirmed-weak', 'entry:pending-perfect']);
    expect(rows[0].confirmed).toBe(true);
    expect(rows[1].confirmed).toBe(false);
  });

  it('a row with no occurrences at all (pure metadata hit) ranks last but is not dropped', () => {
    const meta = { entityKey: 'entry:name-only', entityRef: { kind: 'entry', id: 'name-only' }, matches: [{ dimension: 'name', relation: 'substring', highlights: [], occurrences: [] }] };
    const rows = rankSearchRows([meta, result('entry:seq', [occ({ M: 50, X: 50, queryLength: 100 })])]);
    expect(rows.map((r) => r.entityKey)).toEqual(['entry:seq', 'entry:name-only']);
    expect(rows[1].best).toBe(null);
    expect(rows[1].locationCount).toBe(0);
  });

  it('is pure: the input results array and its members are untouched', () => {
    const input = [result('entry:b', [occ({ M: 8, X: 2 })]), result('entry:a', [occ({ M: 10 })])];
    const before = JSON.stringify(input);
    const first = input[0];
    rankSearchRows(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(input[0]).toBe(first);
  });

  it('takes per-entity molecule facts, so a circular row picks its origin-touching locus (U5.1.1)', () => {
    const atOrigin = occ({ segments: [{ start: 4990, end: 5000 }] }); // physical end 0 on a ring
    const earlyish = occ({ segments: [{ start: 10, end: 20 }] });
    const rows = rankSearchRows([result('entry:ring', [earlyish, atOrigin])], {
      docMeta: new Map([['entry:ring', { length: 5000, circular: true }]]),
    });
    expect(rows[0].best).toBe(atOrigin);
    // …and without the map the same data ranks by the raw end, which is all it can honestly do.
    expect(rankSearchRows([result('entry:ring', [earlyish, atOrigin])])[0].best).toBe(earlyish);
  });

  it('compares two rows with THEIR OWN molecules — a ring and a line are not measured alike', () => {
    // Both best-loci end at 5000 on paper. The ring's is really at 0 (modulo its own length) and
    // must therefore win rule 6; a single shared `meta` would have applied one topology to both.
    const ringHit = occ({ M: 10, segments: [{ start: 4990, end: 5000 }] });
    const lineHit = occ({ M: 10, segments: [{ start: 4990, end: 5000 }] });
    const rows = rankSearchRows(
      [result('entry:line', [lineHit]), result('entry:ring', [ringHit])],
      { docMeta: new Map([
        ['entry:ring', { length: 5000, circular: true }],
        ['entry:line', { length: 5000, circular: false }],
      ]) },
    );
    expect(rows.map((r) => r.entityKey)).toEqual(['entry:ring', 'entry:line']);
  });

  it('handles an empty session without inventing rows', () => {
    expect(rankSearchRows([])).toEqual([]);
    expect(rankSearchRows(undefined)).toEqual([]);
  });
});
