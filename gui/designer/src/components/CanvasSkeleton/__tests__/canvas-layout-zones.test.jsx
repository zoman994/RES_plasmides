/**
 * canvas-layout-zones.test.jsx — T4 K8/K11 integration. ZoneLayer
 * mounts in CanvasLayoutView; cross-zone junctions render dashed.
 *
 * The live drag→MOVE_NODE_TO_ZONE gesture is verified in-browser
 * (synthetic getBoundingClientRect is 0 in happy-dom — documented
 * class, BUGS V78/V80); the underlying units (findZoneAtPoint,
 * selectZoneByNodeId, the hook wiring, moveNodeToZone action) are
 * each unit-tested elsewhere.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import {
  SkeletonProvider, useSkeletonState, useSkeletonActions,
} from '../store/skeleton-context';
import React, { useEffect } from 'react';

afterEach(cleanup);

function Harness({ onReady }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  useEffect(() => { onReady({ state, actions }); });
  return <CanvasLayoutView />;
}

function mount() {
  let ref = null;
  render(
    <SkeletonProvider>
      <Harness onReady={(r) => { ref = r; }} />
    </SkeletonProvider>,
  );
  return () => ref;
}

describe('T4 K8/K11 CanvasLayoutView ↔ zones', () => {
  it('renders a ZoneFrame for a created zone (DEC-T3-08 reversed: no default)', () => {
    const get = mount();
    expect(get().state.zones).toEqual([]); // clean start, no seeded zone
    act(() => {
      get().actions.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'A', bounds: { x: 0, y: 0, width: 300, height: 200 } } });
    });
    const zones = get().state.zones;
    expect(zones).toHaveLength(1);
    expect(screen.getByTestId(`zone-frame-${zones[0].id}`)).toBeTruthy();
  });

  it('cross-zone junction path renders dashed (data-cross-zone=true)', () => {
    const get = mount();
    const { actions } = get();
    act(() => {
      actions.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'A', bounds: { x: 0, y: 0, width: 300, height: 200 } } });
      actions.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'B', bounds: { x: 0, y: 0, width: 300, height: 200 } } });
    });
    const { state } = get();
    const [zA, zB] = state.zones;
    // two containers, one per zone, joined by a junction
    act(() => {
      actions.addContainer({ id: 'cz-1', kind: 'molecule', name: 'A', sequence: 'AAAA', topology: { circular: false }, annotations: [] }, { x: 50, y: 50 });
      actions.addContainer({ id: 'cz-2', kind: 'molecule', name: 'B', sequence: 'TTTT', topology: { circular: false }, annotations: [] }, { x: 400, y: 50 });
    });
    act(() => {
      actions.moveNodeToZone('container', 'cz-1', zA.id);
      actions.moveNodeToZone('container', 'cz-2', zB.id);
      actions.reconcileAutoJunctions([{ fromContainerId: 'cz-1', toContainerId: 'cz-2', kind: 'auto' }]);
    });
    const dashed = document.querySelector('path[data-cross-zone="true"]');
    expect(dashed).toBeTruthy();
    expect(dashed.getAttribute('stroke-dasharray')).toBe('6,3');
  });
});
