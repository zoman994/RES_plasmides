/**
 * variant-resolver.test.js — T9 K4 (§5.4, DEC-T9-11).
 * Pure helpers: variant group membership, materialized clones, and the
 * 3-way finals discriminator (clones | design-variants | independent).
 */
import { describe, it, expect } from 'vitest';
import {
  selectVariantGroup, selectMaterializedClones,
  selectVariantKindForFinals, variantGroupLabel,
} from '../lib/variant-resolver';

describe('T9 K4 — selectVariantGroup / selectMaterializedClones', () => {
  it('selectVariantGroup filters pieces by variantGroupId', () => {
    const s = {
      pieces: [
        { id: 'a', variantGroupId: 'vg1' },
        { id: 'b', variantGroupId: 'vg1' },
        { id: 'c', variantGroupId: 'vg2' },
        { id: 'd', variantGroupId: null },
      ],
    };
    expect(selectVariantGroup(s, 'vg1').map((p) => p.id)).toEqual(['a', 'b']);
    expect(selectVariantGroup(s, 'none')).toEqual([]);
  });

  it('selectMaterializedClones returns op.materializedClones or []', () => {
    const s = {
      operations: [
        { id: 'o1', materializedClones: [{ cloneId: 'x', label: 'c1' }] },
        { id: 'o2', materializedClones: null },
      ],
    };
    expect(selectMaterializedClones(s, 'o1')).toHaveLength(1);
    expect(selectMaterializedClones(s, 'o2')).toEqual([]);
    expect(selectMaterializedClones(s, 'gone')).toEqual([]);
  });
});

describe('T9 K4 — variantGroupLabel', () => {
  it('returns {index,total} ordered by createdAt', () => {
    const s = {
      pieces: [
        { id: 'a', variantGroupId: 'vg', createdAt: 5 },
        { id: 'b', variantGroupId: 'vg', createdAt: 2 },
        { id: 'c', variantGroupId: 'vg', createdAt: 9 },
      ],
    };
    expect(variantGroupLabel(s, 'vg', 'b')).toEqual({ index: 1, total: 3 });
    expect(variantGroupLabel(s, 'vg', 'a')).toEqual({ index: 2, total: 3 });
    expect(variantGroupLabel(s, 'vg', 'c')).toEqual({ index: 3, total: 3 });
  });
});

describe('T9 K4 — selectVariantKindForFinals', () => {
  // helpers
  const zone = { id: 'z1' };
  const fin = (id) => ({
    id, kind: 'molecule', zoneId: 'z1', topology: { circular: false },
  });

  it('≤1 final → independent', () => {
    const s = { zones: [zone], containers: [fin('f1')], pieces: [], operations: [], junctions: [] };
    expect(selectVariantKindForFinals(s, 'z1')).toBe('independent');
  });

  it('N finals from ONE op with materializedClones → clones', () => {
    const s = {
      zones: [zone],
      containers: [fin('f1'), fin('f2'), fin('f3')],
      operations: [{
        id: 'op', outputs: ['f1'], inputPieces: [],
        materializedClones: [
          { cloneId: 'f1', label: '1' }, { cloneId: 'f2', label: '2' }, { cloneId: 'f3', label: '3' },
        ],
      }],
      junctions: [],
      pieces: [],
    };
    expect(selectVariantKindForFinals(s, 'z1')).toBe('clones');
  });

  it('finals from ops whose inputPieces share one variantGroupId → design-variants', () => {
    const s = {
      zones: [zone],
      containers: [fin('f1'), fin('f2')],
      pieces: [
        { id: 'p1', variantGroupId: 'vg' }, { id: 'p2', variantGroupId: 'vg' },
      ],
      operations: [
        { id: 'o1', outputs: ['f1'], inputPieces: ['p1'], materializedClones: null },
        { id: 'o2', outputs: ['f2'], inputPieces: ['p2'], materializedClones: null },
      ],
      junctions: [],
    };
    expect(selectVariantKindForFinals(s, 'z1')).toBe('design-variants');
  });

  it('unrelated finals → independent', () => {
    const s = {
      zones: [zone],
      containers: [fin('f1'), fin('f2')],
      pieces: [{ id: 'p1', variantGroupId: null }, { id: 'p2', variantGroupId: null }],
      operations: [
        { id: 'o1', outputs: ['f1'], inputPieces: ['p1'], materializedClones: null },
        { id: 'o2', outputs: ['f2'], inputPieces: ['p2'], materializedClones: null },
      ],
      junctions: [],
    };
    expect(selectVariantKindForFinals(s, 'z1')).toBe('independent');
  });
});
