/**
 * K3 — adapt-container-to-item helpers (DEC-CANVAS-V2-EDITOR-02).
 */
import { describe, it, expect } from 'vitest';
import {
  buildItemFromContainer,
  buildEditsFromPending,
  hasPendingEdits,
} from '../editor/adapt-container-to-item';

describe('K3 — buildItemFromContainer', () => {
  it('maps container with sequence/annotations/circular topology', () => {
    const c = {
      id: 'c-abc',
      name: 'pUC19',
      sequence: 'ATGC',
      annotations: [{ id: 'a1', start: 0, end: 4 }],
      topology: { circular: true },
      length: 4,
      origin: { kind: 'catalog' },
    };
    const item = buildItemFromContainer(c);
    expect(item).toMatchObject({
      id: 'c-abc',
      _fileName: 'c-abc',
      name: 'pUC19',
      sequence: 'ATGC',
      annotations: [{ id: 'a1', start: 0, end: 4 }],
      topology: 'circular',
      length: 4,
      _libraryEntryId: null,
      zone: 'skeleton',
    });
  });

  it('maps linear topology to string "linear"', () => {
    const c = {
      id: 'c-l',
      name: 'L',
      sequence: 'AAAA',
      topology: { circular: false },
    };
    const item = buildItemFromContainer(c);
    expect(item.topology).toBe('linear');
  });

  it('placeholder container (V2 paradigma) — null sequence → empty + 0 length', () => {
    const c = {
      id: 'c-placeholder',
      name: '',
      sequence: null,
      topology: null,
    };
    const item = buildItemFromContainer(c);
    expect(item.sequence).toBe('');
    expect(item.length).toBe(0);
    expect(item.annotations).toEqual([]);
    expect(item.topology).toBe('linear'); // default when no circular flag
  });

  it('null container → safe defaults', () => {
    const item = buildItemFromContainer(null);
    expect(item.id).toBeNull();
    expect(item.sequence).toBe('');
    expect(item.length).toBe(0);
  });
});

describe('K3 — buildEditsFromPending', () => {
  it('null pending → null edits', () => {
    expect(buildEditsFromPending(null)).toBeNull();
    expect(buildEditsFromPending({})).toBeNull();
  });

  it('partial pending → subset edits (no extra keys)', () => {
    const e = buildEditsFromPending({ editedName: 'foo' });
    expect(e).toEqual({ editedName: 'foo' });
  });

  it('full pending → full edits + topology string conversion', () => {
    const e = buildEditsFromPending({
      editedAnnotations: [{ id: 'x' }],
      editedSequence: 'ATGC',
      editedTopology: { circular: true },
      editedName: 'foo',
    });
    expect(e).toEqual({
      editedAnnotations: [{ id: 'x' }],
      editedSequence: 'ATGC',
      editedTopology: 'circular',
      editedName: 'foo',
    });
  });

  it('topology string passes through unchanged', () => {
    const e = buildEditsFromPending({ editedTopology: 'linear' });
    expect(e.editedTopology).toBe('linear');
  });
});

describe('K3 — hasPendingEdits', () => {
  it('null/empty/no-known-fields → false', () => {
    expect(hasPendingEdits(null)).toBe(false);
    expect(hasPendingEdits({})).toBe(false);
    expect(hasPendingEdits({ foo: 'bar' })).toBe(false);
  });

  it('any of 4 known fields → true', () => {
    expect(hasPendingEdits({ editedAnnotations: [] })).toBe(true);
    expect(hasPendingEdits({ editedSequence: 'A' })).toBe(true);
    expect(hasPendingEdits({ editedTopology: 'circular' })).toBe(true);
    expect(hasPendingEdits({ editedName: 'x' })).toBe(true);
  });
});
