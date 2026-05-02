/**
 * Sprint M-B.1 K4 — MoleculeWorkspace cross-pane sync.
 *
 * Click an annotation row in LeftPane → AnnotationEditor invokes onSelect →
 * MoleculeWorkspace stores it as `selectedAnnotation` and propagates to:
 *   - LeftPane SelectionFooter (data-has-selection=true + name shown)
 *   - RightPane SelectionBanner (header pill with name + position)
 *
 * Live scroll-to in SequenceMapView is M-D scope (programmatic scroll API
 * isn't there yet); the banner gives biolog the position cue without it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MoleculeWorkspace from '../index';

vi.mock('../../SequenceMapView', () => ({
  default: () => <div data-testid="mock-sequence-map-view" />,
}));

const SAMPLE_SEQ = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
const SAMPLE_ANNOTATIONS = [
  { id: 'r1', name: 'AmpR', type: 'CDS', start: 0, end: 30, level: 'region' },
  { id: 'r2', name: 'ori', type: 'rep_origin', start: 32, end: 50, level: 'region' },
];

beforeEach(() => cleanup());

describe('M-B.1 K4 — MoleculeWorkspace cross-pane sync', () => {
  it('clicking an annotation row sets selectedAnnotation; selection banner shows on the right', () => {
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="circular"
        onAnnotationChange={() => {}}
      />,
    );
    // Initially nothing selected.
    const footer = screen.getByTestId('molecule-workspace-selection-footer');
    expect(footer.dataset.hasSelection).toBe('false');
    expect(screen.queryByTestId('molecule-workspace-selection-banner')).toBeNull();

    // Click the AmpR row in the editor (text content matches name).
    const ampRow = screen.getAllByText('AmpR')[0];
    expect(ampRow).toBeTruthy();
    fireEvent.click(ampRow);

    // Footer now shows selection; banner appears on the right.
    expect(footer.dataset.hasSelection).toBe('true');
    expect(footer.textContent).toContain('AmpR');
    const banner = screen.getByTestId('molecule-workspace-selection-banner');
    expect(banner.textContent).toContain('AmpR');
    // start=0 → display "1..30"
    expect(banner.textContent).toContain('1..30');
  });

  it('clicking the same annotation again deselects (toggle behaviour)', () => {
    render(
      <MoleculeWorkspace
        sequence={SAMPLE_SEQ}
        annotations={SAMPLE_ANNOTATIONS}
        topology="circular"
        onAnnotationChange={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByText('AmpR')[0]);
    expect(screen.getByTestId('molecule-workspace-selection-footer').dataset.hasSelection).toBe('true');
    fireEvent.click(screen.getAllByText('AmpR')[0]);
    expect(screen.getByTestId('molecule-workspace-selection-footer').dataset.hasSelection).toBe('false');
    expect(screen.queryByTestId('molecule-workspace-selection-banner')).toBeNull();
  });
});
