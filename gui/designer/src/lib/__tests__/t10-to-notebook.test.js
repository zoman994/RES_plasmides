/**
 * NB-K15 — T10 Sanger notes → notebook entries migration.
 */
import { describe, it, expect } from 'vitest';
import {
  migrateT10NotesToNotebook,
  hasUnmigratedT10Notes,
} from '../notebook-migrations/t10-to-notebook';

function baseState() {
  return {
    projectMeta: { id: 'p01', author: { name: 'Igor', deviceId: '01XYZ' } },
    operations: [
      {
        id: 'op01', kind: 'gibson',
        materializedClones: [
          { cloneId: 'cl01', label: 'clone-1', sangerVerified: 'verified', notes: 'OK, no mutations' },
          { cloneId: 'cl02', label: 'clone-2', sangerVerified: 'failed', notes: 'C234T silent mutation' },
          { cloneId: 'cl03', label: 'clone-3', sangerVerified: 'pending', notes: '' },
          { cloneId: 'cl04', label: 'clone-4' /* no notes */ },
        ],
      },
      {
        id: 'op02', kind: 'pcr',
        materializedClones: null, // op without clones
      },
    ],
    notebookEntries: [],
  };
}

describe('NB-K15 — migrateT10NotesToNotebook (idempotent)', () => {
  it('promotes each notes field with content into a sanger notebook entry', () => {
    const state = baseState();
    const r = migrateT10NotesToNotebook(state);
    expect(r.notebookEntries).toHaveLength(2);
    expect(r.notebookEntries.every(e => e.kind === 'sanger')).toBe(true);
  });

  it('stamps sangerNotebookEntryId on the migrated clones', () => {
    const r = migrateT10NotesToNotebook(baseState());
    const op = r.operations.find(o => o.id === 'op01');
    expect(op.materializedClones[0].sangerNotebookEntryId).toMatch(/^nb/);
    expect(op.materializedClones[1].sangerNotebookEntryId).toMatch(/^nb/);
  });

  it('keeps original notes field (back-compat, removed in v0.9.x+1)', () => {
    const r = migrateT10NotesToNotebook(baseState());
    const op = r.operations.find(o => o.id === 'op01');
    expect(op.materializedClones[0].notes).toBe('OK, no mutations');
  });

  it('skips clones with empty notes / no notes field', () => {
    const r = migrateT10NotesToNotebook(baseState());
    const op = r.operations.find(o => o.id === 'op01');
    expect(op.materializedClones[2].sangerNotebookEntryId).toBeUndefined(); // empty
    expect(op.materializedClones[3].sangerNotebookEntryId).toBeUndefined(); // missing
  });

  it('refs population: [operation, clone] both included', () => {
    const r = migrateT10NotesToNotebook(baseState());
    const firstEntry = r.notebookEntries[0];
    expect(firstEntry.refs).toEqual([
      { kind: 'operation', id: 'op01' },
      { kind: 'clone', id: 'cl01' },
    ]);
  });

  it('data block defaulted from clone.sangerVerified', () => {
    const r = migrateT10NotesToNotebook(baseState());
    const verified = r.notebookEntries.find(e => e.text.startsWith('OK'));
    expect(verified.data.sangerVerified).toBe('verified');
    const failed = r.notebookEntries.find(e => e.text.startsWith('C234'));
    expect(failed.data.sangerVerified).toBe('failed');
  });

  it('idempotent: running twice does not duplicate entries', () => {
    const once = migrateT10NotesToNotebook(baseState());
    const twice = migrateT10NotesToNotebook(once);
    expect(twice.notebookEntries).toHaveLength(once.notebookEntries.length);
  });

  it('returns unchanged state when nothing to migrate', () => {
    const noNotes = {
      operations: [{ id: 'op01', materializedClones: [{ cloneId: 'cl01' }] }],
      notebookEntries: [],
    };
    const r = migrateT10NotesToNotebook(noNotes);
    expect(r.notebookEntries).toEqual([]);
    expect(r.operations[0].materializedClones[0].sangerNotebookEntryId).toBeUndefined();
  });

  it('preserves existing notebook entries on subsequent migration', () => {
    const state = baseState();
    state.notebookEntries = [{ id: 'pre01', kind: 'free-text', text: 'preexisting' }];
    const r = migrateT10NotesToNotebook(state);
    expect(r.notebookEntries[0].id).toBe('pre01');
    expect(r.notebookEntries).toHaveLength(3);
  });

  it('uses author from projectMeta.author when present', () => {
    const r = migrateT10NotesToNotebook(baseState());
    expect(r.notebookEntries[0].author.name).toBe('Igor');
  });

  it('handles missing operations / null state safely', () => {
    expect(migrateT10NotesToNotebook(null)).toBeNull();
    expect(migrateT10NotesToNotebook({})).toEqual({});
  });
});

describe('NB-K15 — hasUnmigratedT10Notes probe', () => {
  it('detects unmigrated notes', () => {
    expect(hasUnmigratedT10Notes(baseState())).toBe(true);
  });

  it('returns false after migration runs', () => {
    const r = migrateT10NotesToNotebook(baseState());
    expect(hasUnmigratedT10Notes(r)).toBe(false);
  });

  it('returns false for state without operations', () => {
    expect(hasUnmigratedT10Notes({})).toBe(false);
    expect(hasUnmigratedT10Notes(null)).toBe(false);
  });
});
