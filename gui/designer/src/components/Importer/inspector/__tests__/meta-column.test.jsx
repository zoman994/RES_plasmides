/**
 * Sprint M-B.2 K3 — MetaColumn topology + IUPAC behaviour.
 *
 * Origin-rotate control moved to SequenceTab in v0.7.x — biolog wanted to
 * pick the start with nucleotide numbers in front of them. Origin tests
 * now live in `sequence-tab.test.jsx`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MetaColumn from '../MetaColumn';

afterEach(cleanup);

const CIRCULAR_ITEM = {
  _fileName: 'pUC19.gb',
  name: 'pUC19',
  sequence: 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC',
  length: 100,
  topology: 'circular',
  annotations: [
    { id: 'r1', type: 'CDS', name: 'AmpR', start: 5, end: 40, level: 'region' },
  ],
  _fromFileCount: 1,
};

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

  it('2) origin control no longer rendered in MetaColumn', () => {
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.queryByTestId('importer-meta-origin-input')).toBeNull();
    expect(screen.queryByTestId('importer-meta-origin-apply')).toBeNull();
  });

  it('3) IUPAC card surfaces only when sequence has IUPAC chars', () => {
    const iupacItem = { ...CIRCULAR_ITEM, sequence: 'ATGNYRWKM' + 'A'.repeat(91), length: 100 };
    render(<MetaColumn item={iupacItem} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.queryByTestId('importer-meta-iupac')).toBeTruthy();
    cleanup();
    render(<MetaColumn item={CIRCULAR_ITEM} edits={{}} onUpdateEdits={() => {}} />);
    expect(screen.queryByTestId('importer-meta-iupac')).toBeNull();
  });
});
