/**
 * skeleton-state-editor — editor-slice sub-reducer.
 *
 * Owns editor open/context + pending edits buffer + per-tab selection
 * and sequence-view-mode.
 *
 * Sprint M-CANVAS-WINDOW F1 (15.05.2026) — DEC-CANVAS-WIN-01..04.
 * `editorContext` evolved from single `{viewOnlyContainerId}` into a
 * multi-tab shape `{tabs: [{id, containerId, openedAt}], activeTabId}`.
 *   - `OPEN_EDITOR_TAB` / `CLOSE_EDITOR_TAB` / `SWITCH_EDITOR_TAB` /
 *     `SWITCH_NEXT_TAB` / `SWITCH_PREV_TAB` — multi-tab orchestration.
 *   - `OPEN_EDITOR_VIEW_ONLY` delegates to OPEN_EDITOR_TAB (back-compat).
 *   - `CLOSE_EDITOR` closes all tabs (back-compat).
 *   - `viewOnlyContainerId` no longer stored — derive via
 *     `deriveActiveContainerId(editorContext)` (DEC-WIN-01).
 *
 * Slice fields:
 *   editorOpen, editorContext, pendingEditsByContainer,
 *   sequenceViewModeByTab, selectionByTab
 *
 * Cross-domain writes (handled jointly with canvas reducer):
 *   COMMIT_PENDING_EDITS — clears `pendingEditsByContainer[id]` AFTER
 *     canvas reducer has applied them to the container.
 *   REMOVE_CONTAINER — drops pendingEdits + selectionByTab +
 *     sequenceViewModeByTab keys + auto-closes any editor tab open on
 *     the removed container (DEC-WIN-01 §5).
 */
import { v7 as uuidv7 } from 'uuid';

export function buildInitialEditorState() {
  return {
    editorOpen: false,
    editorContext: { tabs: [], activeTabId: null },
    pendingEditsByContainer: {},
    sequenceViewModeByTab: {},
    selectionByTab: {},
    // F3 DEC-CANVAS-PCR-04 — persisted PCR-mode UX level preference.
    pcrModeUserLevel: 'default',
  };
}

const PCR_LEVELS = new Set(['default', 'tweak', 'pro']);

/**
 * deriveActiveContainerId — backward-compat getter (DEC-WIN-01).
 * Returns the containerId of the active tab, or null.
 */
export function deriveActiveContainerId(editorContext) {
  if (!editorContext || !Array.isArray(editorContext.tabs)) return null;
  const t = editorContext.tabs.find((x) => x.id === editorContext.activeTabId);
  return (t && t.kind !== 'operation') ? (t.containerId || null) : null;
}

/**
 * deriveActiveTab — the active tab object (F3 DEC-CANVAS-PCR-01).
 * Lets the shell branch on tab.kind ('container' | 'operation').
 */
export function deriveActiveTab(editorContext) {
  if (!editorContext || !Array.isArray(editorContext.tabs)) return null;
  return editorContext.tabs.find((x) => x.id === editorContext.activeTabId) || null;
}

// DEC-WIN-03 — focus existing tab same-container, else create new.
function openTab(state, containerId) {
  if (!containerId) return state;
  const ctx = state.editorContext;
  const existing = ctx.tabs.find((t) => t.containerId === containerId);
  if (existing) {
    if (state.editorOpen && ctx.activeTabId === existing.id) return state;
    return {
      ...state,
      editorOpen: true,
      editorContext: { ...ctx, activeTabId: existing.id },
    };
  }
  const tab = {
    id: `tab-${uuidv7()}`, kind: 'container', containerId, openedAt: Date.now(),
  };
  return {
    ...state,
    editorOpen: true,
    editorContext: { tabs: [...ctx.tabs, tab], activeTabId: tab.id },
  };
}

// F3 DEC-CANVAS-PCR-01/02 — operation tab: focus existing tab for the
// same operationId, else create a new kind='operation' tab.
function openOpTab(state, operationId) {
  if (!operationId) return state;
  const ctx = state.editorContext;
  const existing = ctx.tabs.find(
    (t) => t.kind === 'operation' && t.operationId === operationId,
  );
  if (existing) {
    if (state.editorOpen && ctx.activeTabId === existing.id) return state;
    return {
      ...state,
      editorOpen: true,
      editorContext: { ...ctx, activeTabId: existing.id },
    };
  }
  const tab = {
    id: `tab-${uuidv7()}`, kind: 'operation', operationId, openedAt: Date.now(),
  };
  return {
    ...state,
    editorOpen: true,
    editorContext: { tabs: [...ctx.tabs, tab], activeTabId: tab.id },
  };
}

