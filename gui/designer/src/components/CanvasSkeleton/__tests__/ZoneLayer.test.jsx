/**
 * ZoneLayer.test.jsx — T4 K5. Renders a ZoneFrame per zone, manages
 * drag (RAF-throttled DRAG_ZONE), resize (UPDATE_ZONE_BOUNDS), and the
 * context-menu popover.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ZoneLayer from '../canvas/ZoneLayer';

afterEach(cleanup);

let rafCbs = [];
beforeEach(() => {
  rafCbs = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafCbs.push(cb); return rafCbs.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
const flushRaf = () => { const cbs = rafCbs; rafCbs = []; cbs.forEach((cb) => cb()); };

const state = () => ({
  zones: [
    { id: 'zn-1', name: 'A', bounds: { x: 100, y: 100, width: 600, height: 400 }, collapsed: false, autoResize: true },
    { id: 'zn-2', name: 'B', bounds: { x: 800, y: 100, width: 400, height: 300 }, collapsed: false, autoResize: true },
  ],
  containers: [], pieces: [], operations: [], positions: {},
});

describe('T4 K5 ZoneLayer', () => {
  it('renders one ZoneFrame per zone', () => {
    render(<ZoneLayer state={state()} dispatch={vi.fn()} />);
    expect(screen.getByTestId('zone-frame-zn-1')).toBeTruthy();
    expect(screen.getByTestId('zone-frame-zn-2')).toBeTruthy();
  });

  it('double-click header → SET_ZONE_COLLAPSED', () => {
    const dispatch = vi.fn();
    render(<ZoneLayer state={state()} dispatch={dispatch} />);
    fireEvent.doubleClick(screen.getByTestId('zone-header-zn-1'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_ZONE_COLLAPSED', zoneId: 'zn-1', collapsed: true }));
  });

  it('right-click header opens ZoneContextMenu; Esc closes it', () => {
    render(<ZoneLayer state={state()} dispatch={vi.fn()} />);
    expect(screen.queryByTestId('zone-menu')).toBeNull();
    fireEvent.contextMenu(screen.getByTestId('zone-header-zn-1'));
    expect(screen.getByTestId('zone-menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('zone-menu')).toBeNull();
  });

  it('header drag → DRAG_ZONE with accumulated delta (RAF-flushed)', () => {
    const dispatch = vi.fn();
    render(<ZoneLayer state={state()} dispatch={dispatch} />);
    const header = screen.getByTestId('zone-header-zn-1');
    fireEvent.pointerDown(header, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(document, { clientX: 210, clientY: 205 });
    fireEvent.pointerMove(document, { clientX: 225, clientY: 215 });
    flushRaf();
    fireEvent.pointerUp(document, { clientX: 225, clientY: 215 });
    const dragCalls = dispatch.mock.calls.filter((c) => c[0].type === 'DRAG_ZONE');
    expect(dragCalls.length).toBeGreaterThanOrEqual(1);
    const totalDx = dragCalls.reduce((s, c) => s + c[0].delta.dx, 0);
    const totalDy = dragCalls.reduce((s, c) => s + c[0].delta.dy, 0);
    expect(totalDx).toBe(25); // 200→225
    expect(totalDy).toBe(15); // 200→215
    dragCalls.forEach((c) => expect(c[0].zoneId).toBe('zn-1'));
  });

  it('resize handle drag → UPDATE_ZONE_BOUNDS with new (grown) bounds', () => {
    const dispatch = vi.fn();
    render(<ZoneLayer state={state()} dispatch={dispatch} />);
    fireEvent.pointerDown(screen.getByTestId('zone-resize-se-zn-1'), { clientX: 700, clientY: 500 });
    fireEvent.pointerMove(document, { clientX: 760, clientY: 540 });
    flushRaf();
    fireEvent.pointerUp(document, { clientX: 760, clientY: 540 });
    const calls = dispatch.mock.calls.filter((c) => c[0].type === 'UPDATE_ZONE_BOUNDS');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const last = calls[calls.length - 1][0];
    expect(last.zoneId).toBe('zn-1');
    // SE drag +60/+40 → width 600→660, height 400→440
    expect(last.bounds.width).toBe(660);
    expect(last.bounds.height).toBe(440);
  });
});
