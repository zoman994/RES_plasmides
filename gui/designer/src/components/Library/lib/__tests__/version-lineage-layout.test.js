import { describe, it, expect } from 'vitest';
import { buildVersionTimeline } from '../version-lineage';
import { layoutVersionTimeline } from '../version-lineage-layout';

const E = {
  imp: { id: 'imp', name: 'pUC19', addedAt: '2026-06-16T10:02:00Z', origin: { kind: 'file_import' } },
  e1: { id: 'e1', name: 'pUC19 · испр.', addedAt: '2026-06-16T10:05:00Z', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z' } },
  v1: { id: 'v1', name: 'pUC19-T7', addedAt: '2026-06-16T10:05:30Z', parentEntryId: 'imp', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:05:30Z' } },
};

describe('layoutVersionTimeline', () => {
  it('places nodes left→right by order and by lane vertically', () => {
    const layout = layoutVersionTimeline(buildVersionTimeline(E, 'e1'));
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    expect(byId.imp.x).toBeLessThan(byId.e1.x); // later order → further right
    expect(byId.v1.y).toBeGreaterThan(byId.imp.y); // branch lane → lower
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('elbows a cross-lane edge, straight-lines a same-lane edge', () => {
    const layout = layoutVersionTimeline(buildVersionTimeline(E, 'e1'));
    const toE1 = layout.edges.find((e) => e.to === 'e1');
    const toV1 = layout.edges.find((e) => e.to === 'v1');
    expect(toE1.sameLane).toBe(true);
    expect(toV1.sameLane).toBe(false);
    expect(toV1.path).toContain('L'); // elbow
  });

  it('is empty for an empty model', () => {
    const layout = layoutVersionTimeline({ root: null, nodes: [], edges: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBe(0);
  });
});
