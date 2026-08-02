/**
 * K3.0 — the normative ACGT-only contract for interactive DNA Search (SPEC §2.5).
 *
 * The interactive DNA search accepts A/C/G/T ONLY. Everything else — the IUPAC degeneracy codes,
 * `U`, gaps — is a BLOCKING `invalid-dna` diagnostic raised before any provider or worker runs.
 * It must never degrade into «0 совпадений» and never into a provider failure/incomplete: those
 * two would both tell the biologist something false about their molecule.
 *
 * Two properties are easy to get wrong and are pinned explicitly here:
 *   1. the check runs on the RAW query, BEFORE normalisation — `normalizeSeq` silently rewrites
 *      `U`→`T`, so validating after it would quietly accept RNA as DNA;
 *   2. nothing is stripped — an interior stray character invalidates the whole query rather than
 *      being dropped to leave a shorter, different search than the one the user typed.
 *
 * The shared `lib/iupac.js` and every other subsystem (primer binding, enzymes, protein) keep
 * their degenerate-base support; this contract is scoped to interactive DNA Search.
 */
import { describe, it, expect, vi } from 'vitest';
import { classifyQuery } from '../query-classify';
import { planIsBlocked } from '../library-search';
import { seqMatch as seqMatchSummary } from '../seq-match';

/**
 * U5-A — `seqMatch` answers with the SUMMARY model `{occurrences, locationCount, bestIndex}`, because
 * a row and an inspector must report the same number of loci as the engine found rather than the
 * length of a list that may have been capped. These contracts were written against the bare array and
 * are about the OCCURRENCES, so they unwrap it here — once, explicitly — instead of restating the
 * shape in every assertion.
 */
const seqMatch = (...args) => seqMatchSummary(...args).occurrences;

import { createSearchFacade } from '../search-facade';
import { entryToDocument } from '../search-document-adapters';
import { scanCandidateStarts } from '../dna-approx-scan';

const blocked = (q) => {
  const plan = classifyQuery(q);
  return {
    isBlocked: planIsBlocked(plan),
    hasInvalidDna: plan.diagnostics.some((d) => d.code === 'invalid-dna' && d.severity === 'error'),
  };
};

describe('K3.0 §2.5 — explicit seq: rejects every non-ACGT symbol', () => {
  it.each([
    ['seq:NNNNNNNN', 'N'],
    ['seq:ACGTNACGT', 'interior N'],
    ['seq:ACGTRACGT', 'R'],
    ['seq:ACGTYACGT', 'Y'],
    ['seq:ACGTWACGT', 'W'],
    ['seq:ACGTSACGT', 'S'],
    ['seq:ACGTKACGT', 'K'],
    ['seq:ACGTMACGT', 'M'],
    ['seq:ACGTBACGT', 'B'],
    ['seq:ACGTDACGT', 'D'],
    ['seq:ACGTHACGT', 'H'],
    ['seq:ACGTVACGT', 'V'],
    ['seq:ACGT-ACGT', 'gap'],
  ])('%s → blocking invalid-dna (%s)', (query) => {
    const r = blocked(query);
    expect(r.hasInvalidDna).toBe(true);
    expect(r.isBlocked).toBe(true);
  });

  it('U is rejected, NOT silently rewritten to T (the check precedes normalisation)', () => {
    // `normalizeSeq` maps U→T. Validating after it would accept RNA as if it were DNA.
    const r = blocked('seq:ACGUACGU');
    expect(r.hasInvalidDna).toBe(true);
    expect(r.isBlocked).toBe(true);
  });

  it('an interior stray character invalidates the query instead of being stripped', () => {
    // Stripping would silently run a DIFFERENT (shorter) search than the one that was typed.
    // NOTE the quotes: bare `seq:ACGT ACGT` is TWO tokens to the lexer, so it would never reach
    // the validator at all — the interior space has to be inside the quoted value to be tested.
    expect(blocked('seq:"ACGT ACGT"').hasInvalidDna).toBe(true);
    expect(blocked('seq:ACGT*ACGT').hasInvalidDna).toBe(true);
  });

  it('surrounding whitespace is trimmed, so a padded but otherwise valid query passes', () => {
    // The contract is «trim + uppercase, THEN [ACGT]» — outer padding is not a syntax error.
    const r = blocked('seq:"  ACGTACGT  "');
    expect(r.hasInvalidDna).toBe(false);
    expect(r.isBlocked).toBe(false);
  });

  it('…and the plan carries the CANONICAL string, not the padded original', () => {
    // A boolean validator would accept the padded form and let the untrimmed string reach the
    // engine, which would then reject it — validator and engine disagreeing about what was
    // searched. The shared helper returns the canonical string, so there is one answer.
    expect(classifyQuery('seq:" ACGTACGT "').seqQuery).toBe('ACGTACGT');
    expect(classifyQuery('seq:acgtacgt').seqQuery).toBe('ACGTACGT');
  });
});

describe('K3.0 §2.5 — valid A/C/G/T still passes, in any case', () => {
  it('uppercase ACGT is accepted', () => {
    const r = blocked('seq:ACGTACGTACGT');
    expect(r.hasInvalidDna).toBe(false);
    expect(r.isBlocked).toBe(false);
  });

  it('lowercase acgt is accepted (uppercased, not rejected)', () => {
    const r = blocked('seq:acgtacgtacgt');
    expect(r.hasInvalidDna).toBe(false);
    expect(r.isBlocked).toBe(false);
  });

  it('mixed case is accepted', () => {
    expect(blocked('seq:AcGtAcGtAcGt').hasInvalidDna).toBe(false);
  });
});

