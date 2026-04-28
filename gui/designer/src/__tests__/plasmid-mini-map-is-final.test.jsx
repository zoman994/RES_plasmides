/**
 * Sprint IS-Final K5.1 — PlasmidMiniMap hover-bridge debounce.
 *
 *   5.1 hover-bridge: cancellable 250 ms close timer so the bridge gap
 *       between trigger and overlay doesn't close the popover.
 *
 * 5.2 priority-pass smart labels (resistance / origin / promoter / tag with
 * hard caps) was retired in Sprint Catalog Polish K6 (V46). The new rule —
 * "every region ≥ 300 bp gets a label, no upper cap, blacklist {source}" —
 * is covered by `plasmid-mini-map-v46.test.jsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import PlasmidMiniMap from '../components/PlasmidMiniMap';

// ─────────────────────── 5.1 Hover-bridge debounce ───────────────────────

describe('K5.1 PlasmidMiniMap hover-bridge debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('mouseenter on compact trigger opens popover', () => {
    const { getByTestId, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={[]} size={64} />,
    );
    expect(queryByTestId('plasmid-mini-map-overlay')).toBeNull();
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(queryByTestId('plasmid-mini-map-overlay')).toBeTruthy();
  });

  it('mouseleave on trigger closes overlay only after ~250 ms hover-bridge + 200 ms grow-out animation', () => {
    const { getByTestId, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={[]} size={64} />,
    );
    const trigger = getByTestId('plasmid-mini-map');
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    // Still open right after mouseleave (hover-bridge timer pending).
    expect(queryByTestId('plasmid-mini-map-overlay')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(260); });
    // Hover-bridge fired → animation started (active=false) but DOM still mounted
    // for the GROW_DURATION_MS=200 transition out.
    expect(queryByTestId('plasmid-mini-map-overlay')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(260); });
    // After the 200 ms unmount timer (260 + 260 > 250 + 200), portal unmounts.
    expect(queryByTestId('plasmid-mini-map-overlay')).toBeNull();
  });

  it('mouseenter on overlay within bridge window cancels close timer', () => {
    const { getByTestId, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={[]} size={64} />,
    );
    const trigger = getByTestId('plasmid-mini-map');
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    // Half-way through bridge debounce, cursor reaches the overlay.
    act(() => { vi.advanceTimersByTime(100); });
    const popover = getByTestId('plasmid-mini-map-overlay');
    fireEvent.mouseEnter(popover);
    act(() => { vi.advanceTimersByTime(500); });
    expect(queryByTestId('plasmid-mini-map-overlay')).toBeTruthy();
  });
});
