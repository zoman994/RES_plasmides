/**
 * ZoneLayer — renders every zone as a ZoneFrame and owns the drag /
 * resize gestures + context-menu popover (T4 K5, DEC-T4-16 RAF throttle).
 *
 * Gesture state lives in refs (no stale closures, no re-render per
 * pointermove). Drag → one RAF-coalesced DRAG_ZONE per frame. Resize →
 * UPDATE_ZONE_BOUNDS with bounds computed from the resize-start bounds +
 * TOTAL delta (T3 reducer contract is {bounds}; spec §5.2 pseudo passed
 * {edge,delta} — corrected here via resizeZoneBounds).
 */
import React, { useEffect, useRef, useState } from 'react';
import ZoneFrame from './ZoneFrame';
import ZoneContextMenu from './ZoneContextMenu';
import { selectAllZones } from '../store/selectors-zones';
import { nodeListInZone } from '../lib/zone-model';
import { resizeZoneBounds } from '../lib/zone-bounds';

function countNodes(state, zoneId) {
  const { containers, pieces, operations } = nodeListInZone(state, zoneId);
  return containers.length + pieces.length + operations.length;
}

export default function ZoneLayer({
  state, dispatch, onNavigateToZone, onOperationClick, onContainerClick,
}) {
  const zones = selectAllZones(state);
  const [menu, setMenu] = useState(null); // {zoneId,x,y} | null
  const gesture = useRef(null);

  useEffect(() => () => {
    // Unmount safety — drop any dangling document listeners.
    const g = gesture.current;
    if (g) {
      document.removeEventListener('pointermove', g.onMove);
      document.removeEventListener('pointerup', g.onUp);
      if (g.rafId) cancelAnimationFrame(g.rafId);
      gesture.current = null;
    }
  }, []);

  function endGesture() {
    const g = gesture.current;
    if (!g) return;
    document.removeEventListener('pointermove', g.onMove);
    document.removeEventListener('pointerup', g.onUp);
    if (g.rafId) { cancelAnimationFrame(g.rafId); g.rafId = null; }
    g.flush(true);
    gesture.current = null;
  }

  function startDrag(zone, e) {
    const g = {
      kind: 'drag',
      zoneId: zone.id,
      lastX: e.clientX,
      lastY: e.clientY,
      pending: { dx: 0, dy: 0 },
      rafId: null,
    };
    g.flush = (final) => {
      if (g.pending.dx === 0 && g.pending.dy === 0) return;
      dispatch({ type: 'DRAG_ZONE', zoneId: g.zoneId, delta: { ...g.pending } });
      g.pending = { dx: 0, dy: 0 };
      if (!final) g.rafId = null;
    };
    g.onMove = (ev) => {
      g.pending.dx += ev.clientX - g.lastX;
      g.pending.dy += ev.clientY - g.lastY;
      g.lastX = ev.clientX;
      g.lastY = ev.clientY;
      if (g.rafId) return;
      g.rafId = requestAnimationFrame(() => { g.flush(false); });
    };
    g.onUp = () => endGesture();
    gesture.current = g;
    document.addEventListener('pointermove', g.onMove);
    document.addEventListener('pointerup', g.onUp);
  }

  function startResize(zone, edge, e) {
    const g = {
      kind: 'resize',
      zoneId: zone.id,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...zone.bounds },
      rafId: null,
      lastBounds: null,
      optedOut: false,
    };
    g.compute = (ev) => resizeZoneBounds(
      { bounds: g.startBounds },
      edge,
      { dx: ev.clientX - g.startX, dy: ev.clientY - g.startY },
    );
    g.flush = () => {
      if (!g.lastBounds) return;
      dispatch({ type: 'UPDATE_ZONE_BOUNDS', zoneId: g.zoneId, bounds: g.lastBounds });
      g.rafId = null;
    };
    g.onMove = (ev) => {
      // Opt out of the deterministic auto-size on the FIRST real drag (not a
      // bare click on the handle) so the manual bounds stick instead of being
      // snapped back by applyZoneLayout (Игорь 11.06). Nodes keep
      // auto-arranging; the header «подогнать» button re-enables the fit.
      if (!g.optedOut) {
        g.optedOut = true;
        dispatch({ type: 'SET_ZONE_AUTO_RESIZE', zoneId: g.zoneId, autoResize: false });
      }
      g.lastBounds = g.compute(ev);
      if (g.rafId) return;
      g.rafId = requestAnimationFrame(() => { g.flush(); });
    };
    g.onUp = () => endGesture();
    gesture.current = g;
    document.addEventListener('pointermove', g.onMove);
    document.addEventListener('pointerup', g.onUp);
  }

  return (
    <>
      {zones.map((zone) => (
        <ZoneFrame
          key={zone.id}
          zone={zone}
          nodeCount={countNodes(state, zone.id)}
          state={state}
          dispatch={dispatch}
          onDragStart={(e) => startDrag(zone, e)}
          onResize={(edge, e) => startResize(zone, edge, e)}
          /* «подогнать» — re-enable auto-size; the post-action finalizer
             re-fits the frame to the graph (Игорь 11.06). */
          onFitToGraph={(zoneId) => dispatch({ type: 'SET_ZONE_AUTO_RESIZE', zoneId, autoResize: true })}
          /* `.2` — click a reaction diamond → host opens the in-zone op popup. */
          onOperationClick={onOperationClick}
          /* CANVAS-CLICK-3 — click a card → host opens the fragment info panel. */
          onContainerClick={onContainerClick}
          onContextMenu={(e) => setMenu({ zoneId: zone.id, x: e.clientX || 0, y: e.clientY || 0 })}
          onClickHeader={() => dispatch({ type: 'SET_ZONE_COLLAPSED', zoneId: zone.id, collapsed: !zone.collapsed })}
          onOpenAssembly={(zoneId) => dispatch({ type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: zoneId })}
          onToggleViewMode={(zoneId, viewMode) => dispatch({ type: 'SET_ZONE_VIEW_MODE', zoneId, viewMode })}
          onFocus={(zoneId) => dispatch({ type: 'SET_FOCUSED_ZONE', zoneId })}
          onNavigateToZone={onNavigateToZone}
          /* AV-K3 — quick-add piece from the zone header. Routes the
             4-kind picker through the editor assembly flow: open the
             editor on this zone, then surface the right modal. */
          onAddPiece={(zoneId, kind) => {
            // Open assembly editor for this zone so the existing
            // toolbar modals (picker / snippet / synthesis / gap)
            // become accessible. Then dispatch a transient flag so
            // AssemblyShellBody auto-opens the matching modal.
            dispatch({ type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: zoneId });
            dispatch({ type: 'REQUEST_ASSEMBLY_ADD_KIND', zoneId, kind });
          }}
        />
      ))}
      {menu && (
        <ZoneContextMenu
          zoneId={menu.zoneId}
          x={menu.x}
          y={menu.y}
          state={state}
          dispatch={dispatch}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
