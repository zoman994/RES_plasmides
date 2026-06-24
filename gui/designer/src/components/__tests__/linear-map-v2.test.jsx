/**
 * LinearMapV2 — the linear «колбаска» map (Игорь 22.06: «линейная — когда сам
 * входной фрагмент линейный … клик по сайту и выбралось»). Features + clickable
 * RE sites on a horizontal axis; scans circular:false so no phantom origin site.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LinearMapV2 from '../LinearMapV2';

afterEach(cleanup);

// Linear fragment: EcoRI (GAATTC) at 0 and at 26; one CDS feature 6..26.
const SEQ = `GAATTC${'A'.repeat(20)}GAATTC${'T'.repeat(20)}`;
const ANN = [{ id: 'f1', level: 'region', type: 'CDS', name: 'gene', start: 6, end: 26, strand: 1 }];
const frag = [{ sequence: SEQ, annotations: ANN, length: SEQ.length }];

const renderMap = (props = {}) => render(
  <LinearMapV2
    fragments={frag}
    totalBp={SEQ.length}
    topology="linear"
    constructName="pTest"
    reEnzymesFilter={['EcoRI']}
    {...props}
  />,
);

describe('LinearMapV2', () => {
  it('renders the linear map root + a horizontal layout (not a circle)', () => {
    renderMap();
    expect(screen.getByTestId('linear-map-v2')).toBeTruthy();
    // No circular-map artifacts.
    expect(screen.queryByTestId('plasmid-map-v2')).toBeNull();
  });

  it('renders the feature, clickable', () => {
    const onFeatureClick = vi.fn();
    renderMap({ onFeatureClick });
    const feat = screen.getByTestId('linear-map-v2-feature-0');
    fireEvent.click(feat);
    expect(onFeatureClick).toHaveBeenCalled();
  });

  it('draws an RE tick per cut (two EcoRI sites → two ticks, no phantom origin)', () => {
    renderMap();
    expect(screen.getAllByTestId('linear-map-v2-re-site')).toHaveLength(2);
  });

  it('clicking an RE label emits the marker', () => {
    const onReSiteClick = vi.fn();
    renderMap({ onReSiteClick });
    const labels = screen.getAllByTestId(/^linear-map-v2-re-label-/);
    expect(labels.length).toBeGreaterThan(0);
    fireEvent.click(labels[0]);
    expect(onReSiteClick).toHaveBeenCalledWith(expect.objectContaining({ enzyme: 'EcoRI' }));
  });

  it('RE labels are display-only (no pointer) when onReSiteClick is absent', () => {
    renderMap();
    const g = screen.getAllByTestId(/^linear-map-v2-re-label-/)[0];
    expect(g.getAttribute('data-clickable')).toBe('false');
  });
});
