/**
 * ZoneAssembledView — T7 K8 (§5.4). Ordered horizontal strip of
 * attached pieces with derived implicit junctions between them; a side
 * palette for detached pieces; a Y-fork when the zone has N≥2 finals.
 */
import React, { Fragment } from 'react';
import { STRINGS } from '../../../../lib/strings';
import PieceCard from './PieceCard';
import ImplicitJunction from './ImplicitJunction';
import BranchingVisual from './BranchingVisual';
import JunctionControl from '../JunctionControl';
import { onPieceDragStart, onStripDrop } from './piece-drag';
import { selectPieceSequence } from '../../store/selectors-pieces';
import { selectAttachedPieces, selectDetachedPieces } from './zone-mode-state';
import { pairKeyFor } from '../../lib/junction-derive';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

export default function ZoneAssembledView({
  state, dispatch, zoneId, finals,
}) {
  const attached = selectAttachedPieces(state, zoneId);
  const detached = selectDetachedPieces(state, zoneId);
  const multi = (finals || []).length > 1;
  // J6b — stored per-junction config + the open JunctionControl target.
  const zone = (state.zones || []).find((z) => z.id === zoneId);
  const junctions = (zone && zone.junctions) || {};
  const picker = state.junctionPicker && state.junctionPicker.zoneId === zoneId
    ? state.junctionPicker : null;

  return (
    <div
      data-testid="zone-seq-assembled"
      style={{
        height: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflow: 'auto',
      }}
    >
      {multi && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {S.finalSelector} {finals.length}
        </div>
      )}
      <div
        data-testid="zone-seq-strip-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onStripDrop(e, dispatch, zoneId)}
        style={{
          display: 'flex', alignItems: 'center', gap: 0, minHeight: 56,
          padding: '4px 6px', borderRadius: 'var(--radius-md)',
          background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
        }}
      >
        {attached.map((p, idx) => (
          <Fragment key={p.id}>
            <PieceCard
              piece={p}
              sequence={selectPieceSequence(state, p.id)}
              variant="strip"
              draggable
              onDragStart={(e) => onPieceDragStart(e, p.id)}
              state={state}
              dispatch={dispatch}
            />
            {idx < attached.length - 1 && (
              <ImplicitJunction
                fromPiece={p}
                toPiece={attached[idx + 1]}
                method={(junctions[pairKeyFor(p.id, attached[idx + 1].id)] || {}).method}
                onClick={() => dispatch
                  && dispatch({
                    type: 'OPEN_JUNCTION_METHOD_PICKER',
                    zoneId,
                    fromPieceId: p.id,
                    toPieceId: attached[idx + 1].id,
                  })}
              />
            )}
          </Fragment>
        ))}
      </div>

      {detached.length > 0 && (
        <div data-testid="zone-seq-detached" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{S.detachedHint}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detached.map((p) => (
              <PieceCard
                key={p.id}
                piece={p}
                sequence={selectPieceSequence(state, p.id)}
                draggable
                onDragStart={(e) => onPieceDragStart(e, p.id)}
                state={state}
                dispatch={dispatch}
              />
            ))}
          </div>
        </div>
      )}

      {multi && <BranchingVisual finals={finals} state={state} zoneId={zoneId} />}

      {/* J6b — clicking a strip junction opens JunctionControl for that
          pairKey; it edits the live zone.junctions config via
          SET_BOUNDARY_OVERLAP and closes via CLOSE_JUNCTION_PICKER. */}
      {picker && (
        <JunctionControl
          pairKey={picker.pairKey}
          config={junctions[picker.pairKey]}
          onChange={(patch) => dispatch && dispatch({
            type: 'SET_BOUNDARY_OVERLAP', zoneId, pairKey: picker.pairKey, ...patch,
          })}
          onClose={() => dispatch && dispatch({ type: 'CLOSE_JUNCTION_PICKER' })}
        />
      )}
    </div>
  );
}
