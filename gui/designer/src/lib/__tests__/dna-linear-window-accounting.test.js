/**
 * U2 substep 3 corrective — the window sweep's accounting, tested DIRECTLY.
 *
 * WHY DIRECTLY. An end-to-end probe cannot pin this. `windowAccept` is charged `m × Lw` where
 * `Lw` is the width of a CANDIDATE WINDOW, not of the molecule, so padding a target with
 * neutral DNA that yields no candidates leaves `verifierUsed` unchanged — that is the filter
 * working, not a lost charge. An earlier measurement read that flat number as evidence of a
 * missing charge; it was the experiment that was wrong. These tests call the real exported
 * function with a fake `ctl` and assert the exact arguments, which is the only thing that can
 * tell "charged correctly" from "charged at all".
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-window-accounting.test.js
 */
import { describe, it, expect } from 'vitest';
import { windowAccept } from '../dna-linear-scan';
import { findOccurrences } from '../dna-linear-kernel';

/** Records every hook call in order, so both the VALUES and the ORDER can be asserted. */
function recordingCtl(overrides = {}) {
  const calls = [];
  return {
    calls,
    chargeVerifier: (n) => { calls.push(['chargeVerifier', n]); if (overrides.chargeVerifier) overrides.chargeVerifier(n); },
    checkCancel: () => { calls.push(['checkCancel']); if (overrides.checkCancel) overrides.checkCancel(); },
    noteWindow: (b) => { calls.push(['noteWindow', b]); },
    noteObjects: (c) => { calls.push(['noteObjects', c]); },
    noteFixed: (b) => { calls.push(['noteFixed', b]); },
    noteTraceback: (b) => { calls.push(['noteTraceback', b]); },
    chargeTraceback: (n) => { calls.push(['chargeTraceback', n]); },
    chargeOutput: (n) => { calls.push(['chargeOutput', n]); },
    charge: (n) => { calls.push(['charge', n]); },
    cancelStride: 4096,
  };
}

const CODES = { A: 0, C: 1, G: 2, T: 3 };
const enc = (s) => Uint8Array.from([...s].map((c) => CODES[c]));

describe('U2 §3.3 — the window DP charges exactly what it does', () => {
  it('m=5, Lw=7 charges chargeVerifier(35) and noteWindow(192)', () => {
    const ctl = recordingCtl();
    const q = enc('ACGTA');                 // m = 5
    const ext = enc('ACGTACG');             // window [0,7) -> Lw = 7
    windowAccept(q, ext, 0, 7, 8000, () => {}, ctl);

    const charge = ctl.calls.find((c) => c[0] === 'chargeVerifier');
    const note = ctl.calls.find((c) => c[0] === 'noteWindow');
    expect(charge, 'the sweep must be charged at all').toBeDefined();
    expect(charge[1], 'm x Lw = 5 x 7').toBe(35);
    expect(note, 'the sweep must report its bytes').toBeDefined();
    expect(note[1], 'three Float64Array of (Lw+1) = 24 x 8').toBe(192);
  });

  it('the charge tracks the WINDOW width, not the target length', () => {
    const q = enc('ACGTA');
    const ext = enc('ACGTACGTACGTACGTACGT');
    const wide = recordingCtl();
    const narrow = recordingCtl();
    windowAccept(q, ext, 0, 20, 8000, () => {}, wide);
    windowAccept(q, ext, 10, 20, 8000, () => {}, narrow);
    const of = (c) => c.calls.find((x) => x[0] === 'chargeVerifier')[1];
    expect(of(wide), 'Lw = 20').toBe(5 * 20);
    expect(of(narrow), 'Lw = 10').toBe(5 * 10);
  });

  it('a degenerate window (Lw < 1) charges nothing and allocates nothing', () => {
    const ctl = recordingCtl();
    windowAccept(enc('ACGTA'), enc('ACGTA'), 5, 5, 8000, () => {}, ctl);
    expect(ctl.calls).toEqual([]);
  });
});

