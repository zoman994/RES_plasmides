import {
  afterEach, describe, expect, it,
} from 'vitest';
import {
  cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import { vi } from 'vitest';

import { reverseComplement } from '../../../sequence-utils';
import PrimerTrack from '../tracks/PrimerTrack';
import {
  PRIMER_LABEL_CHAR_WIDTH,
  PRIMER_ARROW_HEAD,
  PRIMER_GLYPH_HEIGHT,
  PRIMER_STEP_OFFSET,
} from '../tracks/PrimerStepGlyph';
import {
  PRIMER_LABEL_GAP,
  PRIMER_LABEL_HEIGHT,
  PRIMER_TAIL_OFFSET,
} from '../tracks/primer-track-layout';

afterEach(cleanup);

const DOC = 'sha256:p7-step';
const ENTRY = 'p7-entry';
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
  id = 'p7-primer', direction = 'forward', tail = 'GG',
  anchor = ANCHOR, segments = [{ start: 5, end: 21 }], topology = 'linear',
} = {}) {
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
      target: { entryId: ENTRY, resourceHash: DOC, topology },
      location: { kind: segments.length > 1 ? 'join' : 'single', segments },
      strand,
      annealedSequence: anchor,
      tail,
    }],
  };
}

describe('P7 PrimerTrack step geometry', () => {
  it.each([
    ['forward', 80, 'forward-at-the-right-viewer-edge'],
    ['reverse', 0, 'reverse-at-the-left-viewer-edge'],
  ])('keeps a compact %s label inside the line and on the template-facing side', (
    direction, start, id,
  ) => {
    const template = 'ACGT'.repeat(24);
    const at = (id, start, direction) => {
      const top = template.slice(start, start + 16);
      const anchor = direction === 'reverse' ? reverseComplement(top) : top;
      return { ...sourcePrimer(anchor, {
        id, direction, tail: '', anchor, segments: [{ start, end: start + 16 }],
      }), tmBinding: null };
    };
    render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={template}
      lineLen={template.length}
      directionFilter={direction}
      onPrimerClick={vi.fn()}
      primers={[at(id, start, direction)]}
    />);

    const svgWidth = Number(screen.getByTestId('sequence-view-primers').getAttribute('width'));
    const group = screen.getByTestId('sequence-view-primer');
    const groupX = Number(/translate\(([-\d.]+)/.exec(group.getAttribute('transform'))?.[1] || 0);
    const label = group.querySelector('[data-testid="sequence-view-primer-label"]');
    expect(label.textContent).not.toMatch(/null|undefined/i);
    const labelStart = groupX + Number(label.getAttribute('x'));
    const labelEnd = labelStart + Number(label.getAttribute('textLength') || 0);
    expect(labelStart).toBeGreaterThanOrEqual(0);
    expect(labelEnd).toBeLessThanOrEqual(svgWidth);
    const labelTop = Number(label.getAttribute('data-primer-label-y'));
    const bodyY = Number(group.querySelector('[data-testid="sequence-view-primer-compact-run"]')
      .getAttribute('data-primer-lane-y'));
    expect(label.getAttribute('data-primer-label-y')).not.toBeNull();
    if (direction === 'reverse') {
      expect(labelTop + PRIMER_LABEL_HEIGHT + PRIMER_LABEL_GAP).toBe(bodyY);
    } else {
      expect(labelTop).toBe(bodyY + PRIMER_GLYPH_HEIGHT + PRIMER_LABEL_GAP);
    }
    const [spanStart, spanEnd] = group.dataset.primerSpan.split('-').map(Number);
    const glyphStart = groupX - (direction === 'reverse' ? PRIMER_ARROW_HEAD : 0);
    const glyphEnd = groupX + (spanEnd - spanStart) * BASE_PROPS.charPx
      + (direction === 'forward' ? PRIMER_ARROW_HEAD : 0);
    expect(Math.min(labelEnd, glyphEnd) - Math.max(labelStart, glyphStart)).toBeGreaterThan(0);
  });

  it.each(['forward', 'reverse'])(
    'keeps a %s full-line label template-facing and horizontally tied to its glyph, including a head insertion',
    (direction) => {
      const template = 'ACGT'.repeat(24);
      const anchor = direction === 'reverse' ? reverseComplement(template) : template;
      const body = `${anchor}A`;
      const primer = {
        ...sourcePrimer(body, {
          id: `full-line-${direction}-with-a-long-name`,
          direction,
          tail: '',
          anchor,
          segments: [{ start: 0, end: template.length }],
        }),
        tmBinding: 61.2,
      };
      render(<PrimerTrack
        {...BASE_PROPS}
        fullSeq={template}
        lineLen={template.length}
        onPrimerClick={vi.fn()}
        primers={[primer]}
      />);

      const group = screen.getByTestId('sequence-view-primer');
      const groupX = Number(/translate\(([-\d.]+)/.exec(group.getAttribute('transform'))?.[1] || 0);
      const label = within(group).getByTestId('sequence-view-primer-label');
      const labelStart = groupX + Number(label.getAttribute('x'));
      const labelEnd = labelStart + Number(label.getAttribute('textLength') || 0);
      const glyphLeft = groupX - (direction === 'reverse' ? PRIMER_ARROW_HEAD : 0);
      const glyphRight = groupX + template.length * BASE_PROPS.charPx
        + (direction === 'forward' ? PRIMER_ARROW_HEAD : 0);
      const labelTop = Number(label.dataset.primerLabelY);
      const bodyY = Number(group.querySelector('[data-testid="sequence-view-primer-compact-run"]')
        .getAttribute('data-primer-lane-y'));

      expect(label.textContent.length).toBeGreaterThan(0);
      expect(Math.min(labelEnd, glyphRight) - Math.max(labelStart, glyphLeft)).toBeGreaterThan(0);
      if (direction === 'reverse') {
        expect(labelTop + PRIMER_LABEL_HEIGHT + PRIMER_LABEL_GAP).toBe(bodyY);
      } else {
        expect(labelTop).toBe(bodyY + PRIMER_GLYPH_HEIGHT + PRIMER_LABEL_GAP);
      }
    },
  );

  it('reserves the expanded footprint before click so rows and track height do not jump', () => {
    const props = {
      ...BASE_PROPS,
      onPrimerClick: vi.fn(),
      primers: [sourcePrimer(`${ANCHOR.slice(0, 4)}T${ANCHOR.slice(5)}`, {
        id: 'stable-footprint', tail: 'GGGG',
      })],
    };
    const { rerender } = render(<PrimerTrack {...props} />);
    const compact = screen.getByTestId('sequence-view-primer');
    const key = compact.dataset.primerKey;
    const before = {
      height: screen.getByTestId('sequence-view-primers').getAttribute('height'),
      transform: compact.getAttribute('transform'),
      templateY: compact.querySelector('[data-primer-lane="template"]')
        .getAttribute('data-primer-lane-y'),
      tailY: compact.querySelector('[data-primer-lane="tail"]')
        .getAttribute('data-primer-lane-y'),
      labelY: compact.querySelector('[data-testid="sequence-view-primer-label"]')
        .getAttribute('data-primer-label-y'),
    };

    rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />);
    const expanded = screen.getByTestId('sequence-view-primer');
    expect({
      height: screen.getByTestId('sequence-view-primers').getAttribute('height'),
      transform: expanded.getAttribute('transform'),
      templateY: expanded.querySelector('[data-primer-lane="template"]')
        .getAttribute('data-primer-lane-y'),
      tailY: expanded.querySelector('[data-primer-lane="tail"]')
        .getAttribute('data-primer-lane-y'),
      labelY: expanded.querySelector('[data-testid="sequence-view-primer-label"]')
        .getAttribute('data-primer-label-y'),
    }).toEqual(before);
  });

  it('puts different primers on separate rows when a tail or label crosses another glyph', () => {
    const template = 'ACGT'.repeat(24);
    const primerAt = (id, start, length, tail = '') => {
      const anchor = template.slice(start, start + length);
      return sourcePrimer(anchor, {
        id, tail, anchor, segments: [{ start, end: start + length }],
      });
    };
    const { unmount } = render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={template}
      lineLen={template.length}
      directionFilter="forward"
      primers={[
        primerAt('tail-owner', 20, 16, 'A'.repeat(12)),
        primerAt('under-tail', 8, 10),
      ]}
    />);

    const tailOwner = document.querySelector('[data-primer-name="tail-owner"]');
    const underTail = document.querySelector('[data-primer-name="under-tail"]');
    const tailY = Number(tailOwner.querySelector('[data-primer-lane="tail"]')
      .getAttribute('data-primer-lane-y'));
    const underTailY = Number(underTail.querySelector('[data-primer-lane="template"]')
      .getAttribute('data-primer-lane-y'));
    expect(Math.abs(tailY - underTailY)).toBeGreaterThanOrEqual(14);

    unmount();
    render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={template}
      lineLen={template.length}
      directionFilter="forward"
      primers={[
        primerAt('WWW-ШШШ-primer-label-collision', 5, 10),
        primerAt('under-label', 20, 10),
      ]}
    />);
    const longLabel = document.querySelector('[data-primer-name="WWW-ШШШ-primer-label-collision"]');
    const underLabel = document.querySelector('[data-primer-name="under-label"]');
    const longLabelY = Number(longLabel.querySelector('[data-primer-lane="template"]')
      .getAttribute('data-primer-lane-y'));
    const underLabelY = Number(underLabel.querySelector('[data-primer-lane="template"]')
      .getAttribute('data-primer-lane-y'));
    expect(underLabelY).not.toBe(longLabelY);
    const label = longLabel.querySelector('[data-testid="sequence-view-primer-label"]');
    expect(Number(label.getAttribute('textLength')))
      .toBe(label.textContent.length * PRIMER_LABEL_CHAR_WIDTH);
    expect(label.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
  });

  it('keeps a reverse long tail one compact step from its own binding through three overlaps', () => {
    const template = 'ACGT'.repeat(20);
    const reversePrimerAt = (id, start, tail = '') => {
      const top = template.slice(start, start + 16);
      const anchor = reverseComplement(top);
      return sourcePrimer(anchor, {
        id, direction: 'reverse', tail, anchor,
        segments: [{ start, end: start + 16 }],
      });
    };
    render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={template}
      lineLen={template.length}
      directionFilter="reverse"
      primers={[
        reversePrimerAt('reverse-tail', 5, 'G'.repeat(20)),
        reversePrimerAt('reverse-middle', 7),
        reversePrimerAt('reverse-last', 9),
      ]}
    />);

    const groups = [...document.querySelectorAll('[data-testid="sequence-view-primer"]')];
    expect(groups).toHaveLength(3);
    const templateYs = groups.map((group) => Number(
      group.querySelector('[data-primer-lane="template"]').getAttribute('data-primer-lane-y'),
    ));
    expect(new Set(templateYs).size).toBe(3);

    const tailed = document.querySelector('[data-primer-name="reverse-tail"]');
    const templateY = Number(
      tailed.querySelector('[data-primer-lane="template"]').getAttribute('data-primer-lane-y'),
    );
    const outerY = Number(
      tailed.querySelector('[data-testid="sequence-view-primer-tail"]')
        .getAttribute('data-primer-lane-y'),
    );
    expect(outerY - templateY).toBe(PRIMER_TAIL_OFFSET);
  });

  it('draws a selected inline tail and binding inside one closed stepped envelope', () => {
    const props = {
      ...BASE_PROPS,
      onPrimerClick: vi.fn(),
      primers: [sourcePrimer(ANCHOR, { id: 'composite', tail: 'GGGG' })],
    };
    const { rerender } = render(<PrimerTrack {...props} />);
    const key = screen.getByTestId('sequence-view-primer').dataset.primerKey;
    rerender(
      <PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />,
    );

    const primer = screen.getByTestId('sequence-view-primer');
    const envelope = primer.querySelector('[data-testid="sequence-view-primer-envelope"]');
    expect(envelope).toBeTruthy();
    expect(envelope.getAttribute('data-primer-envelope')).toBe('stepped-perimeter');
    expect(envelope.getAttribute('d').trim().endsWith('Z')).toBe(true);
    expect(envelope.getAttribute('stroke')).toBe('var(--viz-primer-fwd)');
    expect(Number(envelope.getAttribute('stroke-width'))).toBeLessThanOrEqual(1);

    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(tail.getAttribute('stroke-dasharray')).toBeNull();
    expect(primer.querySelectorAll('[data-primer-selection-bracket]')).toHaveLength(2);
  });

  it('keeps a one-base mismatch visible inside one continuous binding contour', () => {
    const body = `${ANCHOR.slice(0, 5)}T${ANCHOR.slice(6)}`;
    render(<PrimerTrack {...BASE_PROPS} primers={[sourcePrimer(body, {
      id: 'truthful-mismatch', tail: '',
    })]} />);

    const primer = screen.getByTestId('sequence-view-primer');
    const envelope = screen.getByTestId('sequence-view-primer-envelope');
    expect(primer).toBeTruthy();
    expect(primer.querySelector('[data-primer-alignment-op="X"]')).toBeTruthy();
    expect(envelope.dataset.primerEnvelopeOccupiedRuns)
      .toBe('M:0-5,X:5-6,M:6-16');
    expect(envelope.dataset.primerEnvelopeComponentCount).toBe('1');
    expect(primer.querySelector('[data-primer-alignment-op="X"]')
      .getAttribute('data-primer-lane')).toBe('template');
  });

  it('keeps an insertion plaque visibly separate while retaining it in the focus contour', () => {
    const body = `${ANCHOR.slice(0, 8)}A${ANCHOR.slice(8)}`;
    render(<PrimerTrack {...BASE_PROPS} primers={[sourcePrimer(body, {
      id: 'truthful-insertion', tail: 'GGGG',
    })]} />);

    expect(screen.getByTestId('sequence-view-primer-insertion')).toBeTruthy();
    const envelope = screen.getByTestId('sequence-view-primer-envelope');
    expect(envelope.dataset.primerEnvelopeInsertions).toBe('8:1');
    expect(Number(envelope.dataset.primerEnvelopeComponentCount)).toBe(2);
  });

  it('leaves a deletion as a visible bridge and a real gap in the contour', () => {
    const body = `${ANCHOR.slice(0, 8)}${ANCHOR.slice(9)}`;
    render(<PrimerTrack {...BASE_PROPS} primers={[sourcePrimer(body, {
      id: 'truthful-deletion', tail: 'GGGG',
    })]} />);

    expect(screen.getByTestId('sequence-view-primer-deletion-bridge')).toBeTruthy();
    const envelope = screen.getByTestId('sequence-view-primer-envelope');
    expect(envelope.dataset.primerEnvelopeOccupiedRuns).toBe('M:0-7,M:8-16');
    expect(Number(envelope.dataset.primerEnvelopeComponentCount)).toBeGreaterThan(1);
  });

  it('keeps a forward mismatch in the binding row while only the tail uses the outer lane', () => {
    const body = `${ANCHOR.slice(0, 5)}T${ANCHOR.slice(6)}`;
    render(<PrimerTrack {...BASE_PROPS} primers={[sourcePrimer(body)]} />);

    const primer = screen.getByTestId('sequence-view-primer');
    const paired = primer.querySelector('[data-primer-lane="template"]');
    const mismatch = primer.querySelector('[data-primer-alignment-op="X"]');
    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(Number(mismatch.getAttribute('data-primer-lane-y')))
      .toBe(Number(paired.getAttribute('data-primer-lane-y')));
    expect(mismatch.getAttribute('data-primer-lane')).toBe('template');
    expect(screen.getByTestId('sequence-view-primer-base-mismatch').getAttribute('fill'))
      .toBe('var(--danger-fg)');
    expect(tail.getAttribute('data-primer-lane')).toBe('tail');
    const connector = primer.querySelector('[data-primer-step-source="tail"]');
    expect(connector).toBeTruthy();
    expect(Number(connector.getAttribute('stroke-width'))).toBe(2);
    expect(connector.getAttribute('stroke-linecap')).toBe('round');
    expect(Math.abs(
      Number(tail.getAttribute('data-primer-lane-y'))
      - Number(paired.getAttribute('data-primer-lane-y')),
    )).toBe(PRIMER_TAIL_OFFSET);
    expect([...primer.children].indexOf(connector))
      .toBeGreaterThan([...primer.children].indexOf(tail));
  });

  it('keeps a reverse mismatch in the binding row while only the tail uses the outer lane', () => {
    const anchor = reverseComplement(ANCHOR);
    const body = `${anchor.slice(0, 5)}T${anchor.slice(6)}`;
    render(<PrimerTrack {...BASE_PROPS} primers={[sourcePrimer(body, {
      id: 'p7-reverse', direction: 'reverse', tail: 'AA', anchor,
    })]} />);

    const primer = screen.getByTestId('sequence-view-primer');
    const paired = primer.querySelector('[data-primer-lane="template"]');
    const mismatch = primer.querySelector('[data-primer-alignment-op="X"]');
    expect(Number(mismatch.getAttribute('data-primer-lane-y')))
      .toBe(Number(paired.getAttribute('data-primer-lane-y')));
    expect(mismatch.getAttribute('data-primer-lane')).toBe('template');
    expect(screen.getByTestId('sequence-view-primer-tail').getAttribute('data-primer-lane'))
      .toBe('tail');
  });

  it.each(['forward', 'reverse'])(
    'shows a readable %s insertion callout centered on its alignment boundary',
    (direction) => {
      const anchor = direction === 'reverse' ? reverseComplement(ANCHOR) : ANCHOR;
      // Keep a 12-nt matched 3′ anchor so this proves insertion geometry,
      // rather than the separate fail-closed non-annealing presentation.
      const body = `${anchor.slice(0, 4)}AA${anchor.slice(4)}`;
      render(<PrimerTrack {...BASE_PROPS} primers={[sourcePrimer(body, {
        id: `clear-insertion-${direction}`, direction, tail: 'AA', anchor,
      })]} />);

      const primer = screen.getByTestId('sequence-view-primer');
      const templateY = Number(
        primer.querySelector('[data-primer-lane="template"]').getAttribute('data-primer-lane-y'),
      );
      const insertion = screen.getByTestId('sequence-view-primer-insertion');
      const insertionY = Number(insertion.getAttribute('data-primer-lane-y'));
      const [, translatedX, translatedY] = /translate\(([-\d.]+), ([-\d.]+)\)/
        .exec(insertion.getAttribute('transform'));
      const insertionBox = insertion.querySelector('rect');
      const insertionText = insertion.querySelector('text');
      const insertionConnector = primer.querySelector(
        '[data-primer-step-source="insertion"]',
      );
      const boundary = direction === 'forward' ? 4 : ANCHOR.length - 4;

      expect(insertion.getAttribute('data-primer-insertion-count')).toBe('2');
      expect(insertion.textContent).toBe(direction === 'forward' ? 'AA' : 'TT');
      expect(Number(translatedX)).toBeCloseTo(boundary * BASE_PROPS.charPx, 3);
      expect(Number(translatedY)).toBe(insertionY);
      expect(Number(insertionBox.getAttribute('width')))
        .toBeCloseTo(2 * BASE_PROPS.charPx, 3);
      expect(Number(insertionBox.getAttribute('x')))
        .toBeCloseTo(-BASE_PROPS.charPx, 3);
      expect(Number(insertionText.getAttribute('x')))
        .toBeCloseTo(0, 3);
      expect(Number(insertionText.getAttribute('font-size'))).toBe(10);
      expect(Number(insertionConnector.getAttribute('stroke-width'))).toBe(2);
      expect(insertionConnector.getAttribute('stroke-linecap')).toBe('round');
      expect(insertionConnector.getAttribute('stroke')).toBe('var(--danger-fg)');
      expect(insertionBox.getAttribute('fill')).toBe('var(--danger-bg)');
      expect(insertionBox.getAttribute('stroke')).toBe('var(--danger-fg)');
      expect(insertionText.getAttribute('fill')).toBe('var(--danger-fg)');
      expect(Number(insertionBox.getAttribute('y'))).toBe(1);
      expect(Number(insertionBox.getAttribute('height'))).toBe(12);
      if (direction === 'forward') {
        expect(templateY - (
          insertionY
          + Number(insertionBox.getAttribute('y'))
          + Number(insertionBox.getAttribute('height'))
        )).toBe(1);
        expect(Number(insertionConnector.getAttribute('y1'))).toBe(templateY + PRIMER_GLYPH_HEIGHT);
        expect(Number(insertionConnector.getAttribute('y2'))).toBe(templateY - 1);
      } else {
        expect(insertionY + Number(insertionBox.getAttribute('y'))
          - (templateY + PRIMER_GLYPH_HEIGHT)).toBe(1);
        expect(Number(insertionConnector.getAttribute('y1'))).toBe(templateY);
        expect(Number(insertionConnector.getAttribute('y2'))).toBe(templateY + PRIMER_GLYPH_HEIGHT + 1);
      }
    },
  );

  it.each(['forward', 'reverse'])(
    'keeps a long terminal %s insertion centered within the reserved line edge guard',
    (direction) => {
      const reverse = direction === 'reverse';
      const anchor = reverse ? reverseComplement(ANCHOR) : ANCHOR;
      const insertionBases = 'C'.repeat(24);
      const template = reverse ? ANCHOR : `${'T'.repeat(5)}${ANCHOR}`;
      const segment = reverse
        ? { start: 0, end: ANCHOR.length }
        : { start: 5, end: 5 + ANCHOR.length };
      const edgeGuardChars = 13;
      const props = {
        ...BASE_PROPS,
        fullSeq: template,
        lineLen: template.length,
        labelChars: BASE_PROPS.labelChars,
        onPrimerClick: vi.fn(),
        primers: [sourcePrimer(`${anchor}${insertionBases}`, {
          id: `terminal-insertion-${direction}`,
          direction,
          tail: '',
          anchor,
          segments: [segment],
        })],
      };
      const { rerender } = render(<PrimerTrack {...props} />);
      const key = screen.getByTestId('sequence-view-primer').dataset.primerKey;

      rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />);

      const svg = screen.getByTestId('sequence-view-primers');
      const primer = screen.getByTestId('sequence-view-primer');
      const insertion = screen.getByTestId('sequence-view-primer-insertion');
      const box = insertion.querySelector('rect');
      const groupX = Number(/translate\(([-\d.]+)/
        .exec(primer.getAttribute('transform'))?.[1] || 0);
      const [, boundaryX] = /translate\(([-\d.]+), ([-\d.]+)\)/
        .exec(insertion.getAttribute('transform'));
      const boxLeft = groupX + Number(boundaryX) + Number(box.getAttribute('x'));
      const boxRight = boxLeft + Number(box.getAttribute('width'));
      const expectedBoundaryColumn = reverse
        ? BASE_PROPS.labelChars
        : BASE_PROPS.labelChars + template.length;
      const horizontalOverflow = Math.max(
        0,
        -boxLeft,
        boxRight - Number(svg.getAttribute('width')),
      );

      expect(groupX + Number(boundaryX))
        .toBeCloseTo(expectedBoundaryColumn * props.charPx, 6);
      expect(horizontalOverflow).toBeLessThanOrEqual(edgeGuardChars * props.charPx);
      expect(Number(box.getAttribute('x')))
        .toBeCloseTo(-Number(box.getAttribute('width')) / 2, 6);
    },
  );

  it.each(['forward', 'reverse'])(
    'promotes a long %s insertion beyond an overlapping 5-prime tail without layout jump',
    (direction) => {
      const anchor = direction === 'reverse' ? reverseComplement(ANCHOR) : ANCHOR;
      const insertionBases = 'A'.repeat(24);
      const body = `${anchor.slice(0, 4)}${insertionBases}${anchor.slice(4)}`;
      const props = {
        ...BASE_PROPS,
        onPrimerClick: vi.fn(),
        primers: [sourcePrimer(body, {
          id: `promoted-insertion-${direction}`,
          direction,
          tail: 'G'.repeat(8),
          anchor,
        })],
      };
      const { rerender } = render(<PrimerTrack {...props} />);
      const compact = screen.getByTestId('sequence-view-primer');
      const key = compact.dataset.primerKey;
      const before = {
        height: Number(screen.getByTestId('sequence-view-primers').getAttribute('height')),
        transform: compact.getAttribute('transform'),
      };

      rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />);

      const expanded = screen.getByTestId('sequence-view-primer');
      const insertion = screen.getByTestId('sequence-view-primer-insertion');
      const insertionBox = insertion.querySelector('rect');
      const tail = screen.getByTestId('sequence-view-primer-tail');
      const template = expanded.querySelector('[data-primer-lane="template"]');
      const [, insertionX, insertionY] = /translate\(([-\d.]+), ([-\d.]+)\)/
        .exec(insertion.getAttribute('transform'));
      const insertionLeft = Number(insertionX) + Number(insertionBox.getAttribute('x'));
      const insertionRight = insertionLeft + Number(insertionBox.getAttribute('width'));
      const insertionTop = Number(insertionY) + Number(insertionBox.getAttribute('y'));
      const insertionBottom = insertionTop + Number(insertionBox.getAttribute('height'));
      const groupX = Number(/translate\(([-\d.]+)/
        .exec(expanded.getAttribute('transform'))?.[1] || 0);
      const svgWidth = Number(screen.getByTestId('sequence-view-primers').getAttribute('width'));
      const tailLeft = Number(tail.getAttribute('x'));
      const tailRight = tailLeft + Number(tail.getAttribute('width'));
      const tailTop = Number(tail.getAttribute('y'));
      const tailBottom = tailTop + Number(tail.getAttribute('height'));
      const templateTop = Number(template.getAttribute('data-primer-lane-y'));
      const insertionHit = expanded.querySelector('[data-primer-hit-lane="far-outer"]');
      const insertionHitLeft = Number(insertionHit.getAttribute('x'));
      const insertionHitRight = insertionHitLeft + Number(insertionHit.getAttribute('width'));
      const insertionHitTop = Number(insertionHit.getAttribute('y'));
      const insertionHitBottom = insertionHitTop + Number(insertionHit.getAttribute('height'));

      expect(insertion.getAttribute('data-primer-insertion-count')).toBe('24');
      expect(insertion.getAttribute('data-primer-lane')).toBe('far-outer');
      expect(Math.min(insertionRight, tailRight) - Math.max(insertionLeft, tailLeft))
        .toBeGreaterThan(0);
      expect(groupX + insertionLeft).toBeGreaterThanOrEqual(0);
      expect(groupX + insertionRight).toBeLessThanOrEqual(svgWidth);
      expect(insertionTop).toBeGreaterThanOrEqual(0);
      expect(insertionHitLeft).toBeLessThanOrEqual(insertionLeft);
      expect(insertionHitRight).toBeGreaterThanOrEqual(insertionRight);
      expect(insertionHitTop).toBeLessThanOrEqual(insertionTop);
      expect(insertionHitBottom).toBeGreaterThanOrEqual(insertionBottom);
      if (direction === 'forward') {
        expect(insertionBottom).toBeLessThanOrEqual(tailTop);
        expect(tailTop - insertionTop).toBe(
          2 * PRIMER_STEP_OFFSET
          - PRIMER_TAIL_OFFSET
          - Number(insertionBox.getAttribute('y')),
        );
        expect(templateTop - tailTop).toBe(PRIMER_TAIL_OFFSET);
      } else {
        expect(tailBottom).toBeLessThanOrEqual(insertionTop);
        expect(tailTop - templateTop).toBe(PRIMER_TAIL_OFFSET);
        expect(insertionTop - tailTop).toBe(
          2 * PRIMER_STEP_OFFSET
          - PRIMER_TAIL_OFFSET
          + Number(insertionBox.getAttribute('y')),
        );
      }
      expect(before.height).toBeGreaterThanOrEqual(3 * PRIMER_GLYPH_HEIGHT);
      expect({
        height: Number(screen.getByTestId('sequence-view-primers').getAttribute('height')),
        transform: expanded.getAttribute('transform'),
      }).toEqual(before);
    },
  );

  it.each([
    ['forward', 'non-annealing'],
    ['reverse', 'non-annealing'],
    ['forward', 'annealing'],
    ['reverse', 'annealing'],
  ])('keeps dense %s %s substitutions as a solid compact primer and clean expanded cells', (
    direction,
    expectedStatus,
  ) => {
    // High-complexity target chosen so the deterministic fixed-3′ aligner has
    // one unambiguous all-diagonal answer for both strands. A repetitive target
    // can legitimately explain alternating differences with I/D instead of X.
    const top = 'GTTGAGCTGGGATAGATGCGGCAT';
    const anchor = direction === 'reverse' ? reverseComplement(top) : top;
    const bases = 'ACGT';
    const alternate = (base) => bases[(bases.indexOf(base) + 2) % bases.length];
    const shouldReplace = expectedStatus === 'non-annealing'
      ? (_, index) => index % 2 === 1
      : (_, index) => index < 10 && index % 2 === 1;
    const body = [...anchor]
      .map((base, index) => (shouldReplace(base, index) ? alternate(base) : base))
      .join('');
    const template = `TT${top}${'G'.repeat(8)}`;
    const primerColor = direction === 'reverse'
      ? 'var(--viz-primer-rev)'
      : 'var(--viz-primer-fwd)';
    const mismatchCount = expectedStatus === 'non-annealing' ? 12 : 5;
    const props = {
      ...BASE_PROPS,
      fullSeq: template,
      lineLen: template.length,
      onPrimerClick: vi.fn(),
      primers: [sourcePrimer(body, {
        id: `dense-${expectedStatus}-${direction}`,
        direction,
        tail: '',
        anchor,
        segments: [{ start: 2, end: 2 + anchor.length }],
      })],
    };
    const { rerender } = render(<PrimerTrack {...props} />);
    const compact = screen.getByTestId('sequence-view-primer');
    const key = compact.dataset.primerKey;
    const compactRuns = [...compact.querySelectorAll(
      '[data-testid="sequence-view-primer-compact-run"]',
    )];
    const compactMismatches = [...compact.querySelectorAll(
      '[data-testid="sequence-view-primer-compact-mismatch"]',
    )];

    expect(compact.dataset.primerAnnealingStatus).toBe(expectedStatus);
    expect(compact.dataset.primerDetached).toBe(
      expectedStatus === 'non-annealing' ? 'true' : undefined,
    );
    expect(compactRuns).toHaveLength(1);
    compactRuns.forEach((run) => {
      expect(run.getAttribute('stroke')).toBe(primerColor);
      expect(run.getAttribute('stroke-dasharray')).toBeNull();
    });
    expect(compactMismatches).toHaveLength(mismatchCount);
    compactMismatches.forEach((marker) => {
      expect(marker.getAttribute('stroke')).toBe('var(--danger-fg)');
      expect(marker.getAttribute('stroke-dasharray')).toBeNull();
    });

    rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />);

    const expanded = screen.getByTestId('sequence-view-primer');
    const envelope = within(expanded).getByTestId('sequence-view-primer-envelope');
    const cells = [...expanded.querySelectorAll('rect[data-primer-alignment-op]')];
    const mismatchCells = cells.filter((cell) => cell.dataset.primerAlignmentOp === 'X');
    const mismatchLetters = [...expanded.querySelectorAll(
      'tspan[data-primer-alignment-op="X"]',
    )];

    expect(expanded.dataset.primerAnnealingStatus).toBe(expectedStatus);
    expect(envelope.getAttribute('stroke')).toBe(primerColor);
    expect(envelope.getAttribute('stroke-dasharray')).toBeNull();
    expect((envelope.getAttribute('d').match(/M/g) || [])).toHaveLength(1);
    expect(envelope.getAttribute('d').trim().endsWith('Z')).toBe(true);
    expect(mismatchCells).toHaveLength(mismatchCount);
    expect(mismatchLetters).toHaveLength(mismatchCount);
    expect(mismatchCells.every((cell) => cell.dataset.primerLane === (
      expectedStatus === 'non-annealing' ? 'outer' : 'template'
    ))).toBe(true);
    const head = within(expanded).getByTestId('sequence-view-primer-arrowhead');
    expect(head.getAttribute('stroke')).toBe('none');
    expect(Number(head.getAttribute('stroke-width'))).toBe(0);
    cells.forEach((cell) => {
      expect(cell.getAttribute('stroke')).toBe('none');
      expect(Number(cell.getAttribute('stroke-width'))).toBe(0);
      expect(cell.getAttribute('stroke-dasharray')).toBeNull();
    });
    mismatchCells.forEach((cell, index) => {
      const letter = mismatchLetters[index];
      expect(cell.getAttribute('fill')).toBe('var(--danger-bg)');
      expect(Number(letter.getAttribute('x')))
        .toBeCloseTo(Number(cell.getAttribute('x')) + Number(cell.getAttribute('width')) / 2, 3);
      expect(Number(letter.getAttribute('y')))
        .toBeCloseTo(Number(cell.getAttribute('y')) + PRIMER_GLYPH_HEIGHT / 2, 3);
      expect(letter.getAttribute('fill')).toBe('var(--danger-fg)');
    });
  });

  it('detaches the entire truthful exact 9-mer but keeps an exact 10-mer at the template', () => {
    const nine = 'ACGTACGTA';
    const nineTemplate = `TT${nine}GGGGGGGGGGGG`;
    const nineProps = {
      ...BASE_PROPS, fullSeq: nineTemplate, lineLen: nineTemplate.length,
    };
    const { unmount } = render(<PrimerTrack {...nineProps} primers={[sourcePrimer(nine, {
      id: 'p7-nine', tail: '', anchor: nine, segments: [{ start: 2, end: 11 }],
    })]} />);
    let primer = screen.getByTestId('sequence-view-primer');
    expect(primer.getAttribute('data-primer-annealing-status')).toBe('non-annealing');
    expect(primer.getAttribute('data-primer-detached')).toBe('true');
    expect(primer.querySelectorAll('[data-primer-lane="template"]')).toHaveLength(0);
    expect(primer.querySelectorAll('[data-primer-alignment-op="M"]')).not.toHaveLength(0);
    const detachedY = Number(
      primer.querySelector('[data-primer-alignment-op="M"]').getAttribute('data-primer-lane-y'),
    );

    unmount();
    const ten = 'ACGTACGTAA';
    const tenTemplate = `TT${ten}GGGGGGGGGGGG`;
    render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={tenTemplate}
      lineLen={tenTemplate.length}
      primers={[sourcePrimer(ten, {
        id: 'p7-ten', tail: '', anchor: ten, segments: [{ start: 2, end: 12 }],
      })]}
    />);
    primer = screen.getByTestId('sequence-view-primer');
    expect(primer.getAttribute('data-primer-annealing-status')).toBe('annealing');
    expect(primer.querySelectorAll('[data-primer-lane="template"]')).not.toHaveLength(0);
    const annealedY = Number(
      primer.querySelector('[data-primer-lane="template"]').getAttribute('data-primer-lane-y'),
    );
    expect(detachedY).toBeLessThan(annealedY);
  });

  it('detaches an exact reverse 9-mer below its template lane', () => {
    const nine = 'TACGTACGT';
    const top = reverseComplement(nine);
    const template = `TT${top}GGGGGGGGGGGG`;
    render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={template}
      lineLen={template.length}
      primers={[sourcePrimer(nine, {
        id: 'p7-reverse-nine', direction: 'reverse', tail: '', anchor: nine,
        segments: [{ start: 2, end: 11 }],
      })]}
    />);

    const primer = screen.getByTestId('sequence-view-primer');
    const detached = primer.querySelector('[data-primer-alignment-op="M"]');
    expect(primer.dataset.primerDetached).toBe('true');
    expect(detached.getAttribute('data-primer-lane')).toBe('outer');
    expect(Number(detached.getAttribute('data-primer-lane-y'))).toBeGreaterThan(0);
  });

  it('keeps one occurrence identity, one tail, and one physical 3-prime head through origin', () => {
    const circular = 'ACGTACGTACGTACGTACGT';
    const anchor = circular.slice(16) + circular.slice(0, 8);
    const onPrimerClick = vi.fn();
    const { rerender } = render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={circular}
      lineLen={circular.length}
      topology="circular"
      circular
      onPrimerClick={onPrimerClick}
      primers={[sourcePrimer(anchor, {
        id: 'p7-origin', tail: 'AGTC', anchor, topology: 'circular',
        segments: [{ start: 16, end: 20 }, { start: 0, end: 8 }],
      })]}
    />);

    const parts = screen.getAllByTestId('sequence-view-primer');
    expect(new Set(parts.map((node) => node.dataset.primerOccurrenceKey)).size).toBe(1);
    expect(screen.getAllByTestId('sequence-view-primer-tail')).toHaveLength(1);
    expect(screen.getAllByTestId('sequence-view-primer-arrowhead')).toHaveLength(1);
    fireEvent.click(parts[0]);
    fireEvent.keyDown(parts[1], { key: 'Enter' });
    expect(onPrimerClick).toHaveBeenCalledTimes(2);
    expect(onPrimerClick.mock.calls[0][0]).toBe(onPrimerClick.mock.calls[1][0]);
    const selectedKey = onPrimerClick.mock.calls[0][0];
    rerender(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={circular}
      lineLen={circular.length}
      topology="circular"
      circular
      onPrimerClick={onPrimerClick}
      selectedPrimerKeys={[selectedKey]}
      primers={[sourcePrimer(anchor, {
        id: 'p7-origin', tail: 'AGTC', anchor, topology: 'circular',
        segments: [{ start: 16, end: 20 }, { start: 0, end: 8 }],
      })]}
    />);
    expect(screen.getAllByTestId('sequence-view-primer')
      .every((node) => node.dataset.selected === 'true')).toBe(true);
  });

  it('promotes a wrapped insertion when its centered callout overlaps the remote tail', () => {
    const circular = 'ACGT'.repeat(6);
    const anchor = circular.slice(20) + circular.slice(0, 12);
    const insertionBases = 'A'.repeat(24);
    const body = `${anchor.slice(0, 6)}${insertionBases}${anchor.slice(6)}`;
    render(<PrimerTrack
      {...BASE_PROPS}
      fullSeq={circular}
      lineLen={circular.length}
      topology="circular"
      circular
      onPrimerClick={vi.fn()}
      primers={[sourcePrimer(body, {
        id: 'p7-origin-insertion',
        tail: 'G'.repeat(8),
        anchor,
        topology: 'circular',
        segments: [{ start: 20, end: 24 }, { start: 0, end: 12 }],
      })]}
    />);

    const parts = screen.getAllByTestId('sequence-view-primer');
    const insertion = screen.getByTestId('sequence-view-primer-insertion');
    const tail = screen.getByTestId('sequence-view-primer-tail');
    const insertionGroupX = Number(/translate\(([-\d.]+)/
      .exec(insertion.closest('[data-testid="sequence-view-primer"]')
        .getAttribute('transform'))?.[1] || 0);
    const tailOwner = tail.closest(
      '[data-testid="sequence-view-primer-tail-wrap"], [data-testid="sequence-view-primer"]',
    );
    const tailGroupX = Number(/translate\(([-\d.]+)/
      .exec(tailOwner.getAttribute('transform'))?.[1] || 0);
    const insertionLeft = insertionGroupX + Number(insertion.getAttribute('x1'));
    const insertionRight = insertionGroupX + Number(insertion.getAttribute('x2'));
    const tailLeft = tailGroupX + Number(tail.getAttribute('x1'));
    const tailRight = tailGroupX + Number(tail.getAttribute('x2'));
    const insertionY = Number(insertion.getAttribute('data-primer-lane-y'));
    const tailY = Number(tail.getAttribute('data-primer-lane-y'));

    expect(new Set(parts.map((node) => node.dataset.primerOccurrenceKey)).size).toBe(1);
    expect(Math.min(insertionRight, tailRight) - Math.max(insertionLeft, tailLeft))
      .toBeGreaterThan(0);
    expect(insertion.getAttribute('data-primer-lane')).toBe('far-outer');
    expect(tail.getAttribute('data-primer-lane')).toBe('tail');
    expect(Math.abs(insertionY - tailY)).toBe(2 * PRIMER_STEP_OFFSET - PRIMER_TAIL_OFFSET);
  });
});
