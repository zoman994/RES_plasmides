/**
 * PC-K6 — AssemblyDraftsPanel hidden when zones=0.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import AssemblyDraftsPanel from '../canvas/AssemblyDraftsPanel';
import { bootstrapStore } from '../../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(cleanup);

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('PC-K6 — counter conditional on zones.length > 0', () => {
  it('hidden when zones empty', () => {
    render(
      <SkeletonProvider>
        <H />
        <AssemblyDraftsPanel />
      </SkeletonProvider>,
    );
    expect(screen.queryByTestId('assembly-drafts-toggle')).toBeNull();
  });

  it('visible once a zone exists', () => {
    render(
      <SkeletonProvider>
        <H />
        <AssemblyDraftsPanel />
      </SkeletonProvider>,
    );
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
    const btn = screen.getByTestId('assembly-drafts-toggle');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/Сборки \(1\)/);
  });
});
