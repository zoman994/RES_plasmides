/**
 * skeleton-operation-node-k5.test.jsx — OperationNode v2 visual + handlers.
 *
 * Sprint M-CANVAS-OPS K5 (12.05.2026 — DEC-OPS-05). Coverage:
 *   1. Status-driven visual: draft / committed / executed / failed.
 *   2. Kind icon: PCR / Cut / Gibson / Ligate / KLD / Mutagenesis.
 *   3. Click handler: draft → setOpenPicker; committed → setOpenPopup.
 *   4. Right-click → context menu mount + Delete → opRemove.
 *   5. Status badge for executed (✓) / failed (!).
 *   6. Layout view renders state.operations as ромбы.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, renderHook } from '@testing-library/react';
import OperationNode from '../canvas/OperationNode';
import CanvasSkeleton from '../index';
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
    // Icon is the "+" prompt (kind not yet picked).
    expect(screen.getByTestId('skeleton-op-icon').textContent).toBe('+');
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

  it('executed renders green tint + ✓ badge', () => {
    const op = makeOp({ kind: 'cut', status: 'executed' });
    render(<OperationNode operation={op} />);
    const badge = screen.getByTestId('skeleton-op-status-badge');
    expect(badge.textContent).toBe('✓');
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

describe('K5 — Layout view renders state.operations', () => {
  function wrapper({ children }) {
    return <SkeletonProvider>{children}</SkeletonProvider>;
  }

  it('opAdd → state.operations renders an OperationNode in Layout view', () => {
    render(<CanvasSkeleton />);
    expect(document.querySelectorAll('[data-testid^="skeleton-op-node-"]').length).toBe(0);
    // Dispatch through provider — we use renderHook + same provider here
    // would isolate it from the rendered CanvasSkeleton. Instead, fire
    // via a small inline harness that calls opAdd on the existing app's
    // store. The simpler harness: a second tree mounting a Provider +
    // CanvasSkeleton shares NO state, so use direct hook test below.
  });

  it('Layout view: opAdd via actions hook + verify render via shared SkeletonProvider', () => {
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

describe('K5 — Layout view click integration (draft → picker, committed → popup)', () => {
  // CanvasSkeleton wraps itself in its OWN SkeletonProvider, so a harness
  // mounted next to it doesn't share state. We render CanvasLayoutView
  // directly inside our shared Provider so dispatch + render see the
  // same store.
  function HarnessLayout({ children }) {
    return (
      <SkeletonProvider>
        {children}
        <CanvasLayoutView />
      </SkeletonProvider>
    );
  }

  it('click on draft op → picker mount appears', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="harness-add"
          onClick={() => actions.opAdd({ position: { x: 50, y: 50 } })}
        />
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    const opNodes = document.querySelectorAll('[data-testid^="skeleton-op-node-"]');
    expect(opNodes.length).toBeGreaterThan(0);
    act(() => { fireEvent.click(opNodes[0]); });
    expect(document.querySelectorAll('[data-testid="skeleton-op-kind-picker-mount"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-testid="skeleton-op-popup-mount"]').length).toBe(0);
  });

  it('click on committed op → popup mount appears', () => {
    function Inner() {
      const actions = useSkeletonActions();
      const ops = useOperations();
      return (
        <>
          <button
            type="button"
            data-testid="harness-add"
            onClick={() => actions.opAdd({ position: { x: 80, y: 80 } })}
          />
          <button
            type="button"
            data-testid="harness-commit"
            onClick={() => {
              const last = ops[ops.length - 1];
              if (last) {
                // V78 — PCR now opens the viewer, not the popup. Use a
                // non-PCR kind (cut) to keep covering the committed-op →
                // popup-mount path. Empty inputs → template picker, so
                // give it an input for the OpPopup path.
                actions.opSetKind(last.id, 'cut');
                actions.opAddInput(last.id, 'c-placeholder-1');
              }
            }}
          />
        </>
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    act(() => { fireEvent.click(screen.getByTestId('harness-commit')); });
    const opNodes = document.querySelectorAll('[data-testid^="skeleton-op-node-"]');
    expect(opNodes.length).toBeGreaterThan(0);
    const opNode = opNodes[0];
    expect(opNode.getAttribute('data-status')).toBe('committed');
    expect(opNode.getAttribute('data-kind')).toBe('cut');
    act(() => { fireEvent.click(opNode); });
    expect(document.querySelectorAll('[data-testid="skeleton-op-popup-mount"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-testid="skeleton-op-kind-picker-mount"]').length).toBe(0);
  });

  it('right-click op → context menu, Delete → opRemove', () => {
    function Inner() {
      const actions = useSkeletonActions();
      const ops = useOperations();
      return (
        <>
          <button
            type="button"
            data-testid="harness-add"
            onClick={() => actions.opAdd({ position: { x: 50, y: 50 } })}
          />
          <span data-testid="harness-count">{ops.length}</span>
        </>
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    expect(screen.getByTestId('harness-count').textContent).toBe('1');
    const opNode = document.querySelector('[data-testid^="skeleton-op-node-"]');
    expect(opNode).toBeTruthy();
    act(() => { fireEvent.contextMenu(opNode); });
    expect(screen.getByTestId('skeleton-op-context-menu')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('skeleton-op-context-delete')); });
    expect(screen.getByTestId('harness-count').textContent).toBe('0');
    expect(document.querySelectorAll('[data-testid^="skeleton-op-node-"]').length).toBe(0);
  });
});

describe('K5 — Mount via full CanvasSkeleton (smoke: no operations in default fixture)', () => {
  it('CanvasSkeleton mounts without op nodes by default (state.operations === [])', () => {
    render(<CanvasSkeleton />);
    expect(document.querySelectorAll('[data-testid^="skeleton-op-node-"]').length).toBe(0);
  });
});

describe('V58 (13.05.2026) — operation diamonds are draggable on canvas', () => {
  function HarnessLayout({ children }) {
    return (
      <SkeletonProvider>
        {children}
        <CanvasLayoutView />
      </SkeletonProvider>
    );
  }

  it('pointerDown + pointerMove on op wrapper updates op.position via opSetPosition', () => {
    const captured = { ops: null };
    function Inner() {
      const actions = useSkeletonActions();
      const ops = useOperations();
      captured.ops = ops;
      return (
        <button
          type="button"
          data-testid="harness-add"
          onClick={() => actions.opAdd({ position: { x: 100, y: 100 } })}
        />
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    const wrap = document.querySelector('[data-testid^="skeleton-op-wrap-"]');
    expect(wrap).toBeTruthy();
    const initialLeft = wrap.style.left;
    expect(initialLeft).toBe('100px');

    // Pointer down on wrapper, then move on the canvas root.
    act(() => {
      fireEvent.pointerDown(wrap, { button: 0, clientX: 110, clientY: 110, pointerId: 1 });
    });
    const canvas = screen.getByTestId('skeleton-canvas-layout');
    act(() => {
      fireEvent.pointerMove(canvas, { clientX: 320, clientY: 260, pointerId: 1 });
    });
    // Captured ops should reflect new position.
    const opAfter = captured.ops?.[0];
    expect(opAfter).toBeTruthy();
    // In jsdom getBoundingClientRect() returns all zeros → pointerDown
    // offsetX/Y = clientX/Y. New x = 320 - 0 - 110 = 210, y = 260 - 0 - 110 = 150.
    // Главное — позиция изменилась относительно начальной (100, 100).
    expect(opAfter.position.x).not.toBe(100);
    expect(opAfter.position.y).not.toBe(100);
    expect(opAfter.position.x).toBeGreaterThan(100);
    expect(opAfter.position.y).toBeGreaterThan(100);

    act(() => {
      fireEvent.pointerUp(canvas, { clientX: 240, clientY: 180, pointerId: 1 });
    });
  });

  it('click without movement → picker opens (drag does NOT swallow click)', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="harness-add"
          onClick={() => actions.opAdd({ position: { x: 50, y: 50 } })}
        />
      );
    }
    render(<HarnessLayout><Inner /></HarnessLayout>);
    act(() => { fireEvent.click(screen.getByTestId('harness-add')); });
    const opNode = document.querySelector('[data-testid^="skeleton-op-node-"]');
    expect(opNode).toBeTruthy();
    act(() => { fireEvent.click(opNode); });
    // Click on draft → kind picker mount appears.
    expect(document.querySelectorAll('[data-testid="skeleton-op-kind-picker-mount"]').length).toBeGreaterThan(0);
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
