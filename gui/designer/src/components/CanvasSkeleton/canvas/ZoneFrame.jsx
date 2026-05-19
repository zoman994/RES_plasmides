/**
 * ZoneFrame — single Miro-style zone frame (T4 K3, DEC-T4-01..05).
 * DOM/CSS (not SVG). Body has pointer-events:none so clicks fall
 * through to canvas/containers (DEC-T4-04); header + resize handles
 * are interactive. Colours via --zone-* tokens (never raw hex).
 */
import React from 'react';
import { STRINGS } from '../../../lib/strings';
import ZoneSequenceMode from './zone-sequence-mode';
import ZoneLaneDivider from './zone-lane-divider';
import ZoneLinkBadge from './ZoneLinkBadge';
import { selectCrossZoneSourcesForZone } from '../lib/zone-link-resolver';

const Z = STRINGS.canvasSkeleton.zones;
const SM = Z.sequenceMode;
const HEADER_H = 28;
const HANDLE = 12;

function pluralUzel(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'узел';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'узла';
  return 'узлов';
}

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSOR = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};
function handlePos(edge, w, h) {
  const mid = { left: w / 2 - HANDLE / 2, top: h / 2 - HANDLE / 2 };
  const map = {
    nw: { left: -HANDLE / 2, top: -HANDLE / 2 },
    ne: { left: w - HANDLE / 2, top: -HANDLE / 2 },
    sw: { left: -HANDLE / 2, top: h - HANDLE / 2 },
    se: { left: w - HANDLE / 2, top: h - HANDLE / 2 },
    n: { left: mid.left, top: -HANDLE / 2 },
    s: { left: mid.left, top: h - HANDLE / 2 },
    w: { left: -HANDLE / 2, top: mid.top },
    e: { left: w - HANDLE / 2, top: mid.top },
  };
  return map[edge];
}

export default function ZoneFrame({
  zone, nodeCount = 0,
  onDragStart, onResize, onContextMenu, onClickHeader,
  state, dispatch, onToggleViewMode, onFocus, onNavigateToZone,
  onOpenAssembly,
}) {
  const { x, y, width, height } = zone.bounds;
  const collapsed = !!zone.collapsed;
  const isSequence = zone.viewMode === 'sequence';
  // T8 K8 — cross-zone source badges (grouped by source zone).
  const crossZoneSources = state ? selectCrossZoneSourcesForZone(state, zone.id) : [];
  // T8 K10 — transient post-navigation highlight (DEC-T8-09).
  const highlighted = !!(zone.highlightedUntil && Date.now() < zone.highlightedUntil);
  const counter = Z.headerCounter
    .replace('{count}', String(nodeCount))
    .replace('{nodes}', pluralUzel(nodeCount));

  return (
    <div
      data-testid={`zone-frame-${zone.id}`}
      data-view-mode={zone.viewMode || 'graph'}
      onPointerEnter={() => onFocus && onFocus(zone.id)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height: collapsed ? HEADER_H : height,
        // R-T7-1 — sequence-mode content must sit above graph nodes
        // (zIndex 10/20); graph-mode frame stays a background (1).
        zIndex: isSequence ? 60 : 1,
        background: 'var(--zone-bg)',
        border: highlighted
          ? '2px solid var(--accent-500)'
          : '1px solid var(--zone-border)',
        borderRadius: 'var(--radius-md)',
        boxSizing: 'border-box',
      }}
      data-highlighted={highlighted ? 'true' : 'false'}
    >
      <div
        data-testid={`zone-header-${zone.id}`}
        onPointerDown={(e) => onDragStart && onDragStart(e)}
        onDoubleClick={(e) => onClickHeader && onClickHeader(e)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu && onContextMenu(e); }}
        style={{
          height: HEADER_H,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 8px',
          background: 'var(--zone-header-bg)',
          color: 'var(--zone-header-fg)',
          font: '500 12px var(--font-ui)',
          cursor: 'grab',
          userSelect: 'none',
          pointerEvents: 'auto',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {zone.name}
        </span>
        <span
          data-testid={`zone-counter-${zone.id}`}
          style={{ color: 'var(--zone-header-counter-fg)', fontSize: 11 }}
        >
          {counter}
        </span>
        {zone.notes && (
          <span
            data-testid={`zone-notes-badge-${zone.id}`}
            title={zone.notes}
            aria-label="notes"
            style={{ fontSize: 12, cursor: 'help' }}
          >
            📝
          </span>
        )}
        {crossZoneSources.length > 0 && (
          <span
            data-testid={`zone-links-${zone.id}`}
            style={{
              display: 'inline-flex', gap: 4, overflow: 'hidden', maxWidth: '45%',
            }}
          >
            {crossZoneSources.map((link) => (
              <ZoneLinkBadge
                key={link.sourceZoneId}
                sourceZoneName={link.sourceZoneName}
                pieceCount={link.pieceIds.length}
                onClick={() => onNavigateToZone && onNavigateToZone(link.sourceZoneId)}
              />
            ))}
          </span>
        )}
        <button
          type="button"
          data-testid={`zone-view-toggle-${zone.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleViewMode) onToggleViewMode(zone.id, isSequence ? 'graph' : 'sequence');
          }}
          title={isSequence ? SM.toggleToGraph : SM.toggleToSequence}
          style={{
            marginLeft: 'auto',
            font: '600 11px var(--font-ui)',
            padding: '1px 7px',
            borderRadius: 'var(--radius-sm, 4px)',
            border: '1px solid var(--zone-border)',
            background: 'var(--surface-2)',
            color: 'var(--zone-header-fg)',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          {isSequence ? 'S' : 'G'}
        </button>
        <button
          type="button"
          data-testid={`zone-open-assembly-${zone.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenAssembly) onOpenAssembly(zone.id);
          }}
          title={Z.openAssembly}
          aria-label={Z.openAssembly}
          style={{
            font: '600 11px var(--font-ui)',
            padding: '1px 8px',
            borderRadius: 'var(--radius-sm, 4px)',
            border: '1px solid var(--accent-500, #b85c3e)',
            background: 'var(--accent-500, #b85c3e)',
            color: '#fff',
            cursor: 'pointer',
            pointerEvents: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          🧬 {Z.openAssembly}
        </button>
      </div>

      {!collapsed && (
        <div
          data-testid={`zone-body-${zone.id}`}
          style={{
            position: 'absolute',
            inset: `${HEADER_H}px 0 0 0`,
            // Graph-mode: transparent, clicks fall through to nodes
            // (DEC-T4-04). Sequence-mode: ZoneSequenceMode owns it.
            pointerEvents: isSequence ? 'auto' : 'none',
            overflow: 'hidden',
          }}
        >
          {isSequence && (
            <ZoneSequenceMode zone={zone} state={state} dispatch={dispatch} />
          )}
          {!isSequence && zone.laneLayout !== 'manual' && (
            <ZoneLaneDivider />
          )}
        </div>
      )}

      {!collapsed && EDGES.map((edge) => {
        const p = handlePos(edge, width, height);
        return (
          <div
            key={edge}
            data-testid={`zone-resize-${edge}-${zone.id}`}
            onPointerDown={(e) => onResize && onResize(edge, e)}
            style={{
              position: 'absolute',
              left: p.left,
              top: p.top,
              width: HANDLE,
              height: HANDLE,
              cursor: CURSOR[edge],
              pointerEvents: 'auto',
              background: 'var(--zone-resize-handle)',
              opacity: 0,
              transition: 'opacity 120ms',
              borderRadius: 2,
            }}
            onPointerEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onPointerLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
          />
        );
      })}
    </div>
  );
}
