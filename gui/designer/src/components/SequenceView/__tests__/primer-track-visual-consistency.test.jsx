import {
  afterEach, describe, expect, it,
} from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { reverseComplement } from '../../../sequence-utils';
import PrimerTrack from '../tracks/PrimerTrack';
import { PRIMER_GLYPH_HEIGHT } from '../tracks/PrimerStepGlyph';

afterEach(cleanup);

const DOC = 'sha256:p16-visual-consistency';
const ENTRY = 'p16-entry';
const ANCHOR = 'ACGTAGCTTACCGGTA';
const TEMPLATE = `${'T'.repeat(5)}${ANCHOR}${'G'.repeat(12)}`;
const BASE_PROPS = {
  fullSeq: TEMPLATE,
  lineStart: 0,
  lineLen: TEMPLATE.length,
  labelChars: 8,
  primerStyle: 'filled',
  charPx: 7.2,
  entryId: ENTRY,
  documentHash: DOC,
  topology: 'linear',
};

function sourcePrimer(body, {
  id, direction, tail, anchor, segments,
}) {
  const strand = direction === 'reverse' ? -1 : 1;
  return {
    id,
    name: id,
    direction,
    bindingModel: 'aligned-v1',
    tail,
    bindingSequence: body,
    sequence: `${tail}${body}`,
    sites: [{
      id: `${id}-site`,
      target: { entryId: ENTRY, resourceHash: DOC, topology: 'linear' },
      location: { kind: 'single', segments },
      strand,
      annealedSequence: anchor,
      tail,
    }],
  };
}

describe('P16 primer visual consistency', () => {
  it('renders a readable semibold primer name without squeezing its glyphs', () => {
    render(<PrimerTrack
      {...BASE_PROPS}
      primers={[sourcePrimer(ANCHOR, {
        id: 'readable-forward-label',
        direction: 'forward',
        tail: '',
        anchor: ANCHOR,
        segments: [{ start: 5, end: 21 }],
      })]}
    />);

    const label = screen.getByTestId('sequence-view-primer-label');
    expect(Number(label.getAttribute('font-size'))).toBe(9);
    expect(Number(label.getAttribute('font-weight'))).toBe(600);
    expect(Number(label.getAttribute('textLength')))
      .toBe(label.textContent.length * 5.5);
  });

  it('centers the name on the binding body instead of a long tail or insertion', () => {
    const body = `${ANCHOR.slice(0, 4)}AA${ANCHOR.slice(4)}`;
    render(<PrimerTrack
      {...BASE_PROPS}
      directionFilter="forward"
      primers={[sourcePrimer(body, {
        id: 'body-centered-label',
        direction: 'forward',
        tail: 'GGGGGGGG',
        anchor: ANCHOR,
        segments: [{ start: 5, end: 21 }],
      })]}
    />);

    const group = screen.getByTestId('sequence-view-primer');
    const label = screen.getByTestId('sequence-view-primer-label');
    const [start, end] = group.dataset.primerSpan.split('-').map(Number);
    const bodyCenter = (end - start) * BASE_PROPS.charPx / 2;
    const labelCenter = Number(label.getAttribute('x'))
      + Number(label.getAttribute('textLength')) / 2;

    expect(labelCenter).toBeCloseTo(bodyCenter, 5);
  });

  it.each(['forward', 'reverse'])(
    'keeps %s selection brackets fixed on the binding body in compact and expanded views',
    (direction) => {
      const anchor = direction === 'reverse' ? reverseComplement(ANCHOR) : ANCHOR;
      const body = `${anchor.slice(0, 4)}AA${anchor.slice(4)}`;
      const props = {
        ...BASE_PROPS,
        onPrimerClick: () => {},
        primers: [sourcePrimer(body, {
          id: `body-brackets-${direction}`,
          direction,
          tail: 'GGGG',
          anchor,
          segments: [{ start: 5, end: 21 }],
        })],
      };
      const { rerender } = render(<PrimerTrack {...props} />);
      const key = screen.getByTestId('sequence-view-primer').dataset.primerKey;

      rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={null} />);
      const compact = screen.getByTestId('sequence-view-primer');
      const compactBody = compact.querySelector('[data-testid="sequence-view-primer-compact-run"]');
      const bodyY = Number(compactBody.getAttribute('data-primer-lane-y'));
      const bodyWidth = Number(compactBody.getAttribute('x2'))
        - Number(compactBody.getAttribute('x1'));
      const expectedPaths = [
        `M4,${bodyY - 2} H0 V${bodyY + PRIMER_GLYPH_HEIGHT + 2} H4`,
        `M${bodyWidth - 4},${bodyY - 2} H${bodyWidth} V${bodyY + PRIMER_GLYPH_HEIGHT + 2} H${bodyWidth - 4}`,
      ];
      expect([...compact.querySelectorAll('[data-primer-selection-bracket]')]
        .map((node) => node.getAttribute('d'))).toEqual(expectedPaths);

      rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />);
      const expanded = screen.getByTestId('sequence-view-primer');
      expect([...expanded.querySelectorAll('[data-primer-selection-bracket]')]
        .map((node) => node.getAttribute('d'))).toEqual(expectedPaths);
    },
  );

  it.each(['forward', 'reverse'])(
    'connects a detached %s insertion to the actual primer body in both disclosure states',
    (direction) => {
      const top = 'ACGTACGTA';
      const anchor = direction === 'reverse' ? reverseComplement(top) : top;
      const body = `${anchor.slice(0, 4)}AA${anchor.slice(4)}`;
      const template = `TT${top}GGGG`;
      const props = {
        ...BASE_PROPS,
        fullSeq: template,
        lineLen: template.length,
        onPrimerClick: () => {},
        primers: [sourcePrimer(body, {
          id: `detached-insertion-${direction}`,
          direction,
          tail: '',
          anchor,
          segments: [{ start: 2, end: 11 }],
        })],
      };
      const { rerender } = render(<PrimerTrack {...props} />);
      const compact = screen.getByTestId('sequence-view-primer');
      const key = compact.dataset.primerKey;
      const compactConnector = compact.querySelector('[data-primer-step-source="insertion"]');

      expect(compact.dataset.primerDetached).toBe('true');
      expect(compactConnector).toBeTruthy();
      expect(compactConnector.getAttribute('stroke')).toBe('var(--danger-fg)');

      rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />);
      const expanded = screen.getByTestId('sequence-view-primer');
      const bodyRun = expanded.querySelector('[data-testid="sequence-view-primer-run"]');
      const insertion = screen.getByTestId('sequence-view-primer-insertion');
      const insertionBox = insertion.querySelector('rect');
      const connector = expanded.querySelector('[data-primer-step-source="insertion"]');
      const bodyY = Number(bodyRun.getAttribute('data-primer-lane-y'));
      const insertionY = Number(insertion.getAttribute('data-primer-lane-y'));
      const boxTop = insertionY + Number(insertionBox.getAttribute('y'));
      const boxBottom = boxTop + Number(insertionBox.getAttribute('height'));

      expect(connector).toBeTruthy();
      expect(connector.getAttribute('stroke')).toBe('var(--danger-fg)');
      if (boxBottom <= bodyY) {
        expect(Number(connector.getAttribute('y1'))).toBe(bodyY + PRIMER_GLYPH_HEIGHT);
        expect(Number(connector.getAttribute('y2'))).toBe(boxBottom);
      } else {
        expect(Number(connector.getAttribute('y1'))).toBe(bodyY);
        expect(Number(connector.getAttribute('y2'))).toBe(boxTop);
      }
    },
  );
});
