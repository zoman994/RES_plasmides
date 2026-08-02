/**
 * K3.2 — the D-key prototype must be INDISTINGUISHABLE from the accepted K3.1 engine.
 *
 * This is a replacement candidate for the innermost part of the search, so the bar is not «finds
 * the motif» but «returns the same bytes». Two independent references are used on purpose:
 *
 *   • the K3.1 frontier engine — the thing it would replace, currently in production;
 *   • the oracle — an independently written reference, so a shared misconception in the two
 *     production kernels cannot pass unnoticed.
 *
 * Nothing here wires the prototype into the product. It runs through the same pipeline via an
 * explicit `kernel: 'dkey'` seam, so what is compared is the whole search, not a hand-rebuilt
 * imitation of it.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSearch } from '../dna-gapped-search';
import { oracleSearchLinear, pruneEndpointShadows } from './helpers/glocal-oracle';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const randFrom = (rnd, alphabet, len) => {
  let o = '';
  for (let i = 0; i < len; i++) o += alphabet[Math.floor(rnd() * alphabet.length)];
  return o;
};
/** Everything a caller can observe about a hit — counts, coordinates AND the canonical script. */
const shape = (h) => ({
  start: h.start,
  end: h.end,
  subs: h.metrics.substitutions,
  ins: h.metrics.insertions,
  del: h.metrics.deletions,
  L: h.metrics.alignmentLength,
  M: h.metrics.exactMatches,
  gaps: h.metrics.indelEvents,
  span: h.metrics.targetSpan,
  script: h.script,
  runs: h.editRuns.map((r) => `${r.op}${r.length}@${r.probeStart}:${r.targetOffsetStart}`).join(','),
});
const oShape = (h) => ({
  start: h.targetStart, end: h.targetEnd, subs: h.X, ins: h.I, del: h.D, L: h.L, script: h.script,
});
const oCmp = (h) => ({
  start: h.start, end: h.end, subs: h.metrics.substitutions, ins: h.metrics.insertions,
  del: h.metrics.deletions, L: h.metrics.alignmentLength, script: h.script,
});

const dkey = (q, t, o = {}) => dnaGappedSearch(q, t, { kernel: 'dkey', ...o });
const frontier = (q, t, o = {}) => dnaGappedSearch(q, t, o);

