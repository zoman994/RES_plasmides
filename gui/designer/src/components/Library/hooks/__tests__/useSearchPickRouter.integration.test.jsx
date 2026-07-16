/**
 * useSearchPickRouter — INTEGRATION over the REAL store (REV#2 K6-P1-2b). The matrix test
 * uses a vi.fn() addPrimerToPool and only proves call arguments; it can't prove the primer is
 * actually WRITTEN — with every field, and present in primersById at the exact moment
 * setActiveWorkspace fires. This drives the real primerSlice.addPrimerToPool + workspaceSlice.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../../store';
import { useSearchPickRouter } from '../useSearchPickRouter';

const LEGACY = {
  id: 'legPr', kind: 'primer', name: 'T7-rev',
  payload: { sequence: 'GCTAGTTATTGCTCAGCGG', bindingSequence: 'GCTAGTTATTGCTCAGC', tail: 'GGGG',
    tm: 58.2, length: 19, direction: 'reverse', addedAt: '2026-01-02T00:00:00.000Z', tags: ['seq'],
    description: 'sequencing primer' },
  origin: { kind: 'design', status: 'ordered', resourceHash: 'h-legacy' },
};

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState({ primersById: {}, _primersHydrated: true, libraryEntries: {}, projects: {} });
});

const pick = async (result, ref) => {
  await act(async () => { result.current.handlePickSearchResult(ref, null); await Promise.resolve(); });
};

describe('useSearchPickRouter — legacy-primer migration (real store)', () => {
  it('migrates a legacy primer LOSSLESSLY — every field lands in primersById', async () => {
    useStore.setState({ libraryEntries: { legPr: LEGACY } });
    const { result } = renderHook(() => useSearchPickRouter({ openEntry: vi.fn(), setQuery: vi.fn() }));
    await pick(result, { kind: 'primer', id: 'legPr' });

    const row = useStore.getState().primersById.legPr;
    expect(row).toBeTruthy();
    expect(row.tm).toBe(58.2);                 // NOT null
    expect(row.direction).toBe('reverse');     // NOT dropped
    expect(row.status).toBe('ordered');        // NOT downgraded to 'imported'
    expect(row.length).toBe(19);
    expect(row.bindingSequence).toBe('GCTAGTTATTGCTCAGC');
    expect(row.tail).toBe('GGGG');
    expect(row.addedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(row.origin).toMatchObject({ kind: 'design', resourceHash: 'h-legacy' });
    expect(row.resourceHash).toBe('h-legacy'); // from origin.resourceHash
    expect(row.description).toBe('sequencing primer'); // searchable dimension survives migration
    expect(row.tags).toEqual(['seq']);
  });

  it('the primer is in primersById at the exact moment setActiveWorkspace fires', async () => {
    useStore.setState({ libraryEntries: { legPr: LEGACY } });
    let presentAtNav = null; let navCtx = null;
    const realSetWs = useStore.getState().setActiveWorkspace;
    useStore.setState({
      setActiveWorkspace: (name, ctx) => {
        if (name === 'primer-pool') {
          navCtx = ctx;
          presentAtNav = !!useStore.getState().primersById[ctx?.selectedPrimerId];
        }
        return realSetWs?.(name, ctx);
      },
    });
    const { result } = renderHook(() => useSearchPickRouter({ openEntry: vi.fn(), setQuery: vi.fn() }));
    await pick(result, { kind: 'primer', id: 'legPr' });

    expect(presentAtNav).toBe(true);               // synchronous set-before-await holds
    expect(navCtx).toEqual({ selectedPrimerId: 'legPr' });
  });

  it('id collision — primer:x where entry:x is a MOLECULE opens NOTHING (no pool row, no molecule)', async () => {
    useStore.setState({ libraryEntries: { x: { id: 'x', kind: 'container', name: 'a molecule' } } });
    const openEntry = vi.fn();
    const setWs = vi.fn();
    useStore.setState({ setActiveWorkspace: setWs });
    const { result } = renderHook(() => useSearchPickRouter({ openEntry, setQuery: vi.fn() }));
    await pick(result, { kind: 'primer', id: 'x' });

    expect(useStore.getState().primersById.x).toBeUndefined();
    expect(setWs).not.toHaveBeenCalled();
    expect(openEntry).not.toHaveBeenCalled();
  });
});
