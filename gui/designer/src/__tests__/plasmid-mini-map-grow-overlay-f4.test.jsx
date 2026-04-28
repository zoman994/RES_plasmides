/**
 * Sprint Catalog Polish FIX F4 — grow-overlay via React portal.
 *
 * Game plan after FIX-2 + follow-up (28.04.2026): K2 restored the white card,
 * K3 dropped source-fade, follow-up dropped the plasmid-name <text> (was
 * pushing the inner SVG bbox past the right column).
 *
 * Verified:
 *   1. Hover on inline mini-map mounts overlay in document.body via createPortal.
 *   2. After requestAnimationFrame the overlay style includes scale(1) opacity 1.
 *   3. Overlay carries the white-card chrome: bg-white + shadow + border.
 *   4. Source mini-map stays at opacity: 1 while overlay is mounted (no fade).
 *   5. mouseleave → 250 ms hover-bridge → 200 ms grow-out → portal unmounts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import PlasmidMiniMap from '../components/PlasmidMiniMap';

const ANNOTS = [
  { id: 'a', start: 0, end: 800, level: 'region', type: 'CDS', name: 'cdsA' },
];

describe('F4 grow-overlay portal', () => {
  it('hover on size=64 inline mini-map renders overlay in document.body (not in card wrapper)', () => {
    const { getByTestId, baseElement, container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    const overlay = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]');
    expect(overlay).toBeTruthy();
    // Overlay is NOT inside the card wrapper — it's a sibling of `container`
    // because createPortal targets document.body.
    expect(container.contains(overlay)).toBe(false);
  });

  it('overlay sits at z-index 100 with position: fixed (above catalog scroll, below native dialogs)', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    const overlay = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]');
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.zIndex).toBe('100');
  });

  it('overlay carries white-card chrome: bg-white + shadow + border (FIX-2 K2 — biolog asked it back)', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    const overlay = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]');
    const cls = overlay.className || '';
    expect(cls).toMatch(/bg-white/);
    expect(cls).toMatch(/shadow/);
    expect(cls).toMatch(/border/);
  });

  it('overlay grows from scale(0.5)/opacity(0) → scale(1)/opacity(1) after rAF (CSS transition)', async () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    // Wait for the rAF that sets overlayActive=true.
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const overlay = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]');
    // FIX-2 follow-up: container is `w-fit` (no fixed dimensions) — overlay is
    // centred on the source tile via `translate(-50%, -50%)`, then scaled.
    expect(overlay.style.transform).toBe('translate(-50%, -50%) scale(1)');
    expect(overlay.style.opacity).toBe('1');
    expect(overlay.style.transition).toMatch(/transform 200ms/);
    expect(overlay.style.transition).toMatch(/opacity 200ms/);
  });

  it('source mini-map stays at full opacity while overlay is mounted (FIX-2 K3 — fade dropped)', () => {
    const { getByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    const wrapper = getByTestId('plasmid-mini-map');
    const sourceSvg = wrapper.querySelector('svg.mini-map');
    expect(sourceSvg.style.opacity).toBeFalsy();
    fireEvent.mouseEnter(wrapper);
    // Still no inline opacity / transition after overlay opens.
    expect(sourceSvg.style.opacity).toBeFalsy();
    expect(sourceSvg.style.transition).toBeFalsy();
  });

  it('inner overlay does NOT render a plasmid-name <text> (FIX-2 follow-up — pushed bbox past column)', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay-name"]')).toBeNull();
  });

  it('mouseleave → 250 ms hover-bridge then 200 ms grow-out → portal unmounts', async () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, baseElement } = render(
        <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
      );
      const wrapper = getByTestId('plasmid-mini-map');
      fireEvent.mouseEnter(wrapper);
      expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeTruthy();
      fireEvent.mouseLeave(wrapper);
      // 200 ms in: still mounted, hover-bridge timer pending.
      act(() => { vi.advanceTimersByTime(200); });
      expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeTruthy();
      // 251 ms total: bridge fired, animation-out started, DOM still mounted.
      act(() => { vi.advanceTimersByTime(60); });
      expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeTruthy();
      // 460 ms total: 250 + 200 elapsed, unmount timer fires.
      act(() => { vi.advanceTimersByTime(220); });
      expect(baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
