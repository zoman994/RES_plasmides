/**
 * mini-fix-2 — V41 ANNOTATE-DUPLICATE-SESSION-LOG.
 *
 * Repeat clicks on `Аннотировать` in single-mode used to spam the session
 * log with `+0 регионов` rows for the same fragment. `appendSessionEntry`
 * dedupes annotate-action entries by name.
 */
import { describe, it, expect } from 'vitest';
import { appendSessionEntry } from '../components/ImportStartScreen/session-log';

const miniMapData = { length: 5000, topology: 'circular', annotations: [] };

describe('V41 appendSessionEntry — annotate dedup', () => {
  it('first annotate click appends entry', () => {
    const out = appendSessionEntry([], { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 4 });
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ name: 'pX', action: 'annotate', regionsAdded: 4 });
  });

  it('three clicks on same name (delta=4, then 0, then 0) → 1 entry with delta=4', () => {
    let log = [];
    log = appendSessionEntry(log, { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 4 });
    log = appendSessionEntry(log, { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 0 });
    log = appendSessionEntry(log, { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 0 });
    expect(log.length).toBe(1);
    expect(log[0].regionsAdded).toBe(4);
  });

  it('second click with non-zero delta replaces the prior annotate row', () => {
    let log = appendSessionEntry([], { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 4 });
    log = appendSessionEntry(log, { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 7 });
    expect(log.length).toBe(1);
    expect(log[0].regionsAdded).toBe(7);
  });

  it('annotate clicks on different names accumulate (no cross-name dedup)', () => {
    let log = appendSessionEntry([], { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 4 });
    log = appendSessionEntry(log, { name: 'pY', action: 'annotate', miniMapData, regionsAdded: 2 });
    log = appendSessionEntry(log, { name: 'pX', action: 'annotate', miniMapData, regionsAdded: 0 });
    expect(log.length).toBe(2);
    expect(log.map((e) => e.name)).toEqual(['pX', 'pY']);
    expect(log.find((e) => e.name === 'pX').regionsAdded).toBe(4);
  });

  it('canvas / library entries pass through unchanged (no dedup)', () => {
    let log = appendSessionEntry([], { name: 'pX', action: 'canvas', miniMapData });
    log = appendSessionEntry(log, { name: 'pX', action: 'canvas', miniMapData });
    log = appendSessionEntry(log, { name: 'pX', action: 'library', miniMapData });
    expect(log.length).toBe(3);
  });
});
