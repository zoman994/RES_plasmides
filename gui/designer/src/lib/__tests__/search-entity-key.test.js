/**
 * search-entity-key — the globally-unique result identity `<kind>:<id>` (REV #2 §10.4).
 * After projects/primers/enzymes join the result set, a bare `ref.id` is no longer unique
 * (a project, a molecule and a primer can share a local id), so entityKey / React key /
 * docById / dedup / caches / selected-row must all key on this composite.
 */
import { describe, it, expect } from 'vitest';
import { entityRefKey } from '../search-entity-key';

describe('entityRefKey — composite `<kind>:<id>` (§10.4)', () => {
  it('builds the documented composite for every kind', () => {
    expect(entityRefKey({ kind: 'entry', id: 'abc' })).toBe('entry:abc');
    expect(entityRefKey({ kind: 'project', id: 'abc' })).toBe('project:abc');
    expect(entityRefKey({ kind: 'primer', id: 'abc' })).toBe('primer:abc');
    expect(entityRefKey({ kind: 'enzyme', id: 'EcoRI' })).toBe('enzyme:EcoRI');
  });
  it('is collision-free across kinds sharing a local id', () => {
    const same = 'x1';
    const keys = ['entry', 'project', 'primer', 'enzyme'].map((kind) => entityRefKey({ kind, id: same }));
    expect(new Set(keys).size).toBe(keys.length); // all distinct
  });
  it('returns null for a missing / malformed ref (never a silent collision key)', () => {
    expect(entityRefKey(null)).toBeNull();
    expect(entityRefKey(undefined)).toBeNull();
    expect(entityRefKey({})).toBeNull();
    expect(entityRefKey({ kind: 'entry' })).toBeNull(); // no id
    expect(entityRefKey({ id: 'abc' })).toBeNull();      // no kind
    expect(entityRefKey('entry:abc')).toBeNull();         // not an object
  });
  it('coerces a numeric id to string so the key is stable', () => {
    expect(entityRefKey({ kind: 'entry', id: 42 })).toBe('entry:42');
  });
});
