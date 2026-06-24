/**
 * RC-C1 (Игорь 24.06) — TabBar gains an opt-in «Карта» tab (showMap), used by the
 * assembly product editor to surface the circular plasmid map (PlasmidMapV2).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TabBar from '../TabBar';

afterEach(cleanup);

describe('TabBar — showMap', () => {
  it('showMap=false (default) → no «Карта» tab', () => {
    render(<TabBar activeTab="sequence" onChange={() => {}} showOverview={false} />);
    expect(screen.queryByTestId('importer-tab-map')).toBeNull();
  });

  it('showMap=true → «Карта» tab present + onChange fires', () => {
    const onChange = vi.fn();
    render(<TabBar activeTab="sequence" onChange={onChange} showOverview={false} showMap />);
    const tab = screen.getByTestId('importer-tab-map');
    expect(tab).toBeTruthy();
    fireEvent.click(tab);
    expect(onChange).toHaveBeenCalledWith('map');
  });
});
