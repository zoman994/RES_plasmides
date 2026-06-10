/**
 * V126 — stop-codon detection must find the last COMPLETE in-frame codon even
 * when the region length is not a multiple of 3 (e.g. CDS + 1-2 trailing nt).
 */
import { describe, it, expect } from 'vitest';
import { autoAnnotate } from '../auto-annotate';

describe('autoAnnotate stop-codon detection (V126)', () => {
  it('finds the in-frame stop when the region has trailing nt (L%3≠0)', () => {
    // ATG + 5 codons + TAA + 1 trailing nt → length 22 (L%3==1).
    // Stop TAA occupies [18,21); the buggy formula pointed at [21,...] and missed it.
    const seq = 'ATG' + 'GCC'.repeat(5) + 'TAA' + 'A';
    expect(seq.length % 3).toBe(1);
    const anns = autoAnnotate({ name: 'x', type: 'CDS', sequence: seq });
    const stop = anns.find((a) => a.type === 'stop_codon');
    expect(stop).toBeDefined();
    expect(stop.start).toBe(18);
    expect(stop.end).toBe(21);
  });

  it('still finds the stop for frame-aligned CDS (L%3==0, no regression)', () => {
    const seq = 'ATG' + 'GCC'.repeat(5) + 'TAA'; // length 21
    const anns = autoAnnotate({ name: 'x', type: 'CDS', sequence: seq });
    const stop = anns.find((a) => a.type === 'stop_codon');
    expect(stop).toBeDefined();
    expect(stop.start).toBe(18);
  });
});
