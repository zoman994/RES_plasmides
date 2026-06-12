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

// M-WORKSPACE — assemblies are top tabs (data-testid assembly-tab-zn-…), not
// floating zone frames. Count the tabs to detect zones.
const assemblyTabs = () => document.querySelectorAll('[data-testid^="assembly-tab-zn"]');

function seedZone() {
  // First zone via the workspace empty-state «+ Сборка» (CREATE_ZONE +
  // setActiveAssembly through buildAssemblyZoneAction).
  act(() => { fireEvent.click(screen.getByTestId('assembly-workspace-create')); });
}

describe('Clear canvas — gated RESET', () => {
  it('the «Очистить» button is present in the canvas chrome', () => {
    render(<CanvasSkeleton />);
    expect(screen.getByTestId('skeleton-clear-canvas')).toBeTruthy();
  });

  it('confirm → true wipes canvas content (created zone removed)', () => {
    render(<CanvasSkeleton />);
    seedZone();
    expect(assemblyTabs().length).toBeGreaterThan(0);

    window.confirm = () => true;
    act(() => { fireEvent.click(screen.getByTestId('skeleton-clear-canvas')); });
    expect(assemblyTabs().length).toBe(0); // cleared (RESET → zones [])
  });

  it('confirm → false keeps everything (destructive gate respected)', () => {
    render(<CanvasSkeleton />);
    seedZone();
    const before = assemblyTabs().length;
    expect(before).toBeGreaterThan(0);

    window.confirm = () => false;
    act(() => { fireEvent.click(screen.getByTestId('skeleton-clear-canvas')); });
    expect(assemblyTabs().length).toBe(before); // untouched
  });
});
