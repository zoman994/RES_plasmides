import {
  afterEach, describe, expect, it,
} from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PrimerFromSelectionModal from '../popups/PrimerFromSelectionModal';
import PrimerTrack from '../tracks/PrimerTrack';

afterEach(cleanup);

const TEMPLATE = `ATGCAAAGGGCCCTAACGTTAAA${'G'.repeat(60)}`;
const TRACK_BASE = {
  fullSeq: TEMPLATE,
  lineStart: 0,
  lineLen: TEMPLATE.length,
  labelChars: 8,
  primerStyle: 'outline',
  charPx: 7.2,
  onPrimerClick: () => {},
};

function expectShortSelectionBrackets(root) {
  const brackets = [...root.querySelectorAll('[data-primer-selection-bracket]')];
  expect(brackets).toHaveLength(2);
  for (const bracket of brackets) {
    expect(bracket.getAttribute('stroke')).toBe('var(--accent-500)');
    expect(Number(bracket.getAttribute('stroke-width'))).toBeLessThanOrEqual(1.25);
  }
  expect(root.querySelector('[data-primer-selection-halo]')).toBeNull();
  expect(root.querySelector('[data-primer-selection-box]')).toBeNull();
}

function typeAtLiveCaret(field, text) {
  for (const character of text) {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const nextValue = `${field.value.slice(0, start)}${character}${field.value.slice(end)}`;
    fireEvent.change(field, {
      target: {
        value: nextValue,
        selectionStart: start + character.length,
        selectionEnd: start + character.length,
      },
    });
  }
}

describe('P11 primer interaction polish', () => {
  it.each([
    ['forward', 'ATGCAAAGGGCCC', 'p-fwd|forward|0', 'var(--viz-primer-fwd)'],
    ['reverse', 'GGGCCCTTTGCAT', 'p-rev|reverse|0', 'var(--viz-primer-rev)'],
  ])('keeps a selected %s primer directional with only a thin amber contour', (
    direction, bindingSequence, selectedKey, directionColor,
  ) => {
    render(
      <PrimerTrack
        {...TRACK_BASE}
        primers={[{
          name: `p-${direction === 'forward' ? 'fwd' : 'rev'}`,
          direction,
          bindingSequence,
          tail: 'AAAA',
          sequence: `AAAA${bindingSequence}`,
        }]}
        selectedPrimerKeys={[selectedKey]}
        expandedPrimerKey={selectedKey}
      />,
    );

    const primer = screen.getByTestId('sequence-view-primer');
    const body = primer.querySelector('[data-primer-arrow]');
    const envelope = primer.querySelector('[data-primer-envelope="stepped-perimeter"]');
    expect(body.getAttribute('fill')).toBe('var(--surface-1)');
    expect(body.getAttribute('stroke')).toBe('none');
    expect(envelope.getAttribute('stroke')).toBe(directionColor);
    expect(screen.getByTestId('sequence-view-primer-tail').getAttribute('fill'))
      .toBe(directionColor);
    expectShortSelectionBrackets(primer);
  });

  it('keeps a selected wrapped tail free of body-only selection brackets', () => {
    const binding = 'ACGTACGTACGT';
    const props = {
      fullSeq: `${'T'.repeat(20)}${binding}${'T'.repeat(8)}`,
      lineStart: 0,
      lineLen: 20,
      labelChars: 8,
      primerStyle: 'filled',
      charPx: 7.2,
      primers: [{
        name: 'wrapped', direction: 'forward', bindingSequence: binding,
        tail: 'GGGGGG', sequence: `GGGGGG${binding}`,
      }],
      onPrimerClick: () => {},
    };
    const { rerender } = render(<PrimerTrack {...props} />);
    const key = screen.getByTestId('sequence-view-primer-tail-wrap').dataset.primerKey;
    rerender(
      <PrimerTrack {...props} selectedPrimerKeys={[key]} expandedPrimerKey={key} />,
    );

    const tailGroup = screen.getByTestId('sequence-view-primer-tail-wrap');
    expect(tailGroup.dataset.selected).toBe('true');
    expect(tailGroup.querySelectorAll('[data-primer-selection-bracket]')).toHaveLength(0);
    expect(tailGroup.querySelector('[data-primer-selection-halo]')).toBeNull();
    expect(tailGroup.querySelector('[data-primer-selection-box]')).toBeNull();
  });

  it.each([
    ['primer-modal-tail', 'GGTT', 2, 'GGACTT'],
    ['primer-modal-seq', 'AACCGGTT', 4, 'AACCACGGTT'],
  ])('keeps accepted and rejected edits local in %s', (testId, initial, caret, expected) => {
    render(
      <PrimerFromSelectionModal
        draft={{
          name: 'caret', direction: 'forward', tail: 'GGTT', binding: 'AACCGGTT',
          sequence: 'GGTTAACCGGTT', bindingModel: 'aligned-v1',
        }}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );
    const field = screen.getByTestId(testId);
    expect(field.value).toBe(initial);
    field.focus();
    field.setSelectionRange(caret, caret);

    typeAtLiveCaret(field, 'ac');
    expect(field.value).toBe(expected);
    expect(field.selectionStart).toBe(caret + 2);
    expect(field.selectionEnd).toBe(caret + 2);

    const beforeInvalid = field.value;
    field.setSelectionRange(caret + 1, caret + 1);
    typeAtLiveCaret(field, 'ф');
    expect(field.value).toBe(beforeInvalid);
    expect(field.selectionStart).toBe(caret + 1);
    expect(field.selectionEnd).toBe(caret + 1);
  });
});
