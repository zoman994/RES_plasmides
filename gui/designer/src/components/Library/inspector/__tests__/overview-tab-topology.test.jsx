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

describe('OverviewTab — origin («ноль-точка») picker', () => {
  it('shows the origin picker for a circular plasmid when onApplyOrigin is provided', () => {
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={vi.fn()} />);
    expect(screen.getByTestId('overview-origin')).toBeTruthy();
    expect(screen.getByTestId('overview-origin-input')).toBeTruthy();
    expect(screen.getByTestId('overview-origin-apply')).toBeTruthy();
  });

  it('Apply with a valid position calls onApplyOrigin(pos)', () => {
    const onApplyOrigin = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={onApplyOrigin} />);
    fireEvent.change(screen.getByTestId('overview-origin-input'), { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('overview-origin-apply'));
    expect(onApplyOrigin).toHaveBeenCalledWith(50);
  });

  it('resets the rotation to position 1 after Apply (committed origin → ruler renumbers, no double rotation)', () => {
    const onApplyOrigin = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={onApplyOrigin} />);
    fireEvent.change(screen.getByTestId('overview-origin-input'), { target: { value: '50' } });
    expect(screen.getByTestId('overview-origin-apply').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('overview-origin-apply'));
    expect(onApplyOrigin).toHaveBeenCalledWith(50);
    // origin snaps back to 1 → no leftover preview rotation on the committed data
    expect(screen.getByTestId('overview-origin-input').value).toBe('1');
    expect(screen.getByTestId('overview-origin-apply').disabled).toBe(true);
  });

  it('exposes a rotation control (slider + ◀ ▶) instead of clicking the map', () => {
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={vi.fn()} />);
    expect(screen.getByTestId('overview-origin-rotate')).toBeTruthy();
    expect(screen.getByTestId('overview-origin-prev')).toBeTruthy();
    expect(screen.getByTestId('overview-origin-next')).toBeTruthy();
  });

  it('▶ rotates the plasmid one base forward and enables Apply', () => {
    const onApplyOrigin = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={onApplyOrigin} />);
    expect(screen.getByTestId('overview-origin-apply').disabled).toBe(true); // pos 1
    fireEvent.click(screen.getByTestId('overview-origin-next')); // → 2
    expect(screen.getByTestId('overview-origin-apply').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('overview-origin-apply'));
    expect(onApplyOrigin).toHaveBeenCalledWith(2);
  });

  it('◀ at position 1 wraps to the last base (ring rotation)', () => {
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={vi.fn()} />);
    fireEvent.click(screen.getByTestId('overview-origin-prev')); // 1 → length (200)
    expect(screen.getByTestId('overview-origin-input').value).toBe('200');
  });

  it('moving the rotation slider updates the origin position', () => {
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={vi.fn()} />);
    fireEvent.change(screen.getByTestId('overview-origin-rotate'), { target: { value: '120' } });
    expect(screen.getByTestId('overview-origin-input').value).toBe('120');
  });

  it('Apply is disabled at pos 1 (no-op) and beyond length', () => {
    const onApplyOrigin = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} onApplyOrigin={onApplyOrigin} />);
    // default value is 1 → disabled
    expect(screen.getByTestId('overview-origin-apply').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('overview-origin-apply'));
    expect(onApplyOrigin).not.toHaveBeenCalled();
    // beyond length → still disabled
    fireEvent.change(screen.getByTestId('overview-origin-input'), { target: { value: '999' } });
    expect(screen.getByTestId('overview-origin-apply').disabled).toBe(true);
  });

  it('no origin picker for a LINEAR plasmid', () => {
    render(<OverviewTab item={{ ...ITEM, topology: 'linear' }} onUpdateTopology={vi.fn()} onApplyOrigin={vi.fn()} />);
    expect(screen.queryByTestId('overview-origin')).toBeNull();
  });

  it('no origin picker when onApplyOrigin absent (e.g. Importer host)', () => {
    render(<OverviewTab item={ITEM} onUpdateTopology={vi.fn()} />);
    expect(screen.queryByTestId('overview-origin')).toBeNull();
  });
});
