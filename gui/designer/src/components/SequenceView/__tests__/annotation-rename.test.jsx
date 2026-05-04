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

describe('Bug-rush #3 — bar dblclick opens Annotator, label dblclick renames', () => {
  it('double-clicking the feature rect (bar) calls onOpenAnnotator with region scope', () => {
    const onOpenAnnotator = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        onAnnotationEdit={vi.fn()}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    // The rect lives inside the annotation <g> as a direct child.
    const region = screen.getAllByTestId('sequence-view-annotation')[0];
    const rect = region.querySelector('rect');
    fireEvent.doubleClick(rect);
    expect(onOpenAnnotator).toHaveBeenCalledWith({
      kind: 'region',
      region: { start: 0, end: 99 },
    });
  });

  it('double-clicking the LABEL renames (does NOT open Annotator)', () => {
    const onOpenAnnotator = vi.fn();
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        onAnnotationEdit={onAnnotationEdit}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    const label = screen.getAllByTestId('sequence-view-annotation-label')[0];
    fireEvent.doubleClick(label);
    expect(onOpenAnnotator).not.toHaveBeenCalled();
    expect(screen.getByTestId('sequence-view-inline-rename')).toBeTruthy();
  });
});

describe('Bug-rush #7 — rename works on EVERY line of a multi-line feature', () => {
  // Long enough to span >1 SequenceView line at any reasonable
  // chars-per-line. The annotation covers the entire fragment so
  // `data-testid="sequence-view-annotation"` is rendered once per
  // line (with the same data-region-id, distinct
  // data-region-line-start).
  const LONG_FRAGMENT = {
    id: 'frag-long',
    name: 'demo',
    type: 'CDS',
    sequence: 'ATGGCC'.repeat(120), // 720 nt → ≥3 lines at 80 cpl
    strand: 1,
    annotations: [
      { id: 'region:0:720:CDS:longCDS', name: 'longCDS', type: 'CDS', start: 0, end: 720, level: 'region', strand: 1 },
    ],
  };

  it('dblclick on the SECOND line label still mounts the rename input', () => {
    render(
      <SequenceView fragments={[LONG_FRAGMENT]} onAnnotationEdit={vi.fn()} />
    );
    const labels = screen.getAllByTestId('sequence-view-annotation-label');
    // Need at least two repeated labels to exercise the bug.
    expect(labels.length).toBeGreaterThanOrEqual(2);
    fireEvent.doubleClick(labels[1]);
    const input = screen.getByTestId('sequence-view-inline-rename');
    expect(input).toBeTruthy();
    expect(input.value).toBe('longCDS');
  });
});

describe('K5 inline rename', () => {
  it('mounts the rename input on double-click', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    // Bug-rush #3 (04.05.2026): rename now fires from the LABEL,
    // not the bar — bar dblclick opens Annotator instead.
    const label = screen.getAllByTestId('sequence-view-annotation-label')[0];
    fireEvent.doubleClick(label);
    const input = screen.getByTestId('sequence-view-inline-rename');
    expect(input).toBeTruthy();
    expect(input.value).toBe('lacZ');
  });

  it('Enter saves and dispatches update', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    // Bug-rush #3 (04.05.2026): rename now fires from the LABEL,
    // not the bar — bar dblclick opens Annotator instead.
    const label = screen.getAllByTestId('sequence-view-annotation-label')[0];
    fireEvent.doubleClick(label);
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
    // Bug-rush #3 (04.05.2026): rename now fires from the LABEL,
    // not the bar — bar dblclick opens Annotator instead.
    const label = screen.getAllByTestId('sequence-view-annotation-label')[0];
    fireEvent.doubleClick(label);
    const input = screen.getByTestId('sequence-view-inline-rename');
    fireEvent.change(input, { target: { value: 'lacZ-renamed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sequence-view-inline-rename')).toBeNull();
  });

  it('blur (outside-click) saves', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    // Bug-rush #3 (04.05.2026): rename now fires from the LABEL,
    // not the bar — bar dblclick opens Annotator instead.
    const label = screen.getAllByTestId('sequence-view-annotation-label')[0];
    fireEvent.doubleClick(label);
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
    // Bug-rush #3 (04.05.2026): rename now fires from the LABEL,
    // not the bar — bar dblclick opens Annotator instead.
    const label = screen.getAllByTestId('sequence-view-annotation-label')[0];
    fireEvent.doubleClick(label);
    const input = screen.getByTestId('sequence-view-inline-rename');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });
});
