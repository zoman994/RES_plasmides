/**
 * overview-tab-topology.test.jsx — editable topology toggle in the workspace
 * Overview. Lets a biolog fix an import that guessed linear↔circular wrong.
 * Rendered only when onUpdateTopology is provided (workspace); absent in the
 * Importer (its MetaColumn owns topology there).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import OverviewTab from '../tabs/OverviewTab';
import { useStore } from '../../../../store';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: () => <div data-testid="mock-mini-map" />,
}));

beforeEach(() => { try { useStore.setState({ libraryEntries: {} }); } catch { /* */ } });
afterEach(cleanup);

const ITEM = {
  id: 'e1', name: 'pUC19', length: 200, sequence: 'A'.repeat(200),
  topology: 'circular', annotations: [],
};

describe('OverviewTab — topology toggle', () => {
  it('renders the toggle (current active) when onUpdateTopology provided; switching calls it', () => {
    const onUpdateTopology = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTopology={onUpdateTopology} />);
    expect(screen.getByTestId('overview-topology-toggle')).toBeTruthy();
    expect(screen.getByTestId('overview-topology-circular').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('overview-topology-linear').getAttribute('data-active')).toBe('false');
    fireEvent.click(screen.getByTestId('overview-topology-linear'));
    expect(onUpdateTopology).toHaveBeenCalledWith('linear');
  });

  it('clicking the already-active topology is a no-op', () => {
    const onUpdateTopology = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTopology={onUpdateTopology} />);
    fireEvent.click(screen.getByTestId('overview-topology-circular'));
    expect(onUpdateTopology).not.toHaveBeenCalled();
  });

  it('no toggle when onUpdateTopology absent', () => {
    render(<OverviewTab item={ITEM} />);
    expect(screen.queryByTestId('overview-topology-toggle')).toBeNull();
  });
});
