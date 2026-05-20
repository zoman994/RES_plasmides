/**
 * CanvasLayoutView — Layout view (free positioning).
 *
 * Pointer-based drag для перепозиционирования existing blocks; HTML5
 * drag-and-drop для приёма drag-from-Library-Tree.
 *
 * V2 paradigma (12.05.2026, NOTES_CANVAS_V2_KICKOFF §2):
 *   - На canvas стартуют 2 placeholder-блока (sequence=null).
 *   - Drop entry на placeholder → FILL_PLACEHOLDER (in-place fill).
 *   - Drop на свободное место canvas → ADD_CONTAINER_FROM_ENTRY (new).
 *   - Click на placeholder → PlaceholderTreePicker (project-scoped).
 *   - Click на filled block → highlight; двойной клик → editor.
 */
import {
  useCallback, useState, useRef, useEffect, useLayoutEffect,
} from 'react';
import { v7 as uuidv7 } from 'uuid';
import { STRINGS } from '../../../lib/strings';
import { useHotkey } from '../../../lib/hotkeys';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { useStore } from '../../../store';
import ContainerBlock from './ContainerBlock';
import ZoneLayer from './ZoneLayer';
import SangerLabNotebook from './SangerLabNotebook';
import { isJunctionCrossZone, CROSS_ZONE_DASH, CROSS_ZONE_COLOR } from './zone-cross-junction-style';
import OperationNode from './OperationNode';
import HoverOpIconRow from './HoverOpIconRow';
import AssemblyDraftBlock from './AssemblyDraftBlock';
import StitchMarkers from './StitchMarkers';
import OpRhombusTemplatePicker from './OpRhombusTemplatePicker';
import { useTreeDropTarget, TREE_DRAG_MIME } from './use-tree-drop-target';
import { useCanvasLayoutDrag } from './useCanvasLayoutDrag';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';
import PlaceholderTreePicker from './PlaceholderTreePicker';
import JunctionPopover from './JunctionPopover';
import { selectJunctionValidation } from '../store/selectors-junction';
import { selectVirtualOutputs } from '../store/selectors-product';
import { selectPcrSpans } from '../store/selectors-pcr';
import OpKindPicker from './operations/OpKindPicker';
import OpPopupRouter from './operations/OpPopupRouter';
import LibrarySearchBar from './LibrarySearchBar';
import { buildAssemblyZoneAction } from './assembly-zone-create';
import {
  BLOCK_LINEAR_W,
  BLOCK_LINEAR_H,
  OPERATION_NODE_W,
  OPERATION_NODE_H,
  edgeAnchors,
  zoomAtPoint,
  canvasContentExtent,
  panScrollTarget,
} from './canvas-layout';
import {
  junctionStroke,
  junctionFill,
  junctionLabel,
} from './junction-styles';

