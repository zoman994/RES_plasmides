/**
 * U6-F — BG-025 on the resumable linear verifier: the same biology, inside the budget.
 *
 * WHAT THE DEFECT ACTUALLY IS. `pHAGE-TO-nls-st1dCas9-3nls-3XTagBFP2` carries three byte-identical
 * copies of `mTagBFP2`. A 100-nt query from `mRuby` is homologous to each of them, so at 80 % the
 * scanner proposes ~25 starts around every copy, ~15 of which clear the threshold — and all fifteen
 * describe the SAME physical locus, ending at the same base. The production verifier runs a separate
 * Pareto DP for each start before the canonical selection collapses them, which is why 45 admissible
 * variants of 3 real loci cost 5.54 M states against a 5 M budget: it is not the plasmid's size and
 * not the repeats as such, it is fifteen near-identical explanations recomputed independently.
 *
 * WHAT THE LINEAR PATH DOES INSTEAD. Myers candidates → merged overlapping windows → ONE score-only
 * DP per window → exact re-derivation of every admissible start → endpoint-shadow → traceback for
 * the surviving winners only. The work that the fifteen variants share is done once.
 *
 * This gate pins the ANSWER first and the cost second. A cheaper search that finds something else is
 * not a fix, so the coordinates, the counters and the canonical script are asserted before any
 * resource number is looked at.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { findOccurrences, findOccurrencesSteps } from '../dna-linear-kernel';
import { dnaGappedSessionSteps } from '../dna-gapped-session-steps';
import { drainSync, drainCooperative, SEARCH_CANCELLED } from '../dna-search-cooperative';

const CATALOGUE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'plasmids-data');
const CULPRIT = 'pHAGE-TO-nls-st1dCas9-3nls-3XTagBFP2';
const QUERY_SOURCE = 'mRuby';
const QUERY_AT = 84;
const QUERY_LEN = 100;

function loadPlasmid(name) {
  for (const f of readdirSync(CATALOGUE).sort()) {
    if (!f.endsWith('.json')) continue;
    const raw = JSON.parse(readFileSync(join(CATALOGUE, f), 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.plasmids || Object.values(raw).find(Array.isArray) || []);
    const hit = arr.find((p) => p && p.name === name && p.sequence);
    if (hit) return { name: hit.name, seq: String(hit.sequence).toUpperCase() };
  }
  return null;
}

const culprit = loadPlasmid(CULPRIT);
const source = loadPlasmid(QUERY_SOURCE);
const QUERY = source.seq.slice(QUERY_AT, QUERY_AT + QUERY_LEN);
const OPTS = {
  thresholdBps: 8000, bothStrands: true, circular: true,
};

describe('U6-F — BG-025: the linear verifier answers where the production one runs out', () => {
  it('the fixture is the real pair, and there is no exact occurrence', () => {
    expect(culprit.seq).toHaveLength(12284);
    expect(QUERY).toHaveLength(QUERY_LEN);
    expect(culprit.seq.includes(QUERY)).toBe(false);
  });

  it('the production verifier still exhausts the verifier axis on this pair', () => {
    // Not a regression test for the linear path — the CONTRAST. If this ever stops failing, the
    // premise of the whole package has changed and the numbers below mean something different.
    const s = drainSync(dnaGappedSessionSteps(QUERY, culprit.seq, {
      thresholdBps: 8000, bothStrands: true, circular: true, limit: 500, collectStats: true,
    }));
    expect(s.incomplete).toBe(true);
    expect(s.reason).toBe('RESOURCE_LIMIT');
    expect(s.stats.limitedAxis).toBe('verifier');
    expect(s.stats.budgets.verifier.used).toBe(s.stats.budgets.verifier.budget + 1);
  });

  it('the linear verifier completes, and finds exactly three loci at 6579 / 7308 / 8037', () => {
    const telemetry = {};
    const out = findOccurrences(QUERY, culprit.seq, { ...OPTS, telemetry });
    expect(out.map((o) => o.start).sort((a, b) => a - b)).toEqual([6579, 7308, 8037]);
    expect(out).toHaveLength(3);
    for (const o of out) {
      expect({
        M: o.M, X: o.X, I: o.I, D: o.D,
      }).toEqual({
        M: 88, X: 11, I: 1, D: 2,
      });
      // The three copies are byte-identical, so the three alignments must be too — same script, not
      // merely the same counters.
      expect(o.script).toBe(out[0].script);
      expect(o.strand).toBe(out[0].strand);
    }
  });

  it('the cost is the point: verifier work and tracebacks both collapse', () => {
    const telemetry = {};
    findOccurrences(QUERY, culprit.seq, { ...OPTS, telemetry });
    // Against 5.54 M states on the production path, of which 5 M was the budget.
    expect(telemetry.verifierUsed).toBeLessThan(1_000_000);
    // One script per surviving locus, not one per admissible start.
    expect(telemetry.tracebacksMaterialized).toBeLessThanOrEqual(3);
    console.log(`  BG-025 linear: verifier=${telemetry.verifierUsed} tracebacks=${telemetry.tracebacksMaterialized} candidateEnds=${telemetry.candidateEnds} rawStarts=${telemetry.rawStarts} verifiedStarts=${telemetry.verifiedStarts} retained=${telemetry.retainedLoci}`);
  });

  it('the default cooperative drive really cancels it mid-run', async () => {
    // The whole point of making the kernel resumable. The flag flips on a macrotask AFTER the drive
    // has begun, the default yield function is used exactly as the worker uses it, and the fact that
    // work started is observed rather than assumed.
    let cancelled = false;
    let started = 0;
    const gen = findOccurrencesSteps(QUERY, culprit.seq, OPTS);
    const counting = (function* count() {
      let st = gen.next();
      while (!st.done) { started += 1; yield; st = gen.next(); }
      return st.value;
    }());
    setTimeout(() => { cancelled = true; }, 0);
    const err = await drainCooperative(counting, { shouldCancel: () => cancelled })
      .then(() => null, (e) => e);
    expect(started).toBeGreaterThan(0);
    expect(err).toBeTruthy();
    expect(err.code).toBe(SEARCH_CANCELLED);
  });

  it('and it is interruptible while it does that', () => {
    // The one property that kept this kernel out of production: a synchronous run holds the thread,
    // so a worker cannot take delivery of a cancel frame at all. Suspensions are what make the
    // cancel observable, and this pair is exactly the case that used to run for a second.
    const gen = findOccurrencesSteps(QUERY, culprit.seq, OPTS);
    let steps = 0;
    let st = gen.next();
    while (!st.done) { steps += 1; st = gen.next(); }
    expect(steps).toBeGreaterThan(50);
    expect(st.value).toHaveLength(3);
  });
});
