/**
 * V89 — autoGroupPipeline дефолтит на 'restriction' kind когда ВСЕ
 * un-grouped sources zone'ы получены через RE-сайт пикер
 * (acquisitionMethod='restriction'). Смешанные / non-RE сборки
 * сохраняют прежний overlap_pcr/gibson default.
 */
import { describe, it, expect } from 'vitest';
import { autoGroupPipeline } from '../auto-group-pipeline';

const zone = (id, finalTopology = 'circular') => ({ id, finalTopology });

function piece(i, am = 'undefined') {
  return {
    id: `p${i}`,
    zoneId: 'z1',
    createdAt: i,
    acquisitionMethod: am,
  };
}

describe('V89 — autoGroupPipeline + acquisitionMethod=restriction', () => {
  it('all restriction sources → kind="restriction" (linear)', () => {
    const state = { pieces: [piece(1, 'restriction'), piece(2, 'restriction')] };
    const plan = autoGroupPipeline(zone('z1', 'linear'), state);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].kind).toBe('restriction');
  });

  it('all restriction sources → kind="restriction" (circular small)', () => {
    const state = { pieces: [piece(1, 'restriction'), piece(2, 'restriction'), piece(3, 'restriction')] };
    const plan = autoGroupPipeline(zone('z1', 'circular'), state);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].kind).toBe('restriction');
  });

  it('mixed pieces (1 RE + 1 cursor) → fallback overlap_pcr', () => {
    const state = { pieces: [piece(1, 'restriction'), piece(2, 'cursor')] };
    const plan = autoGroupPipeline(zone('z1', 'linear'), state);
    expect(plan.groups[0].kind).toBe('overlap_pcr');
  });

  it('all cursor / numeric → overlap_pcr (regression)', () => {
    const state = { pieces: [piece(1, 'cursor'), piece(2, 'numeric')] };
    const plan = autoGroupPipeline(zone('z1', 'linear'), state);
    expect(plan.groups[0].kind).toBe('overlap_pcr');
  });

  it('multi-layer for >6 circular all-RE → all groups kind=restriction', () => {
    const state = { pieces: Array.from({ length: 8 }, (_, i) => piece(i, 'restriction')) };
    const plan = autoGroupPipeline(zone('z1', 'circular'), state);
    expect(plan.groups.length).toBeGreaterThan(1);
    for (const g of plan.groups) {
      expect(g.kind).toBe('restriction');
    }
  });

  it('multi-layer for >6 circular mixed → overlap_pcr / gibson (regression)', () => {
    const state = {
      pieces: [
        ...Array.from({ length: 6 }, (_, i) => piece(i, 'restriction')),
        piece(6, 'cursor'),
        piece(7, 'cursor'),
      ],
    };
    const plan = autoGroupPipeline(zone('z1', 'circular'), state);
    expect(plan.groups.some((g) => g.kind === 'overlap_pcr')).toBe(true);
    expect(plan.groups.some((g) => g.kind === 'gibson')).toBe(true);
  });
});
