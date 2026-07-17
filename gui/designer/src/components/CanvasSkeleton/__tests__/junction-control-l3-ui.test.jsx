/**
 * junction-control-l3-ui.test.jsx — JUNCTION layer 3 step 2 (J6/J6b).
 * JunctionControl edits the live zone.junctions config, with reducer coverage
 * for the OPEN/CLOSE_JUNCTION_PICKER actions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { pairKeyFor } from '../lib/junction-derive';
import JunctionControl from '../canvas/JunctionControl';

afterEach(cleanup);

const SRC = {
  id: 'src-u', kind: 'molecule', name: 's',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
  annotations: [], topology: { circular: false },
};
function srcPiece(id, start, end, order) {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['src-u'],
    ranges: [{ sourceId: 'src-u', start, end, orientation: 'forward' }],
    acquisitionMethod: 'undefined', zoneId: 'zn-1', order, createdAt: order + 1, updatedAt: order + 1,
  };
}
const PK = pairKeyFor('pc1', 'pc2');
function twoPieceState() {
  const base = buildInitialState();
  const s = {
    ...base,
    containers: [...base.containers, SRC],
    zones: [{ id: 'zn-1', name: 'Z', viewMode: 'sequence', topology: { circular: false }, bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [srcPiece('pc1', 0, 32, 0), srcPiece('pc2', 32, 64, 1)],
  };
  return skeletonReducer(s, { type: 'SET_PIECE_COLOR', pieceId: 'pc1', color: '#123456' });
}

// ─── zone-slice: OPEN / CLOSE_JUNCTION_PICKER (J6b) ─────────────────────────

describe('JUNCTION L3 — OPEN/CLOSE_JUNCTION_PICKER handler', () => {
  it('OPEN sets junctionPicker {zoneId, pairKey}; CLOSE clears it', () => {
    let s = twoPieceState();
    expect(s.junctionPicker).toBeNull();
    s = skeletonReducer(s, {
      type: 'OPEN_JUNCTION_METHOD_PICKER', zoneId: 'zn-1', fromPieceId: 'pc1', toPieceId: 'pc2',
    });
    expect(s.junctionPicker).toEqual(expect.objectContaining({ zoneId: 'zn-1', pairKey: PK }));
    s = skeletonReducer(s, { type: 'CLOSE_JUNCTION_PICKER' });
    expect(s.junctionPicker).toBeNull();
  });

  it('OPEN on an unknown zone is a no-op', () => {
    const s = skeletonReducer(twoPieceState(), {
      type: 'OPEN_JUNCTION_METHOD_PICKER', zoneId: 'nope', fromPieceId: 'pc1', toPieceId: 'pc2',
    });
    expect(s.junctionPicker).toBeNull();
  });
});

// ─── JunctionControl — evolution of JunctionPopover on zone.junctions ───────

describe('JUNCTION L3 — JunctionControl (J6)', () => {
  it('renders JunctionPopover; the config method maps to the active junction.kind', () => {
    // JC-1 — the ромб is an INTERNAL boundary → only overlap / re_ligation are
    // offered. restriction (engine) → re_ligation (junction.kind) active.
    render(<JunctionControl pairKey={PK} config={{ method: 'restriction', overlapTarget: 'right', overlapLength: 4 }} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('junction-popover')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-kind-re_ligation').getAttribute('data-active')).toBe('true');
  });

  it('picking a method maps junction.kind → engine method on onChange (snaps params, JC-4)', () => {
    const onChange = vi.fn();
    render(<JunctionControl pairKey={PK} config={{ method: 'overlap_pcr', overlapTarget: 'right', overlapLength: 30 }} onChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('junction-popover-kind-re_ligation'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ method: 'restriction' }));
  });

  it('manual config shows the ВРУЧНУЮ status; reset sends autoMode:auto', () => {
    const onChange = vi.fn();
    render(<JunctionControl pairKey={PK} config={{ method: 'overlap_pcr', overlapTarget: 'right', overlapLength: 30, autoMode: 'manual' }} onChange={onChange} onClose={vi.fn()} />);
    expect(screen.getByTestId('junction-popover-status').getAttribute('data-status')).toBe('manual');
    fireEvent.click(screen.getByTestId('junction-popover-reset-auto'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoMode: 'auto', method: 'overlap_pcr' }));
  });
});