describe('K3.0 §2.5 — a degenerate bare token is not auto-classified as DNA', () => {
  it('a bare NNNNNNNN is metadata text, not an inferred DNA motif', () => {
    const plan = classifyQuery('NNNNNNNNNN');
    expect(plan.seqQuery ?? null).toBeNull();
  });

  it('a bare ACGT motif is still inferred as DNA', () => {
    const plan = classifyQuery('ACGTACGTACGT');
    expect(plan.seqQuery).toBe('ACGTACGTACGT');
  });
});

describe('K3.0 §2.5 — the engine boundary rejects fail-closed if the UI guard is bypassed', () => {
  const doc = { seq: 'AAAACGTACGTTTT', topology: 'linear' };

  it('a degenerate query reaching seqMatch throws INVALID_DNA — not [] and not RESOURCE_LIMIT', () => {
    let thrown = null;
    try { seqMatch('ACGTNACGT', doc, null, { bothStrands: false }); } catch (e) { thrown = e; }
    expect(thrown, 'must not silently return a result').toBeTruthy();
    expect(thrown.code).toBe('INVALID_DNA');
  });

  it('a `U` query reaching seqMatch is rejected too (no silent U→T at the boundary)', () => {
    let thrown = null;
    try { seqMatch('ACGUACGU', doc, null, { bothStrands: false }); } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('INVALID_DNA');
  });

  it('a valid ACGT query still searches normally', () => {
    expect(seqMatch('ACGTACGT', doc, null, { bothStrands: false }).length).toBeGreaterThan(0);
  });
});

describe('K3.0 §2.5 — a rejected query never reaches the worker at all', () => {
  const mk = (over) => entryToDocument({
    id: over.id,
    name: over.name,
    tags: [],
    origin: { status: 'release' },
    payload: { sequence: over.seq || '', topology: 'linear', annotations: [] },
  });
  const DOCS = [mk({ id: 'a', name: 'pBG-104', seq: 'AAAACGTACGTTTT' })];

  it('seq: with a degenerate code → blocked session, worker NEVER built, postMessage never called', async () => {
    const postMessage = vi.fn();
    let built = 0;
    const workerFactory = () => {
      built += 1;
      return { postMessage, terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null };
    };
    const facade = createSearchFacade({ workerFactory });
    const out = await facade.search('seq:ACGTNACGT', DOCS, {});
    expect(out.session.blocked).toBe(true);
    expect(out.session.results).toEqual([]);
    expect(built, 'worker must not be constructed for an invalid query').toBe(0);
    expect(postMessage, 'no provider work may be dispatched').not.toHaveBeenCalled();
  });

  it('…and a valid ACGT query is NOT over-blocked', async () => {
    const facade = createSearchFacade();
    const out = await facade.search('seq:ACGTACGT', DOCS, { bothStrands: false });
    expect(out.session.blocked).toBeFalsy();
  });
});

describe('K3.0 §2.5 — the candidate scanner matches literal A/C/G/T, not IUPAC masks', () => {
  it('a degenerate TARGET gives no candidates at zero budget (N is not "any base")', () => {
    expect(scanCandidateStarts('AAAA', 'NNNN', 0)).toEqual([]);
  });

  it('U in the target is not silently equal to T', () => {
    expect(scanCandidateStarts('TTTT', 'UUUU', 0)).toEqual([]);
  });

  it('literal A/C/G/T still scans normally', () => {
    expect(scanCandidateStarts('ACGT', 'TTACGTTT', 0)).toContain(2);
  });
});

describe('K3.0 §2.3 — an ambiguous TARGET base counts as X, and identity stays finite', () => {
  it('U in the target is a MISMATCH — ACGTATGT vs ACGTAUGT is exactly 7/8, never 100%', () => {
    // The engine normalises the target with normalizeSeq, which rewrites U→T. That would turn a
    // genuine one-base difference into a perfect hit and tell the biologist their construct
    // matches when it does not.
    const [hit] = seqMatch('ACGTATGT', { seq: 'TTACGTAUGTTT', topology: 'linear' }, null,
      { bothStrands: false, identityThreshold: 0.8 });
    expect(hit).toBeTruthy();
    expect(hit.metrics.exactMatches).toBe(7);
    expect(hit.metrics.substitutions).toBe(1);
    expect(hit.metrics.alignmentLength).toBe(8);
    expect(hit.metrics.identity).toBeCloseTo(7 / 8, 12);
  });

  it('N in the target is a mismatch, never a match or a compatibility credit', () => {
    // query ACGTACGT vs a target carrying one N inside the locus → exactly one substitution.
    const [hit] = seqMatch('ACGTACGT', { seq: 'TTACGTANGTTT', topology: 'linear' }, null,
      { bothStrands: false, identityThreshold: 0.7 });
    expect(hit).toBeTruthy();
    expect(hit.metrics.substitutions).toBeGreaterThanOrEqual(1);
    expect(hit.metrics.identity).not.toBeNull();
    expect(Number.isFinite(hit.metrics.identity)).toBe(true);
    expect(hit.metrics.identity).toBeLessThan(1);
  });

  it('compatibility-era metric fields are gone from DNA Search occurrences', () => {
    const [hit] = seqMatch('ACGTACGT', { seq: 'TTACGTACGTTT', topology: 'linear' }, null,
      { bothStrands: false });
    expect(hit.metrics.identity).toBe(1);
    expect(hit.metrics).not.toHaveProperty('compatibility');
    expect(hit.metrics).not.toHaveProperty('identityLowerBound');
    expect(hit.metrics).not.toHaveProperty('uncertainMatches');
    expect(hit.metrics).not.toHaveProperty('compatibleMatches');
  });
});
