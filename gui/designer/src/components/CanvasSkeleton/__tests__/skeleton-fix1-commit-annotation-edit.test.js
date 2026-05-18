/**
 * FIX1 regression — COMMIT_ANNOTATION_EDIT reducer.
 *
 * DEC-SKELETON-FIX1-01: action остаётся в reducer как atomic-edit path
 * (Canvas V2 Editor spec line 234). Editor больше его НЕ дёргает —
 * новый flow идёт через applyAnnotationEdit + setPendingEdits. Action
 * сохраняется на случай прямых atomic mutations (например, из canvas-
 * driven operations sprint).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

// 12.05.2026 — fixture теперь placeholder.
const CID = 'c-placeholder-1';

describe('FIX1 regression — COMMIT_ANNOTATION_EDIT', () => {
  it("kind: 'create' appends annotation with generated id + level=region", () => {
    const s0 = buildInitialState();
    const before = s0.containers.find((c) => c.id === CID).annotations.length;
    const s1 = skeletonReducer(s0, {
      type: 'COMMIT_ANNOTATION_EDIT',
      containerId: CID,
      edit: {
        kind: 'create',
        payload: { name: 'fix1-test', type: 'misc_feature', start: 10, end: 50, strand: 1 },
      },
    });
    const target = s1.containers.find((c) => c.id === CID);
    expect(target.annotations.length).toBe(before + 1);
    const added = target.annotations[target.annotations.length - 1];
    expect(added.name).toBe('fix1-test');
    expect(added.level).toBe('region');
    expect(typeof added.id).toBe('string');
  });

  it("kind: 'update' merges patch", () => {
    const s0 = buildInitialState();
    const sCreated = skeletonReducer(s0, {
      type: 'COMMIT_ANNOTATION_EDIT',
      containerId: CID,
      edit: {
        kind: 'create',
        payload: { id: 'fix1-upd', name: 'a', type: 'CDS', start: 0, end: 30, strand: 1 },
      },
    });
    const sUpdated = skeletonReducer(sCreated, {
      type: 'COMMIT_ANNOTATION_EDIT',
      containerId: CID,
      edit: { kind: 'update', id: 'fix1-upd', patch: { name: 'a-renamed' } },
    });
    const found = sUpdated.containers.find((c) => c.id === CID)
      .annotations.find((a) => a.id === 'fix1-upd');
    expect(found.name).toBe('a-renamed');
  });

  it("kind: 'delete' filters by id", () => {
    const s0 = buildInitialState();
    const sCreated = skeletonReducer(s0, {
      type: 'COMMIT_ANNOTATION_EDIT',
      containerId: CID,
      edit: {
        kind: 'create',
        payload: { id: 'fix1-del', name: 'd', start: 5, end: 15, strand: 1 },
      },
    });
    const sDeleted = skeletonReducer(sCreated, {
      type: 'COMMIT_ANNOTATION_EDIT',
      containerId: CID,
      edit: { kind: 'delete', id: 'fix1-del' },
    });
    expect(sDeleted.containers.find((c) => c.id === CID)
      .annotations.find((a) => a.id === 'fix1-del')).toBeUndefined();
  });
});