describe('U2 §3.3 — end to end, the charge grows with CANDIDATE work', () => {
  // The right way to scale this end to end is to replicate the LOCUS, not to pad with neutral
  // DNA. `Lw` is the width of a candidate window: adding sequence that yields no candidates adds
  // no windows and must leave the charge flat — that is the filter doing its job, and reading it
  // as a lost charge is what sent an earlier investigation down a blind alley. Replicating the
  // locus adds real windows, so the charge must rise.
  const LOCUS = 'ACGTTGCAATCGGATCCTTA';
  const GAP = 'T'.repeat(300);            // yields no candidates for this query at 80%

  const usedFor = (copies) => {
    const telemetry = {};
    let target = GAP;
    for (let i = 0; i < copies; i++) target += LOCUS + GAP;
    findOccurrences(LOCUS, target, {
      thresholdBps: 8000,
      bothStrands: false,
      budgets: { scan: null, verifier: null, traceback: null, output: null },
      telemetry,
    });
    return telemetry;
  };

  it('1 -> 2 -> 4 copies of the locus strictly increase verifier work', () => {
    const one = usedFor(1);
    const two = usedFor(2);
    const four = usedFor(4);
    expect(two.verifierUsed, '2 loci must cost more than 1').toBeGreaterThan(one.verifierUsed);
    expect(four.verifierUsed, '4 loci must cost more than 2').toBeGreaterThan(two.verifierUsed);
  });

  it('the same replication raises the output count', () => {
    expect(usedFor(4).outputUsed).toBeGreaterThan(usedFor(1).outputUsed);
  });

  it('padding with NON-candidate DNA does not raise verifier work', () => {
    // The control for the test above, and the correction of the earlier mis-reading: a flat
    // number here is the expected, correct behaviour.
    const short = usedFor(1);
    const telemetry = {};
    findOccurrences(LOCUS, `${GAP}${GAP}${GAP}${LOCUS}${GAP}${GAP}${GAP}`, {
      thresholdBps: 8000,
      bothStrands: false,
      budgets: { scan: null, verifier: null, traceback: null, output: null },
      telemetry,
    });
    expect(telemetry.verifierUsed, 'more neutral DNA, same candidate work')
      .toBe(short.verifierUsed);
    expect(telemetry.scanUsed, 'the SCAN axis, by contrast, must grow with the molecule')
      .toBeGreaterThan(short.scanUsed);
  });
});

describe('U2 §4.2.1(10) — the sweep is cancellable from inside its own loop', () => {
  it('a 64-row query checks twice: once on entry, once at row 64', () => {
    const SENTINEL = { sentinel: 'window-cancel' };
    let seen = 0;
    const ctl = recordingCtl({
      checkCancel: () => { seen += 1; if (seen === 2) throw SENTINEL; },
    });
    const q = enc('ACGT'.repeat(16));        // m = 64
    const ext = enc('ACGT'.repeat(16));
    let thrown = null;
    try { windowAccept(q, ext, 0, 64, 8000, () => {}, ctl); } catch (e) { thrown = e; }

    expect(thrown, 'the in-loop checkpoint must be able to stop the sweep').toBe(SENTINEL);
    expect(seen, 'entry check + row-64 check').toBe(2);
  });

  it('without cancellation the sweep completes and still reports its numbers', () => {
    const ctl = recordingCtl();
    const q = enc('ACGT'.repeat(16));
    const ext = enc('ACGT'.repeat(16));
    windowAccept(q, ext, 0, 64, 8000, () => {}, ctl);
    expect(ctl.calls.some((c) => c[0] === 'noteWindow')).toBe(true);
  });
});

describe('U2 §4.2.1(10) — refused work is not reported as memory', () => {
  it('when the quota throws, noteWindow is never called', () => {
    // ORDER MATTERS: quota, then cancel, then allocate, then report. Reporting the bytes first
    // recorded a workspace that was never allocated, so a refused run inflated the high-water
    // mark with memory the engine did not take.
    const BOOM = { code: 'RESOURCE_LIMIT' };
    const ctl = recordingCtl({ chargeVerifier: () => { throw BOOM; } });
    let thrown = null;
    try { windowAccept(enc('ACGTA'), enc('ACGTACG'), 0, 7, 8000, () => {}, ctl); } catch (e) { thrown = e; }
    expect(thrown).toBe(BOOM);
    expect(ctl.calls.some((c) => c[0] === 'noteWindow'), 'no allocation happened, so none may be reported')
      .toBe(false);
  });

  it('when cancellation throws, noteWindow is never called', () => {
    const BOOM = { code: 'SEARCH_ABORT' };
    const ctl = recordingCtl({ checkCancel: () => { throw BOOM; } });
    let thrown = null;
    try { windowAccept(enc('ACGTA'), enc('ACGTACG'), 0, 7, 8000, () => {}, ctl); } catch (e) { thrown = e; }
    expect(thrown).toBe(BOOM);
    expect(ctl.calls.some((c) => c[0] === 'noteWindow')).toBe(false);
  });

  it('on the happy path the order is charge -> cancel -> note', () => {
    const ctl = recordingCtl();
    windowAccept(enc('ACGTA'), enc('ACGTACG'), 0, 7, 8000, () => {}, ctl);
    const names = ctl.calls.map((c) => c[0]);
    expect(names.indexOf('chargeVerifier')).toBeLessThan(names.indexOf('checkCancel'));
    expect(names.indexOf('checkCancel')).toBeLessThan(names.indexOf('noteWindow'));
  });
});
