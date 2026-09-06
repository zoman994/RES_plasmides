/**
 * RS-RE-VIS1 (Игорь 22.06: «надо бы разнести сайты по высоте чтобы они не
 * накладывались»). In HORIZONTAL orientation the RE labels stack into vertical
 * lanes instead of being pushed sideways — overlapping labels get distinct
 * `data-lane`, each connected to its cut tick by a vertical leader. Far-apart
 * labels share lane 0 (no gratuitous staggering).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

const groupFor = (enzyme) => screen.getAllByTestId('sequence-view-re-site')
  .find((g) => g.getAttribute('data-enzyme') === enzyme);

const verticalPivotOffset = (group) => {
  const labelX = Number(group.querySelector('text').getAttribute('x'));
  const tickX = Number(Array.from(group.querySelectorAll('line')).at(-1).getAttribute('x1'));
  return labelX - tickX;
};

const labelHitRect = (group) => {
  const rect = group.querySelector('[data-testid="sequence-view-re-label-hit"]')
    || group.querySelector('rect');
  return Object.fromEntries(['x', 'y', 'width', 'height']
    .map((name) => [name, Number(rect.getAttribute(name))]));
};

const rectsOverlap = (a, b) => (
  a.x < b.x + b.width
  && b.x < a.x + a.width
  && a.y < b.y + b.height
  && b.y < a.y + a.height
);

const rectGap = (a, b, axis) => {
  const size = axis === 'x' ? 'width' : 'height';
  return Math.max(
    b[axis] - (a[axis] + a[size]),
    a[axis] - (b[axis] + b[size]),
  );
};

describe('RestrictionTrack — vertical lane stagger (horizontal orientation)', () => {
  it('uses horizontal labels when the caller omits an orientation', () => {
    render(<RestrictionTrack
      {...base}
      reOrientation={undefined}
      sites={[{ enzyme: 'EcoRI', position: 5 }]}
    />);

    expect(screen.getByTestId('sequence-view-restriction')
      .getAttribute('data-orientation')).toBe('horizontal');
  });

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

  it('packs the full readable hit footprint and keeps adjacent lane targets disjoint', () => {
    render(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 8 },
    ]} />);

    const eco = groupFor('EcoRI');
    const bam = groupFor('BamHI');
    expect(eco.getAttribute('data-lane')).not.toBe(bam.getAttribute('data-lane'));
    expect(rectsOverlap(labelHitRect(eco), labelHitRect(bam))).toBe(false);
    expect(rectGap(labelHitRect(eco), labelHitRect(bam), 'y')).toBeGreaterThanOrEqual(2);
  });

  it('keeps the declared 4px gap between labels that share a lane', () => {
    render(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 9 },
    ]} />);

    const eco = groupFor('EcoRI');
    const bam = groupFor('BamHI');
    expect(eco.getAttribute('data-lane')).toBe(bam.getAttribute('data-lane'));
    expect(rectGap(labelHitRect(eco), labelHitRect(bam), 'x')).toBeGreaterThanOrEqual(4);
  });

  it('clamps a long horizontal name inside the SVG and connects the shifted label', () => {
    const enzyme = 'VeryLongCustomEnzyme';
    render(<RestrictionTrack
      {...base}
      charPx={6}
      sites={[{ enzyme, position: 0 }]}
    />);

    const root = screen.getByTestId('sequence-view-restriction');
    const hit = labelHitRect(groupFor(enzyme));
    expect(hit.x).toBeGreaterThanOrEqual(0);
    expect(hit.x + hit.width).toBeLessThanOrEqual(Number(root.getAttribute('width')));
    expect(screen.getByTestId('sequence-view-re-leader')).toBeTruthy();
  });

  it('paints leaders behind every label and keeps the leader interaction corridor clickable', () => {
    const onSiteClick = vi.fn();
    render(<RestrictionTrack {...base} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 6 },
    ]} onSiteClick={onSiteClick} />);

    const root = screen.getByTestId('sequence-view-restriction');
    const leaders = screen.getByTestId('sequence-view-re-leaders');
    const firstSite = screen.getAllByTestId('sequence-view-re-site')[0];
    expect(root.firstElementChild).toBe(leaders);
    expect(leaders.compareDocumentPosition(firstSite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(firstSite.querySelector('[data-testid="sequence-view-re-leader"]')).toBeNull();

    const leaderHit = screen.getByTestId('sequence-view-re-leader-hit');
    expect(leaderHit.getAttribute('pointer-events')).toBe('stroke');
    fireEvent.click(leaderHit);
    expect(onSiteClick).toHaveBeenCalledTimes(1);
  });

  it('deduplicates same-cut click targets and partitions nearby cut hit areas', () => {
    const { rerender } = render(<RestrictionTrack {...base} charPx={6} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 5 },
      { enzyme: 'HindIII', position: 5 },
    ]} />);
    expect(screen.getAllByTestId('sequence-view-re-cut-hit')).toHaveLength(1);

    rerender(<RestrictionTrack {...base} charPx={6} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 6 },
      { enzyme: 'HindIII', position: 7 },
    ]} />);
    const hits = screen.getAllByTestId('sequence-view-re-cut-hit')
      .map((rect) => Object.fromEntries(['x', 'y', 'width', 'height']
        .map((name) => [name, Number(rect.getAttribute(name))])));
    for (let i = 0; i < hits.length; i += 1) {
      for (let j = i + 1; j < hits.length; j += 1) {
        expect(rectsOverlap(hits[i], hits[j])).toBe(false);
      }
    }
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

describe('RestrictionTrack — collision lanes (vertical orientation)', () => {
  const vertical = { ...base, reOrientation: 'vertical' };

  it('keeps labels at the cut coordinate and places coincident sites into separate lanes', () => {
    render(<RestrictionTrack {...vertical} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 5 },
      { enzyme: 'HindIII', position: 5 },
      { enzyme: 'NheI', position: 45 },
    ]} />);

    expect(new Set([
      laneOf('EcoRI'),
      laneOf('BamHI'),
      laneOf('HindIII'),
    ])).toEqual(new Set(['0', '1', '2']));
    expect(laneOf('NheI')).toBe('0');

    const offsets = ['EcoRI', 'BamHI', 'HindIII']
      .map((enzyme) => verticalPivotOffset(groupFor(enzyme)));
    expect(offsets[1]).toBeCloseTo(offsets[0], 4);
    expect(offsets[2]).toBeCloseTo(offsets[0], 4);
    expect(screen.getAllByTestId('sequence-view-re-leader')).toHaveLength(2);
  });

  it('keeps same-cut leader corridors on separate branches above the shared cut target', () => {
    render(<RestrictionTrack {...vertical} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 5 },
      { enzyme: 'HindIII', position: 5 },
    ]} />);

    const leaderHits = screen.getAllByTestId('sequence-view-re-leader-hit');
    expect(leaderHits).toHaveLength(2);
    const cutY = Number(groupFor('EcoRI')
      .querySelector('[data-testid="sequence-view-re-cut-tick"]')
      .getAttribute('y1'));
    const geometry = leaderHits.map((path) => {
      const points = path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
      return { branchX: points[2], endY: points.at(-1) };
    });
    expect(geometry.every(({ endY }) => endY <= cutY - 8)).toBe(true);
    expect(Math.abs(geometry[0].branchX - geometry[1].branchX)).toBeGreaterThanOrEqual(8);
  });

  it('assigns same-coordinate lanes deterministically instead of using input order', () => {
    const cluster = [
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'BamHI', position: 5 },
      { enzyme: 'HindIII', position: 5 },
    ];
    const { rerender } = render(<RestrictionTrack {...vertical} sites={cluster} />);
    const first = Object.fromEntries(cluster.map(({ enzyme }) => [enzyme, laneOf(enzyme)]));

    rerender(<RestrictionTrack {...vertical} sites={[...cluster].reverse()} />);
    const reversed = Object.fromEntries(cluster.map(({ enzyme }) => [enzyme, laneOf(enzyme)]));
    expect(reversed).toEqual(first);
  });

  it('reserves the full height of a long vertical enzyme name inside the SVG', () => {
    const enzyme = 'VeryLongCustomEnzyme';
    render(<RestrictionTrack {...vertical} sites={[{ enzyme, position: 5 }]} />);

    const root = screen.getByTestId('sequence-view-restriction');
    const hit = labelHitRect(groupFor(enzyme));
    expect(hit.height).toBeGreaterThanOrEqual(enzyme.length * 5.6);
    expect(hit.y).toBeGreaterThanOrEqual(0);
    expect(hit.y + hit.height).toBeLessThanOrEqual(Number(root.getAttribute('height')));
  });

  it('uses per-lane heights so one long name does not inflate every short lane', () => {
    const enzyme = 'VeryLongCustomEnzyme';
    const { rerender } = render(<RestrictionTrack
      {...vertical}
      sites={[{ enzyme, position: 45 }]}
    />);
    const longOnlyHeight = Number(screen.getByTestId('sequence-view-restriction').getAttribute('height'));

    rerender(<RestrictionTrack {...vertical} sites={[
      { enzyme: 'EcoRI', position: 5 },
      { enzyme: 'MluI', position: 5 },
      { enzyme: 'NheI', position: 5 },
      { enzyme, position: 45 },
    ]} />);
    const mixedHeight = Number(screen.getByTestId('sequence-view-restriction').getAttribute('height'));

    expect(mixedHeight - longOnlyHeight).toBe(2 * 36);
  });

  it('grows vertically instead of pushing a dense restriction series outside its SVG', () => {
    const enzymes = ['BsiWI', 'Pfl23II', 'PspLI'];
    const denseSites = Array.from({ length: 20 }, (_, occurrence) => (
      enzymes.map((enzyme) => ({ enzyme, position: 2 + occurrence * 4 }))
    )).flat();

    render(<RestrictionTrack
      {...vertical}
      charPx={6}
      lineLen={80}
      sites={denseSites}
    />);

    const root = screen.getByTestId('sequence-view-restriction');
    const width = Number(root.getAttribute('width'));
    const height = Number(root.getAttribute('height'));
    const pivots = screen.getAllByTestId('sequence-view-re-site')
      .map((group) => Number(group.querySelector('text').getAttribute('x')));
    const lanes = screen.getAllByTestId('sequence-view-re-site')
      .map((group) => Number(group.getAttribute('data-lane')));

    expect(Math.max(...lanes)).toBe(2);
    expect(height).toBeGreaterThan(54);
    expect(Math.max(...pivots)).toBeLessThanOrEqual(width);
  });
});
