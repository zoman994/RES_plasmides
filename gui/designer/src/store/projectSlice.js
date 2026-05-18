import { v7 as uuidv7 } from 'uuid';
import { putProject, getProject, deleteProject as dexieDeleteProject, listAllProjects } from '../db/dexie-schema';
import { acquireProjectLock } from '../lib/multi-tab-lock';
import { addFolder } from '../components/Library/lib/folder-tree';

const _lockReleaseFns = new Map();
const _isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
let _autoLockEnabled = !_isTestEnv;

export function setAutoLockEnabled(enabled) {
  _autoLockEnabled = !!enabled;
}

export async function tryAcquireLock(projectId) {
  if (!_autoLockEnabled) return { hasLock: true, releaseFn: () => {} };
  return acquireProjectLock(projectId);
}

export function storeLockRelease(projectId, releaseFn) {
  _lockReleaseFns.set(projectId, releaseFn);
}

export function releaseLockFor(projectId) {
  const fn = _lockReleaseFns.get(projectId);
  if (fn) {
    try { fn(); } catch { /* ignore */ }
    _lockReleaseFns.delete(projectId);
  }
}

export function clearAllLocks() {
  for (const fn of _lockReleaseFns.values()) {
    try { fn(); } catch { /* ignore */ }
  }
  _lockReleaseFns.clear();
}

const SCHEMA_VER = 1;
const RECENT_LIMIT = 10;
// M-X.8 K2 — explicit pin cap per DEC-UIRREV-PINNED-EXPLICIT.
// Hard block on excess (toast feedback) — open Q3 in spec.
export const PIN_LIMIT = 15;

function nowIso() {
  return new Date().toISOString();
}

