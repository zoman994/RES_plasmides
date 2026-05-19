/**
 * zone-attach-containment.test.js — TD-ZONE-ATTACH-CONTAINMENT H2+H3
 * (Игорь 18.05.2026 «делай до конца»): «прикрепляются криво / внутри
 * не держатся».
 *
 * Mechanism (UI drop in useCanvasLayoutDrag switches the dropped-on
 * zone to laneLayout:'manual'; here we assert what that buys us at the
 * reducer/finalizer level — deterministic, jsdom can't model the drag):
 *   H3 — a MANUAL zone runs the grow-only union finalizer, so its
 *        frame grows to ENCLOSE a member dragged out of bounds («узел
 *        держится внутри»).
 *   H2 — a MANUAL zone is SKIPPED by the 3-lane finalizer, so manual
 *        placement is NOT re-laid / siblings not shuffled («не криво»).
 *   Control: an AUTO zone does NOT grow (autoOwned skip) — proving the
 *        manual switch is exactly the fix.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { applyZoneLayouts } from '../lib/zone-layout';

function seed(laneLayout) {
  const base = buildInitialState();
  return {
    ...base,
    zones: [{
      id: 'zS', name: 'Сборка', viewMode: 'graph', laneLayout,
      collapsed: false, autoResize: true,
      bounds: {
        x: 100, y: 100, width: 200, height: 150,
      },
    }],
    containers: [{
      id: 'src', kind: 'molecule', name: 'src', sequence: 'ACGT', annotations: [],
      topology: { circular: false }, zoneId: 'zS', pinned: true,
    }],
    operations: [{
      id: 'op1', kind: 'pcr', status: 'committed', inputs: ['src'], outputs: [],
      inputPieces: [], zoneId: 'zS', position: { x: 120, y: 120 }, pinned: true,
      materializedClones: null,
    }],
    pieces: [], junctions: [], positions: {},
  };
}
const zoneOf = (s) => s.zones.find((z) => z.id === 'zS');
const FAR = { x: 900, y: 700 }; // well outside the 100,100..300,250 frame

describe('TD-ZONE-ATTACH-CONTAINMENT — manual zone keeps members inside', () => {
  it('H3: MANUAL zone grows to enclose a member moved out of bounds', () => {
    const s = skeletonReducer(seed('manual'), {
      type: 'OP_SET_POSITION', operationId: 'op1', position: FAR,
    });
    const b = zoneOf(s).bounds;
    // frame expanded so the far member is inside the zone rect
    expect(b.x + b.width).toBeGreaterThanOrEqual(FAR.x);
    expect(b.y + b.height).toBeGreaterThanOrEqual(FAR.y);
    expect(b.x).toBeLessThanOrEqual(120); // grow-only — origin not lost
  });

  it('control: AUTO zone does NOT grow (member ends up outside) — why manual is the fix', () => {
    const s = skeletonReducer(seed('auto'), {
      type: 'OP_SET_POSITION', operationId: 'op1', position: FAR,
    });
    const b = zoneOf(s).bounds;
    expect(b.x + b.width).toBeLessThan(FAR.x); // frame did NOT chase the member
  });

  it('H2: applyZoneLayouts does NOT reposition a MANUAL zone member (no re-lay)', () => {
    const s0 = seed('manual');
    s0.operations[0].pinned = false; // even an UNpinned member is left alone
    const s1 = applyZoneLayouts(s0);
    expect(s1.operations.find((o) => o.id === 'op1').position).toEqual({ x: 120, y: 120 });
  });

  it('grow-only union is idempotent (no finalizer loop)', () => {
    const a = skeletonReducer(seed('manual'), {
      type: 'OP_SET_POSITION', operationId: 'op1', position: FAR,
    });
    const b = skeletonReducer(a, { type: 'SET_FOCUSED_ZONE', zoneId: 'zS' });
    expect(zoneOf(b).bounds).toEqual(zoneOf(a).bounds);
  });
});
