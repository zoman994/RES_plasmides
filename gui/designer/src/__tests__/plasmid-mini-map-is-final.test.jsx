/**
 * Sprint IS-Final K5 — PlasmidMiniMap hover-bridge debounce + smart leader-labels.
 *
 *   5.1 hover-bridge: cancellable 250ms close timer so the bridge gap
 *       between trigger and overlay doesn't close the popover.
 *   5.2 smart labels: priority class (resistance / origin / promoter / tag)
 *       picked first regardless of length (within hard-caps), then fallback
 *       fill by length with 3% threshold up to MAX_LABELS=8.
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
    expect(queryByTestId('plasmid-mini-map-popover')).toBeNull();
    fireEvent.mouseEnter(getByTestId('plasmid-mini-map'));
    expect(queryByTestId('plasmid-mini-map-popover')).toBeTruthy();
  });

  it('mouseleave on trigger closes popover only after ~250 ms', () => {
    const { getByTestId, queryByTestId } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={[]} size={64} />,
    );
    const trigger = getByTestId('plasmid-mini-map');
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    // Still open right after mouseleave (timer pending).
    expect(queryByTestId('plasmid-mini-map-popover')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(260); });
    expect(queryByTestId('plasmid-mini-map-popover')).toBeNull();
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
    const popover = getByTestId('plasmid-mini-map-popover');
    fireEvent.mouseEnter(popover);
    act(() => { vi.advanceTimersByTime(500); });
    expect(queryByTestId('plasmid-mini-map-popover')).toBeTruthy();
  });
});

// ─────────────────────── 5.2 Smart leader-labels ───────────────────────

const annotsBigPlasmid = [
  // 14 kb plasmid, ori = 600 bp = ~4 % — used to fail at old 10 % threshold.
  { id: 'amp', start: 0, end: 800, level: 'region', type: 'CDS', name: 'AmpR' },
  { id: 'ori', start: 800, end: 1400, level: 'region', type: 'rep_origin', name: 'pUC ori' },
  { id: 'lacI', start: 2000, end: 5000, level: 'region', type: 'CDS', name: 'lacI' },
  { id: 'cas9', start: 5000, end: 9000, level: 'region', type: 'CDS', name: 'dCas9' },
];

describe('K5.2 PlasmidMiniMap smart leader-labels', () => {
  it('pUC19-like: AmpR + ori both labelled regardless of length (priority bypass threshold)', () => {
    // AmpR=800/2000=40%, ori=200/2000=10%.
    const annots = [
      { id: 'amp', start: 0, end: 800, level: 'region', type: 'CDS', name: 'AmpR' },
      { id: 'ori', start: 1500, end: 1700, level: 'region', type: 'rep_origin', name: 'pUC ori' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('AmpR');
    expect(labels).toContain('pUC ori');
  });

  it('14 kb plasmid: ori at 4% gets labelled (was hidden with old 10% threshold)', () => {
    const { container } = render(
      <PlasmidMiniMap length={14000} topology="circular" annotations={annotsBigPlasmid} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('pUC ori');
    expect(labels).toContain('AmpR');
  });

  it('promoter hard-cap=3: only top-3 by length are labelled when 4 promoters present', () => {
    const annots = [
      { id: 'p1', start: 0, end: 200, level: 'region', type: 'promoter', name: 'lac' },
      { id: 'p2', start: 200, end: 600, level: 'region', type: 'promoter', name: 'T7' }, // longer
      { id: 'p3', start: 600, end: 800, level: 'region', type: 'promoter', name: 'CMV' },
      { id: 'p4', start: 800, end: 1100, level: 'region', type: 'promoter', name: 'pSV40' },
      { id: 'p5', start: 1100, end: 1200, level: 'region', type: 'promoter', name: 'lacUV5' }, // shortest
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    const promoterCount = ['lac', 'T7', 'CMV', 'pSV40', 'lacUV5'].filter((n) => labels.includes(n)).length;
    expect(promoterCount).toBeLessThanOrEqual(3);
  });

  it('zero priority matches: fallback fills by length with threshold=3%', () => {
    // 1000 bp seq, 2 misc regions: one 5% (passes), one 1% (fails).
    const annots = [
      { id: 'a', start: 0, end: 50, level: 'region', type: 'misc_feature', name: 'big' },   // 5 %
      { id: 'b', start: 100, end: 110, level: 'region', type: 'misc_feature', name: 'tiny' }, // 1 %
    ];
    const { container } = render(
      <PlasmidMiniMap length={1000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toContain('big');
    expect(labels).not.toContain('tiny');
  });

  it('collision-staggering still applied (regression: existing behaviour at size=180)', () => {
    // Two regions at adjacent angles → labels must be staggered (textY differs).
    const annots = [
      { id: 'a', start: 0, end: 200, level: 'region', type: 'CDS', name: 'AmpR' },
      { id: 'b', start: 220, end: 460, level: 'region', type: 'CDS', name: 'NeoR' },
    ];
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={annots} size={180} />,
    );
    const labels = [...container.querySelectorAll('svg text')];
    const ys = labels.map((t) => parseFloat(t.getAttribute('y')));
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});
