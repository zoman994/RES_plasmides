/**
 * folder-tree.js — shared utility for tag-prefix-folder trees.
 *
 * Turns a flat list of slash-separated paths
 * (`['Vectors', 'Vectors/CRISPR', 'Promoters']`) into a forest of
 * `{ name, path, children[] }` nodes for Library folder consumers.
 *
 * Storage layout (existing — no migration here):
 *   localStorage['pvcs-catalog-user-folders-by-group'] = JSON
 *      { canvas: string[], demo: string[], mine: string[], snapgene: string[] }
 *   Each entry is a slash-separated path; library callers typically
 *   read group `'mine'`.
 */

const STORAGE_KEY = 'pvcs-catalog-user-folders-by-group';
const LEGACY_KEY = 'pvcs-catalog-user-folders';

/** Forest node shape. */
export const FOLDER_NODE_SHAPE = Object.freeze({
  name: 'string',
  path: 'string',
  children: '[]',
});

/**
 * Parse a flat list of slash-separated paths into a forest.
 *
 * @example
 *   buildFolderTree(['Vectors', 'Vectors/CRISPR', 'Promoters'])
 *   // → [
 *   //     { name: 'Vectors',    path: 'Vectors',         children: [
 *   //         { name: 'CRISPR', path: 'Vectors/CRISPR',  children: [] },
 *   //     ]},
 *   //     { name: 'Promoters',  path: 'Promoters',       children: [] },
 *   //   ]
 *
 * Sorting parents-before-children is critical so each node finds its
 * parent in the lookup map; out-of-order entries fall back to roots.
 */
export function buildFolderTree(paths) {
  const roots = [];
  const byPath = new Map();
  const sorted = Array.isArray(paths) ? [...paths].sort() : [];
  for (const p of sorted) {
    if (typeof p !== 'string' || !p) continue;
    const slash = p.lastIndexOf('/');
    const parentPath = slash >= 0 ? p.slice(0, slash) : '';
    const name = slash >= 0 ? p.slice(slash + 1) : p;
    const node = { name, path: p, children: [] };
    byPath.set(p, node);
    if (parentPath && byPath.has(parentPath)) {
      byPath.get(parentPath).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Read user-defined folders for the given catalog group from
 * localStorage. Returns `[]` in any failure mode (private mode,
 * malformed JSON, missing key) so callers can render an empty tree
 * without try/catch noise.
 *
 * Migrates the pre-multi-group key (`pvcs-catalog-user-folders` —
 * a flat array assumed to belong to 'mine') on the fly without
 * writing back so a read never creates a duplicate write race.
 */
export function readFolders(group = 'mine') {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const arr = parsed && Array.isArray(parsed[group]) ? parsed[group] : [];
      return arr.filter((s) => typeof s === 'string' && s);
    }
    if (group === 'mine') {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr)) return arr.filter((s) => typeof s === 'string' && s);
      }
    }
  } catch { /* private mode / malformed */ }
  return [];
}

/**
 * Convenience: read folders for `group` and return them as a
 * pre-built tree. Most callers want this.
 */
export function readFolderTree(group = 'mine') {
  return buildFolderTree(readFolders(group));
}

const KNOWN_GROUPS = new Set(['canvas', 'demo', 'mine', 'snapgene']);

/**
 * Append a folder path to the given group in localStorage. No-op
 * for empty / non-string paths, unknown groups, or paths that are
 * already present (de-duped). `createProject` pushes the
 *     project name into the `canvas` group so each project carries
 *     its own folder under «This project».
 */
export function addFolder(group, path) {
  if (typeof localStorage === 'undefined') return;
  if (!KNOWN_GROUPS.has(group)) return;
  const trimmed = typeof path === 'string' ? path.trim() : '';
  if (!trimmed) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const empty = { canvas: [], demo: [], mine: [], snapgene: [] };
    const next = parsed && typeof parsed === 'object' ? { ...empty, ...parsed } : empty;
    const cur = Array.isArray(next[group]) ? next[group] : [];
    if (cur.includes(trimmed)) return;
    next[group] = [...cur, trimmed];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* private mode / quota */ }
}
