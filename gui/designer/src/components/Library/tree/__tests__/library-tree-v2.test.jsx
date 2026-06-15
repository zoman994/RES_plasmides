/**
 * Library Tree (v2) — Sprint M-X.7a v2 K2 component tests.
 *
 * Covers the 7 new tree files:
 *   • TreeFolderRow / TreeItemRow (leaves)
 *   • LibraryZone (universal wrapper, variants)
 *   • LooseZone / ProjectZone (zone-specific)
 *   • LibraryTreeRoot (composition)
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';

import TreeFolderRow from '../TreeFolderRow';
import TreeItemRow from '../TreeItemRow';
import LibraryZone from '../LibraryZone';
import LooseZone from '../LooseZone';
import ProjectZone from '../ProjectZone';
import LibraryTreeRoot from '../LibraryTreeRoot';

async function freshDB() {
  const name = `bodgegene-tree-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

function makeContainer(over = {}) {
  return {
    id: over.id || `c-${Math.random().toString(36).slice(2)}`,
    kind: 'container', name: over.name || 'pUC19',
    tags: over.tags || [],
    addedAt: over.addedAt || new Date().toISOString(),
    payload: over.payload || { length: 2686, topology: 'circular', annotations: [] },
    zone: over.zone ?? 'loose',
    projectId: over.projectId ?? null,
    inLabStock: over.inLabStock ?? false,
    parentEntryId: over.parentEntryId ?? null,
    parentEntryHash: over.parentEntryHash ?? null,
    origin: over.origin || { kind: 'file_import' },
    ...over,
  };
}

function makePrimer(over = {}) {
  return makeContainer({ ...over, kind: 'primer', payload: over.payload || { length: 22, tm: 54.8 } });
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.looseFolders = [];
    s.workspace = { active: 'library', history: [], context: {} };
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────
describe('K2 — TreeFolderRow', () => {
  it('renders name + count and toggles on click', () => {
    const onToggle = vi.fn();
    render(<TreeFolderRow name="Backbones" count={3} expanded={false} onToggle={onToggle} testId="tf-1" />);
    const row = screen.getByTestId('tf-1');
    expect(row.getAttribute('data-expanded')).toBe('false');
    expect(screen.getByTestId('tf-1-count').textContent).toBe('3');
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('K2 — TreeItemRow', () => {
  it('renders item name + meta + origin char', () => {
    render(<TreeItemRow entry={makeContainer({ id: 'e1', name: 'pUC19' })} testId="ti-1" />);
    const row = screen.getByTestId('ti-1');
    expect(row.textContent).toMatch(/pUC19/);
    // toLocaleString('ru-RU') uses NBSP between thousands; match
    // around the whitespace.
    expect(screen.getByTestId('ti-1-meta').textContent).toMatch(/2\s686\s+bp/);
    expect(screen.getByTestId('ti-1-origin').textContent).toBe('↑');
  });

  it('selected state surfaces data-selected + accent styling', () => {
    render(<TreeItemRow entry={makeContainer({ id: 'e1' })} isSelected testId="ti-1" />);
    expect(screen.getByTestId('ti-1').getAttribute('data-selected')).toBe('true');
  });

  it('lab pool primer with inLabStock=true shows ❄ origin char', () => {
    const e = makePrimer({ id: 'pr1', zone: 'lab_pool', inLabStock: true });
    render(<TreeItemRow entry={e} testId="ti-1" />);
    expect(screen.getByTestId('ti-1-origin').textContent).toBe('❄');
  });

  it('cross_project_clone origin renders 🔗', () => {
    const e = makeContainer({ id: 'e1', origin: { kind: 'cross_project_clone' } });
    render(<TreeItemRow entry={e} testId="ti-1" />);
    expect(screen.getByTestId('ti-1-origin').textContent).toBe('🔗');
  });

  it('click invokes onSelect with entry', () => {
    const e = makeContainer({ id: 'e1' });
    const onSelect = vi.fn();
    render(<TreeItemRow entry={e} onSelect={onSelect} testId="ti-1" />);
    fireEvent.click(screen.getByTestId('ti-1'));
    expect(onSelect).toHaveBeenCalledWith(e);
  });

  // M-X.7c K5 — hover-revealed quick-add «+».
  it('quick-add «+» button absent when no active project', () => {
    useStore.setState((s) => { s.currentProjectId = null; });
    render(<TreeItemRow entry={makeContainer({ id: 'q1', projectId: null })} testId="ti-q" />);
    expect(screen.queryByTestId('ti-q-quickadd')).toBeNull();
  });

  it('quick-add «+» button absent when entry already in active project', () => {
    useStore.setState((s) => {
      s.currentProjectId = 'pa';
      s.projects = { ...s.projects, pa: { id: 'pa', name: 'Active' } };
    });
    render(<TreeItemRow entry={makeContainer({ id: 'q2', projectId: 'pa' })} testId="ti-q" />);
    expect(screen.queryByTestId('ti-q-quickadd')).toBeNull();
  });

  // FAIL-fix-pass extension — quick-delete next to quick-add.
  it('quick-delete «🗑» button is always rendered (hover-revealed); click marks pending + shows undo toast', async () => {
    useStore.setState((s) => { s.toasts = []; });
    const e = makeContainer({ id: 'qd1', name: 'pBad' });
    await useStore.getState().addLibraryEntry(e);
    render(<TreeItemRow entry={useStore.getState().libraryEntries.qd1} testId="ti-qd" />);
    const btn = screen.getByTestId('ti-qd-quickdelete');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 30));
    // Soft-delete flips _pendingDelete on the entry.
    expect(useStore.getState().libraryEntries.qd1?._pendingDelete).toBe(true);
    // Toast surfaced with onUndo callback.
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Удалено: pBad/.test(t.msg) && typeof t.onUndo === 'function')).toBe(true);
  });

  it('quick-add «+» button rendered when active project set AND entry not in it; click clones', async () => {
    useStore.setState((s) => {
      s.currentProjectId = 'pa';
      s.projects = { ...s.projects, pa: { id: 'pa', name: 'Active' } };
    });
    const e = makeContainer({ id: 'q3', projectId: null, name: 'pUC19' });
    await useStore.getState().addLibraryEntry(e);
    render(<TreeItemRow entry={useStore.getState().libraryEntries.q3} testId="ti-q" />);
    const btn = screen.getByTestId('ti-q-quickadd');
    expect(btn).toBeTruthy();
    // Default opacity 0 (hover-revealed).
    expect(btn.style.opacity).toBe('0');
    fireEvent.click(btn);
    // Microtask flush — cloneEntryToActiveProject persists to dexie.
    await new Promise((r) => setTimeout(r, 30));
    const cloned = Object.values(useStore.getState().libraryEntries)
      .filter((x) => x && x.projectId === 'pa');
    expect(cloned.length).toBeGreaterThan(0);
  });

  // V52 — quick-add must not silently duplicate; second add asks
  // Да/Нет (default Нет = no copy), force-adds only on explicit Да.
  it('V52 — re-quick-add a present entry confirms before a 2nd copy', async () => {
    useStore.setState((s) => {
      s.currentProjectId = 'pa';
      s.projects = { ...s.projects, pa: { id: 'pa', name: 'Active' } };
    });
    const e = makeContainer({
      id: 'q52', projectId: null, name: 'pUC19',
      payload: { sequence: 'AAAA', length: 4, resourceHash: 'h52' },
    });
    await useStore.getState().addLibraryEntry(e);
    render(<TreeItemRow entry={useStore.getState().libraryEntries.q52} testId="ti-v52" />);
    const btn = screen.getByTestId('ti-v52-quickadd');
    const countInPa = () => Object.values(useStore.getState().libraryEntries)
      .filter((x) => x && x.projectId === 'pa').length;

    fireEvent.click(btn); // first add
    await new Promise((r) => setTimeout(r, 30));
    expect(countInPa()).toBe(1);

    // Second add, user declines (Нет) → no duplicate. happy-dom has
    // no window.confirm — assign it directly (the impl guards on
    // typeof === 'function').
    const origConfirm = window.confirm;
    const confirmFn = vi.fn().mockReturnValue(false);
    window.confirm = confirmFn;
    try {
      fireEvent.click(btn);
      await new Promise((r) => setTimeout(r, 30));
      expect(confirmFn).toHaveBeenCalled();
      expect(countInPa()).toBe(1);

      // Third add, user accepts (Да) → forced second copy.
      confirmFn.mockReturnValue(true);
      fireEvent.click(btn);
      await new Promise((r) => setTimeout(r, 30));
      expect(countInPa()).toBe(2);
    } finally {
      window.confirm = origConfirm;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
describe('K2 — LibraryZone', () => {
  it('renders icon + title + count and applies variant data-attr', () => {
    render(<LibraryZone variant="active" icon="📦" title="ChitinaseExpr.bodge" count={12}>x</LibraryZone>);
    const z = screen.getByTestId('library-zone-active');
    expect(z.getAttribute('data-variant')).toBe('active');
    expect(z.textContent).toMatch(/ChitinaseExpr.bodge/);
  });

  it('toggles expanded → children render only when expanded', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <LibraryZone variant="loose" icon="⚐" title="Без проекта" expanded={false} onToggle={onToggle}>
        <div data-testid="zone-body">body</div>
      </LibraryZone>,
    );
    expect(screen.queryByTestId('zone-body')).toBeNull();
    rerender(
      <LibraryZone variant="loose" icon="⚐" title="Без проекта" expanded onToggle={onToggle}>
        <div data-testid="zone-body">body</div>
      </LibraryZone>,
    );
    expect(screen.getByTestId('zone-body')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('K2 — LooseZone (post 09.05.2026 structural sub-folders)', () => {
  it('shows Контейнеры/Праймеры sub-folders; containers open by default, primers collapsed', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19', zone: 'loose' }));
    await useStore.getState().addLibraryEntry(makePrimer({ id: 'pr1', name: 'M13F', zone: 'loose' }));
    render(<LooseZone />);
    // Structural sub-folder rows always present.
    expect(screen.getByTestId('tree-folder-loose-containers')).toBeTruthy();
    expect(screen.getByTestId('tree-folder-loose-primers')).toBeTruthy();
    // Контейнеры open by default → container visible.
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
    // Праймеры collapsed by default → primer not visible until toggled.
    expect(screen.queryByTestId('tree-item-loose-pr1')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-folder-loose-primers'));
    expect(screen.getByTestId('tree-item-loose-pr1')).toBeTruthy();
  });

  it('respects query filter (case-insensitive substring)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19', zone: 'loose' }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', name: 'pET28b', zone: 'loose' }));
    render(<LooseZone query="puc" />);
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
    expect(screen.queryByTestId('tree-item-loose-e2')).toBeNull();
  });

  it('«📁+» header button creates a user folder via createLooseFolder', () => {
    const origPrompt = window.prompt;
    window.prompt = () => 'Backbones';
    try {
      render(<LooseZone />);
      fireEvent.click(screen.getByTestId('loose-zone-add-folder-btn'));
    } finally {
      window.prompt = origPrompt;
    }
    expect(useStore.getState().looseFolders).toContain('Backbones');
    // Folder row appears in the tree (auto-opened on creation).
    expect(screen.getByTestId('tree-folder-loose-user-Backbones')).toBeTruthy();
  });

  it('entries with matching folderPath nest inside that folder; rootless stay flat', async () => {
    useStore.getState().createLooseFolder('Backbones');
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e1', name: 'pUC19', folderPath: 'Backbones', zone: 'loose',
    }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e2', name: 'rootless', zone: 'loose',
    }));
    render(<LooseZone />);
    // Folder row visible; entry inside it not until folder opens.
    expect(screen.getByTestId('tree-folder-loose-user-Backbones')).toBeTruthy();
    expect(screen.queryByTestId('tree-item-loose-e1')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-folder-loose-user-Backbones'));
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
    // Rootless entry is visible flat under Контейнеры (open by default).
    expect(screen.getByTestId('tree-item-loose-e2')).toBeTruthy();
  });

  it('does NOT auto-derive folders from entry.tags (tags are descriptive labels, not paths)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e1', name: 'pUC19', tags: ['bacterial', 'cloning', 'AmpR'], zone: 'loose',
    }));
    render(<LooseZone />);
    // No phantom folder rows for the descriptive tags.
    expect(screen.queryByTestId('tree-folder-loose-user-bacterial')).toBeNull();
    expect(screen.queryByTestId('tree-folder-loose-user-AmpR')).toBeNull();
    // Entry surfaces flat under Контейнеры.
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
  });

  it('auto-materialises folder rows for entries whose folderPath has no matching looseFolders entry', async () => {
    // SnapGene Demo import writes `folderPath: 'Demo / Bacterial'` but
    // never adds the path to looseFolders — entries must still be
    // visible (regression: 190 entries vanished from the tree).
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e1', name: 'pUC19', folderPath: 'Demo / Bacterial', zone: 'loose',
    }));
    render(<LooseZone />);
    // Folder row appears at the normalised (no-space) path.
    expect(screen.getByTestId('tree-folder-loose-user-Demo')).toBeTruthy();
    // Open Demo, then Demo/Bacterial → entry is visible.
    fireEvent.click(screen.getByTestId('tree-folder-loose-user-Demo'));
    fireEvent.click(screen.getByTestId('tree-folder-loose-user-Demo/Bacterial'));
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('K2 — ProjectZone (post M-X.7c K4 — DAG removed, [active] gated on currentProjectId)', () => {
  it('shows Контейнеры / Праймеры sub-folders only (DAG dropped per DEC-UIRREV-DAG-NOT-FOLDER-01)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'c1', name: 'pET28b', projectId: 'pa',
    }));
    await useStore.getState().addLibraryEntry(makePrimer({
      id: 'pr1', name: 'M13F', projectId: 'pa',
    }));
    render(<ProjectZone project={{ id: 'pa', name: 'ChitinaseExpr' }} />);
    expect(screen.getByTestId('tree-folder-containers-pa')).toBeTruthy();
    expect(screen.queryByTestId('tree-folder-dag-pa')).toBeNull();
    expect(screen.getByTestId('tree-folder-primers-pa')).toBeTruthy();
    // Контейнеры open by default → container row visible.
    expect(screen.getByTestId('tree-item-project-c1')).toBeTruthy();
    // Праймеры closed by default → primer row NOT visible until toggled.
    expect(screen.queryByTestId('tree-item-project-pr1')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-folder-primers-pa'));
    expect(screen.getByTestId('tree-item-project-pr1')).toBeTruthy();
  });

  it('renders the «active» pill ONLY when currentProjectId matches this project', () => {
    useStore.setState((s) => { s.currentProjectId = 'pa'; });
    render(<ProjectZone project={{ id: 'pa', name: 'Active' }} />);
    const za = screen.getByTestId('library-zone-project-pa');
    expect(za.getAttribute('data-variant')).toBe('active');
    expect(screen.getByTestId('library-zone-project-pa-pill').textContent).toMatch(/active/);
    cleanup();
    // Different project — no pill.
    render(<ProjectZone project={{ id: 'pb', name: 'Inactive' }} />);
    expect(screen.queryByTestId('library-zone-project-pb-pill')).toBeNull();
  });

  it('shows no pill when no active project is set', () => {
    useStore.setState((s) => { s.currentProjectId = null; });
    render(<ProjectZone project={{ id: 'px', name: 'Anything' }} />);
    expect(screen.queryByTestId('library-zone-project-px-pill')).toBeNull();
  });

  it('only includes entries with matching projectId', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'a', name: 'in-pa', projectId: 'pa',
    }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'b', name: 'in-pb', projectId: 'pb',
    }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'c', name: 'loose', projectId: null,
    }));
    render(<ProjectZone project={{ id: 'pa', name: 'X' }} />);
    expect(screen.getByTestId('tree-item-project-a')).toBeTruthy();
    expect(screen.queryByTestId('tree-item-project-b')).toBeNull();
    expect(screen.queryByTestId('tree-item-project-c')).toBeNull();
  });

  it('header «⤓» button invokes onExportProject(projectId)', () => {
    const onExport = vi.fn();
    render(<ProjectZone project={{ id: 'pa', name: 'X' }} onExportProject={onExport} />);
    fireEvent.click(screen.getByTestId('project-zone-export-pa'));
    expect(onExport).toHaveBeenCalledWith('pa');
  });
});

// LabPoolZone deleted in M-X.7c K4 — Lab pool returns later as a
// global View, not a Tree zone (DEC-UIRREV-ZONES-MERGE-01).

// ─────────────────────────────────────────────────────────────────
describe('M-X.8 K4 — LibraryTreeRoot project grouping', () => {
  beforeEach(() => {
    useStore.setState((s) => {
      s.projects = {
        pa: { id: 'pa', name: 'Active', containerIds: [] },
        pb: { id: 'pb', name: 'Pinned', containerIds: [] },
        pc: { id: 'pc', name: 'Other-1', containerIds: [] },
        pd: { id: 'pd', name: 'Other-2', containerIds: [] },
      };
      s.pinnedProjectIds = ['pb'];
      s.currentProjectId = 'pa';
    });
  });

  it('pinned projects + current (not pinned) shown top-level; others under «Все проекты (N)»', () => {
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('library-zone-project-pb')).toBeTruthy();      // pinned
    expect(screen.getByTestId('library-zone-project-pa')).toBeTruthy();      // current (not pinned)
    expect(screen.getByTestId('tree-all-projects-group')).toBeTruthy();      // collapsible group
    // Others (pc, pd) are NOT mounted until the group expands.
    expect(screen.queryByTestId('library-zone-project-pc')).toBeNull();
    expect(screen.queryByTestId('library-zone-project-pd')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-all-projects-group'));
    expect(screen.getByTestId('library-zone-project-pc')).toBeTruthy();
    expect(screen.getByTestId('library-zone-project-pd')).toBeTruthy();
  });

  it('search filters project nodes by name + auto-expands «Все проекты» (focusSearch quick-find)', () => {
    render(<LibraryTreeRoot query="Other-1" />);
    // «Все проекты» auto-expands under a query → only the name match (pc) shows.
    expect(screen.getByTestId('library-zone-project-pc')).toBeTruthy();
    expect(screen.queryByTestId('library-zone-project-pd')).toBeNull();
    // Non-matching current (pa «Active») + pinned (pb «Pinned») are hidden.
    expect(screen.queryByTestId('library-zone-project-pa')).toBeNull();
    expect(screen.queryByTestId('library-zone-project-pb')).toBeNull();
  });

  it('search keeps a project visible when it contains a matching ENTRY (entry-search preserved)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e-find', name: 'GFP-findme', projectId: 'pd' }));
    render(<LibraryTreeRoot query="findme" />);
    expect(screen.getByTestId('library-zone-project-pd')).toBeTruthy(); // matched by entry name
    expect(screen.queryByTestId('library-zone-project-pc')).toBeNull(); // no match
  });

  it('project pin toggle button pins / unpins (project hub)', () => {
    render(<LibraryTreeRoot />);
    // pa is current + not pinned (☆) → click pins it.
    fireEvent.click(screen.getByTestId('project-zone-pin-pa'));
    expect(useStore.getState().pinnedProjectIds).toContain('pa');
    // pb is pinned (★) → click unpins it.
    fireEvent.click(screen.getByTestId('project-zone-pin-pb'));
    expect(useStore.getState().pinnedProjectIds).not.toContain('pb');
  });

  it('project activate button makes a non-current project current (header click stays expand-only)', () => {
    render(<LibraryTreeRoot />);
    // current project (pa) has no activate button; a non-current pinned one (pb) does.
    expect(screen.queryByTestId('project-zone-activate-pa')).toBeNull();
    fireEvent.click(screen.getByTestId('project-zone-activate-pb'));
    expect(useStore.getState().currentProjectId).toBe('pb');
  });

  it('project open-in-Flow button activates + switches to the flow workspace', () => {
    render(<LibraryTreeRoot />);
    fireEvent.click(screen.getByTestId('project-zone-open-flow-pb'));
    expect(useStore.getState().currentProjectId).toBe('pb');
    expect(useStore.getState().workspace.active).toBe('flow');
  });

  it('only the current project is expanded by default; siblings start collapsed', () => {
    render(<LibraryTreeRoot />);
    // Current (pa) → expanded → its container sub-folder row is in DOM.
    expect(screen.getByTestId('library-zone-project-pa').getAttribute('data-expanded')).toBe('true');
    // Pinned but not current (pb) → collapsed.
    expect(screen.getByTestId('library-zone-project-pb').getAttribute('data-expanded')).toBe('false');
  });

  it('click on a non-current project header EXPANDS only — does NOT activate (post 11.05.2026 UX iteration)', () => {
    render(<LibraryTreeRoot />);
    // pb starts collapsed (it is pinned but not current).
    expect(screen.getByTestId('library-zone-project-pb').getAttribute('data-expanded')).toBe('false');
    fireEvent.click(screen.getByTestId('library-zone-project-pb-head'));
    // currentProjectId stays pa — click is expand-only.
    expect(useStore.getState().currentProjectId).toBe('pa');
    expect(screen.getByTestId('library-zone-project-pb').getAttribute('data-expanded')).toBe('true');
    // pa stays expanded (it's still current).
    expect(screen.getByTestId('library-zone-project-pa').getAttribute('data-expanded')).toBe('true');
  });

  it('click on the current project header just collapses (does not deactivate)', () => {
    render(<LibraryTreeRoot />);
    fireEvent.click(screen.getByTestId('library-zone-project-pa-head'));
    expect(useStore.getState().currentProjectId).toBe('pa');
    expect(screen.getByTestId('library-zone-project-pa').getAttribute('data-expanded')).toBe('false');
  });

  it('click on a project under the «Все проекты» group EXPANDS without activating', () => {
    render(<LibraryTreeRoot />);
    fireEvent.click(screen.getByTestId('tree-all-projects-group'));
    fireEvent.click(screen.getByTestId('library-zone-project-pc-head'));
    expect(useStore.getState().currentProjectId).toBe('pa'); // unchanged
    expect(screen.getByTestId('library-zone-project-pc').getAttribute('data-expanded')).toBe('true');
  });

  it('pinned project shows ★ marker; non-pinned does not', () => {
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('project-zone-pin-star-pb')).toBeTruthy();
    expect(screen.queryByTestId('project-zone-pin-star-pa')).toBeNull();
  });

  // FAIL-fix-pass 2 — current project always first, regardless of pin status.
  it('current project (NOT pinned) renders BEFORE the pinned list', () => {
    useStore.setState((s) => {
      s.projects = {
        X: { id: 'X', name: 'CurrentNotPinned', containerIds: [] },
        Y: { id: 'Y', name: 'PinY', containerIds: [] },
        Z: { id: 'Z', name: 'PinZ', containerIds: [] },
      };
      s.pinnedProjectIds = ['Y', 'Z'];
      s.currentProjectId = 'X';
    });
    const { container } = render(<LibraryTreeRoot />);
    // Restrict to root zone elements (exclude `-head` / `-pill` etc.).
    const zones = Array.from(container.querySelectorAll('[data-testid^="library-zone-project-"]'))
      .filter((el) => /^library-zone-project-[^-]+$/.test(el.getAttribute('data-testid')));
    const ids = zones.map((el) => el.getAttribute('data-testid').replace('library-zone-project-', ''));
    expect(ids).toEqual(['X', 'Y', 'Z']);
  });

  it('Loose zone «⎀ БЕЗ ПРОЕКТА» sits BELOW the current project (post 11.05.2026 reorder)', () => {
    useStore.setState((s) => {
      s.projects = { X: { id: 'X', name: 'Current', containerIds: [] } };
      s.pinnedProjectIds = [];
      s.currentProjectId = 'X';
    });
    const { container } = render(<LibraryTreeRoot />);
    // Walk all top-level zone roots in document order.
    const tops = Array.from(container.querySelectorAll(
      '[data-testid="library-zone-loose"], [data-testid^="library-zone-project-"]',
    )).filter((el) => /^library-zone-(loose|project-[^-]+)$/.test(el.getAttribute('data-testid')));
    const order = tops.map((el) => el.getAttribute('data-testid'));
    // Current project FIRST, loose desk SECOND.
    expect(order).toEqual(['library-zone-project-X', 'library-zone-loose']);
  });

  it('current project (PINNED) still renders first, but only once (no duplicate)', () => {
    useStore.setState((s) => {
      s.projects = {
        Y: { id: 'Y', name: 'PinYIsCurrent', containerIds: [] },
        Z: { id: 'Z', name: 'PinZ', containerIds: [] },
      };
      s.pinnedProjectIds = ['Y', 'Z'];
      s.currentProjectId = 'Y';
    });
    const { container } = render(<LibraryTreeRoot />);
    const zones = Array.from(container.querySelectorAll('[data-testid^="library-zone-project-"]'))
      .filter((el) => /^library-zone-project-[^-]+$/.test(el.getAttribute('data-testid')));
    const ids = zones.map((el) => el.getAttribute('data-testid').replace('library-zone-project-', ''));
    // Y appears exactly once (as current/first), Z follows.
    expect(ids).toEqual(['Y', 'Z']);
  });
});

describe('K2 — LibraryTreeRoot', () => {
  it('renders tree-head + Loose zone + tree-foot (LabPool removed in 09.05.2026 refresh)', () => {
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('tree-head')).toBeTruthy();
    expect(screen.getByTestId('tree-body')).toBeTruthy();
    expect(screen.getByTestId('tree-foot')).toBeTruthy();
    expect(screen.getByTestId('library-zone-loose')).toBeTruthy();
    // Lab pool no longer in tree per spec — it returns later as a View.
    expect(screen.queryByTestId('library-zone-lab')).toBeNull();
    expect(screen.getByTestId('tree-add-btn')).toBeTruthy();
  });

  it('+ Добавить button click invokes onAddClick', () => {
    const onAdd = vi.fn();
    render(<LibraryTreeRoot onAddClick={onAdd} />);
    fireEvent.click(screen.getByTestId('tree-add-btn'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('+ Проект button shows only when onCreateProject is wired + invokes it', () => {
    const { unmount } = render(<LibraryTreeRoot />);
    expect(screen.queryByTestId('tree-add-project-btn')).toBeNull();
    unmount();
    const onCreateProject = vi.fn();
    render(<LibraryTreeRoot onCreateProject={onCreateProject} />);
    fireEvent.click(screen.getByTestId('tree-add-project-btn'));
    expect(onCreateProject).toHaveBeenCalled();
  });

  it('search input forwards value to onQueryChange', () => {
    const onQ = vi.fn();
    render(<LibraryTreeRoot query="" onQueryChange={onQ} />);
    fireEvent.change(screen.getByTestId('tree-search'), { target: { value: 'puc' } });
    expect(onQ).toHaveBeenCalledWith('puc');
  });

  it('discovers project zones from state.projects (post M-X.8 K4 — non-current non-pinned project lives under «Все проекты» group)', async () => {
    useStore.setState((s) => {
      s.currentProjectId = 'pa';
      s.projects = {
        pa: { id: 'pa', name: 'Active', containerIds: ['a1'] },
        pb: { id: 'pb', name: 'Foreign', containerIds: ['b1'] },
      };
    });
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'a1', projectId: 'pa',
    }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'b1', projectId: 'pb',
    }));
    render(<LibraryTreeRoot />);
    // Current project is at top level.
    expect(screen.getByTestId('library-zone-project-pa')).toBeTruthy();
    // Foreign project lives under the collapsed «Все проекты» group.
    expect(screen.queryByTestId('library-zone-project-pb')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-all-projects-group'));
    expect(screen.getByTestId('library-zone-project-pb')).toBeTruthy();
  });

  it('orphan projectId entries fall back to Loose (project not in state.projects)', async () => {
    // Entry references a non-existent project — must not vanish, must
    // surface in Loose so biolog can re-link or delete it.
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'orphan1', name: 'orphan', projectId: 'deleted-pid',
    }));
    render(<LibraryTreeRoot />);
    // No phantom project zone for the orphan.
    expect(screen.queryByTestId('library-zone-project-deleted-pid')).toBeNull();
    // Entry surfaces in Loose instead.
    expect(screen.getByTestId('tree-item-loose-orphan1')).toBeTruthy();
  });

  it('legacy entries linked via project.containerIds (no entry.projectId) surface in the project zone', async () => {
    useStore.setState((s) => {
      s.projects = {
        pa: { id: 'pa', name: 'Legacy', containerIds: ['legacy1'] },
      };
      // M-X.8 K4: ProjectZone is only top-level + auto-expanded
      // when it is the current project (or pinned). Make pa current
      // so its entries are in the DOM by default.
      s.currentProjectId = 'pa';
    });
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'legacy1', name: 'pUC19',
      // projectId left null — entry knows nothing about the project,
      // but the project's containerIds claims it (legacy import flow).
    }));
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('tree-item-project-legacy1')).toBeTruthy();
    // Loose does NOT also show it.
    expect(screen.queryByTestId('tree-item-loose-legacy1')).toBeNull();
  });

  it('displays total entries count in tree-foot', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', zone: 'loose' }));
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('tree-foot').textContent).toMatch(/2 entries/);
  });
});

// ─────────────────────────────────────────────────────────────────
// V115 — soft-deleted (pending-delete) pinned/current projects must drop out
// of the tree, same as un-pinned ones (which `discoverProjects` already
// filters). The 🗑 button flips `_pendingDelete`; before the fix the `current`
// and `pinnedRest` branches of the `groups` memo read straight from
// `projectsById` without the filter, so the project stayed visible.
describe('V115 — soft-deleted pinned/current projects excluded from tree', () => {
  it('pinned project with _pendingDelete is NOT rendered; a live pinned one still is', () => {
    useStore.setState((s) => {
      s.projects = {
        pa: { id: 'pa', name: 'Active', containerIds: [] },
        pb: { id: 'pb', name: 'PinnedLive', containerIds: [] },
        pdel: { id: 'pdel', name: 'PinnedDeleted', containerIds: [], _pendingDelete: true },
      };
      s.pinnedProjectIds = ['pb', 'pdel'];
      s.currentProjectId = 'pa';
    });
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('library-zone-project-pb')).toBeTruthy();
    expect(screen.queryByTestId('library-zone-project-pdel')).toBeNull();
  });

  it('current project with _pendingDelete is NOT rendered', () => {
    useStore.setState((s) => {
      s.projects = {
        pcur: { id: 'pcur', name: 'CurrentDeleted', containerIds: [], _pendingDelete: true },
      };
      s.pinnedProjectIds = [];
      s.currentProjectId = 'pcur';
    });
    render(<LibraryTreeRoot />);
    expect(screen.queryByTestId('library-zone-project-pcur')).toBeNull();
  });

  it('regression: a live current project still renders', () => {
    useStore.setState((s) => {
      s.projects = { plive: { id: 'plive', name: 'CurrentLive', containerIds: [] } };
      s.pinnedProjectIds = [];
      s.currentProjectId = 'plive';
    });
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('library-zone-project-plive')).toBeTruthy();
  });
});
