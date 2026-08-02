/**
 * U1 — CORPUS-LEVEL exact routing (SPEC_GAPPED_DNA_SEARCH §4.2.0, corrected).
 *
 * `seqMatch` answers about ONE molecule. `searchAllSequences` answers about the LIBRARY, and the
 * two questions have different correct answers. Today the per-document signal is thrown straight
 * through the corpus loop (search-worker-core.js:23-27 has no try/catch), so the FIRST document
 * that cannot answer decides the verdict for every document after it — including documents that
 * hold a perfect exact hit and were never scanned.
 *
 * The normative order, evaluated over ALL eligible documents, not the first one:
 *
 *   run the exact pass over every eligible document
 *     ├─ any pass did not complete   → incomplete (typed RESOURCE_LIMIT)
 *     ├─ exact hits found anywhere   → return ALL of them
 *     └─ all complete, zero hits     → REQUIRES_ALIGNMENT
 *
 * Two invariants carry the whole contract:
 *   • the verdict is INVARIANT to document order — the library is a set, not a list;
 *   • no branch may degrade into a false zero. `{}` returned as a complete answer means «this
 *     sequence is not in your library», and only the third branch is entitled to say anything
 *     like that — and even it says «route to alignment», not «nothing found».
 *
 * The corpus contract keeps the transport shape the engine already uses: a typed `err.code` on a
 * thrown Error (search-worker-client / search-facade already read exactly that). U1 changes WHEN
 * the signal is raised, not WHAT it looks like.
 */
import { describe, it, expect } from 'vitest';
import { searchAllSequences } from '../search-worker-core';
import { REQUIRES_ALIGNMENT, MAX_APPROX_QUERY_LEN } from '../seq-match';
import { RESOURCE_LIMIT } from '../dna-gapped-search';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const randDna = (rnd, n) => {
  let out = '';
  for (let i = 0; i < n; i++) out += 'ACGT'[(rnd() * 4) | 0];
  return out;
};

const rnd = lcg(0x0C0FFEE);
/** Three unrelated random backgrounds — no accidental cross-document homology. */
const BG_A = randDna(rnd, 1200);
const BG_B = randDna(rnd, 1200);
const BG_C = randDna(rnd, 1200);
/** A 240-nt insert: comfortably over MAX_APPROX_QUERY_LEN, so only the exact pass may answer. */
const INSERT = randDna(rnd, 240);
const SHORT = randDna(rnd, 60); // ≤100 → the ordinary approximate route

const implant = (bg, payload, at) => bg.slice(0, at) + payload + bg.slice(at);

/** Documents. `*_PLAIN` cannot match the insert; `*_HIT` carries it verbatim. */
const A_PLAIN = { id: 'a', seq: BG_A, topology: 'linear' };
const B_HIT = { id: 'b', seq: implant(BG_B, INSERT, 400), topology: 'linear' };
const C_HIT = { id: 'c', seq: implant(BG_C, INSERT, 700), topology: 'linear' };
const C_PLAIN = { id: 'c', seq: BG_C, topology: 'linear' };
const SHORT_HIT = { id: 'b', seq: implant(BG_B, SHORT, 300), topology: 'linear' };

/**
 * A document engineered to EXHAUST the per-document meter: 200 kb with no G-run, so the scan
 * cannot finish inside a tiny injected budget (the same deterministic device as K2d §3.3).
 */
const LIMITED = { id: 'lim', seq: 'ACGT'.repeat(50_000), topology: 'linear' };
const TIGHT = { stateBudget: 8000 };

/** Catch the typed corpus signal the way search-worker-client does. */
const run = (q, docs, ctx = {}) => {
  try {
    return { byId: searchAllSequences(q, docs, { bothStrands: true, ...ctx }), code: null, err: null };
  } catch (e) {
    return { byId: null, code: e.code, err: e };
  }
};

/**
 * U5-A — a document's answer is the SUMMARY model `{occurrences, locationCount, bestIndex}`, not a
 * bare array. `occurrencesOf` is the one place these contracts unwrap it, so a future shape change
 * lands here rather than in fifteen assertions.
 */
const occurrencesOf = (r) => (Array.isArray(r) ? r : (r?.occurrences || []));
const startsOf = (occ) => occurrencesOf(occ).map((o) => o.location.segments[0].start);

