/**
 * The SEQUENCE trust boundary — fail-closed, and sequence-only.
 *
 * The locus envelope widened what crosses the worker boundary, and a widened payload is only safe if
 * the gate widened with it. Four ways it did not, each a real hole rather than a test detail:
 *
 *   1. FAIL-OPEN FINALIZER. `finalizeSequenceOccurrences` accepted a bare array, ignored unknown
 *      keys and REPAIRED a bad count/index into a plausible one. Repairing is the worst of the
 *      three: a broken engine's reply came out looking like a confirmed answer (§3.3 forbids exactly
 *      that), and the substituted values are the two wrong answers P1-2/P1-3 exist to prevent.
 *   2. THE GENERIC CONTRACT MOVED. protein and enzyme are uncapped and answer with an array; only
 *      DNA needs an envelope. Teaching the SHARED validator to accept envelopes relaxed the contract
 *      for two providers that never had the problem.
 *   3. `bestIndex: -1` ON A NON-EMPTY DNA WINDOW. §3.2 ends on the edit script, which the compact
 *      boundary drops; the declared index is the ONLY evidence of rule 7 that will ever exist. A
 *      reply that declines to name a winner has destroyed it, and nothing downstream can notice.
 *   4. UNBOUNDED CLAIMS. `locationCount` was checked for coherence with the payload but not against
 *      the molecule: a reply could claim a million sites on a 300 nt plasmid. And the named winner
 *      was never compared to the rest — a forgery pointing at the WORST occurrence passed.
 */
import { describe, it, expect } from 'vitest';
import { finalizeSequenceOccurrences, validateSequencePayload, MALFORMED_SEQUENCE_RESULT } from '../search-sequence-contract';
import { validateProviderPayload } from '../search-provider-contract';
import { isValidSequenceEnvelope } from '../search-sequence-envelope';

const N = 300;
const FACTS = { sequenceLength: N, circular: false, queryLength: 6 };

/** A canonical 6-mer hit at `start`, `M` of 6 bases matched. */
const hit = (start, M = 6) => ({
  location: { segments: [{ start, end: start + 6 }], strand: '+', wrapsOrigin: false },
  metrics: {
    length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: M / 6, coverage: 1,
    exactMatches: M, substitutions: 6 - M, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 6 - M, mismatches: 6 - M, indels: 0,
    identityBps: Math.floor((10000 * M) / 6),
  },
});
const env = (over) => ({ occurrences: [hit(0)], locationCount: 1, bestIndex: 0, ...over });
const malformed = (reply) => {
  try { finalizeSequenceOccurrences(reply, FACTS); } catch (e) { return e.code; }
  return null;
};

