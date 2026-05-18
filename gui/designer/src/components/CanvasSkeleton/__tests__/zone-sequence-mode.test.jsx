/**
 * zone-sequence-mode.test.jsx — T7 K7/K8.
 *
 * Inline sequence-mode rendering: ZoneSequenceMode routes the 3-state
 * machine (empty / palette / assembled) into Empty/Palette/Assembled
 * views; PieceCard / ImplicitJunction / BranchingVisual building blocks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import ZoneSequenceMode from '../canvas/zone-sequence-mode';
import PieceCard from '../canvas/zone-sequence-mode/PieceCard';
import ImplicitJunction from '../canvas/zone-sequence-mode/ImplicitJunction';
import { PIECE_MIME } from '../canvas/zone-sequence-mode/piece-drag';

afterEach(cleanup);

const C = { id: 'c1', name: 'pUC', zoneId: 'zn-1', sequence: 'AAAACCCCGGGGTTTT' };
function piece(id, order, extra = {}) {
  return {
    id, zoneId: 'zn-1', kind: 'sourced', name: id, color: '#8b5cf6',
    sourceIds: ['c1'], ranges: [{ sourceId: 'c1', start: 0, end: 8, orientation: 'forward' }],
    acquisitionMethod: 'undefined', order, createdAt: order == null ? 9 : order, ...extra,
  };
}
const zone = { id: 'zn-1', name: 'Z', bounds: { x: 0, y: 0, width: 700, height: 400 } };
function mkState(pieces, containers = [C], junctions = []) {
  return { containers, pieces, junctions, zones: [zone] };
}

describe('T7 K7 — ZoneSequenceMode state routing', () => {
  it('empty: no pieces → ZoneEmptyView with hint + source list', () => {
    render(<ZoneSequenceMode zone={zone} state={mkState([])} dispatch={vi.fn()} />);
    expect(screen.getByTestId('zone-seq-empty')).toBeTruthy();
    expect(screen.getByTestId('zone-seq-source')).toBeTruthy();
    expect(screen.getByText(/pUC/)).toBeTruthy();
  });

  it('palette: pieces all order=null → ZonePaletteView with draggable cards', () => {
    render(
      <ZoneSequenceMode
        zone={zone}
        state={mkState([piece('a', null), piece('b', null)])}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByTestId('zone-seq-palette')).toBeTruthy();
    const cards = screen.getAllByTestId('zone-seq-piece-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('draggable')).toBe('true');
  });

  it('assembled: ≥1 ordered piece → strip + implicit junction between two', () => {
    render(
      <ZoneSequenceMode
        zone={zone}
        state={mkState([piece('a', 0), piece('b', 1)])}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByTestId('zone-seq-assembled')).toBeTruthy();
    expect(screen.getAllByTestId('zone-seq-piece-card')).toHaveLength(2);
    expect(screen.getAllByTestId('zone-seq-junction')).toHaveLength(1);
  });

  it('assembled: detached pieces shown in a side palette', () => {
    render(
      <ZoneSequenceMode
        zone={zone}
        state={mkState([piece('a', 0), piece('free', null)])}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByTestId('zone-seq-detached')).toBeTruthy();
  });
});

describe('T7 K8 — palette drag dispatches ATTACH_PIECE_TO_ASSEMBLY', () => {
  it('drop a palette card onto the strip target → ATTACH', () => {
    const dispatch = vi.fn();
    render(
      <ZoneSequenceMode zone={zone} state={mkState([piece('a', null)])} dispatch={dispatch} />,
    );
    const target = screen.getByTestId('zone-seq-strip-drop');
    const store = { [PIECE_MIME]: 'a' };
    const dataTransfer = {
      getData: (k) => store[k] || '',
      setData: (k, v) => { store[k] = v; },
      types: { includes: (k) => k in store },
    };
    fireEvent.drop(target, { dataTransfer, clientX: 0 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'a', zoneId: 'zn-1' }),
    );
  });
});

describe('T7 K8 — PieceCard + ImplicitJunction', () => {
  it('PieceCard shows name + size (нт) + functional label', () => {
    render(
      <PieceCard
        piece={{ id: 'p', name: 'prom', color: '#abc', functionalLabel: 'promoter' }}
        sequence="ACGTACGT"
      />,
    );
    const card = screen.getByTestId('zone-seq-piece-card');
    expect(within(card).getByText('prom')).toBeTruthy();
    expect(within(card).getByText(/8/)).toBeTruthy();
    expect(within(card).getByText('promoter')).toBeTruthy();
  });

  it('ImplicitJunction derives method + fires onClick', () => {
    const onClick = vi.fn();
    render(
      <ImplicitJunction
        fromPiece={{ acquisitionMethod: 'pcr' }}
        toPiece={{ acquisitionMethod: 'pcr' }}
        onClick={onClick}
      />,
    );
    const j = screen.getByTestId('zone-seq-junction');
    expect(j.getAttribute('data-method')).toBe('overlap-pcr');
    fireEvent.click(j);
    expect(onClick).toHaveBeenCalled();
  });

  it('ImplicitJunction restriction+restriction → ligation; mixed → gibson', () => {
    const { rerender } = render(
      <ImplicitJunction
        fromPiece={{ acquisitionMethod: 'restriction' }}
        toPiece={{ acquisitionMethod: 'restriction' }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('zone-seq-junction').getAttribute('data-method')).toBe('ligation');
    rerender(
      <ImplicitJunction
        fromPiece={{ acquisitionMethod: 'pcr' }}
        toPiece={{ acquisitionMethod: 'restriction' }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('zone-seq-junction').getAttribute('data-method')).toBe('gibson');
  });
});

describe('T7 K8 — BranchingVisual when finals > 1', () => {
  it('multi-final zone renders the branching visual', () => {
    const finals = [
      { id: 'f1', name: 'P/1', zoneId: 'zn-1' },
      { id: 'f2', name: 'P/2', zoneId: 'zn-1' },
    ];
    const state = {
      // C is the piece's source — not in the zone (DEC-CANVAS-4T-04),
      // so only f1/f2 are zone finals.
      containers: [{ ...C, zoneId: null }, ...finals],
      pieces: [piece('a', 0)],
      junctions: [],
      zones: [zone],
    };
    render(<ZoneSequenceMode zone={zone} state={state} dispatch={vi.fn()} />);
    expect(screen.getByTestId('zone-seq-branching')).toBeTruthy();
    expect(screen.getAllByTestId('zone-seq-branch')).toHaveLength(2);
  });
});
