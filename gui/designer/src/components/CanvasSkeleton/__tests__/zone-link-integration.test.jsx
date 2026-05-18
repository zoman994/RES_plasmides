/**
 * zone-link-integration.test.jsx — T8 K8/K9/K10.
 * Cross-zone badge renders in ZoneFrame header, click navigates, and
 * HIGHLIGHT_ZONE applies the transient accent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { useReducer } from 'react';
import ZoneLayer from '../canvas/ZoneLayer';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

afterEach(cleanup);

function seed() {
  let s = buildInitialState({ forceEmptyZones: true });
  s = skeletonReducer(s, {
    type: 'CREATE_ZONE', zone: { name: 'Zone A', bounds: { x: 0, y: 0, width: 600, height: 400 } },
  });
  s = skeletonReducer(s, {
    type: 'CREATE_ZONE', zone: { name: 'Zone B', bounds: { x: 800, y: 0, width: 600, height: 400 } },
  });
  const zA = s.zones[s.zones.length - 2].id;
  const zB = s.zones[s.zones.length - 1].id;
  // container cB lives in zone B
  s = { ...s, containers: [...s.containers, { id: 'cB', name: 'srcB', zoneId: zB, sequence: 'AAAACCCCGGGG' }] };
  // piece in zone A sourced from cB → cross-zone A←B
  s = skeletonReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      kind: 'sourced', name: 'pcX', sourceIds: ['cB'],
      ranges: [{ sourceId: 'cB', start: 0, end: 8, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  const pid = s.pieces[s.pieces.length - 1].id;
  s = skeletonReducer(s, { type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zA });
  return { s, zA, zB };
}

describe('T8 K8/K9 — cross-zone badge + navigate', () => {
  it('Zone A header shows a ← Zone B badge; Zone B has none', () => {
    const { s, zA, zB } = seed();
    render(<ZoneLayer state={s} dispatch={() => {}} onNavigateToZone={() => {}} />);
    const aLinks = screen.getByTestId(`zone-links-${zA}`);
    expect(aLinks.textContent).toMatch(/Zone B/);
    expect(screen.queryByTestId(`zone-links-${zB}`)).toBeNull();
  });

  it('badge click calls onNavigateToZone with the source zone id', () => {
    const { s, zA, zB } = seed();
    const onNav = vi.fn();
    render(<ZoneLayer state={s} dispatch={() => {}} onNavigateToZone={onNav} />);
    fireEvent.click(screen.getByTestId(`zone-links-${zA}`).querySelector('[data-testid="zone-link-badge"]'));
    expect(onNav).toHaveBeenCalledWith(zB);
  });
});

describe('T8 K10 — HIGHLIGHT_ZONE', () => {
  function Probe({ initial }) {
    const [state, dispatch] = useReducer(skeletonReducer, initial);
    return <ZoneLayer state={state} dispatch={dispatch} onNavigateToZone={() => {}} />;
  }

  it('HIGHLIGHT_ZONE sets highlightedUntil → frame data-highlighted=true; clear resets', () => {
    const { s, zB } = seed();
    let captured;
    function Wrap() {
      const [state, dispatch] = useReducer(skeletonReducer, s);
      captured = dispatch;
      return <ZoneLayer state={state} dispatch={dispatch} onNavigateToZone={() => {}} />;
    }
    render(<Wrap />);
    expect(screen.getByTestId(`zone-frame-${zB}`).getAttribute('data-highlighted')).toBe('false');
    act(() => { captured({ type: 'HIGHLIGHT_ZONE', zoneId: zB, durationMs: 1000 }); });
    expect(screen.getByTestId(`zone-frame-${zB}`).getAttribute('data-highlighted')).toBe('true');
    act(() => { captured({ type: 'HIGHLIGHT_ZONE', zoneId: zB, durationMs: 0 }); });
    expect(screen.getByTestId(`zone-frame-${zB}`).getAttribute('data-highlighted')).toBe('false');
  });
});
