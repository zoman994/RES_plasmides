/**
 * canvas-drop-authoritative-k1.test.js — M-CANVAS-FIX.1 K1.
 *
 * Decision (Игорь §0.5): canvas = authoritative auto-layout; in-zone nodes are
 * NOT hand-arranged. A drop INTO / WITHIN a zone must therefore NOT flip the
 * whole zone to laneLayout:'manual' and must NOT pin the node — auto-layout
 * re-snaps it. Only a LOOSE drop (node left outside every zone) pins (free
 * positioning is the loose-node model). Containment of a zoned member is held
 * by auto-size (zone-layout), not by the old manual-grow path.
 *
 * The drop decision is a pure helper (dropLayoutEffects) so it is unit-testable
 * without simulating pointer events in the hook (jsdom can't model the drag).
 */
import { describe, it, expect } from 'vitest';
import { dropLayoutEffects } from '../canvas/canvas-layout';
import { applyZoneLayouts } from '../lib/zone-layout';
import { buildInitialState } from '../store/skeleton-state';

// ─── dropLayoutEffects — the pure drop decision ────────────────────────────

describe('K1 — dropLayoutEffects: zoned drop is authoritative (no flip, no pin)', () => {
  const ZONE = { id: 'zS', laneLayout: 'auto' };

  it('container dropped INTO a zone → not pinned, zone not flipped to manual', () => {
    expect(dropLayoutEffects({ kind: 'container', droppedZoneTarget: ZONE }))
      .toEqual({ pin: false, flipZoneManual: false });
  });

  it('operation dropped INTO a zone → not pinned, zone not flipped', () => {
    expect(dropLayoutEffects({ kind: 'operation', droppedZoneTarget: ZONE }))
      .toEqual({ pin: false, flipZoneManual: false });
  });

  it('LOOSE container drop (outside any zone) → pinned (free positioning kept)', () => {
    expect(dropLayoutEffects({ kind: 'container', droppedZoneTarget: null }))
      .toEqual({ pin: true, flipZoneManual: false });
  });

  it('LOOSE operation drop → pinned', () => {
    expect(dropLayoutEffects({ kind: 'operation', droppedZoneTarget: null }))
      .toEqual({ pin: true, flipZoneManual: false });
  });

  it('assembly draft is never a zone node and never pinned', () => {
    expect(dropLayoutEffects({ kind: 'assembly', droppedZoneTarget: null }))
      .toEqual({ pin: false, flipZoneManual: false });
  });

  it('flipZoneManual is NEVER true — auto-layout stays authoritative (frozen)', () => {
    for (const kind of ['container', 'operation', 'assembly']) {
      for (const t of [null, ZONE]) {
        expect(dropLayoutEffects({ kind, droppedZoneTarget: t }).flipZoneManual).toBe(false);
      }
    }
  });
});

// ─── K1.0 verify-first — containment via auto-size, not manual ─────────────

describe('K1.0 — a zoned member is auto-laid WITHIN bounds (containment via auto-size)', () => {
  function autoZoneWithMember() {
    const base = buildInitialState();
    return {
      ...base,
      zones: [{
        id: 'zS', name: 'Z', viewMode: 'graph', laneLayout: 'auto',
        collapsed: false, autoResize: true,
        bounds: { x: 100, y: 100, width: 200, height: 150 },
      }],
      containers: [{
        id: 'src', kind: 'molecule', name: 'src', sequence: 'ACGT', annotations: [],
        topology: { circular: false }, zoneId: 'zS', pinned: false,
      }],
      operations: [], pieces: [], junctions: [], positions: {},
    };
  }

  it('the member lands inside the zone frame and the zone stays auto', () => {
    const s = applyZoneLayouts(autoZoneWithMember());
    const zone = s.zones.find((z) => z.id === 'zS');
    const p = s.positions.src;
    expect(zone.laneLayout).not.toBe('manual'); // never flipped
    expect(p).toBeTruthy();
    // auto-laid within the (possibly grown) frame
    expect(p.x).toBeGreaterThanOrEqual(zone.bounds.x);
    expect(p.y).toBeGreaterThanOrEqual(zone.bounds.y);
    expect(p.x).toBeLessThanOrEqual(zone.bounds.x + zone.bounds.width);
    expect(p.y).toBeLessThanOrEqual(zone.bounds.y + zone.bounds.height);
  });
});
