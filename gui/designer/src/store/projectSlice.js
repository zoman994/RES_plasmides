import { v7 as uuidv7 } from 'uuid';
import { putProject, getProject, deleteProject as dexieDeleteProject, listAllProjects } from '../db/dexie-schema';

const SCHEMA_VER = 1;
const RECENT_LIMIT = 10;

function nowIso() {
  return new Date().toISOString();
}

export function makeBlankProject(name = 'Untitled') {
  const ts = nowIso();
  return {
    id: uuidv7(),
    schemaVer: SCHEMA_VER,
    name,
    description: '',
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    agent: { name: '', email: '' },
    containerIds: [],
    projectCommitIds: [],
    primerIds: [],
    settings: {},
    ext: {},
  };
}

export function projectRecord(project, lifecycle) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    body: project,
    lifecycle: {
      fileName: lifecycle?.fileName ?? null,
      lastSavedToFileAt: lifecycle?.lastSavedToFileAt ?? null,
      lastModifiedInIndexedDBAt: lifecycle?.lastModifiedInIndexedDBAt ?? project.updatedAt,
      fileLastKnownModified: lifecycle?.fileLastKnownModified ?? null,
      cleanShutdown: lifecycle?.cleanShutdown ?? false,
    },
  };
}

const _autosaveTimers = new Map();
export const DEFAULT_AUTOSAVE_DELAY_MS = 2000;
let _autosaveDelayMs = DEFAULT_AUTOSAVE_DELAY_MS;

export function setAutosaveDelay(ms) {
  _autosaveDelayMs = Math.max(0, ms | 0);
}

export function getAutosaveDelay() {
  return _autosaveDelayMs;
}

export function clearAllAutosaveTimers() {
  for (const t of _autosaveTimers.values()) clearTimeout(t);
  _autosaveTimers.clear();
}

export function _scheduleAutosave(get, projectId, delay = _autosaveDelayMs) {
  const existing = _autosaveTimers.get(projectId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    _autosaveTimers.delete(projectId);
    const state = get();
    const proj = state.projects[projectId];
    if (!proj) return;
    const lc = state._projectLifecycle?.[projectId];
    try {
      await putProject(projectRecord(proj, lc));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] autosave failed', e);
    }
  }, delay);
  _autosaveTimers.set(projectId, t);
}

export async function flushAutosave(get, projectId, opts = {}) {
  const t = _autosaveTimers.get(projectId);
  if (t) {
    clearTimeout(t);
    _autosaveTimers.delete(projectId);
  }
  const state = get();
  const proj = state.projects[projectId];
  if (!proj) return;
  const lc = state._projectLifecycle?.[projectId];
  await putProject(projectRecord(proj, { ...lc, ...(opts.cleanShutdown ? { cleanShutdown: true } : {}) }));
}

