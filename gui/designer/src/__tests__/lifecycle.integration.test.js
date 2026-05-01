import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../store';
import {
  setAutosaveDelay, clearAllAutosaveTimers, DEFAULT_AUTOSAVE_DELAY_MS,
} from '../store/projectSlice';
import { clearAll, getProject } from '../db/dexie-schema';

async function reset() {
  clearAllAutosaveTimers();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  await clearAll();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state.fileHandle = null;
    state.fileName = null;
    state.lastSavedToFileAt = null;
    state.fileLastKnownModified = null;
    state.recoveredFromCrash = false;
    state.hasProjectLock = false;
    state.lockHolderTabId = null;
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: false };
    state.toasts = [];
  });
}

describe('K7 — lifecycle e2e (autosave + crash recovery + reopen)', () => {
  beforeEach(reset);
  afterEach(() => clearAllAutosaveTimers());

  it('autosave is debounced: nothing at 0ms, written after delay', async () => {
    setAutosaveDelay(40);
    const id = useStore.getState().createProject('A');
    expect(await getProject(id)).toBeUndefined();
    await new Promise(r => setTimeout(r, 100));
    expect(await getProject(id)).toBeDefined();
  });

  it('debounce coalesces multiple edits into one autosave write with final state', async () => {
    setAutosaveDelay(40);
    const id = useStore.getState().createProject('Initial');
    useStore.getState().renameProject('Step1');
    useStore.getState().addTag('alpha');
    useStore.getState().renameProject('Final');
    expect(await getProject(id)).toBeUndefined();
    await new Promise(r => setTimeout(r, 100));
    const stored = await getProject(id);
    expect(stored.body.name).toBe('Final');
    expect(stored.body.tags).toEqual(['alpha']);
  });

  it('flushAutosave (graceful close) writes immediately and sets cleanShutdown=true', async () => {
    const id = useStore.getState().createProject('Graceful');
    await useStore.getState().flushAutosave();
    const stored = await getProject(id);
    expect(stored).toBeDefined();
    expect(stored.lifecycle.cleanShutdown).toBe(true);
  });

  it('hydrateProjectsFromDexie + openProjectFromIndexedDB restores DAG', async () => {
    const id = useStore.getState().createProject('Persisted');
    await useStore.getState().flushAutosave();
    // simulate full reload — wipe in-memory store
    useStore.setState((state) => {
      state.projects = {};
      state.currentProjectId = null;
      state.recentProjectIds = [];
      state._projectLifecycle = {};
      state.canvas.activeFullscreen = 'start';
      state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    });
    await useStore.getState().hydrateProjectsFromDexie();
    expect(useStore.getState().recentProjectIds).toContain(id);
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().currentProjectId).toBe(id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

  it('crash recovery: cleanShutdown !== true on hydrate marks recoveredFromCrash on open', async () => {
    setAutosaveDelay(20);
    const id = useStore.getState().createProject('Crashy');
    await new Promise(r => setTimeout(r, 60));
    // Project is saved via debounce (cleanShutdown defaults to false)
    const stored = await getProject(id);
    expect(stored.lifecycle.cleanShutdown).toBe(false);
    // Simulate fresh app start
    useStore.setState((state) => {
      state.projects = {};
      state.currentProjectId = null;
      state.recentProjectIds = [];
      state._projectLifecycle = {};
    });
    await useStore.getState().hydrateProjectsFromDexie();
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().recoveredFromCrash).toBe(true);
  });
});
