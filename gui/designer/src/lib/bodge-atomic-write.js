/**
 * bodge-atomic-write — cloud-sync-friendly atomic save.
 *
 * Spec §12.1 — 5-step pattern:
 *   1. Write `<path>.writing-<uuid>.tmp` (typically Dropbox/iCloud-ignored).
 *   2. Verify integrity (re-read tmp, sha256-walk each asset against manifest).
 *   3. If `path` exists → rename → `<path>.bak`.
 *   4. Atomic rename `tmp` → `path`.
 *   5. Keep `.bak` until the next successful save (recovery option).
 *
 * Browser context: filesystem ops go through FileSystemFileHandle. We
 * abstract over the IO so unit tests can pass an in-memory file system
 * shim.
 */
import { verifyBodgeIntegrity } from './bodge-recovery';

const TMP_SUFFIX_RE = /\.writing-[a-zA-Z0-9-]+\.tmp$/;
const BAK_SUFFIX = '.bak';
const STALE_TMP_AGE_MS = 60_000;

/**
 * In-memory filesystem shim used by tests. Real implementation calls
 * `safeWriteBodge(path, blob, { fs: realFsAdapter })`.
 */
export function createMemoryFs(initial = {}) {
  const store = new Map();
  for (const [k, v] of Object.entries(initial)) {
    store.set(k, { content: v, mtime: Date.now() });
  }
  return {
    async exists(path) { return store.has(path); },
    async read(path) {
      const entry = store.get(path);
      if (!entry) throw new Error(`ENOENT: ${path}`);
      return entry.content;
    },
    async write(path, blob) {
      store.set(path, { content: blob, mtime: Date.now() });
    },
    async rename(oldPath, newPath) {
      const entry = store.get(oldPath);
      if (!entry) throw new Error(`ENOENT: ${oldPath}`);
      store.set(newPath, entry);
      store.delete(oldPath);
    },
    async unlink(path) {
      store.delete(path);
    },
    async list(prefix) {
      return Array.from(store.keys()).filter(p => p.startsWith(prefix));
    },
    async stat(path) {
      const entry = store.get(path);
      if (!entry) throw new Error(`ENOENT: ${path}`);
      return { mtime: entry.mtime, size: entry.content.size ?? entry.content.byteLength ?? 0 };
    },
    _internalStore: store,
  };
}

function uuid() {
  // Lightweight v4-shaped uuid for tmp-file disambiguation.
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g,
    c => (c ^ Math.random() * 16 >> c / 4).toString(16));
}

/**
 * Safe atomic write per §12.1.
 *
 * @param {string} path — destination .bodge file path.
 * @param {Blob} blob   — bytes to write.
 * @param {object} [opts]
 * @param {object} opts.fs — filesystem adapter (exists/read/write/rename/unlink).
 * @param {boolean} [opts.skipIntegrity=false] — skip step 2 (used by tests).
 * @returns {Promise<{ok, backupPath}>}
 */
export async function safeWriteBodge(path, blob, opts = {}) {
  if (!path) throw new Error('safeWriteBodge: path required');
  if (!blob) throw new Error('safeWriteBodge: blob required');
  const fs = opts.fs || (await defaultFs());
  const tmpPath = `${path}.writing-${uuid()}.tmp`;

  // 1. Write tmp.
  await fs.write(tmpPath, blob);

  // 2. Verify integrity. Re-read + walk sha256 against manifest. On
  // failure, unlink tmp + throw.
  if (!opts.skipIntegrity) {
    let reread;
    try {
      reread = await fs.read(tmpPath);
    } catch (e) {
      await fs.unlink(tmpPath).catch(() => {});
      throw new Error(`safeWriteBodge: tmp re-read failed: ${e.message}`);
    }
    const integrity = await verifyBodgeIntegrity(reread);
    if (!integrity.ok) {
      await fs.unlink(tmpPath).catch(() => {});
      throw new Error(`safeWriteBodge: integrity check failed: ${integrity.errors.join(', ')}`);
    }
  }

  // 3. Backup existing.
  let backupPath = null;
  if (await fs.exists(path)) {
    backupPath = `${path}${BAK_SUFFIX}`;
    // Remove any stale prior backup before renaming.
    if (await fs.exists(backupPath)) await fs.unlink(backupPath);
    await fs.rename(path, backupPath);
  }

  // 4. Atomic rename tmp → path.
  try {
    await fs.rename(tmpPath, path);
  } catch (e) {
    // Rollback: restore .bak if we made one.
    if (backupPath && await fs.exists(backupPath)) {
      await fs.rename(backupPath, path).catch(() => {});
    }
    throw e;
  }

  return { ok: true, backupPath };
}

/**
 * Detect concurrent-write or abandoned-tmp state per §12.2.
 *
 * Returns:
 *   { activeWriteInProgress: bool, abandonedTmpFiles: [paths], backupAvailable: bool }
 *
 * UI uses this on open to surface the warning modal.
 */
export async function detectConcurrentWrite(path, opts = {}) {
  const fs = opts.fs || (await defaultFs());
  const result = {
    activeWriteInProgress: false,
    abandonedTmpFiles: [],
    backupAvailable: false,
  };
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const base = path.slice(dir.length);
  const candidates = await fs.list(dir || '');
  for (const candidate of candidates) {
    if (!candidate.startsWith(path)) continue;
    if (TMP_SUFFIX_RE.test(candidate)) {
      try {
        const st = await fs.stat(candidate);
        const age = Date.now() - st.mtime;
        if (age < STALE_TMP_AGE_MS) {
          result.activeWriteInProgress = true;
        } else {
          result.abandonedTmpFiles.push(candidate);
        }
      } catch {
        // ignore stat failures
      }
    } else if (candidate === `${path}${BAK_SUFFIX}`) {
      result.backupAvailable = true;
    }
  }
  // Silence linter: `base` is here for callers debugging filename
  // collisions during recovery prompts.
  void base;
  return result;
}

async function defaultFs() {
  // In production we'd return a FileSystemFileHandle adapter. For unit
  // tests + jsdom environment, fall back to memory fs unless caller
  // injects via opts.fs.
  return createMemoryFs();
}

export { TMP_SUFFIX_RE, BAK_SUFFIX };
