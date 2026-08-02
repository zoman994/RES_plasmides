/**
 * U4 item 2 — the SEQUENCE-SPECIFIC boundary check.
 *
 * `validateProviderPayload` (search-provider-contract) is shared with protein and enzyme, so it
 * deliberately does not inspect metrics — a spliced protein hit has its own arithmetic. This is
 * the check that DOES know the sequence contract: integer M/X/I/D/L/identityBps, the four
 * equalities that tie them together, and the topology rules the document's `circular` flag makes
 * meaningful. It never loosens the general validator.
 *
 * A malformed sequence result is INCOMPLETE, never an honest zero: `assertSequenceOccurrences`
 * throws a typed error the worker/facade turn into `incomplete`, so a corrupted kernel reply can
 * never read as "this molecule has no site".
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/search-sequence-contract.test.js
 */
import { describe, it, expect } from 'vitest';
import {
  validateSequenceOccurrences,
  assertSequenceOccurrences,
  MALFORMED_SEQUENCE_RESULT,
} from '../search-sequence-contract';

/** A well-formed sequence occurrence — the FULL SearchHitSummary shape (M=5,X=1,I=0,D=0, linear).
 * Every field the adapter actually emits is present, so a corrupted value in any of them is a
 * real test, not one the fixture happens to omit. */
function occ(over = {}) {
  const metricsOver = over.metrics || {};
  delete over.metrics;
  return {
    location: { segments: [{ start: 4, end: 10 }], strand: '+', wrapsOrigin: false },
    metrics: {
      length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6,
      identity: 5 / 6, coverage: 1,
      exactMatches: 5, substitutions: 1, insertions: 0, deletions: 0,
      indelBases: 0, indelEvents: 0, editDistance: 1,
      mismatches: 1, indels: 0, identityBps: 8333,
      ...metricsOver,
    },
    ...over,
  };
}
const LINEAR = { sequenceLength: 20, circular: false };
const CIRCULAR = { sequenceLength: 20, circular: true };

/** Full, internally-consistent metrics for given counts — mirrors what the adapter emits, so
 * inline (esp. circular) fixtures carry every field the validator now requires. */
function metrics(M, X, I, D, span) {
  const L = M + X + I + D;
  return {
    length: M + X + I, queryLength: M + X + I, alignmentLength: L, targetSpan: span,
    identity: M / L, coverage: 1,
    exactMatches: M, substitutions: X, insertions: I, deletions: D,
    indelBases: I + D, indelEvents: 0, editDistance: X + I + D,
    mismatches: X, indels: I + D, identityBps: Math.floor((10000 * M) / L),
  };
}

describe('U4 — a well-formed sequence result passes', () => {
  it('accepts a valid linear occurrence', () => {
    expect(validateSequenceOccurrences([occ()], LINEAR)).toBe(true);
  });
  it('accepts an empty list (honest miss)', () => {
    expect(validateSequenceOccurrences([], LINEAR)).toBe(true);
  });
  it('accepts a canonical circular wrap', () => {
    const wrapped = {
      location: { segments: [{ start: 18, end: 20 }, { start: 0, end: 4 }], strand: '+', wrapsOrigin: true },
      metrics: metrics(6, 0, 0, 0, 6),
    };
    expect(validateSequenceOccurrences([wrapped], CIRCULAR)).toBe(true);
  });
});

describe('U4 — the shared ownership/location contract is enforced too', () => {
  it('rejects a strand outside {+,-,both}', () => {
    expect(validateSequenceOccurrences([occ({ location: { segments: [{ start: 4, end: 10 }], strand: 'sideways', wrapsOrigin: false } })], LINEAR)).toBe(false);
  });
  it('rejects an occurrence carrying a targetRef (owner is the orchestrator, not the provider)', () => {
    expect(validateSequenceOccurrences([occ({ targetRef: { id: 'x' } })], LINEAR)).toBe(false);
  });
  it('rejects a non-record segment', () => {
    expect(validateSequenceOccurrences([occ({ location: { segments: ['4-10'], strand: '+', wrapsOrigin: false } })], LINEAR)).toBe(false);
  });
});

