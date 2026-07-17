/**
 * gg-enzyme-recognition-field.test.js — audit GG-3. Type IIS consumers use
 * `.recognition`, while `.site` belongs to RE_ENZYMES. Guard that data contract.
 */
import { describe, it, expect } from 'vitest';
import { GG_ENZYMES } from '../../../golden-gate';

describe('GG_ENZYMES recognition field (GG-3)', () => {
  it('every Type IIS enzyme exposes a non-empty .recognition string', () => {
    for (const name of Object.keys(GG_ENZYMES)) {
      expect(typeof GG_ENZYMES[name].recognition, name).toBe('string');
      expect(GG_ENZYMES[name].recognition.length, name).toBeGreaterThan(0);
    }
  });
  it('BsaI recognition is GGTCTC (and .site is not the GG field)', () => {
    expect(GG_ENZYMES.BsaI.recognition).toBe('GGTCTC');
    expect(GG_ENZYMES.BsaI.site).toBeUndefined();
  });
});
