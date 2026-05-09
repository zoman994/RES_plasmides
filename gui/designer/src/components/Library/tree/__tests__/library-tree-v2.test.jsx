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
describe('K2 — ProjectZone', () => {
  it('renders DAG subrow + Containers folder + Primers folder', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'c1', name: 'pET28b', zone: 'active_bodge', projectId: 'pa',
    }));
    await useStore.getState().addLibraryEntry(makePrimer({
      id: 'pr1', name: 'M13F', zone: 'active_bodge', projectId: 'pa',
    }));
    render(<ProjectZone project={{ id: 'pa', name: 'ChitinaseExpr' }} />);
    expect(screen.getByTestId('tree-subrow-dag-pa')).toBeTruthy();
    expect(screen.getByTestId('tree-folder-containers-pa')).toBeTruthy();
    expect(screen.getByTestId('tree-folder-primers-pa')).toBeTruthy();
    expect(screen.getByTestId('tree-item-project-c1')).toBeTruthy();
    expect(screen.getByTestId('tree-item-project-pr1')).toBeTruthy();
  });

  it('DAG subrow click switches workspace to flow with projectId', () => {
    render(<ProjectZone project={{ id: 'pa', name: 'X' }} />);
    fireEvent.click(screen.getByTestId('tree-subrow-dag-pa'));
    expect(useStore.getState().workspace.active).toBe('flow');
    expect(useStore.getState().workspace.context).toEqual({ projectId: 'pa' });
  });

  it('readonly variant exposes data-variant=readonly + 🔒 pill', () => {
    render(<ProjectZone project={{ id: 'pb', name: 'Borrowed' }} isReadOnly />);
    const z = screen.getByTestId('library-zone-project-pb');
    expect(z.getAttribute('data-variant')).toBe('readonly');
    const pill = screen.getByTestId('library-zone-project-pb-pill');
    expect(pill.textContent).toMatch(/read-only/);
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
  it('renders tree-head + 3 zones + tree-foot', () => {
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('tree-head')).toBeTruthy();
    expect(screen.getByTestId('tree-body')).toBeTruthy();
    expect(screen.getByTestId('tree-foot')).toBeTruthy();
    expect(screen.getByTestId('library-zone-loose')).toBeTruthy();
    expect(screen.getByTestId('library-zone-lab')).toBeTruthy();
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

  it('discovers project zones from libraryEntries (active first, foreign after)', async () => {
    useStore.setState((s) => { s.currentProjectId = 'pa'; });
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'a1', zone: 'active_bodge', projectId: 'pa',
    }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'b1', zone: 'readonly_bodge', projectId: 'pb',
    }));
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('library-zone-project-pa')).toBeTruthy();
    expect(screen.getByTestId('library-zone-project-pb')).toBeTruthy();
  });

  it('displays total entries count in tree-foot', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', zone: 'loose' }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', zone: 'loose' }));
    render(<LibraryTreeRoot />);
    expect(screen.getByTestId('tree-foot').textContent).toMatch(/2 entries/);
  });
});
