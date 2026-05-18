/**
 * skeleton-persistence — auto-save + rehydration canvas state.
 *
 * S3 (14.05.2026): IndexedDB key-value store, debounce 500ms.
 * R12-3 (15.05.2026 — DEC-OPS-SNAPSHOT-MIGRATE-01): schemaVersion + migrations.
 *
 * Storage strategy:
 *   - 1 ключ `canvas-state-v1` (legacy compat).
 *   - Snapshot структура: `{ schema, savedAt, state }`.
 *   - `state` сохраняется БЕЗ transient UI-полей (view / highlightedContainerId /
 *     toasts / toast / selectedContainerIds / editorOpen) — после reload
 *     они инициализируются в default'ах.
 *   - Migration chain: v1 → v2 → v3 ... → SCHEMA_VERSION_CURRENT.
 *
 * SCHEMA_VERSION_CURRENT = 10 (T4.5 — node.pinned for 3-lane
 * auto-layout override; T9=9 variants piece.variantGroupId +
 * op.materializedClones; T6=8 assemblyDrafts→zones+pieces).
 *   v1 (S3 baseline): без toasts queue, без cascadeIndex strict.
 *   v2 (R12-3): добавлены toasts queue + auto-strip transient UI.
 *   v3 (F2 DEC-CANVAS-JUNC-08): junction contract — normalizeJunction
 *       по всем state.junctions (status / overlapTarget / length|Tm /
 *       endRequirements).
 *   v4 (A1 DEC-CANVAS-ASM): assemblyDrafts slice (additive).
 *   v5 (T1 DEC-CANVAS-4T-01): pieces slice (additive, idempotent).
 *   v6 (T2 DEC-T2-01): op.inputPieces — one legacy-migration piece per
 *       op input container; op.inputs preserved (per-op idempotent).
 *   v7 (T3 DEC-CANVAS-4T-07): zones slice + zoneId:null on containers /
 *       pieces / operations (additive, idempotent — existing zoneId kept).
 *   v8 (T6 DEC-T6-06): assemblyDrafts → zones(viewMode:sequence) +
 *       pieces(legacy-migration / manual-gap); assemblyDrafts emptied.
 *
 * Если найдена snapshot версии новее текущей (e.g. user downgrade'ил
 * клиента) — refuse to load чтобы не повредить data.
 */

import { v7 as uuidv7 } from 'uuid';
import { normalizeJunction } from './selectors-junction';
import { generatePieceColor, autoPieceName } from '../lib/piece-model';
import { segmentToPieceData } from '../lib/segment-to-piece-adapter';

const DB_NAME = 'bodge-skeleton';
const STORE_NAME = 'state';
const STATE_KEY = 'canvas-state-v1';
export const SCHEMA_VERSION_CURRENT = 10;

/**
 * stateKeyFor — V65 per-project keying. A null/undefined projectId maps
 * to the legacy global key (`canvas-state-v1`) so no-project / dev use
 * and old snapshots keep working; a real projectId scopes the snapshot.
 */
export function stateKeyFor(projectId) {
  return projectId ? `${STATE_KEY}::${projectId}` : STATE_KEY;
}

// R12-3: transient UI поля не persist'ятся. После rehydration они
// инициализируются default'ами через builtInitialState() и затем
// merge'аются с persisted data.
//
// F1 M-CANVAS-WINDOW (DEC-CANVAS-WIN-01, R5): `editorOpen` +
// `editorContext` (tabs[] + activeTabId) ARE now persisted — biolog
// reloads with their open editor tabs restored. They were transient
// only while the editor held a single ephemeral view-only id.
const TRANSIENT_UI_FIELDS = ['view', 'highlightedContainerId', 'toast', 'toasts', 'selectedContainerIds'];

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

/**
 * stripTransientFields — clone state без UI ephemeral полей.
 */
function stripTransientFields(state) {
  if (!state || typeof state !== 'object') return state;
  const out = { ...state };
  for (const f of TRANSIENT_UI_FIELDS) {
    delete out[f];
  }
  return out;
}

