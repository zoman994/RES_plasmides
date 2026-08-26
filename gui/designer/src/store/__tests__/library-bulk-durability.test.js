/**
 * ANN-0I — `addLibraryEntriesBulk` durability, against the REAL slice.
 *
 * The ingress reports success from what the store returns. That is only honest
 * if the store returns a commit RECEIPT. Previously the slice wrote rows into
 * memory and only then awaited IndexedDB, so a quota error or a blocked upgrade
 * left phantom rows: visible in the tree, openable, editable — and gone on
 * reload. An optimistic ingress stub cannot catch that; this test drives the
 * actual slice with a failing persistence layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const putLibraryEntriesBulk = vi.fn(async () => {});

vi.mock('../../db/dexie-schema', () => ({
  putLibraryEntry: vi.fn(async () => {}),
  putLibraryEntriesBulk: (...args) => putLibraryEntriesBulk(...args),
  listLibraryEntries: vi.fn(async () => []),
  deleteLibraryEntry: vi.fn(async () => {}),
}));

import { createLibrarySlice } from '../librarySlice';

/** Minimal zustand-shaped harness: immer-free `set` over a plain state object. */
function makeSlice() {
  const state = { libraryEntries: {} };
  const set = (fn) => {
    if (typeof fn === 'function') fn(state);
    else Object.assign(state, fn);
  };
  const get = () => ({ ...state, ...slice });
  const slice = createLibrarySlice(set, get);
  return { slice, state };
}

function entry(id, name = id) {
  return {
    id,
    name,
    kind: 'container',
    payload: { sequence: 'ACGTACGTAC', length: 10, topology: 'linear', annotations: [] },
  };
}

beforeEach(() => {
  putLibraryEntriesBulk.mockReset();
  putLibraryEntriesBulk.mockImplementation(async () => {});
});

describe('addLibraryEntriesBulk — durability', () => {
  it('takes an array and returns the committed rows', async () => {
    const { slice, state } = makeSlice();
    const committed = await slice.addLibraryEntriesBulk([entry('a'), entry('b')]);

    expect(Array.isArray(committed)).toBe(true);
    expect(committed.map((e) => e.id)).toEqual(['a', 'b']);
    expect(Object.keys(state.libraryEntries)).toEqual(['a', 'b']);
  });

  it('persists BEFORE the rows become visible in memory', async () => {
    const { slice, state } = makeSlice();
    let visibleDuringWrite = null;
    putLibraryEntriesBulk.mockImplementation(async () => {
      visibleDuringWrite = Object.keys(state.libraryEntries).length;
    });

    await slice.addLibraryEntriesBulk([entry('a')]);
    expect(visibleDuringWrite).toBe(0);
    expect(Object.keys(state.libraryEntries)).toEqual(['a']);
  });

  it('leaves NO in-memory rows when IndexedDB rejects', async () => {
    const { slice, state } = makeSlice();
    putLibraryEntriesBulk.mockImplementation(async () => {
      throw new Error('QuotaExceededError');
    });

    await expect(slice.addLibraryEntriesBulk([entry('a'), entry('b')]))
      .rejects.toThrow(/Quota/);
    expect(state.libraryEntries).toEqual({});
  });

  it('returns no committed rows when persistence fails', async () => {
    const { slice } = makeSlice();
    putLibraryEntriesBulk.mockImplementation(async () => {
      throw new Error('blocked');
    });

    let committed = 'not-set';
    try {
      committed = await slice.addLibraryEntriesBulk([entry('a')]);
    } catch {
      committed = [];
    }
    expect(committed).toEqual([]);
  });

  it('drops rows without an id and never persists them', async () => {
    const { slice, state } = makeSlice();
    const committed = await slice.addLibraryEntriesBulk([entry('a'), { name: 'no-id' }]);

    expect(committed.map((e) => e.id)).toEqual(['a']);
    expect(Object.keys(state.libraryEntries)).toEqual(['a']);
    const [persisted] = putLibraryEntriesBulk.mock.calls[0];
    expect(persisted.map((e) => e.id)).toEqual(['a']);
  });

  it('an empty or non-array input commits nothing', async () => {
    const { slice, state } = makeSlice();
    expect(await slice.addLibraryEntriesBulk([])).toEqual([]);
    expect(await slice.addLibraryEntriesBulk({ entries: [entry('a')] })).toEqual([]);
    expect(state.libraryEntries).toEqual({});
    expect(putLibraryEntriesBulk).not.toHaveBeenCalled();
  });
});

describe('ingress reports success only from the receipt', () => {
  it('a failing store yields ok:false and no committed rows', async () => {
    const { importFilesToLibrary } = await import(
      '../../components/Library/lib/canonical-file-ingress');
    const { slice } = makeSlice();
    putLibraryEntriesBulk.mockImplementation(async () => {
      throw new Error('QuotaExceededError');
    });

    const gb = `LOCUS       X                         60 bp    DNA     linear   SYN 02-AUG-2026
FEATURES             Location/Qualifiers
ORIGIN
        1 acgtacgtac acgtacgtac acgtacgtac acgtacgtac acgtacgtac acgtacgtac
//
`;
    const result = await importFilesToLibrary(
      [new File([gb], 'x.gb', { type: 'text/plain' })],
      { store: slice, autoAnnotate: false },
    );

    expect(result.ok).toBe(false);
    expect(result.committed).toHaveLength(0);
    expect(result.errors.join(' ')).toMatch(/Quota/);
  });
});
