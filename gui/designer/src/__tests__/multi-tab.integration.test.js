import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../store';
import {
  setAutoLockEnabled, clearAllLocks, clearAllAutosaveTimers,
} from '../store/projectSlice';
import { clearAll } from '../db/dexie-schema';

async function reset() {
  clearAllAutosaveTimers();
  clearAllLocks();
  await clearAll();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state._projectLifecycle = {};
    state.fileHandle = null;
    state.fileName = null;
    state.lastSavedToFileAt = null;
    state.fileLastKnownModified = null;
    state.recoveredFromCrash = false;
    state.hasProjectLock = false;
    state.lockHolderTabId = null;
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: false };
    state.toasts = [];
  });
}

function fakeNavigatorLocks() {
  const held = new Map();
  const orig = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      locks: {
        async request(name, options, cb) {
          if (held.has(name)) {
            if (options && options.ifAvailable) { await cb(null); return null; }
            throw new Error('blocked');
          }
          let resolve;
          const released = new Promise((r) => { resolve = r; });
          held.set(name, resolve);
          try {
            const result = await cb({ name, mode: options?.mode || 'exclusive' });
            return result;
          } finally {
            held.delete(name);
            resolve();
          }
        },
      },
    },
    configurable: true, writable: true,
  });
  return { restore: () => { Object.defineProperty(globalThis, 'navigator', { value: orig, configurable: true, writable: true }); } };
}

describe('K9 — multi-tab lock + readOnlyForced flow', () => {
  let teardown;
  beforeEach(async () => {
    await reset();
    teardown = fakeNavigatorLocks();
    setAutoLockEnabled(true);
  });
  afterEach(() => {
    setAutoLockEnabled(false);
    clearAllLocks();
    teardown.restore();
  });

  it('first open acquires lock + lands DAG; second simulated tab gets multiTabBlocked', async () => {
    // create + persist project so it appears in Dexie for both "tabs"
    setAutoLockEnabled(false);
    const id = useStore.getState().createProject('Shared');
    await useStore.getState().flushAutosave();
    setAutoLockEnabled(true);

    // Tab 1: open and acquire lock
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    expect(useStore.getState().hasProjectLock).toBe(true);

    // Tab 2: from same module, openProjectFromIndexedDB on a fresh state should
    // see the lock as already held → fall back to multiTabBlocked.
    // Simulate by re-opening without releasing.
    useStore.setState((state) => {
      state.currentProjectId = null;
      state.canvas.activeFullscreen = 'start';
      state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
      state.hasProjectLock = false;
    });
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('multiTabBlocked');
    expect(useStore.getState().hasProjectLock).toBe(false);
  });

  it('releaseProjectLockForcedToReadOnly switches to readOnlyForced view', async () => {
    setAutoLockEnabled(false);
    const id = useStore.getState().createProject('Forced');
    await useStore.getState().flushAutosave();
    setAutoLockEnabled(true);
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    useStore.getState().releaseProjectLockForcedToReadOnly();
    expect(useStore.getState().canvas.activeFullscreen).toBe('readOnlyForced');
    expect(useStore.getState().hasProjectLock).toBe(false);
  });

  it('without navigator.locks (Safari < 15.4): autoLock disabled treats lock as available', async () => {
    teardown.restore();
    Object.defineProperty(globalThis, 'navigator', {
      value: {}, configurable: true, writable: true,
    });
    setAutoLockEnabled(false);
    const id = useStore.getState().createProject('NoLockApi');
    await useStore.getState().flushAutosave();
    useStore.setState((state) => {
      state.currentProjectId = null;
      state.canvas.activeFullscreen = 'start';
    });
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    expect(useStore.getState().hasProjectLock).toBe(true);
  });
});
