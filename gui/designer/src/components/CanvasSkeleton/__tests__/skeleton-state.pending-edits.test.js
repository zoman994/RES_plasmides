/**
 * K2 — pendingEditsByContainer reducer (DEC-CANVAS-V2-EDITOR-03).
 *
 * Pure reducer unit tests: SET_PENDING_EDITS merges, COMMIT_PENDING_EDITS
 * applies + clears, DISCARD_PENDING_EDITS clears, SET_CONTAINER_NAME
 * mutates name inline.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

// 12.05.2026 — fixture теперь 2 placeholder контейнера; для reducer-
// тестов нужен лишь существующий containerId. Используем placeholder.
const CID = 'c-placeholder-1';

describe('K2 — pendingEditsByContainer reducer', () => {
  it('SET_PENDING_EDITS merges patch (not replace)', () => {
    const s0 = buildInitialState();
    expect(s0.pendingEditsByContainer).toEqual({});
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedAnnotations: [{ id: 'a1', name: 'X', start: 0, end: 10 }] },
    });
    expect(s1.pendingEditsByContainer[CID].editedAnnotations).toHaveLength(1);

    const s2 = skeletonReducer(s1, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedName: 'pUC19-renamed' },
    });
    // Merge — both fields present.
    expect(s2.pendingEditsByContainer[CID].editedAnnotations).toHaveLength(1);
    expect(s2.pendingEditsByContainer[CID].editedName).toBe('pUC19-renamed');
  });

  it('SET_PENDING_EDITS with undefined field strips it (clear pattern)', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedAnnotations: [{ id: 'a1' }], editedName: 'foo' },
    });
    expect(s1.pendingEditsByContainer[CID]).toEqual({
      editedAnnotations: [{ id: 'a1' }],
      editedName: 'foo',
    });
    const s2 = skeletonReducer(s1, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedAnnotations: undefined },
    });
    // editedAnnotations removed, editedName preserved.
    expect(s2.pendingEditsByContainer[CID]).toEqual({ editedName: 'foo' });
  });

  it('SET_PENDING_EDITS — empty after clear-all strips the container entry entirely', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedName: 'foo' },
    });
    const s2 = skeletonReducer(s1, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedName: undefined },
    });
    expect(s2.pendingEditsByContainer[CID]).toBeUndefined();
  });

  it('COMMIT_PENDING_EDITS applies all fields to container + clears buffer + toast', () => {
    const s0 = buildInitialState();
    const newAnns = [{ id: 'a-new', name: 'NewFeat', start: 0, end: 50, strand: 1 }];
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: {
        editedAnnotations: newAnns,
        editedName: 'pUC19-v2',
        editedTopology: 'linear',
      },
    });
    const s2 = skeletonReducer(s1, { type: 'COMMIT_PENDING_EDITS', containerId: CID });

    const target = s2.containers.find((c) => c.id === CID);
    expect(target.annotations).toEqual(newAnns);
    expect(target.name).toBe('pUC19-v2');
    expect(target.topology).toEqual({ circular: false });
    // Buffer cleared.
    expect(s2.pendingEditsByContainer[CID]).toBeUndefined();
    // Toast queued.
    expect(s2.toast?.kind).toBe('success');
  });

  it('COMMIT_PENDING_EDITS — empty pending is no-op', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'COMMIT_PENDING_EDITS', containerId: CID });
    expect(s1).toBe(s0);
  });

  it('DISCARD_PENDING_EDITS clears buffer without touching container', () => {
    const s0 = buildInitialState();
    const beforeName = s0.containers.find((c) => c.id === CID).name;
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId: CID,
      patch: { editedName: 'tmp' },
    });
    const s2 = skeletonReducer(s1, { type: 'DISCARD_PENDING_EDITS', containerId: CID });
    expect(s2.pendingEditsByContainer[CID]).toBeUndefined();
    // Container untouched.
    expect(s2.containers.find((c) => c.id === CID).name).toBe(beforeName);
  });

  it('SET_CONTAINER_NAME mutates state.containers[i].name (trimmed)', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'SET_CONTAINER_NAME',
      containerId: CID,
      name: '  pUC19-inline  ',
    });
    expect(s1.containers.find((c) => c.id === CID).name).toBe('pUC19-inline');
  });

  it('SET_CONTAINER_NAME — empty string after trim is no-op', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'SET_CONTAINER_NAME',
      containerId: CID,
      name: '   ',
    });
    expect(s1).toBe(s0);
  });

  it('unknown containerId — all 4 actions no-op', () => {
    const s0 = buildInitialState();
    const bogus = 'c-does-not-exist';
    expect(skeletonReducer(s0, { type: 'SET_PENDING_EDITS', containerId: bogus, patch: { editedName: 'x' } })).toBe(s0);
    expect(skeletonReducer(s0, { type: 'COMMIT_PENDING_EDITS', containerId: bogus })).toBe(s0);
    expect(skeletonReducer(s0, { type: 'DISCARD_PENDING_EDITS', containerId: bogus })).toBe(s0);
    expect(skeletonReducer(s0, { type: 'SET_CONTAINER_NAME', containerId: bogus, name: 'x' })).toBe(s0);
  });
});
