/**
 * ZoneSequenceMode — T7 K7 (§5.1, DEC-T7-01/05). Inline content of a
 * zone-frame when zone.viewMode === 'sequence'. Routes the 3-state
 * machine (empty / palette / assembled) to its sub-view. No editor tab.
 */
import React from 'react';
import {
  selectZoneSequenceState, selectContainersInZone, selectPiecesByZoneId,
} from './zone-mode-state';
import { selectFinalProductsInZone } from '../../store/selectors-zones';
import ZoneEmptyView from './ZoneEmptyView';
import ZonePaletteView from './ZonePaletteView';
import ZoneAssembledView from './ZoneAssembledView';

export default function ZoneSequenceMode({ zone, state, dispatch }) {
  const seqState = selectZoneSequenceState(state, zone.id);
  const layout = (zone.bounds && zone.bounds.width >= 600) ? 'horizontal' : 'vertical';

  return (
    <div
      data-testid="zone-seq-root"
      data-state={seqState}
      data-layout={layout}
      style={{
        height: '100%',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {seqState === 'empty' && (
        <ZoneEmptyView
          sources={selectContainersInZone(state, zone.id)}
          dispatch={dispatch}
          zoneId={zone.id}
        />
      )}
      {seqState === 'palette' && (
        <ZonePaletteView
          pieces={selectPiecesByZoneId(state, zone.id)}
          state={state}
          dispatch={dispatch}
          zoneId={zone.id}
        />
      )}
      {seqState === 'assembled' && (
        <ZoneAssembledView
          state={state}
          dispatch={dispatch}
          zoneId={zone.id}
          finals={selectFinalProductsInZone(state, zone.id)}
        />
      )}
    </div>
  );
}
