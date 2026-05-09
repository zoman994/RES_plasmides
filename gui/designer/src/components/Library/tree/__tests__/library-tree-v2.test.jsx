/**
 * Library Tree (v2) — Sprint M-X.7a v2 K2 component tests.
 *
 * Covers the 7 new tree files:
 *   • TreeFolderRow / TreeItemRow (leaves)
 *   • LibraryZone (universal wrapper, variants)
 *   • LooseZone / ProjectZone / LabPoolZone (zone-specific)
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
import LabPoolZone from '../LabPoolZone';
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
describe('K2 — LooseZone', () => {
  it('renders loose entries (root + folder-grouped)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e1', name: 'pUC19', tags: ['Backbones'], zone: 'loose',
    }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'e2', name: 'linear-fragment', tags: [], zone: 'loose',
    }));
    render(<LooseZone />);
    // Root entry visible.
    expect(screen.getByTestId('tree-item-loose-e2')).toBeTruthy();
    // Folder collapsed by default — entry not visible until folder opened.
    expect(screen.queryByTestId('tree-item-loose-e1')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-folder-loose-Backbones'));
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
  });

  it('respects query filter (case-insensitive substring)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19', zone: 'loose' }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', name: 'pET28b', zone: 'loose' }));
    render(<LooseZone query="puc" />);
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
    expect(screen.queryByTestId('tree-item-loose-e2')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('K2 — ProjectZone (post 09.05.2026 minimum-pass refresh)', () => {
  it('renders flat list of all entries with the projectId (no DAG / Containers / Primers folders)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'c1', name: 'pET28b', projectId: 'pa',
    }));
    await useStore.getState().addLibraryEntry(makePrimer({
      id: 'pr1', name: 'M13F', projectId: 'pa',
    }));
    render(<ProjectZone project={{ id: 'pa', name: 'ChitinaseExpr' }} />);
    // Flat container + primer rows, no folder/DAG sub-rows.
    expect(screen.getByTestId('tree-item-project-c1')).toBeTruthy();
    expect(screen.getByTestId('tree-item-project-pr1')).toBeTruthy();
    expect(screen.queryByTestId('tree-subrow-dag-pa')).toBeNull();
    expect(screen.queryByTestId('tree-folder-containers-pa')).toBeNull();
    expect(screen.queryByTestId('tree-folder-primers-pa')).toBeNull();
  });

  it('always renders as «active» variant (no readonly/lab paths in this pass)', () => {
    render(<ProjectZone project={{ id: 'pb', name: 'Borrowed' }} />);
    const z = screen.getByTestId('library-zone-project-pb');
    expect(z.getAttribute('data-variant')).toBe('active');
    const pill = screen.getByTestId('library-zone-project-pb-pill');
    expect(pill.textContent).toMatch(/active/);
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
});

// ─────────────────────────────────────────────────────────────────
describe('K2 — LabPoolZone', () => {
  it('splits primers into В лаборатории + Из чужих проектов', async () => {
    await useStore.getState().addLibraryEntry(makePrimer({
      id: 'p1', name: 'M13F-stock', zone: 'lab_pool', inLabStock: true,
    }));
    await useStore.getState().addLibraryEntry(makePrimer({
      id: 'p2', name: 'cross-pr', zone: 'lab_pool', inLabStock: false, projectId: 'foreign',
    }));
    render(<LabPoolZone />);
    // В лаборатории open by default.
    expect(screen.getByTestId('tree-item-lab-p1')).toBeTruthy();
    // Из чужих проектов collapsed by default.
    expect(screen.queryByTestId('tree-item-lab-p2')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-folder-lab-cross'));
    expect(screen.getByTestId('tree-item-lab-p2')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────
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

  it('search input forwards value to onQueryChange', () => {
    const onQ = vi.fn();
    render(<LibraryTreeRoot query="" onQueryChange={onQ} />);
    fireEvent.change(screen.getByTestId('tree-search'), { target: { value: 'puc' } });
    expect(onQ).toHaveBeenCalledWith('puc');
  });

  it('discovers project zones from state.projects (post 09.05.2026 refresh — orphan projectIds fall to Loose)', async () => {
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
    expect(screen.getByTestId('library-zone-project-pa')).toBeTruthy();
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
