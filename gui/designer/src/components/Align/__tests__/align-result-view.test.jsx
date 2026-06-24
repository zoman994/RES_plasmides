import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import AlignResultView from '../AlignResultView';

beforeEach(() => useStore.getState().clearAlignment());
afterEach(cleanup);

function makeChromo(bases) {
  const n = bases.length;
  const sampleCount = n * 10;
  const peakLocations = Array.from({ length: n }, (_, i) => i * 10 + 5);
  const channel = () => Array.from({ length: sampleCount }, () => 1);
  return { bases, qualities: Array.from({ length: n }, () => 40), peakLocations, traces: { A: channel(), C: channel(), G: channel(), T: channel() }, sampleCount };
}

describe('AlignResultView — align to reference via SequenceView', () => {
  it('shows metrics + verdict, renders the reference (SequenceView) and the read track', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGT' },
      { name: 'B', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    expect(screen.getByTestId('align-metric-identity').textContent).toMatch(/%/);
    expect(screen.getByTestId('align-metric-coverage').textContent).toMatch(/%/);
    expect(screen.getByText('частичное сходство')).toBeTruthy(); // 7/8 = 87.5%
    // a linear overview minimap rides on top for navigation
    expect(screen.getByTestId('align-minimap')).toBeTruthy();
    // reference rendered by the shared SequenceView (not a bespoke viewer)
    expect(document.querySelector('[data-testid="sequence-view-line"]')).toBeTruthy();
    // the read rides along as a track beneath it
    expect(document.querySelector('[data-testid="alignment-read-track"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="aln-read-mismatch"]').length).toBe(1);
    // clear bio terms (Игорь): «совпадение» + «покрытие», not «идентичность»
    expect(screen.getByText('Совпадение')).toBeTruthy();
    expect(screen.getByText('Покрытие чтения')).toBeTruthy();
    // NO red mismatch boxes on the reference (overload removed)
    expect(document.querySelectorAll('[data-testid="sequence-view-search-mismatch-tick"]').length).toBe(0);
  });

  it('labels reference/read in a header and hides the complementary strand', () => {
    useStore.getState().setAlignInputs([
      { name: 'refSeq', sequence: 'ACGTACGT' },
      { name: 'readSeq', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    const header = screen.getByTestId('align-ref-header');
    expect(header.textContent).toContain('refSeq');
    expect(header.textContent).toContain('readSeq');
    // the align instance hides the bottom (complementary) strand
    expect(document.querySelector('[data-testid="sequence-view-root"]').getAttribute('data-show-bottom-strand')).toBe('false');
  });

  it('shows an AA-effect badge for a mismatch inside a CDS', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ATGAAATAA', annotations: [{ id: 'c1', level: 'region', type: 'CDS', name: 'orf', start: 0, end: 9, strand: 1 }] },
      { name: 'read', sequence: 'ATGCAATAA' }, // AAA→CAA at codon 2 = K→Q missense
    ]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    const badge = document.querySelector('[data-testid="aln-aa-effect"]');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('data-effect')).toBe('missense');
  });

  it('hides feature bars when showAnnotations is off', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ATGAAATAAATGAAATAA', annotations: [{ id: 'c1', level: 'region', type: 'CDS', name: 'orf', start: 0, end: 9, strand: 1 }] },
      { name: 'read', sequence: 'ATGAAATAAATGAAATAA' },
    ]);
    useStore.getState().runAlignment();
    useStore.setState((s) => { s.align.view.showAnnotations = false; });
    render(<AlignResultView />);
    expect(document.querySelector('[data-testid="sequence-view-annotation"]')).toBeNull();
  });

  it('renders the chromatogram track for a trace pair', () => {
    useStore.getState().setAlignInputs([{ name: 'ref', sequence: 'TTTACGTACGTTTT' }]);
    useStore.getState().addTraceInput(makeChromo('ACGTACGT'), { name: 'read.ab1' });
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    expect(document.querySelector('[data-testid="alignment-chromatogram-track"]')).toBeTruthy();
  });

  it('renders a multi-read consensus pile-up for 3+ inputs', () => {
    const S = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: S },
      { name: 'r1', sequence: S },
      { name: 'r2', sequence: S },
    ]);
    const ids = useStore.getState().align.inputs.map((x) => x.id);
    useStore.getState().toggleRead(ids[2]); // 2 reads → multi
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    expect(screen.getByTestId('align-metric-reads').textContent).toBe('2');
    // reads + consensus row → ≥3 read tracks on the (single) line
    expect(document.querySelectorAll('[data-testid="alignment-read-track"]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('[data-testid="aln-read-label"][data-consensus="true"]')).toBeTruthy();
  });

  it('accepting a read base edits the working reference and saves a versioned branch', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        'lib-1': { id: 'lib-1', name: 'pRef', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'ACGTACGT', topology: 'circular', annotations: [] } },
      };
    });
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-1' },
      { name: 'read', sequence: 'ACGAACGT' }, // mismatch at pos 3 (T→A)
    ]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    const mm = document.querySelector('[data-testid="aln-read-mismatch"][data-accept="true"]');
    expect(mm).toBeTruthy();
    fireEvent.click(mm); // accept the read base
    expect(useStore.getState().align.workingReference.corrections.length).toBe(1);
    expect(screen.getByTestId('align-corrections-count').textContent).toContain('1');

    // open the save modal — the change summary reads «было → стало» (Игорь)
    fireEvent.click(screen.getByTestId('align-save-version-open'));
    expect(screen.getAllByTestId('align-save-change')[0].textContent).toContain('T → A');
    // a version-name field is present + pre-filled; the biolog can rename it
    const nameField = screen.getByTestId('align-save-name');
    expect(nameField.value.length).toBeGreaterThan(0);
    fireEvent.change(nameField, { target: { value: 'pRef · испр. 1' } });
    fireEvent.change(screen.getByTestId('align-save-reason'), { target: { value: 'фикс' } });
    fireEvent.click(screen.getByTestId('align-save-confirm'));
    await waitFor(() => {
      const branch = Object.values(useStore.getState().libraryEntries).find((e) => e.origin?.kind === 'manual_edit');
      expect(branch).toBeTruthy();
      expect(branch.origin.reason).toBe('фикс');
      expect(branch.name).toBe('pRef · испр. 1');
    });
    // source untouched
    expect(useStore.getState().libraryEntries['lib-1'].payload.sequence).toBe('ACGTACGT');
  });

  it('labels a short local hit (low read coverage) «локальное совпадение», not «высокое сходство»', () => {
    const core = 'ATGCCGTTAGGCATCCGATTACGGATCCGTT'; // 31 bp shared
    const ref = core;
    const read = `${'GT'.repeat(30)}${core}${'GT'.repeat(30)}`; // core is a small fraction of the read
    useStore.getState().setAlignInputs([{ name: 'ref', sequence: ref }, { name: 'read', sequence: read }]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    expect(screen.getByText(/локальное совпадение/)).toBeTruthy();
    expect(screen.queryByText('высокое сходство')).toBeNull();
  });

  it('Ctrl+Z undoes the last working-copy edit; Ctrl+Y redoes', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-z' },
      { name: 'read', sequence: 'ACGAACGT' }, // mismatch at pos 3 (T→A)
    ]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    const mm = document.querySelector('[data-testid="aln-read-mismatch"][data-accept="true"]');
    fireEvent.click(mm); // accept the read base → an edit on the working copy
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGAACGT');

    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true }); // undo
    expect(useStore.getState().align.workingReference).toBeNull();

    fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true }); // redo
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGAACGT');
  });

  it('flags an all-N read as unreliable, not «высокое сходство» (N-aware verdict + quality warning)', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGTACGTACGT' },
      { name: 'read', sequence: 'NNNNNNNNNNNNNNNN' },
    ]);
    useStore.getState().runAlignment();
    render(<AlignResultView />);
    expect(screen.queryByText('высокое сходство')).toBeNull();
    expect(screen.getByText(/много N/)).toBeTruthy();
    expect(screen.getByTestId('align-quality-warnings')).toBeTruthy();
  });

  it('shows a placeholder when there is no result', () => {
    render(<AlignResultView />);
    expect(screen.getByTestId('align-no-result')).toBeTruthy();
  });
});
