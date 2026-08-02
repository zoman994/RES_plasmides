/**
 * P1-2 + P1-3 — what the two caps are allowed to destroy, checked END TO END.
 *
 * A repeat-rich molecule passes through TWO independent truncations before a row is drawn:
 *
 *   cap A · engine   `dna-gapped-session-steps` — sort by START, then truncate      (payload, 500)
 *   cap B · orchestr `library-search`           — truncate per dimension                     (50)
 *
 * Each destroys an answer the row states as fact:
 *
 * P1-3 · THE WINNER. Both caps keep a positional prefix, a criterion §3.2 never mentions. On a
 * circle the canonical best is the hit with the smallest PHYSICAL endpoint (rule 6), and a hit
 * ending exactly at the origin has endpoint 0 with the LARGEST start on the molecule — so it is the
 * first casualty of a positional prefix, TWICE. And it cannot be recovered afterwards: §3.2 ends on
 * the edit script, which the compact boundary drops by design, so the verdict has to be made once
 * and then carried (`bestIndex`).
 *
 * P1-2 · THE COUNT. Each cap counted what it had left, so 501 real loci arrived as 500 and then as
 * 50. «50 locations» for 501 sites is a wrong statement about the DNA.
 *
 * THE POINT OF THIS FILE: the previous version checked the two caps separately and passed while the
 * joint path was still broken — cap A retained the winner, cap B threw it away again, and the count
 * was already lost upstream. So the first suite below runs ONE molecule through the whole chain.
 */
import { describe, it, expect } from 'vitest';
import { searchAllSequences } from '../search-worker-core';
import { runSearch, DEFAULT_SEARCH_OPTS } from '../library-search';
import { rankSearchRows } from '../search-ranker';
import { classifyQuery } from '../query-classify';
import { entryToDocument } from '../search-document-adapters';
import { entityRefKey } from '../search-entity-key';
import { capLocusEnvelope, toLocusEnvelope, isValidLocusEnvelope } from '../search-locus-envelope';
import { canonicalBestIndex, compareOccurrence } from '../dna-gapped-occurrence';

const MOTIF = 'GAATTC'; //            palindrome, not self-overlapping → one clean hit per copy
const COPIES = 501; //                one more than the engine's default payload cap
const RING = MOTIF.repeat(COPIES); // 3006 nt; the last copy ends exactly AT the origin
const N = RING.length;
const RING_META = new Map([['entry:rep', { length: N, circular: true }]]);

const lastEnd = (o) => o.location.segments[o.location.segments.length - 1].end;
/** The origin-ending locus: physical endpoint N ≡ 0, the smallest there is → §3.2 rule 6 winner. */
const atOrigin = (occs) => occs.filter((o) => lastEnd(o) === N);

const mk = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [], projectId: 'p1',
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: [] },
});

const RING_DOC = mk({ id: 'rep', name: 'repeat-plasmid', seq: RING, topology: 'circular' });

// ── THE JOINT PATH ────────────────────────────────────────────────────────────────────────────
describe('P1-2 + P1-3 — one molecule, both caps, the row at the end', () => {
  it('sanity: 501 copies, and the last one ends exactly at the origin', () => {
    expect(N).toBe(COPIES * MOTIF.length);
    expect(RING.slice(N - MOTIF.length)).toBe(MOTIF);
  });

  // The engine is driven through `searchAllSequences` — the ONE function the worker thread, the
  // inline fallback and the in-molecule popover all run, and where the strict finalizer rebuilds
  // every occurrence. A fact that survived only in the raw engine output is a fact no surface sees.
  const sweep = () => searchAllSequences(MOTIF, [{ id: 'entry:rep', seq: RING, topology: 'circular' }], { identityThreshold: 1 });
  // Wired exactly as the facade wires it: the sweep's per-document envelope, looked up by the
  // composite entity key, handed on untouched.
  const session = () => runSearch(classifyQuery(`seq:${MOTIF}`), [RING_DOC], {
    seqMatch: (_q, _s, _p, _c, doc) => sweep()[entityRefKey(doc.ref)] || null,
  });

  it('cap A holds at 500, keeps the winner, and reports the true 501', () => {
    const env = sweep()['entry:rep'];
    expect(env.occurrences).toHaveLength(500); //         the cap is NOT raised
    expect(env.locationCount).toBe(501); //               …but the count is the molecule's, not the window's
    expect(atOrigin(env.occurrences)).toHaveLength(1); // …and the winner survived
    expect(env.occurrences[env.bestIndex]).toBe(atOrigin(env.occurrences)[0]);
    expect(isValidLocusEnvelope(env)).toBe(true);
  });

  it('cap B holds at 50, keeps the SAME winner, and still reports 501', () => {
    const seq = session().results[0].matches.find((m) => m.dimension === 'sequence');
    expect(DEFAULT_SEARCH_OPTS.maxLocationsPerEntity).toBe(50);
    expect(seq.occurrences).toHaveLength(50); //          the second cap is NOT raised either
    expect(seq.locationCount).toBe(501);
    // The whole defect: this is where the retained winner used to be thrown away a second time.
    expect(atOrigin(seq.occurrences)).toHaveLength(1);
    expect(seq.occurrences[seq.bestIndex]).toBe(atOrigin(seq.occurrences)[0]);
  });

  it('the ROW — what the biologist reads and clicks — is 501 locations at the origin-ending locus', () => {
    const [row] = rankSearchRows(session().results, { docMeta: RING_META });
    expect(row.locationCount).toBe(501);
    expect(lastEnd(row.best)).toBe(N);
    // …and the locus handed to the jump is one the payload still carries, not a phantom.
    const seq = session().results[0].matches.find((m) => m.dimension === 'sequence');
    expect(seq.occurrences.some((o) => lastEnd(o) === lastEnd(row.best))).toBe(true);
  });

  it('strand is pinned: a palindrome found on both strands is ONE site reported as `both`', () => {
    const env = sweep()['entry:rep'];
    // GAATTC is its own reverse complement, so `+` and `−` describe the same physical site with the
    // same alignment and merge (§2.6). If they ever stopped merging, the count would double and
    // every «N sites» a biologist reads would be wrong by a factor of two.
    for (const o of env.occurrences) expect(o.location.strand).toBe('both');
  });
});

