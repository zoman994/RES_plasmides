/**
 * version-lineage.js — build the version-history timeline model for a library
 * entry (Игорь 16.06.2026, дизайн одобрен). Pure: walks the `parentEntryId`
 * lineage + `origin` provenance into a flowchart-over-time model the
 * VersionTimeline component renders (horizontal = time, branches in parallel
 * lanes, как git-граф).
 *
 * `buildVersionTimeline(entriesById, focusId)` → { root, nodes[], edges[] }.
 *   node = { id, name, kind, kindLabel, tone, timeMs, time, changes, reason,
 *            parentId, isCurrent, lane, order }
 *   edge = { from: parentId, to: id }
 */

const KIND_META = {
  file_import: { label: 'импорт', tone: 'neutral' },
  paste_import: { label: 'импорт', tone: 'neutral' },
  demo_category: { label: 'демо', tone: 'neutral' },
  manual_edit: { label: 'правка', tone: 'edit' },
  version: { label: 'версия', tone: 'edit' },
};

function nodeTime(entry) {
  const o = entry.origin || {};
  const raw = o.editedAt || o.createdAt || entry.addedAt || '';
  const ms = raw ? Date.parse(raw) : NaN;
  return { raw, ms: Number.isFinite(ms) ? ms : 0 };
}

function parentOf(entry) {
  if (!entry) return null;
  return entry.parentEntryId || entry.origin?.parentEntryId || null;
}

export function buildVersionTimeline(entriesById, focusId) {
  const map = entriesById || {};
  if (!map[focusId]) return { root: null, nodes: [], edges: [] };

  // 1) Walk up to the root (parent must exist in the map; guard cycles).
  let rootId = focusId;
  const seen = new Set([rootId]);
  for (;;) {
    const p = parentOf(map[rootId]);
    if (!p || !map[p] || seen.has(p)) break;
    rootId = p; seen.add(p);
  }

  // 2) Index children, collect the subtree rooted at `rootId`.
  const childrenByParent = {};
  for (const id of Object.keys(map)) {
    const p = parentOf(map[id]);
    if (p) {
      if (!childrenByParent[p]) childrenByParent[p] = [];
      childrenByParent[p].push(id);
    }
  }
  const inSubtree = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const k of (childrenByParent[id] || [])) {
      if (!inSubtree.has(k)) { inSubtree.add(k); queue.push(k); }
    }
  }

  const nodeIds = [...inSubtree];
  const times = {};
  nodeIds.forEach((id) => { times[id] = nodeTime(map[id]); });

  // 3) Lane assignment (DFS from root): the earliest child keeps the parent's
  // lane; later children diverge onto fresh lanes (git-graph branching).
  const lane = {};
  let nextLane = 0;
  const assign = (id, myLane) => {
    lane[id] = myLane;
    const kids = (childrenByParent[id] || [])
      .filter((k) => inSubtree.has(k))
      .sort((a, b) => times[a].ms - times[b].ms);
    kids.forEach((k, i) => assign(k, i === 0 ? myLane : (nextLane += 1)));
  };
  assign(rootId, 0);

  // 4) Order chronologically.
  const ordered = nodeIds.slice().sort((a, b) => times[a].ms - times[b].ms);
  const nodes = ordered.map((id, order) => {
    const e = map[id];
    const kind = e.origin?.kind || 'unknown';
    const meta = KIND_META[kind] || { label: kind, tone: 'edit' };
    const p = parentOf(e);
    return {
      id,
      name: e.name || 'без имени',
      kind,
      kindLabel: meta.label,
      tone: meta.tone,
      timeMs: times[id].ms,
      time: times[id].raw,
      changes: e.origin?.changes || '',
      reason: e.origin?.reason || '',
      parentId: p && inSubtree.has(p) ? p : null,
      isCurrent: id === focusId,
      lane: lane[id] ?? 0,
      order,
    };
  });
  const edges = nodes.filter((n) => n.parentId).map((n) => ({ from: n.parentId, to: n.id }));
  return { root: rootId, nodes, edges };
}
