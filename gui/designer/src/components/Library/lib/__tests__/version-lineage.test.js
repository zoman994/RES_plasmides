import { describe, it, expect } from 'vitest';
import { buildVersionTimeline } from '../version-lineage';

const E = {
  imp: { id: 'imp', name: 'pUC19', addedAt: '2026-06-16T10:02:00Z', origin: { kind: 'file_import' } },
  e1: { id: 'e1', name: 'pUC19 · испр.', addedAt: '2026-06-16T10:05:00Z', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z', changes: 'замена 66: G→A' } },
  e2: { id: 'e2', name: 'pUC19 · испр. 2', addedAt: '2026-06-16T10:06:00Z', parentEntryId: 'e1', origin: { kind: 'manual_edit', parentEntryId: 'e1', editedAt: '2026-06-16T10:06:00Z', changes: 'вставка 223–226' } },
  v1: { id: 'v1', name: 'pUC19-T7', addedAt: '2026-06-16T10:05:30Z', parentEntryId: 'imp', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:05:30Z', changes: '+промотор T7' } },
};

describe('buildVersionTimeline', () => {
  it('builds a linear chain ordered by time, all on one lane', () => {
    const t = buildVersionTimeline({ imp: E.imp, e1: E.e1, e2: E.e2 }, 'e2');
    expect(t.root).toBe('imp');
    expect(t.nodes.map((n) => n.id)).toEqual(['imp', 'e1', 'e2']);
    expect(t.nodes.every((n) => n.lane === 0)).toBe(true);
    expect(t.edges).toEqual([{ from: 'imp', to: 'e1' }, { from: 'e1', to: 'e2' }]);
    expect(t.nodes.find((n) => n.id === 'e2').isCurrent).toBe(true);
  });

  it('puts a branch on a parallel lane (first child keeps lane, others diverge)', () => {
    const t = buildVersionTimeline(E, 'e2');
    expect(t.root).toBe('imp');
    const lane = Object.fromEntries(t.nodes.map((n) => [n.id, n.lane]));
    expect(lane.imp).toBe(0);
    expect(lane.e1).toBe(0); // earliest child of imp → keeps lane
    expect(lane.v1).toBe(1); // later child → new lane
    expect(lane.e2).toBe(0); // child of e1
    expect(t.edges).toContainEqual({ from: 'imp', to: 'v1' });
  });

  it('finds the root + full subtree from a focus in the middle', () => {
    const t = buildVersionTimeline(E, 'e1');
    expect(t.root).toBe('imp');
    expect(t.nodes).toHaveLength(4);
    expect(t.nodes.find((n) => n.id === 'e1').isCurrent).toBe(true);
  });

  it('maps kind → label + tone (neutral import vs edit)', () => {
    const t = buildVersionTimeline(E, 'e2');
    const byId = Object.fromEntries(t.nodes.map((n) => [n.id, n]));
    expect(byId.imp).toMatchObject({ kindLabel: 'импорт', tone: 'neutral' });
    expect(byId.e1).toMatchObject({ kindLabel: 'правка', tone: 'edit', changes: 'замена 66: G→A' });
    expect(byId.v1).toMatchObject({ kindLabel: 'версия', tone: 'edit' });
  });

  it('treats an entry whose parent is absent as the root', () => {
    const t = buildVersionTimeline({ e1: E.e1, e2: E.e2 }, 'e2'); // imp missing
    expect(t.root).toBe('e1');
    expect(t.nodes.map((n) => n.id)).toEqual(['e1', 'e2']);
  });

  it('returns empty for an unknown focus', () => {
    expect(buildVersionTimeline(E, 'nope')).toEqual({ root: null, nodes: [], edges: [] });
  });
});
