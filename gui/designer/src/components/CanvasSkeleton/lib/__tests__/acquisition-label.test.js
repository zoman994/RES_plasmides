import { describe, it, expect } from 'vitest';
import { acquisitionLabel } from '../acquisition-label.js';

describe('acquisitionLabel', () => {
  it('maps each acquisition method to a short + full RU label', () => {
    expect(acquisitionLabel('restriction').short).toBe('RE');
    expect(acquisitionLabel('pcr').short).toBe('PCR');
    expect(acquisitionLabel('ov-pcr').short).toBe('OV');
    expect(acquisitionLabel('synthesis').short).toBe('син');
    expect(acquisitionLabel('direct').short).toBe('=');
    expect(acquisitionLabel('undefined').full).toMatch(/курсор/i);
  });
  it('falls back to the cursor label for unknown / missing', () => {
    expect(acquisitionLabel('nope').short).toBe('⌖');
    expect(acquisitionLabel(undefined).short).toBe('⌖');
    expect(acquisitionLabel(null).short).toBe('⌖');
  });
});