// ── THE CAP RULE ITSELF ───────────────────────────────────────────────────────────────────────
describe('the shared cap rule', () => {
  const occ = (start) => ({ location: { segments: [{ start, end: start + 6 }], strand: '+', wrapsOrigin: false } });
  const four = [occ(0), occ(10), occ(20), occ(30)];

  it('moves the declared winner into the window instead of losing it', () => {
    const capped = capLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: 3 }, 2);
    expect(capped.occurrences).toHaveLength(2);
    expect(capped.occurrences[capped.bestIndex]).toBe(four[3]);
    expect(capped.locationCount).toBe(4); // the count describes the molecule, not the window
  });

  it('leaves a winner that was already inside exactly where it was', () => {
    const capped = capLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: 0 }, 2);
    expect(capped.occurrences).toEqual([four[0], four[1]]);
    expect(capped.bestIndex).toBe(0);
  });

  it('an INVALID limit does not switch the cap off', () => {
    // `slice(0, NaN)` empties the array while a `length <= limit` guard passes everything through:
    // one bad value used to mean two opposite things. Callers resolve it to their documented default,
    // so the primitive must simply refuse to treat it as a window.
    for (const bad of [0, -1, NaN, 1.5, '2', null, undefined, Infinity]) {
      expect(capLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: 3 }, bad).occurrences).toHaveLength(4);
    }
    // …and the real callers never reach that state: an invalid `maxLocationsPerEntity` falls back.
    const s = runSearch(classifyQuery(`seq:${MOTIF}`), [RING_DOC], {
      seqMatch: () => four, opts: { maxLocationsPerEntity: 0 },
    });
    expect(s.results[0].matches.find((m) => m.dimension === 'sequence').occurrences).toHaveLength(4);
  });

  it('an uncapped array declares NO winner — −1 is not «index 0»', () => {
    const env = toLocusEnvelope(four);
    expect(env.bestIndex).toBe(-1);
    expect(env.locationCount).toBe(4);
  });

  it('the envelope gate refuses claims the payload cannot support', () => {
    expect(isValidLocusEnvelope({ occurrences: four, locationCount: 3, bestIndex: 0 })).toBe(false); // count < window
    expect(isValidLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: 4 })).toBe(false); // index past end
    expect(isValidLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: -2 })).toBe(false);
    expect(isValidLocusEnvelope({ occurrences: [], locationCount: 0, bestIndex: 0 })).toBe(false); // empty must decline
    expect(isValidLocusEnvelope({ occurrences: four, locationCount: 4.5, bestIndex: 0 })).toBe(false);
    expect(isValidLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: 0, extra: 1 })).toBe(false);
    expect(isValidLocusEnvelope(four)).toBe(false); // a bare array is not an envelope
    expect(isValidLocusEnvelope({ occurrences: four, locationCount: 4, bestIndex: 0 })).toBe(true);
  });
});

