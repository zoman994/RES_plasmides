/**
 * Tests for migrate-annotations: legacy Part upgrade to region-based model.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { migratePartAnnotations } from '../migrate-annotations';
import { resetRegionCounter } from '../domain-detection';

beforeEach(() => resetRegionCounter());

describe('migratePartAnnotations', () => {
  it('creates primary region for part with no annotations', () => {
    const result = migratePartAnnotations({
      name: 'GeneX', type: 'CDS', sequence: 'ATGATGATG',
    });

    const regions = result.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('CDS');
    expect(regions[0].name).toBe('GeneX');
    expect(regions[0].start).toBe(0);
    expect(regions[0].end).toBe(9);
    expect(regions[0].id).toBeTruthy();
  });

  it('converts legacy domains to detail annotations', () => {
    const result = migratePartAnnotations({
      name: 'GeneX', type: 'CDS', sequence: 'A'.repeat(300),
      domains: [
        { name: 'Signal', type: 'signal', startAA: 1, endAA: 20, color: '#CC79A7' },
        { name: 'His6', type: 'tag', startAA: 90, endAA: 96, color: '#F0E442' },
      ],
    });

    const regions = result.filter(a => a.level === 'region');
    const details = result.filter(a => a.level === 'detail');

    expect(regions).toHaveLength(1);
    expect(details).toHaveLength(2);

    // Signal: AA 1-20 → nt 0-60
    expect(details[0]).toMatchObject({
      name: 'Signal', type: 'signal', start: 0, end: 60,
      level: 'detail', migrated: true,
    });
    expect(details[0].regionId).toBe(regions[0].id);

    // His6: AA 90-96 → nt 267-288
    expect(details[1]).toMatchObject({
      name: 'His6', type: 'tag', start: 267, end: 288,
      level: 'detail',
    });
  });

  it('upgrades flat annotations (no level) to detail with regionId', () => {
    const result = migratePartAnnotations({
      name: 'GeneX', type: 'CDS', sequence: 'A'.repeat(100),
      annotations: [
        { name: 'His-tag', type: 'tag', start: 80, end: 98 },
      ],
    });

    const regions = result.filter(a => a.level === 'region');
    const details = result.filter(a => a.level === 'detail');

    expect(regions).toHaveLength(1);
    expect(details).toHaveLength(1);
    expect(details[0].name).toBe('His-tag');
    expect(details[0].regionId).toBe(regions[0].id);
  });

  it('preserves existing regions without creating duplicates', () => {
    const result = migratePartAnnotations({
      name: 'Fusion', type: 'fusion', sequence: 'A'.repeat(200),
      annotations: [
        { id: 'r1', name: 'Prom', type: 'promoter', start: 0, end: 100, level: 'region' },
        { id: 'r2', name: 'CDS', type: 'CDS', start: 100, end: 200, level: 'region' },
        { name: 'TATA', type: 'core_promoter', start: 80, end: 87, level: 'detail', regionId: 'r1' },
      ],
    });

    const regions = result.filter(a => a.level === 'region');
    expect(regions).toHaveLength(2); // no extra region created
    expect(regions.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('does not duplicate domains already present as details', () => {
    const result = migratePartAnnotations({
      name: 'G', type: 'CDS', sequence: 'A'.repeat(60),
      annotations: [
        { name: 'Signal', type: 'signal', start: 0, end: 60, level: 'detail', regionId: 'r1' },
      ],
      domains: [
        { name: 'Signal', type: 'signal', startAA: 1, endAA: 20, color: '#CC79A7' },
      ],
    });

    const details = result.filter(a => a.level === 'detail');
    const signals = details.filter(d => d.name === 'Signal');
    expect(signals).toHaveLength(1); // not duplicated
  });

  it('handles empty/null gracefully', () => {
    const result = migratePartAnnotations({ name: 'X', type: 'misc' });
    expect(result.filter(a => a.level === 'region')).toHaveLength(1);
  });
});
