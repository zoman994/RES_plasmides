/**
 * K1.0 — searchUiContract: the shared ownership + identity contract for the
 * Search UI primitives. The crux is that the active result is tracked by a
 * STABLE entity key, never by array index, so a partial→final reorder can
 * never point the active state at the wrong entity or dangle.
 */
import { describe, it, expect } from 'vitest';
import { optionDomId, defaultGetOptionKey, resolveActiveIndex, assertUniqueOptionKeys, hasText } from '../searchUiContract';

describe('optionDomId — stable per KEY + INJECTIVE encoding', () => {
  it('is deterministic and namespaced by listbox id + the stable option key', () => {
    expect(optionDomId('lb1', 'e1')).toBe('lb1-opt-e1');
    expect(optionDomId('lb1', 'e1')).toBe(optionDomId('lb1', 'e1'));
  });

  it('does not change when the entity moves index (id follows the KEY, not position)', () => {
    const before = optionDomId('lb', 'entry:xyz'); // was index 0
    const after = optionDomId('lb', 'entry:xyz'); // now index 2
    expect(after).toBe(before);
  });

  it('is INJECTIVE — distinct keys never collapse to the same id', () => {
    expect(optionDomId('lb', 'My Enzyme')).not.toBe(optionDomId('lb', 'My_Enzyme'));
    expect(optionDomId('lb', 'a b')).not.toBe(optionDomId('lb', 'a  b')); // one vs two spaces
    expect(optionDomId('lb', 'x/y')).not.toBe(optionDomId('lb', 'x y'));
    expect(optionDomId('lb', 'entry:5')).not.toBe(optionDomId('lb', 'primer:5'));
  });

  it('produces a DOM-valid id (no whitespace)', () => {
    expect(optionDomId('lb', 'My Enzyme')).not.toMatch(/\s/);
  });
});

describe('defaultGetOptionKey — mandatory, kind-qualified identity, fail-closed', () => {
  it('prefers entityKey; else derives kind:id for kind-bearing items; else key; else id', () => {
    expect(defaultGetOptionKey({ entityKey: 'entry:e1', kind: 'z', id: 'i' })).toBe('entry:e1');
    expect(defaultGetOptionKey({ kind: 'entry', id: 'x' })).toBe('entry:x');
    expect(defaultGetOptionKey({ key: 'k', id: 'i' })).toBe('k');
    expect(defaultGetOptionKey({ id: 'i' })).toBe('i'); // no kind → bare id ok for non-kind items
  });

  it('a bare id shared across kinds is disambiguated by kind (no cross-kind collision)', () => {
    expect(defaultGetOptionKey({ kind: 'entry', id: '5' }))
      .not.toBe(defaultGetOptionKey({ kind: 'primer', id: '5' }));
  });

  it('THROWS when no stable identity is present — never falls back to array index', () => {
    // A positional fallback would silently re-target Enter to a different entity
    // after a partial→final reorder. Fail closed instead.
    expect(() => defaultGetOptionKey({}, 5)).toThrow();
    expect(() => defaultGetOptionKey(null, 2)).toThrow();
    expect(() => defaultGetOptionKey(undefined, 7)).toThrow();
  });
});

describe('assertUniqueOptionKeys — fail-closed on key collision', () => {
  it('passes when all keys are unique (incl. kind-disambiguated same-id)', () => {
    expect(() => assertUniqueOptionKeys([{ id: 'a' }, { id: 'b' }])).not.toThrow();
    expect(() => assertUniqueOptionKeys([{ kind: 'entry', id: 'x' }, { kind: 'primer', id: 'x' }])).not.toThrow();
  });

  it('THROWS when two items collapse to the same key', () => {
    expect(() => assertUniqueOptionKeys([{ id: 'x' }, { id: 'x' }])).toThrow();
  });
});

describe('hasText — non-blank string guard (fail-closed a11y labels)', () => {
  it('is true only for a string with non-whitespace content', () => {
    expect(hasText('a')).toBe(true);
    expect(hasText('  x ')).toBe(true);
    expect(hasText('')).toBe(false);
    expect(hasText('   ')).toBe(false);
    expect(hasText(undefined)).toBe(false);
    expect(hasText(null)).toBe(false);
  });
});

describe('resolveActiveIndex — key identity survives reorder, dangles never', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('finds the active entity by its stable key', () => {
    expect(resolveActiveIndex(items, 'b')).toBe(1);
    expect(resolveActiveIndex(items, 'a')).toBe(0);
  });

  it('returns -1 when there is no active key', () => {
    expect(resolveActiveIndex(items, null)).toBe(-1);
    expect(resolveActiveIndex(items, undefined)).toBe(-1);
  });

  it('returns -1 when the active entity has left the list (removed / dropped by final)', () => {
    expect(resolveActiveIndex(items, 'gone')).toBe(-1);
    expect(resolveActiveIndex([{ id: 'a' }, { id: 'c' }], 'b')).toBe(-1); // 'b' removed
  });

  it('tracks the same entity through a partial→final reorder (index moves, key does not)', () => {
    const partial = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const final = [{ id: 'c' }, { id: 'a' }, { id: 'b' }]; // reordered
    expect(resolveActiveIndex(partial, 'a')).toBe(0);
    expect(resolveActiveIndex(final, 'a')).toBe(1); // same entity, new index — not dangling
  });

  it('honours a custom getOptionKey', () => {
    const custom = (it) => `entry:${it.id}`;
    expect(resolveActiveIndex(items, 'entry:c', custom)).toBe(2);
    expect(resolveActiveIndex(items, 'c', custom)).toBe(-1); // raw id no longer matches
  });

  it('is defensive against a non-array items argument', () => {
    expect(resolveActiveIndex(null, 'a')).toBe(-1);
    expect(resolveActiveIndex(undefined, 'a')).toBe(-1);
  });
});
