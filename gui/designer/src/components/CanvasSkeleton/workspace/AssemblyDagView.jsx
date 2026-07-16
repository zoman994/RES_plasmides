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
import { derivePiecesToGraph } from '../lib/pieces-to-dag-preview';
import { fragmentCardInfo } from '../lib/fragment-card-info';
import { operationInfo } from '../lib/operation-info';
import ZoneGraphContent from '../canvas/ZoneGraphContent';
import FragmentInfoPanel from '../canvas/FragmentInfoPanel';
import OperationInfoPanel from '../canvas/OperationInfoPanel';
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
  // «Живой вывод из кусков» (Игорь 22.06): the DAG is a derived projection of the
  // recipe — picking a piece shows source→Cut→fragment immediately, no «Реализовать».
  // Fall back to the stored realised nodes when the zone has no pieces (back-compat
  // for already-materialised graphs).
  const {
    containers, operations, assemblyJunctions, ringCloses,
  } = useMemo(() => {
    const zone = (state.zones || []).find((z) => z.id === zoneId);
    const hasPieces = (state.pieces || []).some((p) => p.zoneId === zoneId);
    if (zone && hasPieces) return derivePiecesToGraph(state, zone);
    const nl = nodeListInZone(state, zoneId);
    return {
      containers: nl.containers, operations: nl.operations, assemblyJunctions: [], ringCloses: false,
    };
  }, [state, zoneId]);
  const empty = containers.length === 0 && operations.length === 0;
  // VERT-4 — orientation: 'LR' (horizontal temporal DAG, default) ↔ 'TB' (vertical
  // assembler — chain stacks top→bottom, fragments showing их липкие концы). The
  // footprint transposes, so the scroll spacer / fit reads the direction-aware bbox.
  const [orient, setOrient] = useState('LR');
  const vertical = orient === 'TB';
  // Ф1 (Игорь 27.06) — ручная раскладка карточек по сетке. Только в TB
  // («вертикальный сборщик»): id→{x,y} привязанные к ячейке через snapToGrid.
  // LR — временная DAG, drag отключён. «Сбросить раскладку» очищает overrides.
  const [overrides, setOverrides] = useState({});
  const onNodeDragEnd = useCallback(
    (id, snapped) => setOverrides((o) => ({ ...o, [id]: { x: snapped.x, y: snapped.y } })),
    [],
  );
  const onResetLayout = useCallback(() => setOverrides({}), []);
  const hasOverrides = vertical && Object.keys(overrides).length > 0;

  // Ф3 (Игорь 27.06) — «Объединить в кольцо» = компоновочный жест: выделить ≥2 карточки
  // фрагментов и нажать кнопку → выставить кольцевую топологию (SET_ZONE_TOPOLOGY), после
  // чего derive САМ дорисует операцию замыкания (лигирование) → кольцевой продукт
  // («компоновка без реакции невозможна»). Только в вертикали.
  const [selectedIds, setSelectedIds] = useState([]);
  // CANVAS-CLICK-1 — single click selects a card and opens its info panel (the engineer
  // sees WHAT the fragment is). Independent of the ring multiselect (Ф3, vertical only).
  // CANVAS-CLICK-2 — clicking a reaction node opens an operation info panel (mutually
  // exclusive with the fragment panel — one inspector at a time).
  const [infoId, setInfoId] = useState(null);
  const [opInfoId, setOpInfoId] = useState(null);
  const ringableIds = useMemo(
    () => new Set(
      (containers || [])
        .filter((c) => c && c._role !== 'source' && c._role !== 'product')
        .map((c) => c.id),
    ),
    [containers],
  );
  const onContainerClick = useCallback((id) => {
    if (actions.setHighlight) actions.setHighlight(id);
    setInfoId(id); // CANVAS-CLICK-1 — show the clicked card's details (any orientation/role)
    setOpInfoId(null); // one inspector at a time
    if (!vertical || !ringableIds.has(id)) return; // в LR — только инфо; не-фрагменты не выбираем для кольца
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, [actions, vertical, ringableIds]);
  const onOperationClick = useCallback((op) => {
    if (op && op.id) { setOpInfoId(op.id); setInfoId(null); } // CANVAS-CLICK-2 — show reaction details
  }, []);
  // The clicked card always shows a selection outline (ZoneGraphContent renders selectedIds),
  // merged with the ring multiselect in vertical so both stay visible.
  const outlineIds = useMemo(() => {
    const base = vertical ? selectedIds : [];
    if (infoId && !base.includes(infoId)) return [...base, infoId];
    return base;
  }, [vertical, selectedIds, infoId]);
  const infoContainer = useMemo(
    () => (infoId ? (containers || []).find((c) => c.id === infoId) : null),
    [infoId, containers],
  );
  const cardInfo = useMemo(() => fragmentCardInfo(infoContainer), [infoContainer]);
  const opInfo = useMemo(
    () => operationInfo((operations || []).find((o) => o.id === opInfoId), containers),
    [opInfoId, operations, containers],
  );
  const selectedRingable = useMemo(
    () => selectedIds.filter((id) => ringableIds.has(id)),
    [selectedIds, ringableIds],
  );
  const isCircular = useMemo(() => {
    const z = (state.zones || []).find((zz) => zz.id === zoneId);
    return !!(z && z.topology && z.topology.circular);
  }, [state.zones, zoneId]);
  const canRing = vertical && selectedRingable.length >= 2 && !isCircular;
  const onRing = useCallback(() => {
    if (actions.zoneDispatch) {
      actions.zoneDispatch({ type: 'SET_ZONE_TOPOLOGY', zoneId, circular: true });
    }
    setSelectedIds([]);
  }, [actions, zoneId]);
  const { width: contentW, height: contentH } = useMemo(
    () => graphContentBBox(containers, operations, orient, vertical ? overrides : undefined),
    [containers, operations, orient, vertical, overrides],
  );
  // VERT — in TB the fragment cards' sticky-end nucleotides PROTRUDE past the box
  // left/right edges, so reserve extra HORIZONTAL padding around the scaled content
  // (and in the scroll spacer) so the canvas never clips them (Игорь 27.06 «панель не
  // должна обрезать нуклеотиды»).
  const padX = orient === 'TB' ? PAD + 70 : PAD;

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
            Добавьте фрагменты во вкладке Sequence — граф появится автоматически.
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
                width: (contentW + padX * 2) * zoom,
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
                padding: `${PAD}px ${padX}px`,
              }}
            >
              <ZoneGraphContent
                containers={containers}
                operations={operations}
                direction={orient}
                highlightedId={state.highlightedContainerId}
                onContainerClick={onContainerClick}
                onContainerDoubleClick={(id) => actions.openEditorViewOnly && actions.openEditorViewOnly(id)}
                onOperationClick={onOperationClick}
                // Ф1 — drag по сетке только в вертикальном сборщике; zoom нужен для
                // перевода экранной дельты в мир (узлы внутри scale()-обёртки).
                draggable={vertical}
                positionOverrides={vertical ? overrides : undefined}
                onNodeDragEnd={onNodeDragEnd}
                zoom={zoom}
                // Ф2 — стыки сборки только в вертикали: притяжение совместимых концов + замок.
                junctions={vertical ? assemblyJunctions : undefined}
                // Ф4.4 — продукт лигирования = КОЛЬЦО, если концы сборки замыкаются.
                ringCloses={ringCloses}
                // Ф3 — мультивыбор фрагментов для «Объединить в кольцо» (только TB) +
                // CANVAS-CLICK-1 — обводка кликнутой карточки (в любой ориентации).
                selectedIds={outlineIds.length ? outlineIds : undefined}
              />
            </div>
          </>
        )}
      </div>
      {/* Orientation toggle — horizontal (LR) ↔ vertical (TB) DAG. Pinned top-left,
          outside the scroll host. Vertical = «второй вариант DAG» с хвостами стыков. */}
      {!empty && (
        <div
          data-testid="assembly-dag-orient-controls"
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 5,
            display: 'flex', gap: 2,
            background: 'var(--surface-1, #fff)',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 6,
            padding: 2,
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        >
          <button
            type="button"
            data-testid="assembly-dag-orient-lr"
            data-active={orient === 'LR' ? 'true' : 'false'}
            onClick={() => setOrient('LR')}
            title="Горизонтально (слева направо)"
            aria-label="Горизонтальный DAG"
            style={{
              ...zoomBtnStyle,
              width: 30,
              background: orient === 'LR' ? 'var(--accent-50, #eef2ff)' : 'transparent',
              color: orient === 'LR' ? 'var(--accent-700, #4338ca)' : 'var(--text-primary)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="6" width="4" height="4" rx="1" />
              <rect x="11" y="6" width="4" height="4" rx="1" />
              <path d="M5 8h6" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="assembly-dag-orient-tb"
            data-active={orient === 'TB' ? 'true' : 'false'}
            onClick={() => setOrient('TB')}
            title="Вертикально (сверху вниз) — с липкими концами"
            aria-label="Вертикальный DAG"
            style={{
              ...zoomBtnStyle,
              width: 30,
              background: orient === 'TB' ? 'var(--accent-50, #eef2ff)' : 'transparent',
              color: orient === 'TB' ? 'var(--accent-700, #4338ca)' : 'var(--text-primary)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="1" width="4" height="4" rx="1" />
              <rect x="6" y="11" width="4" height="4" rx="1" />
              <path d="M8 5v6" />
            </svg>
          </button>
        </div>
      )}
      {/* CANVAS-CLICK-1 — info panel for the clicked card (pinned top-right). */}
      <FragmentInfoPanel
        info={cardInfo}
        onClose={() => setInfoId(null)}
        onOpen={infoId && actions.openEditorViewOnly
          ? () => actions.openEditorViewOnly(infoId)
          : undefined}
      />
      {/* CANVAS-CLICK-2 / V139 — info panel for the clicked reaction (Cut/Ligate/ромб). */}
      <OperationInfoPanel info={opInfo} onClose={() => setOpInfoId(null)} />
      {/* Ф1 — «Сбросить раскладку»: вернуть карточки в авто dagre-слоты. Видна
          только когда есть ручные перетаскивания (TB). */}
      {hasOverrides && (
        <button
          type="button"
          data-testid="assembly-dag-reset-layout"
          onClick={onResetLayout}
          title="Сбросить раскладку (вернуть авто)"
          aria-label="Сбросить раскладку"
          style={{
            position: 'absolute', top: 12, left: 92, zIndex: 5,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 28, padding: '0 9px',
            background: 'var(--surface-1, #fff)',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 6,
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            cursor: 'pointer',
            fontSize: 11.5,
            color: 'var(--text-primary)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 8a6 6 0 1 1 1.8 4.3" />
            <path d="M2 12.5V8.5h4" />
          </svg>
          Сбросить раскладку
        </button>
      )}
      {/* Ф3 — «Объединить в кольцо»: компоновочный жест над выбранными фрагментами.
          Внизу по центру, появляется при ≥2 выбранных карточках (TB, линейная сборка). */}
      {canRing && (
        <button
          type="button"
          data-testid="assembly-dag-ring-btn"
          onClick={onRing}
          title="Замкнуть выбранные фрагменты в кольцо (добавит реакцию лигирования → кольцевой продукт)"
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 16px',
            background: 'var(--accent-500, #d97706)', color: '#fff',
            border: 'none', borderRadius: 18,
            boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
            cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
          </svg>
          Объединить в кольцо
          <span style={{
            fontSize: 11, fontWeight: 500, opacity: 0.85,
            background: 'rgba(255,255,255,0.22)', borderRadius: 9, padding: '1px 7px',
          }}
          >
            {selectedRingable.length}
          </span>
        </button>
      )}
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
