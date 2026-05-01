import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../store';
import {
  setAutosaveDelay, clearAllAutosaveTimers, DEFAULT_AUTOSAVE_DELAY_MS,
} from '../store/projectSlice';
import { clearAll } from '../db/dexie-schema';
import { writeBodge, readBodge } from '../lib/bodge-zip';
import { zipSync, strToU8 } from 'fflate';

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

describe('K8 — .bodge save / open round-trip', () => {
  beforeEach(reset);
  afterEach(() => clearAllAutosaveTimers());

  it('writeBodge → readBodge round-trip preserves project body', async () => {
    const id = useStore.getState().createProject('Persisted');
    useStore.getState().addTag('bacterial');
    useStore.getState().addTag('gfp');
    const original = useStore.getState().projects[id];
    const blob = writeBodge(original);
    const { manifest, project, warnings } = await readBodge(blob);
    expect(manifest.fileFormatVersion).toBe(1);
    expect(project.id).toBe(original.id);
    expect(project.name).toBe(original.name);
    expect(project.tags).toEqual(['bacterial', 'gfp']);
    expect(warnings).toEqual([]);
  });

  it('saveProjectToFile (synthetic): writeBodge + registerSavedFile makes project not dirty', async () => {
    const id = useStore.getState().createProject('Saveable');
    const proj = useStore.getState().projects[id];
    const blob = writeBodge(proj);
    expect(blob).toBeInstanceOf(Blob);
    useStore.getState().registerSavedFile({ fileHandle: null, fileName: 'Saveable.bodge', lastModified: 12345 });
    const { selectIsDirty } = await import('../store/projectSlice');
    expect(selectIsDirty(useStore.getState())).toBe(false);
    expect(useStore.getState().fileName).toBe('Saveable.bodge');
    expect(useStore.getState().lastSavedToFileAt).not.toBeNull();
  });

  it('openProjectFromFileData: reading + ingesting a .bodge gives DAG view', async () => {
    const tmp = useStore.getState().createProject('SourceProject');
    useStore.getState().addTag('alpha');
    const blob = writeBodge(useStore.getState().projects[tmp]);
    // Wipe state to simulate a fresh app
    useStore.setState((state) => {
      state.projects = {};
      state.currentProjectId = null;
      state.recentProjectIds = [];
      state._projectLifecycle = {};
      state.canvas.activeFullscreen = 'start';
      state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    });
    const { project } = await readBodge(blob);
    await useStore.getState().openProjectFromFileData({
      project,
      fileHandle: null,
      fileName: 'SourceProject.bodge',
      lastModified: 999,
    });
    expect(useStore.getState().currentProjectId).toBe(project.id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    expect(useStore.getState().projects[project.id].tags).toContain('alpha');
  });

  it('opening .bodge with M-B+ sections (containers/) returns warnings via readBodge', async () => {
    const proj = {
      id: '01900000-7000-7000-8000-000000000099',
      schemaVer: 1, name: 'WithExtras', description: '', tags: [],
      createdAt: 'x', updatedAt: 'x', agent: { name: '', email: '' },
      containerIds: [], projectCommitIds: [], primerIds: [],
      settings: {}, ext: {},
    };
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        fileFormatVersion: 1, schemaVersion: 1, appVersion: '0.6.0-dev',
        createdAt: 'x', updatedAt: 'x',
      })),
      'project.json': strToU8(JSON.stringify(proj)),
      'containers/abc.json': strToU8('{}'),
    });
    const blob = new Blob([zipped]);
    const { warnings } = await readBodge(blob);
    expect(warnings.some(w => w.includes('containers'))).toBe(true);
  });
});
