/**
 * skeleton-op-popup-k8.test.jsx — LigateOpPopup + KLDOpPopup + MutagenesisOpPopup.
 *
 * Sprint M-CANVAS-OPS K8 (12.05.2026 — DEC-OPS-06).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import LigateOpPopup from '../canvas/operations/LigateOpPopup';
import KLDOpPopup from '../canvas/operations/KLDOpPopup';
import MutagenesisOpPopup from '../canvas/operations/MutagenesisOpPopup';
import { createOperationDraft } from '../store/skeleton-state-operations';
import { useStore, bootstrapStore } from '../../../store';

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

function makeOp(kind, params = {}) {
  const op = createOperationDraft({ position: { x: 0, y: 0 }, kind });
  return { ...op, kind, status: 'committed', params };
}

const containers = [
  { id: 'c-circ', name: 'pUC19', kind: 'molecule', sequence: 'ATGCATGC', topology: { circular: true } },
  { id: 'c-lin1', name: 'frag-A', kind: 'molecule', sequence: 'ATCGATCG', topology: { circular: false } },
  { id: 'c-lin2', name: 'frag-B', kind: 'molecule', sequence: 'GCTAGCTA', topology: { circular: false } },
  { id: 'c-lin-sticky', name: 'sticky-frag', kind: 'molecule', sequence: 'AAAA', topology: { circular: false }, ends: { left: { overhang: 'AATT' }, right: null } },
  { id: 'c-oligo-1', name: 'primer-pair', kind: 'oligonucleotide', sequence: 'ATG' },
];

describe('K8 — LigateOpPopup', () => {
  it('fragment list shows only linear molecule containers', () => {
    render(<LigateOpPopup operation={makeOp('ligate')} containers={containers} />);
    expect(screen.getByTestId('ligate-op-fragment-c-lin1')).toBeTruthy();
    expect(screen.getByTestId('ligate-op-fragment-c-lin2')).toBeTruthy();
    expect(screen.queryByTestId('ligate-op-fragment-c-circ')).toBeNull();
  });

  it('Execute disabled when <2 fragments selected', () => {
    render(<LigateOpPopup operation={makeOp('ligate')} containers={containers} />);
    const execute = screen.getByTestId('op-popup-execute');
    expect(execute.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin1'));
    expect(execute.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin2'));
    expect(execute.disabled).toBe(false);
  });

  it('auto-detect ends → sticky when fragment has overhang', () => {
    const onExecute = vi.fn();
    render(<LigateOpPopup operation={makeOp('ligate')} containers={containers} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin-sticky'));
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0].ends).toBe('sticky');
  });

  it('auto-detect ends → blunt when no fragment has overhang', () => {
    const onExecute = vi.fn();
    render(<LigateOpPopup operation={makeOp('ligate')} containers={containers} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin2'));
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0].ends).toBe('blunt');
  });

  it('manual override: sticky / blunt selectable', () => {
    const onExecute = vi.fn();
    render(<LigateOpPopup operation={makeOp('ligate')} containers={containers} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin2'));
    fireEvent.change(screen.getByTestId('ligate-op-ends-mode'), { target: { value: 'sticky' } });
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0].ends).toBe('sticky');
  });

  it('Execute emits {fragmentIds, ends, circular}', () => {
    const onExecute = vi.fn();
    render(<LigateOpPopup operation={makeOp('ligate')} containers={containers} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('ligate-op-fragment-c-lin2'));
    fireEvent.click(screen.getByTestId('ligate-op-circular')); // toggle off
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0]).toEqual({
      fragmentIds: ['c-lin1', 'c-lin2'],
      ends: 'blunt',
      circular: false,
    });
  });
});

describe('K8 — KLDOpPopup', () => {
  it('template select shows only circular molecule containers', () => {
    render(<KLDOpPopup operation={makeOp('kld')} containers={containers} />);
    const select = screen.getByTestId('kld-op-template');
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['', 'c-circ']);
  });

  it('primer pair select shows only oligonucleotide containers', () => {
    render(<KLDOpPopup operation={makeOp('kld')} containers={containers} />);
    const select = screen.getByTestId('kld-op-primer-pair');
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['', 'c-oligo-1']);
  });

  it('Execute disabled until template + primer-pair selected', () => {
    render(<KLDOpPopup operation={makeOp('kld')} containers={containers} />);
    const execute = screen.getByTestId('op-popup-execute');
    expect(execute.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('kld-op-template'), { target: { value: 'c-circ' } });
    expect(execute.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('kld-op-primer-pair'), { target: { value: 'c-oligo-1' } });
    expect(execute.disabled).toBe(false);
  });

  it('DpnI digest defaults to ON; toggle works', () => {
    const onExecute = vi.fn();
    render(<KLDOpPopup operation={makeOp('kld')} containers={containers} onExecute={onExecute} />);
    fireEvent.change(screen.getByTestId('kld-op-template'), { target: { value: 'c-circ' } });
    fireEvent.change(screen.getByTestId('kld-op-primer-pair'), { target: { value: 'c-oligo-1' } });
    expect(screen.getByTestId('kld-op-dpni').checked).toBe(true);
    fireEvent.click(screen.getByTestId('kld-op-dpni'));
    expect(screen.getByTestId('kld-op-dpni').checked).toBe(false);
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0]).toEqual({
      templateId: 'c-circ',
      primerPairId: 'c-oligo-1',
      dpniDigest: false,
    });
  });
});

describe('K8 — MutagenesisOpPopup', () => {
  it('template select shows molecule containers with sequence', () => {
    render(<MutagenesisOpPopup operation={makeOp('mutagenesis')} containers={containers} />);
    const select = screen.getByTestId('mut-op-template');
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['', 'c-circ', 'c-lin1', 'c-lin2', 'c-lin-sticky']);
  });

  it('default 1 mutation row; type=point shows from/to inputs', () => {
    render(<MutagenesisOpPopup operation={makeOp('mutagenesis')} containers={containers} />);
    expect(screen.getByTestId('mut-op-mutation-row-0')).toBeTruthy();
    expect(screen.getByTestId('mut-op-from-0')).toBeTruthy();
    expect(screen.getByTestId('mut-op-to-0')).toBeTruthy();
  });

  it('switch to insertion type shows insert input instead of from/to', () => {
    render(<MutagenesisOpPopup operation={makeOp('mutagenesis')} containers={containers} />);
    fireEvent.change(screen.getByTestId('mut-op-type'), { target: { value: 'insertion' } });
    expect(screen.getByTestId('mut-op-insert-0')).toBeTruthy();
    expect(screen.queryByTestId('mut-op-from-0')).toBeNull();
  });

  it('switch to deletion type shows length input', () => {
    render(<MutagenesisOpPopup operation={makeOp('mutagenesis')} containers={containers} />);
    fireEvent.change(screen.getByTestId('mut-op-type'), { target: { value: 'deletion' } });
    expect(screen.getByTestId('mut-op-deletion-length-0')).toBeTruthy();
  });

  it('add mutation row → remove enabled', () => {
    render(<MutagenesisOpPopup operation={makeOp('mutagenesis')} containers={containers} />);
    // Initial — 1 row, remove disabled.
    expect(screen.getByTestId('mut-op-remove-0').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('mut-op-add'));
    expect(screen.getByTestId('mut-op-mutation-row-1')).toBeTruthy();
    // Now both removes enabled.
    expect(screen.getByTestId('mut-op-remove-0').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('mut-op-remove-0'));
    expect(screen.queryByTestId('mut-op-mutation-row-1')).toBeNull();
  });

  it('Execute emits {templateId, mutationType, mutations}', () => {
    const onExecute = vi.fn();
    render(<MutagenesisOpPopup operation={makeOp('mutagenesis')} containers={containers} onExecute={onExecute} />);
    fireEvent.change(screen.getByTestId('mut-op-template'), { target: { value: 'c-circ' } });
    fireEvent.change(screen.getByTestId('mut-op-position-0'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('mut-op-from-0'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('mut-op-to-0'), { target: { value: 'G' } });
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0][0]).toEqual({
      templateId: 'c-circ',
      mutationType: 'point',
      mutations: [{ position: 5, from: 'A', to: 'G' }],
    });
  });
});
