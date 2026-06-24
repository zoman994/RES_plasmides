/**
 * editor-window-shell.test.jsx — F1 M-CANVAS-WINDOW Window System Foundation.
 *
 * Spec: docs/SPRINT_M-CANVAS-WINDOW.md §5 (Тесты).
 *
 * Coverage:
 *  K1 — reducer: tabs[] + activeTabId shape, OPEN/CLOSE/SWITCH tab,
 *       focus-existing (DEC-WIN-03), backward-compat OPEN_EDITOR_VIEW_ONLY /
 *       CLOSE_EDITOR, REMOVE_CONTAINER auto-close, NAV_ACTIONS not in undo.
 *  K2 — EditorTabStrip render (labels + frozen badge + close ×).
 *  K3 — EditorWindowShell mount + header trim (single → multi → close last).
 *  K4 — MiniProjectCanvas markers + active highlight + click-to-switch.
 *  K5 — useTabHotkey TAB / Shift+TAB + guards.
 *  K6 — persistence smoke (rehydrate → tabs restored).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';
import { useEffect } from 'react';
import {
  skeletonReducer,
  buildInitialState,
} from '../store/skeleton-state';
import {
  buildInitialEditorState,
  editorReducer,
  deriveActiveContainerId,
} from '../store/skeleton-state-editor';
import { buildHistoryReducer, wrapInitialState } from '../store/skeleton-history';
import {
  saveSnapshot,
  loadSnapshot,
  clearSnapshot,
} from '../store/skeleton-persistence';
import {
  SkeletonProvider,
  useSkeletonActions,
  useSkeletonState,
} from '../store/skeleton-context';
import EditorTabStrip from '../editor/EditorTabStrip';
import EditorWindowShell from '../editor/EditorWindowShell';
import MiniProjectCanvas from '../canvas/MiniProjectCanvas';

afterEach(cleanup);

import { bootstrapStore } from '../../../store';
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
});

// ── helpers ───────────────────────────────────────────────────────────
function withContainers(state, ids) {
  // Replace fixture containers with explicit filled molecules so tests
  // control exactly which ids exist (avoids ghost-placeholder noise).
  return {
    ...state,
    containers: ids.map((id) => ({
      id,
      kind: 'molecule',
      name: id.toUpperCase(),
      sequence: 'ATGCATGCATGC',
      topology: { circular: false },
      annotations: [],
    })),
  };
}

// ════════════════════════════════════════════════════════════════════
// K1 — State shape extension
// ════════════════════════════════════════════════════════════════════
describe('K1 — editorContext tabs[] + activeTabId shape (DEC-WIN-01)', () => {
  it('buildInitialEditorState → editorContext { tabs:[], activeTabId:null }', () => {
    const s = buildInitialEditorState();
    expect(s.editorOpen).toBe(false);
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });

  it('buildInitialState → same editorContext shape', () => {
    const s = buildInitialState();
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });

  it('deriveActiveContainerId returns active tab containerId or null', () => {
    expect(deriveActiveContainerId({ tabs: [], activeTabId: null })).toBeNull();
    const ctx = {
      tabs: [{ id: 't1', containerId: 'c-a' }, { id: 't2', containerId: 'c-b' }],
      activeTabId: 't2',
    };
    expect(deriveActiveContainerId(ctx)).toBe('c-b');
    expect(deriveActiveContainerId(undefined)).toBeNull();
  });
});

describe('K1 — OPEN_EDITOR_TAB / focus-existing (DEC-WIN-02/03)', () => {
  it('OPEN_EDITOR_TAB creates a tab + activates it + editorOpen=true', () => {
    const s0 = buildInitialEditorState();
    const s1 = editorReducer(s0, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    expect(s1.editorOpen).toBe(true);
    expect(s1.editorContext.tabs).toHaveLength(1);
    expect(s1.editorContext.tabs[0].containerId).toBe('c-a');
    expect(typeof s1.editorContext.tabs[0].id).toBe('string');
    expect(s1.editorContext.tabs[0].id.startsWith('tab-')).toBe(true);
    expect(s1.editorContext.activeTabId).toBe(s1.editorContext.tabs[0].id);
  });

  it('second distinct container → second tab, active switches to it', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    const firstId = s.editorContext.tabs[0].id;
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    expect(s.editorContext.tabs).toHaveLength(2);
    expect(s.editorContext.activeTabId).toBe(s.editorContext.tabs[1].id);
    expect(s.editorContext.tabs[0].id).toBe(firstId);
  });

  it('re-open same container → focus existing tab, no duplicate (DEC-WIN-03)', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    const tabA = s.editorContext.tabs[0].id;
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    expect(s.editorContext.tabs).toHaveLength(2);
    expect(s.editorContext.activeTabId).toBe(tabA);
  });

  it('OPEN_EDITOR_TAB without containerId → state unchanged', () => {
    const s0 = buildInitialEditorState();
    expect(editorReducer(s0, { type: 'OPEN_EDITOR_TAB' })).toBe(s0);
  });
});

describe('K1 — CLOSE_EDITOR_TAB neighbour + last-close (DEC-WIN-08)', () => {
  it('close non-active tab keeps active + editorOpen', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    const tabA = s.editorContext.tabs[0].id;
    const tabB = s.editorContext.tabs[1].id;
    s = editorReducer(s, { type: 'CLOSE_EDITOR_TAB', tabId: tabA });
    expect(s.editorContext.tabs).toHaveLength(1);
    expect(s.editorContext.activeTabId).toBe(tabB);
    expect(s.editorOpen).toBe(true);
  });

  it('close active tab → switches to prev neighbour', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-c' });
    const [tA, tB, tC] = s.editorContext.tabs.map((t) => t.id);
    // active = tC; close it → prev (tB)
    s = editorReducer(s, { type: 'CLOSE_EDITOR_TAB', tabId: tC });
    expect(s.editorContext.activeTabId).toBe(tB);
    expect(s.editorContext.tabs.map((t) => t.id)).toEqual([tA, tB]);
  });

  it('close LAST tab → editor closed (DEC-WIN-08)', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    const tabA = s.editorContext.tabs[0].id;
    s = editorReducer(s, { type: 'CLOSE_EDITOR_TAB', tabId: tabA });
    expect(s.editorOpen).toBe(false);
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });

  it('CLOSE_EDITOR_TAB unknown id → state unchanged', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    const before = s;
    expect(editorReducer(s, { type: 'CLOSE_EDITOR_TAB', tabId: 'nope' })).toBe(before);
  });
});

describe('K1 — SWITCH tab actions', () => {
  it('SWITCH_EDITOR_TAB sets activeTabId; unknown → unchanged', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    const tabA = s.editorContext.tabs[0].id;
    s = editorReducer(s, { type: 'SWITCH_EDITOR_TAB', tabId: tabA });
    expect(s.editorContext.activeTabId).toBe(tabA);
    const same = editorReducer(s, { type: 'SWITCH_EDITOR_TAB', tabId: 'ghost' });
    expect(same).toBe(s);
  });

  it('SWITCH_NEXT_TAB / SWITCH_PREV_TAB cycle', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-c' });
    const [tA, tB, tC] = s.editorContext.tabs.map((t) => t.id);
    expect(s.editorContext.activeTabId).toBe(tC);
    s = editorReducer(s, { type: 'SWITCH_NEXT_TAB' }); // cycle → tA
    expect(s.editorContext.activeTabId).toBe(tA);
    s = editorReducer(s, { type: 'SWITCH_PREV_TAB' }); // wrap back → tC
    expect(s.editorContext.activeTabId).toBe(tC);
    s = editorReducer(s, { type: 'SWITCH_PREV_TAB' }); // → tB
    expect(s.editorContext.activeTabId).toBe(tB);
  });

  it('SWITCH_NEXT_TAB with ≤1 tab → unchanged', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    expect(editorReducer(s, { type: 'SWITCH_NEXT_TAB' })).toBe(s);
  });
});

describe('K1 — backward-compat OPEN_EDITOR_VIEW_ONLY / CLOSE_EDITOR', () => {
  it('OPEN_EDITOR_VIEW_ONLY delegates to OPEN_EDITOR_TAB', () => {
    const s0 = buildInitialEditorState();
    const s1 = editorReducer(s0, { type: 'OPEN_EDITOR_VIEW_ONLY', containerId: 'abc' });
    expect(s1.editorOpen).toBe(true);
    expect(s1.editorContext.tabs).toHaveLength(1);
    expect(s1.editorContext.tabs[0].containerId).toBe('abc');
    expect(deriveActiveContainerId(s1.editorContext)).toBe('abc');
  });

  it('CLOSE_EDITOR closes all tabs', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    s = editorReducer(s, { type: 'CLOSE_EDITOR' });
    expect(s.editorOpen).toBe(false);
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });
});

describe('K1 — REMOVE_CONTAINER auto-closes its tab', () => {
  it('removing a container closes only its tab; others survive', () => {
    let s = buildInitialState();
    s = withContainers(s, ['c-a', 'c-b']);
    s = skeletonReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = skeletonReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    expect(s.editorContext.tabs).toHaveLength(2);
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-a' });
    const stillThere = s.editorContext.tabs.filter((t) => t.containerId === 'c-a');
    expect(stillThere).toHaveLength(0);
    expect(s.editorContext.tabs.some((t) => t.containerId === 'c-b')).toBe(true);
    expect(s.editorOpen).toBe(true);
  });

  it('removing the only open container closes the editor', () => {
    let s = buildInitialState();
    s = withContainers(s, ['c-a']);
    s = skeletonReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-a' });
    expect(s.editorOpen).toBe(false);
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });

  it('REMOVE_CONTAINER for a container with no tab — editor slice identity preserved', () => {
    let s = buildInitialState();
    s = withContainers(s, ['c-a', 'c-b']);
    s = skeletonReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    const ctxBefore = s.editorContext;
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-b' });
    expect(s.editorContext).toBe(ctxBefore);
  });
});

describe('K1 — NAV_ACTIONS excluded from undo stack (DEC-WIN-04)', () => {
  const historyReducer = buildHistoryReducer(skeletonReducer);

  function freshHistory() {
    let h = wrapInitialState(withContainers(buildInitialState(), ['c-a', 'c-b']));
    return h;
  }

  it('OPEN/CLOSE/SWITCH tab actions do not push to past', () => {
    let h = freshHistory();
    h = historyReducer(h, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    h = historyReducer(h, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    const tabA = h.present.editorContext.tabs[0].id;
    h = historyReducer(h, { type: 'SWITCH_EDITOR_TAB', tabId: tabA });
    h = historyReducer(h, { type: 'SWITCH_NEXT_TAB' });
    h = historyReducer(h, { type: 'CLOSE_EDITOR_TAB', tabId: tabA });
    expect(h.past).toHaveLength(0);
  });

  it('OPEN_EDITOR_VIEW_ONLY / CLOSE_EDITOR also excluded (delegating nav)', () => {
    let h = freshHistory();
    h = historyReducer(h, { type: 'OPEN_EDITOR_VIEW_ONLY', containerId: 'c-a' });
    h = historyReducer(h, { type: 'CLOSE_EDITOR' });
    expect(h.past).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// K2 — EditorTabStrip
// ════════════════════════════════════════════════════════════════════
function SeedContainers({ list }) {
  const actions = useSkeletonActions();
  useEffect(() => {
    for (const c of list) {
      actions.addContainer({
        id: c.id,
        kind: 'molecule',
        name: c.name,
        sequence: 'ATGCATGCATGC',
        topology: { circular: false },
        annotations: [],
        ...(c.frozen ? { frozen: true } : {}),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderStrip({ containers, tabs, activeTabId, onSwitch, onClose }) {
  return render(
    <SkeletonProvider>
      <SeedContainers list={containers} />
      <EditorTabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={onSwitch || (() => {})}
        onClose={onClose || (() => {})}
      />
    </SkeletonProvider>,
  );
}

describe('K2 — EditorTabStrip render', () => {
  it('renders one tab per entry with 📦 <name> label + data-active', () => {
    renderStrip({
      containers: [{ id: 'c-a', name: 'pUC19' }, { id: 'c-b', name: 'pET28a' }],
      tabs: [{ id: 't1', containerId: 'c-a' }, { id: 't2', containerId: 'c-b' }],
      activeTabId: 't2',
    });
    const tabsEls = screen.getAllByTestId('editor-tab');
    expect(tabsEls).toHaveLength(2);
    expect(tabsEls[0].textContent).toContain('pUC19');
    expect(tabsEls[0].querySelector('svg')).toBeTruthy(); // 📦 → <Icon name="container">

    expect(tabsEls[0].getAttribute('data-active')).toBe('false');
    expect(tabsEls[1].textContent).toContain('pET28a');
    expect(tabsEls[1].getAttribute('data-active')).toBe('true');
  });

  it('click tab body → onSwitch(tab.id)', () => {
    let switched = null;
    renderStrip({
      containers: [{ id: 'c-a', name: 'A' }],
      tabs: [{ id: 't1', containerId: 'c-a' }],
      activeTabId: 't1',
      onSwitch: (id) => { switched = id; },
    });
    fireEvent.click(screen.getByTestId('editor-tab'));
    expect(switched).toBe('t1');
  });

  it('click × → onClose(tab.id) without triggering onSwitch', () => {
    let switched = null;
    let closed = null;
    renderStrip({
      containers: [{ id: 'c-a', name: 'A' }],
      tabs: [{ id: 't1', containerId: 'c-a' }],
      activeTabId: 't1',
      onSwitch: (id) => { switched = id; },
      onClose: (id) => { closed = id; },
    });
    fireEvent.click(screen.getByTestId('editor-tab-close'));
    expect(closed).toBe('t1');
    expect(switched).toBeNull();
  });

  it('frozen container → 🔒 badge visible even on inactive tab (DEC-WIN-09)', () => {
    renderStrip({
      containers: [
        { id: 'c-a', name: 'A' },
        { id: 'c-frozen', name: 'LOCKED', frozen: true },
      ],
      tabs: [{ id: 't1', containerId: 'c-a' }, { id: 't2', containerId: 'c-frozen' }],
      activeTabId: 't1', // frozen tab is INACTIVE
    });
    const badge = screen.getByTestId('editor-tab-frozen');
    expect(badge).toBeTruthy();
    expect(badge.querySelector('svg')).toBeTruthy(); // 🔒 → <Icon name="lock">

  });

  it('missing / placeholder container → falls back to placeholder label', () => {
    renderStrip({
      containers: [],
      tabs: [{ id: 't1', containerId: 'c-gone' }],
      activeTabId: 't1',
    });
    const tab = screen.getByTestId('editor-tab');
    expect(tab.textContent).toContain('(пустой)');
  });
});

// ════════════════════════════════════════════════════════════════════
// K3 — EditorWindowShell + header trim
// ════════════════════════════════════════════════════════════════════
let shellActions = null;
let shellState = null;
function ShellHarness() {
  shellActions = useSkeletonActions();
  shellState = useSkeletonState();
  return null;
}
function renderShell() {
  return render(
    <SkeletonProvider>
      <ShellHarness />
      <EditorWindowShell />
    </SkeletonProvider>,
  );
}
function seed(id, name) {
  act(() => {
    shellActions.addContainer({
      id,
      kind: 'molecule',
      name,
      sequence: 'ATGCATGCATGCATGCATGC',
      topology: { circular: false },
      annotations: [],
    });
  });
}

describe('K3 — EditorWindowShell lifecycle', () => {
  it('returns null when no tabs (editor closed)', () => {
    renderShell();
    expect(screen.queryByTestId('editor-window-shell')).toBeNull();
    expect(screen.queryByTestId('skeleton-editor-header')).toBeNull();
  });

  it('open single → shell header + 1 tab + editor body', () => {
    renderShell();
    seed('c-a', 'pUC19');
    act(() => { shellActions.openEditorTab('c-a'); });
    expect(screen.getByTestId('editor-window-shell')).toBeTruthy();
    expect(screen.getByTestId('skeleton-editor-header')).toBeTruthy();
    expect(screen.getAllByTestId('editor-tab')).toHaveLength(1);
    expect(screen.getByTestId('skeleton-editor')).toBeTruthy();
    // header back lives in the shell, exactly once.
    expect(screen.getAllByTestId('skeleton-editor-back')).toHaveLength(1);
  });

  it('open second → strip shows both; switch changes active', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => { shellActions.openEditorTab('c-b'); });
    const tabsEls = screen.getAllByTestId('editor-tab');
    expect(tabsEls).toHaveLength(2);
    expect(tabsEls[1].getAttribute('data-active')).toBe('true');
    // switch back to first
    fireEvent.click(tabsEls[0]);
    const after = screen.getAllByTestId('editor-tab');
    expect(after[0].getAttribute('data-active')).toBe('true');
  });

  it('close × on last tab → editor closed (shell null) (DEC-WIN-08)', () => {
    renderShell();
    seed('c-a', 'A');
    act(() => { shellActions.openEditorTab('c-a'); });
    expect(screen.getByTestId('editor-window-shell')).toBeTruthy();
    fireEvent.click(screen.getByTestId('editor-tab-close'));
    expect(screen.queryByTestId('editor-window-shell')).toBeNull();
    expect(shellState.editorOpen).toBe(false);
  });

  it('back button closes all tabs', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => { shellActions.openEditorTab('c-b'); });
    fireEvent.click(screen.getByTestId('skeleton-editor-back'));
    expect(screen.queryByTestId('editor-window-shell')).toBeNull();
    expect(shellState.editorContext).toEqual({ tabs: [], activeTabId: null });
  });

  it('frozen container → Save As fork button (not Apply); fork clones + closes tab', () => {
    renderShell();
    act(() => {
      shellActions.addContainer({
        id: 'c-frozen',
        kind: 'molecule',
        name: 'LOCKED',
        sequence: 'ATGCATGCATGCATGC',
        topology: { circular: false },
        annotations: [],
        frozen: true,
      });
    });
    act(() => { shellActions.openEditorTab('c-frozen'); });
    expect(screen.getByTestId('skeleton-editor-save-as-fork')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-editor-apply')).toBeNull();
    const origPrompt = window.prompt;
    window.prompt = () => 'LOCKED-fork';
    try {
      fireEvent.click(screen.getByTestId('skeleton-editor-save-as-fork'));
    } finally {
      window.prompt = origPrompt;
    }
    // clone created, frozen tab was the only one → editor closed.
    expect(shellState.containers.some((c) => c.name === 'LOCKED-fork')).toBe(true);
    expect(shellState.editorOpen).toBe(false);
  });

  it('header trim — old per-editor header NOT inside ContainerEditorSkeleton body', () => {
    renderShell();
    seed('c-a', 'A');
    act(() => { shellActions.openEditorTab('c-a'); });
    // subtitle stays in body; apply/discard/back live only in the shell
    // header (single instance each — not duplicated in the body).
    expect(screen.getByTestId('skeleton-editor-subtitle')).toBeTruthy();
    expect(screen.getAllByTestId('skeleton-editor-apply')).toHaveLength(1);
    expect(screen.getAllByTestId('skeleton-editor-back')).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// K4 — MiniProjectCanvas
// ════════════════════════════════════════════════════════════════════
// V91 — MiniProjectCanvas стартует свёрнутым; для K4 тестов (маркеры)
// разворачиваем явно.
function expandMini() {
  const icon = screen.queryByTestId('mini-canvas-collapsed');
  if (icon) act(() => { fireEvent.click(icon); });
}
describe('K4 — MiniProjectCanvas markers + click-to-switch', () => {
  it('renders a marker per container; active container highlighted', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    expandMini();
    expect(screen.getByTestId('mini-canvas')).toBeTruthy();
    const mA = screen.getByTestId('mini-canvas-container-c-a');
    const mB = screen.getByTestId('mini-canvas-container-c-b');
    expect(mA.getAttribute('data-active')).toBe('true');
    expect(mB.getAttribute('data-active')).toBe('false');
  });

  it('click an un-opened container marker → opens a new tab (DEC-WIN-05)', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    expandMini();
    expect(shellState.editorContext.tabs).toHaveLength(1);
    fireEvent.click(screen.getByTestId('mini-canvas-container-c-b'));
    expect(shellState.editorContext.tabs).toHaveLength(2);
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-b');
  });

  it('click an already-open container marker → switches to its tab', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => { shellActions.openEditorTab('c-b'); });
    expandMini();
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-b');
    fireEvent.click(screen.getByTestId('mini-canvas-container-c-a'));
    expect(shellState.editorContext.tabs).toHaveLength(2); // no dup
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-a');
  });

  it('V81 + V91 — mini-canvas default collapsed; expand / collapse cycle works', () => {
    renderShell();
    seed('c-a', 'A');
    act(() => { shellActions.openEditorTab('c-a'); });
    // V91 — default `collapsed: true` чтобы не перекрывать правую
    // панель «Праймеры/Границы».
    expect(screen.getByTestId('mini-canvas-collapsed')).toBeTruthy();
    expect(screen.queryByTestId('mini-canvas')).toBeNull();
    // Click icon → expands.
    act(() => { fireEvent.click(screen.getByTestId('mini-canvas-collapsed')); });
    expect(screen.getByTestId('mini-canvas')).toBeTruthy();
    expect(screen.queryByTestId('mini-canvas-collapsed')).toBeNull();
    // Click collapse → back to icon.
    act(() => { fireEvent.click(screen.getByTestId('mini-canvas-collapse')); });
    expect(screen.queryByTestId('mini-canvas')).toBeNull();
    expect(screen.getByTestId('mini-canvas-collapsed')).toBeTruthy();
  });

  it('operation markers render', () => {
    renderShell();
    seed('c-a', 'A');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => {
      shellActions.opAdd({ position: { x: 400, y: 200 }, kind: 'pcr', inputs: [], commit: true });
    });
    expandMini();
    const opMarkers = screen.queryAllByTestId(/^mini-canvas-op-/);
    expect(opMarkers.length).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// K5 — useTabHotkey
// ════════════════════════════════════════════════════════════════════
describe('K5 — TAB / Shift+TAB hotkey + guards (DEC-WIN-07)', () => {
  it('TAB cycles next, Shift+TAB cycles prev', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    seed('c-c', 'C');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => { shellActions.openEditorTab('c-b'); });
    act(() => { shellActions.openEditorTab('c-c'); });
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-c');
    act(() => { fireEvent.keyDown(document.body, { key: 'Tab' }); });
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-a'); // cycle
    act(() => { fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true }); });
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-c'); // wrap back
  });

  it('TAB ignored when focus is in an editable input (guard)', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => { shellActions.openEditorTab('c-b'); });
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-b');
    // Reveal the InlineEditableTitle input and key Tab inside it.
    fireEvent.click(screen.getByTestId('importer-inline-title'));
    const input = screen.getByTestId('importer-inline-title-input');
    act(() => { fireEvent.keyDown(input, { key: 'Tab' }); });
    expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-b'); // unchanged
  });

  it('TAB ignored when a modal is open ([data-modal-open])', () => {
    renderShell();
    seed('c-a', 'A');
    seed('c-b', 'B');
    act(() => { shellActions.openEditorTab('c-a'); });
    act(() => { shellActions.openEditorTab('c-b'); });
    const modal = document.createElement('div');
    modal.setAttribute('data-modal-open', '');
    document.body.appendChild(modal);
    try {
      act(() => { fireEvent.keyDown(document.body, { key: 'Tab' }); });
      expect(deriveActiveContainerId(shellState.editorContext)).toBe('c-b');
    } finally {
      document.body.removeChild(modal);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// K6 — Persistence smoke (rehydrate → tabs restored)
// ════════════════════════════════════════════════════════════════════
describe('K6 — editor tabs persist + rehydrate (DEC-WIN-01 R5)', () => {
  it('saveSnapshot keeps editorContext.tabs + editorOpen (not stripped)', async () => {
    await clearSnapshot();
    let s = buildInitialState();
    s = withContainers(s, ['c-a', 'c-b']);
    s = skeletonReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    s = skeletonReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    expect(s.editorContext.tabs).toHaveLength(2);
    const ok = await saveSnapshot(s);
    expect(ok).toBe(true);
    const loaded = await loadSnapshot();
    expect(loaded).toBeTruthy();
    expect(loaded.editorOpen).toBe(true);
    expect(loaded.editorContext.tabs).toHaveLength(2);
    expect(loaded.editorContext.tabs.map((t) => t.containerId)).toEqual(['c-a', 'c-b']);
    await clearSnapshot();
  }, 20000);

  it('REPLACE_STATE restores tabs + active from snapshot', () => {
    let src = buildInitialState();
    src = withContainers(src, ['c-a', 'c-b']);
    src = skeletonReducer(src, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    src = skeletonReducer(src, { type: 'OPEN_EDITOR_TAB', containerId: 'c-b' });
    const snapshot = src; // would be the stripped+persisted shape

    const s1 = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snapshot });
    expect(s1.editorOpen).toBe(true);
    expect(s1.editorContext.tabs).toHaveLength(2);
    expect(deriveActiveContainerId(s1.editorContext)).toBe('c-b');
  });

  it('pre-F1 snapshot without editor keys → defaults (migration-safe)', () => {
    const legacy = { ...buildInitialState() };
    delete legacy.editorOpen;
    delete legacy.editorContext;
    const s1 = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: legacy });
    expect(s1.editorOpen).toBe(false);
    expect(s1.editorContext).toEqual({ tabs: [], activeTabId: null });
  });
});

describe('K1 — context actions exposed + useEditorTabContext derives id', () => {
  it('openEditorTab / switchNextTab / closeEditorTab wired through provider', () => {
    let captured = null;
    function Probe() {
      const actions = useSkeletonActions();
      const state = useSkeletonState();
      captured = { actions, state };
      return null;
    }
    render(
      <SkeletonProvider>
        <Probe />
      </SkeletonProvider>,
    );
    expect(typeof captured.actions.openEditorTab).toBe('function');
    expect(typeof captured.actions.closeEditorTab).toBe('function');
    expect(typeof captured.actions.switchEditorTab).toBe('function');
    expect(typeof captured.actions.switchNextTab).toBe('function');
    expect(typeof captured.actions.switchPrevTab).toBe('function');
    // legacy aliases still present
    expect(typeof captured.actions.openEditorViewOnly).toBe('function');
    expect(typeof captured.actions.closeEditor).toBe('function');
  });
});

// ════════════════════════════════════════════════════════════════════
// V68 — MiniProjectCanvas always-visible + marker labels
// ════════════════════════════════════════════════════════════════════
describe('V68 — MiniProjectCanvas always visible above editor content', () => {
  it('mini-canvas frame zIndex is raised above editor panels (≥ 40)', () => {
    renderShell();
    seed('c-a', 'A');
    act(() => { shellActions.openEditorTab('c-a'); });
    expandMini();
    const mini = screen.getByTestId('mini-canvas');
    const z = Number(mini.style.zIndex);
    expect(z).toBeGreaterThanOrEqual(40);
  });

  it('container markers carry small <text> labels (not only <title>)', () => {
    renderShell();
    seed('c-a', 'Alpha');
    seed('c-b', 'Beta');
    act(() => { shellActions.openEditorTab('c-a'); });
    expandMini();
    const labels = screen.getAllByTestId('mini-canvas-label');
    expect(labels.length).toBeGreaterThanOrEqual(2);
    const txt = labels.map((l) => l.textContent).join(' ');
    expect(txt).toContain('Alpha');
    expect(txt).toContain('Beta');
  });

  it('long container name is truncated in the marker label', () => {
    renderShell();
    seed('c-long', 'this-is-an-extremely-long-container-name-xyz');
    act(() => { shellActions.openEditorTab('c-long'); });
    expandMini();
    const labels = screen.getAllByTestId('mini-canvas-label');
    const long = labels.find((l) => l.textContent.startsWith('this-is'));
    expect(long).toBeTruthy();
    expect(long.textContent.length).toBeLessThan('this-is-an-extremely-long-container-name-xyz'.length);
    expect(long.textContent).toMatch(/…$/);
  });
});
