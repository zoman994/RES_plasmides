/**
 * CanvasLayoutView — top-level canvas board.
 *
 * Node B (DEC-V0.8.3-CANVAS-FINAL-MODEL, 23.05.2026): the canvas holds ONLY
 * assembly zones. The loose-node paradigm — standalone container / operation /
 * junction / op-wire / assembly-draft / virtual-output blocks free-floating on
 * the canvas — is retired. The assembly graph lives INSIDE a zone (graph mode,
 * T4 ZoneLayer/ZoneFrame); the sequence-mode strip is independent.
 *
 * Canvas chrome kept (§5.6): ZoneLayer (zones + their own drag/resize),
 * LibrarySearchBar (top), zoom controls, hand-pan, Sanger notebook, the
 * zoom-extent shim. Containers/operations are NOT deleted as data — they live
 * in the library/project and render inside zones; only their canvas-node
 * render + loose-positions are gone (§7, no data wipe).
 */
import {
  useCallback, useState, useRef, useEffect, useLayoutEffect,
} from 'react';
import { STRINGS } from '../../../lib/strings';
import { useHotkey } from '../../../lib/hotkeys';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { useStore } from '../../../store';
import ZoneLayer from './ZoneLayer';
import SangerLabNotebook from './SangerLabNotebook';
import LibrarySearchBar from './LibrarySearchBar';
import { Icon } from '../../icons/Icon';
import OpKindPicker from './operations/OpKindPicker';
import OpPopupRouter from './operations/OpPopupRouter';
import FragmentInfoPanel from './FragmentInfoPanel';
import { fragmentCardInfo } from '../lib/fragment-card-info';
import { buildAssemblyZoneAction } from './assembly-zone-create';
import {
  zoomAtPoint, canvasContentExtent, panScrollTarget, contentBBox, fitZoomToContent,
} from './canvas-layout';

