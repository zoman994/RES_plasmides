/**
 * sanger-branching-indicator.test.jsx — T10 K10 (§5.7, DEC-T10-07).
 * BranchingVisual shows a Sanger dot on clone branches.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import BranchingVisual from '../canvas/zone-sequence-mode/BranchingVisual';

afterEach(cleanup);

const zone = { id: 'z1' };
const fin = (id) => ({ id, kind: 'molecule', zoneId: 'z1', topology: { circular: false } });

function clonesState(statuses) {
  return {
    zones: [zone],
    containers: statuses.map((_, i) => fin(`f${i + 1}`)),
    operations: [{
      id: 'op', outputs: ['f1'], inputPieces: [],
      materializedClones: statuses.map((sv, i) => ({
        cloneId: `f${i + 1}`, label: `clone ${i + 1}`, sangerVerified: sv, notes: '',
      })),
    }],
    junctions: [], pieces: [],
  };
}

describe('T10 K10 — BranchingVisual Sanger dots (clones kind)', () => {
  it('renders a dot per clone with its status; null → no dot', () => {
    const s = clonesState(['verified', 'failed', 'pending', null]);
    render(<BranchingVisual finals={s.containers} state={s} zoneId="z1" />);
    expect(screen.getByTestId('zone-seq-branching').getAttribute('data-kind')).toBe('clones');
    const dots = screen.getAllByTestId('zone-seq-sanger-dot');
    expect(dots).toHaveLength(3); // null clone has no dot
    const byStatus = dots.map((d) => d.getAttribute('data-status')).sort();
    expect(byStatus).toEqual(['failed', 'pending', 'verified']);
  });

  it('dot title falls back to the status label when no notes', () => {
    const s = clonesState(['verified', 'pending']);
    render(<BranchingVisual finals={s.containers} state={s} zoneId="z1" />);
    const verified = screen
      .getAllByTestId('zone-seq-sanger-dot')
      .find((d) => d.getAttribute('data-status') === 'verified');
    expect(verified.getAttribute('title')).toMatch(/Подтверждено Sanger/);
  });

  it('design-variants / independent kinds → no Sanger dots', () => {
    const s = {
      zones: [zone],
      containers: [fin('f1'), fin('f2')],
      pieces: [], operations: [], junctions: [],
    };
    render(<BranchingVisual finals={s.containers} state={s} zoneId="z1" />);
    expect(screen.queryAllByTestId('zone-seq-sanger-dot')).toHaveLength(0);
  });
});
