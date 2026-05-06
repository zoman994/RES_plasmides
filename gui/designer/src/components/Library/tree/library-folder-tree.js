/**
 * Pure helpers shared by the Library tree decomposition (M-X.5 K3).
 *
 * Extracted as-is from the original `Library/catalog/CatalogColumn.jsx`
 * (lines 28–99 in the pre-K3 file). No logic changes — just a relocate
 * so the tree containers + sub-components can import without circular
 * paths and so the K3 size budget (LibraryTree.jsx ≤ 30 KB) becomes
 * achievable.
 *
 * Persistence note: `readGroupState` / `readSet` swallow localStorage
 * exceptions (private mode, happy-dom, etc.). Callers must tolerate
 * the fallback behaviour (default boolean / empty Set).
 */

export const GROUP_KEYS = ['canvas', 'demo', 'mine', 'snapgene'];

// Depth-based indent: every nesting level shifts text 12 px right.
// Capped at 5 levels so ultra-deep folders still fit the 320 px column.
export const INDENT_STEP = 12;
export const INDENT_BASE = 12;
export const MAX_INDENT_DEPTH = 5;
// Chevron(10px) + flex gap(6px) — group/sub-group rows put their text
// 16 px past padding-left because the chevron span sits in front of it.
// Items (no chevron) need to add this offset to align UNDER the parent's
// text column instead of UNDER the parent's chevron.
export const CHEVRON_GUTTER = 16;

export function indentForDepth(depth) {
  const d = Math.min(MAX_INDENT_DEPTH, Math.max(0, depth));
  return INDENT_BASE + d * INDENT_STEP;
}

// Per-depth background tint — translucent accent band so deeply-nested
// content reads as «inside» its parent without relying on indent alone.
// Stops cleanly at depth 0 (no tint for top-level group rows).
export function depthBackground(depth) {
  if (depth <= 0) return 'transparent';
  const d = Math.min(MAX_INDENT_DEPTH, depth);
  const pct = Math.min(8, 2.5 * d); // 2.5% per level, capped at 8%
  return `color-mix(in srgb, var(--accent-500) ${pct}%, transparent)`;
}

/** Parse a flat list of slash-separated paths into a forest.
 *  ['Vectors', 'Vectors/CRISPR', 'Promoters'] →
 *  [{name:'Vectors', path:'Vectors', children:[{name:'CRISPR', path:'Vectors/CRISPR', children:[]}]},
 *   {name:'Promoters', path:'Promoters', children:[]}] */
export function buildFolderTree(paths) {
  const roots = [];
  const byPath = new Map();
  // Sort so parents always materialise before children.
  const sorted = [...paths].sort();
  for (const p of sorted) {
    if (!p) continue;
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

export function readGroupState(key, fallback) {
  try {
    const v = localStorage.getItem(`pvcs-catalog-group-${key}`);
    if (v === 'open') return true;
    if (v === 'closed') return false;
  } catch { /* private mode / jsdom */ }
  return fallback;
}

export function writeGroupState(key, open) {
  try { localStorage.setItem(`pvcs-catalog-group-${key}`, open ? 'open' : 'closed'); } catch { /* */ }
}

export function readSet(suffix) {
  try {
    const raw = localStorage.getItem(`pvcs-catalog-set-${suffix}`);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* */ }
  return new Set();
}

export function writeSet(suffix, s) {
  try { localStorage.setItem(`pvcs-catalog-set-${suffix}`, JSON.stringify([...s])); } catch { /* */ }
}
