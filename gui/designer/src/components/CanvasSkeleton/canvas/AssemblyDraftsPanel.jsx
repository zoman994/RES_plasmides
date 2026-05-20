/**
 * AssemblyDraftsPanel — floating canvas panel listing the project's
 * assemblies. Toggle «📋 Сборки (N)». Per-card: Open (editor tab) +
 * Delete. «+ Новая сборка» creates one.
 *
 * V82 (17.05.2026): rewritten ZONE-based. Post-T6 the «сборка» is a
 * zone (containers/pieces/operations grouped by zoneId), not the legacy
 * state.assemblyDrafts slice — which is empty for new projects (T6
 * migrated drafts→zones), so the seeded default zone «Сборка 1» was
 * invisible in the counter. The panel now reflects state.zones; Open
 * routes the zone id through openEditorAssemblyTab (T6 dual-resolve in
 * AssemblyModeShell). Pin/Unpin dropped — a zone is always an on-canvas
 * frame, so it had no meaning.
 */
import { useState } from 'react';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { selectAllZones } from '../store/selectors-zones';
import { nodeListInZone } from '../lib/zone-model';
import { buildAssemblyZoneAction } from './assembly-zone-create';

function zoneNodeCount(state, zoneId) {
  const { containers, pieces, operations } = nodeListInZone(state, zoneId);
  return containers.length + pieces.length + operations.length;
}

export default function AssemblyDraftsPanel() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const [open, setOpen] = useState(false);
  const zones = selectAllZones(state);

  // PC-K6 (SPEC_PROJECT_CANVAS_CLEANUP §4.4): hide the «📋 Сборки (N)»
  // toggle when there are no zones — zero-count counter is UI noise on
  // an empty project. The «+ Новая сборка» entry-point still exists via
  // the dedicated «+ Сборка» button (CanvasSkeleton/index.jsx).
  if (zones.length === 0) return null;

  // Unified with the bottom-right «+ Сборка» button (Игорь 18-19.05.2026
  // «Только зона» + regression-fix) — single CREATE_ZONE path, then
  // open its assembly editor so the colored-segment build window is
  // actually reachable (caller-side zone id from buildAssemblyZoneAction).
  const createZone = () => {
    const a = buildAssemblyZoneAction(state);
    actions.zoneDispatch(a);
    actions.openEditorAssemblyTab(a.zone.id);
  };

  return (
    // Игорь 17.05.2026 — moved from top-left to bottom-right, stacked
    // above the +Сборка/+Операция buttons. column-reverse → toggle sits
    // at the bottom (anchor); the expanded panel grows UPWARD so it
    // stays on-screen.
    <div
      style={{
        position: 'absolute',
        bottom: 108,
        right: 24,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'flex-end',
      }}
    >
      <button
        type="button"
        data-testid="assembly-drafts-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Сборки проекта"
        style={{
          padding: '6px 12px',
          background: 'var(--surface-1)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(28,25,23,0.12)',
        }}
      >
        📋 Сборки ({zones.length})
      </button>

      {open && (
        <div
          data-testid="assembly-drafts-panel"
          style={{
            marginBottom: 6,
            width: 248,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(28,25,23,0.16)',
            padding: 8,
          }}
        >
          <button
            type="button"
            data-testid="assembly-drafts-new"
            onClick={createZone}
            style={{
              width: '100%',
              padding: '6px 10px',
              marginBottom: 6,
              background: 'var(--accent-500, #b85c3e)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >+ Новая сборка</button>

          {zones.length === 0 && (
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: 8 }}>
              Сборок пока нет.
            </div>
          )}

          {zones.map((z) => {
            const count = zoneNodeCount(state, z.id);
            return (
              <div
                key={z.id}
                data-testid="assembly-draft-card"
                data-zone-id={z.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  marginBottom: 5,
                  background: 'var(--surface-2)',
                }}
              >
                <button
                  type="button"
                  data-testid="assembly-draft-card-open"
                  onClick={() => actions.openEditorAssemblyTab(z.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    padding: 0,
                    marginBottom: 2,
                  }}
                >🧬 {z.name}</button>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  {count} узл.
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    data-testid="assembly-draft-card-delete"
                    onClick={() => actions.zoneDispatch({ type: 'REMOVE_ZONE', zoneId: z.id })}
                    style={{ ...cardBtn, color: 'var(--accent-500, #b85c3e)' }}
                  >Удалить</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const cardBtn = {
  flex: 1,
  fontSize: 10.5,
  padding: '3px 6px',
  background: 'var(--surface-1)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3,
  cursor: 'pointer',
};
