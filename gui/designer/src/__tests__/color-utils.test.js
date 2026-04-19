import { describe, it, expect } from 'vitest';
import { getTextColor } from '../lib/color-utils';

describe('getTextColor', () => {
  it('returns dark text on yellow AmpR promoter (#FBBF24)', () => {
    expect(getTextColor('#FBBF24')).toBe('#1F2937');
  });

  it('returns dark text on light green (#A7F3D0)', () => {
    expect(getTextColor('#A7F3D0')).toBe('#1F2937');
  });

  it('returns white text on dark blue CDS (#2563EB)', () => {
    expect(getTextColor('#2563EB')).toBe('#FFFFFF');
  });

  it('returns white text on red (#DC2626)', () => {
    expect(getTextColor('#DC2626')).toBe('#FFFFFF');
  });

  it('returns dark text on white (#FFFFFF)', () => {
    expect(getTextColor('#FFFFFF')).toBe('#1F2937');
  });

  it('returns white text on black (#000000)', () => {
    expect(getTextColor('#000000')).toBe('#FFFFFF');
  });

  it('returns white fallback for malformed input', () => {
    expect(getTextColor(null)).toBe('#FFFFFF');
    expect(getTextColor(undefined)).toBe('#FFFFFF');
    expect(getTextColor('red')).toBe('#FFFFFF');
    expect(getTextColor('#GGG')).toBe('#FFFFFF');
    expect(getTextColor('')).toBe('#FFFFFF');
  });
});
