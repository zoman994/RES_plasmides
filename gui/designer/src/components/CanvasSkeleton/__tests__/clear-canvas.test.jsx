/**
 * clear-canvas.test.jsx — Игорь 17.05.2026: «добавь возможность
 * очистить канвас от всего». A gated «Очистить» button in the
 * bottom-right stack → RESET (empty buildInitialState). Destructive →
 * window.confirm gate (same pattern as the zone-delete confirm).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent,
} from '@testing-library/react';
import CanvasSkeleton from '../index';

// happy-dom does not implement window.confirm — assign it directly
// (vi.spyOn needs an existing function). Restore after each test.
const origConfirm = window.confirm;
afterEach(() => { cleanup(); window.confirm = origConfirm; });

const zoneFrames = () => document.querySelectorAll('[data-testid^="zone-frame-"]');

function seedZone() {
  // «Сборки» panel → «+ Новая сборка» = CREATE_ZONE → a zone-frame.
  act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
  act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-new')); });
}

describe('Clear canvas — gated RESET', () => {
  it('the «Очистить» button is present in the canvas chrome', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-clear-canvas')).toBeTruthy();
  });

  it('confirm → true wipes canvas content (created zone removed)', () => {
    render(<CanvasSkeleton />);
    seedZone();
    expect(zoneFrames().length).toBeGreaterThan(0);

    window.confirm = () => true;
    act(() => { fireEvent.click(screen.getByTestId('skeleton-clear-canvas')); });
    expect(zoneFrames().length).toBe(0); // cleared (RESET → zones [])
  });

  it('confirm → false keeps everything (destructive gate respected)', () => {
    render(<CanvasSkeleton />);
    seedZone();
    const before = zoneFrames().length;
    expect(before).toBeGreaterThan(0);

    window.confirm = () => false;
    act(() => { fireEvent.click(screen.getByTestId('skeleton-clear-canvas')); });
    expect(zoneFrames().length).toBe(before); // untouched
  });
});
