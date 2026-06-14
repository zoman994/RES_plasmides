/**
 * skeleton-op-popup-k7.test.jsx — CutOpPopup + GibsonOpPopup.
 *
 * Sprint M-CANVAS-OPS K7 (12.05.2026 — DEC-OPS-06).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CutOpPopup from '../canvas/operations/CutOpPopup';
import GibsonOpPopup from '../canvas/operations/GibsonOpPopup';
import GoldenGateOpPopup from '../canvas/operations/GoldenGateOpPopup';
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

// pUC19 has EcoRI site at GAATTC ~ position 396 (we just need any sequence
// with predictable cut sites for the preview test). A12 — also carries ONE BamHI
// site (GGATCC) so the EcoRI+BamHI double-digest test is viable (each enzyme cuts
// exactly once); EcoRI alone still cuts once (the 1-fragment preview test).
const SEQ_WITH_ECORI = 'ATGCGAATTCATGCGGATCCATGCGGGCCCAAA';
const SEQ_NO_CUT = 'TTTTTTTTTTTTTTTTTT';

const makeContainers = () => ([
  { id: 'c-circ', name: 'pUC19', kind: 'molecule', sequence: SEQ_WITH_ECORI, topology: { circular: true } },
  { id: 'c-lin1', name: 'frag-A', kind: 'molecule', sequence: 'ATCG'.repeat(50), topology: { circular: false } },
  { id: 'c-lin2', name: 'frag-B', kind: 'molecule', sequence: 'GCTA'.repeat(40), topology: { circular: false } },
  { id: 'c-lin3', name: 'frag-C', kind: 'molecule', sequence: 'CCGG'.repeat(30), topology: { circular: false } },
  { id: 'c-plh',  name: 'placeholder', kind: 'molecule', sequence: null },
  { id: 'c-no-seq', name: 'empty', kind: 'molecule', sequence: '' },
]);

describe('K7 — CutOpPopup', () => {
  it('template select shows only molecule containers with sequence', () => {
    const op = makeOp('cut');
    render(<CutOpPopup operation={op} containers={makeContainers()} />);
    const select = screen.getByTestId('cut-op-template');
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['', 'c-circ', 'c-lin1', 'c-lin2', 'c-lin3']);
  });

  it('search filters enzyme list by name', () => {
    const op = makeOp('cut');
    render(<CutOpPopup operation={op} containers={makeContainers()} />);
    // Default — many enzymes including EcoRI, BamHI etc.
    expect(screen.getByTestId('cut-op-enzyme-EcoRI')).toBeTruthy();
    expect(screen.getByTestId('cut-op-enzyme-BamHI')).toBeTruthy();
    // Search "EcoRI".
    fireEvent.change(screen.getByTestId('cut-op-search'), { target: { value: 'EcoRI' } });
    expect(screen.getByTestId('cut-op-enzyme-EcoRI')).toBeTruthy();
    expect(screen.queryByTestId('cut-op-enzyme-BamHI')).toBeNull();
  });

  it('search filters by recognition site', () => {
    const op = makeOp('cut');
    render(<CutOpPopup operation={op} containers={makeContainers()} />);
    fireEvent.change(screen.getByTestId('cut-op-search'), { target: { value: 'GAATTC' } });
    expect(screen.getByTestId('cut-op-enzyme-EcoRI')).toBeTruthy();
  });

  it('Execute is disabled until template + ≥1 enzyme picked', () => {
    const op = makeOp('cut');
    render(<CutOpPopup operation={op} containers={makeContainers()} />);
    const execute = screen.getByTestId('op-popup-execute');
    expect(execute.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('cut-op-template'), { target: { value: 'c-circ' } });
    expect(execute.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cut-op-enzyme-EcoRI'));
    expect(execute.disabled).toBe(false);
  });

  it('preview shows correct cut count + fragment count for circular EcoRI', () => {
    const op = makeOp('cut');
    render(<CutOpPopup operation={op} containers={makeContainers()} />);
    fireEvent.change(screen.getByTestId('cut-op-template'), { target: { value: 'c-circ' } });
    fireEvent.click(screen.getByTestId('cut-op-enzyme-EcoRI'));
    // SEQ_WITH_ECORI contains GAATTC once → 1 cut, circular → 1 fragment
    expect(screen.getByTestId('cut-op-preview-cuts').textContent).toBe('1');
    expect(screen.getByTestId('cut-op-preview-fragments').textContent).toBe('1');
  });

  it('preview for enzyme with 0 cuts → 0 cuts, 1 fragment (full length)', () => {
    const op = makeOp('cut');
    const noCut = [{ id: 'c-no', name: 'no-cut', kind: 'molecule', sequence: SEQ_NO_CUT, topology: { circular: false } }];
    render(<CutOpPopup operation={op} containers={noCut} />);
    fireEvent.change(screen.getByTestId('cut-op-template'), { target: { value: 'c-no' } });
    fireEvent.click(screen.getByTestId('cut-op-enzyme-EcoRI'));
    expect(screen.getByTestId('cut-op-preview-cuts').textContent).toBe('0');
    expect(screen.getByTestId('cut-op-preview-fragments').textContent).toBe('1');
  });

  it('Execute emits {templateId, enzymes}', () => {
    const op = makeOp('cut');
    const onExecute = vi.fn();
    render(<CutOpPopup operation={op} containers={makeContainers()} onExecute={onExecute} />);
    fireEvent.change(screen.getByTestId('cut-op-template'), { target: { value: 'c-circ' } });
    fireEvent.click(screen.getByTestId('cut-op-enzyme-EcoRI'));
    fireEvent.click(screen.getByTestId('cut-op-enzyme-BamHI'));
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0][0]).toEqual({
      templateId: 'c-circ',
      enzymes: ['EcoRI', 'BamHI'],
    });
  });
});

describe('K7 — GibsonOpPopup', () => {
  it('fragment list shows only linear molecule containers', () => {
    const op = makeOp('gibson');
    render(<GibsonOpPopup operation={op} containers={makeContainers()} />);
    expect(screen.getByTestId('gibson-op-fragment-c-lin1')).toBeTruthy();
    expect(screen.getByTestId('gibson-op-fragment-c-lin2')).toBeTruthy();
    expect(screen.getByTestId('gibson-op-fragment-c-lin3')).toBeTruthy();
    expect(screen.queryByTestId('gibson-op-fragment-c-circ')).toBeNull();
    expect(screen.queryByTestId('gibson-op-fragment-c-plh')).toBeNull();
  });

  it('Execute disabled when <2 fragments selected', () => {
    const op = makeOp('gibson');
    render(<GibsonOpPopup operation={op} containers={makeContainers()} />);
    const execute = screen.getByTestId('op-popup-execute');
    expect(execute.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin1'));
    expect(execute.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin2'));
    expect(execute.disabled).toBe(false);
  });

  it('reorder up/down works on the order list', () => {
    const op = makeOp('gibson');
    render(<GibsonOpPopup operation={op} containers={makeContainers()} />);
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin2'));
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin3'));
    // Initial order: lin1, lin2, lin3
    const orderRows = screen.getByTestId('gibson-op-order-list').children;
    expect(orderRows[0].getAttribute('data-testid')).toBe('gibson-op-order-c-lin1');
    expect(orderRows[2].getAttribute('data-testid')).toBe('gibson-op-order-c-lin3');
    // Move lin3 up.
    fireEvent.click(screen.getByTestId('gibson-op-order-up-c-lin3'));
    const after = screen.getByTestId('gibson-op-order-list').children;
    expect(after[1].getAttribute('data-testid')).toBe('gibson-op-order-c-lin3');
    expect(after[2].getAttribute('data-testid')).toBe('gibson-op-order-c-lin2');
  });

  it('V60 — method toggle removed: Gibson popup always emits method=overlap', () => {
    const op = makeOp('gibson');
    const onExecute = vi.fn();
    render(<GibsonOpPopup operation={op} containers={makeContainers()} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin2'));
    // V60: method radio удалён — Gibson всегда overlap.
    expect(screen.queryByTestId('gibson-op-method-overlap')).toBeNull();
    expect(screen.queryByTestId('gibson-op-method-goldengate')).toBeNull();
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0].method).toBe('overlap');
  });

  it('circular toggle: defaults to circular, can switch to linear', () => {
    const op = makeOp('gibson');
    const onExecute = vi.fn();
    render(<GibsonOpPopup operation={op} containers={makeContainers()} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin2'));
    expect(screen.getByTestId('gibson-op-circular').checked).toBe(true);
    fireEvent.click(screen.getByTestId('gibson-op-circular'));
    expect(screen.getByTestId('gibson-op-circular').checked).toBe(false);
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0].circular).toBe(false);
  });

  it('Execute emits {fragmentIds, method, circular}', () => {
    const op = makeOp('gibson');
    const onExecute = vi.fn();
    render(<GibsonOpPopup operation={op} containers={makeContainers()} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('gibson-op-fragment-c-lin2'));
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0][0]).toEqual({
      fragmentIds: ['c-lin1', 'c-lin2'],
      method: 'overlap',
      circular: true,
    });
  });

  it('empty linear list → empty hint shown (Gibson)', () => {
    const op = makeOp('gibson');
    render(<GibsonOpPopup operation={op} containers={[]} />);
    expect(screen.getByTestId('gibson-op-fragment-list').textContent).toMatch(/Нет линейных/);
  });
});

describe('V60 — GoldenGateOpPopup', () => {
  const makeContainers = () => ([
    { id: 'c-lin1', name: 'frag-A', kind: 'molecule', sequence: 'ATCGATCG'.repeat(20), topology: { circular: false } },
    { id: 'c-lin2', name: 'frag-B', kind: 'molecule', sequence: 'GCTAGCTA'.repeat(20), topology: { circular: false } },
    { id: 'c-circ', name: 'pUC', kind: 'molecule', sequence: 'AAAA', topology: { circular: true } },
  ]);
  function makeGGOp() {
    return { id: 'op-gg-1', kind: 'golden_gate', status: 'committed', position: { x: 0, y: 0 }, inputs: [], outputs: [], params: {}, junctionRefs: [], createdAt: '', executedAt: null, error: null };
  }

  it('renders only linear fragments + default BsaI enzyme', () => {
    render(<GoldenGateOpPopup operation={makeGGOp()} containers={makeContainers()} />);
    expect(screen.getByTestId('gg-op-fragment-c-lin1')).toBeTruthy();
    expect(screen.getByTestId('gg-op-fragment-c-lin2')).toBeTruthy();
    expect(screen.queryByTestId('gg-op-fragment-c-circ')).toBeNull();
    expect(screen.getByTestId('gg-op-enzyme').value).toBe('BsaI');
  });

  it('Execute emits {fragmentIds, enzyme, circular, method:goldengate}', () => {
    const onExecute = vi.fn();
    render(<GoldenGateOpPopup operation={makeGGOp()} containers={makeContainers()} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('gg-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('gg-op-fragment-c-lin2'));
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute).toHaveBeenCalledTimes(1);
    const args = onExecute.mock.calls[0][0];
    expect(args.fragmentIds).toEqual(['c-lin1', 'c-lin2']);
    expect(args.enzyme).toBe('BsaI');
    expect(args.circular).toBe(true);
    expect(args.method).toBe('goldengate');
  });

  it('enzyme select can change to another Type IIS', () => {
    const onExecute = vi.fn();
    render(<GoldenGateOpPopup operation={makeGGOp()} containers={makeContainers()} onExecute={onExecute} />);
    fireEvent.click(screen.getByTestId('gg-op-fragment-c-lin1'));
    fireEvent.click(screen.getByTestId('gg-op-fragment-c-lin2'));
    fireEvent.change(screen.getByTestId('gg-op-enzyme'), { target: { value: 'BsmBI' } });
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute.mock.calls[0][0].enzyme).toBe('BsmBI');
  });
});
