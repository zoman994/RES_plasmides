/**
 * AV-K3 — Frame view «+» button → AddPiecePopover.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZoneFrame from '../ZoneFrame';

const ZONE = {
  id: 'zn01',
  name: 'Сборка 1',
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  collapsed: false,
  viewMode: 'graph',
  notes: null,
};

function commonProps(over = {}) {
  return {
    zone: ZONE,
    nodeCount: 0,
    onOpenAssembly: vi.fn(),
    onAddPiece: vi.fn(),
    ...over,
  };
}

describe('AV-K3 — ZoneFrame add piece button', () => {
  it('renders «+» button in header', () => {
    render(<ZoneFrame {...commonProps()} />);
    expect(screen.getByTestId('zone-add-piece-zn01')).toBeTruthy();
  });

  it('click on «+» opens AddPiecePopover', () => {
    render(<ZoneFrame {...commonProps()} />);
    expect(screen.queryByTestId('zone-add-piece-popover-zn01')).toBeNull();
    fireEvent.click(screen.getByTestId('zone-add-piece-zn01'));
    expect(screen.getByTestId('zone-add-piece-popover-zn01')).toBeTruthy();
  });

  it('clicking a popover item calls onAddPiece(zoneId, kind)', () => {
    const onAddPiece = vi.fn();
    render(<ZoneFrame {...commonProps({ onAddPiece })} />);
    fireEvent.click(screen.getByTestId('zone-add-piece-zn01'));
    fireEvent.click(screen.getByTestId('zone-add-piece-popover-zn01-plasmid'));
    expect(onAddPiece).toHaveBeenCalledWith('zn01', 'plasmid');
    // Popover closes after pick.
    expect(screen.queryByTestId('zone-add-piece-popover-zn01')).toBeNull();
  });

  it('second click toggles popover off', () => {
    render(<ZoneFrame {...commonProps()} />);
    fireEvent.click(screen.getByTestId('zone-add-piece-zn01'));
    expect(screen.getByTestId('zone-add-piece-popover-zn01')).toBeTruthy();
    fireEvent.click(screen.getByTestId('zone-add-piece-zn01'));
    expect(screen.queryByTestId('zone-add-piece-popover-zn01')).toBeNull();
  });
});