export default function CanvasLayoutView() {
  const s = STRINGS.canvasSkeleton || {};
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  // Always-fresh skeleton state for post-dispatch macrotasks (same
  // pattern as AssemblyShellBody): the captured `state` closure is
  // stale right after a dispatch re-render, so we route the AE-K10
  // zone-create-after-add diff through stateRef.current.
  const searchStateRef = useRef(state);
  searchStateRef.current = state;
  // PC-K2/K3 — top search bar inputs (replaces LibraryTreeHost).
  const libraryEntriesById = useStore((st) => st.libraryEntries);
  const currentProjectId = useStore((st) => st.currentProjectId);
  const poolPrimers = state.primers || [];
  const onSearchPick = useCallback(({ kind, id, entry }) => {
    if (kind === 'library' && entry) {
      // AE-K10 / spec §2 mental model: container always belongs to a
      // zone. Picking a library plasmid from the search bar materialises
      // a container, then immediately wraps it in a new zone with one
      // sourced piece pointing to the full sequence, and opens the
      // assembly editor on that zone. Single «pUC19 view» case lands here.
      const beforeIds = new Set((searchStateRef.current?.containers || []).map((c) => c.id));
      actions.addContainerFromEntry?.(entry);
      setTimeout(() => {
        const containers = searchStateRef.current?.containers || [];
        const fresh = containers.find(
          (c) => !beforeIds.has(c.id)
            && c.origin && c.origin.sourceEntryId === entry.id,
        ) || containers.find((c) => !beforeIds.has(c.id));
        if (!fresh) return;
        try {
          const a = buildAssemblyZoneAction(searchStateRef.current);
          actions.zoneDispatch?.(a);
          if (typeof actions.moveNodeToZone === 'function') {
            actions.moveNodeToZone('container', fresh.id, a.zone.id);
          }
          const seq = fresh.sequence || '';
          if (typeof actions.insertSegment === 'function' && seq.length > 0) {
            actions.insertSegment(a.zone.id, fresh.id, 0, seq.length, false);
          }
          actions.openEditorAssemblyTab?.(a.zone.id);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[LibrarySearchBar] AE-K10 zone-wrap failed', e);
        }
      }, 0);
      return;
    }
    if (kind === 'container') {
      // Highlight the existing container by triggering the same click
      // path the canvas block uses (id → highlight).
      actions.highlightContainer?.(id);
      return;
    }
    if (kind === 'zone') {
      actions.openEditorAssemblyTab?.(id);
      return;
    }
    if (kind === 'primer') {
      // No standalone primer canvas surface — caller (future) will wire
      // a primer-pool focus. For now: no-op + console hint.
      // eslint-disable-next-line no-console
      console.info('[LibrarySearchBar] primer pick — no canvas action yet', id);
    }
  }, [actions]);

  // T7 K11 (DEC-T7-10) — G / S toggle the focused zone's viewMode.
  // No focused zone → no-op (hotkeys are global; focus is hover-set).
  const setFocusedZoneView = useCallback((viewMode) => {
    const zid = state.focusedZoneId;
    if (!zid) return;
    actions.zoneDispatch({ type: 'SET_ZONE_VIEW_MODE', zoneId: zid, viewMode });
  }, [state.focusedZoneId, actions]);
  const toGraph = useCallback(() => setFocusedZoneView('graph'), [setFocusedZoneView]);
  const toSequence = useCallback(() => setFocusedZoneView('sequence'), [setFocusedZoneView]);
  useHotkey('toggle-zone-view-graph', toGraph);
  useHotkey('toggle-zone-view-sequence', toSequence);

  // T10 K8/K9 (DEC-T10-01/06) — Sanger lab notebook, toggled by B,
  // per the focused zone.
  const [sangerOpen, setSangerOpen] = useState(false);
  const toggleSanger = useCallback(() => setSangerOpen((v) => !v), []);
  useHotkey('toggle-sanger-notebook', toggleSanger);

  // T8 K9 (§5.7, DEC-T8-09) — click a cross-zone link badge → pan the
  // viewport to the source zone + focus + transient highlight (1s).
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

  const [blockDragOver, setBlockDragOver] = useState(null); // { containerId }
  const [pickerForId, setPickerForId] = useState(null); // placeholder id whose picker is open
  // F4 DEC-CANVAS-PROD-01/06 — derived virtual product previews.
  // React Compiler memoizes; no manual useMemo (project policy).
  const virtualOutputs = selectVirtualOutputs(state);
  // V75 — the currently-selected PCR op (highlightedContainerId is
  // reused as the highlighted-op id). Its template block shows the
  // primers + flanked region on its MiniPlasmidMap.
  const hlPcrOp = state.operations.find(
    (o) => o.id === state.highlightedContainerId && o.kind === 'pcr',
  ) || null;
  const hlPcrSpans = hlPcrOp ? selectPcrSpans(state, hlPcrOp.id) : null;
  const hlPcrTemplateId = hlPcrOp?.inputs?.[0] || null;
  const [junctionPicker, setJunctionPicker] = useState(null); // { junctionId, x, y }
  // F3 K7 — op-rhombus template dropdown + container hover op-icons.
  const [opTemplatePicker, setOpTemplatePicker] = useState(null); // { operationId, x, y }
  const [hoverBlockId, setHoverBlockId] = useState(null);
  // K5 — open picker/popup local state. Picker = OpKindPicker (для draft
  // operations). Popup = OpPopup (для committed+ operations). K6 — wired
  // через OpKindPicker + OpPopupRouter.
  const [openPicker, setOpenPicker] = useState(null); // { operationId, x, y }
  const [openPopup, setOpenPopup] = useState(null); // { operationId, x, y }
  const [opContextMenu, setOpContextMenu] = useState(null); // { operationId, x, y }
  const containerRef = useRef(null);
  // B10 — zoom + pan (Layout view).
  const [zoom, setZoom] = useState(1);

  const onZoomIn = useCallback(() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2))), []);
  const onZoomOut = useCallback(() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2))), []);
  const onZoomReset = useCallback(() => setZoom(1), []);

  // Wheel-zoom anchored to the cursor (Игорь 17.05.2026). React makes
  // the root `wheel` listener passive, so a native non-passive listener
  // is required to preventDefault the page/container scroll while
  // zooming. The post-zoom scroll target is stashed and applied in a
  // layout effect — it can only be set AFTER the scaled wrapper has
  // re-sized for the new zoom (else the browser clamps it).
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

  // Sizing shim: CSS scale() doesn't grow scrollWidth/Height, so the
  // scrollable area is forced to contentExtent*zoom — otherwise the
  // focal-zoom scroll target clamps and the cursor point drifts
  // sideways (Игорь 17.05.2026). React Compiler memoizes.
  const canvasExtent = canvasContentExtent(state);

  // Canvas-level drop (NOT on a placeholder block → ADD_CONTAINER).
  const { dragOver: canvasDragOver, dropHandlers } = useTreeDropTarget(containerRef);

  // Pointer-drag + drag-to-connect logic (size-budget decomposition,
  // 2026-05-16) — moved verbatim into useCanvasLayoutDrag. Behavior +
  // useCallback deps unchanged; the hook owns dragging / connecting /
  // justDraggedRef and returns the six handlers the render wires.
  const {
    dragging,
    connecting,
    justDraggedRef,
    onBlockPointerDown,
    onPointerMove,
    onPointerUp,
    onOperationPointerDown,
    onAssemblyPointerDown,
    onCanvasClick,
  } = useCanvasLayoutDrag({ state, actions, containerRef, zoom });

  // "Grab the canvas" — drag bare background (or middle-mouse) to pan
  // the viewport (Игорь 17.05.2026). Doesn't fight node/zone drag:
  // only arms on a background press, with a 3px move threshold so a
  // plain click still deselects; the post-pan click is swallowed.
  // Declared AFTER the drag hook — it wraps onPointerMove/Up/Click.
  const panRef = useRef(null);
  const justPannedRef = useRef(false);
  const [panning, setPanning] = useState(false);

  const isBgTarget = useCallback((e) => !(
    e.target && e.target.closest && e.target.closest(
      '[data-testid^="skeleton-block-"],[data-testid^="skeleton-op-wrap-"],'
      + '[data-testid^="assembly-draft-wrap-"],[data-zone-id],'
      + '[data-testid^="zone-"],button,a,input,textarea,select',
    )
  ), []);

  const onCanvasPointerDown = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    const middle = e.button === 1;
    if (!(middle || (e.button === 0 && isBgTarget(e)))) return;
    // Suppress the browser's native text-selection / drag-image so the
    // grab actually pans instead of selecting nearby chrome text
    // (Игорь: «лапка появляется, но не хватается, выделяется текст»).
    e.preventDefault();
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    try { el.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  }, [containerRef, isBgTarget]);

  const onCanvasPointerMove = useCallback((e) => {
    const p = panRef.current;
    const el = containerRef.current;
    if (p && el) {
      if (!p.moved && (Math.abs(e.clientX - p.x) > 3 || Math.abs(e.clientY - p.y) > 3)) {
        p.moved = true;
        setPanning(true);
      }
      if (p.moved) {
        const t = panScrollTarget(p, e.clientX, e.clientY);
        el.scrollLeft = t.left;
        el.scrollTop = t.top;
      }
      return; // own the gesture while a background press is active
    }
    onPointerMove(e);
  }, [containerRef, onPointerMove]);

  const onCanvasPointerUp = useCallback((e) => {
    const p = panRef.current;
    if (p) {
      panRef.current = null;
      setPanning(false);
      try { containerRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* jsdom */ }
      if (p.moved) { justPannedRef.current = true; return; } // swallow the click
    }
    onPointerUp(e);
  }, [containerRef, onPointerUp]);

  const onCanvasClickGuarded = useCallback((e) => {
    if (justPannedRef.current) { justPannedRef.current = false; return; }
    onCanvasClick(e);
  }, [onCanvasClick]);

  // ── Block-level drop-target (placeholder fill) ────────────────
  const hasEntryMime = (e) => {
    if (!e?.dataTransfer) return false;
    return Array.from(e.dataTransfer.types || []).includes(TREE_DRAG_MIME);
  };
  const onBlockDragOver = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onBlockDragEnter = useCallback((e, containerId) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setBlockDragOver({ containerId });
  }, []);
  const onBlockDragLeave = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    e.stopPropagation();
    setBlockDragOver(null);
  }, []);
  const onBlockDrop = useCallback((e, containerId) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setBlockDragOver(null);
    const entryId = e.dataTransfer.getData(TREE_DRAG_MIME);
    if (!entryId) return;
    const entry = useStore.getState().libraryEntries?.[entryId];
    if (!entry) return;
    actions.fillPlaceholder(containerId, entry);
  }, [actions]);

  // ── Placeholder click → picker ────────────────────────────────
  const onJunctionClick = useCallback((e, junction) => {
    e.stopPropagation();
    setJunctionPicker({
      junctionId: junction.id,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);
  const onJunctionPickerPick = useCallback((kind) => {
    if (!junctionPicker?.junctionId) return;
    actions.setJunctionKind(junctionPicker.junctionId, kind);
  }, [actions, junctionPicker]);
  const onJunctionSetParams = useCallback((patch) => {
    if (!junctionPicker?.junctionId) return;
    actions.setJunctionParams(junctionPicker.junctionId, patch);
  }, [actions, junctionPicker]);
  const onJunctionResetAuto = useCallback(() => {
    if (!junctionPicker?.junctionId) return;
    actions.resetJunctionToAuto(junctionPicker.junctionId);
  }, [actions, junctionPicker]);
  const onJunctionPickerCancel = useCallback(() => setJunctionPicker(null), []);

  const onPlaceholderClick = useCallback((containerId) => {
    // V61 — suppress click если только что был drag with movement.
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setPickerForId(containerId);
    actions.setHighlight(containerId);
  }, [actions]);

  // K5/K6 — OperationNode click/right-click. Draft op → kind picker;
  // committed/executed/failed op → params popup. Coords из MouseEvent
  // используются для anchoring picker/popup (fixed positioning).
  const onOperationClick = useCallback((op, e) => {
    if (!op) return;
    // Suppress the synthesized click that fires after dragging the
    // rhombus — without this, releasing a drag opened the editor /
    // sequence viewer (Игорь 17.05.2026). Same guard as the canvas
    // click; the hook sets justDraggedRef on a moved op-drag pointer-up.
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    const x = e?.clientX ?? 100;
    const y = e?.clientY ?? 100;
    if (op.kind === null || op.kind === undefined) {
      setOpenPicker({ operationId: op.id, x, y });
      setOpenPopup(null);
      setOpTemplatePicker(null);
    } else if ((op.inputs?.length || 0) === 0) {
      // F3 DEC-CANVAS-PCR-03 #1 — kind chosen but no template yet.
      setOpTemplatePicker({ operationId: op.id, x, y });
      setOpenPicker(null);
      setOpenPopup(null);
    } else if (op.kind === 'pcr') {
      // V78 — a committed PCR op with a template opens the PCR VIEWER
      // (PcrModeShell: sequence + primers + Tm + hotkeys + right-click),
      // not the cramped params popup. Single-click ≤2-click, consistent
      // with the hover-icon path (V70). Other kinds keep the popup until
      // they get their own viewer mode.
      actions.openEditorOpTab(op.id);
      setOpenPopup(null);
      setOpenPicker(null);
      setOpTemplatePicker(null);
    } else {
      setOpenPopup({ operationId: op.id, x, y });
      setOpenPicker(null);
      setOpTemplatePicker(null);
    }
    setOpContextMenu(null);
  }, [actions]);
  const onOpTemplatePick = useCallback((containerId) => {
    if (opTemplatePicker?.operationId && containerId) {
      actions.opAddInput(opTemplatePicker.operationId, containerId);
    }
    setOpTemplatePicker(null);
  }, [actions, opTemplatePicker]);
  const onPickHoverOp = useCallback((container, kind) => {
    const pos = state.positions[container.id] || { x: 80, y: 80 };
    // V70 — pre-gen the id so we can drop straight into the op's viewer
    // in the same tick (≤2-click: hover → icon → viewer, no rhombus
    // hunt + double-click). Template is already wired via inputs[0].
    const opId = uuidv7();
    actions.opAdd({
      id: opId,
      position: { x: pos.x, y: Math.max(0, pos.y - 90) },
      kind,
      inputs: [container.id],
      commit: true,
    });
    setHoverBlockId(null);
    actions.openEditorOpTab(opId);
  }, [actions, state.positions]);
  const onOperationContextMenu = useCallback((op, e) => {
    if (!op) return;
    setOpContextMenu({
      operationId: op.id,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);
  const onOpContextDelete = useCallback(() => {
    if (!opContextMenu?.operationId) return;
    actions.opRemove(opContextMenu.operationId);
    setOpContextMenu(null);
  }, [actions, opContextMenu]);
  const onOpContextDismiss = useCallback(() => setOpContextMenu(null), []);

  // K6 — picker pick → opSetKind → переключаемся на popup для new kind.
  const pickerOp = openPicker
    ? state.operations.find((o) => o.id === openPicker.operationId) || null
    : null;
  const popupOp = openPopup
    ? state.operations.find((o) => o.id === openPopup.operationId) || null
    : null;

  const onPickerPickKind = useCallback((kind) => {
    if (!openPicker?.operationId) return;
    actions.opSetKind(openPicker.operationId, kind);
    setOpenPopup({ operationId: openPicker.operationId, x: openPicker.x, y: openPicker.y });
    setOpenPicker(null);
  }, [actions, openPicker]);

  const onPickerCancelOp = useCallback(() => setOpenPicker(null), []);
  const onPopupCancel = useCallback(() => setOpenPopup(null), []);
  const onPopupExecute = useCallback((operationId, paramsPatch) => {
    if (paramsPatch && Object.keys(paramsPatch).length > 0) {
      actions.opSetParams(operationId, paramsPatch);
    }
    actions.opExecute(operationId);
    setOpenPopup(null);
  }, [actions]);
  const onPickerPick = useCallback((entry) => {
    if (!pickerForId || !entry) return;
    actions.fillPlaceholder(pickerForId, entry);
    setPickerForId(null);
  }, [actions, pickerForId]);
  const onPickerCancel = useCallback(() => setPickerForId(null), []);

  // «+ Операция» entry перенесён в CanvasSkeleton/index.jsx чтобы
  // оставаться видимым в обоих режимах canvas (Layout + Graph) и не
  // зависеть от containerRef'а конкретного view.

  return (
    <div
      data-testid="skeleton-canvas-layout-wrap"
      style={{
        flex: 1, minHeight: 0, minWidth: 0, position: 'relative',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* PC-K2/K3 — top-of-canvas Library search bar. Replaces the
          removed LibraryTreeHost (PC-K1) drag-source. AE-K10: clicking
          a library row also wraps the new container in a zone +
          opens the assembly editor (mental model: container ∈ zone). */}
      <LibrarySearchBar
        libraryEntries={libraryEntriesById}
        containers={state.containers || []}
        zones={state.zones || []}
        primers={poolPrimers}
        currentProjectId={currentProjectId}
        onSelectEntry={onSearchPick}
      />
    <div
      ref={containerRef}
      data-testid="skeleton-canvas-layout"
      data-drag-over={canvasDragOver ? 'true' : 'false'}
      data-zoom={zoom}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerLeave={onCanvasPointerUp}
      onClick={onCanvasClickGuarded}
      onDragOver={dropHandlers.onDragOver}
      onDragEnter={dropHandlers.onDragEnter}
      onDragLeave={dropHandlers.onDragLeave}
      onDrop={dropHandlers.onDrop}
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
        boxShadow: canvasDragOver ? 'inset 0 0 0 2px var(--accent-500, #d97706)' : 'none',
        transition: 'box-shadow 80ms ease',
        // Hand-pan affordance: grab on empty canvas, grabbing while
        // dragging it. Nodes/buttons set their own cursor → unaffected.
        cursor: panning ? 'grabbing' : 'grab',
        // Canvas chrome is not text-content; disable selection so a
        // hand-pan never selects the zoom %/labels mid-drag.
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Zoom-scaled sizing shim — drives the scroll container's
          scrollWidth/Height to contentExtent*zoom so focal wheel-zoom
          can pan far enough to keep the cursor point fixed (17.05.2026).
          Inert: behind everything, no pointer events. */}
      <div
        data-testid="skeleton-canvas-extent"
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasExtent.width * zoom,
          height: canvasExtent.height * zoom,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* FIX-9: scaled wrapper. Содержит весь canvas-positioned контент;
          модалки (op context menu, picker, popup, placeholder picker)
          оставлены снаружи чтобы не масштабироваться. */}
      <div
        data-testid="skeleton-canvas-scaled"
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
          width: zoom !== 1 ? `${100 / zoom}%` : '100%',
          height: zoom !== 1 ? `${100 / zoom}%` : '100%',
        }}
      >
      {/* T4 — zone frames render below nodes (DEC-T4-03 zIndex 1). */}
      <ZoneLayer
        state={state}
        dispatch={actions.zoneDispatch}
        onNavigateToZone={handleNavigateToZone}
      />
      {/* T10 K9 — Sanger lab notebook (right panel, per focused zone). */}
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
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 29,
            font: '13px var(--font-ui)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-1)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {(s.zones && s.zones.sanger && s.zones.sanger.openIcon) || '📋'}
        </button>
      )}
      {state.containers.length === 0 && (
        <div
          data-testid="skeleton-canvas-empty"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            color: 'var(--text-secondary)',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          <div>{s.canvasEmpty || 'На canvas пока пусто'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Перетащите запись из дерева сюда, чтобы добавить контейнер
          </div>
        </div>
      )}

      {/* «+ Операция» button рендерится теперь на уровне CanvasSkeleton/
          index.jsx — переехала туда чтобы оставаться видимой и в Graph
          view, и в Layout view (V58+1 follow-up 13.05.2026). */}

      {/* Junction SVG layer — линии между filled блоками + per-kind
          stitch markers + clickable badge */}
      {state.junctions.length > 0 && (
        <svg
          data-testid="skeleton-junctions-svg"
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            // pointerEvents auto, чтобы badge был кликабельным; path
            // не блокирует клики (pointer-events:none на нём).
            pointerEvents: 'auto',
            zIndex: 0,
          }}
        >
          {state.junctions.map((j) => {
            const pa = state.positions[j.fromContainerId];
            const pb = state.positions[j.toContainerId];
            if (!pa || !pb) return null;
            const ea = edgeAnchors(
              { x: pa.x, y: pa.y, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H },
              { x: pb.x, y: pb.y, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H },
            );
            const {
              x1, y1, x2, y2, midX, midY,
            } = ea;
            const stroke = junctionStroke(j.kind);
            const fill = junctionFill(j.kind);
            const label = junctionLabel(j.kind);
            // F2 DEC-CANVAS-JUNC-04 — red dot when validation flags a
            // conflict around this junction (non-blocking warning).
            const hasWarnings = selectJunctionValidation(state, j.id).warnings.length > 0;
            // T4 K11 (DEC-T4-11) — junction whose endpoints live in
            // different zones renders dashed + warning colour.
            const crossZone = isJunctionCrossZone(j, state);
            return (
              <g key={j.id} data-testid={`skeleton-junction-${j.id}`} data-kind={j.kind} data-warn={hasWarnings ? 'true' : 'false'}>
                {/* Connection path — disabled pointer events */}
                <path
                  d={ea.d}
                  stroke={crossZone ? CROSS_ZONE_COLOR : stroke}
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray={crossZone ? CROSS_ZONE_DASH : (j.kind === 'auto' ? '4 3' : 'none')}
                  data-cross-zone={crossZone ? 'true' : 'false'}
                  pointerEvents="none"
                />
                <StitchMarkers
                  kind={j.kind}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                />
                {/* Clickable badge */}
                <g
                  data-testid={`skeleton-junction-badge-${j.id}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => onJunctionClick(e, j)}
                >
                  <rect
                    x={midX - 24}
                    y={midY - 11}
                    width={48}
                    height={22}
                    rx={11}
                    ry={11}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                  <text
                    x={midX}
                    y={midY + 1}
                    fontSize={10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={stroke}
                    style={{ fontWeight: 700, letterSpacing: 0.3, pointerEvents: 'none', userSelect: 'none' }}
                  >{label}</text>
                  {hasWarnings && (
                    <circle
                      data-testid={`skeleton-junction-warning-${j.id}`}
                      cx={midX + 22}
                      cy={midY - 9}
                      r={4.5}
                      fill="var(--accent-500, #b85c3e)"
                      stroke="#fff"
                      strokeWidth={1}
                      pointerEvents="none"
                    >
                      <title>Конфликт стыка — открой для деталей</title>
                    </circle>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      )}

      {junctionPicker && (() => {
        const j = state.junctions.find((x) => x.id === junctionPicker.junctionId);
        if (!j) return null;
        const validation = selectJunctionValidation(state, j.id);
        return (
          <JunctionPopover
            junction={j}
            position={{ x: junctionPicker.x, y: junctionPicker.y }}
            warnings={validation.warnings}
            onPick={onJunctionPickerPick}
            onSetParams={onJunctionSetParams}
            onResetAuto={onJunctionResetAuto}
            onCancel={onJunctionPickerCancel}
          />
        );
      })()}

      {state.containers.map((c) => {
        // AE-K9.6 (spec §7.6): the ghost placeholder block «+ Пусто ·
        // click / drop запчасть» is a rudiment of the old "container
        // floats free on canvas" model. New mental model (§2) is
        // «container — всегда внутри сборки», so a standalone empty
        // slot has no semantic. Skip rendering for placeholder
        // containers; empty area itself is the drop target via the
        // canvas-level handlers (AE-K10 §7.2 — drop on empty creates
        // a new zone wrapping the container).
        if (isPlaceholderContainer(c)) return null;
        const pos = state.positions[c.id] || { x: 80, y: 80 };
        const highlighted = state.highlightedContainerId === c.id;
        const isSelected = (state.selectedContainerIds || []).includes(c.id);
        const isPh = false;
        const blockOver = blockDragOver?.containerId === c.id;
        return (
          <div
            key={c.id}
            data-testid={`skeleton-block-wrap-${c.id}`}
            data-selected={isSelected ? 'true' : 'false'}
            onPointerDown={(e) => onBlockPointerDown(e, c.id)}
            // Block-level drop-target handlers (only meaningful for
            // placeholders — фильтруем по isPh). Filled blocks тоже
            // получают handlers, но e.stopPropagation gating отсутствует
            // → drop проходит на canvas-level (ADD path).
            onDragOver={isPh ? onBlockDragOver : undefined}
            onDragEnter={isPh ? (e) => onBlockDragEnter(e, c.id) : undefined}
            onDragLeave={isPh ? onBlockDragLeave : undefined}
            onDrop={isPh ? (e) => onBlockDrop(e, c.id) : undefined}
            onMouseEnter={!isPh ? () => setHoverBlockId(c.id) : undefined}
            onMouseLeave={!isPh ? () => setHoverBlockId((id) => (id === c.id ? null : id)) : undefined}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              zIndex: highlighted ? 5 : 1,
              touchAction: 'none',
              // A6 — multi-select outline.
              outline: isSelected ? '2px dashed #d97706' : 'none',
              outlineOffset: isSelected ? 3 : 0,
              borderRadius: isSelected ? 6 : 0,
            }}
          >
            {!isPh && hoverBlockId === c.id && (
              <HoverOpIconRow
                container={c}
                onPickKind={(k) => onPickHoverOp(c, k)}
              />
            )}
            <ContainerBlock
              container={c}
              highlighted={highlighted}
              dragOver={blockOver}
              onClick={() => actions.setHighlight(c.id)}
              onPlaceholderClick={() => onPlaceholderClick(c.id)}
              pcrPrimers={hlPcrTemplateId === c.id ? hlPcrSpans?.primers : undefined}
              pcrFlank={hlPcrTemplateId === c.id ? hlPcrSpans?.flank : undefined}
            />
            {c.pinned && (
              <button
                type="button"
                data-testid={`node-pin-badge-${c.id}`}
                title={STRINGS.canvasSkeleton.zones.pin.pinnedTooltip}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.setNodePinned('container', c.id, false);
                }}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  zIndex: 6,
                  width: 18,
                  height: 18,
                  padding: 0,
                  lineHeight: '18px',
                  fontSize: 11,
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                }}
              >📌</button>
            )}
          </div>
        );
      })}

      {/* A5 — wire preview во время drag-to-connect. */}
      {connecting && containerRef.current && (() => {
        const rect = containerRef.current.getBoundingClientRect();
        const fromPos = state.positions[connecting.from] || { x: 0, y: 0 };
        // FIX-9 follow-up: scale-correct toX/toY (canvas coords, не viewport).
        const toX = (connecting.x - rect.left + (containerRef.current.scrollLeft || 0)) / zoom;
        const toY = (connecting.y - rect.top + (containerRef.current.scrollTop || 0)) / zoom;
        // V67 — start from the container BORDER facing the cursor.
        const fcx = fromPos.x + 120;
        const fromX = toX >= fcx ? fromPos.x + BLOCK_LINEAR_W : fromPos.x;
        const fromY = fromPos.y + BLOCK_LINEAR_H / 2;
        return (
          <svg
            data-testid="skeleton-op-wire-preview"
            width="100%"
            height="100%"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 6,
              overflow: 'visible',
            }}
          >
            <path
              d={`M ${fromX} ${fromY} L ${toX} ${toY}`}
              stroke="#d97706"
              strokeWidth={2}
              strokeDasharray="6 3"
              fill="none"
            />
          </svg>
        );
      })()}

      {/* A4 (14.05.2026) — wire connections: container → op (input) и
          op → container (output). SVG layer over canvas. */}
      {state.operations.length > 0 && (
        <svg
          data-testid="skeleton-op-wires-svg"
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 3,
            overflow: 'visible',
          }}
        >
          <defs>
            <marker
              id="skeleton-op-wire-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,8 L7,4 z" fill="#94a3b8" />
            </marker>
            <marker
              id="skeleton-op-wire-arrow-active"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,8 L7,4 z" fill="#d97706" />
            </marker>
          </defs>
          {state.operations.flatMap((op) => {
            const opPos = op.position || { x: 0, y: 0 };
            const opRect = {
              x: opPos.x, y: opPos.y, w: OPERATION_NODE_W, h: OPERATION_NODE_H,
            };
            const isHi = state.highlightedContainerId === op.id;
            const stroke = isHi ? '#d97706' : '#94a3b8';
            const lines = [];
            for (const inputId of (op.inputs || [])) {
              const cPos = state.positions[inputId];
              if (!cPos) continue;
              // V67 / 17.05.2026 — anchor to whichever container side
              // faces the op (now 4-side via edgeAnchors, was L/R only).
              const ea = edgeAnchors(
                { x: cPos.x, y: cPos.y, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H },
                opRect,
              );
              lines.push(
                <path
                  key={`wire-in-${op.id}-${inputId}`}
                  data-testid="skeleton-op-wire"
                  data-from={inputId}
                  data-to={op.id}
                  d={ea.d}
                  stroke={stroke}
                  strokeWidth={isHi ? 2 : 1.2}
                  fill="none"
                  strokeDasharray="none"
                  markerEnd={isHi ? 'url(#skeleton-op-wire-arrow-active)' : 'url(#skeleton-op-wire-arrow)'}
                />,
              );
            }
            for (const outputId of (op.outputs || [])) {
              const cPos = state.positions[outputId];
              if (!cPos) continue;
              // V67 / 17.05.2026 — op → container, 4-side anchored.
              const ea = edgeAnchors(
                opRect,
                { x: cPos.x, y: cPos.y, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H },
              );
              lines.push(
                <path
                  key={`wire-out-${op.id}-${outputId}`}
                  data-testid="skeleton-op-wire"
                  data-from={op.id}
                  data-to={outputId}
                  d={ea.d}
                  stroke={stroke}
                  strokeWidth={isHi ? 2 : 1.2}
                  fill="none"
                  strokeDasharray="none"
                  markerEnd={isHi ? 'url(#skeleton-op-wire-arrow-active)' : 'url(#skeleton-op-wire-arrow)'}
                />,
              );
            }
            return lines;
          })}
        </svg>
      )}

      {/* K5 — Operations layer. Rendered above containers (zIndex 4),
          below highlighted state (zIndex 5). Каждая op в state.operations
          сидит на op.position абсолютным позиционированием. */}
      {state.operations.map((op) => (
        <div
          key={op.id}
          data-testid={`skeleton-op-wrap-${op.id}`}
          onPointerDown={(e) => onOperationPointerDown(e, op.id)}
          onDoubleClick={(e) => { e.stopPropagation(); actions.openEditorOpTab(op.id); }}
          style={{
            position: 'absolute',
            left: op.position?.x ?? 0,
            top: op.position?.y ?? 0,
            zIndex: dragging?.kind === 'operation' && dragging.id === op.id ? 6 : 4,
            touchAction: 'none',
          }}
        >
          <OperationNode
            operation={op}
            highlighted={state.highlightedContainerId === op.id}
            onClick={onOperationClick}
            onContextMenu={onOperationContextMenu}
          />
          {op.pinned && (
            <button
              type="button"
              data-testid={`node-pin-badge-${op.id}`}
              title={STRINGS.canvasSkeleton.zones.pin.pinnedTooltip}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                actions.setNodePinned('operation', op.id, false);
              }}
              style={{
                position: 'absolute',
                top: 0,
                right: -2,
                zIndex: 7,
                width: 16,
                height: 16,
                padding: 0,
                lineHeight: '16px',
                fontSize: 10,
                border: 'none',
                borderRadius: 4,
                background: 'var(--surface-2)',
                cursor: 'pointer',
              }}
            >📌</button>
          )}
        </div>
      ))}

      {/* A1 K7 — AssemblyDraft blocks (4th primary entity). Only those
          explicitly placed on canvas (position non-null, DEC-ASM-08);
          read-only minimal block, draggable. */}
      {(state.assemblyDrafts || []).filter((d) => d.position).map((d) => (
        <div
          key={d.id}
          data-testid={`assembly-draft-wrap-${d.id}`}
          onPointerDown={(e) => onAssemblyPointerDown(e, d.id)}
          style={{
            position: 'absolute',
            left: d.position?.x ?? 0,
            top: d.position?.y ?? 0,
            zIndex: dragging?.kind === 'assembly' && dragging.id === d.id ? 6 : 3,
            touchAction: 'none',
          }}
        >
          <AssemblyDraftBlock
            draft={d}
            isHighlighted={state.highlightedContainerId === d.id}
            isDragging={dragging?.kind === 'assembly' && dragging.id === d.id}
            onClick={() => actions.setHighlight(d.id)}
            onDoubleClick={() => actions.openEditorAssemblyTab(d.id)}
          />
        </div>
      ))}

      {/* F4 — virtual product previews (derived, not in state.containers).
          Rendered as dimmed siblings of real blocks. */}
      {virtualOutputs.map((v) => (
        <div
          key={v.id}
          data-testid={`skeleton-virtual-wrap-${v.opId}`}
          style={{
            position: 'absolute',
            left: v.position?.x ?? 0,
            top: v.position?.y ?? 0,
            zIndex: 3,
          }}
        >
          <ContainerBlock
            container={{ id: v.id, name: v.name, sequence: v.sequence || '', topology: v.topology }}
            virtualState={v.state}
            virtualWarnings={v.warnings}
            onClick={() => actions.setHighlight(v.id)}
            onDoubleClick={() => actions.openEditorTab(v.id)}
          />
        </div>
      ))}

      </div>
      {/* K5 — Op context menu (Delete / Re-execute placeholder).
          Re-execute шейпится в K9; здесь только delete + placeholder. */}
      {opContextMenu && (
        <div
          data-testid="skeleton-op-context-menu"
          data-operation-id={opContextMenu.operationId}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: opContextMenu.x,
            top: opContextMenu.y,
            zIndex: 50,
            background: 'var(--surface-1, #fff)',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 140,
            padding: 4,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            data-testid="skeleton-op-context-delete"
            onClick={onOpContextDelete}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >Удалить</button>
          <button
            type="button"
            data-testid="skeleton-op-context-rerun"
            disabled
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'not-allowed',
              color: 'var(--text-tertiary)',
            }}
            title="Re-execute — K9"
          >Перезапустить…</button>
          <button
            type="button"
            data-testid="skeleton-op-context-dismiss"
            onClick={onOpContextDismiss}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >Отмена</button>
        </div>
      )}

      {/* K6 — OpKindPicker (draft) + OpPopupRouter (committed+). */}
      {openPicker && pickerOp && (
        <>
          <div
            data-testid="skeleton-op-kind-picker-mount"
            data-operation-id={openPicker.operationId}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <OpKindPicker
            operation={pickerOp}
            position={{ x: openPicker.x, y: openPicker.y }}
            onPick={onPickerPickKind}
            onCancel={onPickerCancelOp}
          />
        </>
      )}
      {openPopup && popupOp && (
        <>
          <div
            data-testid="skeleton-op-popup-mount"
            data-operation-id={openPopup.operationId}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <OpPopupRouter
            operation={popupOp}
            position={{ x: openPopup.x, y: openPopup.y }}
            containers={state.containers}
            onCancel={onPopupCancel}
            onExecute={onPopupExecute}
          />
        </>
      )}

      {pickerForId && (
        <PlaceholderTreePicker
          onPick={onPickerPick}
          onCancel={onPickerCancel}
        />
      )}

      {opTemplatePicker && (() => {
        const op = state.operations.find((o) => o.id === opTemplatePicker.operationId);
        if (!op) return null;
        return (
          <OpRhombusTemplatePicker
            op={op}
            position={{ x: opTemplatePicker.x, y: opTemplatePicker.y }}
            containers={state.containers}
            onPick={onOpTemplatePick}
            onCancel={() => setOpTemplatePicker(null)}
          />
        );
      })()}
    </div>
      {/* B10 — Zoom controls live OUTSIDE the scroll container (in the
          non-scrolling wrapper) so they stay pinned to the panel
          corner while the canvas pans/scrolls (Игорь 17.05.2026). */}
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
      </div>
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