export const createProjectSlice = (set, get) => ({
  currentProjectId: null,
  projects: {},
  recentProjectIds: [],

  fileHandle: null,
  fileName: null,
  lastSavedToFileAt: null,
  fileLastKnownModified: null,
  recoveredFromCrash: false,

  saveStatus: 'idle',
  fileExternallyModified: false,
  handlePermissionStatus: null,

  hasProjectLock: false,
  lockHolderTabId: null,

  _projectLifecycle: {},

  createProject: (name = 'Untitled') => {
    const project = makeBlankProject(name);
    set(state => {
      state.projects[project.id] = project;
      state.currentProjectId = project.id;
      state.fileHandle = null;
      state.fileName = null;
      state.lastSavedToFileAt = null;
      state.fileLastKnownModified = null;
      state.recoveredFromCrash = false;
      state._projectLifecycle[project.id] = {
        fileName: null,
        lastSavedToFileAt: null,
        lastModifiedInIndexedDBAt: project.updatedAt,
        fileLastKnownModified: null,
        cleanShutdown: false,
      };
      const filtered = state.recentProjectIds.filter(id => id !== project.id);
      state.recentProjectIds = [project.id, ...filtered].slice(0, RECENT_LIMIT);
      state.canvas.activeFullscreen = 'dag';
      state.canvas.navStack = [{ fullscreen: 'dag', payload: { projectId: project.id } }];
    });
    _scheduleAutosave(get, project.id);
    return project.id;
  },

  hydrateProjectsFromDexie: async () => {
    const records = await listAllProjects();
    set(state => {
      for (const rec of records) {
        if (rec && rec.body && rec.id) {
          state.projects[rec.id] = rec.body;
          state._projectLifecycle[rec.id] = rec.lifecycle || {
            fileName: null,
            lastSavedToFileAt: null,
            lastModifiedInIndexedDBAt: rec.updatedAt,
            fileLastKnownModified: null,
            cleanShutdown: false,
          };
        }
      }
      const sorted = records
        .slice()
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .map(r => r.id)
        .filter(id => state.projects[id]);
      state.recentProjectIds = sorted.slice(0, RECENT_LIMIT);
    });
  },

  openProjectFromIndexedDB: async (id) => {
    const rec = await getProject(id);
    if (!rec) throw new Error(`project not found: ${id}`);
    set(state => {
      state.projects[id] = rec.body;
      state._projectLifecycle[id] = rec.lifecycle || state._projectLifecycle[id] || {};
      state.currentProjectId = id;
      state.fileName = rec.lifecycle?.fileName ?? null;
      state.lastSavedToFileAt = rec.lifecycle?.lastSavedToFileAt ?? null;
      state.fileLastKnownModified = rec.lifecycle?.fileLastKnownModified ?? null;
      state.fileHandle = null;
      state.recoveredFromCrash = !!(rec.lifecycle && rec.lifecycle.cleanShutdown !== true);
      state.canvas.activeFullscreen = 'dag';
      state.canvas.navStack = [{ fullscreen: 'dag', payload: { projectId: id } }];
      const filtered = state.recentProjectIds.filter(rid => rid !== id);
      state.recentProjectIds = [id, ...filtered].slice(0, RECENT_LIMIT);
    });
  },

  openProjectFromFileData: async ({ project, fileHandle = null, fileName = null, lastModified = null }) => {
    set(state => {
      state.projects[project.id] = project;
      state.currentProjectId = project.id;
      state.fileHandle = fileHandle;
      state.fileName = fileName;
      state.lastSavedToFileAt = nowIso();
      state.fileLastKnownModified = lastModified;
      state._projectLifecycle[project.id] = {
        fileName,
        lastSavedToFileAt: state.lastSavedToFileAt,
        lastModifiedInIndexedDBAt: project.updatedAt,
        fileLastKnownModified: lastModified,
        cleanShutdown: false,
      };
      const filtered = state.recentProjectIds.filter(rid => rid !== project.id);
      state.recentProjectIds = [project.id, ...filtered].slice(0, RECENT_LIMIT);
      state.canvas.activeFullscreen = 'dag';
      state.canvas.navStack = [{ fullscreen: 'dag', payload: { projectId: project.id } }];
    });
    await flushAutosave(get, project.id);
  },

  registerSavedFile: ({ fileHandle = null, fileName = null, lastModified = null }) => {
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const ts = nowIso();
      state.fileHandle = fileHandle;
      state.fileName = fileName;
      state.lastSavedToFileAt = ts;
      state.fileLastKnownModified = lastModified;
      state.saveStatus = 'idle';
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        fileName,
        lastSavedToFileAt: ts,
        fileLastKnownModified: lastModified,
        cleanShutdown: false,
      };
    });
  },

  closeProject: () => {
    set(state => {
      state.currentProjectId = null;
      state.fileHandle = null;
      state.fileName = null;
      state.lastSavedToFileAt = null;
      state.fileLastKnownModified = null;
      state.recoveredFromCrash = false;
      state.hasProjectLock = false;
      state.lockHolderTabId = null;
      state.canvas.activeFullscreen = 'start';
      state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    });
  },

  renameProject: (newName) => {
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      proj.name = newName;
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  addTag: (tag) => {
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      if (!proj.tags.includes(tag)) proj.tags.push(tag);
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  removeTag: (tag) => {
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      proj.tags = proj.tags.filter(t => t !== tag);
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  markDirty: () => {
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  removeProjectFromIndexedDB: async (id) => {
    await dexieDeleteProject(id);
    set(state => {
      delete state.projects[id];
      delete state._projectLifecycle[id];
      state.recentProjectIds = state.recentProjectIds.filter(rid => rid !== id);
      if (state.currentProjectId === id) state.currentProjectId = null;
    });
  },

  flushAutosave: async () => {
    const id = get().currentProjectId;
    if (!id) return;
    await flushAutosave(get, id, { cleanShutdown: true });
  },
});

export function selectIsDirty(state) {
  const id = state.currentProjectId;
  if (!id) return false;
  const lc = state._projectLifecycle?.[id];
  if (!lc) return false;
  if (!lc.lastSavedToFileAt) return true;
  const localTs = lc.lastModifiedInIndexedDBAt;
  return !!(localTs && localTs > lc.lastSavedToFileAt);
}

export const _testHelpers = {
  _autosaveTimers,
};
