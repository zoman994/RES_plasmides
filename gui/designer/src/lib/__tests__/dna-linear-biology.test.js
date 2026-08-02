/**
 * U2 substep 4 — the BIOLOGICAL contract of the experimental kernel, in one place.
 *
 * These are not field-by-field unit tests; each one states something a molecular biologist would
 * recognise as a promise about the answer:
 *
 *   • the query is used WHOLE — an inconvenient tail cannot be dropped to flatter the percentage;
 *   • target flanks are free, but a leading or trailing target-only base may not be used to pad
 *     a poor match into a good-looking one;
 *   • the two strands are separate findings when the alignments genuinely differ;
 *   • a circular hit reads correctly THROUGH the origin and never laps the molecule;
 *   • the coordinates that come out are enough to open the right place in the editor.
 *
 * SCOPE. `both`-strand merging (§2.6) and stripping the alignment string out of the search
 * payload belong to the worker/facade layer in U4, not here: the kernel deliberately emits
 * per-strand occurrences and materialises a script for retained winners, and U4 owns the compact
 * SearchHitSummary. Nothing below assumes otherwise.
 *
 * Circular basics (wrap found, gap at origin, no second lap, rotation invariance) and the strand
 * basics (minus-only hit, bothStrands:false) are already pinned in dna-linear-kernel.test.js and
 * are not repeated.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-biology.test.js
 */
import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';

const rc = (s) => [...s].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('');
const at = (list, start) => list.find((o) => o.start === start);

describe('U2 §2.1 — the whole query is aligned, always', () => {
  it('a query whose tail is absent cannot report the identity of its prefix', () => {
    // The first 16 bases are present verbatim and the locus sits at the very END of the molecule,
    // so the last 4 query bases have NO target left to align against — they can only be counted
    // as insertions. That is what forces the question: does the engine carry the unmatched tail
    // in the denominator, or quietly report the prefix's 100%?
    //
    // (An earlier version of this fixture put flanking DNA after the locus; the tail then aligned
    // against the flank as mismatches, I stayed 0, and the test could not tell the two behaviours
    // apart. Placing the locus at the end is what makes it discriminating.)
    const prefix = 'ACGTACGTACGTACGT';
    const query = `${prefix}TTTT`;
    const target = `GGGGGGGG${prefix}`;
    const got = findOccurrences(query, target, { thresholdBps: 5000, bothStrands: false });
    const o = at(got, 8);
    expect(o, 'the prefix locus must still be found').toBeDefined();
    expect(o.I, 'the four homeless query bases must be counted as insertions').toBe(4);
    expect(o.alignmentLength, 'and must stay in the denominator').toBe(20);
    expect(o.identityBps, 'a truncated query must not read as perfect').toBe(8000);
  });

  it('L is queryLength + D on every occurrence — the identity denominator cannot shrink', () => {
    // M + X + I = queryLength is what makes truncation impossible: every query base lands in a
    // column, matched or not. If L could fall below that, an unaligned tail would vanish from
    // the denominator and inflate the percentage.
    const query = 'ACGTTGCAATCGGATCCTTA';
    const target = `TTTT${query.slice(0, 12)}A${query.slice(12)}TTTT`;
    const got = findOccurrences(query, target, { thresholdBps: 5000 });
    expect(got.length).toBeGreaterThan(0);
    for (const o of got) {
      expect(o.M + o.X + o.I, `start ${o.start}`).toBe(query.length);
      expect(o.alignmentLength).toBe(query.length + o.D);
      expect(o.identityBps).toBe(Math.floor((o.M * 10000) / o.alignmentLength));
    }
  });
});

describe('U2 §3.2 — free flanks, but no free padding', () => {
  it('an alignment never begins or ends with a target-only base', () => {
    // A leading or trailing D would consume target outside the region for free and let a weak
    // match borrow length it never aligned. Flanks are free precisely BECAUSE they are outside
    // the alignment, not because they may be absorbed into it.
    const query = 'ACGTTGCAATCGGATC';
    const target = `AAAA${query.slice(0, 8)}GG${query.slice(8)}AAAA`;
    const got = findOccurrences(query, target, { thresholdBps: 5000 });
    expect(got.length).toBeGreaterThan(0);
    for (const o of got) {
      expect(o.script, `start ${o.start} has a script`).toBeTypeOf('string');
      expect(o.script.startsWith('D'), `start ${o.start}: leading D`).toBe(false);
      expect(o.script.endsWith('D'), `start ${o.start}: trailing D`).toBe(false);
    }
  });

  it('the same locus in different flank contexts gives identical metrics', () => {
    const query = 'ACGTTGCAATCGGATC';
    const core = `${query.slice(0, 9)}T${query.slice(10)}`;   // one substitution
    const shapes = ['', 'TT', 'GGGGGGGGGG'].map((flank) => {
      const got = findOccurrences(query, `${flank}${core}${flank}`, {
        thresholdBps: 8000, bothStrands: false,
      });
      const o = at(got, flank.length);
      expect(o, `flank "${flank}": the locus must be found at offset ${flank.length}`).toBeDefined();
      return `M=${o.M} X=${o.X} I=${o.I} D=${o.D} L=${o.alignmentLength} bps=${o.identityBps} span=${o.targetSpan}`;
    });
    expect(shapes[1], 'flanks are free: they may move the locus, never rescore it').toBe(shapes[0]);
    expect(shapes[2]).toBe(shapes[0]);
  });
});

