/**
 * LibraryWorkspace + LibraryTopBar — Sprint M-X.7a v2 K4
 * integration tests.
 *
 * Asserts:
 *   1. Empty state CTA renders when libraryEntries is empty
 *   2. NoSelection placeholder renders when entries exist but
 *      none selected
 *   3. Tree item click → Inspector mounts with the selected entry
 *   4. Search query in topbar reaches the tree filter
 *   5. Breadcrumb reflects active project (or «Без активного проекта»)
 *   6. Action-row mounts under Inspector with the right zone
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { resetDBForTests } from '../../../db/dexie-schema';
import LibraryWorkspace from '../LibraryWorkspace';
import { queueImporterFiles, peekImporterFiles } from '../lib/pending-files';

// LibrarySingleInspector mounts SequenceView + Annotator under
// lazy tabs; for a workspace mount-and-select integration test we
// only care that Inspector receives `item` correctly. Stub the
// heavy inspector body with a marker that surfaces item.id +
// activeTab so we can assert wiring without paying the
// SequenceView render cost.
vi.mock('../inspector/LibrarySingleInspector', () => ({
  default: ({ item, activeTab }) => (
    <div
      data-testid="single-inspector-stub"
      data-item-id={item?.id || ''}
      data-active-tab={activeTab || 'overview'}
    >inspector</div>
  ),
}));
// OnboardingNudge has its own dismissed-localStorage logic — stub
// to a stable presence/absence marker.
vi.mock('../onboarding/OnboardingNudge', () => ({
  default: () => <div data-testid="onboarding-nudge">onboarding</div>,
}));
// CommonFeaturesPanel loads the factory DB via fetch + has its own test;
// stub it so the view-swap test stays focused on LibraryWorkspace wiring.
vi.mock('../CommonFeaturesPanel', () => ({
  default: () => <div data-testid="common-features-panel-stub">common</div>,
}));

async function freshDB() {
  const name = `bodgegene-ws-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

function makeContainer(over = {}) {
  return {
    id: over.id || `c-${Math.random().toString(36).slice(2)}`,
    kind: 'container',
    name: over.name || 'pUC19',
    tags: over.tags || [],
    addedAt: over.addedAt || new Date().toISOString(),
    payload: over.payload || { length: 2686, topology: 'circular', annotations: [] },
    zone: over.zone ?? 'loose',
    projectId: over.projectId ?? null,
    inLabStock: over.inLabStock ?? false,
    parentEntryId: null,
    parentEntryHash: null,
    origin: over.origin || { kind: 'file_import' },
    ...over,
  };
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.looseFolders = [];
    s.workspace = { active: 'library', history: [], context: {} };
    s.currentProjectId = null;
    s.projects = s.projects || {};
  });
});
afterEach(cleanup);
// Дубль «+ Проект» скрыт по умолчанию (dedupeCreateProject); тесты ниже
// тестируют его flow на rollback-пути — восстанавливаем флаг после каждого.
afterEach(() => { FEATURE_FLAGS.dedupeCreateProject = true; });

describe('M-X.7a v2 K4 — LibraryWorkspace', () => {
  it('renders the empty-state CTA when no entries exist', () => {
    const onAdd = vi.fn();
    render(<LibraryWorkspace onAddClick={onAdd} />);
    expect(screen.getByTestId('library-workspace-empty')).toBeTruthy();
    expect(screen.getByTestId('library-workspace-empty-add')).toBeTruthy();
    expect(screen.getByTestId('onboarding-nudge')).toBeTruthy();
    fireEvent.click(screen.getByTestId('library-workspace-empty-add'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('drains DAG-dropped pending files on mount (A24 — were silently lost)', () => {
    const f = new File(['>x\nACGT'], 'x.fasta', { type: 'text/plain' });
    queueImporterFiles([f]);
    render(<LibraryWorkspace />);
    // the mount effect drained the queue; before the fix nothing consumed it.
    expect(peekImporterFiles()).toHaveLength(0);
  });

  it('opens the AddModal when navigated with context.openAdd (A23 — Sidebar «Импорт»)', () => {
    useStore.setState((s) => { s.workspace = { active: 'library', history: [], context: { openAdd: true } }; });
    render(<LibraryWorkspace />);
    expect(screen.getByTestId('add-modal')).toBeTruthy();
  });

  it('renders NoSelection placeholder when entries exist but none picked', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    render(<LibraryWorkspace />);
    expect(screen.getByTestId('library-workspace-no-selection')).toBeTruthy();
    expect(screen.queryByTestId('single-inspector-stub')).toBeNull();
  });

  it('clicking a tree item mounts the Inspector with that entry + action-row', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e1', name: 'pUC19', zone: 'loose',
    }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    const ins = screen.getByTestId('single-inspector-stub');
    expect(ins.getAttribute('data-item-id')).toBe('e1');
    const row = screen.getByTestId('library-action-row');
    expect(row.getAttribute('data-zone')).toBe('loose');
    expect(row.getAttribute('data-kind')).toBe('container');
  });

  it('focusSearch context (Все проекты / ⌘P redirect) focuses the tree search input', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    useStore.setState((s) => { s.workspace = { active: 'library', history: [], context: { focusSearch: true } }; });
    render(<LibraryWorkspace />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('tree-search')));
  });

  it('«+ Проект» in the tree creates a project + opens the info modal (project hub)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    useStore.setState((s) => { s.projects = {}; s.currentProjectId = null; });
    FEATURE_FLAGS.dedupeCreateProject = false; // показать дубль «+ Проект» для теста его flow
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-add-project-btn'));
    await waitFor(() => {
      expect(Object.keys(useStore.getState().projects || {}).length).toBe(1);
      expect(useStore.getState().modals.projectInfo).toBe(true);
    });
  });

  it('«+ Проект» creates a NEW project with a unique name (no same-name collision)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'Новый проект', containerIds: [], projectCommitIds: [], primerIds: [], tags: [], description: '' } };
      s.currentProjectId = 'p1';
    });
    FEATURE_FLAGS.dedupeCreateProject = false; // показать дубль «+ Проект» для теста его flow
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-add-project-btn'));
    await waitFor(() => expect(Object.keys(useStore.getState().projects).length).toBe(2));
    const names = Object.values(useStore.getState().projects).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length); // all distinct — no «нельзя с тем же именем»
    expect(names).toContain('Новый проект 2'); // auto-suffixed
  });

  it('«+ Проект» — the prior project stays visible in the flat list (not overwritten)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'MyVector', containerIds: [], projectCommitIds: [], primerIds: [], tags: [], description: '' } };
      s.currentProjectId = 'p1';
    });
    FEATURE_FLAGS.dedupeCreateProject = false; // показать дубль «+ Проект» для теста его flow
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-add-project-btn'));
    await waitFor(() => expect(Object.keys(useStore.getState().projects).length).toBe(2));
    // Prior project still in the flat list — nothing buried or overwritten.
    expect(screen.getByTestId('library-zone-project-p1')).toBeTruthy();
  });

  it('the global top-bar search and the tree quick-filter are INDEPENDENT (K5 split — no shared query)', () => {
    // REV#2 Stage 3 K5 reverses SEARCH-UNIFY: the tree keeps its own `treeQuery` and the bar
    // owns a separate structured `globalSearch`. Typing in one must NOT leak into the other
    // (§9.4). The only bridge is the tree's «Полный поиск» escalation (a seed, not a live sync).
    render(<LibraryWorkspace />);
    const topbarInput = screen.getByTestId('library-topbar-search-input');
    const treeInput = screen.getByTestId('tree-search');
    fireEvent.change(treeInput, { target: { value: 'puc' } });
    expect(treeInput.value).toBe('puc');
    expect(topbarInput.value).toBe(''); // global bar untouched by the tree filter
    fireEvent.change(topbarInput, { target: { value: 'gfp' } });
    expect(topbarInput.value).toBe('gfp');
    expect(treeInput.value).toBe('puc'); // tree filter untouched by the global bar
  });

  it('closes the global-search popup after Enter opens the selected molecule', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'search-e1', name: 'pUC19-search-target', zone: 'loose',
    }));
    render(<LibraryWorkspace />);
    const input = screen.getByTestId('library-topbar-search-input');
    fireEvent.change(input, { target: { value: 'pUC19-search' } });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));

    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('single-inspector-stub').getAttribute('data-item-id')).toBe('search-e1'));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('breadcrumb says «Без активного проекта» when currentProjectId is null', () => {
    render(<LibraryWorkspace />);
    expect(screen.getByTestId('library-topbar-no-project')).toBeTruthy();
  });

  it('breadcrumb shows active project name; saved pill rendered separately in the right tray (M-X.8 K5)', () => {
    useStore.setState((s) => {
      s.currentProjectId = 'p1';
      s.projects = { ...(s.projects || {}), p1: { id: 'p1', name: 'ChitinaseExpr' } };
    });
    render(<LibraryWorkspace />);
    expect(screen.getByTestId('library-topbar-project-name').textContent).toMatch(/ChitinaseExpr/);
    // Pill no longer inside the breadcrumb; still rendered as a sibling node.
    expect(screen.getByTestId('library-topbar-saved-pill')).toBeTruthy();
  });

  it('clicking the Common-фичи tree node swaps the right panel to CommonFeaturesPanel', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19', zone: 'loose' }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-common-features'));
    expect(screen.getByTestId('common-features-panel-stub')).toBeTruthy();
    expect(screen.queryByTestId('single-inspector-stub')).toBeNull();
    expect(screen.getByTestId('tree-common-features').getAttribute('aria-pressed')).toBe('true');
  });

  it('entry → common → entry preserves the selected entry (Risk #5)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19', zone: 'loose' }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    expect(screen.getByTestId('single-inspector-stub').getAttribute('data-item-id')).toBe('e1');
    fireEvent.click(screen.getByTestId('tree-common-features'));
    expect(screen.getByTestId('common-features-panel-stub')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    expect(screen.getByTestId('single-inspector-stub').getAttribute('data-item-id')).toBe('e1');
  });

  it('selecting an active_bodge entry surfaces the active-zone action-row', async () => {
    useStore.setState((s) => {
      s.currentProjectId = 'pa';
      s.projects = { pa: { id: 'pa', name: 'X', containerIds: [] } };
    });
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'a1', projectId: 'pa', name: 'pET28b-Chit',
    }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-project-a1'));
    const row = screen.getByTestId('library-action-row');
    expect(row.getAttribute('data-zone')).toBe('active_bodge');
    // Active-zone working actions (Container Window / DAG stubs removed 17.06.2026).
    expect(screen.getByTestId('library-action-extractToLoose')).toBeTruthy();
    expect(screen.getByTestId('library-action-delete')).toBeTruthy();
  });
});
