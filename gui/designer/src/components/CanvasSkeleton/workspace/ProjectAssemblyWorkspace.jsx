/**
 * ProjectAssemblyWorkspace — M-WORKSPACE. Two-level workspace with a top tab
 * per assembly (AssemblyTabStrip) and a
 * per-assembly view switcher (AssemblyViewTabStrip: Sequence / DAG / Праймеры /
 * Pipeline) + the active (assembly, view) body full-area. Reuses the existing
 * view components (AssemblyModeShell, ZoneGraphContent, the primers/pipeline
 * panels). No data-model change — zones still ARE the assemblies.
 */
import { useCallback } from 'react';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { selectAllZones } from '../store/selectors-zones';
import { buildAssemblyZoneAction } from '../canvas/assembly-zone-create';
import { autoGroupPipeline } from '../lib/auto-group-pipeline';
import AssemblyTabStrip from './AssemblyTabStrip';
import AssemblyViewTabStrip from './AssemblyViewTabStrip';
import AssemblyDagView from './AssemblyDagView';
import AssemblyModeShell from '../editor/assembly-mode/AssemblyModeShell';
import AssemblyPrimersPanel from '../editor/assembly-mode/AssemblyPrimersPanel';
import AssemblyPipelinePanel from '../editor/assembly-mode/AssemblyPipelinePanel';

export default function ProjectAssemblyWorkspace() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const zones = selectAllZones(state);

  const createAssembly = useCallback(() => {
    const a = buildAssemblyZoneAction(state);
    actions.zoneDispatch(a);
    actions.setActiveAssembly(a.zone.id);
  }, [state, actions]);

  if (zones.length === 0) {
    return (
      <div
        data-testid="project-assembly-workspace"
        style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: 'var(--surface-1)', color: 'var(--text-secondary)',
        }}
      >
        <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 440 }}>
          Создайте сборку — она появится вкладкой сверху, с видами
          Sequence / DAG / Праймеры / Pipeline.
        </div>
        <button
          type="button"
          data-testid="assembly-workspace-create"
          onClick={createAssembly}
          style={{
            padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', background: 'var(--surface-1)',
            color: 'var(--accent-500, #b85c3e)',
            border: '1px solid var(--accent-500, #b85c3e)',
          }}
        >+ Сборка</button>
      </div>
    );
  }

  // Active assembly = explicit top tab, else the first zone.
  const activeId = (state.activeAssemblyId && zones.some((z) => z.id === state.activeAssemblyId))
    ? state.activeAssemblyId : zones[0].id;
  const view = (state.assemblyViewByZone && state.assemblyViewByZone[activeId]) || 'sequence';

  const onClose = (zoneId) => {
    // A20 (audit) — REMOVE_ZONE is undoable (not in SKIPPED_ACTIONS → Ctrl+Z
    // restores it) and only ORPHANS the inner nodes (they survive as loose
    // containers). The old «Действие необратимо» + implied total destruction
    // were both false and contradicted the reducer's own toast/canonical copy.
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Удалить эту сборку? Узлы внутри станут бесхозными (отменяемо: Ctrl+Z).') : true;
    if (ok) actions.zoneDispatch({ type: 'REMOVE_ZONE', zoneId });
  };

  // Pipeline «Auto-собрать» — apply layer-0 groups (lifted from AssemblyShellBody).
  const onAutomode = () => {
    const zone = (state.zones || []).find((z) => z.id === activeId);
    if (!zone) return;
    const plan = autoGroupPipeline(zone, state);
    for (const g of plan.groups || []) {
      if (g.layer === 0 && Array.isArray(g.pieceIds) && g.pieceIds.length >= 2) {
        actions.createOpGroup(activeId, g.kind, '', g.pieceIds);
      }
    }
  };

  return (
    <div
      data-testid="project-assembly-workspace"
      style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--surface-1)',
      }}
    >
      <AssemblyTabStrip
        zones={zones}
        activeId={activeId}
        onSelect={(id) => actions.setActiveAssembly(id)}
        onCreate={createAssembly}
        onClose={onClose}
      />
      <AssemblyViewTabStrip
        active={view}
        onSelect={(v) => actions.setAssemblyView(activeId, v)}
      />
      <div
        data-testid="assembly-workspace-body"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {view === 'sequence' && <AssemblyModeShell key={activeId} draftId={activeId} embedded />}
        {view === 'dag' && <AssemblyDagView key={activeId} zoneId={activeId} />}
        {view === 'primers' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            <AssemblyPrimersPanel key={activeId} draftId={activeId} />
          </div>
        )}
        {view === 'pipeline' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            <AssemblyPipelinePanel key={activeId} draftId={activeId} zoneId={activeId} onAutomode={onAutomode} />
          </div>
        )}
      </div>
    </div>
  );
}
