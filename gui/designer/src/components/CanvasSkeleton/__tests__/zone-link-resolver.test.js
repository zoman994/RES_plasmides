/**
 * zone-link-resolver.test.js — T8 K3 (§5.2, DEC-T8-08/10).
 * Cross-zone source resolution, grouped by source zone.
 */
import { describe, it, expect } from 'vitest';
import { selectCrossZoneSourcesForZone } from '../lib/zone-link-resolver';

function st() {
  return {
    zones: [{ id: 'zA', name: 'Zone A' }, { id: 'zB', name: 'Zone B' }, { id: 'zC', name: 'Zone C' }],
    containers: [
      { id: 'cA', zoneId: 'zA' },
      { id: 'cB1', zoneId: 'zB' }, { id: 'cB2', zoneId: 'zB' },
      { id: 'cC', zoneId: 'zC' },
      { id: 'cLoose', zoneId: null },
    ],
    pieces: [
      { id: 'p1', zoneId: 'zA', sourceIds: ['cB1'] }, // cross: A←B
      { id: 'p2', zoneId: 'zA', sourceIds: ['cB2', 'cC'] }, // cross: A←B, A←C
      { id: 'p3', zoneId: 'zA', sourceIds: ['cA'] }, // same-zone, not cross
      { id: 'p4', zoneId: 'zA', sourceIds: ['cLoose'] }, // loose source, not cross
      { id: 'pOther', zoneId: 'zB', sourceIds: ['cC'] }, // belongs to zB, ignored for zA
    ],
  };
}

describe('T8 K3 — selectCrossZoneSourcesForZone', () => {
  it('groups cross-zone sources by source zone with names + ids', () => {
    const links = selectCrossZoneSourcesForZone(st(), 'zA');
    const byZone = Object.fromEntries(links.map((l) => [l.sourceZoneId, l]));
    expect(Object.keys(byZone).sort()).toEqual(['zB', 'zC']);
    expect(byZone.zB.sourceZoneName).toBe('Zone B');
    expect(byZone.zB.containerIds.sort()).toEqual(['cB1', 'cB2']);
    expect(byZone.zB.pieceIds.sort()).toEqual(['p1', 'p2']);
    expect(byZone.zC.pieceIds).toEqual(['p2']);
  });

  it('excludes same-zone and loose (zoneId null) sources', () => {
    const links = selectCrossZoneSourcesForZone(st(), 'zA');
    expect(links.every((l) => l.sourceZoneId !== 'zA')).toBe(true);
    expect(links.some((l) => l.containerIds.includes('cLoose'))).toBe(false);
  });

  it('zone with no cross-zone refs → []', () => {
    expect(selectCrossZoneSourcesForZone(st(), 'zC')).toEqual([]);
  });

  it('missing source container → skipped, no throw', () => {
    const s = {
      zones: [{ id: 'zA', name: 'A' }],
      containers: [],
      pieces: [{ id: 'p', zoneId: 'zA', sourceIds: ['GONE'] }],
    };
    expect(selectCrossZoneSourcesForZone(s, 'zA')).toEqual([]);
  });

  it('unknown source zone → fallback name, still grouped', () => {
    const s = {
      zones: [{ id: 'zA', name: 'A' }],
      containers: [{ id: 'cX', zoneId: 'zGhost' }],
      pieces: [{ id: 'p', zoneId: 'zA', sourceIds: ['cX'] }],
    };
    const links = selectCrossZoneSourcesForZone(s, 'zA');
    expect(links).toHaveLength(1);
    expect(links[0].sourceZoneId).toBe('zGhost');
    expect(typeof links[0].sourceZoneName).toBe('string');
  });
});
