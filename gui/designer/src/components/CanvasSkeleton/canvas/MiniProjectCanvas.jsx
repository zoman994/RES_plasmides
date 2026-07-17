/**
 * MiniProjectCanvas — read-only project miniature, top-right of the
 * editor window. F1 M-CANVAS-WINDOW (DEC-CANVAS-WIN-05/06).
 *
 * Keeps the biologist's mental anchor to the canvas while the editor
 * is full-screen. Containers → 8×8 squares (active = accent ring,
 * placeholder = dashed, others faded). Operations → small rotated
 * diamonds. Click a container marker → switch its existing tab or
 * open a new one. Everything else is pointer-events:none.
 *
 * Fixed 200×150, top:60 right:16 — not resizable / draggable in F1
 * (DEC-WIN-06). Kept separate because the compact overview has its own
 * interaction and focus lifecycle.
 */
import { useMemo, useCallback, useState } from 'react';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { deriveActiveContainerId, deriveActiveTab } from '../store/skeleton-state-editor';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';
import { computeGraphPositions } from './canvas-layout';
import { truncateLabel } from '../../../lib/plasmid-label-utils';
import { STRINGS } from '../../../lib/strings';

const VB_W = 200;
const VB_H = 150;
const PAD = 16;
const C_SIZE = 8;
const OP_SIZE = 6;
const LABEL_FONT = 7;

// Halo so the tiny marker labels read over the surface-2 frame and over
// neighbouring markers, on any theme. Same paint-order trick as the
// MiniPlasmidMap V66 labels.
const LABEL_STYLE = {
  paintOrder: 'stroke fill',
  stroke: 'var(--surface-2, #f1ece0)',
  strokeWidth: 2.5,
  fill: 'var(--text-secondary)',
  pointerEvents: 'none',
};

const FRAME_STYLE = {
  position: 'absolute',
  top: 60,
  right: 16,
  width: VB_W,
  height: VB_H,
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  background: 'var(--surface-2)',
  boxShadow: '0 2px 8px rgba(28,25,23,0.10)',
  overflow: 'hidden',
  // V68 — was 2; editor content panels (Protocol/Codon/PrimerOrder/
  // Onboarding) sit at 25–35 and hid the mini-canvas. 40 keeps it always
  // visible above the editor body, still below the shell header (50) and
  // modals/popovers (100+).
  zIndex: 40,
};

// V81 — collapsed-to-icon pill (same top-right anchor as the frame).
const COLLAPSED_STYLE = {
  position: 'absolute',
  top: 60,
  right: 16,
  zIndex: 40,
  width: 30,
  height: 30,
  padding: 0,
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-2)',
  boxShadow: '0 2px 8px rgba(28,25,23,0.10)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// V81 — collapse affordance inside the frame (frame wrapper is
