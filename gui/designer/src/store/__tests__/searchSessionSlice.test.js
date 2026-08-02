/**
 * searchSessionSlice · bufferGeneration — stage 1 (identity foundation).
 *
 * The transient edit buffer needs an identity that a SEARCH RESULT can be compared against. Deriving
 * it from the buffer itself is what failed: `editLog.length` does not grow on an undo (restore()
 * rewrites the buffer in place) nor on a merged correction, and the string length does not move on a
 * substitution — so two different molecules answered with one token and a locus measured on the first
 * was applied to the second.
 *
 * The replacement is a plain per-entry counter, bumped by the WRITE. It is O(1), it never reads a
 * base, and it is MONOTONIC: a value it has already used can never come back, so a nav request parked
 * against an older buffer can never be mistaken for a current one — not even after an undo that
 * restores the buffer byte-for-byte.
 *
 * WHO BUMPS IT: exactly one place — LibraryWorkspace's `onUpdateEdits` (covered by
 * `buffer-generation-central.test.jsx`). This file owns the counter's own arithmetic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';

const st = () => useStore.getState();
const genOf = (id) => st().bufferGenerations?.[id];

beforeEach(() => {
  useStore.setState((s) => {
    s.bufferGenerations = {};
    s.navRequest = null;
  });
});

describe('bufferGeneration — a per-entry counter bumped by the write, never derived from the buffer', () => {
  it('the slice owns a bufferGenerations map and a bump action', () => {
    expect(st().bufferGenerations).toEqual({});
    expect(typeof st().bumpBufferGeneration).toBe('function');
  });

  it('an untouched molecule has NO generation; the first edit makes it 1', () => {
    expect(genOf('e1')).toBeUndefined();
    st().bumpBufferGeneration('e1');
    expect(genOf('e1')).toBe(1);
  });

  it('is MONOTONIC — every bump yields a value never seen before', () => {
    const seen = new Set();
    for (let i = 0; i < 12; i += 1) {
      st().bumpBufferGeneration('e1');
      const g = genOf('e1');
      expect(seen.has(g), 'a generation must never repeat').toBe(false);
      seen.add(g);
    }
    expect(genOf('e1')).toBe(12);
  });

  it('is PER-ENTRY — editing one molecule does not age another', () => {
    st().bumpBufferGeneration('e1');
    st().bumpBufferGeneration('e1');
    st().bumpBufferGeneration('e2');
    expect(genOf('e1')).toBe(2);
    expect(genOf('e2')).toBe(1);
    expect(genOf('e3')).toBeUndefined();
  });

  it('a bump with no entry id changes nothing', () => {
    st().bumpBufferGeneration(undefined);
    st().bumpBufferGeneration(null);
    st().bumpBufferGeneration('');
    expect(st().bufferGenerations).toEqual({});
  });

  it('a corrupted counter heals forward, never backwards', () => {
    // Nothing in the app writes this map directly, but a rehydrated / hand-edited value must not be
    // able to send the counter back through a generation that was already handed out.
    useStore.setState((s) => { s.bufferGenerations = { e1: 'oops' }; });
    st().bumpBufferGeneration('e1');
    expect(genOf('e1')).toBe(1);
    st().bumpBufferGeneration('e1');
    expect(genOf('e1')).toBe(2);
  });
});