// A2 / G2 DEC-CANVAS-ASM-12 — assembly tab: focus existing tab for the
// same assemblyDraftId, else create a new kind='assembly' tab.
function openAssemblyTab(state, draftId) {
  if (!draftId) return state;
  const ctx = state.editorContext;
  const existing = ctx.tabs.find(
    (t) => t.kind === 'assembly' && t.assemblyDraftId === draftId,
  );
  if (existing) {
    if (state.editorOpen && ctx.activeTabId === existing.id) return state;
    return {
      ...state,
      editorOpen: true,
      editorContext: { ...ctx, activeTabId: existing.id },
    };
  }
  const tab = {
    id: `tab-${uuidv7()}`, kind: 'assembly', assemblyDraftId: draftId, openedAt: Date.now(),
  };
  return {
    ...state,
    editorOpen: true,
    editorContext: { tabs: [...ctx.tabs, tab], activeTabId: tab.id },
  };
}

// Remove tabs matching `predicate`; recompute active (prev → next),
// close editor when nothing remains. Identity-preserving when no tab
// matched. DEC-WIN-08.
function closeTabs(state, predicate) {
  const ctx = state.editorContext;
  const activeTab = ctx.tabs.find((t) => t.id === ctx.activeTabId) || null;
  const removedActive = !!activeTab && predicate(activeTab);
  const activeIdx = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
  const kept = ctx.tabs.filter((t) => !predicate(t));
  if (kept.length === ctx.tabs.length) return state; // nothing removed
  if (kept.length === 0) {
    return {
      ...state,
      editorOpen: false,
      editorContext: { tabs: [], activeTabId: null },
    };
  }
  let activeTabId = ctx.activeTabId;
  if (removedActive) {
    const targetIdx = Math.max(0, Math.min(activeIdx - 1, kept.length - 1));
    activeTabId = kept[targetIdx].id;
  }
  return {
    ...state,
    editorOpen: true,
    editorContext: { tabs: kept, activeTabId },
  };
}

function cycleTab(state, dir) {
  const ctx = state.editorContext;
  if (ctx.tabs.length <= 1) return state;
  const idx = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
  const n = ctx.tabs.length;
  const nextIdx = (((idx < 0 ? 0 : idx) + dir) % n + n) % n;
  const activeTabId = ctx.tabs[nextIdx].id;
  if (activeTabId === ctx.activeTabId) return state;
  return { ...state, editorContext: { ...ctx, activeTabId } };
}

