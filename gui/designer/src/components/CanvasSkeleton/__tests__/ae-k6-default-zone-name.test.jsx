/**
 * AE-K6 — Default zone name "Сборка N" with gap-fill.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';
import { nextZoneName } from '../lib/zone-model';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function mount() {
  return render(<SkeletonProvider><H /></SkeletonProvider>);
}

describe('AE-K6 — nextZoneName (pure)', () => {
  it('returns "Сборка 1" for empty list', () => {
    expect(nextZoneName([])).toBe('Сборка 1');
    expect(nextZoneName(undefined)).toBe('Сборка 1');
  });

  it('increments past existing default names', () => {
    expect(nextZoneName([{ name: 'Сборка 1' }])).toBe('Сборка 2');
    expect(nextZoneName([{ name: 'Сборка 1' }, { name: 'Сборка 2' }])).toBe('Сборка 3');
  });

  it('gap-fills holes', () => {
    expect(nextZoneName([{ name: 'Сборка 1' }, { name: 'Сборка 3' }]))
      .toBe('Сборка 2');
  });

  it('ignores non-default-pattern names', () => {
    expect(nextZoneName([{ name: 'my custom' }])).toBe('Сборка 1');
    expect(nextZoneName([{ name: 'my custom' }, { name: 'Сборка 1' }]))
      .toBe('Сборка 2');
  });
});

describe('AE-K6 — CREATE_ZONE default name when blank', () => {
  it('assigns "Сборка 1" when no name supplied', () => {
    mount();
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const z = S.zones[S.zones.length - 1];
    expect(z.name).toBe('Сборка 1');
  });

  it('assigns sequential names on multiple creates', () => {
    mount();
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    expect(S.zones.slice(-2).map((z) => z.name)).toEqual(['Сборка 1', 'Сборка 2']);
  });

  it('preserves explicit name when biolog supplies one', () => {
    mount();
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'pks4-ko', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const z = S.zones[S.zones.length - 1];
    expect(z.name).toBe('pks4-ko');
  });

  it('treats whitespace-only name as blank → default', () => {
    mount();
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: '   ', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const z = S.zones[S.zones.length - 1];
    expect(z.name).toBe('Сборка 1');
  });
});
