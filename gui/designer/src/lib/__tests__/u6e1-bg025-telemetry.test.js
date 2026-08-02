/**
 * U6-E1 — WHERE the budget goes on the molecule that blacks out the library (BG-025).
 *
 * The measurement that found it went through the worker, and the worker's error payload carries a
 * code and nothing else — `limitedAxis` is deliberately dropped at that boundary, so «which axis
 * ran out» was still a guess. This calls the engine DIRECTLY, on the real molecule shipped with the
 * app, and reads the meter the engine itself keeps.
 *
 * Nothing is changed here: no budget is raised, no timeout is touched, no contract is relaxed. The
 * point is to replace a hypothesis (repeats → verifier) with a measured axis and a set of counters,
 * so that any later fix can be aimed rather than guessed at.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { dnaGappedSessionSteps } from '../dna-gapped-session-steps';
import { drainSync } from '../dna-search-cooperative';

const CATALOGUE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'plasmids-data');
const CULPRIT = 'pHAGE-TO-nls-st1dCas9-3nls-3XTagBFP2';
/** The query that actually triggered it, and where it comes from — both are shipped molecules. */
const QUERY_SOURCE = 'mRuby';
const QUERY_AT = 84;
const QUERY_LEN = 100;

/** A molecule as the product ships it — not a reconstruction, not a synthetic stand-in. */
function loadPlasmid(name) {
  for (const f of readdirSync(CATALOGUE).sort()) {
    if (!f.endsWith('.json')) continue;
    const raw = JSON.parse(readFileSync(join(CATALOGUE, f), 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.plasmids || Object.values(raw).find(Array.isArray) || []);
    const hit = arr.find((p) => p && p.name === name && p.sequence);
    if (hit) return { name: hit.name, seq: String(hit.sequence).toUpperCase(), file: f };
  }
  return null;
}

/** A deterministic 100-mer present in no molecule — the CONTROL, not the trigger. */
function randomMiss() {
  let a = 20260801;
  let out = '';
  for (let i = 0; i < QUERY_LEN; i += 1) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    out += 'ACGT'[(a >>> 9) % 4];
  }
  return out;
}

const run = (q, seq, identity) => drainSync(dnaGappedSessionSteps(q, seq, {
  thresholdBps: Math.round(identity * 10000),
  bothStrands: true,
  circular: true,
  limit: 500,
  collectStats: true,
}));