export default function CanvasLayoutView() {
  const s = STRINGS.canvasSkeleton || {};
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const libraryEntriesById = useStore((st) => st.libraryEntries);
  const projectsById = useStore((st) => st.projects);
  const currentProjectId = useStore((st) => st.currentProjectId);
  const poolPrimers = state.primers || [];

  const containerRef = useRef(null);

  // §6 — a library molecule goes INTO an assembly zone, never onto the canvas
  // as a loose container. Focused zone → open it; else create a zone + open
  // its editor. Loading the molecule AS a source-piece (range picker) is
  // SPEC_ASSEMBLY_WORKFLOW_UX K5 — out of this spec (§6 R1 minimal redirect).
  const onSearchPick = useCallback(({ kind, id }) => {
    if (kind === 'library') {
      const zid = state.focusedZoneId;
      if (zid) { actions.openEditorAssemblyTab?.(zid); return; }
      const act = buildAssemblyZoneAction(state);
      actions.zoneDispatch?.(act);
      actions.openEditorAssemblyTab?.(act.zone.id);
      return;
    }
    if (kind === 'zone') { actions.openEditorAssemblyTab?.(id); return; }
    // 'primer' — no standalone primer canvas surface yet (no-op).
  }, [state, actions]);

  // T7 K11 (DEC-T7-10) — G / S toggle the focused zone's viewMode.
  const setFocusedZoneView = useCallback((viewMode) => {
    const zid = state.focusedZoneId;
    if (!zid) return;
    actions.zoneDispatch({ type: 'SET_ZONE_VIEW_MODE', zoneId: zid, viewMode });
  }, [state.focusedZoneId, actions]);
  const toGraph = useCallback(() => setFocusedZoneView('graph'), [setFocusedZoneView]);
  const toSequence = useCallback(() => setFocusedZoneView('sequence'), [setFocusedZoneView]);
  useHotkey('toggle-zone-view-graph', toGraph);
  useHotkey('toggle-zone-view-sequence', toSequence);

  // T10 K8/K9 — Sanger lab notebook (B), per focused zone.
  const [sangerOpen, setSangerOpen] = useState(false);
  const toggleSanger = useCallback(() => setSangerOpen((v) => !v), []);
  useHotkey('toggle-sanger-notebook', toggleSanger);

  // T8 K9 — click a cross-zone link badge → pan to + focus + highlight zone.
  const handleNavigateToZone = useCallback((zoneId) => {
    const zone = (state.zones || []).find((z) => z.id === zoneId);
    if (!zone || !zone.bounds) return;
    const z = state.zoom || 1;
    const cx = (zone.bounds.x + zone.bounds.width / 2) * z;
    const cy = (zone.bounds.y + zone.bounds.height / 2) * z;
    const vp = containerRef.current;
    if (vp && typeof vp.scrollTo === 'function') {
      vp.scrollTo({
        left: cx - (vp.clientWidth || 0) / 2,
        top: cy - (vp.clientHeight || 0) / 2,
        behavior: 'smooth',
      });
    }
    actions.zoneDispatch({ type: 'SET_FOCUSED_ZONE', zoneId });
    actions.zoneDispatch({ type: 'HIGHLIGHT_ZONE', zoneId, durationMs: 1000 });
    setTimeout(() => {
      actions.zoneDispatch({ type: 'HIGHLIGHT_ZONE', zoneId, durationMs: 0 });
    }, 1000);
  }, [state.zones, state.zoom, actions]);

  // B10 — zoom + pan.
  const [zoom, setZoom] = useState(1);
  const onZoomIn = useCallback(() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2))), []);
  const onZoomOut = useCallback(() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2))), []);
  const onZoomReset = useCallback(() => setZoom(1), []);

  // Wheel-zoom anchored to the cursor (native non-passive listener so we can
  // preventDefault the page scroll). Post-zoom scroll applied in a layout
  // effect (after the scaled wrapper re-sizes).
  const pendingScrollRef = useRef(null);
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

  // «Под размер сборки» — zoom + centre so the whole assembly fits the window
  // (Игорь 11.06). Reuses the pendingScroll → useLayoutEffect path so the
  // scroll lands after the scaled spacer re-sizes.
  const onZoomFit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = fitZoomToContent({
      viewportW: el.clientWidth, viewportH: el.clientHeight, bbox: contentBBox(state),
    });
    if (!fit) return;
    pendingScrollRef.current = { left: fit.scrollLeft, top: fit.scrollTop };
    setZoom(fit.zoom);
  }, [state]);

  // `.2` (Игорь 11.06) — IN-ZONE op popup, parity with CanvasGraphView. A click
  // on a reaction diamond inside a zone opens the lightweight reaction config at
  // the cursor (OpKindPicker for a kind-less draft, OpPopupRouter for a
  // committed op) instead of jumping to the editor tab (the K4 stopgap). Both
  // popups are position:fixed, so the canvas scale/scroll doesn't affect them.
  const [openOpPicker, setOpenOpPicker] = useState(null); // {operationId,x,y}
  const [openOpPopup, setOpenOpPopup] = useState(null);
  // CANVAS-CLICK-3 — single click a card → fragment info panel floated at the click
  // (parity with the DAG view; one inspector at a time with the op popups).
  const [openCardInfo, setOpenCardInfo] = useState(null); // {container,x,y}
  const onOperationClick = useCallback((op, e) => {
    if (!op) return;
    const x = e?.clientX ?? 100;
    const y = e?.clientY ?? 100;
    setOpenCardInfo(null);
    if (op.kind === null || op.kind === undefined) {
      setOpenOpPicker({ operationId: op.id, x, y });
      setOpenOpPopup(null);
    } else {
      setOpenOpPopup({ operationId: op.id, x, y });
      setOpenOpPicker(null);
    }
  }, []);
  const onContainerClick = useCallback((id, container, e) => {
    if (!container) return;
    setOpenOpPicker(null);
    setOpenOpPopup(null);
    setOpenCardInfo({ container, x: e?.clientX ?? 120, y: e?.clientY ?? 120 });
  }, []);
  const cardInfo = openCardInfo ? fragmentCardInfo(openCardInfo.container) : null;
  const opsList = state.operations || [];
  const pickerOp = openOpPicker ? opsList.find((o) => o.id === openOpPicker.operationId) || null : null;
  const popupOp = openOpPopup ? opsList.find((o) => o.id === openOpPopup.operationId) || null : null;
  const onPickerPickKind = useCallback((kind) => {
    if (!openOpPicker?.operationId) return;
    actions.opSetKind(openOpPicker.operationId, kind);
    setOpenOpPopup({ operationId: openOpPicker.operationId, x: openOpPicker.x, y: openOpPicker.y });
    setOpenOpPicker(null);
  }, [actions, openOpPicker]);
  const onPickerCancel = useCallback(() => setOpenOpPicker(null), []);
  const onPopupCancel = useCallback(() => setOpenOpPopup(null), []);
  const onPopupExecute = useCallback((operationId, paramsPatch) => {
    if (paramsPatch && Object.keys(paramsPatch).length > 0) actions.opSetParams(operationId, paramsPatch);
    actions.opExecute(operationId);
    setOpenOpPopup(null);
  }, [actions]);

  // Sizing shim: CSS scale() doesn't grow scrollWidth/Height — force the
  // scrollable area to contentExtent*zoom so focal-zoom can pan far enough.
  const canvasExtent = canvasContentExtent(state);

  // "Grab the canvas" — drag bare background (or middle-mouse) to pan. Zones
  // own their own drag (ZoneLayer); this only arms on a true background press.
  const panRef = useRef(null);
  const justPannedRef = useRef(false);
  const [panning, setPanning] = useState(false);

  const isBgTarget = useCallback((e) => !(
    e.target && e.target.closest && e.target.closest(
      '[data-zone-id],[data-testid^="zone-"],button,a,input,textarea,select',
    )
  ), []);

  const onCanvasPointerDown = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    const middle = e.button === 1;
    if (!(middle || (e.button === 0 && isBgTarget(e)))) return;
    e.preventDefault();
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    try { el.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  }, [isBgTarget]);

  const onCanvasPointerMove = useCallback((e) => {
    const p = panRef.current;
    const el = containerRef.current;
    if (!p || !el) return;
    if (!p.moved && (Math.abs(e.clientX - p.x) > 3 || Math.abs(e.clientY - p.y) > 3)) {
      p.moved = true;
      setPanning(true);
    }
    if (p.moved) {
      const t = panScrollTarget(p, e.clientX, e.clientY);
      el.scrollLeft = t.left;
      el.scrollTop = t.top;
    }
  }, []);

  const onCanvasPointerUp = useCallback((e) => {
    const p = panRef.current;
    if (!p) return;
    panRef.current = null;
    setPanning(false);
    try { containerRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* jsdom */ }
    if (p.moved) justPannedRef.current = true; // swallow the trailing click
  }, []);

  const onCanvasClick = useCallback((e) => {
    if (justPannedRef.current) { justPannedRef.current = false; return; }
    // Click on bare background deselects (no loose nodes to select anymore,
    // but a focused/selected zone-node should still clear).
    if (e.target === containerRef.current) {
      actions.setHighlight?.(null);
      if ((state.selectedContainerIds || []).length > 0) actions.clearSelection?.();
    }
  }, [actions, state.selectedContainerIds]);

  return (
    <div
      data-testid="skeleton-canvas-layout-wrap"
      style={{
        flex: 1, minHeight: 0, minWidth: 0, position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top-of-canvas Library search bar (PC-K2/K3). Node B §6: clicking a
          library row routes into an assembly zone, not a loose container. */}
      <LibrarySearchBar
        libraryEntries={libraryEntriesById}
        projectsById={projectsById}
        currentProjectId={currentProjectId}
        onSelectEntry={onSearchPick}
        bindFindHotkey
        extraSections={[
          {
            id: 'canvas-zones', title: 'Сборки', kind: 'zone', entries: state.zones || [],
          },
          {
            id: 'canvas-primers', title: 'Праймеры', kind: 'primer', entries: poolPrimers.filter((p) => p?.kind !== 'pair'),
          },
        ]}
      />
      <div
        ref={containerRef}
        data-testid="skeleton-canvas-layout"
        data-zoom={zoom}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerLeave={onCanvasPointerUp}
        onClick={onCanvasClick}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          position: 'relative',
          background: 'var(--surface-base, #fafaf9)',
          overflow: 'auto',
          backgroundImage:
            'radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          cursor: panning ? 'grabbing' : 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <div
          data-testid="skeleton-canvas-extent"
          aria-hidden
          style={{
            position: 'absolute', top: 0, left: 0,
            width: canvasExtent.width * zoom,
            height: canvasExtent.height * zoom,
            pointerEvents: 'none', zIndex: 0,
          }}
        />
        <div
          data-testid="skeleton-canvas-scaled"
          style={{
            position: 'absolute', inset: 0,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            width: zoom !== 1 ? `${100 / zoom}%` : '100%',
            height: zoom !== 1 ? `${100 / zoom}%` : '100%',
          }}
        >
          {/* T4 — zones (frames + their internal graph/sequence content). */}
          <ZoneLayer
            state={state}
            dispatch={actions.zoneDispatch}
            onNavigateToZone={handleNavigateToZone}
            onOperationClick={onOperationClick}
            onContainerClick={onContainerClick}
          />
          {/* T10 K9 — Sanger lab notebook (per focused zone). */}
          {sangerOpen && state.focusedZoneId && (
            <SangerLabNotebook
              state={state}
              dispatch={actions.zoneDispatch}
              zoneId={state.focusedZoneId}
              onClose={() => setSangerOpen(false)}
            />
          )}
          {!sangerOpen && (
            <button
              type="button"
              data-testid="open-sanger-notebook"
              onClick={() => setSangerOpen(true)}
              title={(s.zones && s.zones.sanger && s.zones.sanger.openButton) || 'Sanger'}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 29,
                font: '13px var(--font-ui)', padding: '4px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-1)', color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              <Icon name="list" size={14} />
            </button>
          )}
          {/* Node B §5.4 — empty canvas = no zones (the canvas is a board of
              assembly zones now, not a drop-target for loose containers). */}
          {(state.zones || []).length === 0 && (
            <div
              data-testid="skeleton-canvas-empty"
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                color: 'var(--text-secondary)', fontSize: 13,
                pointerEvents: 'none',
              }}
            >
              <div>{s.canvasEmptyZones || 'Канвас пуст — здесь живут сборки'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Создайте сборку кнопкой «+ Сборка» или выберите молекулу в поиске сверху
              </div>
            </div>
          )}
        </div>
      </div>
      {/* B10 — Zoom controls OUTSIDE the scroll container so they stay pinned. */}
      <div
        data-testid="skeleton-zoom-controls"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 28,
          display: 'flex', gap: 4,
          background: 'var(--surface-1, #fff)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 6,
          padding: 2,
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}
      >
        <button type="button" data-testid="skeleton-zoom-out" onClick={onZoomOut} style={zoomBtnStyle} title="Уменьшить">−</button>
        <button type="button" data-testid="skeleton-zoom-reset" onClick={onZoomReset} style={{ ...zoomBtnStyle, minWidth: 44, fontSize: 11 }} title="Сбросить">{Math.round(zoom * 100)}%</button>
        <button type="button" data-testid="skeleton-zoom-in" onClick={onZoomIn} style={zoomBtnStyle} title="Увеличить">+</button>
        <button
          type="button"
          data-testid="skeleton-zoom-fit"
          onClick={onZoomFit}
          style={{ ...zoomBtnStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          title="Под размер сборки"
          aria-label="Под размер сборки"
        >
          {/* Inline SVG (the ⛶ glyph renders blank in many Windows UI fonts) —
              4 corner brackets = «fit to content». */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 6V2h4" />
            <path d="M10 2h4v4" />
            <path d="M14 10v4h-4" />
            <path d="M6 14H2v-4" />
          </svg>
        </button>
      </div>

      {/* `.2` — in-zone reaction popup (mounted OUTSIDE the scaled scroll
          container; position:fixed at the click). */}
      {openOpPicker && pickerOp && (
        <OpKindPicker
          operation={pickerOp}
          position={{ x: openOpPicker.x, y: openOpPicker.y }}
          onPick={onPickerPickKind}
          onCancel={onPickerCancel}
        />
      )}
      {openOpPopup && popupOp && (
        <OpPopupRouter
          operation={popupOp}
          position={{ x: openOpPopup.x, y: openOpPopup.y }}
          containers={state.containers || []}
          onCancel={onPopupCancel}
          onExecute={onPopupExecute}
        />
      )}
      {/* CANVAS-CLICK-3 — fragment info panel for the clicked card (floated at click). */}
      {cardInfo && (
        <FragmentInfoPanel
          info={cardInfo}
          anchor={{ x: openCardInfo.x, y: openCardInfo.y }}
          onClose={() => setOpenCardInfo(null)}
          onOpen={actions.openEditorViewOnly
            ? () => { actions.openEditorViewOnly(openCardInfo.container.id); setOpenCardInfo(null); }
            : undefined}
        />
      )}
    </div>
  );
}

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