describe('U4 — the document topology must be a strict boolean', () => {
  it('rejects circular given as the string "false" (truthy!)', () => {
    expect(validateSequenceOccurrences([occ()], { sequenceLength: 20, circular: 'false' })).toBe(false);
  });
  it('rejects a missing circular flag', () => {
    expect(validateSequenceOccurrences([occ()], { sequenceLength: 20 })).toBe(false);
  });
  it('accepts strict true / false', () => {
    expect(validateSequenceOccurrences([occ()], { sequenceLength: 20, circular: false })).toBe(true);
  });

  it('an EMPTY result is not a free pass: unknown topology cannot certify an honest zero', () => {
    // `[]` claims "no site on this molecule". If the topology is unknown we cannot certify that —
    // a missed origin-crossing hit is exactly what a wrong/absent circular flag would hide. So the
    // document must be validated BEFORE an empty result is accepted.
    expect(validateSequenceOccurrences([], { sequenceLength: 20 })).toBe(false);
    expect(validateSequenceOccurrences([], { sequenceLength: 20, circular: 'false' })).toBe(false);
    expect(validateSequenceOccurrences([], { sequenceLength: 0, circular: false })).toBe(false);
    expect(validateSequenceOccurrences([], { sequenceLength: 20, circular: false }), 'a valid doc + empty is a real honest miss').toBe(true);
  });
});

describe('U4 — every scalar the summary carries is checked', () => {
  const broken = [
    ['length != queryLength', { length: 7 }],
    ['identity != M/L', { identity: 99 }],
    ['identity slightly off', { identity: 0.9 }],
    ['coverage != 1', { coverage: 0.5 }],
    ['indelBases != I+D', { indelBases: 2 }],
    ['editDistance != X+I+D', { editDistance: 3 }],
    ['mismatches != X', { mismatches: 0 }],
    ['indels != I+D', { indels: 5 }],
    ['indelEvents negative', { indelEvents: -7 }],
    ['indelEvents above I+D', { indelEvents: 1 }],   // I+D = 0 here, so any positive is too many
  ];
  it.each(broken)('rejects when %s', (_label, metricsOver) => {
    expect(validateSequenceOccurrences([occ({ metrics: metricsOver })], LINEAR)).toBe(false);
  });

  it('rejects indelEvents=0 when there ARE indel bases (a gap implies a gap event)', () => {
    // M=4,X=0,I=1,D=1: two indel bases exist, so at least one gap event MUST be recorded.
    // Zero is biologically impossible and must not pass.
    const withIndels = (evts) => ({
      location: { segments: [{ start: 4, end: 9 }], strand: '+', wrapsOrigin: false },
      metrics: {
        length: 5, queryLength: 5, alignmentLength: 6, targetSpan: 5,
        identity: 4 / 6, coverage: 1,
        exactMatches: 4, substitutions: 0, insertions: 1, deletions: 1,
        indelBases: 2, indelEvents: evts, editDistance: 2,
        mismatches: 0, indels: 2, identityBps: Math.floor((10000 * 4) / 6),
      },
    });
    expect(validateSequenceOccurrences([withIndels(0)], LINEAR)).toBe(false);
    expect(validateSequenceOccurrences([withIndels(1)], LINEAR)).toBe(true);
    expect(validateSequenceOccurrences([withIndels(2)], LINEAR)).toBe(true);
  });

  it('requires indelEvents=0 when there are NO indel bases', () => {
    // occ() has I=D=0, so indelEvents must be exactly 0. (The "above I+D" case above already
    // rejects 1; this documents the paired lower half of the rule explicitly.)
    expect(validateSequenceOccurrences([occ()], LINEAR)).toBe(true);
    expect(validateSequenceOccurrences([occ({ metrics: { indelEvents: 1 } })], LINEAR)).toBe(false);
  });

  it('accepts an occurrence whose indels are internally consistent', () => {
    // M=4,X=0,I=1,D=1: L=6, queryLength=5, targetSpan=5, indelBases=2, indelEvents in 0..2.
    const withIndels = {
      location: { segments: [{ start: 4, end: 9 }], strand: '+', wrapsOrigin: false },
      metrics: {
        length: 5, queryLength: 5, alignmentLength: 6, targetSpan: 5,
        identity: 4 / 6, coverage: 1,
        exactMatches: 4, substitutions: 0, insertions: 1, deletions: 1,
        indelBases: 2, indelEvents: 2, editDistance: 2,
        mismatches: 0, indels: 2, identityBps: Math.floor((10000 * 4) / 6),
      },
    };
    expect(validateSequenceOccurrences([withIndels], LINEAR)).toBe(true);
  });
});

describe('U4 — integer metrics are required', () => {
  const bad = [
    ['exactMatches float', { exactMatches: 5.5 }],
    ['substitutions NaN', { substitutions: NaN }],
    ['alignmentLength Infinity', { alignmentLength: Infinity }],
    ['identityBps string', { identityBps: '8333' }],
    ['deletions negative', { deletions: -1 }],
  ];
  it.each(bad)('rejects %s', (_label, metricsOver) => {
    expect(validateSequenceOccurrences([occ({ metrics: metricsOver })], LINEAR)).toBe(false);
  });
});

