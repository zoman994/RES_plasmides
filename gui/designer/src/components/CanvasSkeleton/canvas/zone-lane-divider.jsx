/**
 * zone-lane-divider — T4.5 K8 (DEC-T4.5-09). Visual hint for the
 * 3-lane auto-layout: two dashed horizontal rules between the lanes +
 * a left-anchored label per lane («ИСТОЧНИКИ / ПРОМЕЖУТОЧНОЕ /
 * ФИНАЛЫ»). Pure decoration — pointer-events:none, never intercepts
 * node drag/select. Mounted by ZoneFrame only in graph-mode auto
 * zones. Coordinates are zone-body-local (body is inset by the
 * header), derived from the same ZONE_LANE_DY the layout uses.
 */
import { STRINGS } from '../../../lib/strings';
import { ZONE_LANE_DY } from '../lib/zone-layout';

const L = STRINGS.canvasSkeleton.zones.lanes;
const HEADER_H = 28; // mirrors ZoneFrame HEADER_H (body inset top)

const labelStyle = {
  position: 'absolute',
  left: 10,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
  pointerEvents: 'none',
  userSelect: 'none',
};

function rule(localY, key) {
  return (
    <div
      key={key}
      aria-hidden
      data-testid="zone-lane-rule"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        top: localY,
        height: 0,
        borderTop: '1px dashed var(--border-subtle)',
        pointerEvents: 'none',
      }}
    />
  );
}

export default function ZoneLaneDivider() {
  // Body-local Y = lane offset from zone top minus the header inset.
  const srcY = ZONE_LANE_DY.source - HEADER_H;
  const midY = ZONE_LANE_DY.intermediate - HEADER_H;
  const finY = ZONE_LANE_DY.finals - HEADER_H;
  const rule1 = Math.round((srcY + midY) / 2) + 18; // between src & mid
  const rule2 = Math.round((midY + finY) / 2); // between mid & fin

  return (
    <div
      data-testid="zone-lane-divider"
      aria-hidden
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
      }}
    >
      {rule(rule1, 'r1')}
      {rule(rule2, 'r2')}
      <div style={{ ...labelStyle, top: Math.max(2, srcY - 4) }} data-testid="zone-lane-label-sources">{L.sources}</div>
      <div style={{ ...labelStyle, top: midY - 4 }} data-testid="zone-lane-label-intermediate">{L.intermediate}</div>
      <div style={{ ...labelStyle, top: finY - 4 }} data-testid="zone-lane-label-finals">{L.finals}</div>
    </div>
  );
}
