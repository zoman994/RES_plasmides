/**
 * TrashZone tests — корзина для tree.
 *
 * Покрывает:
 *   • TrashZone рендерит записи и проекты с _pendingDelete = true.
 *   • Кнопки «Восстановить» / «Удалить навсегда» зовут unmark / commit
 *     соответствующего слайса.
 *   • «Очистить корзину» в шапке коммитит все pending-delete'ы.
 *   • Когда корзина пуста — header виден, тело показывает «пусто».
 *   • TrashZone подмонтирована в LibraryTreeRoot.
 *   • Soft-delete записи через TreeItemRow 🗑 НЕ авто-коммитит на
 *     dismiss таймера тоста (запись должна жить в корзине, пока юзер
 *     не нажмёт «Удалить навсегда»).
 *   • Soft-delete проекта через ProjectZone header 🗑 ставит флаг и
 *     показывает undo-тост.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';

import TrashZone from '../TrashZone';
import LibraryTreeRoot from '../LibraryTreeRoot';
import TreeItemRow from '../TreeItemRow';
import ProjectZone from '../ProjectZone';

async function freshDB() {
  const name = `bodgegene-trash-${Math.random().toString(36).slice(2)}`;
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

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
    s.pinnedProjectIds = [];
    s.recentProjectIds = [];
    s.looseFolders = [];
    s.toasts = [];
    s.workspace = { active: 'library', history: [], context: {} };
  });
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────
describe('TrashZone — header + count', () => {
  it('renders header with total count of trashed entries + projects', async () => {
    // 2 entries + 1 project = 3 in trash.
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pDeleted1' }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', name: 'pDeleted2' }));
    await useStore.getState().markLibraryEntryPendingDelete('e1');
    await useStore.getState().markLibraryEntryPendingDelete('e2');
    useStore.setState((s) => {
      s.projects = {
        pTrash: { id: 'pTrash', name: 'OldProject', _pendingDelete: true, containerIds: [] },
      };
    });

    render(<TrashZone expanded={false} onToggle={() => {}} />);
    expect(screen.getByTestId('library-zone-trash')).toBeTruthy();
    expect(screen.getByTestId('library-zone-trash-count').textContent).toBe('3');
  });

  it('renders empty-state body when nothing is in trash', () => {
    render(<TrashZone expanded onToggle={() => {}} />);
    expect(screen.getByTestId('library-zone-trash')).toBeTruthy();
    expect(screen.getByTestId('trash-empty-hint')).toBeTruthy();
  });

  it('Очистить корзину button absent when nothing in trash', () => {
    render(<TrashZone expanded onToggle={() => {}} />);
    expect(screen.queryByTestId('trash-empty-all-btn')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('TrashZone — restore + permanent delete (entries)', () => {
  it('Restore button on a trashed entry calls unmark', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19' }));
    await useStore.getState().markLibraryEntryPendingDelete('e1');
    render(<TrashZone expanded onToggle={() => {}} />);
    const restoreBtn = screen.getByTestId('trash-restore-entry-e1');
    await act(async () => { fireEvent.click(restoreBtn); });
    expect(useStore.getState().libraryEntries.e1?._pendingDelete).toBe(false);
  });

  it('Delete-permanent button on a trashed entry commits the delete', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19' }));
    await useStore.getState().markLibraryEntryPendingDelete('e1');
    render(<TrashZone expanded onToggle={() => {}} />);
    const purgeBtn = screen.getByTestId('trash-purge-entry-e1');
    await act(async () => { fireEvent.click(purgeBtn); });
    expect(useStore.getState().libraryEntries.e1).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('TrashZone — restore + permanent delete (projects)', () => {
  it('Restore button on a trashed project calls unmark', async () => {
    useStore.setState((s) => {
      s.projects = {
        pX: { id: 'pX', name: 'OldProj', _pendingDelete: true, containerIds: [] },
      };
    });
    render(<TrashZone expanded onToggle={() => {}} />);
    const btn = screen.getByTestId('trash-restore-project-pX');
    await act(async () => { fireEvent.click(btn); });
    expect(useStore.getState().projects.pX?._pendingDelete).toBe(false);
  });

  it('Delete-permanent on a trashed project removes it from store', async () => {
    useStore.setState((s) => {
      s.projects = {
        pX: { id: 'pX', name: 'OldProj', _pendingDelete: true, containerIds: [] },
      };
    });
    render(<TrashZone expanded onToggle={() => {}} />);
    const btn = screen.getByTestId('trash-purge-project-pX');
    await act(async () => { fireEvent.click(btn); });
    // project commitPendingDelete is fully async (state mutation
    // happens after `await dexieDeleteProject`), so we flush an
    // extra microtask round before asserting.
    await new Promise((r) => setTimeout(r, 30));
    expect(useStore.getState().projects.pX).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('TrashZone — empty-all', () => {
  it('Очистить корзину commits all entries + projects in one go', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'a' }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', name: 'b' }));
    await useStore.getState().markLibraryEntryPendingDelete('e1');
    await useStore.getState().markLibraryEntryPendingDelete('e2');
    useStore.setState((s) => {
      s.projects = {
        pX: { id: 'pX', name: 'X', _pendingDelete: true, containerIds: [] },
      };
    });
    render(<TrashZone expanded onToggle={() => {}} />);
    const btn = screen.getByTestId('trash-empty-all-btn');
    // Stub confirm to true so the click goes through.
    const origConfirm = global.confirm;
    global.confirm = vi.fn(() => true);
    await act(async () => { fireEvent.click(btn); });
    global.confirm = origConfirm;
    // Trash-empty-all iterates entries (sync state mutation) then
    // projects (async state mutation post dexieDeleteProject).
    // Flush extra microtask round before final assertion.
    await new Promise((r) => setTimeout(r, 60));
    expect(useStore.getState().libraryEntries.e1).toBeUndefined();
    expect(useStore.getState().libraryEntries.e2).toBeUndefined();
    expect(useStore.getState().projects.pX).toBeUndefined();
  });

  it('Очистить корзину is a no-op when user cancels confirm', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'a' }));
    await useStore.getState().markLibraryEntryPendingDelete('e1');
    render(<TrashZone expanded onToggle={() => {}} />);
    const btn = screen.getByTestId('trash-empty-all-btn');
    const origConfirm = global.confirm;
    global.confirm = vi.fn(() => false);
    await act(async () => { fireEvent.click(btn); });
    global.confirm = origConfirm;
    // Entry still in trash.
    expect(useStore.getState().libraryEntries.e1?._pendingDelete).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('LibraryTreeRoot — mounts TrashZone', () => {
  it('TrashZone is mounted at the bottom of the tree body', () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { ...makeContainer({ id: 'e1', name: 't1' }), _pendingDelete: true },
      };
    });
    render(<LibraryTreeRoot query="" onQueryChange={() => {}} />);
    expect(screen.getByTestId('library-zone-trash')).toBeTruthy();
    // Count surfaces «1».
    expect(screen.getByTestId('library-zone-trash-count').textContent).toBe('1');
  });
});

// ─────────────────────────────────────────────────────────────────
describe('TreeItemRow quick-delete — no auto-commit semantics', () => {
  it('clicking 🗑 marks pending but does NOT register onAutoDismiss → commit', async () => {
    const e = makeContainer({ id: 'qd1', name: 'pBad' });
    await useStore.getState().addLibraryEntry(e);
    render(<TreeItemRow entry={useStore.getState().libraryEntries.qd1} testId="ti-qd" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ti-qd-quickdelete'));
    });
    await new Promise((r) => setTimeout(r, 30));
    // Entry is soft-deleted.
    expect(useStore.getState().libraryEntries.qd1?._pendingDelete).toBe(true);
    // Toast was raised, but onAutoDismiss callback is NOT a hard-commit.
    // We enforce this by inspecting the toast options: onAutoDismiss
    // either absent or NOT triggering commit.
    const toasts = useStore.getState().toasts || [];
    const t = toasts.find((x) => /Удалено/.test(x.msg));
    expect(t).toBeTruthy();
    // Auto-dismiss should be absent OR null — we no longer schedule
    // a hard-delete from the toast surface.
    expect(t?.onAutoDismiss == null).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('ProjectZone — hover delete', () => {
  it('renders 🗑 button in header; click marks the project pending', async () => {
    useStore.setState((s) => {
      s.projects = { pA: { id: 'pA', name: 'MyProj', containerIds: [] } };
      s.currentProjectId = 'pA';
    });
    render(<ProjectZone project={useStore.getState().projects.pA} expanded onToggle={() => {}} />);
    const btn = screen.getByTestId('project-zone-delete-pA');
    expect(btn).toBeTruthy();
    await act(async () => { fireEvent.click(btn); });
    // onDeleteProject is async (awaits putProject before showing
    // the toast) — flush before asserting on the toast.
    await new Promise((r) => setTimeout(r, 30));
    expect(useStore.getState().projects.pA?._pendingDelete).toBe(true);
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Удалён проект|MyProj/.test(t.msg) && typeof t.onUndo === 'function')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('projectSlice.markPendingDelete — persistence', () => {
  it('persists _pendingDelete=true via putProject', async () => {
    useStore.setState((s) => {
      s.projects = { pA: { id: 'pA', name: 'MyProj', containerIds: [], schemaVer: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
      s._projectLifecycle = { pA: {} };
    });
    await act(async () => {
      await useStore.getState().markPendingDelete('pA');
    });
    expect(useStore.getState().projects.pA?._pendingDelete).toBe(true);
    // Persistence: Dexie should now hold the row with _pendingDelete=true.
    const { getProject } = await import('../../../../db/dexie-schema');
    const row = await getProject('pA');
    expect(row?.body?._pendingDelete).toBe(true);
  });

  it('unmarkPendingDelete persists _pendingDelete=false', async () => {
    useStore.setState((s) => {
      s.projects = { pA: { id: 'pA', name: 'MyProj', containerIds: [], _pendingDelete: true, schemaVer: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
      s._projectLifecycle = { pA: {} };
    });
    await act(async () => {
      await useStore.getState().unmarkPendingDelete('pA');
    });
    expect(useStore.getState().projects.pA?._pendingDelete).toBe(false);
    const { getProject } = await import('../../../../db/dexie-schema');
    const row = await getProject('pA');
    expect(row?.body?._pendingDelete).toBe(false);
  });
});
