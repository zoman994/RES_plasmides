/**
 * Sprint M-B.2 K3 — intergenic-hints helper unit tests.
 */
import { describe, it, expect } from 'vitest';
import { computeIntergenicHints } from '../lib/intergenic-hints';

describe('M-B.2 K3 — computeIntergenicHints', () => {
  it('1) returns empty for null / no-region inputs', () => {
    expect(computeIntergenicHints(null)).toBe('');
    expect(computeIntergenicHints({ length: 1000, annotations: [] })).toBe('');
  });

  it('2) reports the gaps between regions, ≥30 bp wide, max 4 entries', () => {
    const out = computeIntergenicHints({
      length: 5000,
      annotations: [
        { id: 'r1', type: 'CDS', name: 'a', start: 100, end: 200, level: 'region' },
        { id: 'r2', type: 'CDS', name: 'b', start: 500, end: 600, level: 'region' },
        { id: 'r3', type: 'CDS', name: 'c', start: 700, end: 800, level: 'region' },
        { id: 'r4', type: 'CDS', name: 'd', start: 1200, end: 1300, level: 'region' },
      ],
    });
    // Gaps: 1-100 (head), 200-500, 800-1200, 1300-5000 → 4 entries.
    expect(out.split(', ').length).toBe(4);
    expect(out).toMatch(/^1–100/);
  });

  it('3) ignores tiny gaps (< 30 bp)', () => {
    const out = computeIntergenicHints({
      length: 1000,
      annotations: [
        { id: 'r1', type: 'CDS', name: 'a', start: 0, end: 100, level: 'region' },
        { id: 'r2', type: 'CDS', name: 'b', start: 110, end: 200, level: 'region' },
      ],
    });
    // Gap 100-110 too small; tail 200-1000 surfaces.
    expect(out).toMatch(/^201–1000/);
    expect(out).not.toMatch(/100–110/);
  });
});
