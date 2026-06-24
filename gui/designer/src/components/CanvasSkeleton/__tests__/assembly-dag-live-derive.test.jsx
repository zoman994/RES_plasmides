/**
 * assembly-dag-live-derive — Игорь 22.06.2026: «когда выбрал кусок, на DAG уже
 * должна появиться карточка исходника + Cut = фрагмент» («живой вывод из кусков»).
 * The DAG view derives source→Cut→fragment from the picked PIECE — no «Реализовать».
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act,
} from '@testing-library/react';
import { SkeletonProvider, useSkeletonActions } from '../store/skeleton-context';
import AssemblyDagView from '../workspace/AssemblyDagView';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
function H() { A = useSkeletonActions(); return null; }

const SEQ = 'ATGCATGCATGCATGCATGC';

// Source container has NO zoneId (a library source) — proving the derive
// resolves it by id even though nodeListInZone (zone-filtered) never would.
const restrictionPickState = () => ({
  containers: [{
    id: 'c1', kind: 'molecule', name: 'pUC19', sequence: SEQ, length: SEQ.length, topology: { circular: true }, annotations: [],
  }],
  operations: [],
  pieces: [{
    id: 'p1',
    zoneId: 'z1',
    kind: 'sourced',
    ranges: [{ sourceId: 'c1', start: 0, end: 10, orientation: 'forward' }],
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes: ['EcoRI'], cutSites: [{ position: 5 }] },
    createdAt: 1,
  }],
  zones: [{ id: 'z1', name: 'Assembly', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
});

function mount(seed) {
  render(
    <SkeletonProvider>
      <H />
      <AssemblyDagView zoneId="z1" />
    </SkeletonProvider>,
  );
  act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: seed }); });
}

describe('AssemblyDagView — live derive from pieces', () => {
  it('a picked restriction piece renders source → Cut → fragment (no realise)', () => {
    mount(restrictionPickState());
    expect(screen.getByTestId('zone-graph-content')).toBeTruthy();
    const { textContent } = screen.getByTestId('assembly-dag-view');
    expect(textContent).toContain('Cut');     // the derived reaction op
    expect(textContent).toContain('pUC19');   // the source container card
  });

  it('no pieces → empty hint (back-compat with the stored-node path)', () => {
    mount({
      containers: [], operations: [], pieces: [],
      zones: [{ id: 'z1', name: 'Empty', bounds: { x: 0, y: 0, width: 400, height: 300 } }],
    });
    expect(screen.queryByTestId('zone-graph-content')).toBeNull();
  });
});
