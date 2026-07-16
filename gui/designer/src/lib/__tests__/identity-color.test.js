/**
 * identity-color — single source for the bucket→colour mapping (P1). Extracted
 * from LibraryTopBar / SequenceSearchPopover, which had two hand-copied ladders.
 * Colour = STRENGTH signal, not «valid/invalid». For IUPAC hits identity is null
 * («compatibility» ≠ «identity») → a neutral colour, never a false green.
 */
import { describe, it, expect } from 'vitest';
import { BUCKET_COLOR, bucketColor, identityColor, strengthColor } from '../identity-color';
import { identityBucket } from '../sequence-search';

describe('BUCKET_COLOR — covers every identityBucket outcome', () => {
  it('has a colour for high/mid/orange/low (no undefined)', () => {
    for (const b of ['high', 'mid', 'orange', 'low']) {
      expect(typeof BUCKET_COLOR[b]).toBe('string');
      expect(BUCKET_COLOR[b].length).toBeGreaterThan(0);
    }
  });
  it('agrees with the historical SequenceSearchPopover ladder', () => {
    expect(BUCKET_COLOR.high).toContain('--success-fg');
    expect(BUCKET_COLOR.mid).toBe('#d97706');
    expect(BUCKET_COLOR.orange).toBe('#ea580c');
    expect(BUCKET_COLOR.low).toContain('--text-tertiary');
  });
});

describe('bucketColor', () => {
  it('maps a known bucket name to its colour', () => {
    expect(bucketColor('high')).toBe(BUCKET_COLOR.high);
    expect(bucketColor('orange')).toBe(BUCKET_COLOR.orange);
  });
  it('falls back for an unknown / missing bucket', () => {
    expect(bucketColor('nonsense')).toBe('var(--text-secondary)');
    expect(bucketColor(undefined)).toBe('var(--text-secondary)');
  });
});

describe('identityColor — numeric identity → colour', () => {
  it('routes through identityBucket for the 90/80/70 thresholds', () => {
    expect(identityColor(0.95)).toBe(BUCKET_COLOR[identityBucket(0.95)]); // high
    expect(identityColor(0.85)).toBe(BUCKET_COLOR.mid);
    expect(identityColor(0.75)).toBe(BUCKET_COLOR.orange);
    expect(identityColor(0.5)).toBe(BUCKET_COLOR.low);
  });
  it('null/undefined identity (IUPAC compatibility) → neutral, never green', () => {
    expect(identityColor(null)).toBe('var(--text-secondary)');
    expect(identityColor(undefined)).toBe('var(--text-secondary)');
    expect(identityColor(null)).not.toBe(BUCKET_COLOR.high);
  });
});

describe('strengthColor — metric-aware (identity ?? compatibility)', () => {
  it('uses identity when present', () => {
    expect(strengthColor({ identity: 0.95, compatibility: 0.5 })).toBe(BUCKET_COLOR.high);
  });
  it('falls back to compatibility when identity is null (IUPAC)', () => {
    expect(strengthColor({ identity: null, compatibility: 0.95 })).toBe(BUCKET_COLOR.high);
    expect(strengthColor({ identity: null, compatibility: 0.75 })).toBe(BUCKET_COLOR.orange);
  });
  it('neutral when neither metric is usable', () => {
    expect(strengthColor({ identity: null, compatibility: null })).toBe('var(--text-secondary)');
    expect(strengthColor(null)).toBe('var(--text-secondary)');
  });
});
