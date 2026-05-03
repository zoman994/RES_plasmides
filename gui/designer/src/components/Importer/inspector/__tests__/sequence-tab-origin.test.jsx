/**
 * SequenceTab — origin-rotate control (moved from MetaColumn in v0.7.x).
 * Origin set on Sequence tab where biolog can see nucleotide numbers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SequenceTab from '../tabs/SequenceTab';

// Sprint M-B.3 K8 — SequenceTab now mounts the new SequenceView. Mock it
// to keep the origin-rotate test focused on the input + apply button
// behaviour, not the full sequence rendering pipeline.
vi.mock('../../../SequenceView', () => ({
  default: () => <div data-testid="mock-sequence-view" />,
}));
vi.mock('../../../SequenceView/SettingsPopover', () => ({
  default: () => null,
  SEQUENCE_VIEW_DEFAULTS: {},
}));

afterEach(cleanup);

const SEQUENCE = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
const ANNOTATIONS = [
  { id: 'r1', type: 'CDS', name: 'AmpR', start: 5, end: 40, level: 'region' },
];

describe('SequenceTab — origin-rotate', () => {
  it('1) circular topology renders the origin input + apply button', () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={ANNOTATIONS}
        topology="circular"
        name="pUC19"
        fileKey="pUC19.gb"
        onUpdateEdits={() => {}}
      />,
    );
    expect(screen.getByTestId('importer-sequence-origin-input')).toBeTruthy();
    expect(screen.getByTestId('importer-sequence-origin-apply')).toBeTruthy();
  });

  it('2) linear topology hides the origin control entirely', () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={ANNOTATIONS}
        topology="linear"
        name="frag"
        fileKey="frag.fasta"
        onUpdateEdits={() => {}}
      />,
    );
    expect(screen.queryByTestId('importer-sequence-origin')).toBeNull();
    expect(screen.queryByTestId('importer-sequence-origin-input')).toBeNull();
  });

  it('3) apply rotates sequence + annotations, then resets input to 1', async () => {
    const onUpdateEdits = vi.fn();
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={ANNOTATIONS}
        topology="circular"
        name="pUC19"
        fileKey="pUC19.gb"
        onUpdateEdits={onUpdateEdits}
      />,
    );
    const input = screen.getByTestId('importer-sequence-origin-input');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('importer-sequence-origin-apply'));
    expect(onUpdateEdits).toHaveBeenCalledTimes(1);
    const patch = onUpdateEdits.mock.calls[0][0];
    expect(typeof patch.editedSequence).toBe('string');
    expect(patch.editedSequence.length).toBe(SEQUENCE.length);
    expect(Array.isArray(patch.editedAnnotations)).toBe(true);
    await waitFor(() => expect(screen.getByTestId('importer-sequence-origin-input').value).toBe('1'));
  });

  it('4) apply disabled while offset === 1 (no-op)', () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={ANNOTATIONS}
        topology="circular"
        name="pUC19"
        fileKey="pUC19.gb"
        onUpdateEdits={() => {}}
      />,
    );
    expect(screen.getByTestId('importer-sequence-origin-apply').disabled).toBe(true);
  });
});
