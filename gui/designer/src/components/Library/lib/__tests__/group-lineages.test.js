import { describe, it, expect } from 'vitest';
import { groupVisibleLineages } from '../version-lineage';

const E = {
  imp: { id: 'imp', name: 'pUC19', addedAt: '2026-06-16T10:02:00Z', origin: { kind: 'file_import' } },
  e1: { id: 'e1', name: 'pUC19 v2', addedAt: '2026-06-16T10:05:00Z', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z' } },
  e2: { id: 'e2', name: 'pUC19 v3', addedAt: '2026-06-16T10:06:00Z', parentEntryId: 'e1', origin: { kind: 'manual_edit', parentEntryId: 'e1', editedAt: '2026-06-16T10:06:00Z' } },
  v1: { id: 'v1', name: 'pUC19-T7', addedAt: '2026-06-16T10:05:30Z', parentEntryId: 'imp', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:05:30Z' } },
  solo: { id: 'solo', name: 'pET28a', addedAt: '2026-06-16T09:00:00Z', origin: { kind: 'file_import' } },
};

describe('groupVisibleLineages', () => {
  it('collapses one lineage into a single group (head = mainline tip)', () => {
    const groups = groupVisibleLineages(E, [E.e2, E.v1, E.e1, E.imp, E.solo]);
    const puc = groups.find((g) => g.rootId === 'imp');
    expect(puc).toBeTruthy();
    expect(puc.count).toBe(4);
    expect(puc.headEntry.id).toBe('e2'); // structural mainline tip
    expect(puc.members.map((m) => m.id).sort()).toEqual(['e1', 'e2', 'imp', 'v1']);
    expect(puc.lineage.branches.map((b) => b.tipId)).toEqual(['v1']);
  });

  it('a single-entry lineage is its own group of count 1', () => {
    const groups = groupVisibleLineages(E, [E.solo]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ rootId: 'solo', count: 1 });
    expect(groups[0].headEntry.id).toBe('solo');
  });

  it('falls back to most-recent visible member when the head is hidden', () => {
    // e2 (the structural head) is NOT in the visible list → head falls back
    // to the latest visible mainline member (e1).
    const groups = groupVisibleLineages(E, [E.v1, E.e1, E.imp]);
    const puc = groups.find((g) => g.rootId === 'imp');
    expect(puc.count).toBe(3);
    expect(puc.headEntry.id).toBe('e1');
  });

  it('preserves first-appearance order of the input list', () => {
    const groups = groupVisibleLineages(E, [E.solo, E.imp, E.e1, E.e2, E.v1]);
    expect(groups.map((g) => g.rootId)).toEqual(['solo', 'imp']);
  });

  it('empty / nullish inputs → no groups (no crash)', () => {
    expect(groupVisibleLineages(E, [])).toEqual([]);
    expect(groupVisibleLineages(null, null)).toEqual([]);
  });
});
