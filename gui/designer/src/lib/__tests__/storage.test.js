import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getItem, setItem, removeItem, getJSON, setJSON,
  isUsingFallback, _setFallbackForTests, _resetMemoryStore,
} from '../storage';

describe('K1 — storage wrapper', () => {
  beforeEach(() => {
    try { globalThis.localStorage?.clear(); } catch { /* ignore */ }
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  afterEach(() => {
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  it('writes and reads a string via localStorage', () => {
    setItem('k1', 'v1');
    expect(getItem('k1')).toBe('v1');
    expect(isUsingFallback()).toBe(false);
  });

  it('removeItem deletes the key', () => {
    setItem('k1', 'v1');
    removeItem('k1');
    expect(getItem('k1')).toBeNull();
  });

  it('getJSON parses, setJSON writes JSON', () => {
    setJSON('cfg', { theme: 'dark', n: 2 });
    expect(getJSON('cfg')).toEqual({ theme: 'dark', n: 2 });
  });

  it('getJSON returns fallback for missing or invalid JSON', () => {
    expect(getJSON('missing', { x: 1 })).toEqual({ x: 1 });
    setItem('bad', 'not json');
    expect(getJSON('bad', null)).toBeNull();
  });

  it('falls back to in-memory Map when localStorage is forced unavailable', () => {
    _setFallbackForTests(true);
    setItem('k', 'v');
    expect(getItem('k')).toBe('v');
    expect(isUsingFallback()).toBe(true);
    removeItem('k');
    expect(getItem('k')).toBeNull();
  });
});
