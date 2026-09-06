import { describe, expect, it } from 'vitest';

import {
  fitPrimerAwareCharsPerLine,
  primerInsertionEdgeGuardChars,
} from '../lib/primer-edge-layout';

describe('primer insertion edge budget', () => {
  it('reserves half of the longest real I-run plus one paint cell on both edges', () => {
    const occurrences = [{
      alignment: {
        runs: [
          { op: 'M', queryStart: 0, queryEnd: 4 },
          { op: 'I', queryStart: 4, queryEnd: 28 },
          { op: 'M', queryStart: 28, queryEnd: 44 },
        ],
      },
    }, {
      alignment: {
        runs: [{ op: 'I', queryStart: 0, queryEnd: 2 }],
      },
    }];

    expect(primerInsertionEdgeGuardChars(occurrences)).toBe(13);
    expect(primerInsertionEdgeGuardChars([{ alignment: { runs: [] } }])).toBe(0);
  });

  it('shrinks the DNA capacity below the legacy 30-base floor when guards need the room', () => {
    expect(fitPrimerAwareCharsPerLine({
      availableChars: 38,
      labelChars: 8,
      edgeGuardChars: 13,
      preference: 150,
    })).toBe(4);
    expect(fitPrimerAwareCharsPerLine({
      availableChars: 66,
      labelChars: 8,
      edgeGuardChars: 13,
      preference: 150,
    })).toBe(30);
    expect(fitPrimerAwareCharsPerLine({
      availableChars: 20,
      labelChars: 8,
      edgeGuardChars: 13,
      preference: 150,
    })).toBe(1);
  });
});
