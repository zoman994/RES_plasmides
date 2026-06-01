/**
 * commonFeatures namespace must be English (⚓ DEC-MA2-01 / DEC-CF-11) — the
 * acceptance fix rejected the RU variant. Walk every string value (resolving
 * function-form strings with sample args) and assert no Cyrillic.
 */
import { describe, it, expect } from 'vitest';
import { STRINGS } from '../strings';

const CYRILLIC = /[Ѐ-ӿ]/;

function resolve(v) {
  if (typeof v === 'string') return [v];
  if (typeof v === 'function') {
    try { return [String(v('X')), String(v(3)), String(v('dna')), String(v('protein'))]; }
    catch { return []; }
  }
  if (v && typeof v === 'object') return Object.values(v).flatMap(resolve);
  return [];
}

describe('STRINGS.commonFeatures — English only (DEC-CF-11)', () => {
  it('has no Cyrillic in any value', () => {
    const offenders = [];
    for (const [key, val] of Object.entries(STRINGS.commonFeatures)) {
      for (const s of resolve(val)) {
        if (CYRILLIC.test(s)) offenders.push(`${key}: "${s}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('promote menu label + section title are the expected English strings', () => {
    expect(STRINGS.commonFeatures.promoteMenuItem).toBe('Add to common features');
    expect(STRINGS.commonFeatures.sectionTitle).toBe('Common features');
  });
});
