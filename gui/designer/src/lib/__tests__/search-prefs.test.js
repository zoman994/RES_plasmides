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
    expect(DEFAULT_SEARCH_PREFS.circular).toBe('auto');
    expect(DEFAULT_SEARCH_PREFS.minQueryLen).toBe(8);
    expect(DEFAULT_SEARCH_PREFS.headVersionsOnly).toBe(true);
    expect(typeof DEFAULT_SEARCH_PREFS.limit).toBe('number');
  });

  it('no longer offers the settings K3.0 removed from DNA search', () => {
    // «неоднозначные коды» and «допуск несовпадений» stopped being honest controls: the engine
    // is ACGT-only and the threshold is the sole acceptance rule. Leaving a switch that changes
    // nothing is worse than removing it.
    expect(DEFAULT_SEARCH_PREFS).not.toHaveProperty('iupac');
    expect(DEFAULT_SEARCH_PREFS).not.toHaveProperty('maxMismatches');
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
    expect(validateSearchPrefs({ minQueryLen: 99 }).minQueryLen).toBe(30);
  });
  it('coerces a non-number to the default', () => {
    expect(validateSearchPrefs({ identityThreshold: 'nonsense' }).identityThreshold)
      .toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
  });
  it('falls back an invalid enum to the default', () => {
    expect(validateSearchPrefs({ circular: 'banana' }).circular).toBe('auto');
    expect(validateSearchPrefs({ circular: 'on' }).circular).toBe('on'); // valid enum kept
  });
  it('drops unknown keys', () => {
    const p = validateSearchPrefs({ evil: 1, bothStrands: true });
    expect(p.evil).toBeUndefined();
  });
  it('an UNKNOWN schemaVersion falls back to defaults', () => {
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
    expect(loadSearchPrefs().identityThreshold).toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
  });
  it('reset restores defaults and persists them', () => {
    saveSearchPrefs({ ...DEFAULT_SEARCH_PREFS, limit: 42 });
    const p = resetSearchPrefs();
    expect(p.limit).toBe(DEFAULT_SEARCH_PREFS.limit);
    expect(loadSearchPrefs().limit).toBe(DEFAULT_SEARCH_PREFS.limit);
  });
});

describe('v1 → v2 migration (K3.0) — a real migration, not a silent reset', () => {
  // Bumping the schema used to mean «throw everything away». A user who had deliberately set
  // 92%, single-strand and 500 results would have found all three back at defaults after an
  // update, with nothing said. The six surviving settings must carry over; only the two controls
  // that no longer do anything are dropped.
  const V1 = {
    schemaVersion: 1,
    identityThreshold: 0.92,
    bothStrands: false,
    iupac: 'off',
    circular: 'on',
    minQueryLen: 12,
    maxMismatches: 3,
    headVersionsOnly: false,
    limit: 500,
  };

  it('carries every surviving setting across the bump', () => {
    const p = validateSearchPrefs(V1);
    expect(p.schemaVersion).toBe(SEARCH_PREFS_SCHEMA_VERSION);
    expect(p.identityThreshold).toBeCloseTo(0.92);
    expect(p.bothStrands).toBe(false);
    expect(p.circular).toBe('on');
    expect(p.minQueryLen).toBe(12);
    expect(p.headVersionsOnly).toBe(false);
    expect(p.limit).toBe(500);
  });

  it('drops the two retired keys instead of carrying dead state', () => {
    const p = validateSearchPrefs(V1);
    expect(p).not.toHaveProperty('iupac');
    expect(p).not.toHaveProperty('maxMismatches');
  });

  it('migrates what is ALREADY on disk, in place (the storage key is not abandoned)', () => {
    // Writing to a fresh key would leave the real settings stranded under the old one — a reset
    // by another name.
    localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, JSON.stringify(V1));
    const p = loadSearchPrefs();
    expect(p.identityThreshold).toBeCloseTo(0.92);
    expect(p.limit).toBe(500);
    expect(p.schemaVersion).toBe(SEARCH_PREFS_SCHEMA_VERSION);
  });

  it('a corrupt v1 payload still clamps rather than propagating nonsense', () => {
    const p = validateSearchPrefs({ ...V1, identityThreshold: 42, limit: -5 });
    expect(p.identityThreshold).toBe(1);
    expect(p.limit).toBe(10);
  });

  it('WRITES the migrated v2 back to storage — migration in memory only is not migration', () => {
    // Without a write-back the v1 blob (with its two retired keys) sits on disk for good: every
    // load re-migrates, and any future reader that trusts `schemaVersion` still sees a 1.
    localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, JSON.stringify(V1));
    loadSearchPrefs();
    const onDisk = JSON.parse(localStorage.getItem(SEARCH_PREFS_STORAGE_KEY));
    expect(onDisk.schemaVersion).toBe(SEARCH_PREFS_SCHEMA_VERSION);
    expect(onDisk.identityThreshold).toBeCloseTo(0.92);
    expect(onDisk.limit).toBe(500);
    expect(onDisk).not.toHaveProperty('iupac');
    expect(onDisk).not.toHaveProperty('maxMismatches');
  });

  it('a failing write-back still returns the correct settings (never degrades to defaults)', () => {
    // Quota, private mode, a locked profile — none of those are a reason to hand the user
    // defaults when we just read their real preferences successfully.
    localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, JSON.stringify(V1));
    const setItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      const p = loadSearchPrefs();
      expect(p.identityThreshold).toBeCloseTo(0.92);
      expect(p.bothStrands).toBe(false);
      expect(p.limit).toBe(500);
    } finally {
      localStorage.setItem = setItem;
    }
  });

  it('a FUTURE version is read as defaults but LEFT ON DISK, byte for byte', () => {
    // The dangerous case: an older build opens settings written by a newer one. It cannot
    // understand v3, so it must fall back to defaults for this session — but overwriting the
    // file would destroy the real settings the moment the user downgrades or runs two versions.
    // Code that does not understand a format has no business rewriting it.
    const v3 = JSON.stringify({ schemaVersion: 3, identityThreshold: 0.77, somethingNew: 'x' });
    localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, v3);
    const p = loadSearchPrefs();
    expect(p.identityThreshold).toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
    expect(localStorage.getItem(SEARCH_PREFS_STORAGE_KEY)).toBe(v3);
  });

  it('a payload with NO version is treated the same way — defaults, disk untouched', () => {
    const raw = JSON.stringify({ identityThreshold: 0.61, bothStrands: false });
    localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, raw);
    const p = loadSearchPrefs();
    expect(p.identityThreshold).toBeCloseTo(DEFAULT_SEARCH_PREFS.identityThreshold);
    expect(localStorage.getItem(SEARCH_PREFS_STORAGE_KEY)).toBe(raw);
  });

  it('an already-current payload is not rewritten on every read', () => {
    // Write-back is for migration, not a write on each load: a read path that writes is a
    // surprise, and here it would churn storage on every keystroke-driven prefs read.
    saveSearchPrefs({ ...DEFAULT_SEARCH_PREFS, limit: 300 });
    let writes = 0;
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (...args) => { writes += 1; return setItem(...args); };
    try {
      loadSearchPrefs();
      expect(writes).toBe(0);
    } finally {
      localStorage.setItem = setItem;
    }
  });
});
