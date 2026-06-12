/**
 * zone-manual-resize.test.js — Игорь 11.06: «размер области сборки не
 * регулируется».
 *
 * Root cause: an auto+graph zone's SIZE is deterministic — applyZoneLayout
 * overwrites width/height on every pass to fit the laid nodes — so a manual
 * handle drag (UPDATE_ZONE_BOUNDS) snapped straight back. The only opt-out,
 * `autoResize:false`, had NO action to set it (skeleton-state-zones.test.js
 * even notes "no action for it in T3/T4 scope").
 *
 * Fix: SET_ZONE_AUTO_RESIZE flips the per-zone opt-out. The resize gesture
 * sets it false (the user's size sticks while nodes keep auto-arranging); the
 * header «подогнать» button sets it true (one click re-fits to the graph via
 * the post-action finalizer).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { applyZoneLayouts } from '../lib/zone-layout';

function seed(boundsOver = {}, zoneOver = {}) {
  const base = buildInitialState();
  return {
    ...base,
    zones: [{
      id: 'zS', name: 'Сборка', viewMode: 'graph', laneLayout: 'auto',
      collapsed: false, autoResize: true,
      bounds: {
        x: 100, y: 100, width: 600, height: 400, ...boundsOver,
      },
      ...zoneOver,
    }],
    containers: [
      {
        id: 'src', kind: 'molecule', name: 'src', sequence: 'ACGT', annotations: [],
        topology: { circular: false }, zoneId: 'zS', pinned: false,
      },
      {
        id: 'prod', kind: 'molecule', name: 'asm-product', sequence: 'ACGT', annotations: [],
        topology: { circular: false }, zoneId: 'zS', pinned: false,
        origin: { kind: 'realised-product' },
      },
    ],
    operations: [{
      id: 'op1', kind: 'pcr', status: 'committed', inputs: ['src'], outputs: ['prod'],
      inputPieces: [], zoneId: 'zS', position: { x: 0, y: 0 }, pinned: false,
      materializedClones: null,
    }],
    pieces: [], junctions: [], positions: {},
  };
}
const zoneOf = (s) => s.zones.find((z) => z.id === 'zS');

describe('SET_ZONE_AUTO_RESIZE — manual zone size opt-out', () => {
  it('sets autoResize false then true', () => {
    let s = seed();
    s = skeletonReducer(s, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'zS', autoResize: false });
    expect(zoneOf(s).autoResize).toBe(false);
    s = skeletonReducer(s, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'zS', autoResize: true });
    expect(zoneOf(s).autoResize).toBe(true);
  });

  it('unknown zone → identity (same ref)', () => {
    // Settle first so the post-action auto-layout finalizer is a no-op and
    // the only thing that could change state is the (absent) target zone.
    const s = applyZoneLayouts(seed());
    expect(
      skeletonReducer(s, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'nope', autoResize: false }),
    ).toBe(s);
  });

  it('no-op when already at the target value (same ref)', () => {
    const s = applyZoneLayouts(seed()); // autoResize true by default
    expect(
      skeletonReducer(s, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'zS', autoResize: true }),
    ).toBe(s);
  });

  it('manual size STICKS — the finalizer leaves an autoResize:false zone alone', () => {
    let s = applyZoneLayouts(seed()); // settle the auto size first
    s = skeletonReducer(s, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'zS', autoResize: false });
    s = skeletonReducer(s, {
      type: 'UPDATE_ZONE_BOUNDS', zoneId: 'zS', bounds: { x: 100, y: 100, width: 999, height: 888 },
    });
    expect(zoneOf(s).bounds.width).toBe(999);
    expect(zoneOf(s).bounds.height).toBe(888);
    // The grow-only / lane finalizers must NOT chase the content back.
    const after = applyZoneLayouts(s);
    expect(zoneOf(after).bounds.width).toBe(999);
    expect(zoneOf(after).bounds.height).toBe(888);
  });

  it('«подогнать» (re-enable autoResize) re-fits the frame to the graph', () => {
    const autoSized = applyZoneLayouts(seed());
    const autoW = zoneOf(autoSized).bounds.width;
    const autoH = zoneOf(autoSized).bounds.height;
    let s = skeletonReducer(autoSized, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'zS', autoResize: false });
    s = skeletonReducer(s, {
      type: 'UPDATE_ZONE_BOUNDS', zoneId: 'zS', bounds: { x: 100, y: 100, width: 1500, height: 1200 },
    });
    expect(zoneOf(s).bounds.width).toBe(1500); // manual size took
    // One click on «подогнать» → the post-action finalizer re-fits.
    s = skeletonReducer(s, { type: 'SET_ZONE_AUTO_RESIZE', zoneId: 'zS', autoResize: true });
    expect(zoneOf(s).bounds.width).toBe(autoW);
    expect(zoneOf(s).bounds.height).toBe(autoH);
  });
});
