import { describe, it, expect } from 'vitest';
import { sequenceLineEqual } from '../sequence-line-equal';

// Stable callback identity (real renders pass useCallback refs — the comparator
// is strict on callbacks by design, so the fixture must reuse one).
const noop = () => {};
const base = () => ({
  line: { start: 0, seq: 'ACGTACGTAC', kind: 'main' },        // line [0,10)
  fullSeq: 'ACGTACGTACGTACGTACGT',                            // 20 nt
  seqLength: 20,
  features: [], orfRanges: [], reSites: [],
  framesResolution: { strategy: 'single', dominant: null, coverage: 0 },
  charPx: 8, showAATrack: true, onAnnotationClick: noop,
});

describe('sequenceLineEqual — strict on non-relaxed props', () => {
  it('bails (true) when nothing changed', () => {
    expect(sequenceLineEqual(base(), base())).toBe(true);
  });
  it('re-renders (false) on any NON-relaxed scalar change', () => {
    expect(sequenceLineEqual(base(), { ...base(), charPx: 9 })).toBe(false);
    expect(sequenceLineEqual(base(), { ...base(), showAATrack: false })).toBe(false);
  });
  it('re-renders on a NON-relaxed callback identity change', () => {
    expect(sequenceLineEqual(base(), { ...base(), onAnnotationClick: () => {} })).toBe(false);
  });
});

describe('sequenceLineEqual — fullSeq windowed (codon straddle)', () => {
  it('bails when fullSeq changes OUTSIDE the line ±K window', () => {
    const b = base();
    const far = b.fullSeq.slice(0, 16) + 'A' + b.fullSeq.slice(17); // idx 16, line window is [0,13)
    expect(sequenceLineEqual(b, { ...b, fullSeq: far })).toBe(true);
  });
  it('re-renders when fullSeq changes INSIDE the line window (boundary codon context)', () => {
    const b = base();
    const near = b.fullSeq.slice(0, 11) + 'A' + b.fullSeq.slice(12); // idx 11 ∈ [0,13)
    expect(sequenceLineEqual(b, { ...b, fullSeq: near })).toBe(false);
  });
  it('re-renders when the line\'s own seq changes', () => {
    const b = base();
    expect(sequenceLineEqual(b, { ...b, line: { ...b.line, seq: 'TCGTACGTAC' } })).toBe(false);
  });
});

