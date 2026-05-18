/**
 * zone-toggle-integration.test.jsx — T7 K15.
 *
 * ZoneLayer end-to-end: G/S toggle button flips viewMode and mounts
 * ZoneSequenceMode inline; hover sets focusedZoneId; the sequence frame
 * occludes graph nodes (zIndex 60 > nodes, opaque bg — R-T7-1 / K14);
 * palette→strip drop dispatches ATTACH and the zone becomes assembled;
 * the G/S hotkey entries exist and are input-guarded (R-T7-4).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { useReducer } from 'react';
import ZoneLayer from '../canvas/ZoneLayer';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { HOTKEYS } from '../../../lib/hotkeys';
import { PIECE_MIME } from '../canvas/zone-sequence-mode/piece-drag';

afterEach(cleanup);

const C = {
  id: 'cZ', name: 'pUC', kind: 'molecule', zoneId: null,
  sequence: 'AAAACCCCGGGGTTTT', annotations: [],
};

function seed() {
  let s = buildInitialState({ forceEmptyZones: true });
  s = { ...s, containers: [...s.containers, C] };
  s = skeletonReducer(s, {
    type: 'CREATE_ZONE',
    zone: { name: 'Z', bounds: { x: 0, y: 0, width: 700, height: 400 } },
  });
  const zid = s.zones[s.zones.length - 1].id;
  s = skeletonReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      kind: 'sourced', name: 'pcA', sourceIds: ['cZ'],
      ranges: [{ sourceId: 'cZ', start: 0, end: 8, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  const pid = s.pieces[s.pieces.length - 1].id;
  s = skeletonReducer(s, { type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid });
  return { s, zid, pid };
}

function Harness({ initial }) {
  const [state, dispatch] = useReducer(skeletonReducer, initial);
  return <ZoneLayer state={state} dispatch={dispatch} />;
}

describe('T7 K15 — ZoneLayer G/S toggle + sync integration', () => {
  it('default graph-mode: frame is a background (zIndex 1), no sequence root', () => {
    const { s, zid } = seed();
    render(<Harness initial={s} />);
    const frame = screen.getByTestId(`zone-frame-${zid}`);
    expect(frame.getAttribute('data-view-mode')).toBe('graph');
    expect(frame.style.zIndex).toBe('1');
    expect(screen.queryByTestId('zone-seq-root')).toBeNull();
  });

  it('toggle button → SET_ZONE_VIEW_MODE; ZoneSequenceMode mounts; frame occludes nodes (zIndex 60)', () => {
    const { s, zid } = seed();
    render(<Harness initial={s} />);
    act(() => { fireEvent.click(screen.getByTestId(`zone-view-toggle-${zid}`)); });
    const frame = screen.getByTestId(`zone-frame-${zid}`);
    expect(frame.getAttribute('data-view-mode')).toBe('sequence');
    expect(Number(frame.style.zIndex)).toBeGreaterThanOrEqual(60); // R-T7-1
    expect(screen.getByTestId('zone-seq-root')).toBeTruthy();
    // 1 piece, order=null → palette state.
    expect(screen.getByTestId('zone-seq-palette')).toBeTruthy();
  });

  it('hover the frame → SET_FOCUSED_ZONE (focusedZoneId updates)', () => {
    const { s, zid } = seed();
    function Probe() {
      const [state, dispatch] = useReducer(skeletonReducer, s);
      return (
        <>
          <span data-testid="focus">{state.focusedZoneId || 'none'}</span>
          <ZoneLayer state={state} dispatch={dispatch} />
        </>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId('focus').textContent).toBe('none');
    act(() => { fireEvent.pointerEnter(screen.getByTestId(`zone-frame-${zid}`)); });
    expect(screen.getByTestId('focus').textContent).toBe(zid);
  });

  it('palette → strip drop dispatches ATTACH; zone flips to assembled', () => {
    const { s, zid } = seed();
    render(<Harness initial={s} />);
    act(() => { fireEvent.click(screen.getByTestId(`zone-view-toggle-${zid}`)); });
    const drop = screen.getByTestId('zone-seq-strip-drop');
    const store = {};
    const dataTransfer = {
      getData: (k) => store[k] || '',
      setData: (k, v) => { store[k] = v; },
      types: { includes: (k) => k in store },
    };
    // emulate the palette card's dragstart payload
    const card = screen.getByTestId('zone-seq-piece-card');
    act(() => { fireEvent.dragStart(card, { dataTransfer }); });
    act(() => { fireEvent.dragOver(drop, { dataTransfer }); });
    act(() => { fireEvent.drop(drop, { dataTransfer, clientX: 0 }); });
    expect(screen.getByTestId('zone-seq-assembled')).toBeTruthy();
  });

  it('G/S hotkeys are registered and input-guarded (R-T7-4)', () => {
    expect(HOTKEYS['toggle-zone-view-graph']).toBeTruthy();
    expect(HOTKEYS['toggle-zone-view-graph'].allowInInput).toBe(false);
    expect(HOTKEYS['toggle-zone-view-sequence'].allowInInput).toBe(false);
    expect(HOTKEYS['toggle-zone-view-graph'].keys.other.key).toBe('g');
    expect(HOTKEYS['toggle-zone-view-sequence'].keys.other.key).toBe('s');
  });
});