// pointer-events:none, so this re-enables auto + sits above the svg).
function CollapseBtn({ onClick, title }) {
  return (
    <button
      type="button"
      data-testid="mini-canvas-collapse"
      onClick={onClick}
      title={title}
      style={{
        position: 'absolute',
        top: 3,
        right: 3,
        zIndex: 2,
        width: 18,
        height: 18,
        padding: 0,
        lineHeight: 1,
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        background: 'var(--surface-1)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: 13,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      –
    </button>
  );
}

export default function MiniProjectCanvas() {
  const ew = (STRINGS.canvasSkeleton && STRINGS.canvasSkeleton.editorWindow) || {};
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  // V81 — collapsible to an icon when not needed.
  // V91 (21.05.2026) — default `collapsed: true` чтобы развёрнутая
  // мини-канвас не перекрывала правую панель «Праймеры/Границы» +
  // поиск. Биолог разворачивает кликом по иконке 🗺.
  const [collapsed, setCollapsed] = useState(true);
  const activeContainerId = deriveActiveContainerId(state.editorContext);

  const containers = state.containers || [];
  const operations = state.operations || [];
  // A2 / G2 DEC-CANVAS-ASM-24 — pinned assembly drafts as markers.
  const pinnedDrafts = (state.assemblyDrafts || []).filter((d) => d.position);
  const activeTab = deriveActiveTab(state.editorContext);
  const activeDraftId = activeTab?.kind === 'assembly' ? activeTab.assemblyDraftId : null;

  const layout = useMemo(() => {
    let graphPos = {};
    if (state.view === 'graph') {
      try {
        graphPos = computeGraphPositions(containers, state.commits || [], operations) || {};
      } catch { graphPos = {}; }
    }
    const coordOf = (id, fallback) => {
      if (state.view === 'graph' && graphPos[id]) return graphPos[id];
      return state.positions?.[id] || fallback || { x: 0, y: 0 };
    };
    const cPts = containers.map((c) => ({ id: c.id, ...coordOf(c.id, c.position) }));
    const oPts = operations.map((o) => ({ id: o.id, ...coordOf(o.id, o.position) }));
    const aPts = pinnedDrafts.map((d) => ({ id: d.id, x: d.position.x, y: d.position.y }));
    const all = [...cPts, ...oPts, ...aPts];
    if (all.length === 0) return { cPts: [], oPts: [], aPts: [] };
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const project = (p) => ({
      ...p,
      px: PAD + ((p.x - minX) / spanX) * (VB_W - 2 * PAD),
      py: PAD + ((p.y - minY) / spanY) * (VB_H - 2 * PAD),
    });
    return { cPts: cPts.map(project), oPts: oPts.map(project), aPts: aPts.map(project) };
  }, [containers, operations, pinnedDrafts, state.positions, state.view, state.commits]);

  const onAssemblyClick = useCallback((did) => {
    const tab = state.editorContext.tabs.find(
      (t) => t.kind === 'assembly' && t.assemblyDraftId === did,
    );
    if (tab) actions.switchEditorTab(tab.id);
    else actions.openEditorAssemblyTab(did);
  }, [state.editorContext, actions]);

  const onContainerClick = useCallback((cid) => {
    const tab = state.editorContext.tabs.find((t) => t.containerId === cid);
    if (tab) actions.switchEditorTab(tab.id);
    else actions.openEditorTab(cid);
  }, [state.editorContext, actions]);

  // V81 — collapsed: render only the restore icon (after all hooks so
  // hook order stays stable).
  if (collapsed) {
    return (
      <button
        type="button"
        data-testid="mini-canvas-collapsed"
        onClick={() => setCollapsed(false)}
        title={ew.miniCanvasExpand || 'Развернуть карту проекта'}
        style={COLLAPSED_STYLE}
      >
        🗺
      </button>
    );
  }

  const collapseBtn = (
    <CollapseBtn
      onClick={() => setCollapsed(true)}
      title={ew.miniCanvasCollapse || 'Свернуть карту проекта'}
    />
  );

  // R3 — defensive empty branch. ensureGhostPlaceholder normally
  // guarantees ≥1 container, so this is unreachable via UI; kept so
  // the component never throws on an empty project.
  if (containers.length === 0) {
    return (
      <div
        data-testid="mini-canvas-empty"
        style={{
          ...FRAME_STYLE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--text-tertiary, var(--text-secondary))',
          pointerEvents: 'none',
        }}
      >
        {collapseBtn}
        {ew.noContainersHint || 'Нет контейнеров'}
      </div>
    );
  }

  return (
    <div
      data-testid="mini-canvas"
      title={ew.miniCanvasTitle || 'Проект'}
      style={{ ...FRAME_STYLE, pointerEvents: 'none' }}
    >
      {collapseBtn}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={VB_W}
        height={VB_H}
        style={{ display: 'block' }}
      >
        {layout.oPts.map((p) => (
          <rect
            key={p.id}
            data-testid={`mini-canvas-op-${p.id}`}
            x={p.px - OP_SIZE / 2}
            y={p.py - OP_SIZE / 2}
            width={OP_SIZE}
            height={OP_SIZE}
            fill="var(--text-secondary)"
            fillOpacity={0.5}
            transform={`rotate(45 ${p.px} ${p.py})`}
            style={{ pointerEvents: 'none' }}
          />
        ))}
        {(layout.aPts || []).map((p) => {
          const d = pinnedDrafts.find((x) => x.id === p.id);
          const active = p.id === activeDraftId;
          return (
            <rect
              key={p.id}
              data-testid={`mini-canvas-assembly-${p.id}`}
              data-active={active ? 'true' : 'false'}
              x={p.px - C_SIZE / 2}
              y={p.py - C_SIZE / 2}
              width={C_SIZE}
              height={C_SIZE}
              rx={3}
              fill={active ? 'var(--accent-500, #b85c3e)' : 'var(--accent-soft, #daa18a)'}
              fillOpacity={active ? 1 : 0.7}
              stroke="var(--accent-500, #b85c3e)"
              strokeWidth={active ? 2 : 1}
              strokeDasharray="2 1"
              onClick={() => onAssemblyClick(p.id)}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            >
              <title>{`🧬 ${(d && d.name) || 'assembly'}`}</title>
            </rect>
          );
        })}
        {layout.cPts.map((p) => {
          const c = containers.find((x) => x.id === p.id);
          const placeholder = isPlaceholderContainer(c);
          const active = p.id === activeContainerId;
          const fullName = (c && c.name) || ew.placeholderTabLabel || '';
          const labelText = truncateLabel(fullName);
          return (
            <g key={p.id}>
              <rect
                data-testid={`mini-canvas-container-${p.id}`}
                data-active={active ? 'true' : 'false'}
                x={p.px - C_SIZE / 2}
                y={p.py - C_SIZE / 2}
                width={C_SIZE}
                height={C_SIZE}
                rx={1.5}
                fill={active ? 'var(--accent-500, #d97706)' : 'var(--text-secondary)'}
                fillOpacity={active ? 1 : (placeholder ? 0.35 : 0.6)}
                stroke={active ? 'var(--accent-500, #d97706)' : 'none'}
                strokeWidth={active ? 2 : 0}
                strokeDasharray={placeholder ? '2 2' : undefined}
                onClick={() => onContainerClick(p.id)}
                style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              >
                <title>{fullName}</title>
              </rect>
              {/* V68 — small element name under each marker (was only a
                  hover <title>; biolog wants names visible at a glance). */}
              {labelText && (
                <text
                  data-testid="mini-canvas-label"
                  x={p.px}
                  y={p.py + C_SIZE / 2 + LABEL_FONT}
                  fontSize={LABEL_FONT}
                  fontFamily="system-ui, sans-serif"
                  textAnchor="middle"
                  style={LABEL_STYLE}
                  fillOpacity={active ? 1 : 0.85}
                >
                  {labelText}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
