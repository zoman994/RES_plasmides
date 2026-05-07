/**
 * PlasmidNode — DAG canvas card for a single library container
 * (DEC-MC1-01). M-D-style ~280×220 px:
 *
 *   ┌──────────────────────────┐
 *   │      [PlasmidMiniMap]    │   ← 200×140, embedded inline
 *   │                          │
 *   │  pUC19                   │   ← title (truncate)
 *   │  2.7 kb · ○              │   ← length kb · topology icon
 *   │  [GFP] [AmpR] [ori] +3   │   ← up to 4 region badges + chip
 *   └──────────────────────────┘
 *
 * Selected state: 2 px accent border + focus shadow.
 * Click → select. Double-click → push containerWindow fullscreen
 * (drill-in placeholder lives in K4).
 *
 * memo'd because every drag/zoom event re-renders the whole DAG; SVG
 * mini-maps are the heaviest leaves.
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store';
import { getRegions } from '../../annotation-model';
import { featureColor } from '../../feature-palette';
import PlasmidMiniMap from '../PlasmidMiniMap';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 220;
const MINI_MAP_SIZE = 140;
const MAX_BADGES = 4;

function formatKb(length) {
  const kb = (length || 0) / 1000;
  if (kb >= 10) return `${kb.toFixed(1)} kb`;
  if (kb >= 1) return `${kb.toFixed(1)} kb`;
  return `${(length || 0)} bp`;
}

function topologyIcon(topology) {
  return topology === 'linear' ? '—' : '○';
}

function PlasmidNode({ id, data, selected }) {
  const libId = data?.libraryEntryId || id;
  const entry = useStore(s => s.libraryEntries?.[libId]);
  const pushFullscreen = useStore(s => s.pushFullscreen);

  const name = entry?.name || (libId === 'ghost' ? 'Удалённая запись' : libId);
  const length = entry?.payload?.length || (entry?.payload?.sequence?.length ?? 0);
  const topology = entry?.payload?.topology || 'linear';
  const annotations = entry?.payload?.annotations || [];
  const regions = getRegions(annotations);

  const visibleBadges = regions.slice(0, MAX_BADGES);
  const overflow = regions.length - visibleBadges.length;

  const onDoubleClick = () => {
    pushFullscreen({ fullscreen: 'containerWindow', payload: { containerId: libId } });
  };

  return (
    <div
      data-testid={`dag-plasmid-node-${libId}`}
      data-selected={selected ? 'true' : 'false'}
      onDoubleClick={onDoubleClick}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: 'var(--surface-1, #ffffff)',
        border: selected
          ? '2px solid var(--accent-500, #d97706)'
          : '1.5px solid var(--border-default, #d6d3d1)',
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: selected
          ? 'var(--shadow-focus, 0 0 0 3px rgba(217,119,6,0.18))'
          : 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        contain: 'paint',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--text-tertiary)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--text-tertiary)' }} />

      <div
        style={{
          width: '100%',
          height: MINI_MAP_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface-2, #fafaf9)',
          borderRadius: 'var(--radius-sm, 4px)',
        }}
      >
        {entry ? (
          <PlasmidMiniMap
            length={length}
            topology={topology}
            annotations={annotations}
            size={MINI_MAP_SIZE - 4}
            disableHoverOverlay
          />
        ) : (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
        )}
      </div>

      <div
        data-testid={`dag-plasmid-node-title-${libId}`}
        title={name}
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary, #1c1917)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >{name}</div>

      <div
        data-testid={`dag-plasmid-node-meta-${libId}`}
        style={{
          fontSize: 11,
          color: 'var(--text-secondary, #57534e)',
          display: 'flex',
          gap: 6,
        }}
      >
        <span>{formatKb(length)}</span>
        <span>·</span>
        <span>{topologyIcon(topology)}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {visibleBadges.map((r, idx) => (
          <span
            key={r.id || `${r.type}-${r.start}-${idx}`}
            data-testid={`dag-plasmid-node-badge-${libId}-${idx}`}
            title={r.name || r.type}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm, 4px)',
              background: featureColor(r.type, r.name),
              color: 'var(--surface-1, #ffffff)',
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >{r.name || r.type}</span>
        ))}
        {overflow > 0 && (
          <span
            data-testid={`dag-plasmid-node-overflow-${libId}`}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--surface-2, #fafaf9)',
              color: 'var(--text-secondary, #57534e)',
              border: '0.5px solid var(--border-default, #d6d3d1)',
            }}
          >+{overflow}</span>
        )}
      </div>
    </div>
  );
}

export default memo(PlasmidNode);
