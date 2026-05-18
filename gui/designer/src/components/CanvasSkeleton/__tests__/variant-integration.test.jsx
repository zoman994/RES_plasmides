/**
 * variant-integration.test.jsx — T9 K16.
 * End-to-end: CREATE_DESIGN_VARIANT through skeletonReducer →
 * ZoneSequenceMode palette shows both pieces with VariantGroupBadge;
 * MATERIALIZE_REACTION clones → BranchingVisual detects 'clones'.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  render, screen, cleanup, act,
} from '@testing-library/react';
import { useReducer } from 'react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import ZoneSequenceMode from '../canvas/zone-sequence-mode';
import BranchingVisual from '../canvas/zone-sequence-mode/BranchingVisual';
import { selectFinalProductsInZone } from '../store/selectors-zones';

afterEach(cleanup);

function seedZonePiece() {
  let s = buildInitialState({ forceEmptyZones: true });
  s = { ...s, containers: [...s.containers, { id: 'cZ', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }] };
  s = skeletonReducer(s, {
    type: 'CREATE_ZONE', zone: { name: 'Z', bounds: { x: 0, y: 0, width: 700, height: 400 } },
  });
  const zid = s.zones[s.zones.length - 1].id;
  s = skeletonReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      kind: 'sourced', name: 'pcA', sourceIds: ['cZ'],
      ranges: [{ sourceId: 'cZ', start: 0, end: 8, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  const pid = s.pieces[s.pieces.length - 1].id;
  s = skeletonReducer(s, { type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid });
  return { s, zid, pid };
}

describe('T9 K16 — CREATE_DESIGN_VARIANT renders grouped badges', () => {
  it('variant → palette shows 2 cards each with a VariantGroupBadge', () => {
    const { s, zid, pid } = seedZonePiece();
    const zone = s.zones.find((z) => z.id === zid);
    function H() {
      const [state, dispatch] = useReducer(skeletonReducer, s);
      return (
        <>
          <button
            type="button"
            data-testid="mk-variant"
            onClick={() => dispatch({ type: 'CREATE_DESIGN_VARIANT', sourcePieceId: pid })}
          >mk
          </button>
          <ZoneSequenceMode zone={zone} state={state} dispatch={dispatch} />
        </>
      );
    }
    render(<H />);
    // before: 1 piece, no badge
    expect(screen.getAllByTestId('zone-seq-piece-card')).toHaveLength(1);
    expect(screen.queryAllByTestId('variant-group-badge')).toHaveLength(0);
    act(() => { screen.getByTestId('mk-variant').click(); });
    expect(screen.getAllByTestId('zone-seq-piece-card')).toHaveLength(2);
    const badges = screen.getAllByTestId('variant-group-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0].getAttribute('title')).toMatch(/Вариант \d+ из 2/);
  });
});

describe('T9 K16 — MATERIALIZE_REACTION → BranchingVisual clones', () => {
  it('zone with 3 clone finals from one executed op → «3 клонов»', () => {
    let s = buildInitialState({ forceEmptyZones: true });
    s = skeletonReducer(s, {
      type: 'CREATE_ZONE', zone: { name: 'ZB', bounds: { x: 0, y: 0, width: 700, height: 400 } },
    });
    const zid = s.zones[s.zones.length - 1].id;
    // a product container in the zone + executed op producing it
    s = {
      ...s,
      containers: [
        ...s.containers,
        { id: 'prod', name: 'gibson-product', sequence: 'ACGTACGT', annotations: [], zoneId: zid },
      ],
      operations: [
        {
          id: 'op1', kind: 'gibson', status: 'executed', outputs: ['prod'],
          inputs: [], inputPieces: [], zoneId: zid, materializedClones: null, params: {},
        },
      ],
      positions: { ...s.positions, prod: { x: 300, y: 200 } },
    };
    s = skeletonReducer(s, {
      type: 'MATERIALIZE_REACTION',
      operationId: 'op1',
      clones: [{ label: 'c1' }, { label: 'c2' }, { label: 'c3' }],
    });
    // place the 2 new clone containers in the zone too (finals must be zoned)
    const cloneIds = s.operations[0].materializedClones.map((c) => c.cloneId);
    s = {
      ...s,
      containers: s.containers.map((c) => (
        cloneIds.includes(c.id) ? { ...c, zoneId: zid } : c
      )),
    };
    expect(s.operations[0].materializedClones).toHaveLength(3);
    expect(s.containers.filter((c) => cloneIds.includes(c.id))).toHaveLength(3);
    // BranchingVisual on the real post-materialize state → 'clones'.
    const finals = selectFinalProductsInZone(s, zid);
    expect(finals.length).toBe(3);
    render(<BranchingVisual finals={finals} state={s} zoneId={zid} />);
    const root = screen.getByTestId('zone-seq-branching');
    expect(root.getAttribute('data-kind')).toBe('clones');
    expect(root.textContent).toMatch(/3 клонов/);
  });
});
