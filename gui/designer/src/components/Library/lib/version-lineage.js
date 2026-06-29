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

export function parentOf(entry) {
  if (!entry) return null;
  return entry.parentEntryId || entry.origin?.parentEntryId || null;
}

/**
 * Walk `parentEntryId` up to the topmost ancestor PRESENT in the map.
 * Stops when the parent is missing (hidden / pruned) or absent, so two
 * visible siblings of a soft-deleted ancestor still share a root.
 * Unknown id → returns the id itself (it is its own lineage).
 */
export function lineageRootId(entriesById, id) {
  const map = entriesById || {};
  if (!map[id]) return id;
  let rootId = id;
  const seen = new Set([rootId]);
  for (;;) {
    const p = parentOf(map[rootId]);
    if (!p || !map[p] || seen.has(p)) break;
    rootId = p; seen.add(p);
  }
  return rootId;
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

/**
 * collectLineage(entriesById, anyId) — resolve the whole version lineage
 * any member belongs to, split into the linear MAINLINE (versions) and the
 * divergent BRANCHES, with an explicit HEAD (the advancing tip).
 *
 *   → { rootId, headId, versions:[node…], branches:[{tipId,name,nodes}], all:[node…] }
 *
 * The mainline honours an explicit intent: `entry.origin.lineageRole`
 * ('version' | 'branch'). A node marked 'branch' never joins the mainline
 * even if it is the earliest child; absent an explicit role we fall back to
 * birth-order (earliest unmarked child continues the line — same rule the
 * git-graph lanes use). HEAD = last node on the mainline. Each node is
 * tagged with a resolved `role`.
 */
export function collectLineage(entriesById, anyId) {
  const map = entriesById || {};
  const empty = { rootId: null, headId: null, versions: [], branches: [], all: [] };
  if (!map[anyId]) return empty;

  const tl = buildVersionTimeline(map, anyId);
  if (!tl.root) return empty;

  const explicitRole = (id) => {
    const r = map[id]?.origin?.lineageRole;
    return (r === 'version' || r === 'branch') ? r : null;
  };

  const byId = Object.fromEntries(tl.nodes.map((n) => [n.id, n]));
  const childrenOf = {};
  for (const n of tl.nodes) {
    if (n.parentId) (childrenOf[n.parentId] ||= []).push(n.id);
  }
  for (const k of Object.keys(childrenOf)) {
    childrenOf[k].sort((a, b) => byId[a].order - byId[b].order);
  }

  // Mainline: from the root, follow the version successor — the earliest
  // child explicitly marked 'version', else the earliest child not marked
  // 'branch'.
  const inMain = new Set();
  const mainlineIds = [];
  let cursor = tl.root;
  while (cursor != null && !inMain.has(cursor)) {
    mainlineIds.push(cursor);
    inMain.add(cursor);
    const kids = childrenOf[cursor] || [];
    let next = kids.find((k) => explicitRole(k) === 'version');
    if (next == null) next = kids.find((k) => explicitRole(k) == null);
    cursor = next ?? null;
  }

  const all = tl.nodes.map((n) => ({
    ...n,
    role: explicitRole(n.id) || (inMain.has(n.id) ? 'version' : 'branch'),
  }));
  const enriched = Object.fromEntries(all.map((n) => [n.id, n]));
  const versions = mainlineIds.map((id) => enriched[id]);
  const headId = mainlineIds[mainlineIds.length - 1] || tl.root;

  // Branches: each off-mainline node whose parent IS on the mainline starts
  // a branch; its nodes = the DFS subtree from there (deeper off-mainline
  // nodes fold into their branch, not a new one). tip = latest node.
  const branchRoots = all
    .filter((n) => !inMain.has(n.id) && n.parentId != null && inMain.has(n.parentId))
    .sort((a, b) => a.order - b.order);
  const branches = branchRoots.map((br) => {
    const nodes = [];
    const visited = new Set();
    const stack = [br.id];
    while (stack.length) {
      const id = stack.shift();
      if (visited.has(id) || inMain.has(id)) continue;
      visited.add(id);
      nodes.push(enriched[id]);
      for (const k of (childrenOf[id] || [])) stack.push(k);
    }
    nodes.sort((a, b) => a.order - b.order);
    const tip = nodes[nodes.length - 1] || br;
    return { tipId: tip.id, name: tip.name, nodes };
  });

  return { rootId: tl.root, headId, versions, branches, all };
}

/**
 * groupVisibleLineages(entriesById, visibleEntries) — partition a flat list
 * of visible library entries into version lineages so the tree can render
 * ONE collapsible node per molecule instead of N sibling rows.
 *
 *   → [{ rootId, headEntry, members:[entry…], count, lineage }]
 *
 * `headEntry` is the VISIBLE representative: the structural head if visible,
 * else the latest visible mainline member, else the latest visible member.
 * Group order follows first appearance in `visibleEntries` (caller pre-sorts).
 */
export function groupVisibleLineages(entriesById, visibleEntries) {
  const map = entriesById || {};
  const list = Array.isArray(visibleEntries) ? visibleEntries : [];
  const byRoot = new Map();
  for (const e of list) {
    if (!e?.id) continue;
    const r = lineageRootId(map, e.id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(e);
  }

  const result = [];
  for (const [rootId, members] of byRoot) {
    const lineage = collectLineage(map, rootId);
    const memberById = new Map(members.map((m) => [m.id, m]));

    let headEntry = null;
    if (lineage.headId && memberById.has(lineage.headId)) {
      headEntry = memberById.get(lineage.headId);
    }
    if (!headEntry) {
      // latest visible mainline member (versions are ordered root→tip)
      for (let i = lineage.versions.length - 1; i >= 0; i--) {
        const id = lineage.versions[i].id;
        if (memberById.has(id)) { headEntry = memberById.get(id); break; }
      }
    }
    if (!headEntry) headEntry = members[members.length - 1];

    result.push({ rootId, headEntry, members, count: members.length, lineage });
  }
  return result;
}
