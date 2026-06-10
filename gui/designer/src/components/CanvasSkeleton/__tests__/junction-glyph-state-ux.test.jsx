/**
 * junction-glyph-state-ux.test.jsx — UX slice 1: "look at the strip before you
 * open the popover". A junction's strip glyph must distinguish a DECIDED join
 * (a human picked / tuned it → solid diamond) from a TENTATIVE one (an
 * untouched auto-guess → hollow dashed diamond). Pure usability state, no
 * biology: decided = the per-junction config carries autoMode:'manual'
 * (set by any user edit via SET_BOUNDARY_OVERLAP); everything else is tentative.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import { enrichZonesWithJunctions, pairKeyFor } from '../lib/junction-derive';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT';
const PK = pairKeyFor('pc1', 'pc2');
const ZONES = [
  { zoneId: 'pc1', start: 0, end: 16, color: '#8b5cf6' },
  { zoneId: 'pc2', start: 16, end: 32, color: '#ec4899' },
];
const withCfg = (cfg) => enrichZonesWithJunctions(ZONES, cfg ? { [PK]: cfg } : {});

// ─── data layer ────────────────────────────────────────────────────────────

describe('UX slice 1 — enrichZonesWithJunctions trust state', () => {
  it('a user-touched junction (autoMode manual) → state "decided"', () => {
    const out = withCfg({ method: 'golden_gate', autoMode: 'manual' });
    expect(out[0].junctionRight.state).toBe('decided');
  });

  it('an auto / seeded / config-less junction → state "tentative"', () => {
    expect(withCfg({ method: 'overlap_pcr', autoMode: 'auto' })[0].junctionRight.state).toBe('tentative');
    expect(withCfg({ method: 'overlap_pcr' })[0].junctionRight.state).toBe('tentative'); // seeded, no autoMode
    expect(withCfg(null)[0].junctionRight.state).toBe('tentative'); // no config at all
  });
});

// ─── render layer (through SequenceTab → SegmentZonesOverlay, the real path) ─

describe('UX slice 1 — strip glyph reflects the trust state', () => {
  function renderStrip(cfg) {
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={withCfg(cfg)}
        onZoneClick={() => {}}
      />,
    );
    return screen.getAllByTestId('sequence-view-junction')[0];
  }

  it('decided junction → state, a filled diamond, and a "выбран" hover title', () => {
    const g = renderStrip({ method: 'overlap_pcr', autoMode: 'manual' });
    expect(g.getAttribute('data-junction-state')).toBe('decided');
    const diamond = g.querySelector('span');
    expect(diamond.style.background).toBeTruthy();
    expect(diamond.style.background).not.toBe('transparent');
    expect(g.getAttribute('title')).toMatch(/выбран/i);
  });

  it('tentative junction → state, a hollow (transparent) diamond, and a "по умолчанию" title', () => {
    const g = renderStrip({ method: 'overlap_pcr' });
    expect(g.getAttribute('data-junction-state')).toBe('tentative');
    expect(g.querySelector('span').style.background).toBe('transparent');
    expect(g.getAttribute('title')).toMatch(/умолчан/i);
  });
});