describe('U4 — the four equalities are enforced', () => {
  const broken = [
    ['queryLength != M+X+I', { queryLength: 7 }],
    ['alignmentLength != M+X+I+D', { alignmentLength: 7 }],
    ['targetSpan != M+X+D', { targetSpan: 7 }],
    ['identityBps != floor(10000*M/L)', { identityBps: 9000 }],
  ];
  it.each(broken)('rejects when %s', (_label, metricsOver) => {
    // occ() has M=5,X=1,I=0,D=0,L=6: queryLength=6, targetSpan=6, identityBps=floor(50000/6)=8333.
    expect(validateSequenceOccurrences([occ({ metrics: metricsOver })], LINEAR)).toBe(false);
  });

  it('accepts the exactly-consistent baseline it is derived from', () => {
    expect(validateSequenceOccurrences([occ()], LINEAR)).toBe(true);
  });
});

describe('U4 — topology: a linear molecule cannot wrap', () => {
  it('rejects wrapsOrigin:true on a linear document', () => {
    const w = occ({ location: { segments: [{ start: 18, end: 20 }], strand: '+', wrapsOrigin: true } });
    expect(validateSequenceOccurrences([w], LINEAR)).toBe(false);
  });

  it('rejects two origin segments on a linear document', () => {
    const w = occ({
      location: { segments: [{ start: 18, end: 20 }, { start: 0, end: 4 }], strand: '+', wrapsOrigin: false },
      metrics: metrics(6, 0, 0, 0, 6),
    });
    expect(validateSequenceOccurrences([w], LINEAR)).toBe(false);
  });

  it('a corrupted linear hit off the end is NOT silently reinterpreted as a wrap', () => {
    // end past the molecule with only one segment: on a linear doc this is malformed, and must
    // be rejected rather than "healed" into a circular two-segment hit.
    const off = occ({ location: { segments: [{ start: 18, end: 26 }], strand: '+', wrapsOrigin: false } });
    expect(validateSequenceOccurrences([off], LINEAR)).toBe(false);
  });
});

describe('U4 — topology: a circular wrap must be canonical', () => {
  it('rejects a wrap whose first segment does not reach n', () => {
    const w = {
      location: { segments: [{ start: 18, end: 19 }, { start: 0, end: 4 }], strand: '+', wrapsOrigin: true },
      metrics: metrics(5, 0, 0, 0, 5),
    };
    expect(validateSequenceOccurrences([w], CIRCULAR)).toBe(false);
  });

  it('rejects a wrap whose second segment does not start at 0', () => {
    const w = {
      location: { segments: [{ start: 18, end: 20 }, { start: 1, end: 4 }], strand: '+', wrapsOrigin: true },
      metrics: metrics(5, 0, 0, 0, 5),
    };
    expect(validateSequenceOccurrences([w], CIRCULAR)).toBe(false);
  });

  it('rejects a wrap whose segments do not sum to targetSpan', () => {
    const w = {
      location: { segments: [{ start: 18, end: 20 }, { start: 0, end: 4 }], strand: '+', wrapsOrigin: true },
      metrics: metrics(5, 0, 0, 0, 5),
    };
    // segments cover 2 + 4 = 6 bases, but targetSpan says 5.
    expect(validateSequenceOccurrences([w], CIRCULAR)).toBe(false);
  });

  it('rejects a span that laps the molecule (targetSpan > n)', () => {
    const w = {
      location: { segments: [{ start: 0, end: 20 }, { start: 0, end: 5 }], strand: '+', wrapsOrigin: true },
      metrics: metrics(25, 0, 0, 0, 25),
    };
    expect(validateSequenceOccurrences([w], CIRCULAR)).toBe(false);
  });
});

describe('U4 — malformed -> incomplete, never honest zero', () => {
  it('assertSequenceOccurrences returns the list unchanged when valid', () => {
    const list = [occ()];
    expect(assertSequenceOccurrences(list, LINEAR)).toBe(list);
  });

  it('throws a TYPED error on malformed input (not [], not a plain miss)', () => {
    let caught = null;
    try {
      assertSequenceOccurrences([occ({ metrics: { identityBps: 9000 } })], LINEAR);
    } catch (e) { caught = e; }
    expect(caught, 'a malformed result must not pass silently').not.toBeNull();
    expect(caught.code, 'the throw must be the typed incomplete signal').toBe(MALFORMED_SEQUENCE_RESULT);
    expect(Array.isArray(caught)).toBe(false);
  });
});
