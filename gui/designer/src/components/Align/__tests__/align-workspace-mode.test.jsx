import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../store';
import AlignWorkspace from '../AlignWorkspace';

beforeEach(() => {
  useStore.getState().clearAlignment();
  useStore.setState((s) => { s.libraryEntries = {}; s.filterKind = 'container'; s.filterTopology = 'all'; });
});
afterEach(cleanup);

describe('AlignWorkspace mode selector', () => {
  it('defaults the mode select to «Локальное»', () => {
    render(<AlignWorkspace />);
    expect(screen.getByTestId('align-mode-select').value).toBe('local');
  });

  it('has no «Выровнять» button and auto-aligns on mount when ref + read are present', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGTACGT' },
      { name: 'B', sequence: 'ACGTACGTACGT' },
    ]);
    render(<AlignWorkspace />); // no manual runAlignment, no button click
    expect(screen.queryByTestId('align-run-btn')).toBeNull(); // button removed
    expect(useStore.getState().align.result).toBeTruthy(); // auto-ran via effect
    expect(screen.getByTestId('align-metric-identity')).toBeTruthy();
  });

  it('auto-re-aligns when a read checkbox is toggled (no button)', () => {
    const S = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGG';
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: S },
      { name: 'r1', sequence: S },
      { name: 'r2', sequence: S },
    ]);
    render(<AlignWorkspace />);
    expect(useStore.getState().align.result).toBeTruthy(); // ref + seeded read → pairwise
    const ids = useStore.getState().align.inputs.map((x) => x.id);
    fireEvent.click(screen.getByTestId(`align-read-check-${ids[2]}`)); // add r2 → 2 reads
    expect(useStore.getState().align.multi).toBeTruthy(); // auto re-aligned to multi
    expect(useStore.getState().align.multi.stats.reads).toBe(2);
  });

  it('does NOT re-align when an unrelated input is added (not the reference, not a read)', () => {
    const S = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGG';
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: S },
      { name: 'r1', sequence: S },
    ]);
    render(<AlignWorkspace />);
    const before = useStore.getState().align.result;
    expect(before).toBeTruthy();
    // Add a 3rd input that is neither the reference nor a selected read. The
    // alignment work is unchanged → the effect must NOT re-run runAlignment
    // (a fresh run would produce a new result object).
    act(() => { useStore.getState().addAlignInput({ name: 'extra', sequence: 'TTTTGGGGCCCCAAAATTTT' }); });
    expect(useStore.getState().align.result).toBe(before); // same object → no spurious re-align
  });

  it('changing the mode updates settings and re-runs when a result exists', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGTACGT' },
      { name: 'B', sequence: 'ACGTACGTACGT' },
    ]);
    useStore.getState().runAlignment();
    render(<AlignWorkspace />);
    fireEvent.change(screen.getByTestId('align-mode-select'), { target: { value: 'global' } });
    expect(useStore.getState().align.settings.mode).toBe('global');
    expect(useStore.getState().align.result.mode).toBe('global');
  });

  it('layer toggles (Фичи / AA-трек) update the view; primer toggle is a disabled stub', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGTACGT' },
      { name: 'B', sequence: 'ACGTACGTACGT' },
    ]);
    useStore.getState().runAlignment();
    render(<AlignWorkspace />);
    expect(screen.getByTestId('align-toggle-annotations').checked).toBe(true);
    fireEvent.click(screen.getByTestId('align-toggle-annotations'));
    expect(useStore.getState().align.view.showAnnotations).toBe(false);
    fireEvent.click(screen.getByTestId('align-toggle-aa'));
    expect(useStore.getState().align.view.showAATrack).toBe(false);
    expect(screen.getByTestId('align-toggle-primers').disabled).toBe(true); // pool — в разработке
  });

  it('toggles nucleotide colouring of the read once a result exists', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGTACGT' },
      { name: 'B', sequence: 'ACGTACGTACGT' },
    ]);
    useStore.getState().runAlignment();
    render(<AlignWorkspace />);
    const toggle = screen.getByTestId('align-color-toggle');
    expect(useStore.getState().align.view.colorNucleotides).toBe(false);
    fireEvent.click(toggle);
    expect(useStore.getState().align.view.colorNucleotides).toBe(true);
  });
});