describe('U6-E1 — BG-025: which axis runs out', () => {
  const culprit = loadPlasmid(CULPRIT);
  const source = loadPlasmid(QUERY_SOURCE);
  /**
   * NOT a random query. The first attempt at this diagnosis used a random 100-mer and the molecule
   * completed at 80 % in 22 ms — which disproved «this molecule is expensive» outright. The trigger
   * is the PAIR: a query taken from `mRuby` against a molecule carrying three copies of TagBFP2.
   * Both are red-fluorescent-protein derivatives, so the query is homologous to a multi-copy element
   * in that molecule, and at 80 % the candidate set explodes. Repeats alone are not the cause;
   * repeats of something the query resembles are.
   */
  const query = source ? source.seq.slice(QUERY_AT, QUERY_AT + QUERY_LEN) : null;

  it('both molecules ship with the app, and there is no exact occurrence', () => {
    expect(culprit).toBeTruthy();
    expect(culprit.seq.length).toBe(12284);
    expect(source).toBeTruthy();
    expect(query).toHaveLength(QUERY_LEN);
    expect(culprit.seq.includes(query)).toBe(false); // so an approximate pass is unavoidable
  });

  it('85% completes, 80% does not, and the exhausted axis is named', () => {
    const at85 = run(query, culprit.seq, 0.85);
    const at80 = run(query, culprit.seq, 0.8);

    const table = (label, s) => [
      `  ${label}`,
      `    incomplete=${s.incomplete}  reason=${s.reason || '—'}  limitedAxis=${s.stats.limitedAxis || '—'}`,
      `    scanPositions=${s.stats.scanPositions}  rawStarts=${s.stats.rawStarts}  alignCalls=${s.stats.alignCalls}`,
      `    scoreStates=${s.stats.scoreStates}  tracebackCount=${s.stats.tracebackCount}  tracebackLinks=${s.stats.tracebackLinks}`,
      `    beforePrune=${s.stats.beforePrune}  retainedLoci=${s.stats.retainedLoci}  peakFrontier=${s.stats.peakFrontier}`,
      `    attempts=${s.stats.attempts} accepted=${s.stats.accepted} duplicates=${s.stats.duplicates} boundPruned=${s.stats.boundPruned}`,
      `    scanMs=${s.stats.scanMs} alignMs=${s.stats.alignMs} pruneMs=${s.stats.pruneMs} totalMs=${s.stats.totalMs}`,
      `    budgets=${JSON.stringify(s.stats.budgets)}`,
    ].join('\n');
    // Printed rather than only asserted: the numbers ARE the deliverable of this test, and a later
    // reader needs the shape of the blow-up, not merely the fact that it blew up.
    console.log(`\nBG-025 "${culprit.name}" (${culprit.seq.length} bp), 100 nt query with no exact occurrence\n${table('85 %', at85)}\n${table('80 %', at80)}`);

    expect(at85.incomplete).toBe(false);
    expect(at80.incomplete).toBe(true);
    expect(at80.reason).toBe('RESOURCE_LIMIT');

    // PIN THE DIAGNOSIS, not merely the failure. `toContain` over all four axes would pass whichever
    // axis ran out and would keep passing if the cause moved — which is precisely what a diagnosis
    // must not do.
    expect(at80.stats.limitedAxis).toBe('verifier');
    const b80 = at80.stats.budgets;
    // Exhaustion is exact: the meter stops at the first charge that crosses the line.
    expect(b80.verifier.used).toBe(b80.verifier.budget + 1);
    // And the other three axes are nowhere near their limits — «the verifier ran out» is a claim
    // about which resource, and it is only true if the others did not.
    expect(b80.scan.used).toBeLessThan(b80.scan.budget);
    expect(b80.traceback.used).toBeLessThan(b80.traceback.budget);
    expect(b80.output.used).toBeLessThan(b80.output.budget);
    // Nothing here is timed: wall-clock would make the diagnosis depend on the machine.
  });

  it('CONTROL: a random miss on the same molecule completes easily', () => {
    // The molecule on its own is not the problem. This is the check that stops the diagnosis from
    // being «12 kb of repeats is expensive», which is false and would send a fix in the wrong place.
    const s = run(randomMiss(), culprit.seq, 0.8);
    console.log(`  control (random query, same molecule): incomplete=${s.incomplete} alignCalls=${s.stats.alignCalls} scoreStates=${s.stats.scoreStates}`);
    expect(s.incomplete).toBe(false);
    // Not «cheaper» — ZERO. No candidate survives the scan, so no alignment is ever attempted: the
    // molecule on its own costs nothing, and the pair is the whole story.
    expect(s.stats.alignCalls).toBe(0);
    expect(s.stats.scoreStates).toBe(0);
  });

  it('CONTROL: the same query over a random molecule of the same length completes easily', () => {
    // Same length, ordinary composition: this isolates the PAIR from either half of it.
    let a = 777;
    let ordinary = '';
    for (let i = 0; i < culprit.seq.length; i += 1) {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      ordinary += 'ACGT'[(a >>> 11) % 4];
    }
    const s = run(query, ordinary, 0.8);
    console.log(`  control (random ${ordinary.length} bp): incomplete=${s.incomplete} scanPositions=${s.stats.scanPositions} alignCalls=${s.stats.alignCalls} scoreStates=${s.stats.scoreStates}`);
    expect(s.incomplete).toBe(false);
    expect(s.stats.alignCalls).toBe(0);
    expect(s.stats.scoreStates).toBe(0);
  });
});
