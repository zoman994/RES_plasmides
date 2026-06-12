/**
 * AssemblyDagView — M-WORKSPACE DAG view tab. Hosts the shared ZoneGraphContent
 * (source→PCR→frag→assembly→product) for one assembly, full-area, scrollable.
 * Op click → op editor drill-in (OPEN_EDITOR_OP_TAB); container dbl-click →
 * view-only editor; single click → highlight. (Wheel-zoom parity with
 * CanvasLayoutView is a later polish — overflow:auto scroll is enough.)
 */
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { nodeListInZone } from '../lib/zone-model';
import ZoneGraphContent from '../canvas/ZoneGraphContent';

const GRID = 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)';

export default function AssemblyDagView({ zoneId }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const { containers, operations } = nodeListInZone(state, zoneId);
  const empty = containers.length === 0 && operations.length === 0;

  return (
    <div
      data-testid="assembly-dag-view"
      style={{
        flex: 1, minHeight: 0, overflow: 'auto', position: 'relative',
        background: 'var(--surface-base, #fafaf9)',
        backgroundImage: GRID, backgroundSize: '20px 20px',
      }}
    >
      {empty ? (
        <div style={{
          padding: '32px 16px', textAlign: 'center', fontSize: 12.5,
          color: 'var(--text-tertiary)',
        }}>
          Граф появится после «Реализовать» во вкладке Sequence.
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          <ZoneGraphContent
            containers={containers}
            operations={operations}
            highlightedId={state.highlightedContainerId}
            onContainerClick={(id) => actions.setHighlight && actions.setHighlight(id)}
            onContainerDoubleClick={(id) => actions.openEditorViewOnly && actions.openEditorViewOnly(id)}
            onOperationClick={(op) => { if (op && op.id && actions.openEditorOpTab) actions.openEditorOpTab(op.id); }}
          />
        </div>
      )}
    </div>
  );
}
