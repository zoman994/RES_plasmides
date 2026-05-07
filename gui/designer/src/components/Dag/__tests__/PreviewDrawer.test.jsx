/**
 * PreviewDrawer — Sprint M-C.1 K3 component tests.
 *
 * Slide-in overlay 340 px right of the palette. Closes on Esc, click
 * outside, drag-start, or successful «Добавить на canvas». Spec §9 Q2:
 * «Добавить на canvas» from the drawer (no drag) drops in the centre
 * of the current viewport.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import PreviewDrawer from '../PreviewDrawer';

vi.mock('../../PlasmidMiniMap', () => ({
  default: ({ length }) => <div data-testid="drawer-mini-map" data-length={length}>map</div>,
}));

const ENTRY = {
  id: 'lib-1',
  kind: 'container',
  name: 'pUC19',
  payload: {
    sequence: 'A'.repeat(2686),
    length: 2686,
    topology: 'circular',
    annotations: [
      { id: 'a-1', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
      { id: 'a-2', type: 'rep_origin', name: 'ori', start: 1000, end: 1500, level: 'region' },
    ],
  },
  ext: {},
};

beforeEach(() => {});
afterEach(() => cleanup());

describe('M-C.1 K3 — PreviewDrawer', () => {
  it('renders nothing when entry prop is null', () => {
    const { container } = render(<PreviewDrawer entry={null} onClose={() => {}} onAddToCanvas={() => {}} />);
    expect(container.querySelector('[data-testid="dag-preview-drawer"]')).toBeNull();
  });

  it('renders mini-map + name + length + region list when entry is provided', () => {
    render(<PreviewDrawer entry={ENTRY} onClose={() => {}} onAddToCanvas={() => {}} />);
    expect(screen.getByTestId('dag-preview-drawer')).toBeTruthy();
    expect(screen.getByTestId('drawer-mini-map').dataset.length).toBe('2686');
    expect(screen.getByTestId('dag-preview-drawer-name').textContent).toContain('pUC19');
    const regions = screen.getAllByTestId(/^dag-preview-drawer-region-/);
    expect(regions.length).toBe(2);
  });

  it('Esc key calls onClose', () => {
    const onClose = vi.fn();
    render(<PreviewDrawer entry={ENTRY} onClose={onClose} onAddToCanvas={() => {}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('«Закрыть» button calls onClose', () => {
    const onClose = vi.fn();
    render(<PreviewDrawer entry={ENTRY} onClose={onClose} onAddToCanvas={() => {}} />);
    fireEvent.click(screen.getByTestId('dag-preview-drawer-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('«Добавить на canvas» calls onAddToCanvas with the entry', () => {
    const onAddToCanvas = vi.fn();
    render(<PreviewDrawer entry={ENTRY} onClose={() => {}} onAddToCanvas={onAddToCanvas} />);
    fireEvent.click(screen.getByTestId('dag-preview-drawer-add'));
    expect(onAddToCanvas).toHaveBeenCalledTimes(1);
    expect(onAddToCanvas.mock.calls[0][0]).toMatchObject({ id: 'lib-1' });
  });

  it('caps the visible region list and renders a +N more chip when there are more than 8 regions', () => {
    const many = {
      ...ENTRY,
      payload: {
        ...ENTRY.payload,
        annotations: Array.from({ length: 12 }, (_, i) => ({
          id: `r-${i}`, type: 'CDS', name: `f-${i}`, start: i * 100, end: i * 100 + 80, level: 'region',
        })),
      },
    };
    render(<PreviewDrawer entry={many} onClose={() => {}} onAddToCanvas={() => {}} />);
    // Numeric-suffix testids only — the overflow chip carries the
    // separate `dag-preview-drawer-region-overflow` testid.
    const regions = screen.getAllByTestId(/^dag-preview-drawer-region-\d+$/);
    expect(regions.length).toBe(8);
    expect(screen.getByTestId('dag-preview-drawer-region-overflow').textContent).toMatch(/\+4/);
  });
});
