/**
 * VERT-4 — ZoneGraphContent vertical (TB) mode renders restriction fragments via
 * StickyEndFragment (хвосты «выходят из карточки»); default LR keeps the
 * MiniPlasmidMap. direction is threaded to layout + edge anchors too (asserted via
 * data-direction; the geometry itself is covered by the layout/edge-anchor units).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ZoneGraphContent from '../canvas/ZoneGraphContent';

afterEach(cleanup);

const stagger = {
  left: {
    end: 'left', type: '5prime', seq: 'AATT', len: 4, protruding: 'top', recessed: 'bottom', label: '5′ AATT',
  },
  right: {
    end: 'right', type: '5prime', seq: 'AATT', len: 4, protruding: 'bottom', recessed: 'top', label: '5′ AATT',
  },
};
const frag = {
  id: 'frag1', kind: 'molecule', name: 'вектор', sequence: 'ATGCATGCAT', length: 10,
  topology: { circular: false }, annotations: [], _role: 'fragment', _stagger: stagger,
};

describe('ZoneGraphContent — vertical (TB) sticky-end tails', () => {
  it('direction "TB" renders the fragment via StickyEndFragment tails (reused StrandsTrack)', () => {
    render(<ZoneGraphContent containers={[frag]} operations={[]} direction="TB" />);
    expect(screen.getByTestId('zone-graph-content').getAttribute('data-direction')).toBe('TB');
    expect(screen.getByTestId('skeleton-block-frag1-tails')).toBeTruthy();
    // tails reuse the SequenceView StrandsTrack — its sticky-end staircase appears.
    expect(screen.getByTestId('sequence-view-terminal-overhang')).toBeTruthy();
  });

  it('default (LR) keeps the MiniPlasmidMap (no tails)', () => {
    render(<ZoneGraphContent containers={[frag]} operations={[]} />);
    expect(screen.getByTestId('zone-graph-content').getAttribute('data-direction')).toBe('LR');
    expect(screen.queryByTestId('skeleton-block-frag1-tails')).toBeNull();
    expect(screen.getByTestId('skeleton-block-frag1-svg')).toBeTruthy();
  });

  it('VERT-READINESS — _readiness colours the card border (incompatible → red, ready → green)', () => {
    const bad = { ...frag, id: 'fbad', _readiness: 'incompatible' };
    const good = { ...frag, id: 'fok', _readiness: 'ready' };
    render(<ZoneGraphContent containers={[bad, good]} operations={[]} direction="TB" />);
    expect(screen.getByTestId('skeleton-block-fbad').style.border).toMatch(/#?dc2626|220, ?38, ?38/i);
    expect(screen.getByTestId('skeleton-block-fok').style.border).toMatch(/#?16a34a|22, ?163, ?74/i);
  });
});