// M-C.1 K1 (DEC-MC1-04) — DAG schema extension on Project. M-D will
// migrate to a containerSlice; the dag.* keys travel with the entities.
export const DEFAULT_DAG = Object.freeze({
  positions: {},
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

// Lazy migration for legacy projects. Mutates in place (Immer-friendly).
export function ensureDagShape(project) {
  if (!project) return project;
  if (project.dag && typeof project.dag === 'object'
      && project.dag.positions && typeof project.dag.positions === 'object'
      && Array.isArray(project.dag.edges)
      && project.dag.viewport && typeof project.dag.viewport === 'object') {
    return project;
  }
  // Partial migration safe — keep whatever half is already valid.
  const next = project.dag && typeof project.dag === 'object' ? project.dag : {};
  if (!next.positions || typeof next.positions !== 'object') next.positions = {};
  if (!Array.isArray(next.edges)) next.edges = [];
  if (!next.viewport || typeof next.viewport !== 'object') {
    next.viewport = { x: 0, y: 0, zoom: 1 };
  }
  project.dag = next;
  return project;
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
    // DEC-MC1-04 — fresh projects ship with default DAG shape; legacy
    // projects are migrated lazily via `ensureDagShape` on first touch.
    dag: { positions: {}, edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
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
  // M-X.8 K2 — explicit pin list per DEC-UIRREV-PINNED-EXPLICIT.
  // User-curated, capped at PIN_LIMIT. NOT mirroring MRU.
  // Hydration migration in `hydrateProjectsFromDexie` seeds this
  // from `recentProjectIds` (top-3) when empty.
  pinnedProjectIds: [],

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
    // Sprint M-X.3 follow-up: each new project gets a matching
    // folder in the «canvas» group so CatalogColumn's «This project»
    // tree surfaces a per-project bucket without requiring the user
    // to create one manually. addFolder is idempotent — repeated
    // creates with the same name don't double-register.
    addFolder('canvas', project.name || 'Untitled');
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
      // M-X.8 K2 migration — first run after upgrade: seed
      // `pinnedProjectIds` from top-3 of MRU so biolog doesn't
      // see an empty PINNED section. Subsequent sessions: leave
      // the user-curated list alone.
      if (!Array.isArray(state.pinnedProjectIds) || state.pinnedProjectIds.length === 0) {
        state.pinnedProjectIds = sorted.slice(0, 3);
      }
    });
  },

  openProjectFromIndexedDB: async (id) => {
    const rec = await getProject(id);
    if (!rec) throw new Error(`project not found: ${id}`);
    const lockResult = await tryAcquireLock(id);
    if (!lockResult.hasLock) {
      set(state => {
        state.projects[id] = rec.body;
        state._projectLifecycle[id] = rec.lifecycle || state._projectLifecycle[id] || {};
        state.currentProjectId = id;
        state.hasProjectLock = false;
        state.canvas.activeFullscreen = 'multiTabBlocked';
        state.canvas.navStack = [{ fullscreen: 'multiTabBlocked', payload: { projectId: id } }];
      });
      return;
    }
    storeLockRelease(id, lockResult.releaseFn);
    set(state => {
      state.projects[id] = rec.body;
      state._projectLifecycle[id] = rec.lifecycle || state._projectLifecycle[id] || {};
      state.currentProjectId = id;
      state.fileName = rec.lifecycle?.fileName ?? null;
      state.lastSavedToFileAt = rec.lifecycle?.lastSavedToFileAt ?? null;
      state.fileLastKnownModified = rec.lifecycle?.fileLastKnownModified ?? null;
      state.fileHandle = null;
      state.recoveredFromCrash = !!(rec.lifecycle && rec.lifecycle.cleanShutdown !== true);
      state.hasProjectLock = true;
      state.canvas.activeFullscreen = 'dag';
      state.canvas.navStack = [{ fullscreen: 'dag', payload: { projectId: id } }];
      const filtered = state.recentProjectIds.filter(rid => rid !== id);
      state.recentProjectIds = [id, ...filtered].slice(0, RECENT_LIMIT);
    });
  },

  openProjectFromFileData: async ({ project, fileHandle = null, fileName = null, lastModified = null }) => {
    const lockResult = await tryAcquireLock(project.id);
    if (!lockResult.hasLock) {
      set(state => {
        state.projects[project.id] = project;
        state.currentProjectId = project.id;
        state.fileHandle = fileHandle;
        state.fileName = fileName;
        state.hasProjectLock = false;
        state.canvas.activeFullscreen = 'multiTabBlocked';
        state.canvas.navStack = [{ fullscreen: 'multiTabBlocked', payload: { projectId: project.id } }];
      });
      return;
    }
    storeLockRelease(project.id, lockResult.releaseFn);
    set(state => {
      state.projects[project.id] = project;
      state.currentProjectId = project.id;
      state.fileHandle = fileHandle;
      state.fileName = fileName;
      state.lastSavedToFileAt = nowIso();
      state.fileLastKnownModified = lastModified;
      state.hasProjectLock = true;
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

  /**
   * activateProject — Sprint M-X.7c K3 / K8
   * (DEC-PROJECT-OPEN-MERGE-01 functional closure).
   *
   * Single point of activation. Sets `currentProjectId` to the
   * given id (must already exist in `state.projects` — caller is
   * responsible for hydrating the project body, e.g. via
   * `openProjectFromIndexedDB` or after a `.bodge` import). Updates
   * `recentProjectIds` (MRU) and routes the canvas to the DAG view
   * for the new project.
   *
   * No-op when:
   *   • `id` is null/undefined → use `closeProject` instead.
   *   • Already-active project → idempotent (recent-list bumped).
   *
   * Hydration of the project body and lock acquisition are done
   * by the importer / opener (`openProjectFromFileData`, etc.) —
   * `activateProject` is the post-hydration switch.
   */
  activateProject: (id) => {
    if (!id) return false;
    const proj = get().projects?.[id];
    if (!proj) return false;
    set((state) => {
      state.currentProjectId = id;
      const filtered = state.recentProjectIds.filter((rid) => rid !== id);
      state.recentProjectIds = [id, ...filtered].slice(0, RECENT_LIMIT);
      // FAIL-fix-pass 4 — activateProject does NOT touch
      // `canvas.activeFullscreen`. Tree click on a non-current
      // project header was switching the right panel into the
      // DAG workspace as a side-effect, breaking the «mode stays
      // Library» contract. Mode is the caller's responsibility:
      // import .bodge / RecentRow click on the Home dashboard
      // explicitly route to DAG via `canvas.activeFullscreen`
      // before/after activate. Tree click stays in Library.
    });
    return true;
  },

  /**
   * pinProject — Sprint M-X.8 K2 (DEC-UIRREV-PINNED-EXPLICIT).
   *
   * Adds a project id to the pinned list. Returns:
   *   • true on success
   *   • 'cap' when PIN_LIMIT reached (caller surfaces toast)
   *   • false when id is invalid or project doesn't exist
   *
   * Idempotent — pinning an already-pinned project is a no-op
   * that returns true (so call sites can ignore the diff).
   */
  pinProject: (id) => {
    if (!id) return false;
    const state = get();
    if (!state.projects?.[id]) return false;
    if (state.pinnedProjectIds.includes(id)) return true;
    if (state.pinnedProjectIds.length >= PIN_LIMIT) return 'cap';
    set((s) => {
      s.pinnedProjectIds = [...s.pinnedProjectIds, id];
    });
    return true;
  },

  unpinProject: (id) => {
    if (!id) return false;
    const state = get();
    if (!state.pinnedProjectIds.includes(id)) return true;
    set((s) => {
      s.pinnedProjectIds = s.pinnedProjectIds.filter((rid) => rid !== id);
    });
    return true;
  },

  /**
   * reorderPins(nextOrder) — replace the pinned list with a
   * caller-provided ordering. Filters out unknown ids defensively
   * and clamps to PIN_LIMIT. Used by future drag-reorder UI; the
   * function exists now so K3/K6 don't need a follow-up patch.
   */
  reorderPins: (nextOrder) => {
    if (!Array.isArray(nextOrder)) return false;
    const state = get();
    const known = new Set(Object.keys(state.projects || {}));
    const seen = new Set();
    const filtered = [];
    for (const id of nextOrder) {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
      seen.add(id);
      filtered.push(id);
      if (filtered.length >= PIN_LIMIT) break;
    }
    set((s) => { s.pinnedProjectIds = filtered; });
    return true;
  },

  closeProject: () => {
    const id = get().currentProjectId;
    if (id) releaseLockFor(id);
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

  releaseProjectLockForcedToReadOnly: () => {
    const id = get().currentProjectId;
    if (id) releaseLockFor(id);
    set(state => {
      state.hasProjectLock = false;
      state.canvas.activeFullscreen = 'readOnlyForced';
      state.canvas.navStack = [{ fullscreen: 'readOnlyForced', payload: { projectId: state.currentProjectId } }];
    });
  },

  retryAcquireLock: async () => {
    const id = get().currentProjectId;
    if (!id) return false;
    const lockResult = await tryAcquireLock(id);
    if (!lockResult.hasLock) return false;
    storeLockRelease(id, lockResult.releaseFn);
    set(state => {
      state.hasProjectLock = true;
      state.canvas.activeFullscreen = 'dag';
      state.canvas.navStack = [{ fullscreen: 'dag', payload: { projectId: id } }];
    });
    return true;
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

  updateDescription: (text) => {
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      proj.description = text;
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

  /**
   * Pin a Library container entry to the current project's DAG.
   * Idempotent: a re-pin is a no-op (legacy M-X.5 K8 contract).
   * M-C.1 K1 (DEC-MC1-04) — optional `position: {x,y}` records the
   * drop point in `Project.dag.positions[id]` on first add only.
   */
  addContainerToCurrentProject: (libraryEntryId, position = null) => {
    if (!libraryEntryId) return;
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      if (!Array.isArray(proj.containerIds)) proj.containerIds = [];
      ensureDagShape(proj);
      if (proj.containerIds.includes(libraryEntryId)) return;
      proj.containerIds.push(libraryEntryId);
      if (position && typeof position.x === 'number' && typeof position.y === 'number') {
        proj.dag.positions[libraryEntryId] = { x: position.x, y: position.y };
      }
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  // Backspace/Delete handler. Drops containerIds entry + dag.positions
  // + any edge that touches the node (orphan edges break ReactFlow).
  removeContainerFromProject: (libraryEntryId) => {
    if (!libraryEntryId) return;
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      ensureDagShape(proj);
      if (!Array.isArray(proj.containerIds)) proj.containerIds = [];
      proj.containerIds = proj.containerIds.filter(c => c !== libraryEntryId);
      if (proj.dag.positions[libraryEntryId]) delete proj.dag.positions[libraryEntryId];
      proj.dag.edges = proj.dag.edges.filter(
        e => e.from !== libraryEntryId && e.to !== libraryEntryId,
      );
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  // Merge a batch of {id:{x,y}} into dag.positions. Existing keys
  // overwritten; absent keys kept. DagCanvas debounces drag events.
  setDagPositions: (patch) => {
    if (!patch || typeof patch !== 'object') return;
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      ensureDagShape(proj);
      for (const [nodeId, pos] of Object.entries(patch)) {
        if (!nodeId || !pos) continue;
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
        proj.dag.positions[nodeId] = { x: pos.x, y: pos.y };
      }
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  // onConnect handler. Dedups on (from,to). Edge id is uuidv7.
  addDagEdge: ({ from, to } = {}) => {
    if (!from || !to || from === to) return;
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      ensureDagShape(proj);
      if (proj.dag.edges.some(e => e.from === from && e.to === to)) return;
      proj.dag.edges.push({ id: uuidv7(), from, to });
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  // Drop one edge by id (K5 Backspace/Delete on selected edge).
  removeDagEdge: (edgeId) => {
    if (!edgeId) return;
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      ensureDagShape(proj);
      const before = proj.dag.edges.length;
      proj.dag.edges = proj.dag.edges.filter(e => e.id !== edgeId);
      if (proj.dag.edges.length === before) return;
      proj.updatedAt = nowIso();
      state._projectLifecycle[id] = {
        ...(state._projectLifecycle[id] || {}),
        lastModifiedInIndexedDBAt: proj.updatedAt,
      };
    });
    const id = get().currentProjectId;
    if (id) _scheduleAutosave(get, id);
  },

  // Persist ReactFlow viewport so reload restores framing. DagCanvas
  // debounces — one autosave per pan, not per-frame.
  setDagViewport: (viewport) => {
    if (!viewport) return;
    set(state => {
      const id = state.currentProjectId;
      if (!id) return;
      const proj = state.projects[id];
      if (!proj) return;
      ensureDagShape(proj);
      const x = typeof viewport.x === 'number' ? viewport.x : proj.dag.viewport.x;
      const y = typeof viewport.y === 'number' ? viewport.y : proj.dag.viewport.y;
      const zoom = typeof viewport.zoom === 'number' ? viewport.zoom : proj.dag.viewport.zoom;
      proj.dag.viewport = { x, y, zoom };
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

  // Soft-delete the project — flips `_pendingDelete` and persists to
  // Dexie immediately (parity with `markLibraryEntryPendingDelete`).
  // Without persistence the flag was lost if the tab closed before
  // the user purged via the Trash zone — see M-X.10 trash spec.
  markPendingDelete: async (id) => {
    set(state => {
      if (state.projects[id]) state.projects[id]._pendingDelete = true;
    });
    const proj = get().projects[id];
    if (!proj) return;
    const lc = get()._projectLifecycle?.[id];
    try {
      await putProject(projectRecord(proj, lc));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] persist project soft-delete failed', err);
    }
  },

  unmarkPendingDelete: async (id) => {
    set(state => {
      if (state.projects[id]) state.projects[id]._pendingDelete = false;
    });
    const proj = get().projects[id];
    if (!proj) return;
    const lc = get()._projectLifecycle?.[id];
    try {
      await putProject(projectRecord(proj, lc));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] unmark project soft-delete failed', err);
    }
  },

  commitPendingDelete: async (id) => {
    const proj = get().projects[id];
    if (!proj || !proj._pendingDelete) return;
    await get().removeProjectFromIndexedDB(id);
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