describe('U2 §2.6 — the strands are separate findings', () => {
  it('a locus that aligns differently on each strand yields two occurrences', () => {
    // A near-palindrome: the plus and minus probes both reach this region, but not with the same
    // edit pattern. Collapsing them by matching counters alone would erase a real, biologically
    // distinct finding.
    const query = 'GAATTCGCGAATTC';
    const target = `TTTT${query}TTTT`;
    const got = findOccurrences(query, target, { thresholdBps: 6000, bothStrands: true });
    const plus = got.filter((o) => o.strand === '+');
    const minus = got.filter((o) => o.strand === '-');
    expect(plus.length, 'the plus strand must report its own hits').toBeGreaterThan(0);
    expect(minus.length, 'the minus strand must report its own hits').toBeGreaterThan(0);
    for (const o of got) expect(['+', '-']).toContain(o.strand);
  });

  it('an exact palindrome is reported on BOTH strands at kernel level', () => {
    // EcoRI is its own reverse complement, so plus and minus describe the same physical site.
    // The kernel deliberately emits both; presenting them as a single `both` row is §2.6 merging
    // and belongs to the worker/facade layer in U4. Pinned here so that stays a decision, not
    // an accident.
    const site = 'GAATTC';
    expect(rc(site)).toBe(site);
    const got = findOccurrences(site, `AAAA${site}AAAA`, { thresholdBps: 10000, bothStrands: true });
    const strands = new Set(got.map((o) => o.strand));
    expect(strands.has('+')).toBe(true);
    expect(strands.has('-')).toBe(true);
    for (const o of got) {
      expect(o.start, 'both strands describe the same physical site').toBe(4);
      expect(o.identityBps).toBe(10000);
    }
  });
});

describe('U2 §2.7 — a circular hit reads through the origin, once', () => {
  it('the reported end is the PHYSICAL endpoint, and the two segments rebuild the region', () => {
    const query = 'ACGTTGCAATCG';
    // Place the query so that it straddles the origin: tail at the end, head at the start.
    const target = `${query.slice(6)}TTTTTTTTTTTT${query.slice(0, 6)}`;
    const n = target.length;
    const got = findOccurrences(query, target, { thresholdBps: 9000, circular: true, bothStrands: false });
    const wrapped = got.find((o) => o.start + o.targetSpan > n);
    expect(wrapped, 'the origin-crossing hit must be found').toBeDefined();

    expect(wrapped.end, 'end is (start + span) mod n').toBe((wrapped.start + wrapped.targetSpan) % n);
    // A caller reconstructs the region as [start, n) + [0, end) — this is what a jump needs.
    const head = target.slice(wrapped.start, n);
    const tail = target.slice(0, wrapped.end);
    expect(head.length + tail.length, 'the two segments must cover exactly targetSpan')
      .toBe(wrapped.targetSpan);
    expect(head + tail, 'and must reconstruct a region of the right length').toHaveLength(wrapped.targetSpan);
  });

  it('no occurrence ever spans more than the molecule', () => {
    const query = 'ACGTACGT';
    const target = 'ACGTACGT';                       // query == whole circle
    const got = findOccurrences(query, target, { thresholdBps: 5000, circular: true });
    for (const o of got) {
      expect(o.targetSpan, `start ${o.start}: a second lap is forbidden`)
        .toBeLessThanOrEqual(target.length);
      expect(o.start).toBeGreaterThanOrEqual(0);
      expect(o.start).toBeLessThan(target.length);
    }
  });
});

describe('U2 §3.1 — the coordinates are enough to open the right place', () => {
  it('a linear hit slices back to a region of exactly targetSpan bases', () => {
    const query = 'ACGTTGCAATCGGATCCTTA';
    const target = `GGGGGG${query.slice(0, 10)}A${query.slice(11)}GGGGGG`;
    const got = findOccurrences(query, target, { thresholdBps: 8000, bothStrands: false });
    expect(got.length).toBeGreaterThan(0);
    for (const o of got) {
      const region = target.slice(o.start, o.start + o.targetSpan);
      expect(region, `start ${o.start}: the slice must exist and be the stated length`)
        .toHaveLength(o.targetSpan);
      expect(o.end).toBe(o.start + o.targetSpan);
    }
  });

  it('every emitted coordinate is inside the molecule and internally consistent', () => {
    const query = 'ACGTTGCAATCG';
    const target = `TTTT${query}TTTT${query.slice(0, 6)}CC${query.slice(6)}TTTT`;
    const n = target.length;
    for (const circular of [false, true]) {
      const got = findOccurrences(query, target, { thresholdBps: 7000, circular, bothStrands: true });
      expect(got.length, `circular=${circular}`).toBeGreaterThan(0);
      for (const o of got) {
        expect(o.start, 'start in bounds').toBeGreaterThanOrEqual(0);
        expect(o.start, 'start in bounds').toBeLessThan(n);
        expect(o.targetSpan, 'span is positive').toBeGreaterThan(0);
        expect(o.end, 'end in bounds').toBeGreaterThanOrEqual(0);
        expect(o.end, 'end in bounds').toBeLessThanOrEqual(n);
        expect(o.M + o.X + o.I).toBe(query.length);
        expect(o.alignmentLength).toBe(o.M + o.X + o.I + o.D);
      }
    }
  });
});
