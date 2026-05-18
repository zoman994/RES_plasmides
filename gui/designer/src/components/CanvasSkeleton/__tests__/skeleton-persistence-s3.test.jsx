/**
 * skeleton-persistence-s3.test.jsx — Auto-save + rehydration tests.
 *
 * S3 (14.05.2026 — TIER-S). Coverage:
 *   1. saveSnapshot + loadSnapshot round-trip.
 *   2. REPLACE_STATE action восстанавливает state из snapshot.
 *
 * IndexedDB-heavy debounce tests skip'ятся в jsdom — fake-indexeddb
 * не очень шустрый с timer'ами; верифицируем дебаунс отдельно через
 * mock-storage в integration test после.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  saveSnapshot,
  loadSnapshot,
  clearSnapshot,
  stateKeyFor,
} from '../store/skeleton-persistence';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('S3 — saveSnapshot / loadSnapshot round-trip', () => {
  it('save + load returns persistent state shape (toast stripped как transient UI)', async () => {
    // R12-3: transient UI поля (toast, view, selectedContainerIds) stripped
    // перед save. Persistent data (containers, positions) — preserved.
    await clearSnapshot();
    const state = {
      ...buildInitialState(),
      toast: { kind: 'info', message: 'test-rt' },
      containers: [
        ...buildInitialState().containers,
        { id: 'extra', kind: 'molecule', name: 'X', sequence: 'A', topology: { circular: false }, annotations: [] },
      ],
    };
    const ok = await saveSnapshot(state);
    expect(ok).toBe(true);
    const loaded = await loadSnapshot();
    expect(loaded).toBeTruthy();
    // Transient stripped — toast undefined.
    expect(loaded.toast).toBeUndefined();
    // Persistent restored.
    expect(loaded.containers.some((c) => c.id === 'extra')).toBe(true);
    await clearSnapshot();
  }, 20000);
});

describe('S3 — REPLACE_STATE action', () => {
  it('replaces current state, transient UI поля reset к defaults', () => {
    // R12-3: REPLACE_STATE merges с initial defaults для UI ephemerals.
    const s0 = buildInitialState();
    const snapshot = {
      ...s0,
      toast: { kind: 'info', message: 'restored' }, // ignored as transient
      containers: [
        ...s0.containers,
        { id: 'restored-c', kind: 'molecule', name: 'R', sequence: 'A', topology: { circular: false }, annotations: [] },
      ],
    };
    const s1 = skeletonReducer(s0, { type: 'REPLACE_STATE', state: snapshot });
    // Persistent containers loaded.
    expect(s1.containers.some((c) => c.id === 'restored-c')).toBe(true);
    // Transient toast reset to defaults (null).
    expect(s1.toast).toBeNull();
  });

  it('REPLACE_STATE with invalid payload — no change', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'REPLACE_STATE', state: null });
    expect(s1).toBe(s0);
    const s2 = skeletonReducer(s0, { type: 'REPLACE_STATE', state: { foo: 'bar' } });
    expect(s2).toBe(s0);
  });
});

// V65 — per-project canvas persistence (keyed by currentProjectId).
describe('V65 — per-project snapshot keying', () => {
  it('stateKeyFor: null/undefined → legacy global key; projectId → scoped key', () => {
    expect(stateKeyFor(null)).toBe('canvas-state-v1');
    expect(stateKeyFor(undefined)).toBe('canvas-state-v1');
    expect(stateKeyFor('p1')).toBe('canvas-state-v1::p1');
    expect(stateKeyFor('p1')).not.toBe(stateKeyFor('p2'));
  });

  it('save/load isolated per projectId; legacy (no project) independent', async () => {
    await clearSnapshot('p1');
    await clearSnapshot('p2');
    await clearSnapshot();
    const base = buildInitialState();
    const mk = (cid) => ({
      ...base,
      containers: [...base.containers, { id: cid, kind: 'molecule', name: cid, sequence: 'ATGC', topology: { circular: false }, annotations: [] }],
    });
    expect(await saveSnapshot(mk('in-p1'), 'p1')).toBe(true);
    expect(await saveSnapshot(mk('in-p2'), 'p2')).toBe(true);
    expect(await saveSnapshot(mk('in-global'))).toBe(true); // legacy / no project

    const a = await loadSnapshot('p1');
    const b = await loadSnapshot('p2');
    const g = await loadSnapshot();
    expect(a.containers.some((c) => c.id === 'in-p1')).toBe(true);
    expect(a.containers.some((c) => c.id === 'in-p2')).toBe(false);
    expect(b.containers.some((c) => c.id === 'in-p2')).toBe(true);
    expect(g.containers.some((c) => c.id === 'in-global')).toBe(true);
    expect(g.containers.some((c) => c.id === 'in-p1')).toBe(false);
    await clearSnapshot('p1'); await clearSnapshot('p2'); await clearSnapshot();
  }, 20000);

  it('clearSnapshot(projectId) only clears that project', async () => {
    const base = buildInitialState();
    await saveSnapshot({ ...base }, 'pX');
    await saveSnapshot({ ...base }, 'pY');
    await clearSnapshot('pX');
    expect(await loadSnapshot('pX')).toBeNull();
    expect(await loadSnapshot('pY')).toBeTruthy();
    await clearSnapshot('pY');
  }, 20000);
});