// ── RULE 7 SURVIVES THE CAP ───────────────────────────────────────────────────────────────────
describe('rule 7 decides the winner, and the cap must not lose it', () => {
  // The hardest case the contract has to hold: two alignments that rules 1–6 CANNOT separate, where
  // only §3.2's last rule — the lexical edit script — picks one, and the picked one sits past the
  // positional cap. It is decidable exactly once, here, because the compact boundary drops the
  // script; if the cap dropped the winner there would be nothing left to recover it from.
  //
  // Same locus, opposite strands, identical counters: M=5 X=1 over a 6-nt query. `=====X` sorts
  // before `X=====` (`=` is 0x3D, `X` is 0x58), so the MINUS strand wins — and minus sorts LAST
  // positionally (STRAND_RANK '+'=0, '-'=2), which is what puts it beyond the window.
  const LOCUS = 90;
  const metrics = {
    length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: 5 / 6, coverage: 1,
    exactMatches: 5, substitutions: 1, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 1, mismatches: 1, indels: 0, identityBps: 8333,
  };
  const at = (start, strand, script, over) => ({
    start, end: start + 6, strand, script,
    segments: [{ start, end: start + 6 }], wrapsOrigin: false,
    metrics: { ...metrics, ...over },
  });
  // Weaker fillers (M=3 of 6) at earlier starts: they fill the window without ever being able to win,
  // so the verdict is decided strictly between the two tied alignments.
  const FILLERS = 4;
  const filler = (i) => at(i * 6, '+', '===XXX', { exactMatches: 3, substitutions: 3, identity: 0.5, editDistance: 3, mismatches: 3, identityBps: 5000 });
  const plus = at(LOCUS, '+', 'X=====');
  const minus = at(LOCUS, '-', '=====X');
  const ALL = [...Array.from({ length: FILLERS }, (_, i) => filler(i)), plus, minus];
  const LIMIT = FILLERS + 1; // the window ends exactly between the two tied alignments

  it('rules 1–6 genuinely TIE — the script is the only difference', () => {
    // Handed the SAME endpoint (they share a locus), everything above rule 7 must be a draw…
    const end = LOCUS + 6;
    const sameScript = { ...minus, script: plus.script };
    expect(compareOccurrence(plus, sameScript, end, end)).toBe(0); // identical scripts → nothing left
    // …and with the real scripts, rule 7 alone separates them, in favour of the MINUS strand.
    expect(compareOccurrence(minus, plus, end, end)).toBeLessThan(0);
  });

  it('the winner is past the positional cap, and is still the winner after it', () => {
    const winner = canonicalBestIndex(ALL, 1000, false);
    expect(ALL[winner]).toBe(minus);
    expect(winner).toBeGreaterThanOrEqual(LIMIT); // genuinely beyond the window — not a free pass

    const capped = capLocusEnvelope({ occurrences: ALL, locationCount: ALL.length, bestIndex: winner }, LIMIT);
    expect(capped.occurrences).toHaveLength(LIMIT); //           the cap is NOT raised
    expect(capped.locationCount).toBe(ALL.length); //            the count still describes the molecule
    expect(capped.occurrences[capped.bestIndex]).toBe(minus); // and the rule-7 winner survived
  });
});

// ── DROPPED METADATA IS NOT A LOCUS ───────────────────────────────────────────────────────────
describe('P1 — a truncated metadata dimension does not invent places on the DNA', () => {
  it('51 text terms: the name dimension is capped, and NONE of it counts as a locus', () => {
    // The molecule's name contains all 51 terms, so the name dimension collects 51 occurrences and
    // cap B truncates it. None of them carries coordinates. Deriving the count as `total − kept`
    // turned the ONE dropped name match into a physical site: `best = null` yet «1 location».
    const terms = Array.from({ length: 51 }, (_, i) => `t${i}`);
    const doc = mk({ id: 'meta', name: terms.join(' ') });
    const s = runSearch(classifyQuery(terms.join(' ')), [doc], {});
    const [row] = rankSearchRows(s.results, {});
    expect(row.best).toBeNull();
    expect(row.locationCount).toBe(0);
  });

  it('a real feature IS a locus, and is counted before its own cap', () => {
    const doc = entryToDocument({
      id: 'f', name: 'plasmid', projectId: 'p1', origin: { status: 'release' },
      payload: {
        sequence: 'ACGT'.repeat(30), topology: 'linear',
        annotations: [{ id: 'a1', name: 'lacZ', type: 'CDS', start: 0, end: 60, strand: 1 }],
      },
    });
    const [row] = rankSearchRows(runSearch(classifyQuery('lacZ'), [doc], {}).results, {});
    expect(row.locationCount).toBe(1);
    expect(row.best.location.segments[0]).toEqual({ start: 0, end: 60 });
  });
});
