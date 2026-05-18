/**
 * ZoneFrame.test.jsx — T4 K3. Single zone-frame component: header
 * (name / counter / notes badge), collapsed state, drag/resize/menu
 * /double-click handlers.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ZoneFrame from '../canvas/ZoneFrame';

afterEach(cleanup);

const zone = (over = {}) => ({
  id: 'zn-1', name: 'Сборка 1',
  bounds: { x: 100, y: 80, width: 600, height: 400 },
  collapsed: false, viewMode: 'graph', autoResize: true, notes: null,
  ...over,
});

describe('T4 K3 ZoneFrame', () => {
  it('renders name, node counter, positioned at bounds', () => {
    render(<ZoneFrame zone={zone()} nodeCount={4} />);
    const f = screen.getByTestId('zone-frame-zn-1');
    expect(f).toBeTruthy();
    expect(f.style.left).toBe('100px');
    expect(f.style.top).toBe('80px');
    expect(f.style.width).toBe('600px');
    expect(screen.getByText('Сборка 1')).toBeTruthy();
    expect(screen.getByTestId('zone-counter-zn-1').textContent).toMatch(/4/);
  });

  it('Russian plural in the counter (узел/узла/узлов)', () => {
    const { rerender } = render(<ZoneFrame zone={zone()} nodeCount={1} />);
    expect(screen.getByTestId('zone-counter-zn-1').textContent).toMatch(/1 узел/);
    rerender(<ZoneFrame zone={zone()} nodeCount={3} />);
    expect(screen.getByTestId('zone-counter-zn-1').textContent).toMatch(/3 узла/);
    rerender(<ZoneFrame zone={zone()} nodeCount={5} />);
    expect(screen.getByTestId('zone-counter-zn-1').textContent).toMatch(/5 узлов/);
  });

  it('notes badge only when zone.notes is set', () => {
    const { rerender } = render(<ZoneFrame zone={zone()} nodeCount={0} />);
    expect(screen.queryByTestId('zone-notes-badge-zn-1')).toBeNull();
    rerender(<ZoneFrame zone={zone({ notes: 'pks4 ko' })} nodeCount={0} />);
    expect(screen.getByTestId('zone-notes-badge-zn-1')).toBeTruthy();
  });

  it('collapsed → body + resize handles hidden, height = header', () => {
    render(<ZoneFrame zone={zone({ collapsed: true })} nodeCount={2} />);
    const f = screen.getByTestId('zone-frame-zn-1');
    expect(f.style.height).toBe('28px');
    expect(screen.queryByTestId('zone-body-zn-1')).toBeNull();
    expect(screen.queryByTestId('zone-resize-se-zn-1')).toBeNull();
  });

  it('expanded → body present with pointer-events:none, 8 resize handles', () => {
    render(<ZoneFrame zone={zone()} nodeCount={0} />);
    const body = screen.getByTestId('zone-body-zn-1');
    expect(body.style.pointerEvents).toBe('none');
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((edge) => {
      expect(screen.getByTestId(`zone-resize-${edge}-zn-1`)).toBeTruthy();
    });
  });

  it('header pointer-down → onDragStart; double-click → onClickHeader', () => {
    const onDragStart = vi.fn();
    const onClickHeader = vi.fn();
    render(<ZoneFrame zone={zone()} nodeCount={0} onDragStart={onDragStart} onClickHeader={onClickHeader} />);
    const header = screen.getByTestId('zone-header-zn-1');
    fireEvent.pointerDown(header);
    expect(onDragStart).toHaveBeenCalled();
    fireEvent.doubleClick(header);
    expect(onClickHeader).toHaveBeenCalled();
  });

  it('right-click header → onContextMenu with preventDefault', () => {
    const onContextMenu = vi.fn();
    render(<ZoneFrame zone={zone()} nodeCount={0} onContextMenu={onContextMenu} />);
    fireEvent.contextMenu(screen.getByTestId('zone-header-zn-1'));
    expect(onContextMenu).toHaveBeenCalled();
  });

  it('resize handle pointer-down → onResize(edge)', () => {
    const onResize = vi.fn();
    render(<ZoneFrame zone={zone()} nodeCount={0} onResize={onResize} />);
    fireEvent.pointerDown(screen.getByTestId('zone-resize-se-zn-1'));
    expect(onResize).toHaveBeenCalledWith('se', expect.anything());
  });
});
