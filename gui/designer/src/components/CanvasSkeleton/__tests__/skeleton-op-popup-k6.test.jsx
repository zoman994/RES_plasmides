/**
 * skeleton-op-popup-k6.test.jsx — OpPopup base + OpKindPicker + PCROpPopup.
 *
 * Sprint M-CANVAS-OPS K6 (12.05.2026 — DEC-OPS-05/06). Coverage:
 *   1. OpPopup mounts at given position + renders title/icon/body/footer.
 *   2. Esc closes (calls onCancel).
 *   3. Click outside closes (calls onCancel).
 *   4. Cancel button + close-X call onCancel.
 *   5. Execute button calls onExecute; disabled when executeDisabled.
 *   6. OpKindPicker renders 6 tiles.
 *   7. Click PCR tile → onPick('pcr').
 *   8. Esc / outside dismisses picker.
 *   9. PCROpPopup template select shows only molecule containers.
 *   10. PCROpPopup primer pair select shows only oligonucleotide containers.
 *   11. Auto-design checkbox toggles (and disables primer-pair select).
 *   12. PCROpPopup Execute calls onExecute with params.
 *   13. Integration: Layout view click draft → picker → pick PCR →
 *       popup opens for PCR.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import OpPopup from '../canvas/operations/OpPopup';
import OpKindPicker, { OP_KINDS } from '../canvas/operations/OpKindPicker';
import PCROpPopup from '../canvas/operations/PCROpPopup';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import {
  SkeletonProvider,
  useSkeletonActions,
  useOperations,
} from '../store/skeleton-context';
import { createOperationDraft } from '../store/skeleton-state-operations';
import { useStore, bootstrapStore } from '../../../store';

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

function makeOp(overrides = {}) {
  const op = createOperationDraft({ position: { x: 10, y: 10 } });
  return { ...op, ...overrides };
}

describe('K6 — OpPopup base frame', () => {
  it('mounts at given position with title + body + footer', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed' });
    render(
      <OpPopup operation={op} position={{ x: 200, y: 100 }} title="X" icon="🧬">
        <div data-testid="body-content">hello</div>
      </OpPopup>,
    );
    const popup = screen.getByTestId(`op-popup-${op.id}`);
    expect(popup.style.left).toBe('200px');
    expect(popup.style.top).toBe('100px');
    expect(screen.getByTestId('op-popup-title').textContent).toBe('X');
    expect(screen.getByTestId('body-content').textContent).toBe('hello');
    expect(screen.getByTestId('op-popup-execute')).toBeTruthy();
    expect(screen.getByTestId('op-popup-cancel')).toBeTruthy();
    expect(screen.getByTestId('op-popup-close')).toBeTruthy();
  });

  it('Esc fires onCancel', () => {
    const op = makeOp();
    const onCancel = vi.fn();
    render(
      <OpPopup operation={op} title="X" onCancel={onCancel}>
        <div />
      </OpPopup>,
    );
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('click outside fires onCancel; click inside does not', () => {
    const op = makeOp();
    const onCancel = vi.fn();
    render(
      <div>
        <div data-testid="outside" style={{ width: 200, height: 100 }}>out</div>
        <OpPopup operation={op} title="X" onCancel={onCancel}>
          <span data-testid="inside">in</span>
        </OpPopup>
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('inside'));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Cancel + close-X buttons fire onCancel', () => {
    const op = makeOp();
    const onCancel = vi.fn();
    render(
      <OpPopup operation={op} title="X" onCancel={onCancel}>
        <div />
      </OpPopup>,
    );
    fireEvent.click(screen.getByTestId('op-popup-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('op-popup-close'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('Execute button calls onExecute; disabled blocks click', () => {
    const op = makeOp();
    const onExecute = vi.fn();
    const { rerender } = render(
      <OpPopup operation={op} title="X" onExecute={onExecute}>
        <div />
      </OpPopup>,
    );
    fireEvent.click(screen.getByTestId('op-popup-execute'));
    expect(onExecute).toHaveBeenCalledTimes(1);
    rerender(
      <OpPopup operation={op} title="X" onExecute={onExecute} executeDisabled>
        <div />
      </OpPopup>,
    );
    const btn = screen.getByTestId('op-popup-execute');
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    // Still only the first call — disabled button doesn't fire onClick.
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it('status badge reflects operation.status', () => {
    const op = makeOp({ status: 'committed', kind: 'pcr' });
    render(
      <OpPopup operation={op} title="X">
        <div />
      </OpPopup>,
    );
    expect(screen.getByTestId('op-popup-status-badge').textContent).toBe('committed');
  });
});

describe('K6 — OpKindPicker grid 3×2', () => {
  it('renders 7 kind tiles (V60 — gibson + golden_gate separated)', () => {
    const op = makeOp();
    render(<OpKindPicker operation={op} onPick={() => {}} />);
    expect(OP_KINDS.length).toBe(7);
    for (const k of OP_KINDS) {
      expect(screen.getByTestId(`op-kind-tile-${k.kind}`)).toBeTruthy();
    }
    // Explicit GG tile.
    expect(screen.getByTestId('op-kind-tile-golden_gate')).toBeTruthy();
  });

  it('click on tile fires onPick with kind', () => {
    const op = makeOp();
    const onPick = vi.fn();
    render(<OpKindPicker operation={op} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('op-kind-tile-pcr'));
    expect(onPick).toHaveBeenCalledWith('pcr');
    fireEvent.click(screen.getByTestId('op-kind-tile-gibson'));
    expect(onPick).toHaveBeenCalledWith('gibson');
  });

  it('Esc fires onCancel', () => {
    const op = makeOp();
    const onCancel = vi.fn();
    render(<OpKindPicker operation={op} onPick={() => {}} onCancel={onCancel} />);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('K6 — PCROpPopup', () => {
  const makeContainers = () => ([
    { id: 'c-mol-1', name: 'pUC19', kind: 'molecule', sequence: 'AAAA', topology: { circular: true } },
    { id: 'c-mol-2', name: 'gene-X', kind: 'molecule', sequence: 'GGGG' },
    { id: 'c-mol-3', name: 'empty', kind: 'molecule', sequence: '' }, // no seq — filtered
    { id: 'c-oligo-1', name: 'fwd-primer', kind: 'oligonucleotide', sequence: 'ATG' },
    { id: 'c-plh-1', name: 'placeholder', kind: 'molecule', sequence: null },
  ]);

  it('template select shows only molecule containers with sequence', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed' });
    render(
      <PCROpPopup
        operation={op}
        containers={makeContainers()}
        onCancel={() => {}}
        onExecute={() => {}}
      />,
    );
    const select = screen.getByTestId('pcr-op-template');
    const opts = Array.from(select.querySelectorAll('option'));
    const values = opts.map((o) => o.value);
    expect(values).toEqual(['', 'c-mol-1', 'c-mol-2']);
  });

  it('primer pair select shows only oligonucleotide containers', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed' });
    render(
      <PCROpPopup
        operation={op}
        containers={makeContainers()}
        onCancel={() => {}}
        onExecute={() => {}}
      />,
    );
    const select = screen.getByTestId('pcr-op-primer-pair');
    const opts = Array.from(select.querySelectorAll('option'));
    const values = opts.map((o) => o.value);
    expect(values).toEqual(['', 'c-oligo-1']);
  });

  it('auto-design checkbox toggles + disables primer pair select', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed' });
    render(
      <PCROpPopup
        operation={op}
        containers={makeContainers()}
        onCancel={() => {}}
        onExecute={() => {}}
      />,
    );
    const checkbox = screen.getByTestId('pcr-op-auto-design');
    expect(checkbox.checked).toBe(true); // default ON
    const primerSelect = screen.getByTestId('pcr-op-primer-pair');
    expect(primerSelect.disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(primerSelect.disabled).toBe(false);
  });

  it('Execute disabled until template selected; emits params on execute', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed' });
    const onExecute = vi.fn();
    render(
      <PCROpPopup
        operation={op}
        containers={makeContainers()}
        onCancel={() => {}}
        onExecute={onExecute}
      />,
    );
    const execute = screen.getByTestId('op-popup-execute');
    expect(execute.disabled).toBe(true);
    // Select template.
    fireEvent.change(screen.getByTestId('pcr-op-template'), { target: { value: 'c-mol-1' } });
    expect(execute.disabled).toBe(false);
    // Adjust annealing.
    fireEvent.change(screen.getByTestId('pcr-op-annealing'), { target: { value: '60' } });
    fireEvent.click(execute);
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0][0]).toEqual({
      templateId: 'c-mol-1',
      // R6-4: multi-template support added templateIds field (null when single).
      templateIds: null,
      primerPairId: null,
      autoDesign: true,
      annealingC: 60,
      extensionSec: 30,
    });
  });

  // V69 — op created via the hover 🔬 PCR-icon wires the fragment into
  // op.inputs[0] (canonical template, same as selectors-pcr /
  // adapters/pcr / PcrModeShell). The popup must reflect it instead of
  // forcing the biologist to re-pick an empty select.
  it('pre-selects template from op.inputs[0] when params.templateId unset (V69)', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed', inputs: ['c-mol-2'] });
    const onExecute = vi.fn();
    render(
      <PCROpPopup
        operation={op}
        containers={makeContainers()}
        onCancel={() => {}}
        onExecute={onExecute}
      />,
    );
    expect(screen.getByTestId('pcr-op-template').value).toBe('c-mol-2');
    // Template already known → Execute is not blocked on template choice.
    const execute = screen.getByTestId('op-popup-execute');
    expect(execute.disabled).toBe(false);
    fireEvent.click(execute);
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute.mock.calls[0][0].templateId).toBe('c-mol-2');
  });

  it('explicit params.templateId still wins over op.inputs[0] (V69)', () => {
    const op = makeOp({
      kind: 'pcr',
      status: 'committed',
      inputs: ['c-mol-2'],
      params: { templateId: 'c-mol-1' },
    });
    render(
      <PCROpPopup
        operation={op}
        containers={makeContainers()}
        onCancel={() => {}}
        onExecute={() => {}}
      />,
    );
    expect(screen.getByTestId('pcr-op-template').value).toBe('c-mol-1');
  });
});

describe('K6 — integration: Layout view picker → PCR popup', () => {
  function HarnessLayout({ children }) {
    return (
      <SkeletonProvider>
        {children}
        <CanvasLayoutView />
      </SkeletonProvider>
    );
  }

  it('click draft op → kind picker; click PCR tile → popup with PCR title', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="harness-add"
          onClick={() => actions.opAdd({ position: { x: 80, y: 80 } })}
        />
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    const opNode = document.querySelector('[data-testid^="skeleton-op-node-"]');
    expect(opNode).toBeTruthy();
    // Click draft op.
    act(() => { fireEvent.click(opNode); });
    // Picker should appear.
    expect(document.querySelector('[data-testid^="op-kind-picker-"]')).toBeTruthy();
    // Click PCR tile.
    act(() => { fireEvent.click(screen.getByTestId('op-kind-tile-pcr')); });
    // Picker gone, popup appears.
    expect(document.querySelector('[data-testid^="op-kind-picker-"]')).toBeNull();
    const popup = document.querySelector('[data-testid^="op-popup-"]');
    expect(popup).toBeTruthy();
    expect(popup.getAttribute('data-kind')).toBe('pcr');
    expect(screen.getByTestId('op-popup-title').textContent).toMatch(/PCR/);
  });

  // V78 — committed PCR op now opens the VIEWER, not this popup, so the
  // Layout→popup→cancel integration is verified with a NON-PCR kind
  // (cut still uses the params popup until it gets its own viewer mode).
  it('committed non-PCR op → popup opens via Layout, Cancel closes it (V78)', () => {
    function Inner() {
      const actions = useSkeletonActions();
      const ops = useOperations();
      return (
        <>
          <button
            type="button"
            data-testid="harness-add"
            onClick={() => {
              actions.opAdd({ position: { x: 50, y: 50 } });
            }}
          />
          <button
            type="button"
            data-testid="harness-commit"
            onClick={() => {
              const last = ops[ops.length - 1];
              if (last) {
                actions.opSetKind(last.id, 'cut');
                actions.opAddInput(last.id, 'c-placeholder-1');
              }
            }}
          />
          <span data-testid="harness-count">{ops.length}</span>
        </>
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    act(() => { fireEvent.click(screen.getByTestId('harness-commit')); });
    expect(screen.getByTestId('harness-count').textContent).toBe('1');
    // Click committed op to open popup.
    const opNode = document.querySelector('[data-testid^="skeleton-op-node-"]');
    act(() => { fireEvent.click(opNode); });
    expect(document.querySelector('[data-testid^="op-popup-"]')).toBeTruthy();
    // Cancel — popup closes.
    act(() => { fireEvent.click(screen.getByTestId('op-popup-cancel')); });
    expect(document.querySelector('[data-testid^="op-popup-"]')).toBeNull();
  });
});
