import { describe, it, expect } from 'vitest';
import { collectLineage, lineageRootId } from '../version-lineage';

// Linear chain imp → e1 → e2 (+ a divergent child v1 of imp).
const E = {
  imp: { id: 'imp', name: 'pUC19', addedAt: '2026-06-16T10:02:00Z', origin: { kind: 'file_import' } },
  e1: { id: 'e1', name: 'pUC19 · испр.', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z' } },
  e2: { id: 'e2', name: 'pUC19 · испр. 2', parentEntryId: 'e1', origin: { kind: 'manual_edit', parentEntryId: 'e1', editedAt: '2026-06-16T10:06:00Z' } },
  v1: { id: 'v1', name: 'pUC19-T7', parentEntryId: 'imp', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:05:30Z' } },
};

describe('collectLineage', () => {
  it('linear chain → all on the mainline, head = last, no branches', () => {
    const l = collectLineage({ imp: E.imp, e1: E.e1, e2: E.e2 }, 'e2');
    expect(l.rootId).toBe('imp');
    expect(l.versions.map((n) => n.id)).toEqual(['imp', 'e1', 'e2']);
    expect(l.headId).toBe('e2');
    expect(l.branches).toEqual([]);
    expect(l.all).toHaveLength(3);
  });

  it('works from any member id (root / middle / tip resolve the same lineage)', () => {
    const fromImp = collectLineage({ imp: E.imp, e1: E.e1, e2: E.e2 }, 'imp');
    const fromMid = collectLineage({ imp: E.imp, e1: E.e1, e2: E.e2 }, 'e1');
    expect(fromImp.headId).toBe('e2');
    expect(fromMid.versions.map((n) => n.id)).toEqual(['imp', 'e1', 'e2']);
  });

  it('a divergent second child becomes a branch (mainline = earliest unmarked chain)', () => {
    const l = collectLineage(E, 'e2');
    expect(l.versions.map((n) => n.id)).toEqual(['imp', 'e1', 'e2']);
    expect(l.headId).toBe('e2');
    expect(l.branches).toHaveLength(1);
    expect(l.branches[0]).toMatchObject({ tipId: 'v1', name: 'pUC19-T7' });
    expect(l.branches[0].nodes.map((n) => n.id)).toEqual(['v1']);
  });

  it('explicit lineageRole overrides birth-order (earlier "branch" stays a branch)', () => {
    // A is created BEFORE B but the user marked A as a branch and B as a version.
    const map = {
      p: { id: 'p', name: 'P', origin: { kind: 'file_import' } },
      a: { id: 'a', name: 'variant-A', parentEntryId: 'p', origin: { kind: 'manual_edit', parentEntryId: 'p', editedAt: '2026-06-16T11:00:00Z', lineageRole: 'branch' } },
      b: { id: 'b', name: 'P-v2', parentEntryId: 'p', origin: { kind: 'manual_edit', parentEntryId: 'p', editedAt: '2026-06-16T11:05:00Z', lineageRole: 'version' } },
    };
    const l = collectLineage(map, 'b');
    expect(l.versions.map((n) => n.id)).toEqual(['p', 'b']);
    expect(l.headId).toBe('b');
    expect(l.branches.map((br) => br.tipId)).toEqual(['a']);
  });

  it('tags each node with a role (version on mainline, branch off it)', () => {
    const l = collectLineage(E, 'e2');
    const role = Object.fromEntries(l.all.map((n) => [n.id, n.role]));
    expect(role.imp).toBe('version');
    expect(role.e1).toBe('version');
    expect(role.v1).toBe('branch');
  });

  it('groups a multi-commit branch under one entry (tip = latest)', () => {
    const map = {
      p: { id: 'p', name: 'P', origin: { kind: 'file_import' } },
      v: { id: 'v', name: 'P-v2', parentEntryId: 'p', origin: { kind: 'manual_edit', parentEntryId: 'p', editedAt: '2026-06-16T11:00:00Z' } },
      b1: { id: 'b1', name: 'feat', parentEntryId: 'p', origin: { kind: 'manual_edit', parentEntryId: 'p', editedAt: '2026-06-16T11:01:00Z' } },
      b2: { id: 'b2', name: 'feat-2', parentEntryId: 'b1', origin: { kind: 'manual_edit', parentEntryId: 'b1', editedAt: '2026-06-16T11:02:00Z' } },
    };
    const l = collectLineage(map, 'p');
    expect(l.versions.map((n) => n.id)).toEqual(['p', 'v']);
    expect(l.branches).toHaveLength(1);
    expect(l.branches[0].tipId).toBe('b2');
    expect(l.branches[0].nodes.map((n) => n.id)).toEqual(['b1', 'b2']);
  });

  it('orphan single entry → itself is the head, no branches', () => {
    const l = collectLineage({ solo: { id: 'solo', name: 'x', origin: { kind: 'paste_import' } } }, 'solo');
    expect(l.rootId).toBe('solo');
    expect(l.headId).toBe('solo');
    expect(l.versions.map((n) => n.id)).toEqual(['solo']);
    expect(l.branches).toEqual([]);
  });

  it('unknown id → fully empty shape', () => {
    expect(collectLineage(E, 'nope')).toEqual({ rootId: null, headId: null, versions: [], branches: [], all: [] });
    expect(collectLineage(null, 'x')).toEqual({ rootId: null, headId: null, versions: [], branches: [], all: [] });
  });
});

describe('lineageRootId', () => {
  it('walks parentEntryId up to the topmost present ancestor', () => {
    expect(lineageRootId(E, 'e2')).toBe('imp');
    expect(lineageRootId(E, 'v1')).toBe('imp');
    expect(lineageRootId(E, 'imp')).toBe('imp');
  });

  it('stops at the topmost ancestor PRESENT in the map (hidden parent absent)', () => {
    // imp removed from the map → e1 is the highest present ancestor.
    expect(lineageRootId({ e1: E.e1, e2: E.e2 }, 'e2')).toBe('e1');
  });

  it('unknown id → returns the id itself', () => {
    expect(lineageRootId(E, 'nope')).toBe('nope');
    expect(lineageRootId(null, 'x')).toBe('x');
  });
});
