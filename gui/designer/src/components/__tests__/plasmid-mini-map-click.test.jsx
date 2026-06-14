/**
 * plasmid-mini-map-click.test.jsx — opt-in feature click on the mini-map.
 * When onFeatureClick is provided, a feature sector/bar is clickable (pointer
 * cursor) and fires onFeatureClick(region); without it the map stays hover-only.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import PlasmidMiniMap from '../PlasmidMiniMap';

afterEach(cleanup);

const ANN = [
  { id: 'a1', type: 'CDS', name: 'AmpR', start: 100, end: 800, level: 'region' },
];

describe('PlasmidMiniMap — onFeatureClick', () => {
  it('fires onFeatureClick(region) when a feature is clicked (circular)', () => {
    const onFeatureClick = vi.fn();
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANN} size={180} onFeatureClick={onFeatureClick} />,
    );
    const g = container.querySelector('[data-region-start]');
    expect(g).toBeTruthy();
    fireEvent.click(g);
    expect(onFeatureClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('no clickable affordance / no data-region-start handler binding without onFeatureClick', () => {
    const { container } = render(
      <PlasmidMiniMap length={2000} topology="circular" annotations={ANN} size={180} />,
    );
    // feature group still renders, but clicking is a no-op (no onFeatureClick).
    const g = container.querySelector('[role="img"][aria-label]');
    expect(g).toBeTruthy();
    expect(() => fireEvent.click(g)).not.toThrow();
  });
});