describe('gap 1 — the finalizer fails CLOSED', () => {
  it('a well-formed envelope still passes, and its two facts are carried verbatim', () => {
    // `bestIndex` must be the §3.2 winner of what is carried: both hits are 6/6, so rule 6 decides
    // on the physical endpoint and the EARLIER one (6, not 26) wins. A positive fixture naming
    // index 1 would have asserted the exact thing the gate below refuses.
    const out = finalizeSequenceOccurrences({ occurrences: [hit(0), hit(20)], locationCount: 501, bestIndex: 0 }, FACTS);
    expect(out.occurrences).toHaveLength(2);
    expect(out.locationCount).toBe(501); // the count survives the cap; the window is only 2 long
    expect(out.bestIndex).toBe(0);
  });

  it('a genuine TIE lets the engine name EITHER — that is where rule 7 lives', () => {
    // Same locus, opposite strands, identical metrics: rules 1–6 cannot separate them (same
    // endpoint), so both indices are admissible and only the edit script — long gone by here —
    // could have chosen. The gate must not invent a preference the boundary cannot justify.
    const plus = hit(0);
    const minus = { ...hit(0), location: { ...hit(0).location, strand: '-' } };
    for (const bestIndex of [0, 1]) {
      const out = finalizeSequenceOccurrences({ occurrences: [plus, minus], locationCount: 2, bestIndex }, FACTS);
      expect(out.bestIndex).toBe(bestIndex);
    }
  });

  it('a BARE ARRAY is malformed — that is the stale-engine reply, not a valid one', () => {
    expect(malformed([hit(0)])).toBe(MALFORMED_SEQUENCE_RESULT);
    expect(malformed([])).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('an unknown key is malformed — a reply we cannot reason about is not a reply', () => {
    expect(malformed(env({ script: '======' }))).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('a bad count or index FAULTS instead of being repaired', () => {
    expect(malformed(env({ locationCount: 0 }))).toBe(MALFORMED_SEQUENCE_RESULT); // fewer than carried
    expect(malformed(env({ locationCount: 1.5 }))).toBe(MALFORMED_SEQUENCE_RESULT);
    expect(malformed(env({ locationCount: -1 }))).toBe(MALFORMED_SEQUENCE_RESULT);
    expect(malformed(env({ bestIndex: 7 }))).toBe(MALFORMED_SEQUENCE_RESULT);
    expect(malformed(env({ bestIndex: -2 }))).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('the ONLY honest miss is exactly `{[], 0, -1}` — everything else empty is malformed', () => {
    // An empty window that names a winner is self-contradictory…
    expect(malformed({ occurrences: [], locationCount: 0, bestIndex: 0 })).toBe(MALFORMED_SEQUENCE_RESULT);
    // …and so is one that claims 501 loci while carrying none. «Repairing» that to `{[], 0, -1}`
    // is the worst possible direction to be wrong in: the biologist is told the motif is ABSENT
    // from a molecule the same reply just said holds 501 copies of it.
    expect(malformed({ occurrences: [], locationCount: 501, bestIndex: -1 })).toBe(MALFORMED_SEQUENCE_RESULT);
    expect(malformed({ occurrences: [], locationCount: 1, bestIndex: -1 })).toBe(MALFORMED_SEQUENCE_RESULT);

    const miss = finalizeSequenceOccurrences({ occurrences: [], locationCount: 0, bestIndex: -1 }, FACTS);
    expect(miss.occurrences).toEqual([]);
    expect(miss.bestIndex).toBe(-1);
    expect(miss.locationCount).toBe(0);
  });

  it('the finalizer applies the 2n ceiling and the winner check ITSELF, not only after clone', () => {
    // The inline path and every direct caller stop here — if these two rules ran only in the
    // post-clone validator, those callers would never see them at all.
    expect(malformed({ occurrences: [hit(0)], locationCount: 2 * N + 1, bestIndex: 0 })).toBe(MALFORMED_SEQUENCE_RESULT);
    expect(malformed({ occurrences: [hit(0, 6), hit(20, 4)], locationCount: 2, bestIndex: 1 })).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('a non-empty DNA window with NO declared winner is malformed (rule-7 evidence lost)', () => {
    expect(malformed(env({ bestIndex: -1 }))).toBe(MALFORMED_SEQUENCE_RESULT);
  });
});

describe('gap 2 — the GENERIC provider contract still takes an array', () => {
  const lengths = new Map([['entry:x', N]]);

  it('protein / enzyme answer with a plain array and are accepted', () => {
    expect(validateProviderPayload({ 'entry:x': [hit(0)] }, lengths)).toBe(true);
  });

  it('…and an envelope is NOT smuggled through the shared gate', () => {
    expect(validateProviderPayload({ 'entry:x': env() }, lengths)).toBe(false);
    expect(validateProviderPayload({ 'entry:x': [] }, lengths)).toBe(false);
  });
});

describe('gaps 3 + 4 — the sequence-only envelope rules', () => {
  const meta = { length: N, circular: false };
  const ok = (e) => isValidSequenceEnvelope(e, meta, () => true);

  it('accepts a believable reply', () => {
    expect(ok({ occurrences: [hit(0), hit(20)], locationCount: 501, bestIndex: 0 })).toBe(true);
  });

  it('rule 1 — a non-empty window must NAME a winner', () => {
    expect(ok({ occurrences: [hit(0)], locationCount: 1, bestIndex: -1 })).toBe(false);
  });

  it('rule 2 — `locationCount` cannot exceed 2n, the ceiling of the algorithm itself', () => {
    // One hit may start at each of n positions on each of 2 strands. More than that is a claim
    // about a different molecule.
    expect(ok({ occurrences: [hit(0)], locationCount: 2 * N, bestIndex: 0 })).toBe(true);
    expect(ok({ occurrences: [hit(0)], locationCount: 2 * N + 1, bestIndex: 0 })).toBe(false);
  });

  it('rule 3 — the named winner may TIE, but may not LOSE on rules 1–6', () => {
    // A 4/6 hit named as the winner while a 6/6 hit sits beside it: rule 1 (identity) settles that,
    // no script needed, so the forgery is catchable and must be caught.
    expect(ok({ occurrences: [hit(0, 6), hit(20, 4)], locationCount: 2, bestIndex: 1 })).toBe(false);
    // Two identical hits at different starts tie through rule 6 only if their endpoints differ —
    // here they do, so the EARLIER endpoint must win and naming the later one is a loss.
    expect(ok({ occurrences: [hit(0), hit(20)], locationCount: 2, bestIndex: 1 })).toBe(false);
    expect(ok({ occurrences: [hit(0), hit(20)], locationCount: 2, bestIndex: 0 })).toBe(true);
  });

  it('the molecule TOPOLOGY must be a real boolean, never a truthy stand-in', () => {
    // Topology is not a hint here — it decides whether a wrap is possible at all and how the §3.2
    // endpoint is normalised (rule 6 folds it modulo the molecule on a circle). Coercing meant the
    // STRING `'false'` — the shape a query param, a form field or a serialised pref arrives in —
    // read as `true`, i.e. «this plasmid is circular» asserted from a value that says the opposite.
    // The validator has no way to recover the real answer, so it must refuse to guess.
    const good = { occurrences: [hit(0)], locationCount: 1, bestIndex: 0 };
    for (const bad of ['false', 'true', 0, 1, null, undefined, {}]) {
      expect(isValidSequenceEnvelope(good, { length: N, circular: bad }, () => true),
        `circular=${JSON.stringify(bad)}`).toBe(false);
    }
    // …and both real booleans are accepted on the same fixture, so this is a type gate, not a
    // rejection of circular molecules.
    expect(isValidSequenceEnvelope(good, { length: N, circular: false }, () => true)).toBe(true);
    expect(isValidSequenceEnvelope(good, { length: N, circular: true }, () => true)).toBe(true);
  });

  it('rule 4 — the envelope must be a PLAIN RECORD', () => {
    class Reply { constructor() { this.occurrences = [hit(0)]; this.locationCount = 1; this.bestIndex = 0; } }
    expect(ok(new Reply())).toBe(false);
    const arrayish = [];
    arrayish.occurrences = [hit(0)]; arrayish.locationCount = 1; arrayish.bestIndex = 0;
    expect(ok(arrayish)).toBe(false);
  });

  it('the payload validator applies all of it, per document', () => {
    const docMeta = new Map([['entry:x', { length: N, circular: false }]]);
    const req = { docMeta, queryLength: 6 };
    expect(validateSequencePayload({ 'entry:x': env() }, req)).toBe(true);
    expect(validateSequencePayload({ 'entry:x': [hit(0)] }, req)).toBe(false); //        bare array
    expect(validateSequencePayload({ 'entry:x': env({ bestIndex: -1 }) }, req)).toBe(false);
    expect(validateSequencePayload({ 'entry:x': env({ locationCount: 2 * N + 1 }) }, req)).toBe(false);
  });
});
