/**
 * AssemblySegmentBar — M-WORKSPACE R1 «блок сборки сверху» (Игорь 12.06,
 * «идея представления сиквенса в виде блока сверху где фрагменты и ромб
 * настройки отличная»).
 *
 * A prominent top plashka that presents the assembled fragments as proportional
 * coloured segments with a clickable junction ромб at each internal boundary —
 * the SAME `coloredZones` (enriched with `junctionRight` by
 * enrichZonesWithJunctions) that SegmentZonesOverlay draws as a thin strip on
 * the sequence. Speaks the SAME onZoneClick contract so AssemblyShellBody's
 * existing handler routes both:
 *   - segment click → onZoneClick(zoneId: string) → segment detail
 *   - ромб click    → onZoneClick({ ...junctionRight, clientX, clientY })
 *                     → OPEN_JUNCTION_METHOD_PICKER → JunctionControl
 *
 * Pure presentation — no store. Renders null when there are no segments.
 */

// Same translucent fill / stroke math SegmentZonesOverlay uses, so the bar and
// the sequence strip read as one colour language.
function toRgba(hex, alpha) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return `rgba(120,113,108,${alpha})`;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(120,113,108,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

const ORPHAN_FILL = 'repeating-linear-gradient(45deg,rgba(220,38,38,0.12),rgba(220,38,38,0.12) 6px,rgba(220,38,38,0.22) 6px,rgba(220,38,38,0.22) 12px)';

export default function AssemblySegmentBar({ coloredZones, onZoneClick }) {
  const zones = Array.isArray(coloredZones) ? coloredZones : [];
  if (zones.length === 0) return null;

  return (
    <div
      data-testid="assembly-segment-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: 10,
        marginBottom: 10,
        background: 'var(--surface-2)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {zones.map((z) => {
        const span = Math.max(1, (z.end || 0) - (z.start || 0));
        const jr = z.junctionRight || null;
        const decided = jr && jr.state === 'decided';
        return (
          <div key={z.zoneId} style={{ display: 'contents' }}>
            <button
              type="button"
              data-testid="assembly-segment"
              data-zone-id={z.zoneId}
              data-orphan={z.isOrphan ? 'true' : 'false'}
              title={z.label || z.zoneId}
              onClick={() => onZoneClick && onZoneClick(z.zoneId)}
              style={{
                flexGrow: span,
                flexBasis: 0,
                flexShrink: 1,
                minWidth: 46,
                height: 44,
                border: 'none',
                borderBottom: `2px solid ${z.isOrphan ? 'rgba(220,38,38,0.6)' : toRgba(z.color, 0.55)}`,
                borderRadius: 'var(--radius-sm, 4px)',
                background: z.isOrphan ? ORPHAN_FILL : toRgba(z.color, 0.14),
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                padding: '0 6px',
              }}
            >
              {z.label || z.zoneId}
            </button>
            {jr && (
              <button
                type="button"
                data-testid="assembly-junction"
                data-pair-key={jr.pairKey}
                data-junction-kind={jr.kind}
                data-method={jr.method}
                data-junction-state={jr.state}
                data-junction-differs={jr.differsFromAssembly ? 'true' : 'false'}
                title={`Стык: ${jr.method} · ${decided ? 'выбран' : 'по умолчанию'}${jr.differsFromAssembly ? ' · отличается от сборки' : ''}`}
                onClick={(e) => onZoneClick && onZoneClick({
                  ...jr, clientX: e.clientX, clientY: e.clientY,
                })}
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 44,
                  margin: '0 -8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  zIndex: 3,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 11,
                    height: 11,
                    transform: 'rotate(45deg)',
                    borderRadius: 2,
                    background: decided ? jr.fill : 'transparent',
                    border: `1.6px solid ${jr.stroke}`,
                    boxSizing: 'border-box',
                  }}
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
