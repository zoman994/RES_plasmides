/**
 * feature-fragment.js (UX-4) — detect an INCOMPLETE feature (a fragment of its
 * reference) so renderers can draw it pLannotate-style (white fill + coloured
 * outline) instead of a solid bar → the eye reads «обрезок», not a whole gene.
 */
import { describe, it, expect } from 'vitest';
import { isFragmentFeature } from '../feature-fragment';

describe('isFragmentFeature', () => {
  it('name with a _part_<a>-<b> suffix → fragment', () => {
    expect(isFragmentFeature({ name: 'AmpR_part_10-856' })).toBe(true);
  });

  it('plain full-feature name → not a fragment', () => {
    expect(isFragmentFeature({ name: 'AmpR' })).toBe(false);
  });

  it('explicit fragment flag → fragment', () => {
    expect(isFragmentFeature({ name: 'lacZ', fragment: true })).toBe(true);
    expect(isFragmentFeature({ name: 'lacZ', partial: true })).toBe(true);
  });

  it('coverage below 95% → fragment; at/above → not', () => {
    expect(isFragmentFeature({ name: 'x', coverage: 0.8 })).toBe(true);
    expect(isFragmentFeature({ name: 'x', coverage: 0.95 })).toBe(false);
    expect(isFragmentFeature({ name: 'x', coverage: 0.99 })).toBe(false);
  });

  it('null / nameless / no signal → not a fragment (safe default)', () => {
    expect(isFragmentFeature(null)).toBe(false);
    expect(isFragmentFeature({})).toBe(false);
    expect(isFragmentFeature({ name: '' })).toBe(false);
  });
});
