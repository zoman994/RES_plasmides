/**
 * workspaceSlice — Sprint M-X.7a v2 K1 (DEC-MX7A-V2-01).
 *
 * Top-level workspace router. Independent of `canvas.activeFullscreen`
 * — Container Window / DAG fullscreen continue to overlay above the
 * active workspace.
 *
 * Workspaces:
 *   'startup'   — pixel-perfect StartScreen (Sidebar + Recent
 *                 projects + EmptyCard). Default landing post
 *                 StartScreen-Pixel sprint (was 'library' from
 *                 the M-X.7a v2 K1 DEC-MX7A-V2-08 default;
 *                 default flipped per CURRENT_TASK.md).
 *   'library'   — Library workspace (M-X.7a v2 LibraryWorkspace).
 *   'construct' — DesignCanvas (Project's primary canvas).
 *   'mix'       — placeholder for M-E Mix Workspace.
 *
 * History stack lets the back-button (UI in K5) return to the prior
 * workspace. Capped at WORKSPACE_HISTORY_LIMIT to avoid memory growth
 * across long sessions.
 *
 * `context` carries optional per-switch data (e.g. `{ projectId }`).
 * Reset to `{}` whenever a switch comes through with no context — the
 * prior context shouldn't leak into the next workspace mount.
 *
 * 17.06.2026: `'flow'` (DAG Project Flow) removed — DagWorkspace was
 * deleted (dead legacy route), and DEC-MX7A-V2-09 (DAG sub-row wiring)
 * is retracted. See TECH_DEBT TD-DEAD-DAGWORKSPACE.
 */

const VALID_WORKSPACES = new Set([
  'startup', 'library', 'construct', 'mix', 'align', 'restriction-sites',
  'primer-pool',
]);

export const WORKSPACE_HISTORY_LIMIT = 10;

export function createWorkspaceSlice(set, get) {
  return {
    workspace: { active: 'startup', history: [], context: {} },

    setActiveWorkspace: (name, context) => {
      if (!VALID_WORKSPACES.has(name)) return;
      set((state) => {
        if (!state.workspace) {
          state.workspace = { active: 'library', history: [], context: {} };
        }
        const prev = state.workspace.active;
        if (prev === name && !context) return; // no-op on identical re-entry
        if (prev !== name) {
          const next = [...state.workspace.history, prev];
          state.workspace.history = next.length > WORKSPACE_HISTORY_LIMIT
            ? next.slice(-WORKSPACE_HISTORY_LIMIT)
            : next;
        }
        state.workspace.active = name;
        state.workspace.context = context && typeof context === 'object' ? { ...context } : {};
      });
    },

    goBack: () => {
      set((state) => {
        if (!state.workspace) return;
        const stack = state.workspace.history;
        if (!Array.isArray(stack) || stack.length === 0) return;
        const prev = stack[stack.length - 1];
        state.workspace.history = stack.slice(0, -1);
        state.workspace.active = prev;
        state.workspace.context = {};
      });
    },
  };
}

export function selectActiveWorkspace(state) {
  return state?.workspace?.active || 'startup';
}

export function selectIsInLibrary(state) {
  return selectActiveWorkspace(state) === 'library';
}

export function selectCanGoBack(state) {
  return Array.isArray(state?.workspace?.history) && state.workspace.history.length > 0;
}
