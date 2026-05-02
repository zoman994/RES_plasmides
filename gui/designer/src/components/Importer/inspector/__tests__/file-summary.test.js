/**
 * Sprint M-B.2 K3 — file-summary helpers unit tests.
 *
 * Verifies the regex set used by OverviewTab to bucket annotations into
 * СЕЛЕКЦИЯ / ПРОМОТОРЫ / ORIGIN / TAGS sections, plus type-counter and
 * RE-site summary helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  isResistanceMarker,
  categorizeAnnotations,
  summarizeRegionTypes,
  buildFileSummary,
} from '../lib/file-summary';

describe('M-B.2 K3 — file-summary', () => {
  it('1) isResistanceMarker: AmpR / KanR / blaR / β-lactamase pass', () => {
    expect(isResistanceMarker({ type: 'CDS', name: 'AmpR' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'KanR/NeoR' })).toBe(true);
    expect(isResistanceMarker({ type: 'gene', name: 'bla' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'β-lactamase signal' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'sfGFP' })).toBe(false);
    expect(isResistanceMarker({ type: 'promoter', name: 'AmpR' })).toBe(false);
  });

  it('2) categorizeAnnotations buckets selection / promoters / origins / tags by name + type', () => {
    const regions = [
      { id: '1', type: 'CDS', name: 'AmpR' },
      { id: '2', type: 'promoter', name: 'T7 promoter' },
      { id: '3', type: 'rep_origin', name: 'pUC ori' },
      { id: '4', type: 'CDS', name: 'His6' },
      { id: '5', type: 'CDS', name: 'ORF1' },
    ];
    const cats = categorizeAnnotations(regions);
    expect(cats.selection.map(r => r.name)).toEqual(['AmpR']);
    expect(cats.promoters.map(r => r.name)).toEqual(['T7 promoter']);
    expect(cats.origins.map(r => r.name)).toEqual(['pUC ori']);
    expect(cats.tags.map(r => r.name)).toEqual(['His6']);
    expect(cats.usedIds.has('1')).toBe(true);
    expect(cats.usedIds.has('5')).toBe(false);
  });

  it('3) summarizeRegionTypes counts by type sorted desc', () => {
    const out = summarizeRegionTypes([
      { type: 'CDS' }, { type: 'CDS' }, { type: 'CDS' },
      { type: 'promoter' }, { type: 'promoter' },
      { type: 'rep_origin' },
    ]);
    expect(out).toEqual([['CDS', 3], ['promoter', 2], ['rep_origin', 1]]);
  });

  it('4) buildFileSummary returns null for null parsedItem; full shape otherwise', () => {
    expect(buildFileSummary(null)).toBe(null);
    const summary = buildFileSummary({
      sequence: 'ATGCATGCATGCATGCATGC'.repeat(10),
      topology: 'linear',
      annotations: [
        { id: 'r1', type: 'CDS', name: 'AmpR', start: 0, end: 30, level: 'region' },
        { id: 'r2', type: 'CDS', name: 'sfGFP', start: 50, end: 80, level: 'region' },
      ],
    });
    expect(summary).toBeTruthy();
    expect(summary.cats.selection.map(r => r.name)).toEqual(['AmpR']);
    expect(summary.remainingCDS.map(r => r.name)).toEqual(['sfGFP']);
    expect(summary.warnings).toEqual([]);
  });
});
