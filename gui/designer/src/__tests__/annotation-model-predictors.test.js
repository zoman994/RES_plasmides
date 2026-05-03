/**
 * annotation-model-predictors.test.js — Sprint M-X.1 K1 unit coverage.
 *
 * Verifies:
 *   - `PREDICTOR_SOURCES` exposes the 4 detector source IDs.
 *   - `isPredicted(annotation)` returns true only when the predicted flag
 *     is set, regardless of other fields.
 */
import { describe, it, expect } from 'vitest';
import { PREDICTOR_SOURCES, isPredicted } from '../annotation-model';

describe('PREDICTOR_SOURCES — Sprint M-X.1 K1', () => {
  it('exposes the four detector identifiers as string constants', () => {
    expect(PREDICTOR_SOURCES.ORF_SCAN).toBe('orf_scan');
    expect(PREDICTOR_SOURCES.SIGMA70_PWM).toBe('sigma70_pwm');
    expect(PREDICTOR_SOURCES.STEM_LOOP).toBe('stem_loop');
    expect(PREDICTOR_SOURCES.SGRNA_SCAFFOLD).toBe('sgrna_scaffold');
  });

  it('exposes exactly four sources (no extras leaking from sloppy edits)', () => {
    expect(Object.keys(PREDICTOR_SOURCES)).toHaveLength(4);
  });

  it('values are unique', () => {
    const values = Object.values(PREDICTOR_SOURCES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('isPredicted — Sprint M-X.1 K1', () => {
  it('returns true when predicted === true', () => {
    expect(isPredicted({ predicted: true })).toBe(true);
    expect(
      isPredicted({
        predicted: true,
        source: PREDICTOR_SOURCES.ORF_SCAN,
        confidence: 0.9,
      }),
    ).toBe(true);
  });

  it('returns false on confident annotations (no flag, predicted: false, etc.)', () => {
    expect(isPredicted({})).toBe(false);
    expect(isPredicted({ predicted: false })).toBe(false);
    expect(isPredicted({ type: 'CDS', name: 'AmpR' })).toBe(false);
  });

  it('returns false on null/undefined input (defensive)', () => {
    expect(isPredicted(null)).toBe(false);
    expect(isPredicted(undefined)).toBe(false);
  });

  it('checks identity, not truthiness — `predicted: 1` does NOT count', () => {
    // Predicted flag must be the explicit boolean `true`. Any consumer
    // checking `region.predicted === true` (the canonical idiom) should
    // get a matching answer from this helper.
    expect(isPredicted({ predicted: 1 })).toBe(false);
    expect(isPredicted({ predicted: 'yes' })).toBe(false);
  });
});
