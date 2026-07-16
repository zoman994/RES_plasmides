/**
 * useSearchPickRouter — the kind-aware routing sink (REV #2 §10.4/§10.5), extracted from
 * LibraryWorkspace. Matrix over every route + the P1 edge cases from Игорь's K6 review.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import { useSearchPickRouter } from '../useSearchPickRouter';

function setup({ primersById = {}, libraryEntries = {} } = {}) {
  const activateProject = vi.fn();
  const setActiveWorkspace = vi.fn();
  const addPrimerToPool = vi.fn(() => Promise.resolve({ id: 'migrated' }));
  useStore.setState((s) => {
    s.primersById = primersById; s.libraryEntries = libraryEntries;
    s.activateProject = activateProject; s.setActiveWorkspace = setActiveWorkspace;
    s.addPrimerToPool = addPrimerToPool;
  });
  const openEntry = vi.fn();
  const setQuery = vi.fn();
  const { result } = renderHook(() => useSearchPickRouter({ openEntry, setQuery }));
  return { result, openEntry, setQuery, activateProject, setActiveWorkspace, addPrimerToPool };
}

const pick = (result, ref, occ) => act(() => result.current.handlePickSearchResult(ref, occ));

describe('useSearchPickRouter — route by kind', () => {
  beforeEach(() => { useStore.setState((s) => { s.primersById = {}; s.libraryEntries = {}; }); });

  it('entry → openEntry(id, occurrence) [standard guarded selection, not a raw setSelectedId]', () => {
    const occ = { location: { segments: [{ start: 1, end: 4 }] } };
    const { result, openEntry } = setup({ libraryEntries: { e1: { id: 'e1' } } });
    pick(result, { kind: 'entry', id: 'e1' }, occ);
    expect(openEntry).toHaveBeenCalledWith('e1', occ);
  });

  it('project → activateProject', () => {
    const { result, activateProject } = setup();
    pick(result, { kind: 'project', id: 'p1' });
    expect(activateProject).toHaveBeenCalledWith('p1');
  });

  it('primer IN the pool → open primer-pool pre-selected', () => {
    const { result, setActiveWorkspace, openEntry } = setup({ primersById: { pr1: { id: 'pr1' } } });
    pick(result, { kind: 'primer', id: 'pr1' });
    expect(setActiveWorkspace).toHaveBeenCalledWith('primer-pool', { selectedPrimerId: 'pr1' });
    expect(openEntry).not.toHaveBeenCalled();
  });

  it('LEGACY-only primer (kind=primer, not in pool) → MIGRATES LOSSLESSLY into the pool, then opens it (§3.4/§10.2)', () => {
    const legacy = {
      id: 'legPr', kind: 'primer', name: 'leg',
      payload: { sequence: 'ACGT', tm: 58.2, direction: 'reverse' },
      origin: { kind: 'design', status: 'ordered', resourceHash: 'h-leg' },
    };
    const { result, setActiveWorkspace, addPrimerToPool, openEntry } = setup({ primersById: {}, libraryEntries: { legPr: legacy } });
    pick(result, { kind: 'primer', id: 'legPr' });
    // status + origin forwarded as SEPARATE args (else addPrimerToPool's default 'imported' wins);
    // tm/direction carried on the primer (lossless).
    expect(addPrimerToPool).toHaveBeenCalledWith(expect.objectContaining({
      primer: expect.objectContaining({ id: 'legPr', sequence: 'ACGT', tm: 58.2, direction: 'reverse' }),
      status: 'ordered',
      origin: expect.objectContaining({ resourceHash: 'h-leg' }),
    }));
    expect(setActiveWorkspace).toHaveBeenCalledWith('primer-pool', { selectedPrimerId: 'legPr' });
    expect(openEntry).not.toHaveBeenCalled(); // NEVER a molecule inspector
  });

  it('COLLISION — primer:x where entry:x is a MOLECULE (kind≠primer) opens NOTHING, never the molecule', () => {
    const { result, setActiveWorkspace, addPrimerToPool, openEntry } = setup({ primersById: {}, libraryEntries: { x: { id: 'x', kind: 'container', name: 'a molecule' } } });
    pick(result, { kind: 'primer', id: 'x' });
    expect(addPrimerToPool).not.toHaveBeenCalled();
    expect(setActiveWorkspace).not.toHaveBeenCalled();
    expect(openEntry).not.toHaveBeenCalled();
  });

  it('unresolvable primer (neither pool nor library) → no-op, never a blank pool', () => {
    const { result, setActiveWorkspace, openEntry } = setup();
    pick(result, { kind: 'primer', id: 'ghost' });
    expect(setActiveWorkspace).not.toHaveBeenCalled();
    expect(openEntry).not.toHaveBeenCalled();
  });

  it('enzyme → opens the card (enzymeCardId), routes NOTHING else', () => {
    const { result, activateProject, setActiveWorkspace } = setup();
    pick(result, { kind: 'enzyme', id: 'EcoRI' });
    expect(result.current.enzymeCardId).toBe('EcoRI');
    expect(activateProject).not.toHaveBeenCalled();
    expect(setActiveWorkspace).not.toHaveBeenCalled();
  });

  it('a ref with NO kind fails CLOSED — nothing is routed (never a phantom entry)', () => {
    const { result, openEntry, activateProject } = setup({ libraryEntries: { x: { id: 'x' } } });
    pick(result, { id: 'x' });     // kind lost
    pick(result, null);            // no ref at all
    expect(openEntry).not.toHaveBeenCalled();
    expect(activateProject).not.toHaveBeenCalled();
  });
});

describe('useSearchPickRouter — enzyme site-scan (canonical, quoted)', () => {
  it('scanEnzymeSites quotes a name with spaces + closes the card', () => {
    const { result, setQuery } = setup();
    pick(result, { kind: 'enzyme', id: 'My Enzyme' });
    expect(result.current.enzymeCardId).toBe('My Enzyme');
    act(() => result.current.scanEnzymeSites('My Enzyme'));
    expect(setQuery).toHaveBeenCalledWith('cut:"My Enzyme"'); // NOT the broken `cut:My Enzyme`
    expect(result.current.enzymeCardId).toBeNull();
  });
});
