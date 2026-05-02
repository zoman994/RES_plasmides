/**
 * Sprint M-B.1 K4 — MoleculeWorkspace mount + handler smoke tests.
 *
 * Verifies the contract surface from DEC-IMP-12 ⚓: layout-only, no mode-prop,
 * handlers degrade panes when undefined. Cross-pane sync (selectedAnnotation)
 * is exercised in workspace-cross-pane-sync.test.jsx.
 *
 * SequenceMapView is mocked because its layout measurement (ResizeObserver +
 * font-width probe) is noisy in happy-dom and the workspace's contract with
 * RightPane is "render the SequenceMapView with these props", not "verify
 * SequenceMapView pixel layout".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MoleculeWorkspace from '../index';

vi.mock('../../SequenceMapView', () => ({
  default: ({ fragments, circular }) => (
    <div
      data-testid="mock-sequence-map-view"
      data-frag-count={fragments.length}
      data-circular={circular ? 'true' : 'false'}
    >
      {fragments[0]?.sequence?.slice(0, 12) || ''}
    </div>
  ),
}));

const SAMPLE_SEQ = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
const SAMPLE_ANNOTATIONS = [
  { id: 'r1', name: 'AmpR', type: 'CDS', start: 0, end: 30, level: 'region' },
  { id: 'r2', name: 'ori', type: 'rep_origin', start: 32, end: 50, level: 'region' },
];

beforeEach(() => cleanup());

describe('M-B.1 K4 — MoleculeWorkspace contract', () => {
  it('1) full-prop mount renders left + right + minimap + sequence panes', () => {
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="circular"
        originOffset={0}
        onAnnotationChange={() => {}}
        onOriginRotate={() => {}}
        autoAnnotateEnabled
        onAutoAnnotateToggle={() => {}}
        sequenceReadOnly
        name="pUC19"
      />,
    );
    const root = screen.getByTestId('molecule-workspace');
    expect(root.dataset.topology).toBe('circular');
    expect(root.dataset.readonly).toBe('true');
    expect(screen.getByTestId('molecule-workspace-left')).toBeTruthy();
    expect(screen.getByTestId('molecule-workspace-right')).toBeTruthy();
    expect(screen.getByTestId('molecule-workspace-minimap')).toBeTruthy();
    expect(screen.getByTestId('molecule-workspace-annotation-editor')).toBeTruthy();
    expect(screen.getByTestId('mock-sequence-map-view')).toBeTruthy();
    expect(screen.getByTestId('molecule-workspace-readonly-badge')).toBeTruthy();
  });

  it('2) start-point UI hidden when onOriginRotate undefined; auto-annotate hidden when toggle undefined', () => {
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="circular"
      />,
    );
    expect(screen.queryByTestId('molecule-workspace-startpoint')).toBeNull();
    expect(screen.queryByTestId('molecule-workspace-autoannotate')).toBeNull();
  });

  it('3) start-point Apply calls onOriginRotate with parsed value (circular only)', () => {
    const onOriginRotate = vi.fn();
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="circular"
        originOffset={0}
        onOriginRotate={onOriginRotate}
      />,
    );
    const input = screen.getByTestId('molecule-workspace-origin-input');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('molecule-workspace-origin-apply'));
    expect(onOriginRotate).toHaveBeenCalledWith(12);
  });

  it('4) start-point Apply disabled for linear topology; clicking does not fire callback', () => {
    const onOriginRotate = vi.fn();
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="linear"
        onOriginRotate={onOriginRotate}
      />,
    );
    const apply = screen.getByTestId('molecule-workspace-origin-apply');
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onOriginRotate).not.toHaveBeenCalled();
  });

  it('5) auto-annotate checkbox flips and calls onAutoAnnotateToggle with the new value', () => {
    const onAutoAnnotateToggle = vi.fn();
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="circular"
        autoAnnotateEnabled
        onAutoAnnotateToggle={onAutoAnnotateToggle}
      />,
    );
    const cb = screen.getByTestId('molecule-workspace-autoannotate-input');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(onAutoAnnotateToggle).toHaveBeenCalledWith(false);
  });
});
