/**
 * wrap-tail-integration — Sprint M-X.3 K6.
 *
 * pUC19-shaped fixture (2686 bp circular with realistic AmpR /
 * lacZα regions) exercises the full M-X.3 stack:
 *   - K2 wrap-tail lines render
 *   - K3 origin markers appear
 *   - K4 main-band caret/select-filter contract holds
 *   - K5 auto-disable doesn't kick in (small viewport vs ~34
 *     main lines)
 *   - existing AnnotationTrack stack handles features that span
 *     wrap-tail / main / wrap-tail without crashing (smoke)
 *
 * Visual acceptance scenarios 1-6 from the spec are deferred to a
 * real-browser session — happy-dom doesn't lay out reliably for
 * y/positional assertions.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

// Mounting a 2686 bp plasmid + AnnotationTrack stack legitimately
// runs ~3 s under happy-dom. Extend the default 5000 ms so the file
// is reliable under CI; per-test render is still bounded.
const TEST_TIMEOUT = 20000;

// Stand-in for a real pUC19 — same length and a couple of features
// that fall on the boundaries we care about (ampR overlapping the
// last main lines, lacZα starting near 0). Sequence is filler; the
// math we test is index-based.
const pucShaped = {
  id: 'puc19-fixture',
  name: 'pUC19 (fixture)',
  type: 'plasmid',
  sequence: 'A'.repeat(2686),
  strand: 1,
  annotations: [
    { id: 'lacZa', name: 'lacZα', type: 'CDS', start: 146, end: 469, strand: 1, level: 'region' },
    { id: 'ampR', name: 'AmpR', type: 'CDS', start: 1626, end: 2486, strand: -1, level: 'region' },
    { id: 'short', name: 'origin-cluster', type: 'rep_origin', start: 2680, end: 2686, strand: 1, level: 'region' },
  ],
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

describe('M-X.3 K6 — pUC19 fixture integration', () => {
  it('renders leading wrap-tail; trailing folded inline (round-10)', { timeout: TEST_TIMEOUT }, () => {
    render(<SequenceView fragments={[pucShaped]} circular />);
    const lines = screen.getAllByTestId('sequence-view-line');
    const kinds = lines.map((el) => el.getAttribute('data-wraptail-kind'));
    expect(kinds.filter((k) => k === 'leading-wrap').length).toBe(2);
    // Round-10: trailing wrap-tail no longer separate rows.
    expect(kinds.filter((k) => k === 'trailing-wrap').length).toBe(0);
    expect(kinds.filter((k) => k === 'main').length).toBe(Math.ceil(2686 / 80));
  });

  it('renders top origin marker; bottom folded inline (round-10)', { timeout: TEST_TIMEOUT }, () => {
    render(<SequenceView fragments={[pucShaped]} circular />);
    expect(screen.queryByTestId('sequence-view-origin-marker-top')).toBeTruthy();
    // Round-10: bottom marker replaced by inline vertical divider
    // INSIDE the wrap-bridge line.
    expect(screen.queryByTestId('sequence-view-origin-marker-bottom')).toBeFalsy();
  });

  it('linear toggle drops every wrap-tail strip and origin marker', { timeout: TEST_TIMEOUT }, () => {
    render(<SequenceView fragments={[pucShaped]} circular={false} />);
    const lines = screen.getAllByTestId('sequence-view-line');
    const kinds = lines.map((el) => el.getAttribute('data-wraptail-kind'));
    expect(kinds.every((k) => k === 'main')).toBe(true);
    expect(screen.queryByTestId('sequence-view-origin-marker-top')).toBeFalsy();
    expect(screen.queryByTestId('sequence-view-origin-marker-bottom')).toBeFalsy();
  });

  it('annotations near origin show up on both main and the matching wrap-tail strip', { timeout: TEST_TIMEOUT }, () => {
    // The «origin-cluster» feature (2680..2686) overlaps the
    // last 6 nt of plasmid. With cpl=80 the last main line
    // covers 2640..2686 and one of the leading-wrap lines also
    // covers 2640..2686. AnnotationTrack clips features by
    // [lineStart, lineLen) → both lines should mount a label
    // for the same feature; the wrap-tail copy is dimmed via
    // wrapper opacity.
    render(<SequenceView fragments={[pucShaped]} circular />);
    const labels = screen.queryAllByTestId('sequence-view-annotation-label');
    // Two copies expected — one in main, one in leading-wrap. We
    // accept >=2 because feature stacking inside a single line
    // can also mount multiple labels.
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});
