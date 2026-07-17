/**
 * skeleton-operation-node-k5.test.jsx — OperationNode v2 visual + handlers.
 *
 * Sprint M-CANVAS-OPS K5 (12.05.2026 — DEC-OPS-05). Coverage:
 *   1. Status-driven visual: draft / committed / executed / failed.
 *   2. Kind icon: PCR / Cut / Gibson / Ligate / KLD / Mutagenesis.
 *   3. Click and context-menu handlers forward the selected operation.
 *   4. Provider operation state updates through public actions.
 *   5. Status badge for executed (✓) / failed (!).
 *   6. CanvasSkeleton default-state smoke coverage.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, renderHook } from '@testing-library/react';
import OperationNode from '../canvas/OperationNode';
import CanvasSkeleton from '../index';
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

describe('K5 — OperationNode v2 status visual', () => {
  it('draft renders dashed grey ромб + plus icon + "Выбрать..." label', () => {
    const op = makeOp();
    expect(op.status).toBe('draft');
    expect(op.kind).toBeNull();
    render(<OperationNode operation={op} />);
    const node = screen.getByTestId(`skeleton-op-node-${op.id}`);
    expect(node.getAttribute('data-status')).toBe('draft');
    expect(node.getAttribute('data-kind')).toBe('none');
    // No status badge for draft.
    expect(screen.queryByTestId('skeleton-op-status-badge')).toBeNull();
    // Icon is the "plus" prompt (kind not yet picked) — now an <Icon> SVG.
    expect(screen.getByTestId('skeleton-op-icon').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('skeleton-op-label').textContent).toMatch(/Выбрать/);
  });

  it('committed renders kind-coloured + kind icon + kind label', () => {
    const op = makeOp({ kind: 'pcr', status: 'committed' });
    render(<OperationNode operation={op} />);
    const node = screen.getByTestId(`skeleton-op-node-${op.id}`);
    expect(node.getAttribute('data-status')).toBe('committed');
    expect(node.getAttribute('data-kind')).toBe('pcr');
    expect(screen.queryByTestId('skeleton-op-status-badge')).toBeNull();
    expect(screen.getByTestId('skeleton-op-label').textContent).toBe('PCR');
  });

  it('L1 — a gibson-kind op with method overlap_pcr labels «Overlap PCR» (linear), not Gibson', () => {
    const op = makeOp({ kind: 'gibson', status: 'committed', params: { method: 'overlap_pcr' } });
    render(<OperationNode operation={op} />);
    expect(screen.getByTestId('skeleton-op-label').textContent).toBe('Overlap PCR');
  });

  it('a gibson-kind op with method gibson still labels «Gibson»', () => {
    const op = makeOp({ kind: 'gibson', status: 'committed', params: { method: 'gibson' } });
    render(<OperationNode operation={op} />);
    expect(screen.getByTestId('skeleton-op-label').textContent).toBe('Gibson');
  });

  it('executed renders green tint + ✓ badge', () => {
    const op = makeOp({ kind: 'cut', status: 'executed' });
    render(<OperationNode operation={op} />);
    const badge = screen.getByTestId('skeleton-op-status-badge');
    expect(badge.querySelector('svg')).toBeTruthy(); // ✓ → <Icon name="check">
    expect(badge.getAttribute('data-status')).toBe('executed');
  });

  it('failed renders red + ! badge', () => {
    const op = makeOp({ kind: 'gibson', status: 'failed', error: 'no overlap' });
    render(<OperationNode operation={op} />);
    const badge = screen.getByTestId('skeleton-op-status-badge');
    expect(badge.textContent).toBe('!');
    expect(badge.getAttribute('data-status')).toBe('failed');
  });

  it('all 6 kinds map to distinct labels', () => {
    const kinds = ['pcr', 'cut', 'gibson', 'ligate', 'kld', 'mutagenesis'];
    const labels = ['PCR', 'Cut', 'Gibson', 'Ligate', 'KLD', 'Mutate'];
    for (let i = 0; i < kinds.length; i += 1) {
      const op = makeOp({ kind: kinds[i], status: 'committed' });
      const { unmount } = render(<OperationNode operation={op} />);
      expect(screen.getByTestId('skeleton-op-label').textContent).toBe(labels[i]);
      unmount();
    }
  });
});

describe('K5 — OperationNode v2 handlers', () => {
  it('onClick invoked with operation + event', () => {
    const op = makeOp();
    const fn = vi.fn();
    render(<OperationNode operation={op} onClick={fn} />);
    fireEvent.click(screen.getByTestId(`skeleton-op-node-${op.id}`));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe(op);
  });

  it('onContextMenu invoked + preventDefault called (no native menu)', () => {
    const op = makeOp();
    const fn = vi.fn();
    render(<OperationNode operation={op} onContextMenu={fn} />);
    const node = screen.getByTestId(`skeleton-op-node-${op.id}`);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const prevented = !node.dispatchEvent(ev);
    expect(prevented).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('no handlers wired → click does not throw', () => {
    const op = makeOp();
    render(<OperationNode operation={op} />);
    expect(() => {
      fireEvent.click(screen.getByTestId(`skeleton-op-node-${op.id}`));
    }).not.toThrow();
  });
});

describe('K5 — OperationNode v2 backwards-compat (legacy commit prop)', () => {
  it('legacy commit prop renders without operation (mapped to mutagenesis kind)', () => {
    const commit = { id: 'cm-1', type: 'mutate', label: 'M1' };
    render(<OperationNode commit={commit} />);
    const node = screen.getByTestId('skeleton-op-node-cm-1');
    expect(node.getAttribute('data-kind')).toBe('mutagenesis');
    // legacy label propagates
    expect(screen.getByTestId('skeleton-op-label').textContent).toBe('M1');
  });

  it('no operation + no commit → renders nothing', () => {
    const { container } = render(<OperationNode />);
    expect(container.firstChild).toBeNull();
  });
});

describe('K5 — operation state/actions', () => {
  it('CanvasSkeleton default fixture starts without operations', () => {
    render(<CanvasSkeleton />);
    expect(document.querySelectorAll('[data-testid^="skeleton-op-node-"]').length).toBe(0);
  });

  it('opAdd via actions hook updates state.operations in a shared SkeletonProvider', () => {
    function Harness() {
      const actions = useSkeletonActions();
      const ops = useOperations();
      return (
        <div>
          <button
            type="button"
            data-testid="harness-add-draft"
            onClick={() => actions.opAdd({ position: { x: 222, y: 333 } })}
          />
          <button
            type="button"
            data-testid="harness-add-committed"
            onClick={() => {
              actions.opAdd({ position: { x: 222, y: 333 } });
            }}
          />
          <span data-testid="harness-count">{ops.length}</span>
        </div>
      );
    }
    render(
      <SkeletonProvider>
        <Harness />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('harness-count').textContent).toBe('0');
    fireEvent.click(screen.getByTestId('harness-add-draft'));
    expect(screen.getByTestId('harness-count').textContent).toBe('1');
  });
});

describe('K5 — Mount via full CanvasSkeleton (smoke: no operations in default fixture)', () => {
  it('CanvasSkeleton mounts without op nodes by default (state.operations === [])', () => {
    render(<CanvasSkeleton />);
    expect(document.querySelectorAll('[data-testid^="skeleton-op-node-"]').length).toBe(0);
  });
});

describe('K5 — Hooks regression (useOperations through provider)', () => {
  it('hook subscribes to state.operations updates', () => {
    function wrapper({ children }) { return <SkeletonProvider>{children}</SkeletonProvider>; }
    const { result, rerender } = renderHook(
      () => ({ ops: useOperations(), actions: useSkeletonActions() }),
      { wrapper },
    );
    expect(result.current.ops.length).toBe(0);
    act(() => { result.current.actions.opAdd({ position: { x: 0, y: 0 } }); });
    rerender();
    expect(result.current.ops.length).toBe(1);
  });
});
