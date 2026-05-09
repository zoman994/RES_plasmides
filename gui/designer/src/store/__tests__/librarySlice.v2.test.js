/**
 * librarySlice v2 extensions — Sprint M-X.7a v2 K1.
 *
 * New entry shape fields: `zone`, `projectId`, `inLabStock`,
 * `parentEntryId`, `parentEntryHash`. New actions for zone moves +
 * loose-folder CRUD. New selectors for zone-aware tree rendering.
 *
 * Backed by fake-indexeddb so the slice's putLibraryEntry write-through
 * exercises the v4 schema. After K1 wipe (DEC-MX7A-V2-03) all entries
 * carry the new shape on creation.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';
import {
  resetDBForTests,
  getLibraryEntry,
} from '../../db/dexie-schema';
import {
  selectEntriesByZone,
  selectContainersByProject,
  selectPrimersByProject,
  selectLooseTreeStructure,
  selectLabPoolStructure,
  selectPrimerUsageCount,
} from '../librarySlice';

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

function makeContainer(over = {}) {
  return {
    id: over.id || `c-${Math.random().toString(36).slice(2)}`,
    kind: 'container',
    name: over.name || 'pUC19',
    tags: over.tags || [],
    addedAt: over.addedAt || new Date().toISOString(),
    payload: over.payload || { sequence: 'A', length: 1, topology: 'circular', resourceHash: 'h-' + (over.id || 'x') },
    zone: over.zone ?? 'loose',
    projectId: over.projectId ?? null,
    inLabStock: over.inLabStock ?? false,
    parentEntryId: over.parentEntryId ?? null,
    parentEntryHash: over.parentEntryHash ?? null,
    ...over,
  };
}

function makePrimer(over = {}) {
  return makeContainer({ ...over, kind: 'primer', payload: over.payload || { sequence: 'ATCG', length: 4, tm: 12 } });
}

async function reset() {
  await freshDB();
  useStore.setState((state) => {
    state.libraryEntries = {};
    state.looseFolders = [];
    state.filterKind = 'container';
    state.filterTopology = 'all';
    state.editingTagsEntryId = null;
    state._libraryHydrated = false;
    state.workspace = { active: 'library', history: [], context: {} };
    state.currentProjectId = null;
  });
}

describe('M-X.7a v2 K1 — librarySlice v2 extensions', () => {
  beforeEach(reset);

  describe('new entry shape fields', () => {
    it('addLibraryEntry preserves zone/projectId/inLabStock/parentEntry* fields', async () => {
      const e = makeContainer({
        id: 'e1', zone: 'active_bodge', projectId: 'p1',
        parentEntryId: 'src1', parentEntryHash: 'h-src1',
      });
      await useStore.getState().addLibraryEntry(e);
      const stored = useStore.getState().libraryEntries.e1;
      expect(stored.zone).toBe('active_bodge');
      expect(stored.projectId).toBe('p1');
      expect(stored.inLabStock).toBe(false);
      expect(stored.parentEntryId).toBe('src1');
      expect(stored.parentEntryHash).toBe('h-src1');
      const inDB = await getLibraryEntry('e1');
      expect(inDB.zone).toBe('active_bodge');
      expect(inDB.projectId).toBe('p1');
    });

    it('addLibraryEntry without zone defaults to "loose"', async () => {
      const e = { id: 'e1', kind: 'container', name: 'X', payload: {}, tags: [] };
      await useStore.getState().addLibraryEntry(e);
      expect(useStore.getState().libraryEntries.e1.zone).toBe('loose');
    });
  });

  describe('moveEntryToFolder', () => {
    it('replaces folder tags with the new slash-path', async () => {
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'e1', tags: ['Backbones', 'demo:puc'],
      }));
      useStore.getState().moveEntryToFolder('e1', 'Inserts/CRISPR');
      const t = useStore.getState().libraryEntries.e1.tags;
      // Folder-style tags (no colon) get replaced. Meta tags (with colon) preserved.
      expect(t).toContain('Inserts/CRISPR');
      expect(t).toContain('demo:puc');
      expect(t).not.toContain('Backbones');
    });

    it('null/empty path removes all folder tags', () => {
      useStore.setState((s) => {
        s.libraryEntries.e1 = makeContainer({ id: 'e1', tags: ['Backbones', 'demo:x'] });
      });
      useStore.getState().moveEntryToFolder('e1', null);
      const t = useStore.getState().libraryEntries.e1.tags;
      expect(t).toEqual(['demo:x']);
    });

    it('no-op for unknown id', () => {
      useStore.getState().moveEntryToFolder('nope', 'X');
      expect(useStore.getState().libraryEntries).toEqual({});
    });
  });

  describe('cloneEntryToActiveProject', () => {
    beforeEach(() => {
      useStore.setState((s) => { s.currentProjectId = 'pa'; });
    });

    it('creates child entry with zone=active_bodge + projectId + parent refs', async () => {
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'src', payload: { sequence: 'A', length: 1, resourceHash: 'h-src' },
      }));
      const result = await useStore.getState().cloneEntryToActiveProject('src');
      expect(result.ok).toBe(true);
      const newId = result.id;
      const child = useStore.getState().libraryEntries[newId];
      expect(child.zone).toBe('active_bodge');
      expect(child.projectId).toBe('pa');
      expect(child.parentEntryId).toBe('src');
      expect(child.parentEntryHash).toBe('h-src');
      expect(child.kind).toBe('container');
      // Original entry unchanged.
      expect(useStore.getState().libraryEntries.src.zone).toBe('loose');
    });

    it('fails with no-active-project reason when currentProjectId is null', async () => {
      useStore.setState((s) => { s.currentProjectId = null; });
      useStore.setState((s) => { s.libraryEntries.src = makeContainer({ id: 'src' }); });
      const result = await useStore.getState().cloneEntryToActiveProject('src');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no-active-project');
    });
  });

  describe('extractEntryToLoose', () => {
    it('clears projectId + sets zone=loose', async () => {
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'e1', zone: 'active_bodge', projectId: 'p1',
      }));
      await useStore.getState().extractEntryToLoose('e1');
      const e = useStore.getState().libraryEntries.e1;
      expect(e.zone).toBe('loose');
      expect(e.projectId).toBeNull();
    });
  });

  describe('toggleLabStock', () => {
    it('flips inLabStock + sets zone to lab_pool when true', async () => {
      await useStore.getState().addLibraryEntry(makePrimer({ id: 'pr1', inLabStock: false, zone: 'loose' }));
      await useStore.getState().toggleLabStock('pr1');
      const e = useStore.getState().libraryEntries.pr1;
      expect(e.inLabStock).toBe(true);
      expect(e.zone).toBe('lab_pool');
    });

    it('flips back: lab_pool primer → loose when toggled off', async () => {
      await useStore.getState().addLibraryEntry(makePrimer({ id: 'pr1', inLabStock: true, zone: 'lab_pool' }));
      await useStore.getState().toggleLabStock('pr1');
      const e = useStore.getState().libraryEntries.pr1;
      expect(e.inLabStock).toBe(false);
      expect(e.zone).toBe('loose');
    });
  });

  describe('createLooseFolder / renameLooseFolder / deleteLooseFolder', () => {
    it('createLooseFolder records a path so empty folders show in tree', () => {
      useStore.getState().createLooseFolder('Backbones/CRISPR');
      const folders = useStore.getState().looseFolders || [];
      expect(folders).toContain('Backbones/CRISPR');
    });

    it('createLooseFolder is idempotent', () => {
      useStore.getState().createLooseFolder('X');
      useStore.getState().createLooseFolder('X');
      const folders = useStore.getState().looseFolders || [];
      expect(folders.filter(p => p === 'X').length).toBe(1);
    });

    it('renameLooseFolder updates folder list and rewrites entry tags', async () => {
      useStore.getState().createLooseFolder('Backbones');
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'e1', tags: ['Backbones'],
      }));
      useStore.getState().renameLooseFolder('Backbones', 'Backbones-CRISPR');
      const folders = useStore.getState().looseFolders || [];
      expect(folders).toContain('Backbones-CRISPR');
      expect(folders).not.toContain('Backbones');
      const t = useStore.getState().libraryEntries.e1.tags;
      expect(t).toContain('Backbones-CRISPR');
      expect(t).not.toContain('Backbones');
    });

    it('deleteLooseFolder removes path and strips matching tags', async () => {
      useStore.getState().createLooseFolder('X');
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'e1', tags: ['X', 'demo:foo'],
      }));
      useStore.getState().deleteLooseFolder('X');
      const folders = useStore.getState().looseFolders || [];
      expect(folders).not.toContain('X');
      const t = useStore.getState().libraryEntries.e1.tags;
      expect(t).not.toContain('X');
      expect(t).toContain('demo:foo');
    });
  });

  describe('selectors', () => {
    beforeEach(async () => {
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'l1', name: 'loose-A', zone: 'loose', tags: ['Backbones'],
      }));
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'l2', name: 'loose-B', zone: 'loose', tags: ['Inserts'],
      }));
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'a1', name: 'in-active', zone: 'active_bodge', projectId: 'pa',
      }));
      await useStore.getState().addLibraryEntry(makeContainer({
        id: 'r1', name: 'in-readonly', zone: 'readonly_bodge', projectId: 'pb',
      }));
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr1', name: 'primer-lab', zone: 'lab_pool', inLabStock: true,
      }));
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr2', name: 'primer-active', zone: 'active_bodge', projectId: 'pa',
      }));
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr3', name: 'primer-readonly', zone: 'readonly_bodge', projectId: 'pb',
      }));
    });

    it('selectEntriesByZone returns only the requested zone', () => {
      const s = useStore.getState();
      const loose = selectEntriesByZone(s, 'loose').map(e => e.id).sort();
      expect(loose).toEqual(['l1', 'l2']);
      const lab = selectEntriesByZone(s, 'lab_pool').map(e => e.id);
      expect(lab).toEqual(['pr1']);
    });

    it('selectContainersByProject returns only containers of that project', () => {
      const s = useStore.getState();
      const pa = selectContainersByProject(s, 'pa').map(e => e.id);
      expect(pa).toEqual(['a1']);
      const pb = selectContainersByProject(s, 'pb').map(e => e.id);
      expect(pb).toEqual(['r1']);
    });

    it('selectPrimersByProject returns only primers of that project', () => {
      const s = useStore.getState();
      const pa = selectPrimersByProject(s, 'pa').map(e => e.id);
      expect(pa).toEqual(['pr2']);
    });

    it('selectLooseTreeStructure derives folder forest from loose entries', () => {
      // Create a nested folder via a slash-path tag.
      useStore.getState().moveEntryToFolder('l1', 'Backbones/CRISPR');
      const tree = selectLooseTreeStructure(useStore.getState());
      // Forest returned as roots-only; walk to flatten all paths.
      const all = [];
      const walk = (nodes) => nodes.forEach((n) => { all.push(n.path); walk(n.children || []); });
      walk(tree);
      expect(all.sort()).toEqual(['Backbones', 'Backbones/CRISPR', 'Inserts']);
    });

    it('selectLabPoolStructure splits {inLab, crossProject}', async () => {
      // Add a cross-project primer (projectId set, NOT inLabStock).
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr4', name: 'primer-cross', zone: 'lab_pool', inLabStock: false, projectId: 'foreign',
      }));
      const s = useStore.getState();
      const lab = selectLabPoolStructure(s);
      expect(lab.inLab.map(e => e.id)).toEqual(['pr1']);
      expect(lab.crossProject.map(e => e.id)).toEqual(['pr4']);
    });

    it('selectPrimerUsageCount counts distinct projects using a primer', async () => {
      // Same primer referenced from two projects via parentEntryId chain.
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr-x1', zone: 'active_bodge', projectId: 'p1', parentEntryId: 'pr1',
      }));
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr-x2', zone: 'active_bodge', projectId: 'p2', parentEntryId: 'pr1',
      }));
      await useStore.getState().addLibraryEntry(makePrimer({
        id: 'pr-x3', zone: 'active_bodge', projectId: 'p1', parentEntryId: 'pr1',
      }));
      const count = selectPrimerUsageCount(useStore.getState(), 'pr1');
      // Two distinct projects (p1, p2) — pr-x3 is a duplicate p1, dedupes.
      expect(count).toBe(2);
    });
  });
});
