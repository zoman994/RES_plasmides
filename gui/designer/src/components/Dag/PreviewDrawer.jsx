/**
 * PreviewDrawer — slide-in overlay 340 px right of the DagPalette
 * (M-C.1 K3). Opens when biolog clicks a row in the palette.
 *
 * Content:
 *   • PlasmidMiniMap 180×180.
 *   • Metadata: name + length + topology + feature count.
 *   • Region list: up to 8 rows + «+N more» chip.
 *   • CTAs: «Добавить на canvas» / «Закрыть».
 *
 * Closes on:
 *   • Esc (window keydown listener).
 *   • «Закрыть» button.
 *   • Successful «Добавить на canvas» click — host clears `entry` prop.
 *   • Click outside the drawer body — host wires that via the
 *     `onClickOutside` prop (App-level concern).
 *
 * `prefers-reduced-motion` (K5) skips the slide-in transform.
 */
import { useEffect, useMemo } from 'react';
import { STRINGS } from '../../lib/strings';
import { getRegions } from '../../annotation-model';
import { featureColor } from '../../feature-palette';
import PlasmidMiniMap from '../PlasmidMiniMap';

const S = STRINGS.dag;

const DRAWER_WIDTH = 340;
const MAX_REGIONS = 8;

export default function PreviewDrawer({ entry, onClose, onAddToCanvas }) {
  // Esc → close.
  useEffect(() => {
    if (!entry) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, onClose]);

  const length = entry?.payload?.length || 0;
  const topology = entry?.payload?.topology || 'circular';
  const annotations = entry?.payload?.annotations || [];
  const regions = useMemo(() => getRegions(annotations), [annotations]);

  if (!entry) return null;

  const visibleRegions = regions.slice(0, MAX_REGIONS);
  const overflow = regions.length - visibleRegions.length;

  return (
    <div
      data-testid="dag-preview-drawer"
      style={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        background: 'var(--surface-1, #ffffff)',
        borderRight: '0.5px solid var(--border-default, #d6d3d1)',
        boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          data-testid="dag-preview-drawer-name"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >{entry.name || entry.id}</div>
        <button
          type="button"
          data-testid="dag-preview-drawer-close"
          onClick={() => onClose?.()}
          aria-label={S.drawerClose}
          title={`${S.drawerClose} (Esc)`}
          style={{
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >×</button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div
          style={{
            width: 180,
            height: 180,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-2, #fafaf9)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          <PlasmidMiniMap
            length={length}
            topology={topology}
            annotations={annotations}
            size={176}
            disableHoverOverlay
          />
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span>{length >= 1000 ? `${(length / 1000).toFixed(1)} kb` : `${length} bp`}</span>
          <span>{topology === 'linear' ? 'linear' : 'circular'}</span>
          <span>{regions.length} регион{regions.length === 1 ? '' : regions.length < 5 ? 'а' : 'ов'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleRegions.map((r, idx) => (
            <div
              key={r.id || `${r.type}-${r.start}-${idx}`}
              data-testid={`dag-preview-drawer-region-${idx}`}
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: featureColor(r.type, r.name),
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name || r.type}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>{(r.end || 0) - (r.start || 0)} bp</span>
            </div>
          ))}
          {overflow > 0 && (
            <div
              data-testid="dag-preview-drawer-region-overflow"
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                paddingLeft: 14,
              }}
            >{S.drawerRegionOverflow(overflow)}</div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: 12,
          borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          data-testid="dag-preview-drawer-cancel"
          onClick={() => onClose?.()}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >{S.drawerClose}</button>
        <button
          type="button"
          data-testid="dag-preview-drawer-add"
          onClick={() => onAddToCanvas?.(entry)}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-500, #d97706)',
            color: 'var(--surface-1, #ffffff)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >{S.drawerAddToCanvas}</button>
      </div>
    </div>
  );
}
