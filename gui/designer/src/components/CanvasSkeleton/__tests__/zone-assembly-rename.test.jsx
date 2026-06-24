/**
 * zone-assembly-rename.test.jsx — переименование сборки (UX_DIRECTION).
 *
 * После T6 сборка = ZONE, и draftId редактора === zone.id. Header «✎»
 * (AssemblyHeader → onRename → actions.renameAssemblyDraft) должен реально
 * переименовывать ЗОНУ (legacy RENAME_ASSEMBLY_DRAFT — no-op, assemblyDrafts
 * пуст). Жалоба Игоря: «переименование сборок прикрути».
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SkeletonProvider, useSkeletonActions, useSkeletonState } from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function makeZone(name) {
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name, bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  return S.zones[S.zones.length - 1].id;
}

describe('renameAssemblyDraft → переименование зоны (T6: сборка = zone)', () => {
  it('меняет имя зоны, когда draftId === zone.id', () => {
    render(<SkeletonProvider><H /></SkeletonProvider>);
    const zid = makeZone('Сборка 1');
    act(() => { A.renameAssemblyDraft(zid, 'Моя сборка'); });
    expect(S.zones.find((z) => z.id === zid).name).toBe('Моя сборка');
  });

  it('переименовывает только целевую зону, остальные не трогает', () => {
    render(<SkeletonProvider><H /></SkeletonProvider>);
    const a = makeZone('Сборка 1');
    const b = makeZone('Сборка 2');
    act(() => { A.renameAssemblyDraft(b, 'Финал'); });
    expect(S.zones.find((z) => z.id === a).name).toBe('Сборка 1');
    expect(S.zones.find((z) => z.id === b).name).toBe('Финал');
  });

  it('безопасен, когда зоны с таким id нет (no-op, без падения)', () => {
    render(<SkeletonProvider><H /></SkeletonProvider>);
    makeZone('Сборка 1');
    const before = S.zones.map((z) => z.name);
    act(() => { A.renameAssemblyDraft('нет-такой', 'X'); });
    expect(S.zones.map((z) => z.name)).toEqual(before);
  });
});
