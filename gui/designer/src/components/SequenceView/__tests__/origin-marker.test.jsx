/**
 * origin-marker — Sprint M-X.3 K3 coverage.
 *
 * Verifies OriginMarkerOverlay renders:
 *  - 2 markers (top + bottom) for circular plasmid with wrap-tail
 *  - 1 marker (top only) for circular plasmid without wrap-tail
 *  - 0 markers for linear plasmid
 *
 * Uses the same fixture pattern as wrap-tail-render.test.jsx.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const cds80 = 'ATGAAACATGCAGTGGCAATGGCATTGGCATTGGCAATGCATGCATTGGCATTGGCAATGCATGCATTGGCATTGGCAA';
const longCircular = {
  id: 'frag-c-long',
  name: 'circular-long',
  type: 'plasmid',
  sequence: cds80.repeat(60), // 4800 bp
  strand: 1,
  annotations: [],
};

const linearFragment = {
  id: 'frag-linear',
  name: 'linear',
  type: 'misc_feature',
  sequence: cds80.repeat(60),
  strand: 1,
  annotations: [],
};

const shortCircular = {
  id: 'frag-c-short',
  name: 'circular-short',
  type: 'plasmid',
  sequence: 'ATGC'.repeat(20), // 80 bp = 1 main line, no wrap-tail
  strand: 1,
  annotations: [],
};

beforeEach(() => {
  useStore.setState({
    sequenceView: {
      ...useStore.getState().sequenceView,
      sequenceWrap: 80,
    },
  });
});
afterEach(() => { cleanup(); });

describe('M-X.3 K3 — OriginMarkerOverlay', () => {
  it('circular plasmid renders top marker; bottom folded inline (round-10)', () => {
    render(<SequenceView fragments={[longCircular]} circular />);
    expect(screen.queryByTestId('sequence-view-origin-marker-top')).toBeTruthy();
    // Round-10: trailing wrap-tail folded into a wrap-bridge line
    // with an inline vertical divider — no bottom marker overlay.
    expect(screen.queryByTestId('sequence-view-origin-marker-bottom')).toBeFalsy();
  });

  it('linear plasmid renders no origin markers', () => {
    render(<SequenceView fragments={[linearFragment]} circular={false} />);
    expect(screen.queryByTestId('sequence-view-origin-marker-top')).toBeFalsy();
    expect(screen.queryByTestId('sequence-view-origin-marker-bottom')).toBeFalsy();
  });

  it('circular plasmid without wrap-tail renders only the top marker', () => {
    render(<SequenceView fragments={[shortCircular]} circular />);
    // Top marker still renders to mark «start of plasmid» visually.
    expect(screen.queryByTestId('sequence-view-origin-marker-top')).toBeTruthy();
    // No trailing wrap-tail → no bottom marker.
    expect(screen.queryByTestId('sequence-view-origin-marker-bottom')).toBeFalsy();
  });
});
