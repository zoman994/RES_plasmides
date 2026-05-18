/**
 * op-drag-no-editor.test.jsx — Игорь 17.05.2026: «при перетаскивании
 * ромба и отпускании кнопки бросает в сиквенс вивер. не должно».
 *
 * The synthesized click after an op-rhombus drag must NOT trigger
 * onOperationClick (which opens the editor / picker / popup). The hook
 * sets justDraggedRef on a moved op-drag pointer-up; onOperationClick
 * now early-returns on it (same guard as the canvas click). A plain
 * click (no movement) still opens normally.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions,
} from '../store/skeleton-context';
import CanvasLayoutView from '../canvas/CanvasLayoutView';

afterEach(cleanup);

function Harness() {
  const actions = useSkeletonActions();
  return (
    <button
      type="button"
      data-testid="add-op"
      onClick={() => actions.opAdd({ position: { x: 60, y: 60 } })}
    />
  );
}
function mount() {
  render(
    <SkeletonProvider>
      <Harness />
      <CanvasLayoutView />
    </SkeletonProvider>,
  );
  act(() => { fireEvent.click(screen.getByTestId('add-op')); });
}
const pickerMounts = () => document.querySelectorAll('[data-testid="skeleton-op-kind-picker-mount"]').length;
const opWrap = () => document.querySelector('[data-testid^="skeleton-op-wrap-"]');
const opNode = () => document.querySelector('[data-testid^="skeleton-op-node-"]');

describe('Op rhombus drag must not open the editor on release', () => {
  it('control: a plain click on a draft op opens its picker', () => {
    mount();
    expect(opNode()).toBeTruthy();
    act(() => { fireEvent.click(opNode()); });
    expect(pickerMounts()).toBeGreaterThan(0);
  });

  it('drag + release → the synthesized click is suppressed (no picker)', () => {
    mount();
    const canvas = screen.getByTestId('skeleton-canvas-layout');
    act(() => { fireEvent.pointerDown(opWrap(), { button: 0, clientX: 60, clientY: 60 }); });
    act(() => { fireEvent.pointerMove(canvas, { clientX: 160, clientY: 140 }); });
    act(() => { fireEvent.pointerUp(canvas, { clientX: 160, clientY: 140 }); });
    // The browser fires a click after the gesture — it must be a no-op.
    act(() => { fireEvent.click(opNode()); });
    expect(pickerMounts()).toBe(0);
  });

  it('after a suppressed drag-click, the NEXT plain click works again', () => {
    mount();
    const canvas = screen.getByTestId('skeleton-canvas-layout');
    act(() => { fireEvent.pointerDown(opWrap(), { button: 0, clientX: 60, clientY: 60 }); });
    act(() => { fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200 }); });
    act(() => { fireEvent.pointerUp(canvas, { clientX: 200, clientY: 200 }); });
    act(() => { fireEvent.click(opNode()); }); // suppressed
    expect(pickerMounts()).toBe(0);
    act(() => { fireEvent.click(opNode()); }); // genuine click → opens
    expect(pickerMounts()).toBeGreaterThan(0);
  });
});
