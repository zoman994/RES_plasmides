/**
 * lineage-realise-provenance-a13.test.jsx — audit A13/A14. Realise-path
 * containers carry origin {kind:'realised'|'realised-product'} with NO
 * parentContainerId/inputIds, so LineagePanel's walk used to stop at node 0 and
 * render the raw 'realised' token. The panel now resolves the producing op (its
 * outputs include the container) and walks back through its inputs, and labels
 * the realise origin kinds humanly.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act,
} from '@testing-library/react';
import { SkeletonProvider, useSkeletonActions } from '../store/skeleton-context';
import LineagePanel from '../LineagePanel';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
function H() { A = useSkeletonActions(); return null; }

function mountRealiseChain() {
  render(<SkeletonProvider><H /><LineagePanel /></SkeletonProvider>);
  act(() => {
    A.zoneDispatch({
      type: 'REPLACE_STATE',
      state: {
        containers: [
          { id: 'src', name: 'pUC19', origin: { kind: 'tree_drag' } },
          { id: 'frag1', name: 'asm-frag-1', origin: { kind: 'realised', assemblyId: 'z', segmentId: 's1' } },
          { id: 'prod', name: 'asm-product', origin: { kind: 'realised-product', assemblyId: 'z' } },
        ],
        operations: [
          { id: 'op-pcr', kind: 'pcr', inputs: ['src'], outputs: ['frag1'] },
          { id: 'op-asm', kind: 'gibson', inputs: ['frag1'], outputs: ['prod'] },
        ],
        pieces: [], zones: [],
      },
    });
  });
  act(() => { A.setHighlight('prod'); });
}

describe('LineagePanel — realise-path provenance (A13/A14)', () => {
  it('walks back through the producing ops to the source container', () => {
    mountRealiseChain();
    // The chain reaches the original source (would stop at «prod» before the fix).
    expect(screen.getByText('pUC19')).toBeTruthy();
    expect(screen.getByText('asm-frag-1')).toBeTruthy();
  });

  it('labels realise origin kinds humanly, not the raw token', () => {
    mountRealiseChain();
    expect(screen.getByText('продукт сборки')).toBeTruthy();
    expect(screen.getByText('фрагмент (ПЦР)')).toBeTruthy();
    expect(screen.queryByText('realised-product')).toBeNull();
  });
});
