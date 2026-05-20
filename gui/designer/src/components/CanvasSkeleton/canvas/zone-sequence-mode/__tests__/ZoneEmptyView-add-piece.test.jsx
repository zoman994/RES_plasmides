/**
 * AV-K6 — Sequence view empty: click → AddPiecePopover.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ZoneEmptyView from '../ZoneEmptyView';

describe('AV-K6 — ZoneEmptyView add piece popover', () => {
  it('click on empty area opens AddPiecePopover', () => {
    render(<ZoneEmptyView sources={[]} dispatch={vi.fn()} zoneId="zn01" />);
    expect(screen.queryByTestId('zone-seq-empty-add-zn01')).toBeNull();
    fireEvent.click(screen.getByTestId('zone-seq-empty'));
    expect(screen.getByTestId('zone-seq-empty-add-zn01')).toBeTruthy();
  });

  it('picking a kind dispatches OPEN_EDITOR_ASSEMBLY_TAB + REQUEST_ASSEMBLY_ADD_KIND', () => {
    const dispatch = vi.fn();
    render(<ZoneEmptyView sources={[]} dispatch={dispatch} zoneId="zn01" />);
    fireEvent.click(screen.getByTestId('zone-seq-empty'));
    fireEvent.click(screen.getByTestId('zone-seq-empty-add-zn01-snippet'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: 'zn01',
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REQUEST_ASSEMBLY_ADD_KIND', zoneId: 'zn01', kind: 'snippet',
    });
  });

  it('clicking on a source button does not open popover', () => {
    const dispatch = vi.fn();
    const sources = [{ id: 'c01', name: 'pUC19', sequence: 'ATGC' }];
    render(<ZoneEmptyView sources={sources} dispatch={dispatch} zoneId="zn01" />);
    fireEvent.click(screen.getByTestId('zone-seq-source'));
    expect(screen.queryByTestId('zone-seq-empty-add-zn01')).toBeNull();
  });

  it('source double-click still dispatches OPEN_EDITOR_FOR_CONTAINER', () => {
    const dispatch = vi.fn();
    const sources = [{ id: 'c01', name: 'pUC19', sequence: 'ATGC' }];
    render(<ZoneEmptyView sources={sources} dispatch={dispatch} zoneId="zn01" />);
    fireEvent.doubleClick(screen.getByTestId('zone-seq-source'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_EDITOR_FOR_CONTAINER', containerId: 'c01', zoneId: 'zn01',
    });
  });
});
