/**
 * Sprint M-B.2 K3 — MetaColumn topology + origin + IUPAC behaviour.
 *
 * Origin-rotate control history: was here originally → moved to SequenceTab
 * v0.7.x → moved BACK 04.05.2026 evening (биолог: «эту панель на право,
 * под топологию»). Sequence-tab now stays viewer-only — picking a start
 * point is a metadata edit and sits next to topology in the right rail.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MetaColumn from '../MetaColumn';

afterEach(cleanup);

const SEQUENCE = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
const CIRCULAR_ITEM = {
  _fileName: 'pUC19.gb',
  name: 'pUC19',
  sequence: SEQUENCE,
  length: SEQUENCE.length,
  topology: 'circular',
  annotations: [
    { id: 'r1', type: 'CDS', name: 'AmpR', start: 5, end: 40, level: 'region' },
  ],
  _fromFileCount: 1,
};
const LINEAR_ITEM = { ...CIRCULAR_ITEM, _fileName: 'frag.fasta', topology: 'linear' };

describe('M-B.2 K3 — MetaColumn', () => {
  it('1) topology toggle calls onUpdateEdits with editedTopology', () => {
    const onUpdateEdits = vi.fn();
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={onUpdateEdits} />);
    // Click linear → editedTopology='linear'.
    fireEvent.click(screen.getByTestId('importer-meta-topology-linear'));
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedTopology: 'linear' });
    // Click circular (same as parsed) → editedTopology cleared.
    onUpdateEdits.mockClear();
    fireEvent.click(screen.getByTestId('importer-meta-topology-circular'));
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedTopology: undefined });
  });

  it('2) origin control rendered for circular topology', () => {
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.getByTestId('importer-meta-origin-input')).toBeTruthy();
    expect(screen.getByTestId('importer-meta-origin-apply')).toBeTruthy();
  });

  it('3) origin control hidden for linear topology', () => {
    render(<MetaColumn item={LINEAR_ITEM} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.queryByTestId('importer-meta-origin')).toBeNull();
    expect(screen.queryByTestId('importer-meta-origin-input')).toBeNull();
  });

  it('4) apply rotates sequence + annotations and resets input back to 1', async () => {
    const onUpdateEdits = vi.fn();
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={onUpdateEdits} />);
    const input = screen.getByTestId('importer-meta-origin-input');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('importer-meta-origin-apply'));
    expect(onUpdateEdits).toHaveBeenCalledTimes(1);
    const patch = onUpdateEdits.mock.calls[0][0];
    expect(typeof patch.editedSequence).toBe('string');
    expect(patch.editedSequence.length).toBe(SEQUENCE.length);
    expect(Array.isArray(patch.editedAnnotations)).toBe(true);
    await waitFor(() => expect(screen.getByTestId('importer-meta-origin-input').value).toBe('1'));
  });

  it('5) apply disabled while offset === 1 (no-op)', () => {
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.getByTestId('importer-meta-origin-apply').disabled).toBe(true);
  });

  it('6) IUPAC card surfaces only when sequence has IUPAC chars', () => {
    const iupacItem = { ...CIRCULAR_ITEM, sequence: 'ATGNYRWKM' + 'A'.repeat(91), length: 100 };
    render(<MetaColumn item={iupacItem} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.queryByTestId('importer-meta-iupac')).toBeTruthy();
    cleanup();
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.queryByTestId('importer-meta-iupac')).toBeNull();
  });
});
