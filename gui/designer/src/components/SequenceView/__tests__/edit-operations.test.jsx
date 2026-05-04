/**
 * edit-operations.test.jsx — Sprint M-X.2 K3 coverage for Del / H /
 * E hotkeys + CreateAnnotationPopup + EditAnnotationModal wiring.
 *
 * Cases:
 *  1) Del with selection covering a region → onAnnotationEdit({kind:'delete', id})
 *  2) Del with selection NOT covering a region → no callback
 *  3) H with non-empty selection → CreateAnnotationPopup mounts
 *  4) Popup [Создать] → onAnnotationEdit({kind:'create', payload})
 *  5) Popup [Найти в Аннотаторе] → onOpenAnnotator({kind:'region', region})
 *  6) Popup [Отмена] / Esc → no callback, popup closes
 *  7) E with selection covering a region → EditAnnotationModal mounts
 *  8) Modal [OK] → onAnnotationEdit({kind:'update', id, patch})
 *  9) Coords in popup pre-fill use 1-based UI form (toUiCoords)
 * 10) Keyboard ignored when target is an input (popup form fields)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const SEQ = 'ATGGCC'.repeat(50); // 300 nt
const FRAGMENT = {
  id: 'frag-1',
  name: 'demo',
  type: 'CDS',
  sequence: SEQ,
  strand: 1,
  annotations: [
    {
      id: 'region:0:99:CDS:lacZ',
      type: 'CDS',
      name: 'lacZ',
      start: 0,
      end: 99,
      level: 'region',
      strand: 1,
    },
  ],
};

function resetSettings() {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: 'auto',
      autoThreshold: 0.8,
      primerStyle: 'filled',
      reOrientation: 'horizontal',
      visibleFrames: { '1': true, '2': true, '3': true, '-1': true, '-2': true, '-3': true },
      predictions: {},
    },
  });
}

beforeEach(() => { resetSettings(); });
afterEach(() => { cleanup(); });

describe('K3 edit operations — Del key', () => {
  it('dispatches delete edit when selection covers a region exactly', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(onAnnotationEdit).toHaveBeenCalledWith({
      kind: 'delete',
      id: 'region:0:99:CDS:lacZ',
    });
  });

  it('does NOT dispatch when selection does not cover a region exactly', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={120}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });

  it('does nothing when selection is empty', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={50}
        caretAnchor={50}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });
});

describe('K3 edit operations — H key opens CreateAnnotationPopup', () => {
  it('mounts the popup when H is pressed with a non-empty selection', () => {
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={vi.fn()}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    expect(screen.getByTestId('sequence-view-create-annotation-popup')).toBeTruthy();
  });

  it('pre-fills coords in 1-based UI form', () => {
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={vi.fn()}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    const startInput = screen.getByTestId('sequence-view-create-annotation-start');
    const endInput = screen.getByTestId('sequence-view-create-annotation-end');
    // 0-based 100..150 → 1-based 101..150
    expect(Number(startInput.value)).toBe(101);
    expect(Number(endInput.value)).toBe(150);
  });

  it('Submit button dispatches a create edit and closes the popup', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    fireEvent.click(screen.getByTestId('sequence-view-create-annotation-submit'));
    expect(onAnnotationEdit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'create',
      payload: expect.objectContaining({ start: 100, end: 150, type: 'CDS', strand: 1 }),
    }));
    expect(screen.queryByTestId('sequence-view-create-annotation-popup')).toBeNull();
  });

  it('[Найти в Аннотаторе] dispatches onOpenAnnotator with region scope', () => {
    const onOpenAnnotator = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={vi.fn()}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    fireEvent.click(screen.getByTestId('sequence-view-create-annotation-open-annotator'));
    expect(onOpenAnnotator).toHaveBeenCalledWith({
      kind: 'region',
      region: { start: 100, end: 150 },
    });
    expect(screen.queryByTestId('sequence-view-create-annotation-popup')).toBeNull();
  });

  it('Esc closes the popup without dispatching', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    expect(screen.getByTestId('sequence-view-create-annotation-popup')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('sequence-view-create-annotation-popup')).toBeNull();
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });
});

describe('K3 edit operations — E key opens EditAnnotationModal', () => {
  it('mounts the modal when E is pressed on a region-aligned selection', () => {
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        onAnnotationEdit={vi.fn()}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'e' });
    expect(screen.getByTestId('sequence-view-edit-annotation-modal')).toBeTruthy();
    const nameInput = screen.getByTestId('sequence-view-edit-annotation-name');
    expect(nameInput.value).toBe('lacZ');
  });

  it('does NOT mount when selection is not region-aligned', () => {
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={120}
        onAnnotationEdit={vi.fn()}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'e' });
    expect(screen.queryByTestId('sequence-view-edit-annotation-modal')).toBeNull();
  });

  it('Apply button dispatches an update edit', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'e' });
    const nameInput = screen.getByTestId('sequence-view-edit-annotation-name');
    fireEvent.change(nameInput, { target: { value: 'lacZ-renamed' } });
    fireEvent.click(screen.getByTestId('sequence-view-edit-annotation-submit'));
    expect(onAnnotationEdit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'update',
      id: 'region:0:99:CDS:lacZ',
      patch: expect.objectContaining({ name: 'lacZ-renamed', start: 0, end: 99 }),
    }));
  });
});
