/**
 * ZonePaletteView — T7 K8 (§5.3). Free pieces as a column of cards +
 * a horizontal strip drop-target; drag a card onto it → ATTACH.
 */
import React from 'react';
import { STRINGS } from '../../../../lib/strings';
import PieceCard from './PieceCard';
import { onPieceDragStart, onStripDrop } from './piece-drag';
import { selectPieceSequence } from '../../store/selectors-pieces';

const S = STRINGS.canvasSkeleton.zones.sequenceMode;

export default function ZonePaletteView({ pieces, state, dispatch, zoneId }) {
  const sorted = (pieces || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return (
    <div
      data-testid="zone-seq-palette"
      style={{
        height: '100%', display: 'flex', gap: 10, padding: 10, overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 110 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{S.palette}:</div>
        {sorted.map((p) => (
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
      <div
        data-testid="zone-seq-strip-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onStripDrop(e, dispatch, zoneId, 0)}
        style={{
          flex: 1,
          minWidth: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-tertiary)',
          fontSize: 11,
          textAlign: 'center',
          padding: 8,
        }}
      >
        {S.dragHere}
      </div>
    </div>
  );
}
