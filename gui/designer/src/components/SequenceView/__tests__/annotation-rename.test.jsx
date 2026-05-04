/**
 * annotation-rename.test.jsx — Sprint M-X.2 K5 coverage.
 *
 * Cases:
 *  1) Double-click on a region rect mounts InlineRenameInput.
 *  2) Enter saves and dispatches an `update` edit.
 *  3) Esc cancels — no callback.
 *  4) Outside-click (blur) saves.
 *  5) Empty name → no callback (silent cancel).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const FRAGMENT = {
  id: 'frag-1',
  name: 'demo',
  type: 'CDS',
  sequence: 'ATGGCC'.repeat(50),
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

describe('K5 inline rename', () => {
  it('mounts the rename input on double-click', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const region = screen.getAllByTestId('sequence-view-annotation')[0];
    fireEvent.doubleClick(region);
    const input = screen.getByTestId('sequence-view-inline-rename');
    expect(input).toBeTruthy();
    expect(input.value).toBe('lacZ');
  });

  it('Enter saves and dispatches update', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    const region = screen.getAllByTestId('sequence-view-annotation')[0];
    fireEvent.doubleClick(region);
    const input = screen.getByTestId('sequence-view-inline-rename');
    fireEvent.change(input, { target: { value: 'lacZ-renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnnotationEdit).toHaveBeenCalledWith({
      kind: 'update',
      id: 'region:0:99:CDS:lacZ',
      patch: { name: 'lacZ-renamed' },
    });
  });

  it('Esc cancels — no callback', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    const region = screen.getAllByTestId('sequence-view-annotation')[0];
    fireEvent.doubleClick(region);
    const input = screen.getByTestId('sequence-view-inline-rename');
    fireEvent.change(input, { target: { value: 'lacZ-renamed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sequence-view-inline-rename')).toBeNull();
  });

  it('blur (outside-click) saves', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    const region = screen.getAllByTestId('sequence-view-annotation')[0];
    fireEvent.doubleClick(region);
    const input = screen.getByTestId('sequence-view-inline-rename');
    fireEvent.change(input, { target: { value: 'lacZ-blur-save' } });
    fireEvent.blur(input);
    expect(onAnnotationEdit).toHaveBeenCalledWith({
      kind: 'update',
      id: 'region:0:99:CDS:lacZ',
      patch: { name: 'lacZ-blur-save' },
    });
  });

  it('Empty / whitespace-only name → no callback', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    const region = screen.getAllByTestId('sequence-view-annotation')[0];
    fireEvent.doubleClick(region);
    const input = screen.getByTestId('sequence-view-inline-rename');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });
});
