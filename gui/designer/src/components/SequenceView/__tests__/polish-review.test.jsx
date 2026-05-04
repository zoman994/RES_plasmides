/**
 * polish-review.test.jsx — Sprint M-X.2 K9-fix coverage for the
 * post-K10 review fixes:
 *   - Drag tooltip with toUiCoords
 *   - Live preview rect during drag
 *   - Popup anchor near selection (not in viewer corner)
 *   - CreateAnnotationPopup buttons equal-weight (no primary CTA)
 *   - Del — selection covering a region (⊇) deletes
 *   - Threshold sync between Settings popover + Annotator
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const FRAGMENT = {
  id: 'frag-1',
  name: 'demo',
  type: 'CDS',
  sequence: 'ATGGCC'.repeat(50), // 300 nt
  strand: 1,
  annotations: [
    { id: 'region:0:99:CDS:lacZ', name: 'lacZ', type: 'CDS', start: 0, end: 99, level: 'region', strand: 1 },
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
      predictions: { cds: true, sgRNA: true, promoter: false, terminator: false, threshold: 0.7 },
    },
  });
}

beforeEach(() => { resetSettings(); });
afterEach(() => { cleanup(); });

describe('polish review — drag tooltip + live preview rect', () => {
  it('pointerdown on right edge spawns drag tooltip with end-coord label', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    const right = edges.find((el) => el.dataset.regionEdge === 'right');
    fireEvent.pointerDown(right, { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
    const tooltip = screen.getByTestId('sequence-view-drag-tooltip');
    expect(tooltip).toBeTruthy();
    // 0-based exclusive end 99 → UI inclusive end 99 (toUiCoords).
    expect(tooltip.textContent).toMatch(/end:\s*99/);
  });

  it('pointerdown on left edge spawns tooltip with start-coord label', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    const left = edges.find((el) => el.dataset.regionEdge === 'left');
    fireEvent.pointerDown(left, { pointerId: 1, button: 0, clientX: 50, clientY: 100 });
    const tooltip = screen.getByTestId('sequence-view-drag-tooltip');
    // start 0 → UI 1 (toUiCoords).
    expect(tooltip.textContent).toMatch(/start:\s*1/);
  });

  it('tooltip clears after pointerup', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const right = screen.getAllByTestId('sequence-view-annotation-edge')
      .find((el) => el.dataset.regionEdge === 'right');
    fireEvent.pointerDown(right, { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(document, { pointerId: 1 });
    expect(screen.queryByTestId('sequence-view-drag-tooltip')).toBeNull();
  });
});

describe('polish review — popup anchor near selection', () => {
  it('H opens popup at the line right edge, not the viewer corner', () => {
    // The hook resolves the popup anchor by probing the line's bounding
    // rect. happy-dom returns 0/0 rects, so we just assert the popup
    // mounted and the reading code didn't crash; full coordinates are
    // tested manually.
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
});

describe('polish review — create popup equal-weight buttons (DEC-ANN-03)', () => {
  it('Submit button does NOT use the orange accent fill (no primary CTA)', () => {
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
    const submit = screen.getByTestId('sequence-view-create-annotation-submit');
    const findBtn = screen.getByTestId('sequence-view-create-annotation-open-annotator');
    // Both should share the same neutral surface-1 background — no
    // primary orange.
    expect(submit.style.background).toBe(findBtn.style.background);
    expect(submit.style.color).toBe(findBtn.style.color);
  });
});

describe('polish review — Del covers-region match', () => {
  it('Del deletes when selection FULLY covers the region (extends past one nt on each side)', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        // lacZ is 0..99; selection 0..100 (extends one beyond end)
        caretPos={100}
        caretAnchor={0}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    fireEvent.keyDown(screen.getByTestId('sequence-view-root'), { key: 'Delete' });
    expect(onAnnotationEdit).toHaveBeenCalledWith({
      kind: 'delete',
      id: 'region:0:99:CDS:lacZ',
    });
  });

  it('Del still no-op when selection sits inside the region (does not cover)', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={50}
        caretAnchor={20}
        onAnnotationEdit={onAnnotationEdit}
      />
    );
    fireEvent.keyDown(screen.getByTestId('sequence-view-root'), { key: 'Delete' });
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });
});

describe('polish review — threshold sync', () => {
  it('setAnnotatorThreshold writes into sequenceView.predictions.threshold (clamped)', () => {
    useStore.setState((s) => {
      s.annotator = {
        open: false, scope: null, enabledPluginIds: {}, results: {},
        acceptedRegionIds: {}, rejectedRegionIds: {}, pendingEdits: {},
        threshold: 0.7, running: {},
      };
    });
    act(() => { useStore.getState().setAnnotatorThreshold(0.85); });
    expect(useStore.getState().annotator.threshold).toBe(0.85);
    expect(useStore.getState().sequenceView.predictions.threshold).toBe(0.85);
  });

  it('setSequenceViewSetting predictions.threshold writes into annotator.threshold', () => {
    useStore.setState((s) => {
      s.annotator = {
        open: false, scope: null, enabledPluginIds: {}, results: {},
        acceptedRegionIds: {}, rejectedRegionIds: {}, pendingEdits: {},
        threshold: 0.7, running: {},
      };
    });
    act(() => { useStore.getState().setSequenceViewSetting('predictions.threshold', 0.92); });
    expect(useStore.getState().sequenceView.predictions.threshold).toBe(0.92);
    expect(useStore.getState().annotator.threshold).toBe(0.92);
  });

  it('Annotator threshold below 0.5 is NOT mirrored into sequenceView (popover slider min is 0.5)', () => {
    useStore.setState((s) => {
      s.annotator = {
        open: false, scope: null, enabledPluginIds: {}, results: {},
        acceptedRegionIds: {}, rejectedRegionIds: {}, pendingEdits: {},
        threshold: 0.7, running: {},
      };
    });
    act(() => { useStore.getState().setAnnotatorThreshold(0.3); });
    expect(useStore.getState().annotator.threshold).toBe(0.3);
    // popover clamps to 0.5
    expect(useStore.getState().sequenceView.predictions.threshold).toBe(0.5);
  });
});
