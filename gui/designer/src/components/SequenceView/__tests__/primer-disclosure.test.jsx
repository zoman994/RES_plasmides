import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { StrictMode } from 'react';
import {
  act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';

import SequenceView from '../index';
import { useStore } from '../../../store';
import { runHotkeyResolver, useHotkey } from '../../../lib/hotkeys';
import { reverseComplement } from '../../../sequence-utils';

const UNIQUE = 'TTAGCATCGATTGCACTAGT';
const SEQUENCE = `${'ATGGCC'.repeat(12)}${UNIQUE}${'GGATCC'.repeat(12)}`;
const FRAGMENT = {
  id: 'p16-fragment',
  name: 'P16 template',
  type: 'misc_feature',
  sequence: SEQUENCE,
  strand: 1,
  annotations: [],
};
const PRIMERS = [
  {
    id: 'p16-forward',
    name: 'P16 forward',
    direction: 'forward',
    bindingSequence: UNIQUE.slice(0, 14),
    tail: 'GAATTC',
    sequence: `GAATTC${UNIQUE.slice(0, 14)}`,
  },
  {
    id: 'p16-second',
    name: 'P16 second',
    direction: 'reverse',
    bindingSequence: reverseComplement(UNIQUE.slice(6)),
    sequence: reverseComplement(UNIQUE.slice(6)),
  },
];
const THIRD_FORWARD = {
  ...PRIMERS[0],
  id: 'p16-third-forward',
  name: 'P16 third forward',
};

function resetSettings() {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: 'auto',
      autoThreshold: 0.8,
      primerStyle: 'filled',
      reOrientation: 'horizontal',
      visibleFrames: {
        '1': true, '2': true, '3': true, '-1': true, '-2': true, '-3': true,
      },
      predictions: {},
    },
  });
}

beforeEach(resetSettings);
afterEach(cleanup);

function renderViewer(extra = {}) {
  return render(
    <SequenceView
      fragments={[FRAGMENT]}
      primers={PRIMERS}
      entryId="p16-fragment"
      {...extra}
    />,
  );
}

function ViewerWithGlobalEscape({ onEscape }) {
  useHotkey('escape', onEscape);
  return (
    <>
      <button type="button" data-testid="outside-viewer">outside</button>
      <SequenceView fragments={[FRAGMENT]} primers={PRIMERS} entryId="p16-fragment" />
    </>
  );
}