/**
 * saveSnapshot — async persist state снимок в IndexedDB.
 * R12-3: strip transient UI fields перед save.
 */
export async function saveSnapshot(state, projectId) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const payload = {
        schema: SCHEMA_VERSION_CURRENT,
        savedAt: new Date().toISOString(),
        state: stripTransientFields(state),
      };
      const putReq = store.put(payload, stateKeyFor(projectId));
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => reject(putReq.error);
    });
  } catch {
    return false;
  }
}

/**
 * Migration chain. Каждая migration принимает state v(N) и возвращает
 * state v(N+1). Если migration impossible (data corrupted), вернуть null.
 *
 * MIGRATIONS[fromVersion](state) → state of (fromVersion+1).
 */
const MIGRATIONS = {
  1: function migrate_v1_to_v2(state) {
    // v1 → v2: добавили toasts queue. Просто инициализируем []. cascadeIndex
    // в v1 уже был, но мог быть undefined у старых snapshot'ов.
    if (!state || typeof state !== 'object') return null;
    return {
      ...state,
      toasts: [],
      cascadeIndex: typeof state.cascadeIndex === 'number' ? state.cascadeIndex : 0,
    };
  },
  2: function migrate_v2_to_v3(state) {
    // v2 → v3 (F2 DEC-CANVAS-JUNC-08): normalize every junction to the
    // junction-contract shape (status / overlapTarget / overlapLength|Tm
    // / endRequirements / autoDetectedKind).
    if (!state || typeof state !== 'object') return null;
    if (!Array.isArray(state.junctions)) return { ...state, junctions: [] };
    return { ...state, junctions: state.junctions.map(normalizeJunction) };
  },
  3: function migrate_v3_to_v4(state) {
    // v3 → v4 (A1 DEC-CANVAS-ASM): introduce the assemblyDrafts slice.
    // Purely additive + idempotent — old snapshots get an empty array.
    if (!state || typeof state !== 'object') return null;
    if (Array.isArray(state.assemblyDrafts)) return state;
    return { ...state, assemblyDrafts: [] };
  },
  4: function migrate_v4_to_v5(state) {
    // v4 → v5 (T1 DEC-CANVAS-4T-01): introduce the pieces slice.
    // Additive + idempotent — pre-T1 snapshots get an empty array,
    // a snapshot already carrying pieces is returned unchanged.
    if (!state || typeof state !== 'object') return null;
    if (Array.isArray(state.pieces)) return state;
    return { ...state, pieces: [] };
  },
  5: function migrate_v5_to_v6(state) {
    // v5 → v6 (T2 DEC-T2-01..07): explicit op.inputPieces. For every
    // op without inputPieces, create one 'legacy-migration' piece per
    // input container (template piece keeps op.params.range; others get
    // full-length). op.inputs is PRESERVED (hybrid back-compat). Bad
    // container refs are skipped gracefully (R-T2-1). Per-op idempotent.
    if (!state || typeof state !== 'object') return null;
    const containers = state.containers || [];
    const operations = state.operations || [];
    const existingPieces = Array.isArray(state.pieces) ? state.pieces : [];
    const newPieces = [];
    const migratedOps = operations.map((op) => {
      if (Array.isArray(op.inputPieces) && op.inputPieces.length > 0) return op;
      const srcIds = Array.isArray(op.inputs) ? op.inputs : [];
      if (srcIds.length === 0) return { ...op, inputPieces: [] };
      const ids = [];
      const params = op.params || {};
      const templateId = params.templateId || srcIds[0];
      for (const cid of srcIds) {
        const container = containers.find((c) => c.id === cid);
        if (!container) continue; // R-T2-1 graceful skip
        const range = (params.range && cid === templateId)
          ? { sourceId: cid, start: params.range.start, end: params.range.end, orientation: 'forward' }
          : { sourceId: cid, start: 0, end: String(container.sequence || '').length, orientation: 'forward' };
        let acquisitionMethod = 'undefined';
        let acquisitionParams = {};
        if (op.kind === 'pcr') {
          acquisitionMethod = 'pcr';
          if (params.primerPairId) acquisitionParams = { primerPairId: params.primerPairId };
        } else if (op.kind === 'cut') {
          acquisitionMethod = 'restriction';
          if (params.enzymeName) acquisitionParams = { enzymes: [params.enzymeName] };
        }
        const id = `pc-${uuidv7()}`;
        const ts = (typeof op.createdAt === 'string' && op.createdAt)
          ? new Date(op.createdAt).getTime() : NaN;
        newPieces.push({
          id,
          name: autoPieceName(container, range),
          sourceIds: [cid],
          ranges: [range],
          origin: 'legacy-migration',
          acquisitionMethod,
          acquisitionParams,
          color: '#000000', // re-seeded below with collision check
          functionalLabel: null,
          zoneId: null,
          derivedReactionId: op.kind === 'pcr' ? op.id : null,
          frozen: op.status === 'executed',
          createdAt: Number.isFinite(ts) ? ts : Date.now(),
          updatedAt: Date.now(),
        });
        ids.push(id);
      }
      return { ...op, inputPieces: ids };
    });
    const allPieces = [...existingPieces, ...newPieces];
    for (let i = 0; i < newPieces.length; i += 1) {
      const priorColors = allPieces
        .slice(0, existingPieces.length + i)
        .map((p) => p.color)
        .filter(Boolean);
      newPieces[i].color = generatePieceColor(newPieces[i].id, priorColors);
    }
    return { ...state, pieces: allPieces, operations: migratedOps };
  },
  7: function migrate_v7_to_v8(state) {
    // v7 → v8 (T6 DEC-T6-06): each assemblyDraft → a zone
    // (viewMode:'sequence') + one piece per segment via the adapter;
    // assemblyDrafts emptied. Idempotent (empty drafts → no-op).
    if (!state || typeof state !== 'object') return null;
    const drafts = Array.isArray(state.assemblyDrafts) ? state.assemblyDrafts : [];
    if (drafts.length === 0) return state;
    const containers = state.containers || [];
    const zones = Array.isArray(state.zones) ? state.zones.slice() : [];
    const pieces = Array.isArray(state.pieces) ? state.pieces.slice() : [];
    let off = { x: 100, y: 100 };
    for (const d of drafts) {
      const zid = `zn-${uuidv7()}`;
      const pos = d.position || off;
      zones.push({
        id: zid,
        name: d.name || 'Сборка миграции',
        bounds: { x: pos.x, y: pos.y, width: 600, height: 400 },
        collapsed: false,
        viewMode: 'sequence',
        autoResize: true,
        notes: `Мигрировано из assemblyDraft ${d.id}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      off = { x: off.x, y: off.y + 450 };
      let i = 0;
      for (const seg of (d.segments || [])) {
        const container = containers.find((c) => c.id === (seg.source && seg.source.containerId));
        const id = `pc-${uuidv7()}`;
        pieces.push({
          id,
          ...segmentToPieceData(seg, container),
          color: generatePieceColor(id, pieces.map((p) => p.color).filter(Boolean)),
          zoneId: zid,
          derivedReactionId: null,
          frozen: false,
          createdAt: Date.now() + i,
          updatedAt: Date.now(),
        });
        i += 1;
      }
    }
    return { ...state, zones, pieces, assemblyDrafts: [] };
  },
  6: function migrate_v6_to_v7(state) {
    // v6 → v7 (T3 DEC-CANVAS-4T-07): zones slice + zoneId on nodes.
    // Additive + idempotent — a node already carrying zoneId keeps it
    // (R-T3-2: never overwrite); only absent zoneId is stamped null.
    if (!state || typeof state !== 'object') return null;
    const stamp = (n) => (
      Object.prototype.hasOwnProperty.call(n, 'zoneId') ? n : { ...n, zoneId: null }
    );
    return {
      ...state,
      zones: Array.isArray(state.zones) ? state.zones : [],
      containers: (state.containers || []).map(stamp),
      pieces: (state.pieces || []).map(stamp),
      operations: (state.operations || []).map(stamp),
    };
  },
  8: function migrate_v8_to_v9(state) {
    // v8 → v9 (T9 DEC-T9-10, R-DRIFT: spec said v7→v8). Additive +
    // idempotent — nullable variants fields where absent; an existing
    // value (variantGroupId / materializedClones) is preserved.
    if (!state || typeof state !== 'object') return null;
    return {
      ...state,
      pieces: (state.pieces || []).map((p) => (
        p.variantGroupId === undefined ? { ...p, variantGroupId: null } : p
      )),
      operations: (state.operations || []).map((op) => (
        op.materializedClones === undefined ? { ...op, materializedClones: null } : op
      )),
    };
  },
  9: function migrate_v9_to_v10(state) {
    // v9 → v10 (T4.5 DEC-T4.5-04). Additive + idempotent — stamp
    // pinned:false on containers/pieces/operations where absent; an
    // existing pinned value (true/false) is preserved (never overwrite).
    if (!state || typeof state !== 'object') return null;
    const stampPinned = (n) => (
      n && n.pinned === undefined ? { ...n, pinned: false } : n
    );
    return {
      ...state,
      containers: (state.containers || []).map(stampPinned),
      pieces: (state.pieces || []).map(stampPinned),
      operations: (state.operations || []).map(stampPinned),
    };
  },
};

/**
 * migrateSnapshot — chain migrations от fromVersion до CURRENT.
 * Returns migrated state OR null if migration impossible.
 */
export function migrateSnapshot(state, fromVersion) {
  if (!state || typeof state !== 'object') return null;
  let cur = state;
  let v = fromVersion;
  while (v < SCHEMA_VERSION_CURRENT) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return null; // missing migration step — refuse
    cur = migrate(cur);
    if (!cur) return null;
    v += 1;
  }
  return cur;
}

/**
 * loadSnapshot — pull last snapshot с migration chain. Returns null
 * если нет / неподдерживаемая версия / corrupted.
 */
export async function loadSnapshot(projectId) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(stateKeyFor(projectId));
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (!data) return resolve(null);
        if (typeof data.schema !== 'number') {
          // Legacy save без schema field — predates DEC-OPS-SNAPSHOT-MIGRATE-01.
          // eslint-disable-next-line no-console
          console.warn('[skeleton-persistence] snapshot без schema field — skipping load');
          return resolve(null);
        }
        if (data.schema > SCHEMA_VERSION_CURRENT) {
          // Future version (user downgrade?) — refuse, do не corrupt.
          // eslint-disable-next-line no-console
          console.warn(`[skeleton-persistence] snapshot schema v${data.schema} > current v${SCHEMA_VERSION_CURRENT} — skipping`);
          return resolve(null);
        }
        let st = data.state || null;
        if (!st) return resolve(null);
        if (data.schema < SCHEMA_VERSION_CURRENT) {
          st = migrateSnapshot(st, data.schema);
          if (!st) {
            // eslint-disable-next-line no-console
            console.warn(`[skeleton-persistence] migration v${data.schema}→v${SCHEMA_VERSION_CURRENT} failed`);
            return resolve(null);
          }
        }
        resolve(st);
      };
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * clearSnapshot — обнуляет save (для Reset / debug).
 */
export async function clearSnapshot(projectId) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(stateKeyFor(projectId));
      delReq.onsuccess = () => resolve(true);
      delReq.onerror = () => reject(delReq.error);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * createDebouncedSaver — фабрика saver-функции с debounce.
 *
 * @param {number} delayMs
 * @returns {(state, projectId?) => void}
 *
 * V65: captures projectId per call so a pending save writes to the
 * project it was queued for (correct on project switch).
 */
export function createDebouncedSaver(delayMs = 500) {
  let timer = null;
  let lastState = null;
  let lastProjectId;
  return function save(state, projectId) {
    lastState = state;
    lastProjectId = projectId;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveSnapshot(lastState, lastProjectId);
      timer = null;
    }, delayMs);
  };
}
