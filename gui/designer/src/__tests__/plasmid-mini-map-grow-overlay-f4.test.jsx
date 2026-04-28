/**
 * Sprint Catalog Polish FIX F4 — transparent grow-overlay via React portal.
 *
 * Игорь 28.04.2026 (kickoff Q&A):
 *   - «Всплывающие окна с мапой — их можно сделать тупо прозрачными?»
 *   - «При наведении она как бы увеличивалась … выходить на встречу человеку».
 *   - «Source мини-мап давай как след» (opacity 0.15).
 *   - «Название плазмиды тоже должно отражаться».
 *
 * Verified:
 *   1. Hover on inline mini-map mounts overlay in document.body via createPortal.
 *   2. After requestAnimationFrame the overlay style includes scale(1) opacity 1.
 *   3. Overlay style does NOT include white background / shadow / border.
 *   4. Source mini-map gets opacity: 0.15 while overlay is mounted.
 *   5. Inner overlay PlasmidMiniMap renders <text> with the plasmid name under
 *      the arc.
 *   6. mouseleave → 250 ms hover-bridge → 200 ms grow-out → portal unmounts.
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

  it('overlay style does NOT include bg-white / shadow / border (transparent — Игорь requirement)', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    const overlay = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]');
    const cls = overlay.className || '';
    expect(cls).not.toMatch(/bg-white/);
    expect(cls).not.toMatch(/shadow/);
    expect(cls).not.toMatch(/border/);
    // No inline backgroundColor either.
    expect(overlay.style.background).toBeFalsy();
  });

  it('overlay grows from scale(0.5)/opacity(0) → scale(1)/opacity(1) after rAF (CSS transition)', async () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    // Wait for the rAF that sets overlayActive=true.
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const overlay = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay"]');
    expect(overlay.style.transform).toBe('scale(1)');
    expect(overlay.style.opacity).toBe('1');
    expect(overlay.style.transition).toMatch(/transform 200ms/);
    expect(overlay.style.transition).toMatch(/opacity 200ms/);
  });

  it('source mini-map fades to opacity 0.15 (хвост-след) while overlay is mounted', () => {
    const { getByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    const wrapper = getByTestId('plasmid-mini-map');
    const sourceSvg = wrapper.querySelector('svg.mini-map');
    expect(sourceSvg.style.opacity).toBe('1');
    fireEvent.mouseEnter(wrapper);
    expect(sourceSvg.style.opacity).toBe('0.15');
    expect(sourceSvg.style.transition).toMatch(/opacity 200ms/);
  });

  it('inner overlay (mode=overlay) renders <text> with the plasmid name under the arc', () => {
    const { getByTestId, baseElement } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANNOTS} size={64} name="pUC19" />,
    );
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    const nameText = baseElement.querySelector('[data-testid="plasmid-mini-map-overlay-name"]');
    expect(nameText).toBeTruthy();
    expect(nameText.textContent).toBe('pUC19');
    // F4 paint-order: stroke fill + white halo + drop-shadow on every text in
    // overlay (labels and the name) so they read on any background.
    expect(nameText.getAttribute('text-anchor')).toBe('middle');
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
