/**
 * library-actions — getActionsFor unit tests.
 *
 * 17.06.2026 cleanup (Игорь «прибраться — часть убрать»): every action
 * a row exposes must DO something. Removed the dead DAG path
 * (showInDag / useInDag → the orphaned DagWorkspace) and every
 * disabled placeholder whose handler was never wired (containerWindow,
 * clone, createCopyForEdit, editPrimer, copyToLoose, view, editNotes)
 * or hard-disabled pending a future sprint (saveAsVersion, openAsActive).
 * What survives is the working set per zone × kind.
 */
import { describe, it, expect, vi } from 'vitest';
import { getActionsFor } from '../library-actions';

const containerEntry = { id: 'c1', kind: 'container', name: 'pUC19' };
const primerEntry = { id: 'p1', kind: 'primer', name: 'M13F' };

const stubCtx = (over = {}) => ({
  hasActiveProject: false,
  cloneEntryToActiveProject: vi.fn(),
  extractEntryToLoose: vi.fn(),
  toggleLabStock: vi.fn(),
  openFolderPicker: vi.fn(),
  exportEntry: vi.fn(),
  deleteEntry: vi.fn(),
  alignEntry: vi.fn(),
  ...over,
});

// Every action that survives the cleanup must be enabled (no fake
// buttons). These ids should never appear again.
const DEAD_IDS = [
  'showInDag', 'useInDag', 'containerWindow', 'clone', 'createCopyForEdit',
  'editPrimer', 'copyToLoose', 'view', 'editNotes', 'saveAsVersion', 'openAsActive',
];

function expectNoDeadIds(list) {
  for (const a of list) {
    expect(DEAD_IDS).not.toContain(a.id);
    expect(a.disabled === true && !a.tooltip).toBe(false); // no silent-dead button
  }
}

describe('getActionsFor — working-only action sets', () => {
  it('returns [] for unknown (zone, kind)', () => {
    expect(getActionsFor(containerEntry, 'lab_pool', stubCtx())).toEqual([]);
    expect(getActionsFor(null, 'loose', stubCtx())).toEqual([]);
    expect(getActionsFor(containerEntry, '', stubCtx())).toEqual([]);
  });

  it('loose × container — 5 actions, primary addToActiveProject, no dead ids', () => {
    const list = getActionsFor(containerEntry, 'loose', stubCtx({ hasActiveProject: true }));
    expect(list.map((a) => a.id)).toEqual([
      'addToActiveProject', 'align', 'moveToFolder', 'exportGenBank', 'delete',
    ]);
    expect(list[0].variant).toBe('primary');
    expect(list.find((a) => a.id === 'delete').variant).toBe('danger');
    expectNoDeadIds(list);
  });

  it('loose × container without active project — addToActiveProject disabled with tooltip', () => {
    const list = getActionsFor(containerEntry, 'loose', stubCtx({ hasActiveProject: false }));
    const useAction = list.find((a) => a.id === 'addToActiveProject');
    expect(useAction.disabled).toBe(true);
    expect(useAction.tooltip).toMatch(/активн.*проект/i);
  });

  it('loose × primer — 4 actions, primary addToActiveProject', () => {
    const list = getActionsFor(primerEntry, 'loose', stubCtx({ hasActiveProject: true }));
    expect(list.map((a) => a.id)).toEqual([
      'addToActiveProject', 'moveToFolder', 'exportGenBank', 'delete',
    ]);
    expectNoDeadIds(list);
  });

  it('active_bodge × container — 4 working actions (no DAG / no disabled stubs)', () => {
    const list = getActionsFor(containerEntry, 'active_bodge', stubCtx());
    expect(list.map((a) => a.id)).toEqual([
      'align', 'extractToLoose', 'exportGenBank', 'delete',
    ]);
    expectNoDeadIds(list);
  });

  it('active_bodge × primer — 3 working actions (export added for parity, no DAG)', () => {
    const list = getActionsFor(primerEntry, 'active_bodge', stubCtx());
    expect(list.map((a) => a.id)).toEqual([
      'extractToLoose', 'exportGenBank', 'delete',
    ]);
    expectNoDeadIds(list);
  });

  it('readonly_bodge × container — 2 actions (copy + align), no openAsActive/view', () => {
    const list = getActionsFor(containerEntry, 'readonly_bodge', stubCtx({ hasActiveProject: true }));
    expect(list.map((a) => a.id)).toEqual(['copyToActive', 'align']);
    expectNoDeadIds(list);
  });

  it('readonly_bodge × primer — 1 action (copy to active)', () => {
    const list = getActionsFor(primerEntry, 'readonly_bodge', stubCtx({ hasActiveProject: true }));
    expect(list.map((a) => a.id)).toEqual(['copyToActive']);
    expectNoDeadIds(list);
  });

  it('lab_pool × primer — 3 actions, toggleLabStock label flips by inLabStock', () => {
    const e1 = { ...primerEntry, inLabStock: true };
    const list1 = getActionsFor(e1, 'lab_pool', stubCtx());
    expect(list1.map((a) => a.id)).toEqual(['useInActive', 'toggleLabStock', 'delete']);
    expect(list1.find((a) => a.id === 'toggleLabStock').label).toBe('Снять метку');

    const e2 = { ...primerEntry, inLabStock: false };
    const list2 = getActionsFor(e2, 'lab_pool', stubCtx());
    expect(list2.find((a) => a.id === 'toggleLabStock').label).toBe('Поставить метку');
    expectNoDeadIds(list2);
  });

  it('handler dispatch — clicking primary action calls the wired ctx handler', () => {
    const ctx = stubCtx({ hasActiveProject: true });
    const list = getActionsFor(containerEntry, 'loose', ctx);
    list[0].onClick();
    expect(ctx.cloneEntryToActiveProject).toHaveBeenCalledWith('c1');
  });

  it('active container export + extract dispatch to the wired handlers', () => {
    const ctx = stubCtx();
    const list = getActionsFor(containerEntry, 'active_bodge', ctx);
    list.find((a) => a.id === 'exportGenBank').onClick();
    list.find((a) => a.id === 'extractToLoose').onClick();
    expect(ctx.exportEntry).toHaveBeenCalledWith('c1');
    expect(ctx.extractEntryToLoose).toHaveBeenCalledWith('c1');
  });
});