export function editorReducer(state, action) {
  switch (action.type) {
    // ── Multi-tab orchestration (DEC-WIN-01..04) ──────────────────────
    case 'OPEN_EDITOR_TAB':
      return openTab(state, action.containerId);

    case 'OPEN_EDITOR_OP_TAB':
      return openOpTab(state, action.operationId);

    case 'OPEN_EDITOR_ASSEMBLY_TAB':
      return openAssemblyTab(state, action.draftId);

    // A2 / G2 — deleting an assembly draft closes any tab open on it
    // (mirrors REMOVE_CONTAINER tab-close; runs in the chain BEFORE the
    // assembly reducer drops the draft).
    case 'REMOVE_ASSEMBLY_DRAFT':
      if (!action.draftId) return state;
      return closeTabs(state, (t) => t.kind === 'assembly' && t.assemblyDraftId === action.draftId);

    case 'SET_PCR_MODE_USER_LEVEL': {
      if (!PCR_LEVELS.has(action.level)) return state;
      if (state.pcrModeUserLevel === action.level) return state;
      return { ...state, pcrModeUserLevel: action.level };
    }

    case 'CLOSE_EDITOR_TAB': {
      if (!action.tabId) return state;
      return closeTabs(state, (t) => t.id === action.tabId);
    }

    case 'SWITCH_EDITOR_TAB': {
      const ctx = state.editorContext;
      if (!action.tabId) return state;
      if (!ctx.tabs.some((t) => t.id === action.tabId)) return state;
      if (ctx.activeTabId === action.tabId) return state;
      return { ...state, editorContext: { ...ctx, activeTabId: action.tabId } };
    }

    case 'SWITCH_NEXT_TAB':
      return cycleTab(state, +1);

    case 'SWITCH_PREV_TAB':
      return cycleTab(state, -1);

    // ── Backward-compat (DEC-WIN-01 §5) ───────────────────────────────
    case 'OPEN_EDITOR_VIEW_ONLY':
      return openTab(state, action.containerId);

    case 'CLOSE_EDITOR':
      if (!state.editorOpen && state.editorContext.tabs.length === 0) return state;
      return {
        ...state,
        editorOpen: false,
        editorContext: { tabs: [], activeTabId: null },
      };

    case 'SET_SELECTION': {
      const next = { ...state.selectionByTab };
      next[action.tabKey] = action.selection;
      return { ...state, selectionByTab: next };
    }

    case 'SET_SEQUENCE_VIEW_MODE': {
      const next = { ...state.sequenceViewModeByTab };
      next[action.tabKey] = action.mode;
      return { ...state, sequenceViewModeByTab: next };
    }

    case 'SET_PENDING_EDITS': {
      const { containerId, patch } = action;
      if (!containerId || !patch) return state;
      // Existence check is against canvas-owned `containers` array.
      // Since editor reducer can see full state, that's fine.
      const exists = state.containers.some((c) => c.id === containerId);
      if (!exists) return state;
      const prev = state.pendingEditsByContainer[containerId] || {};
      const next = { ...prev, ...patch };
      const cleaned = {};
      let hasAny = false;
      for (const k of Object.keys(next)) {
        if (next[k] !== undefined) { cleaned[k] = next[k]; hasAny = true; }
      }
      const map = { ...state.pendingEditsByContainer };
      if (hasAny) map[containerId] = cleaned;
      else delete map[containerId];
      return { ...state, pendingEditsByContainer: map };
    }

    case 'COMMIT_PENDING_EDITS': {
      // Editor slice — clear pending entry. Canvas reducer ran first
      // (chain order canvas → operations → editor) and already wrote
      // the pending values onto the container.
      const { containerId } = action;
      if (!containerId) return state;
      if (!state.pendingEditsByContainer[containerId]) return state;
      const map = { ...state.pendingEditsByContainer };
      delete map[containerId];
      return { ...state, pendingEditsByContainer: map };
    }

    case 'DISCARD_PENDING_EDITS': {
      const { containerId } = action;
      if (!containerId) return state;
      if (!state.pendingEditsByContainer[containerId]) return state;
      const map = { ...state.pendingEditsByContainer };
      delete map[containerId];
      return { ...state, pendingEditsByContainer: map };
    }

    case 'OP_FORK_CONTAINER': {
      // AUDIT-R2-D (14.05.2026): canvas slice применил pending edits
      // в клон; editor slice теперь чистит pendingEditsByContainer для
      // оригинала, чтобы не оставались inert pending после fork.
      const { containerId, applyPendingEdits = true } = action;
      if (!applyPendingEdits) return state;
      if (!state.pendingEditsByContainer?.[containerId]) return state;
      const map = { ...state.pendingEditsByContainer };
      delete map[containerId];
      return { ...state, pendingEditsByContainer: map };
    }

    case 'REMOVE_CONTAINER': {
      // Editor slice — drop pendingEdits + selection + view-mode for
      // this id; auto-close any tab open on the removed container.
      // Identity-preserving: returns same state reference when nothing
      // in the editor slice references this containerId.
      const { containerId } = action;
      if (!containerId) return state;

      const hasPending = state.pendingEditsByContainer[containerId] !== undefined;
      const selectionKeysToDrop = Object.keys(state.selectionByTab).filter(
        (k) => k.endsWith(`::${containerId}`),
      );
      const viewModeKeysToDrop = Object.keys(state.sequenceViewModeByTab).filter(
        (k) => k.endsWith(`::${containerId}`),
      );
      const ctx = state.editorContext;
      const tabsForContainer = ctx.tabs.filter((t) => t.containerId === containerId);
      const editorTargetsRemoved = tabsForContainer.length > 0;

      if (
        !hasPending
        && selectionKeysToDrop.length === 0
        && viewModeKeysToDrop.length === 0
        && !editorTargetsRemoved
      ) {
        return state;
      }

      const pendingEditsByContainer = { ...state.pendingEditsByContainer };
      delete pendingEditsByContainer[containerId];

      let selectionByTab = state.selectionByTab;
      if (selectionKeysToDrop.length > 0) {
        selectionByTab = {};
        for (const k of Object.keys(state.selectionByTab)) {
          if (!k.endsWith(`::${containerId}`)) selectionByTab[k] = state.selectionByTab[k];
        }
      }
      let sequenceViewModeByTab = state.sequenceViewModeByTab;
      if (viewModeKeysToDrop.length > 0) {
        sequenceViewModeByTab = {};
        for (const k of Object.keys(state.sequenceViewModeByTab)) {
          if (!k.endsWith(`::${containerId}`)) sequenceViewModeByTab[k] = state.sequenceViewModeByTab[k];
        }
      }

      let editorOpen = state.editorOpen;
      let editorContext = ctx;
      if (editorTargetsRemoved) {
        const kept = ctx.tabs.filter((t) => t.containerId !== containerId);
        if (kept.length === 0) {
          editorOpen = false;
          editorContext = { tabs: [], activeTabId: null };
        } else {
          let activeTabId = ctx.activeTabId;
          if (!kept.some((t) => t.id === activeTabId)) {
            const oldIdx = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
            const targetIdx = Math.max(0, Math.min(oldIdx - 1, kept.length - 1));
            activeTabId = kept[targetIdx].id;
          }
          editorOpen = true;
          editorContext = { tabs: kept, activeTabId };
        }
      }

      return {
        ...state,
        pendingEditsByContainer,
        selectionByTab,
        sequenceViewModeByTab,
        editorOpen,
        editorContext,
      };
    }

    default:
      return state;
  }
}