describe('sequenceLineEqual — overlap-scoped arrays', () => {
  it('re-renders on an OVERLAPPING feature change, bails on a non-overlapping one', () => {
    const f = { id: 'f1', start: 2, end: 6, type: 'CDS', name: 'x' };
    const withF = { ...base(), features: [f] };
    expect(sequenceLineEqual(withF, { ...withF, features: [{ ...f, name: 'y' }] })).toBe(false);
    const far = { id: 'f2', start: 50, end: 60, type: 'CDS', name: 'z' };
    const withFar = { ...base(), features: [far] };
    expect(sequenceLineEqual(withFar, { ...withFar, features: [{ ...far, name: 'z2' }] })).toBe(true);
  });
  it('re-renders on an overlapping ORF change', () => {
    const o = { start: 1, end: 9, strand: 1 };
    const a = { ...base(), orfRanges: [o] };
    expect(sequenceLineEqual(a, { ...a, orfRanges: [{ ...o, strand: -1 }] })).toBe(false);
  });
  it('re-renders on a nearby RE-site change (distal-cut margin), bails on a far one', () => {
    const s = { enzyme: 'BsaI', position: 25 }; // within RE_MARGIN(24) of line end 10 → [-14,34]
    const a = { ...base(), reSites: [s] };
    expect(sequenceLineEqual(a, { ...a, reSites: [{ ...s, enzyme: 'BsmBI' }] })).toBe(false);
    const farSite = { enzyme: 'BsaI', position: 200 };
    const aFar = { ...base(), reSites: [farSite] };
    expect(sequenceLineEqual(aFar, { ...aFar, reSites: [{ ...farSite, enzyme: 'BsmBI' }] })).toBe(true);
  });
  it('scopes shared primer projections to occurrences overlapping this line', () => {
    const near = {
      key: 'near', segments: [{ start: 2, end: 6 }], alignment: { runs: [{ op: 'M' }] },
    };
    const far = {
      key: 'far', segments: [{ start: 50, end: 60 }], alignment: { runs: [{ op: 'M' }] },
    };
    const withNear = { ...base(), primerOccurrences: [near] };
    const withFar = { ...base(), primerOccurrences: [far] };

    expect(sequenceLineEqual(withNear, {
      ...withNear,
      primerOccurrences: [{ ...near, alignment: { runs: [{ op: 'X' }] } }],
    })).toBe(false);
    expect(sequenceLineEqual(withFar, {
      ...withFar,
      primerOccurrences: [{ ...far, alignment: { runs: [{ op: 'X' }] } }],
    })).toBe(true);
  });
  it('treats an adjacent forward 5-prime tail as line-relevant projection paint', () => {
    const tailOnly = {
      key: 'tail-only',
      segments: [{ start: 12, end: 18 }],
      strand: 1,
      tail: 'AAAA',
      alignment: { runs: [{ op: 'M' }] },
    };
    const current = { ...base(), primerOccurrences: [tailOnly] };
    expect(sequenceLineEqual(current, {
      ...current,
      primerOccurrences: [{ ...tailOnly, tail: 'TTTT' }],
    })).toBe(false);
  });
  it('treats an adjacent reverse 5-prime tail as line-relevant projection paint', () => {
    const tailOnly = {
      key: 'reverse-tail-only',
      segments: [{ start: 2, end: 8 }],
      strand: -1,
      tail: 'AAAA',
      alignment: { runs: [{ op: 'M' }] },
    };
    const current = {
      ...base(),
      line: { start: 10, seq: 'GTACGTACGT', kind: 'main' },
      fullSeq: 'ACGTACGTACGTACGTACGTACGTACGTAC',
      seqLength: 30,
      primerOccurrences: [tailOnly],
    };
    expect(sequenceLineEqual(current, {
      ...current,
      primerOccurrences: [{ ...tailOnly, tail: 'TTTT' }],
    })).toBe(false);
  });
  it('treats circular 5-prime tails wrapping across either origin edge as line-relevant', () => {
    const forward = {
      key: 'circular-forward-tail',
      segments: [{ start: 1, end: 5 }],
      strand: 1,
      tail: 'AAAA',
      alignment: { runs: [{ op: 'M' }] },
    };
    const lastLine = {
      ...base(),
      line: { start: 15, seq: 'TACGT', kind: 'main' },
      circular: true,
      primerOccurrences: [forward],
    };
    expect(sequenceLineEqual(lastLine, {
      ...lastLine,
      primerOccurrences: [{ ...forward, tail: 'TTTT' }],
    })).toBe(false);

    const reverse = {
      key: 'circular-reverse-tail',
      segments: [{ start: 15, end: 19 }],
      strand: -1,
      tail: 'AAAA',
      alignment: { runs: [{ op: 'M' }] },
    };
    const firstLine = { ...base(), circular: true, primerOccurrences: [reverse] };
    expect(sequenceLineEqual(firstLine, {
      ...firstLine,
      primerOccurrences: [{ ...reverse, tail: 'TTTT' }],
    })).toBe(false);
  });
});

describe('sequenceLineEqual — framesResolution + seqLength', () => {
  it('ignores coverage drift, re-renders on strategy or dominant change', () => {
    const fr = { strategy: 'single', dominant: { id: 'c', start: 0, end: 9 }, coverage: 0.5 };
    const a = { ...base(), framesResolution: fr };
    expect(sequenceLineEqual(a, { ...a, framesResolution: { ...fr, coverage: 0.49 } })).toBe(true);
    expect(sequenceLineEqual(a, { ...a, framesResolution: { ...fr, strategy: 'hybrid' } })).toBe(false);
    expect(sequenceLineEqual(a, { ...a, framesResolution: { ...fr, dominant: { id: 'c', start: 0, end: 30 } } })).toBe(false);
  });
  it('seqLength change re-renders only the wrap-bridge row', () => {
    const mid = { ...base(), line: { ...base().line, wrapsOrigin: false } };
    expect(sequenceLineEqual(mid, { ...mid, seqLength: 21 })).toBe(true);
    const bridge = { ...base(), line: { ...base().line, wrapsOrigin: true, wrapAt: 5 } };
    expect(sequenceLineEqual(bridge, { ...bridge, seqLength: 21 })).toBe(false);
  });
});
