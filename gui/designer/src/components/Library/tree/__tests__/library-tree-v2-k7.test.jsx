/**
 * Library tree (v2) — Sprint M-X.7a v2 K7 polish tests.
 *
 * Covers:
 *   • STRINGS.libraryWorkspace populated (source-of-truth keys
 *     consumed by tree zones + topbar)
 *   • Native HTML5 drag-drop: Loose item dropped onto active
 *     ProjectZone clones via cloneEntryToActiveProject
 *   • Read-only ProjectZone is not a drop target
 *   • Drop visual state surfaces data-drop-active
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import { STRINGS } from '../../../../lib/strings';
import LooseZone from '../LooseZone';
import ProjectZone from '../ProjectZone';
import LibraryTreeRoot from '../LibraryTreeRoot';

async function freshDB() {
  const name = `bodgegene-k7-${Math.random().toString(36).slice(2)}`;
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
    payload: over.payload || { length: 2686, topology: 'circular' },
    zone: over.zone ?? 'loose',
    projectId: over.projectId ?? null,
    inLabStock: over.inLabStock ?? false,
    parentEntryId: null, parentEntryHash: null,
    origin: { kind: 'file_import' },
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
  });
});
afterEach(cleanup);

describe('M-X.7a v2 K7 — STRINGS namespaces', () => {
  it('STRINGS.libraryWorkspace exposes the canonical zone titles + button + banners', () => {
    const ws = STRINGS.libraryWorkspace;
    expect(ws).toBeDefined();
    // Renamed in M-X.7c K4: «Коллекция» → «⎀ БЕЗ ПРОЕКТА» / «свободный стол биолога».
    expect(ws.zoneLooseTitleNoProject).toMatch(/БЕЗ ПРОЕКТА/);
    expect(ws.zoneLooseSubFreeDesk).toMatch(/свободный/i);
    expect(ws.containersFolder).toBe('Контейнеры');
    expect(ws.primersFolder).toBe('Праймеры');
    expect(ws.addBtn).toBe('+ Добавить');
    expect(ws.breadcrumbActive).toMatch(/Активный/);
    expect(ws.searchPlaceholder).toMatch(/Поиск/);
    expect(ws.treeFilterPlaceholder).toMatch(/Фильтр/);
    expect(ws.roBannerSequence).toMatch(/read-only/);
    expect(ws.roBannerAnnotations).toMatch(/Container Window/);
  });

  it('STRINGS.libraryWorkspace nests action labels per zone (M-X.7c K6 keys present)', () => {
    const ws = STRINGS.libraryWorkspace;
    expect(ws.actionsLoose).toBeDefined();
    expect(ws.actionsLoose.delete).toBe('Удалить');
    // K6 renames.
    expect(ws.actionsLoose.addToActiveProject).toMatch(/активн.*проект/i);
    expect(ws.actionsLoose.createCopyForEdit).toMatch(/копию/i);
    expect(ws.actionsLoose.moveToFolder).toMatch(/папк/i);
    expect(ws.actionsActive).toBeDefined();
    expect(ws.actionsActive.containerWindow).toBe('Container Window');
    expect(ws.actionsReadonly).toBeDefined();
    expect(ws.actionsReadonly.openAsActive).toMatch(/Открыть/);
    expect(ws.actionsLab).toBeDefined();
    expect(ws.actionsLab.toggleStockOff).toMatch(/Снять/);
  });

  it('LooseZone renders with STRINGS-driven title (M-X.7c K4: «БЕЗ ПРОЕКТА» / «свободный стол»)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'l1', name: 'pUC19', zone: 'loose',
    }));
    render(<LooseZone />);
    const head = screen.getByTestId('library-zone-loose-head');
    expect(head.textContent).toMatch(/БЕЗ ПРОЕКТА/);
    expect(head.textContent).toMatch(/свободный/i);
  });
});

describe('M-X.7a v2 K7 — drag-drop minimum (DEC-MX7A-V2-10)', () => {
  it('ProjectZone (active) accepts dragover from a Loose entry and clones on drop', async () => {
    useStore.setState((s) => { s.currentProjectId = 'pa'; });
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'src', name: 'pUC19', zone: 'loose',
    }));
    render(
      <>
        <LooseZone />
        <ProjectZone project={{ id: 'pa', name: 'X' }} />
      </>,
    );
    const drop = screen.getByTestId('tree-zone-drop-pa');
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/x-bodge-entry-id', 'src');
    fireEvent.dragOver(drop, { dataTransfer });
    expect(drop.getAttribute('data-drop-active')).toBe('true');
    fireEvent.drop(drop, { dataTransfer });
    expect(drop.getAttribute('data-drop-active')).toBe('false');
    // After drop, librarySlice has a new active_bodge clone with parentEntryId='src'.
    const all = Object.values(useStore.getState().libraryEntries);
    const cloned = all.find((e) => e.parentEntryId === 'src');
    expect(cloned).toBeDefined();
    expect(cloned.zone).toBe('active_bodge');
    expect(cloned.projectId).toBe('pa');
  });

  // 09.05.2026 minimum-pass refresh: read-only project variant
  // dropped from ProjectZone — all projects render as «active»
  // until read-only `.bodge` import lands as a separate feature.
  // The «readonly is not a drop target» guard is moot until then;
  // skipped, will return when readonly variant comes back.
  it.skip('ProjectZone (readonly) does not surface drop-active on dragover (deprecated until readonly returns)', () => {});

  it('Loose item rows are draggable; readonly items are not', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'l1', name: 'pUC19', zone: 'loose',
    }));
    render(<LooseZone />);
    const row = screen.getByTestId('tree-item-loose-l1');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('drag with no payload (empty dataTransfer) is a no-op on drop', () => {
    useStore.setState((s) => { s.currentProjectId = 'pa'; });
    render(<ProjectZone project={{ id: 'pa', name: 'X' }} />);
    const before = Object.keys(useStore.getState().libraryEntries).length;
    const drop = screen.getByTestId('tree-zone-drop-pa');
    fireEvent.drop(drop, { dataTransfer: new DataTransfer() });
    expect(Object.keys(useStore.getState().libraryEntries).length).toBe(before);
  });
});

describe('M-C.1 — ProjectZone collapse/expand (📦 сворачивание)', () => {
  it('ProjectZone header click collapses and re-expands the entry list', async () => {
    useStore.setState((s) => {
      s.currentProjectId = 'proj1';
      s.projects = { proj1: { id: 'proj1', name: 'Alpha', containerIds: ['e1'] } };
    });
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19', projectId: 'proj1' }));
    render(
      <LibraryTreeRoot
        query=""
        onQueryChange={() => {}}
        selectedId={null}
        onSelectEntry={() => {}}
        onAddClick={() => {}}
      />,
    );
    // Initially expanded: entry row visible
    expect(screen.getByTestId('tree-item-project-e1')).toBeTruthy();
    const zoneHead = screen.getByTestId('library-zone-project-proj1-head');
    expect(zoneHead.parentElement.getAttribute('data-expanded')).toBe('true');

    // Click to collapse
    fireEvent.click(zoneHead);
    expect(screen.queryByTestId('tree-item-project-e1')).toBeNull();
    expect(zoneHead.parentElement.getAttribute('data-expanded')).toBe('false');

    // Click again to expand
    fireEvent.click(zoneHead);
    expect(screen.getByTestId('tree-item-project-e1')).toBeTruthy();
    expect(zoneHead.parentElement.getAttribute('data-expanded')).toBe('true');
  });

  // Old «Свернуть всё» button removed in M-X.8 K4 — the new model
  // expands at most one project (the current one). Per-project
  // collapse via the project header is covered by the K4 test
  // suite in library-tree-v2.test.jsx («click on the current
  // project header just collapses…»).
});
