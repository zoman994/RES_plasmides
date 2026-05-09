/**
 * library-actions — Sprint M-X.7a v2 K3 unit tests for getActionsFor.
 *
 * Verifies the per-zone × per-kind action table per spec §5.4 + the
 * disabled+tooltip flags for the M-X.7b/M-X.9 deferred items.
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
  openContainerWindow: vi.fn(),
  createManualEditBranch: vi.fn(),
  openFolderPicker: vi.fn(),
  exportEntry: vi.fn(),
  deleteEntry: vi.fn(),
  editPrimer: vi.fn(),
  editPrimerNotes: vi.fn(),
  showInDag: vi.fn(),
  cloneEntry: vi.fn(),
  copyToLoose: vi.fn(),
  usePrimerInDag: vi.fn(),
  ...over,
});

describe('M-X.7a v2 K3 — getActionsFor', () => {
  it('returns [] for unknown (zone, kind)', () => {
    expect(getActionsFor(containerEntry, 'lab_pool', stubCtx())).toEqual([]);
    expect(getActionsFor(null, 'loose', stubCtx())).toEqual([]);
    expect(getActionsFor(containerEntry, '', stubCtx())).toEqual([]);
  });

  it('loose × container — 6 actions, primary "useInActive"', () => {
    const list = getActionsFor(containerEntry, 'loose', stubCtx({ hasActiveProject: true }));
    expect(list.length).toBe(6);
    expect(list[0].id).toBe('useInActive');
    expect(list[0].variant).toBe('primary');
    expect(list.find((a) => a.id === 'delete').variant).toBe('danger');
  });

  it('loose × container without active project — useInActive disabled with tooltip', () => {
    const list = getActionsFor(containerEntry, 'loose', stubCtx({ hasActiveProject: false }));
    const useAction = list.find((a) => a.id === 'useInActive');
    expect(useAction.disabled).toBe(true);
    expect(useAction.tooltip).toMatch(/активный проект/i);
  });

  it('loose × primer — 5 actions', () => {
    const list = getActionsFor(primerEntry, 'loose', stubCtx({ hasActiveProject: true }));
    expect(list.length).toBe(5);
    expect(list[0].id).toBe('useInActive');
  });

  it('active_bodge × container — 7 actions, saveAsVersion disabled with M-X.7b tooltip', () => {
    const list = getActionsFor(containerEntry, 'active_bodge', stubCtx());
    expect(list.length).toBe(7);
    const save = list.find((a) => a.id === 'saveAsVersion');
    expect(save.disabled).toBe(true);
    expect(save.tooltip).toMatch(/M-X\.7b/);
  });

  it('active_bodge × primer — 4 actions', () => {
    const list = getActionsFor(primerEntry, 'active_bodge', stubCtx());
    expect(list.length).toBe(4);
    expect(list[0].id).toBe('useInDag');
  });

  it('readonly_bodge × container — 4 actions, openAsActive disabled with M-X.9 tooltip', () => {
    const list = getActionsFor(containerEntry, 'readonly_bodge', stubCtx({ hasActiveProject: true }));
    expect(list.length).toBe(4);
    const openAs = list.find((a) => a.id === 'openAsActive');
    expect(openAs.disabled).toBe(true);
    expect(openAs.tooltip).toMatch(/M-X\.9/);
  });

  it('readonly_bodge × primer — 3 actions', () => {
    const list = getActionsFor(primerEntry, 'readonly_bodge', stubCtx({ hasActiveProject: true }));
    expect(list.length).toBe(3);
  });

  it('lab_pool × primer — 4 actions, toggleLabStock label flips by inLabStock', () => {
    const e1 = { ...primerEntry, inLabStock: true };
    const list1 = getActionsFor(e1, 'lab_pool', stubCtx());
    expect(list1.length).toBe(4);
    expect(list1.find((a) => a.id === 'toggleLabStock').label).toBe('Снять метку');

    const e2 = { ...primerEntry, inLabStock: false };
    const list2 = getActionsFor(e2, 'lab_pool', stubCtx());
    expect(list2.find((a) => a.id === 'toggleLabStock').label).toBe('Поставить метку');
  });

  it('handler dispatch — clicking primary action calls the wired ctx handler', () => {
    const ctx = stubCtx({ hasActiveProject: true });
    const list = getActionsFor(containerEntry, 'loose', ctx);
    list[0].onClick();
    expect(ctx.cloneEntryToActiveProject).toHaveBeenCalledWith('c1');
  });
});
