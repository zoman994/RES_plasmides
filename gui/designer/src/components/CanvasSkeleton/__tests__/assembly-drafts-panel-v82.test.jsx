/**
 * assembly-drafts-panel-v82.test.jsx — V82 fix.
 *
 * «Сборки (N)» panel is now ZONE-based (post-T6 «сборка» = zone). The
 * default seeded zone «Сборка 1» is reflected in the counter (the V82
 * symptom: starter assembly invisible). «+ Новая сборка» → CREATE_ZONE;
 * card Open → openEditorAssemblyTab(zoneId) (T6 dual-resolve); Delete →
 * REMOVE_ZONE.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import AssemblyDraftsPanel from '../canvas/AssemblyDraftsPanel';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function mount() {
  render(<SkeletonProvider><H /><AssemblyDraftsPanel /></SkeletonProvider>);
}

// DEC-T3-08 REVERSED (Игорь 17.05.2026): a new project starts with a
// CLEAN canvas — NO seeded «Сборка 1». The panel still reflects
// state.zones; assemblies are created explicitly via «+ Новая сборка».
//
// PC-K6 update (20.05.2026): the «📋 Сборки (N)» toggle is HIDDEN
// when zones.length === 0 (spec §4.4 — zero-count is UI noise).
// First zone seed is created via direct CREATE_ZONE dispatch.
function seedFirstZone() {
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
}
function newZone() {
  act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
  act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-new')); });
}

describe('V82 — AssemblyDraftsPanel is zone-based (post DEC-T3-08 reversal)', () => {
  it('PC-K6: default project: zero zones → toggle hidden', () => {
    mount();
    expect(screen.queryByTestId('assembly-drafts-toggle')).toBeNull();
    expect(screen.queryByTestId('assembly-drafts-panel')).toBeNull();
  });

  it('after seeding a zone, toggle appears and shows count', () => {
    mount();
    seedFirstZone();
    expect(screen.getByTestId('assembly-drafts-toggle').textContent).toMatch(/\(1\)/);
  });

  it('«+ Новая сборка» dispatches CREATE_ZONE (1→2)', () => {
    mount();
    seedFirstZone();
    newZone();
    expect(S.zones).toHaveLength(2);
    expect(screen.getByTestId('assembly-drafts-toggle').textContent).toMatch(/\(2\)/);
  });

  it('card Open opens an assembly editor tab targeting the zone id', () => {
    mount();
    seedFirstZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
    const zid = S.zones[0].id;
    act(() => {
      fireEvent.click(within(screen.getByTestId('assembly-draft-card'))
        .getByTestId('assembly-draft-card-open'));
    });
    expect(S.editorContext.tabs.some(
      (t) => t.kind === 'assembly' && t.assemblyDraftId === zid,
    )).toBe(true);
  });

  it('card Delete dispatches REMOVE_ZONE; emptying → toggle disappears', () => {
    mount();
    seedFirstZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
    act(() => {
      fireEvent.click(within(screen.getByTestId('assembly-draft-card'))
        .getByTestId('assembly-draft-card-delete'));
    });
    expect(S.zones).toHaveLength(0);
    expect(screen.queryByTestId('assembly-drafts-toggle')).toBeNull();
  });

  it('card node count reflects containers/pieces/ops in the zone', () => {
    mount();
    seedFirstZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
    const zid = S.zones[0].id;
    act(() => { A.addContainer({ id: 'cV82', name: 'pUC', sequence: 'ACGTACGT', annotations: [] }); });
    act(() => { A.moveNodeToZone('container', 'cV82', zid); });
    expect(screen.getByTestId('assembly-draft-card').textContent).toMatch(/1/);
  });
});
