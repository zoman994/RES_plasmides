/**
 * search-prefs — persisted advanced search settings (P2). The smart box works with
 * zero configuration; these live in the GLOBAL «Настройки поиска» window. Corrupted
 * / out-of-range / stale-schema values must never break search — validate clamps
 * and fills, and a schema bump falls back to defaults.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SEARCH_PREFS, SEARCH_PREFS_SCHEMA_VERSION,
  validateSearchPrefs, loadSearchPrefs, saveSearchPrefs, resetSearchPrefs,
  SEARCH_PREFS_STORAGE_KEY,
} from '../search-prefs';

beforeEach(() => { try { localStorage.clear(); } catch { /* no-op */ } });

describe('DEFAULT_SEARCH_PREFS', () => {
  it('is a sane, complete default set', () => {
    expect(DEFAULT_SEARCH_PREFS.identityThreshold).toBeCloseTo(0.8);
    expect(DEFAULT_SEARCH_PREFS.bothStrands).toBe(true);
    expect(DEFAULT_SEARCH_PREFS.iupac).toBe('auto');
    expect(DEFAULT_SEARCH_PREFS.circular).toBe('auto');
    expect(DEFAULT_SEARCH_PREFS.headVersionsOnly).toBe(true);
    expect(typeof DEFAULT_SEARCH_PREFS.limit).toBe('number');
  });
});

describe('validateSearchPrefs — clamp / coerce / fill', () => {
  it('fills missing fields from defaults', () => {
    const p = validateSearchPrefs({ bothStrands: false });
    expect(p.bothStrands).toBe(false);
    expect(p.identityThreshold).toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
  });
  it('clamps a number out of range', () => {
    expect(validateSearchPrefs({ identityThreshold: 5 }).identityThreshold).toBe(1);
    expect(validateSearchPrefs({ identityThreshold: -3 }).identityThreshold).toBe(0.5);
    expect(validateSearchPrefs({ limit: 999999 }).limit).toBe(1000);
    expect(validateSearchPrefs({ maxMismatches: 99 }).maxMismatches).toBe(5);
  });
  it('coerces a non-number to the default', () => {
    expect(validateSearchPrefs({ identityThreshold: 'nonsense' }).identityThreshold)
      .toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
  });
  it('falls back an invalid enum to the default', () => {
    expect(validateSearchPrefs({ iupac: 'banana' }).iupac).toBe('auto');
    expect(validateSearchPrefs({ circular: 'on' }).circular).toBe('on'); // valid enum kept
  });
  it('drops unknown keys', () => {
    const p = validateSearchPrefs({ evil: 1, bothStrands: true });
    expect(p.evil).toBeUndefined();
  });
  it('a stale schemaVersion falls back to defaults', () => {
    const p = validateSearchPrefs({ schemaVersion: -1, identityThreshold: 0.6 });
    expect(p.identityThreshold).toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
  });
  it('coerces booleans', () => {
    expect(validateSearchPrefs({ bothStrands: 0 }).bothStrands).toBe(false);
    expect(validateSearchPrefs({ headVersionsOnly: 1 }).headVersionsOnly).toBe(true);
  });
});

describe('load / save / reset (localStorage)', () => {
  it('save then load round-trips', () => {
    saveSearchPrefs({ ...DEFAULT_SEARCH_PREFS, identityThreshold: 0.9, bothStrands: false });
    const p = loadSearchPrefs();
    expect(p.identityThreshold).toBeCloseTo(0.9);
    expect(p.bothStrands).toBe(false);
    expect(p.schemaVersion).toBe(SEARCH_PREFS_SCHEMA_VERSION);
  });
  it('load with nothing stored → defaults', () => {
    expect(loadSearchPrefs().identityThreshold).toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
  });
  it('load with corrupt JSON → defaults (no throw)', () => {
    localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, '{not json');
    expect(() => loadSearchPrefs()).not.toThrow();
    expect(loadSearchPrefs().iupac).toBe('auto');
  });
  it('reset restores defaults and persists them', () => {
    saveSearchPrefs({ ...DEFAULT_SEARCH_PREFS, limit: 42 });
    const p = resetSearchPrefs();
    expect(p.limit).toBe(DEFAULT_SEARCH_PREFS.limit);
    expect(loadSearchPrefs().limit).toBe(DEFAULT_SEARCH_PREFS.limit);
  });
});
