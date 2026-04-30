import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore, wipeLegacyV05Storage } from '../index';
import { clearAll, getProject } from '../../db/dexie-schema';
import { setAutosaveDelay, clearAllAutosaveTimers, DEFAULT_AUTOSAVE_DELAY_MS, selectIsDirty } from '../projectSlice';
import { _setFallbackForTests, _resetMemoryStore } from '../../lib/storage';

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
    state.saveStatus = 'idle';
    state.fileExternallyModified = false;
    state.handlePermissionStatus = null;
    state.hasProjectLock = false;
    state.lockHolderTabId = null;
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: false };
    state.toast = null;
  });
}

describe('K2 — store rewrite + project slice', () => {
  beforeEach(reset);
  afterEach(() => {
    clearAllAutosaveTimers();
    setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  });

  it('createProject populates state and pushes DAG', () => {
    const id = useStore.getState().createProject('My plasmid');
    const s = useStore.getState();
    expect(id).toBeDefined();
    expect(s.currentProjectId).toBe(id);
    expect(s.projects[id]).toMatchObject({ name: 'My plasmid', tags: [], containerIds: [] });
    expect(s.canvas.activeFullscreen).toBe('dag');
    expect(s.canvas.navStack[s.canvas.navStack.length - 1].fullscreen).toBe('dag');
  });

  it('renameProject updates name + bumps lastModifiedInIndexedDBAt', async () => {
    const id = useStore.getState().createProject('A');
    const before = useStore.getState()._projectLifecycle[id].lastModifiedInIndexedDBAt;
    await new Promise(r => setTimeout(r, 5));
    useStore.getState().renameProject('B');
    const after = useStore.getState()._projectLifecycle[id].lastModifiedInIndexedDBAt;
    expect(useStore.getState().projects[id].name).toBe('B');
    expect(after >= before).toBe(true);
  });

  it('addTag / removeTag manipulate tag list without duplicates', () => {
    const id = useStore.getState().createProject('A');
    useStore.getState().addTag('bacterial');
    useStore.getState().addTag('bacterial');
    useStore.getState().addTag('gfp');
    expect(useStore.getState().projects[id].tags).toEqual(['bacterial', 'gfp']);
    useStore.getState().removeTag('bacterial');
    expect(useStore.getState().projects[id].tags).toEqual(['gfp']);
  });

  it('closeProject clears state and pushes start', () => {
    useStore.getState().createProject('A');
    useStore.getState().closeProject();
    const s = useStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.canvas.activeFullscreen).toBe('start');
  });

  it('flushAutosave persists project and is restorable via openProjectFromIndexedDB', async () => {
    const id = useStore.getState().createProject('Persisted');
    await useStore.getState().flushAutosave();
    useStore.setState((state) => { state.projects = {}; state.currentProjectId = null; });
    await useStore.getState().hydrateProjectsFromDexie();
    expect(useStore.getState().projects[id]).toBeDefined();
    expect(useStore.getState().recentProjectIds).toContain(id);
    await useStore.getState().openProjectFromIndexedDB(id);
    expect(useStore.getState().currentProjectId).toBe(id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

  it('selectIsDirty: new project is dirty until saved', () => {
    const id = useStore.getState().createProject('A');
    expect(selectIsDirty(useStore.getState())).toBe(true);
    useStore.getState().registerSavedFile({ fileName: 'A.bodge', lastModified: 1 });
    expect(useStore.getState().lastSavedToFileAt).not.toBeNull();
    expect(selectIsDirty(useStore.getState())).toBe(false);
    expect(id).toBeDefined();
  });

  it('autosave is debounced (no immediate write, write after delay)', async () => {
    setAutosaveDelay(40);
    const id = useStore.getState().createProject('Auto');
    expect(await getProject(id)).toBeUndefined();
    await new Promise(r => setTimeout(r, 100));
    const stored = await getProject(id);
    expect(stored).toBeDefined();
    expect(stored.body.name).toBe('Auto');
  });

  it('debounce coalesces rapid edits into one autosave write', async () => {
    setAutosaveDelay(40);
    const id = useStore.getState().createProject('Initial');
    useStore.getState().renameProject('Second');
    useStore.getState().renameProject('Final');
    expect(await getProject(id)).toBeUndefined();
    await new Promise(r => setTimeout(r, 100));
    const stored = await getProject(id);
    expect(stored.body.name).toBe('Final');
  });

  it('removeProjectFromIndexedDB clears project + recents', async () => {
    const id = useStore.getState().createProject('A');
    await useStore.getState().flushAutosave();
    expect(useStore.getState().recentProjectIds).toContain(id);
    await useStore.getState().removeProjectFromIndexedDB(id);
    expect(useStore.getState().recentProjectIds).not.toContain(id);
    expect(useStore.getState().projects[id]).toBeUndefined();
  });

  it('legacy v0.5 wipe removes pvcs_designer_state once + sets migration flag', async () => {
    _setFallbackForTests(true);
    _resetMemoryStore();
    const { setItem, getItem } = await import('../../lib/storage');
    setItem('pvcs_designer_state', '{"old":"data"}');
    expect(getItem('pvcs_designer_state')).not.toBeNull();
    const did = wipeLegacyV05Storage();
    expect(did).toBe(true);
    expect(getItem('pvcs_designer_state')).toBeNull();
    expect(getItem('bodgegene-v06-migration-done')).toBe('true');
    expect(wipeLegacyV05Storage()).toBe(false);
    _setFallbackForTests(false);
    _resetMemoryStore();
  });
});