describe('K3.2 — D-key ≡ K3.1 frontier', () => {
  it('EXHAUSTIVE: every query≤3 × target≤4 over ACGT, at 3 thresholds', () => {
    const alpha = 'ACGT';
    const words = (maxLen) => {
      const out = [];
      const rec = (s) => {
        if (s.length) out.push(s);
        if (s.length === maxLen) return;
        for (const c of alpha) rec(s + c);
      };
      rec('');
      return out;
    };
    const queries = words(3);
    const targets = words(4);
    let withHits = 0;
    for (const tBps of [10000, 8000, 6000]) {
      for (const q of queries) {
        for (const t of targets) {
          const a = dkey(q, t, { thresholdBps: tBps }).map(shape);
          const b = frontier(q, t, { thresholdBps: tBps }).map(shape);
          expect(a, `q=${q} t=${t} thr=${tBps}`).toEqual(b);
          if (a.length) withHits += 1;
        }
      }
    }
    expect(withHits).toBeGreaterThan(1000);
  }, 600_000);

  it('longer random pairs, both strands, several thresholds', () => {
    const rnd = lcg(0xD1CE);
    for (let n = 0; n < 400; n++) {
      const q = randFrom(rnd, 'ACGT', 4 + Math.floor(rnd() * 12));
      const t = randFrom(rnd, 'ACGT', 8 + Math.floor(rnd() * 30));
      const opts = { thresholdBps: [6000, 7000, 8000, 9000][n % 4], bothStrands: n % 2 === 0 };
      expect(dkey(q, t, opts).map(shape), `q=${q} t=${t}`).toEqual(frontier(q, t, opts).map(shape));
    }
  }, 300_000);

  it('implanted near-exact hits — the shape that actually matters for the gate', () => {
    const rnd = lcg(0xBEEF);
    for (let n = 0; n < 60; n++) {
      const bg = randFrom(rnd, 'ACGT', 400);
      const at = 150;
      const len = 20 + Math.floor(rnd() * 60);
      let probe = bg.slice(at, at + len);
      // perturb: one substitution, one deletion, one insertion — the realistic biology
      const mut = n % 3;
      const p = 5 + Math.floor(rnd() * (len - 10));
      if (mut === 0) probe = probe.slice(0, p) + (probe[p] === 'A' ? 'C' : 'A') + probe.slice(p + 1);
      else if (mut === 1) probe = probe.slice(0, p) + probe.slice(p + 1);
      else probe = `${probe.slice(0, p)}G${probe.slice(p)}`;
      const opts = { thresholdBps: 8000, bothStrands: true };
      expect(dkey(probe, bg, opts).map(shape), `n=${n}`).toEqual(frontier(probe, bg, opts).map(shape));
    }
  }, 300_000);

  it('circular targets, including hits that cross the origin', () => {
    const rnd = lcg(0xC141);
    for (let n = 0; n < 120; n++) {
      const ring = randFrom(rnd, 'ACGT', 12 + Math.floor(rnd() * 10));
      const q = randFrom(rnd, 'ACGT', 4 + Math.floor(rnd() * 5));
      const opts = { thresholdBps: 7000, circular: true, bothStrands: n % 2 === 0 };
      expect(dkey(q, ring, opts).map(shape), `q=${q} ring=${ring}`).toEqual(frontier(q, ring, opts).map(shape));
    }
  }, 300_000);

  it('DIFFERENTIAL vs the ORACLE too — not just vs the other production kernel', () => {
    for (const [seed, tBps] of [[0xA1, 10000], [0xB2, 8000], [0xC3, 6000]]) {
      const rnd = lcg(seed);
      let nonEmpty = 0;
      for (let n = 0; n < 150; n++) {
        const q = randFrom(rnd, 'ACGT', 1 + Math.floor(rnd() * 5));
        const t = randFrom(rnd, 'ACGT', 1 + Math.floor(rnd() * 10));
        const ref = pruneEndpointShadows(oracleSearchLinear(q, t, { thresholdBps: tBps })).map(oShape);
        expect(dkey(q, t, { thresholdBps: tBps }).map(oCmp), `q=${q} t=${t} thr=${tBps}`).toEqual(ref);
        if (ref.length) nonEmpty += 1;
      }
      expect(nonEmpty).toBeGreaterThan(10);
    }
  }, 300_000);

  it('the threshold bound behaves the same inside the new kernel (equality still survives)', () => {
    const [hit] = dkey('ACGTA', 'TTACGTTTT', { thresholdBps: 8000 });
    expect(hit).toBeTruthy();
    expect(hit.metrics.exactMatches).toBe(4);
    expect(hit.metrics.alignmentLength).toBe(5);
    expect(dkey('ACGTA', 'TTACGTTTT', { thresholdBps: 8001 })).toHaveLength(0);
    // and with the bound switched off the kernel must still agree with itself
    const rnd = lcg(0x0FF);
    for (let n = 0; n < 100; n++) {
      const q = randFrom(rnd, 'ACGT', 3 + Math.floor(rnd() * 6));
      const t = randFrom(rnd, 'ACGT', 6 + Math.floor(rnd() * 12));
      expect(dkey(q, t, { thresholdBps: 8000 }).map(shape))
        .toEqual(dkey(q, t, { thresholdBps: 8000, disableThresholdBound: true }).map(shape));
    }
  }, 300_000);

  it('an invalid query is still rejected fail-closed through the prototype path', () => {
    let thrown = null;
    try { dkey('ACGTNACGT', 'AAACGTACGTTT', { thresholdBps: 8000 }); } catch (e) { thrown = e; }
    expect(thrown?.code).toBe('INVALID_DNA');
  });
});
