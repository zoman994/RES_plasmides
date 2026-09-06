import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../index';
import { getDB } from '../../db/dexie-schema';
import { computeResourceHash } from '../../components/Library/lib/resource-hash';

function seedParent(id = 'p1') {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name: 'pUC19', kind: 'container', version: 1, _pendingDelete: false,
      addedAt: '2026-06-16T10:00:00Z',
      origin: { kind: 'file_import' },
      payload: { sequence: 'ACGTACGTACGT', topology: 'circular', annotations: [] },
    };
  });
}

beforeEach(() => {
  useStore.setState((s) => { s.libraryEntries = {}; s.libraryEditLog = {}; s.libraryUndo = {}; });
});
afterEach(() => vi.restoreAllMocks());

describe('createManualEditBranch — lineageRole intent', () => {
  it('stores origin.lineageRole when passed in meta', async () => {
    seedParent();
    const res = await useStore.getState().createManualEditBranch('p1', 'ACGTACGTACGA', [], { lineageRole: 'branch', name: 'вариант' });
    expect(res.ok).toBe(true);
    expect(useStore.getState().libraryEntries[res.id].origin.lineageRole).toBe('branch');
  });

  it('defaults to no lineageRole field when meta omits it (back-compat)', async () => {
    seedParent();
    const res = await useStore.getState().createManualEditBranch('p1', 'ACGTACGTACGC', []);
    expect(res.ok).toBe(true);
    expect(useStore.getState().libraryEntries[res.id].origin.lineageRole).toBeUndefined();
  });

  it('ignores an invalid lineageRole value', async () => {
    seedParent();
    const res = await useStore.getState().createManualEditBranch('p1', 'ACGTACGTACGG', [], { lineageRole: 'bogus' });
    expect(res.ok).toBe(true);
    expect(useStore.getState().libraryEntries[res.id].origin.lineageRole).toBeUndefined();
  });

  it('versions the selected topology into payload + hash without mutating the parent', async () => {
    seedParent();
    const expectedLinearHash = await computeResourceHash({
      sequence: 'ACGTACGTACGT', topology: 'linear', ends: undefined,
    });
    const circularHash = await computeResourceHash({
      sequence: 'ACGTACGTACGT', topology: 'circular', ends: undefined,
    });
    expect(expectedLinearHash).not.toBe(circularHash);

    const res = await useStore.getState().createManualEditBranch(
      'p1',
      'ACGTACGTACGT',
      [],
      { topology: 'linear', changes: 'топология · кольцевая → линейная' },
    );
    expect(res.ok).toBe(true);
    expect(useStore.getState().libraryEntries.p1.payload.topology).toBe('circular');
    expect(useStore.getState().libraryEntries[res.id].payload.topology).toBe('linear');
    expect(useStore.getState().libraryEntries[res.id].payload.resourceHash).toBe(expectedLinearHash);
  });

  it('rolls back the optimistic child when persistence fails', async () => {
    seedParent();
    vi.spyOn(getDB().library, 'put').mockRejectedValueOnce(new Error('disk offline'));
    const beforeIds = Object.keys(useStore.getState().libraryEntries);
    const res = await useStore.getState().createManualEditBranch(
      'p1', 'ACGTACGTACGT', [], { topology: 'linear' },
    );
    expect(res).toMatchObject({ ok: false, reason: 'persist-error' });
    expect(Object.keys(useStore.getState().libraryEntries)).toEqual(beforeIds);
  });
});

describe('setLibraryEntryVersionStatus', () => {
  it('sets origin.status for a valid status + persists', async () => {
    seedParent('e1');
    await useStore.getState().setLibraryEntryVersionStatus('e1', 'release');
    expect(useStore.getState().libraryEntries.e1.origin.status).toBe('release');
  });

  it('clears origin.status when passed null', async () => {
    seedParent('e2');
    await useStore.getState().setLibraryEntryVersionStatus('e2', 'wip');
    expect(useStore.getState().libraryEntries.e2.origin.status).toBe('wip');
    await useStore.getState().setLibraryEntryVersionStatus('e2', null);
    expect(useStore.getState().libraryEntries.e2.origin.status).toBeUndefined();
  });

  it('rejects an invalid status (no-op)', async () => {
    seedParent('e3');
    await useStore.getState().setLibraryEntryVersionStatus('e3', 'bogus');
    expect(useStore.getState().libraryEntries.e3.origin?.status).toBeUndefined();
  });

  it('no-op on a missing entry', async () => {
    await expect(useStore.getState().setLibraryEntryVersionStatus('nope', 'release')).resolves.toBeUndefined();
  });
});
