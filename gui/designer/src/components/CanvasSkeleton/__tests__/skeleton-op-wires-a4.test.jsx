/**
 * skeleton-op-wires-a4.test.jsx — Visual wires op ↔ inputs/outputs.
 *
 * A4 (14.05.2026 — TIER-A). При наличии op.inputs / op.outputs
 * на Layout view рендерится SVG path для каждой связи.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import {
  SkeletonProvider,
  useSkeletonActions,
  useOperations,
} from '../store/skeleton-context';
import { BLOCK_LINEAR_W, BLOCK_LINEAR_H } from '../canvas/canvas-layout';

// Parse the first moveto X from an SVG path `d` ("M x y C ...").
function firstMoveX(d) {
  const m = /M\s*(-?\d+(?:\.\d+)?)/.exec(d || '');
  return m ? Number(m[1]) : NaN;
}

// Parse the first moveto Y from an SVG path `d` ("M x y C ...").
function firstMoveY(d) {
  const m = /M\s*-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/.exec(d || '');
  return m ? Number(m[1]) : NaN;
}

afterEach(cleanup);

function Harness({ children }) {
  return (
    <SkeletonProvider>
      {children}
      <CanvasLayoutView />
    </SkeletonProvider>
  );
}

describe('A4 — operation wires', () => {
  it('op без inputs/outputs → wires-svg либо пустой, либо без <path>', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="add-op"
          onClick={() => actions.opAdd({ position: { x: 200, y: 200 } })}
        />
      );
    }
    render(<Harness><Inner /></Harness>);
    act(() => { fireEvent.click(screen.getByTestId('add-op')); });
    // No wires.
    expect(screen.queryAllByTestId('skeleton-op-wire').length).toBe(0);
  });

  it('op с input → wire path рендерится', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="add-op-with-input"
          onClick={() => actions.opAdd({
            position: { x: 200, y: 200 },
            inputs: ['c-placeholder-1'],
          })}
        />
      );
    }
    render(<Harness><Inner /></Harness>);
    act(() => { fireEvent.click(screen.getByTestId('add-op-with-input')); });
    const wires = screen.queryAllByTestId('skeleton-op-wire');
    expect(wires.length).toBeGreaterThan(0);
    expect(wires[0].getAttribute('data-from')).toBe('c-placeholder-1');
  });

  // V67 — input wire must terminate at the container BORDER, not centre.
  it('input wire anchors to container border (not center)', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="add-op-border"
          onClick={() => actions.opAdd({
            // op clearly to the RIGHT of c-placeholder-1 (GHOST_HOME 40,40)
            position: { x: 400, y: 200 },
            inputs: ['c-placeholder-1'],
          })}
        />
      );
    }
    render(<Harness><Inner /></Harness>);
    act(() => { fireEvent.click(screen.getByTestId('add-op-border')); });
    const wire = screen.queryAllByTestId('skeleton-op-wire')
      .find((w) => w.getAttribute('data-from') === 'c-placeholder-1');
    expect(wire).toBeTruthy();
    const x = firstMoveX(wire.getAttribute('d'));
    const cPosX = 40; // GHOST_HOME_POSITION.x
    // op is right of the container → wire starts at the RIGHT edge,
    // NOT the horizontal center (cPosX + BLOCK_LINEAR_W/2).
    expect(x).toBe(cPosX + BLOCK_LINEAR_W);
    expect(x).not.toBe(cPosX + BLOCK_LINEAR_W / 2);
  });

  // V68 — op-wire vertical anchor must be the container's true centre
  // (BLOCK_LINEAR_H/2), consistent with container↔container junctions,
  // not the old hardcoded +36 (which is off-centre on the taller block).
  it('input wire anchors to container vertical centre (BLOCK_LINEAR_H/2)', () => {
    function Inner() {
      const actions = useSkeletonActions();
      return (
        <button
          type="button"
          data-testid="add-op-vcenter"
          onClick={() => actions.opAdd({
            position: { x: 400, y: 200 },
            inputs: ['c-placeholder-1'],
          })}
        />
      );
    }
    render(<Harness><Inner /></Harness>);
    act(() => { fireEvent.click(screen.getByTestId('add-op-vcenter')); });
    const wire = screen.queryAllByTestId('skeleton-op-wire')
      .find((w) => w.getAttribute('data-from') === 'c-placeholder-1');
    expect(wire).toBeTruthy();
    const y = firstMoveY(wire.getAttribute('d'));
    const cPosY = 40; // GHOST_HOME_POSITION.y
    expect(y).toBe(cPosY + BLOCK_LINEAR_H / 2);
    expect(y).not.toBe(cPosY + 36); // old off-centre anchor
  });
});