describe('U1 §4.2.0 — exact routing is decided over the COLLECTION, not the first document', () => {
  // ── 1. permutations ─────────────────────────────────────────────────────────────────────
  it('miss→hit: a document with NO exact hit must not veto a later document that HAS one', () => {
    // THE case. Doc «a» cannot answer a 240-mer approximately, so it raises the route signal.
    // Doc «b» holds the query verbatim. Routing the user to alignment here would be false: the
    // library does contain the sequence, we simply stopped looking.
    const r = run(INSERT, [A_PLAIN, B_HIT]);
    expect(r.code, 'an exact hit anywhere outranks a route signal from another document').toBeNull();
    expect(Object.keys(r.byId)).toEqual(['b']);
    expect(occurrencesOf(r.byId.b).length).toBeGreaterThan(0);
    expect(occurrencesOf(r.byId.b).some((o) => o.metrics.identity === 1)).toBe(true);
    expect(startsOf(r.byId.b)).toContain(400);
  });

  it('hit→miss: the same answer when the hitting document is scanned first', () => {
    const r = run(INSERT, [B_HIT, A_PLAIN]);
    expect(r.code).toBeNull();
    expect(Object.keys(r.byId)).toEqual(['b']);
    expect(startsOf(r.byId.b)).toContain(400);
  });

  it('the verdict is INVARIANT to document order (2 documents, structural equality)', () => {
    const forward = run(INSERT, [A_PLAIN, B_HIT]);
    const reverse = run(INSERT, [B_HIT, A_PLAIN]);
    expect(reverse.code).toBe(forward.code);
    expect(reverse.byId).toEqual(forward.byId);
    // Invariance alone is satisfiable by being uniformly WRONG in both orders — which is exactly
    // what today's loop does. Anchor the shared verdict to the correct one.
    expect(forward.code, 'both orders must agree ON THE HIT, not on the route').toBeNull();
    expect(occurrencesOf(forward.byId.b).length).toBeGreaterThan(0);
  });

  it('the verdict is INVARIANT to document order (3 documents, all 6 permutations)', () => {
    const docs = [A_PLAIN, B_HIT, C_PLAIN];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const results = perms.map((p) => run(INSERT, p.map((i) => docs[i])));
    for (const [i, r] of results.entries()) {
      expect(r.code, `permutation ${perms[i].join('')} must still find the exact hit`).toBeNull();
      expect(r.byId, `permutation ${perms[i].join('')} must equal permutation 012`).toEqual(results[0].byId);
    }
    expect(Object.keys(results[0].byId)).toEqual(['b']);
  });

  it('miss→miss: every document complete, zero exact hits → REQUIRES_ALIGNMENT, not a zero', () => {
    const r = run(INSERT, [A_PLAIN, C_PLAIN]);
    expect(r.code).toBe(REQUIRES_ALIGNMENT);
    expect(r.byId, 'an empty byId here would claim the library was searched approximately').toBeNull();
  });

  it('miss→miss is order-invariant too', () => {
    const forward = run(INSERT, [A_PLAIN, C_PLAIN]);
    const reverse = run(INSERT, [C_PLAIN, A_PLAIN]);
    expect(reverse.code).toBe(forward.code);
    expect(reverse.byId).toEqual(forward.byId);
    expect(forward.code, 'the agreed verdict must be the route').toBe(REQUIRES_ALIGNMENT);
  });

  // ── 2. incomplete dominates — but ONLY inside the phase that can be incomplete ───────────
  //
  // CONTRACT CHANGE (U6-E1). These cases used to assert that an unscannable document made the whole
  // corpus incomplete EVEN WHEN another document held an exact hit. That followed from an
  // implementation fact, not from biology: the exact pass ran through the approximate engine with a
  // zero edit budget, so it could exhaust a resource meter, and `LIMITED` below is built to do
  // exactly that. The exact phase is now a literal scan with no DP state, so «this document could
  // not be scanned exactly» has stopped being a possible state — and a certain, cheap exact hit is
  // no longer thrown away because some other molecule would have been expensive to approximate.
  //
  // What is unchanged, and is what the rule was always for: inside the APPROXIMATE phase an
  // incomplete document still dominates, still discards the partial `byId`, and still outranks the
  // alignment route. Nothing is published as searched that was not searched.
  // The awkward document has to be one whose LITERAL exact scan fits the budget while its
  // approximate pass does not — otherwise the exact phase is what runs out, and the case would be
  // testing scan exhaustion rather than phase ordering. A literal pass charges one unit per position
  // per strand, so 3 kb costs ~6000 against the 8000 below; the DP on the same low-complexity target
  // passes that long before it finishes.
  const APPROX_HOSTILE = { id: 'hostile', seq: 'ACGT'.repeat(750), topology: 'linear' };

  it('an exact hit beats a document whose approximate pass is unaffordable', () => {
    const r = run(SHORT, [APPROX_HOSTILE, SHORT_HIT], { identityThreshold: 0.8, ...TIGHT });
    expect(r.code, 'a certain, cheap exact answer is not cancelled by another molecule exhausting a budget').toBeNull();
    expect(Object.keys(r.byId)).toEqual(['b']);
  });

  it('and that does not depend on document order', () => {
    const ctx = { identityThreshold: 0.8, ...TIGHT };
    const forward = run(SHORT, [APPROX_HOSTILE, SHORT_HIT], ctx);
    const reverse = run(SHORT, [SHORT_HIT, APPROX_HOSTILE], ctx);
    expect(reverse.code).toBe(forward.code);
    expect(reverse.byId).toEqual(forward.byId);
  });

  it('approximate phase: incomplete still dominates and discards the partial map', () => {
    // A short query, so the approximate phase is allowed to run and is the phase that fails.
    const alien = randDna(lcg(0xBEEF), 60);
    const r = run(alien, [SHORT_HIT, LIMITED], { identityThreshold: 0.8, stateBudget: 8000 });
    expect(r.code).toBe(RESOURCE_LIMIT);
    expect(r.byId, 'partial hits are never published as a confirmed answer').toBeNull();
  });

  it('approximate phase: incomplete never degrades into an honest zero', () => {
    const alien = randDna(lcg(0xF00D), 60);
    const r = run(alien, [LIMITED], { identityThreshold: 0.8, stateBudget: 8000 });
    expect(r.code).toBe(RESOURCE_LIMIT);
    expect(r.byId).toBeNull();
    expect(r.byId).not.toEqual({});
  });

  it('long query: the exact phase completed everywhere, so the honest answer is the route', () => {
    // `INSERT` is 240 nt, so approximate is not permitted at all. The exact phase now completes on
    // every document including `LIMITED`, so «we did look everywhere, and it is not there» is true —
    // which is precisely what the alignment route says. Under the old shape this reported
    // RESOURCE_LIMIT, asserting the library had not been searched when in fact it had.
    // No tight budget here: the point is that the exact phase COMPLETED, and a budget small enough
    // to stop its scan would be testing something else. `LIMITED` is 200 kb, so a literal exact pass
    // over both strands costs ~400 000 scan units and needs room for it.
    const forward = run(INSERT, [A_PLAIN, LIMITED]);
    const reverse = run(INSERT, [LIMITED, A_PLAIN]);
    expect(forward.code).toBe(REQUIRES_ALIGNMENT);
    expect(forward.code, 'the route must not depend on document order').toBe(reverse.code);
    expect(forward.byId).toBeNull();
  });

  // ── 3. ALL exact hits, not the first ────────────────────────────────────────────────────
  it('exact hits in SEVERAL documents are all returned, not just the first', () => {
    const r = run(INSERT, [B_HIT, A_PLAIN, C_HIT]);
    expect(r.code).toBeNull();
    expect(Object.keys(r.byId).sort()).toEqual(['b', 'c']);
    expect(startsOf(r.byId.b)).toContain(400);
    expect(startsOf(r.byId.c)).toContain(700);
  });

  it('…and the multi-hit answer is order-invariant', () => {
    const forward = run(INSERT, [B_HIT, A_PLAIN, C_HIT]);
    const reverse = run(INSERT, [C_HIT, A_PLAIN, B_HIT]);
    expect(reverse.code).toBeNull();
    expect(reverse.byId).toEqual(forward.byId);
  });

  it('a plain document between two hits does not truncate the sweep', () => {
    const r = run(INSERT, [A_PLAIN, B_HIT, A_PLAIN, C_HIT]);
    expect(r.code).toBeNull();
    expect(Object.keys(r.byId).sort()).toEqual(['b', 'c']);
  });

  // ── 4. the length boundary, at corpus level ─────────────────────────────────────────────
  it(`a ≤${MAX_APPROX_QUERY_LEN}-nt query takes the ordinary route across the corpus`, () => {
    const r = run(SHORT, [A_PLAIN, SHORT_HIT], { identityThreshold: 0.8 });
    expect(r.code, 'the route only exists above the approximate length limit').toBeNull();
    expect(Object.keys(r.byId)).toEqual(['b']);
  });

  it('a short query absent from every document is an HONEST ZERO, not a route', () => {
    const alien = randDna(lcg(0x5EED), 60);
    const r = run(alien, [A_PLAIN, C_PLAIN], { identityThreshold: 0.8 });
    expect(r.code).toBeNull();
    expect(r.byId).toEqual({});
  });

  it('a >100-nt query with an exact hit is answered by hits, whatever its length', () => {
    const long = implant(BG_B, INSERT, 400).slice(300, 300 + 700); // 700 nt, exact in «b» only
    const r = run(long, [A_PLAIN, B_HIT, C_PLAIN]);
    expect(r.code, 'exact search has no length limit').toBeNull();
    expect(Object.keys(r.byId)).toEqual(['b']);
    expect(occurrencesOf(r.byId.b).some((o) => o.metrics.identity === 1)).toBe(true);
  });

  it('a >100-nt query with no exact hit anywhere is routed, once, for the whole corpus', () => {
    const r = run(INSERT, [A_PLAIN, C_PLAIN, A_PLAIN], {});
    expect(r.code).toBe(REQUIRES_ALIGNMENT);
  });

  // ── 5. the signal stays typed and distinguishable ───────────────────────────────────────
  it('REQUIRES_ALIGNMENT is a typed Error carrying the length facts consumers publish', () => {
    const r = run(INSERT, [A_PLAIN, C_PLAIN]);
    expect(r.err).toBeInstanceOf(Error);
    expect(r.code).toBe(REQUIRES_ALIGNMENT);
    expect(r.err.maxApproxLength).toBe(MAX_APPROX_QUERY_LEN);
    expect(r.err.queryLength).toBe(INSERT.length);
  });

  it('REQUIRES_ALIGNMENT, RESOURCE_LIMIT and an honest zero are three distinct outcomes', () => {
    const routed = run(INSERT, [A_PLAIN, C_PLAIN]);
    // The RESOURCE_LIMIT case must now be raised where a resource can actually run out: the
    // approximate phase. A ≤100-nt query reaches it; `INSERT` (240 nt) never would, and since the
    // exact phase can no longer be incomplete, asking for it there would be asking for a state that
    // no longer exists.
    const limited = run(randDna(lcg(0xC0FFEE), 60), [LIMITED], { identityThreshold: 0.8, stateBudget: 8000 });
    const zero = run(randDna(lcg(0xF00D), 60), [A_PLAIN, C_PLAIN], { identityThreshold: 0.8 });
    expect(routed.code).toBe(REQUIRES_ALIGNMENT);
    expect(limited.code).toBe(RESOURCE_LIMIT);
    expect(zero.code).toBeNull();
    expect(new Set([routed.code, limited.code, String(zero.code)]).size).toBe(3);
    expect(zero.byId).toEqual({});
  });

  it('a provider-level alphabet error is neither a route nor a zero', () => {
    const r = run(`${INSERT}N`, [A_PLAIN, B_HIT]);
    expect(r.code, 'corpus aggregation must not mask an input error').toBe('INVALID_DNA');
    expect(r.byId).toBeNull();
  });

  it('documents without a usable sequence are simply not eligible, and do not route', () => {
    const r = run(INSERT, [{ id: 'x', seq: '' }, B_HIT, { id: null, seq: BG_A }]);
    expect(r.code).toBeNull();
    expect(Object.keys(r.byId)).toEqual(['b']);
  });
});
