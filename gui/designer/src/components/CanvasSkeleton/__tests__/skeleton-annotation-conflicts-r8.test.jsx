/**
 * skeleton-annotation-conflicts-r8.test.jsx — Annotation conflict detection.
 *
 * R8-3 (14.05.2026). Verifies:
 *   - Duplicate annotations (junction merge artifact).
 *   - Overlapping CDS annotations.
 *   - Promoter inside CDS.
 *   - CDS without ATG start.
 *   - CDS without stop codon.
 *   - CDS length not divisible by 3.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  detectAnnotationConflicts,
  summarizeConflicts,
} from '../../../lib/bio/annotation-conflicts';

describe('R8-3 — detectAnnotationConflicts', () => {
  it('Duplicate annotations detected', () => {
    const c = {
      sequence: 'ATGCATGCATGC',
      annotations: [
        { id: 'a', name: 'feat', start: 0, end: 6 },
        { id: 'b', name: 'feat', start: 0, end: 6 }, // duplicate
      ],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'duplicate')).toBe(true);
  });

  it('Overlapping CDS detected', () => {
    const c = {
      sequence: 'ATGCATGCATGCATGCATGC',
      annotations: [
        { id: 'a', name: 'cdsA', type: 'CDS', start: 0, end: 15 },
        { id: 'b', name: 'cdsB', type: 'CDS', start: 6, end: 18 }, // overlap 6-15 = 9 bp
      ],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'overlapping_cds')).toBe(true);
  });

  it('Promoter inside CDS detected', () => {
    const c = {
      sequence: 'ATGCATGCATGC',
      annotations: [
        { id: 'a', name: 'cds', type: 'CDS', start: 0, end: 12 },
        { id: 'b', name: 'prom', type: 'promoter', start: 3, end: 6 },
      ],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'promoter_in_cds')).toBe(true);
  });

  it('CDS no ATG start detected', () => {
    const c = {
      sequence: 'CCCAAATTTGGG', // 12 bp, starts with CCC not ATG
      annotations: [{ id: 'a', name: 'badCDS', type: 'CDS', start: 0, end: 12 }],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'cds_no_start')).toBe(true);
  });

  it('CDS GTG start accepted (bacterial alt start)', () => {
    const c = {
      sequence: 'GTGAAATTTTAA', // GTG start, TAA stop, divisible by 3.
      annotations: [{ id: 'a', name: 'altStart', type: 'CDS', start: 0, end: 12 }],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'cds_no_start')).toBe(false);
  });

  it('CDS no stop codon detected', () => {
    const c = {
      sequence: 'ATGAAATTTCCC', // 12 bp, ends with CCC not stop
      annotations: [{ id: 'a', name: 'cds', type: 'CDS', start: 0, end: 12 }],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'cds_no_stop')).toBe(true);
  });

  it('CDS length not triplet detected', () => {
    const c = {
      sequence: 'ATGAAATTTC', // 10 bp
      annotations: [{ id: 'a', name: 'cds', type: 'CDS', start: 0, end: 10 }],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings.some((w) => w.kind === 'cds_not_triplet')).toBe(true);
  });

  it('Clean CDS — no warnings', () => {
    const c = {
      sequence: 'ATGAAATTCTAA', // ATG start, TAA stop, 12 bp = 4 codons.
      annotations: [{ id: 'a', name: 'cleanCDS', type: 'CDS', start: 0, end: 12 }],
    };
    const warnings = detectAnnotationConflicts(c);
    expect(warnings).toHaveLength(0);
  });

  it('summarizeConflicts counts по kind', () => {
    const conflicts = [
      { kind: 'duplicate' },
      { kind: 'duplicate' },
      { kind: 'cds_no_start' },
    ];
    const summary = summarizeConflicts(conflicts);
    expect(summary).toMatch(/2 duplicate/);
    expect(summary).toMatch(/1 cds_no_start/);
  });

  it('Empty container — empty result', () => {
    expect(detectAnnotationConflicts(null)).toEqual([]);
    expect(detectAnnotationConflicts({})).toEqual([]);
    expect(detectAnnotationConflicts({ annotations: [] })).toEqual([]);
  });
});
