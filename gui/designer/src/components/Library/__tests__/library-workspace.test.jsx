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
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import LibraryWorkspace from '../LibraryWorkspace';

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

  it('topbar search input updates the shared query (reaches tree-search input)', () => {
    render(<LibraryWorkspace />);
    fireEvent.change(screen.getByTestId('library-topbar-search'), { target: { value: 'puc' } });
    expect(screen.getByTestId('tree-search').value).toBe('puc');
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
    // Active-zone primary action is «Container Window».
    expect(screen.getByTestId('library-action-containerWindow')).toBeTruthy();
  });
});
