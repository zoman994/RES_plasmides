/**
 * lineage-panel-position.test.jsx — V144 (Игорь 12.06, screenshot).
 *
 * In the two-level workspace the whole CanvasArea is filled by the active
 * assembly view, so the LineagePanel — a canvas-era overlay pinned bottom-left —
 * landed ON TOP of the SegmentList «Источник» footer + the «+ Сегмент» /
 * «Codon stats» toolbar AND, lacking pointer-events:none, BLOCKED clicks
 * («происхождение закрывает окно»). The panel must move off the bottom toolbar
 * and never eat pointer events.
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

function mountWithHighlight() {
  render(<SkeletonProvider><H /><LineagePanel /></SkeletonProvider>);
  act(() => {
    A.zoneDispatch({
      type: 'REPLACE_STATE',
      state: {
        containers: [{ id: 'c1', name: 'pRBC-sfGFP', origin: { kind: 'tree_drag' } }],
        operations: [], pieces: [], zones: [],
      },
    });
  });
  // REPLACE_STATE resets the transient highlight → set it explicitly.
  act(() => { A.setHighlight('c1'); });
}

describe('LineagePanel — non-blocking + off the bottom toolbar (V144)', () => {
  it('renders the provenance chain for the highlighted container', () => {
    mountWithHighlight();
    expect(screen.getByTestId('skeleton-lineage-panel')).toBeTruthy();
    expect(screen.getByText('добавлено из дерева')).toBeTruthy();
  });

  it('never blocks pointer events (pointer-events:none)', () => {
    mountWithHighlight();
    expect(screen.getByTestId('skeleton-lineage-panel').style.pointerEvents).toBe('none');
  });

  it('is no longer pinned to the bottom (where the workspace toolbar lives)', () => {
    mountWithHighlight();
    const panel = screen.getByTestId('skeleton-lineage-panel');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.top).not.toBe('');
  });
});
