/**
 * ZoneContextMenu — right-click popover for a zone (T4 K4,
 * DEC-T4-09/10). Plain DOM div (no radix); closes on Esc + click
 * outside (ui-interactions). Delete is gated by a destructive confirm.
 */
import React, { useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';

const Z = STRINGS.canvasSkeleton.zones;
const CM = Z.contextMenu;

const itemStyle = {
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

export default function ZoneContextMenu({ zoneId, x, y, state, dispatch, onClose }) {
  const ref = useRef(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const zone = (state.zones || []).find((z) => z.id === zoneId);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose && onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  if (!zone) return null;

  const fire = (action) => { dispatch(action); onClose && onClose(); };

  const Item = ({ label, onClick, testid }) => (
    <div
      data-testid={testid}
      style={itemStyle}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </div>
  );

  const otherZones = (state.zones || []).filter((z) => z.id !== zoneId);

  return (
    <div
      ref={ref}
      data-testid="zone-menu"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: 60,
        minWidth: 200,
        padding: '4px 0',
        background: 'var(--zone-context-menu-bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--zone-context-menu-shadow)',
        font: 'var(--font-ui)',
      }}
    >
      <Item
        label={CM.openAssembly}
        testid="zone-menu-open-assembly"
        onClick={() => fire({ type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: zoneId })}
      />
      <Item
        label={CM.rename}
        testid="zone-menu-rename"
        onClick={() => {
          const v = window.prompt ? window.prompt(CM.rename, zone.name) : null;
          if (v != null && String(v).trim()) {
            fire({ type: 'UPDATE_ZONE_NAME', zoneId, name: String(v).trim() });
          } else {
            onClose && onClose();
          }
        }}
      />
      <Item
        label={zone.collapsed ? CM.expand : CM.collapse}
        testid="zone-menu-collapse"
        onClick={() => fire({ type: 'SET_ZONE_COLLAPSED', zoneId, collapsed: !zone.collapsed })}
      />
      <Item
        label={CM.editNotes}
        testid="zone-menu-notes"
        onClick={() => {
          const v = window.prompt ? window.prompt(CM.editNotes, zone.notes || '') : null;
          if (v != null) fire({ type: 'UPDATE_ZONE_NOTES', zoneId, notes: String(v) });
          else onClose && onClose();
        }}
      />
      <Item
        label={CM.fitToNodes}
        testid="zone-menu-fit"
        onClick={() => fire({ type: 'RECOMPUTE_ZONE_BOUNDS', zoneId })}
      />
      {/* T4.5 — 3-lane auto-layout opt-out + force tidy. */}
      <Item
        label={zone.laneLayout === 'manual' ? CM.laneAuto : CM.laneManual}
        testid="zone-menu-lane-layout"
        onClick={() => fire({
          type: 'SET_ZONE_LANE_LAYOUT',
          zoneId,
          layout: zone.laneLayout === 'manual' ? 'auto' : 'manual',
        })}
      />
      <Item
        label={CM.recomputeLayout}
        testid="zone-menu-recompute-layout"
        onClick={() => fire({ type: 'RECOMPUTE_ZONE_LAYOUT', zoneId })}
      />
      <Item
        label={CM.wrapLoose}
        testid="zone-menu-wrap"
        onClick={() => fire({ type: 'WRAP_LOOSE_NODES_IN_ZONE', zoneName: Z.defaultName.replace('{n}', String((state.zones || []).length + 1)) })}
      />
      <div
        data-testid="zone-menu-merge"
        style={itemStyle}
        onClick={() => setMergeOpen((o) => !o)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {CM.mergeWith}
      </div>
      {mergeOpen && otherZones.map((z) => (
        <div
          key={z.id}
          data-testid={`zone-merge-target-${z.id}`}
          style={{ ...itemStyle, paddingLeft: 28, color: 'var(--text-secondary)' }}
          onClick={() => fire({
            type: 'MERGE_ZONES', zoneIds: [zoneId, z.id], mergedName: zone.name,
          })}
        >
          {z.name}
        </div>
      ))}
      <Item
        label={CM.remove}
        testid="zone-menu-remove"
        onClick={() => {
          const ok = window.confirm
            ? window.confirm(Z.confirmRemove.replace('{name}', zone.name))
            : false;
          if (ok) dispatch({ type: 'REMOVE_ZONE', zoneId });
          onClose && onClose();
        }}
      />
    </div>
  );
}