describe('P16 — one disclosure, separate PCR pair', () => {
  it('plain click expands one occurrence, transfers disclosure, and repeated click only collapses it', () => {
    renderViewer();
    const [first, second] = screen.getAllByTestId('sequence-view-primer');

    expect(first.getAttribute('data-expanded')).toBe('false');
    expect(second.getAttribute('data-expanded')).toBe('false');
    expect(screen.queryByTestId('sequence-view-primer-bases')).toBeNull();

    fireEvent.click(first);
    expect(first.getAttribute('data-expanded')).toBe('true');
    expect(first.getAttribute('data-selected')).toBe('true');
    expect(within(first).getByTestId('sequence-view-primer-bases')).toBeTruthy();

    fireEvent.click(second);
    expect(first.getAttribute('data-selected')).toBe('false');
    expect(first.getAttribute('data-expanded')).toBe('false');
    expect(second.getAttribute('data-selected')).toBe('true');
    expect(second.getAttribute('data-expanded')).toBe('true');

    fireEvent.click(second);
    expect(second.getAttribute('data-selected')).toBe('true');
    expect(second.getAttribute('data-expanded')).toBe('false');
  });

  it('Ctrl/Cmd click creates only a forward plus reverse pair while the active primer expands', () => {
    renderViewer();
    const [first, second] = screen.getAllByTestId('sequence-view-primer');

    fireEvent.click(first);
    fireEvent.click(second, { ctrlKey: true });

    expect(first.getAttribute('data-selected')).toBe('true');
    expect(first.getAttribute('data-expanded')).toBe('false');
    expect(second.getAttribute('data-selected')).toBe('true');
    expect(second.getAttribute('data-expanded')).toBe('true');
  });

  it('Ctrl/Cmd click replaces the member of the same direction and preserves the opposite member', () => {
    renderViewer({ primers: [...PRIMERS, THIRD_FORWARD] });
    const primerNodes = screen.getAllByTestId('sequence-view-primer');
    const first = primerNodes.find((node) => node.dataset.primerId === 'p16-forward');
    const reverse = primerNodes.find((node) => node.dataset.primerId === 'p16-second');
    const replacement = primerNodes.find((node) => node.dataset.primerId === 'p16-third-forward');

    fireEvent.click(first);
    fireEvent.click(reverse, { ctrlKey: true });
    fireEvent.click(replacement, { ctrlKey: true });

    expect(first.getAttribute('data-selected')).toBe('false');
    expect(reverse.getAttribute('data-selected')).toBe('true');
    expect(replacement.getAttribute('data-selected')).toBe('true');
    expect(replacement.getAttribute('data-expanded')).toBe('true');
  });

  it('tail is the same occurrence: clicking it expands the binding and keeps one inspector subject', () => {
    renderViewer();
    const tailOwner = screen.getAllByTestId('sequence-view-primer')
      .find((node) => node.dataset.primerId === 'p16-forward');
    const tail = tailOwner.querySelector('[data-testid="sequence-view-primer-tail"]');
    expect(tail).toBeTruthy();

    fireEvent.click(tail);
    expect(tailOwner.getAttribute('data-expanded')).toBe('true');
    expect(screen.getAllByTestId('primer-inspector')).toHaveLength(1);
  });

  it('keeps the wide inspector slot mounted so disclosure cannot reflow the sequence canvas', () => {
    renderViewer();
    const slot = screen.getByTestId('primer-inspector-slot');
    const root = screen.getByTestId('sequence-view-root');
    const primer = screen.getAllByTestId('sequence-view-primer')[0];

    expect(slot.parentElement).toBe(screen.getByTestId('sequence-view-shell'));
    expect(slot.previousElementSibling).toBe(root);
    expect(within(slot).queryByTestId('primer-inspector')).toBeNull();

    fireEvent.click(primer);
    expect(screen.getByTestId('primer-inspector-slot')).toBe(slot);
    expect(within(slot).getByTestId('primer-inspector')).toBeTruthy();

    fireEvent.click(primer);
    expect(screen.getByTestId('primer-inspector-slot')).toBe(slot);
    expect(within(slot).queryByTestId('primer-inspector')).toBeNull();
  });

  it('Escape only collapses, while an outside pointer clears brackets and the PCR selection', () => {
    renderViewer();
    const [first, second] = screen.getAllByTestId('sequence-view-primer');
    fireEvent.click(first);
    fireEvent.click(second, { metaKey: true });

    fireEvent.keyDown(second, { key: 'Escape' });
    expect(first.getAttribute('data-selected')).toBe('true');
    expect(second.getAttribute('data-selected')).toBe('true');
    expect(second.getAttribute('data-expanded')).toBe('false');

    fireEvent.pointerDown(document.body);
    expect(first.getAttribute('data-selected')).toBe('false');
    expect(second.getAttribute('data-selected')).toBe('false');
    expect(second.getAttribute('data-expanded')).toBe('false');
  });

  it('keeps the PCR selection during pointerdown inside a marked disclosure surface', () => {
    renderViewer();
    const [first, second] = screen.getAllByTestId('sequence-view-primer');
    fireEvent.click(first);
    fireEvent.click(second, { ctrlKey: true });

    const inspector = screen.getByTestId('primer-inspector');
    fireEvent.pointerDown(within(inspector).getByText('P16 second'));

    expect(first.getAttribute('data-selected')).toBe('true');
    expect(second.getAttribute('data-selected')).toBe('true');
  });

  it('owns Escape document-wide while disclosed, even after focus moves outside the viewer', () => {
    const onEscape = vi.fn();
    render(<ViewerWithGlobalEscape onEscape={onEscape} />);
    const primerNode = screen.getAllByTestId('sequence-view-primer')[0];
    const outside = screen.getByTestId('outside-viewer');
    fireEvent.click(primerNode);
    outside.focus();

    const resolverEvent = {
      key: 'Escape', target: outside,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    };
    expect(runHotkeyResolver(resolverEvent)).toBe(false);
    expect(onEscape).not.toHaveBeenCalled();

    fireEvent.keyDown(outside, { key: 'Escape' });
    expect(primerNode.getAttribute('data-expanded')).toBe('false');
    expect(primerNode.getAttribute('data-selected')).toBe('true');
  });

  it('drops disclosure and action ownership synchronously when the document changes', () => {
    const onWritePrimer = vi.fn();
    const onDeletePrimer = vi.fn();
    const view = renderViewer({ onWritePrimer, onDeletePrimer });
    fireEvent.click(screen.getAllByTestId('sequence-view-primer')[0]);
    expect(screen.getByTestId('primer-inspector')).toBeTruthy();

    const nextFragment = {
      ...FRAGMENT,
      id: 'p16-other-fragment',
      name: 'Other template',
      sequence: `${'G'.repeat(30)}${UNIQUE}${'C'.repeat(30)}`,
    };
    const nextPrimer = {
      id: 'p16-other-primer',
      name: 'Other primer',
      direction: 'forward',
      bindingSequence: UNIQUE,
      sequence: UNIQUE,
    };
    view.rerender(
      <SequenceView
        fragments={[nextFragment]}
        primers={[nextPrimer]}
        entryId={nextFragment.id}
        onWritePrimer={onWritePrimer}
        onDeletePrimer={onDeletePrimer}
      />,
    );

    expect(screen.queryByTestId('primer-inspector')).toBeNull();
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(onDeletePrimer).not.toHaveBeenCalled();
    expect(runHotkeyResolver({
      key: 'e', target: root,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    })).toBe(true);
    expect(onWritePrimer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('primer-from-selection-modal')).toBeNull();
  });

  it('keeps additive toggle deterministic under React StrictMode', () => {
    render(
      <StrictMode>
        <SequenceView fragments={[FRAGMENT]} primers={PRIMERS} entryId="p16-fragment" />
      </StrictMode>,
    );
    const first = screen.getAllByTestId('sequence-view-primer')[0];
    fireEvent.click(first);
    fireEvent.click(first, { ctrlKey: true });
    expect(first.getAttribute('data-selected')).toBe('false');
    expect(first.getAttribute('data-expanded')).toBe('false');
    fireEvent.click(first, { ctrlKey: true });
    expect(first.getAttribute('data-selected')).toBe('true');
    expect(first.getAttribute('data-expanded')).toBe('true');
  });

  it('double-click and E open the existing editor for the active member of a PCR pair', () => {
    const onWritePrimer = vi.fn();
    renderViewer({ onWritePrimer });
    const [first, second] = screen.getAllByTestId('sequence-view-primer');

    fireEvent.doubleClick(first);
    expect(screen.getByTestId('primer-from-selection-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('primer-modal-cancel'));

    fireEvent.click(first);
    fireEvent.click(second, { ctrlKey: true });
    const event = {
      key: 'e', target: second,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    };
    act(() => expect(runHotkeyResolver(event)).toBe(true));
    expect(screen.getByTestId('primer-from-selection-modal')).toBeTruthy();
    expect(screen.getByTestId('primer-modal-name').value).toBe('P16 second');
  });
});
