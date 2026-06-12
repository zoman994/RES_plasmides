/**
 * AssemblyDagView — M-WORKSPACE DAG view tab. Hosts the shared ZoneGraphContent
 * (source→PCR→frag→assembly→product) for one assembly, full-area, scrollable,
 * with zoom/pan parity to the retired multi-zone canvas:
 *   - wheel zooms to the cursor (zoomAtPoint) — non-passive so the page scroll
 *     is suppressed; the post-zoom scroll lands in a layout effect after the
 *     scaled spacer re-sizes (same pattern as CanvasLayoutView).
 *   - −/%/+/fit controls (fit = «под размер сборки», fitZoomToContent over the
 *     DAG's OWN footprint via graphContentBBox — the per-zone graph lays out
 *     locally, so canvasContentExtent/state.positions don't describe it).
 * Op click → op editor drill-in (OPEN_EDITOR_OP_TAB); container dbl-click →
 * view-only editor; single click → highlight.
 */
import {
  useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo,
} from 'react';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { nodeListInZone } from '../lib/zone-model';
import ZoneGraphContent from '../canvas/ZoneGraphContent';
import {
  graphContentBBox, zoomAtPoint, fitZoomToContent, ZOOM_MIN, ZOOM_MAX,
} from '../canvas/canvas-layout';

const GRID = 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)';
const PAD = 24;

const zoomBtnStyle = {
  width: 28,
  height: 24,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--text-primary)',
  borderRadius: 3,
};

export default function AssemblyDagView({ zoneId }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const { containers, operations } = nodeListInZone(state, zoneId);
  const empty = containers.length === 0 && operations.length === 0;
  const { width: contentW, height: contentH } = useMemo(
    () => graphContentBBox(containers, operations),
    [containers, operations],
  );

  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  // CSS scale() doesn't grow scrollWidth/Height — apply the focal-zoom scroll
  // target in a layout effect, after the scaled spacer re-sizes.
  const pendingScrollRef = useRef(null);

  const onZoomIn = useCallback(() => setZoom((z) => Math.min(ZOOM_MAX, +(z * 1.1).toFixed(2))), []);
  const onZoomOut = useCallback(() => setZoom((z) => Math.max(ZOOM_MIN, +(z / 1.1).toFixed(2))), []);
  const onZoomReset = useCallback(() => setZoom(1), []);
  const onZoomFit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = fitZoomToContent({
      viewportW: el.clientWidth,
      viewportH: el.clientHeight,
      bbox: {
        minX: 0, minY: 0, maxX: contentW, maxY: contentH, width: contentW, height: contentH,
      },
    });
    if (!fit) return;
    pendingScrollRef.current = { left: fit.scrollLeft, top: fit.scrollTop };
    setZoom(fit.zoom);
  }, [contentW, contentH]);

  // Wheel-zoom anchored to the cursor (native non-passive so we can
  // preventDefault the page scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setZoom((z) => {
        const r = zoomAtPoint({
          zoom: z,
          dir: e.deltaY < 0 ? -1 : 1,
          sx: e.clientX - rect.left,
          sy: e.clientY - rect.top,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
        });
        if (!r.changed) return z;
        pendingScrollRef.current = { left: r.scrollLeft, top: r.scrollTop };
        return r.zoom;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useLayoutEffect(() => {
    const p = pendingScrollRef.current;
    const el = containerRef.current;
    if (!p || !el) return;
    pendingScrollRef.current = null;
    el.scrollLeft = p.left;
    el.scrollTop = p.top;
  }, [zoom]);

  return (
    <div
      data-testid="assembly-dag-view"
      style={{
        flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        ref={containerRef}
        data-testid="assembly-dag-scroll"
        data-zoom={zoom}
        style={{
          flex: 1, minHeight: 0, overflow: 'auto', position: 'relative',
          background: 'var(--surface-base, #fafaf9)',
          backgroundImage: GRID,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        }}
      >
        {empty ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center', fontSize: 12.5,
            color: 'var(--text-tertiary)',
          }}
          >
            Граф появится после «Реализовать» во вкладке Sequence.
          </div>
        ) : (
          <>
            {/* Sizing spacer (extent*zoom) so the focal-zoom scroll can pan far
                enough at zoom>1 — CSS scale() doesn't grow scrollWidth/Height. */}
            <div
              data-testid="assembly-dag-extent"
              aria-hidden
              style={{
                position: 'absolute', top: 0, left: 0,
                width: (contentW + PAD * 2) * zoom,
                height: (contentH + PAD * 2) * zoom,
                pointerEvents: 'none', zIndex: 0,
              }}
            />
            <div
              data-testid="assembly-dag-scaled"
              style={{
                position: 'absolute', top: 0, left: 0,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                padding: PAD,
              }}
            >
              <ZoneGraphContent
                containers={containers}
                operations={operations}
                highlightedId={state.highlightedContainerId}
                onContainerClick={(id) => actions.setHighlight && actions.setHighlight(id)}
                onContainerDoubleClick={(id) => actions.openEditorViewOnly && actions.openEditorViewOnly(id)}
                onOperationClick={(op) => { if (op && op.id && actions.openEditorOpTab) actions.openEditorOpTab(op.id); }}
              />
            </div>
          </>
        )}
      </div>
      {/* Zoom controls OUTSIDE the scroll host so they stay pinned. */}
      {!empty && (
        <div
          data-testid="assembly-dag-zoom-controls"
          style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 5,
            display: 'flex', gap: 4,
            background: 'var(--surface-1, #fff)',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 6,
            padding: 2,
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        >
          <button type="button" data-testid="assembly-dag-zoom-out" onClick={onZoomOut} style={zoomBtnStyle} title="Уменьшить">−</button>
          <button type="button" data-testid="assembly-dag-zoom-reset" onClick={onZoomReset} style={{ ...zoomBtnStyle, minWidth: 44, fontSize: 11 }} title="Сбросить">{Math.round(zoom * 100)}%</button>
          <button type="button" data-testid="assembly-dag-zoom-in" onClick={onZoomIn} style={zoomBtnStyle} title="Увеличить">+</button>
          <button
            type="button"
            data-testid="assembly-dag-zoom-fit"
            onClick={onZoomFit}
            style={{ ...zoomBtnStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            title="Под размер сборки"
            aria-label="Под размер сборки"
          >
            {/* Inline SVG (the ⛶ glyph renders blank in many Windows UI fonts). */}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 6V2h4" />
              <path d="M10 2h4v4" />
              <path d="M14 10v4h-4" />
              <path d="M6 14H2v-4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
