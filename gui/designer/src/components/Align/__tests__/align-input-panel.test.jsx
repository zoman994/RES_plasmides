import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import AlignInputPanel from '../AlignInputPanel';

vi.mock('../../../lib/alignment/abif-parse', () => ({
  parseAbif: () => ({
    bases: 'ACGTACGT', qualities: [40, 40, 40, 40, 40, 40, 40, 40],
    peakLocations: [5, 15, 25, 35, 45, 55, 65, 75],
    traces: { A: [1], C: [1], G: [1], T: [1] }, sampleCount: 80,
  }),
}));

beforeEach(() => {
  useStore.getState().clearAlignment();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.filterKind = 'container';
    s.filterTopology = 'all';
  });
});
afterEach(cleanup);

describe('AlignInputPanel', () => {
  it('adds N inputs from pasted multi-FASTA', () => {
    render(<AlignInputPanel />);
    fireEvent.change(screen.getByTestId('align-paste-input'), {
      target: { value: '>a\nACGTACGT\n>b\nACGTTCGT' },
    });
    fireEvent.click(screen.getByTestId('align-paste-add'));
    expect(useStore.getState().align.inputs).toHaveLength(2);
    expect(useStore.getState().align.inputs[0].name).toBe('a');
  });

  it('adds a trace input from a dropped .ab1 file', async () => {
    render(<AlignInputPanel />);
    const file = { name: 'read.ab1', arrayBuffer: () => Promise.resolve(new ArrayBuffer(40)) };
    fireEvent.drop(screen.getByTestId('align-dropzone'), { dataTransfer: { files: [file] } });
    await waitFor(() => {
      const inputs = useStore.getState().align.inputs;
      expect(inputs).toHaveLength(1);
      expect(inputs[0].kind).toBe('trace');
      expect(inputs[0].chromatogram.sampleCount).toBe(80);
    });
  });

  it('adds an input from a library entry via the canonical sequence-picker', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', name: 'pUC19', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'ACGTACGT', topology: 'circular' } },
      };
    });
    render(<AlignInputPanel />);
    expect(screen.queryByTestId('align-tab-library')).toBeNull(); // tabs removed
    // reuses LibrarySearchBar (same picker as assembly/canvas) — entry sits in
    // the «Коллекция» (loose) section.
    fireEvent.click(await screen.findByTestId('align-lib-picker-section-loose-item-e1'));
    const inputs = useStore.getState().align.inputs;
    expect(inputs).toHaveLength(1);
    expect(inputs[0].sequence).toBe('ACGTACGT');
    expect(inputs[0].libraryEntryId).toBe('e1');
  });

  it('searches the library by name AND by DNA-subsequence (canonical picker)', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', name: 'pUC19', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'AAAAGGGGCCCC', topology: 'circular' } },
        e2: { id: 'e2', name: 'pBluescript', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'TTTTTTTT', topology: 'circular' } },
      };
    });
    render(<AlignInputPanel />);
    // by name (picker's own search input — lazy-loaded, so await it first)
    fireEvent.change(await screen.findByTestId('align-lib-picker-input'), { target: { value: 'blue' } });
    expect(screen.queryByTestId('align-lib-picker-section-loose-item-e1')).toBeNull();
    expect(screen.getByTestId('align-lib-picker-section-loose-item-e2')).toBeTruthy();
    // by DNA subsequence — finds e1 by its sequence, not its name
    fireEvent.change(screen.getByTestId('align-lib-picker-input'), { target: { value: 'GGGGCCCC' } });
    expect(screen.getByTestId('align-lib-picker-section-loose-item-e1')).toBeTruthy();
    expect(screen.queryByTestId('align-lib-picker-section-loose-item-e2')).toBeNull();
  });

  it('«Найти похожие» is disabled without a reference and finds homologs once one is set', () => {
    const REF = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', name: 'pMatch', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: REF, topology: 'circular' } },
        e2: { id: 'e2', name: 'pNoMatch', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'TTTTAAAACCCCGGGGTTTTAAAACCCCGGGG', topology: 'circular' } },
      };
    });
    const { rerender } = render(<AlignInputPanel />);
    // no reference yet → disabled
    expect(screen.getByTestId('align-find-homologs').disabled).toBe(true);

    // set a reference (single input) → enabled
    useStore.getState().setAlignInputs([{ name: 'ref', sequence: REF }]);
    rerender(<AlignInputPanel />);
    const btn = screen.getByTestId('align-find-homologs');
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);
    expect(screen.getByTestId('align-homologs')).toBeTruthy();
    expect(screen.getByTestId('align-homolog-e1')).toBeTruthy(); // homologous
    expect(screen.queryByTestId('align-homolog-e2')).toBeNull(); // unrelated → not suggested

    // clicking a homolog adds it as a second input
    fireEvent.click(screen.getByTestId('align-homolog-e1'));
    const inputs = useStore.getState().align.inputs;
    expect(inputs.length).toBe(2);
    expect(inputs[1].libraryEntryId).toBe('e1');
  });

  it('does not add the same library entry twice — slice dedups on re-pick', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', name: 'pUC19', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'ACGTACGT', topology: 'circular' } },
      };
    });
    render(<AlignInputPanel />);
    fireEvent.click(await screen.findByTestId('align-lib-picker-section-loose-item-e1'));
    expect(useStore.getState().align.inputs).toHaveLength(1);
    // pick the same entry again — the slice dedups (same libraryEntryId)
    fireEvent.click(screen.getByTestId('align-lib-picker-section-loose-item-e1'));
    expect(useStore.getState().align.inputs).toHaveLength(1);
  });

  it('shows a hint while fewer than two inputs are present', () => {
    render(<AlignInputPanel />);
    expect(screen.getByTestId('align-need-more')).toBeTruthy();
  });

  it('picks the reference (radio) and reads (checkbox) explicitly — no А/Б roles', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGT' },
      { name: 'B', sequence: 'TTTTACGT' },
      { name: 'C', sequence: 'GGGGACGT' },
    ]);
    render(<AlignInputPanel />);
    const ids = useStore.getState().align.inputs.map((x) => x.id);
    // А/Б buttons are gone
    expect(screen.queryByTestId(`align-role-a-${ids[0]}`)).toBeNull();
    // make B the reference
    fireEvent.click(screen.getByTestId(`align-ref-radio-${ids[1]}`));
    expect(useStore.getState().align.refId).toBe(ids[1]);
    // the reference row has no «выровнять» checkbox
    expect(screen.queryByTestId(`align-read-check-${ids[1]}`)).toBeNull();
    // add C as a read
    fireEvent.click(screen.getByTestId(`align-read-check-${ids[2]}`));
    expect(useStore.getState().align.readIds).toContain(ids[2]);
    expect(screen.queryByTestId('align-need-more')).toBeNull();
  });

  it('floats the chosen reference to the top of the list', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGT' },
      { name: 'B', sequence: 'TTTTACGT' },
      { name: 'C', sequence: 'GGGGACGT' },
    ]);
    render(<AlignInputPanel />);
    const ids = useStore.getState().align.inputs.map((x) => x.id);
    fireEvent.click(screen.getByTestId(`align-ref-radio-${ids[2]}`)); // make C the reference
    const rows = [...document.querySelectorAll('[data-testid^="align-input-"]')]
      .filter((e) => !e.getAttribute('data-testid').includes('remove'))
      .map((e) => e.getAttribute('data-testid'));
    expect(rows[0]).toBe(`align-input-${ids[2]}`); // reference is first
  });

  it('imports multiple files (each file → its own input)', async () => {
    render(<AlignInputPanel />);
    const f1 = { name: 'a.fasta', text: () => Promise.resolve('>a\nACGTACGT') };
    const f2 = { name: 'b.fasta', text: () => Promise.resolve('>b\nTTTTACGT') };
    fireEvent.drop(screen.getByTestId('align-dropzone'), { dataTransfer: { files: [f1, f2] } });
    await waitFor(() => {
      const names = useStore.getState().align.inputs.map((x) => x.name);
      expect(names).toContain('a');
      expect(names).toContain('b');
    });
  });
});
