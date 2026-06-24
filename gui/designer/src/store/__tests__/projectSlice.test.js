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
    state.toasts = [];
  });
}

describe('K2 — store rewrite + project slice', () => {
  beforeEach(reset);
  afterEach(() => {
    clearAllAutosaveTimers();
    setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  });

  // V116 (24.05.2026) — a new project opens in the Library, not the legacy
  // DAG overlay. createProject no longer hard-sets activeFullscreen='dag'
  // (mirrors activateProject's «mode stays Library» contract, FAIL-fix-pass 4).
  it('createProject populates state and routes to the Library (V116)', () => {
    const id = useStore.getState().createProject('My plasmid');
    const s = useStore.getState();
    expect(id).toBeDefined();
    expect(s.currentProjectId).toBe(id);
    expect(s.projects[id]).toMatchObject({ name: 'My plasmid', tags: [], containerIds: [] });
    // not the DAG overlay anymore — neutral non-overlay fullscreen + Library.
    expect(s.canvas.activeFullscreen).not.toBe('dag');
    expect(s.canvas.activeFullscreen).toBe('library');
    expect(s.canvas.navStack[s.canvas.navStack.length - 1].fullscreen).toBe('library');
    expect(s.workspace.active).toBe('library');
  });

  // V116 contract guard — from a non-Library overlay state, createProject
  // must land in the Library (workspace.active='library', not the DAG
  // overlay), while keeping the identity bookkeeping (currentProjectId + MRU).
  it('V116 — createProject opens in Library, never the DAG overlay', () => {
    useStore.setState((st) => {
      st.workspace = { ...(st.workspace || {}), active: 'startup' };
      st.canvas.activeFullscreen = 'start';
      st.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    });
    const id = useStore.getState().createProject('Lib-bound');
    const s = useStore.getState();
    // routing: Library, not DAG
    expect(s.workspace.active).toBe('library');
    expect(s.canvas.activeFullscreen).not.toBe('dag');
    // identity regression — unchanged from before the fix
    expect(s.currentProjectId).toBe(id);
    expect(s.recentProjectIds[0]).toBe(id);
  });

  // ─── Sprint M-X.3 follow-up — auto-folder per project ─────────────
  it('createProject pushes the project name into the canvas folder group', () => {
    if (typeof localStorage === 'undefined') return; // jsdom-safe.
    localStorage.removeItem('pvcs-catalog-user-folders-by-group');
    useStore.getState().createProject('pCloning2026');
    const raw = localStorage.getItem('pvcs-catalog-user-folders-by-group');
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw);
    expect(Array.isArray(stored.canvas)).toBe(true);
    expect(stored.canvas).toContain('pCloning2026');
  });

  it('two createProject calls with the same name only register the folder once', () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('pvcs-catalog-user-folders-by-group');
    useStore.getState().createProject('Lab');
    useStore.getState().createProject('Lab');
    const stored = JSON.parse(localStorage.getItem('pvcs-catalog-user-folders-by-group'));
    expect(stored.canvas.filter((n) => n === 'Lab')).toHaveLength(1);
  });

  it('createProject auto-suffixes a colliding name — единый знаменатель for all create buttons (Игорь 23.06)', () => {
    const id1 = useStore.getState().createProject('Новый проект');
    const id2 = useStore.getState().createProject('Новый проект');
    const id3 = useStore.getState().createProject('Новый проект');
    expect(useStore.getState().projects[id1].name).toBe('Новый проект');
    expect(useStore.getState().projects[id2].name).toBe('Новый проект 2');
    expect(useStore.getState().projects[id3].name).toBe('Новый проект 3');
    // all distinct → no infinite same-name projects
    const names = [id1, id2, id3].map((id) => useStore.getState().projects[id].name);
    expect(new Set(names).size).toBe(3);
  });

  it('createProject with no name (default «Untitled») still registers the folder', () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('pvcs-catalog-user-folders-by-group');
    useStore.getState().createProject();
    const stored = JSON.parse(localStorage.getItem('pvcs-catalog-user-folders-by-group'));
    expect(stored.canvas).toContain('Untitled');
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
