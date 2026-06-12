/**
 * assembly-workspace-state.test.js — M-WORKSPACE K1.
 *
 * Two-level assembly-tab workspace state: activeAssemblyId (focused top tab) +
 * assemblyViewByZone (per-assembly active view). Additive to the base slice.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('M-WORKSPACE K1 — workspace state', () => {
  it('buildInitialState seeds activeAssemblyId null + empty assemblyViewByZone', () => {
    const s = buildInitialState();
    expect(s.activeAssemblyId).toBeNull();
    expect(s.assemblyViewByZone).toEqual({});
  });

  it('SET_ACTIVE_ASSEMBLY sets the active id (identity no-op when unchanged)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SET_ACTIVE_ASSEMBLY', zoneId: 'z1' });
    expect(s.activeAssemblyId).toBe('z1');
    const same = skeletonReducer(s, { type: 'SET_ACTIVE_ASSEMBLY', zoneId: 'z1' });
    expect(same).toBe(s);
  });

  it('SET_ASSEMBLY_VIEW writes a per-zone view from the allowed set', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SET_ASSEMBLY_VIEW', zoneId: 'z1', view: 'dag' });
    expect(s.assemblyViewByZone.z1).toBe('dag');
    s = skeletonReducer(s, { type: 'SET_ASSEMBLY_VIEW', zoneId: 'z1', view: 'primers' });
    expect(s.assemblyViewByZone.z1).toBe('primers');
  });

  it('SET_ASSEMBLY_VIEW ignores an unknown view', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SET_ASSEMBLY_VIEW', zoneId: 'z1', view: 'dag' });
    const before = s.assemblyViewByZone.z1;
    s = skeletonReducer(s, { type: 'SET_ASSEMBLY_VIEW', zoneId: 'z1', view: 'bogus' });
    expect(s.assemblyViewByZone.z1).toBe(before);
  });

  it('REMOVE_ZONE clears activeAssemblyId when the active zone is removed', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ZONE', zone: { name: 'A', bounds: { x: 0, y: 0, width: 600, height: 400 } } });
    const zid = s.zones[s.zones.length - 1].id;
    s = skeletonReducer(s, { type: 'SET_ACTIVE_ASSEMBLY', zoneId: zid });
    expect(s.activeAssemblyId).toBe(zid);
    s = skeletonReducer(s, { type: 'REMOVE_ZONE', zoneId: zid });
    expect(s.activeAssemblyId).toBeNull();
  });
});
