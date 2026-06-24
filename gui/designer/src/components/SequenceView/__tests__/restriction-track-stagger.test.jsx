/**
 * RS-RE-VIS1 (Игорь 22.06: «надо бы разнести сайты по высоте чтобы они не
 * накладывались»). In HORIZONTAL orientation the RE labels stack into vertical
 * lanes instead of being pushed sideways — overlapping labels get distinct
 * `data-lane`, each connected to its cut tick by a vertical leader. Far-apart
 * labels share lane 0 (no gratuitous staggering).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RestrictionTrack from '../tracks/RestrictionTrack.jsx';

afterEach(cleanup);

const base = {
  lineStart: 0,
  lineLen: 60,
  charPx: 10,
  labelChars: 8,
  reOrientation: 'horizontal',
};

const laneOf = (enzyme) => screen.getAllByTestId('sequence-view-re-site')
  .find((g) => g.getAttribute('data-enzyme') === enzyme)
  ?.getAttribute('data-lane');

describe('RestrictionTrack — vertical lane stagger (horizontal orientation)', () => {
  it('overlapping labels get DIFFERENT lanes; a far-apart label stays on lane 0', () => {
    render(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 6 }, // adjacent → labels overlap → new lane
      { enzyme: 'NheI', position: 45 },  // far → lane 0
    ]} />);
    expect(laneOf('EcoRI')).toBe('0');
    expect(laneOf('BamHI')).toBe('1');
    expect(laneOf('NheI')).toBe('0');
  });

  it('a vertical leader connects each label to its cut tick', () => {
    render(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 6 },
    ]} />);
    // Both staggered labels carry a leader.
    expect(screen.getAllByTestId('sequence-view-re-leader').length).toBeGreaterThanOrEqual(1);
  });

  it('the SVG grows taller as more lanes are needed (no fixed 2-row height)', () => {
    const { rerender } = render(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
    ]} />);
    const h1 = Number(screen.getByTestId('sequence-view-restriction').getAttribute('height'));
    rerender(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 6 },
      { enzyme: 'HindIII', position: 7 },
    ]} />);
    const h2 = Number(screen.getByTestId('sequence-view-restriction').getAttribute('height'));
    expect(h2).toBeGreaterThan(h1);
  });
});
