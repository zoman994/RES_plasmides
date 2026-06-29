/**
 * ZoneGraphContent — shared graph renderer (Sprint V114 K1).
 *
 * Extracted verbatim from CanvasGraphView's graph core: given already-filtered
 * `containers` + `operations`, builds the bipartite graph via
 * `buildGraphNodesEdges`, lays it out with the local dagre
 * (`computeGraphPositions`, LR from 0,0), and draws the SVG edge layer +
 * `ContainerBlock`/`OperationNode` nodes inside a relative-positioned box
 * sized to the graph bounds.
 *
 * Two consumers:
 *   - `CanvasGraphView` (DAG view) — passes full `state.containers/operations`
 *     + its op-picker / placeholder callbacks. The DAG view's existing tests
 *     guard that this extraction renders identically.
 *   - `ZoneFrame` graph-mode (V114 K2) — passes the zone's nodes filtered by
 *     `nodeListInZone`, so Layout shows the assembly graph inside the frame.
 *
 * Pure: every interaction is an optional callback — with none passed the nodes
 * are decorative (no handler, no crash). Node wrappers are `pointer-events:auto`
 * so they stay clickable even when the host body is `pointer-events:none`
 * (DEC-T4-04 zone body).
 */
import {
  useMemo, useId, useState, useRef, useCallback, Fragment,
} from 'react';
import ContainerBlock from './ContainerBlock';
import OperationNode from './OperationNode';
import {
  buildGraphNodesEdges,
  computeGraphPositions,
  getBlockSize,
  OPERATION_NODE_W,
  OPERATION_NODE_H,
  BLOCK_LINEAR_W,
  BLOCK_LINEAR_H,
  GRID_COL_W,
  edgeAnchors,
  snapToGrid,
} from './canvas-layout';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';
import { edgeColorFor, OP_NEUTRAL } from './op-colors';
import { synthLigation } from '../lib/pieces-to-dag-preview';
import { RE_ENZYMES } from '../../../restriction-db';

const EMPTY = [];
const EMPTY_OBJ = {};
const DRAG_THRESHOLD = 3;
const LIG_GAP = 28; // вертикальный зазор фрагмент→операция→продукт

export default function ZoneGraphContent({
  containers = EMPTY,
  operations = EMPTY,
  highlightedId = null,
  onContainerClick,
  onContainerDoubleClick,
  onOperationClick,
  onOperationContextMenu,
  onPlaceholderClick,
  // VERT-4 — 'LR' (default, horizontal temporal DAG) or 'TB' (vertical assembler:
  // chain stacks source→op→fragment→product top→bottom, fragments draw их липкие
  // концы via StickyEndFragment). Threaded into the dagre layout AND the edge-anchor
  // flow so wires exit the bottom / enter the top instead of right/left.
  direction = 'LR',
  // Ф1 (Игорь 27.06) — opt-in перетаскивание карточек по сетке. Дефолт выкл →
  // поведение прежнее (ZoneFrame регресс безопасен). `positionOverrides`
  // (id→{x,y}, привязанные к сетке) перекрывают авто-слот dagre; перетаскивание
  // карточки зовёт `onNodeDragEnd(id, snapped)`. `zoom` нужен, т.к. узлы живут
  // внутри scale()-обёртки — экранную дельту делим на zoom, чтобы мир совпал.
  draggable = false,
  positionOverrides = EMPTY_OBJ,
  onNodeDragEnd,
  zoom = 1,
  // Ф2/Ф4.3 — стыки сборки [{fromId,toId,verdict,overhang,enzyme,blunt}] (from.right ↔
  // to.left). Когда два совместимых фрагмента сведены в одну строку рядом, между ними
  // РОЖДАЕТСЯ реакция: узел «Лигирование» + карточка-продукт ниже (synthLigation).
  junctions = EMPTY,
  // Ф4.4 — продукт лигирования = КОЛЬЦО, если концы сборки замыкаются (orient.closes).
  // Тогда продукт-карточка рисуется кольцевой плазмидой (карта), а не линейным концатом.
  ringCloses = false,
  // Ф3 — мультивыбор карточек-фрагментов (компоновочный жест «выделить → объединить
  // в кольцо»). Выбранные получают акцентное кольцо. Дефолт пуст → ничего не выделено.
  selectedIds = EMPTY,
}) {
  const vertical = direction === 'TB';
  const selectedSet = useMemo(
    () => new Set(Array.isArray(selectedIds) ? selectedIds : []),
    [selectedIds],
  );
  // commits are legacy V1 and always empty on the V2 canvas (spec §5) → [].
  const { nodes, edges } = useMemo(
    () => buildGraphNodesEdges(containers, [], operations),
    [containers, operations],
  );
  const positions = useMemo(
    () => computeGraphPositions(containers, [], operations, direction),
    [containers, operations, direction],
  );
  // DAG bp→bar scale (Игорь 26.06): the largest molecule in the graph. Fed to every
  // ContainerBlock so linear-fragment strips shrink ∝ bp and read smaller than the
  // plasmid rings — kills the «маленький фрагмент выглядит больше плазмиды» dissonance.
  const maxBp = useMemo(() => {
    let m = 1;
    for (const c of (Array.isArray(containers) ? containers : [])) {
      const len = (c && (c.length || (c.sequence || '').length)) || 0;
      if (len > m) m = len;
    }
    return m;
  }, [containers]);

  // Ф1 — drag-обвязка. `drag` = транзиентная позиция таскаемого узла (следует за
  // курсором до отпускания), затем snapToGrid в onNodeDragEnd. posOf = override
  // (привязка к сетке) ?? авто-слот; effPos добавляет транзиентный drag сверху.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const posOf = useCallback(
    (id) => positionOverrides[id] || positions[id] || { x: 0, y: 0 },
    [positionOverrides, positions],
  );
  const effPos = (id) => (drag && drag.id === id ? { x: drag.x, y: drag.y } : posOf(id));

  const onNodePointerDown = (e, id) => {
    if (!draggable || e.button !== 0) return;
    const base = posOf(id);
    dragRef.current = {
      id, sx: e.clientX, sy: e.clientY, bx: base.x, by: base.y, moved: false,
    };
    setDrag({ id, x: base.x, y: base.y });
    if (e.currentTarget.setPointerCapture && e.pointerId != null) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    }
  };
  const onNodePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const z = zoom || 1;
    const dx = (e.clientX - d.sx) / z;
    const dy = (e.clientY - d.sy) / z;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true;
    setDrag({ id: d.id, x: d.bx + dx, y: d.by + dy });
  };
  const onNodePointerUp = (e) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.moved) {
      const z = zoom || 1;
      const snapped = snapToGrid({
        x: d.bx + (e.clientX - d.sx) / z,
        y: d.by + (e.clientY - d.sy) / z,
      });
      // Привязка к сетке. Сведение к совместимому соседу (та же строка, рядом) рождает
      // реакцию лигирования + продукт — это считается ниже при рендере, не на drop'е.
      suppressClickRef.current = true; // не давать drag'у дёрнуть клик-хайлайт
      if (onNodeDragEnd) onNodeDragEnd(d.id, snapped);
    }
    setDrag(null);
  };

  // Unique arrow-marker id per instance: multiple zone graphs can mount on the
  // same Layout canvas, and a shared static id ("skeleton-arrow") would be a
  // duplicate DOM id across <svg>s.
  const rawId = useId();
  const arrowId = `zgc-arrow-${rawId.replace(/[:]/g, '')}`;

  // Canvas bounds for the SVG layer — same formula as CanvasGraphView.bounds
  // (max node coordinate + footprint + 80 padding, floored at 800×600).
  const bounds = useMemo(() => {
    let maxX = 800;
    let maxY = 600;
    for (const n of nodes) {
      // Override (Ф1 grid placement) wins so the box grows to cover a dragged card.
      const pos = positionOverrides[n.id] || positions[n.id] || { x: 0, y: 0 };
      const size = n.data.kind === 'container'
        ? getBlockSize(n.data.container)
        : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
      maxX = Math.max(maxX, pos.x + size.width + 80);
      maxY = Math.max(maxY, pos.y + size.height + 80);
    }
    return { width: maxX, height: maxY };
  }, [nodes, positions, positionOverrides]);

  // Ф4.3 — РЕАКЦИЯ при сведении (Игорь 27.06: «свёл объекты → между ними действие (ромб),
  // и от него вниз рождается карточка-продукт со слепленными нуклеотидами»). Когда два
  // совместимых фрагмента сведены в одну строку рядом (та же строка, в пределах ~клетки) —
  // synthLigation даёт узел «Лигирование» + продукт-карточку с восстановленным сайтом; они
  // рисуются НИЖЕ, под серединой пары, рёбрами фрагменты→операция→продукт.
  const idToContainer = useMemo(() => {
    const m = {};
    for (const n of nodes) if (n.data.kind === 'container') m[n.id] = n.data.container;
    return m;
  }, [nodes]);
  // If the derive already synthesized a product (e.g. circular closure), it owns the join —
  // don't ALSO draw a view-level linear ligation (would double the product).
  const hasDerivedProduct = (Array.isArray(containers) ? containers : [])
    .some((c) => c && c._role === 'product');
  const matedLigations = (hasDerivedProduct ? [] : (Array.isArray(junctions) ? junctions : []))
    .filter((j) => j && j.verdict === 'compatible')
    .map((j) => {
      const a = idToContainer[j.fromId];
      const b = idToContainer[j.toId];
      if (!a || !b) return null;
      const hasA = !!(positionOverrides[j.fromId] || positions[j.fromId]);
      const hasB = !!(positionOverrides[j.toId] || positions[j.toId]);
      if (!hasA || !hasB) return null;
      const pa = effPos(j.fromId);
      const pb = effPos(j.toId);
      const sameRow = Math.abs(pa.y - pb.y) <= BLOCK_LINEAR_H / 2;
      const lx = Math.min(pa.x, pb.x);
      const rx = Math.max(pa.x, pb.x);
      const gap = rx - (lx + BLOCK_LINEAR_W);
      const adjacent = sameRow && gap >= -BLOCK_LINEAR_W / 2 && gap <= GRID_COL_W * 1.2;
      if (!adjacent) return null;
      const { op, product } = synthLigation(a, b, j, RE_ENZYMES, { circular: ringCloses });
      const midX = (lx + rx + BLOCK_LINEAR_W) / 2;
      const fragBottom = Math.max(pa.y, pb.y) + BLOCK_LINEAR_H;
      const opY = fragBottom + LIG_GAP;
      const prodY = opY + OPERATION_NODE_H + LIG_GAP;
      return {
        key: `${j.fromId}-${j.toId}`,
        op,
        product,
        pa,
        pb,
        opPos: { x: midX - OPERATION_NODE_W / 2, y: opY },
        prodPos: { x: midX - BLOCK_LINEAR_W / 2, y: prodY },
      };
    })
    .filter(Boolean);

  // Footprint must also cover the synthesized ligation op + product, else the spacer/svg
  // clip them (they live BELOW the fragment row, outside the dagre `bounds`).
  let fbW = bounds.width;
  let fbH = bounds.height;
  for (const ml of matedLigations) {
    fbW = Math.max(fbW, ml.prodPos.x + BLOCK_LINEAR_W + 80, ml.opPos.x + OPERATION_NODE_W + 80);
    fbH = Math.max(fbH, ml.prodPos.y + BLOCK_LINEAR_H + 80);
  }
  const fullBounds = { width: fbW, height: fbH };

  return (
    <div
      data-testid="zone-graph-content"
      data-direction={direction}
      style={{ position: 'relative', width: fullBounds.width, height: fullBounds.height }}
    >
      {/* Edges SVG layer */}
      <svg
        width={fullBounds.width}
        height={fullBounds.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {edges.map((e) => {
          // effPos so a dragged card's wires follow it live (override + transient drag).
          const a = effPos(e.from);
          const b = effPos(e.to);
          const fromNode = nodes.find((n) => n.id === e.from);
          const toNode = nodes.find((n) => n.id === e.to);
          if (!fromNode || !toNode) return null;
          // Use the node's OWN footprint (buildGraphNodesEdges sets node.width/
          // height — block 240×150 vs op 120×60). The old `fromNode.kind` check
          // was always undefined (kind lives at node.data.kind) → every edge
          // anchored with op-size, so lines left a container at its middle/top,
          // not its right-edge centre — «стрелки налезают на центр» (Игорь 11.06).
          const ea = edgeAnchors(
            { x: a.x, y: a.y, w: fromNode.width, h: fromNode.height },
            { x: b.x, y: b.y, w: toNode.width, h: toNode.height },
            // LR → clean right→left connectors (Игорь 11.06); TB → bottom→top (вертикаль).
            { flow: direction },
          );
          // K6 — the wire inherits the colour of the reaction it connects to,
          // so a Gibson edge / digest edge / ligation edge read without a click.
          const edgeStroke = edgeColorFor(fromNode, toNode);
          return (
            <path
              key={e.id}
              d={ea.d}
              stroke={edgeStroke}
              strokeWidth={1.5}
              fill="none"
              markerEnd={`url(#${arrowId})`}
            />
          );
        })}
        {/* Ф4.3/4.4 — рёбра реакции: входы фрагментов идут в БОКА ромба (левая/правая
            вершины, Игорь 27.06 «стрелки от фрагментов должны идти к бокам ромба»), выход
            продукта — из нижней вершины. */}
        {matedLigations.flatMap((ml) => {
          const opCx = ml.opPos.x + OPERATION_NODE_W / 2;
          const opCy = ml.opPos.y + OPERATION_NODE_H / 2;
          const leftV = { x: ml.opPos.x, y: opCy };
          const rightV = { x: ml.opPos.x + OPERATION_NODE_W, y: opCy };
          const bottomV = { x: opCx, y: ml.opPos.y + OPERATION_NODE_H };
          const lp = ml.pa.x <= ml.pb.x ? ml.pa : ml.pb;
          const rp = ml.pa.x <= ml.pb.x ? ml.pb : ml.pa;
          const lf = { x: lp.x + BLOCK_LINEAR_W / 2, y: lp.y + BLOCK_LINEAR_H };
          const rf = { x: rp.x + BLOCK_LINEAR_W / 2, y: rp.y + BLOCK_LINEAR_H };
          const prodTop = { x: ml.prodPos.x + BLOCK_LINEAR_W / 2, y: ml.prodPos.y };
          // input → side vertex, approached horizontally from outside; output → vertical S.
          const toSide = (a, v, dir) => `M ${a.x} ${a.y} C ${a.x} ${a.y + 36}, ${v.x + dir * 44} ${v.y}, ${v.x} ${v.y}`;
          const vert = (a, b) => `M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`;
          return [
            <path key={`${ml.key}-a`} d={toSide(lf, leftV, -1)} stroke={OP_NEUTRAL.stroke} strokeWidth={1.5} fill="none" markerEnd={`url(#${arrowId})`} />,
            <path key={`${ml.key}-b`} d={toSide(rf, rightV, 1)} stroke={OP_NEUTRAL.stroke} strokeWidth={1.5} fill="none" markerEnd={`url(#${arrowId})`} />,
            <path key={`${ml.key}-p`} d={vert(bottomV, prodTop)} stroke={OP_NEUTRAL.stroke} strokeWidth={1.5} fill="none" markerEnd={`url(#${arrowId})`} />,
          ];
        })}
        <defs>
          <marker
            id={arrowId}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={OP_NEUTRAL.stroke} />
          </marker>
        </defs>
      </svg>

      {/* Nodes */}
      {nodes.map((n) => {
        const pos = effPos(n.id);
        if (n.data.kind === 'container') {
          // Placeholder containers ("+ Пусто") are not rendered (AE-K9.6).
          if (isPlaceholderContainer(n.data.container)) return null;
          const highlighted = highlightedId === n.id;
          const dragging = !!(drag && drag.id === n.id);
          const selected = selectedSet.has(n.id);
          return (
            <div
              key={n.id}
              data-testid={`zone-graph-node-${n.id}`}
              data-selected={selected ? 'true' : undefined}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                zIndex: dragging ? 6 : (selected ? 3 : 2),
                pointerEvents: 'auto',
                // CANVAS-CLICK-3 — cursor matches behaviour: drag surfaces grab/grabbing;
                // a clickable card (onContainerClick wired) shows pointer; inert → default.
                cursor: draggable
                  ? (dragging ? 'grabbing' : 'grab')
                  : (onContainerClick ? 'pointer' : undefined),
                touchAction: draggable ? 'none' : undefined,
                // Ф3 — акцентное кольцо выбранной для кольцевания карточки.
                outline: selected ? '2px solid var(--accent-500, #d97706)' : undefined,
                outlineOffset: selected ? 2 : undefined,
                borderRadius: selected ? 10 : undefined,
              }}
              onPointerDown={draggable ? (e) => onNodePointerDown(e, n.id) : undefined}
              onPointerMove={draggable ? onNodePointerMove : undefined}
              onPointerUp={draggable ? onNodePointerUp : undefined}
              onClick={onContainerClick ? (e) => {
                // A grid-drag (moved) must not also fire the click-highlight.
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                onContainerClick(n.id, e); // e → host can anchor a popup at the click (CANVAS-CLICK-3)
              } : undefined}
              onDoubleClick={onContainerDoubleClick ? () => onContainerDoubleClick(n.id) : undefined}
            >
              <ContainerBlock
                container={n.data.container}
                highlighted={highlighted}
                maxBp={maxBp}
                showTails={vertical}
                // V169 — a derived product flagged impossible (incompatible ends) renders via
                // VirtualBlock «disconnected» (red broken ring + reason) instead of a sealed plasmid.
                virtualState={n.data.container._virtualState}
                virtualWarnings={n.data.container._virtualWarnings}
                onPlaceholderClick={onPlaceholderClick ? () => onPlaceholderClick(n.id) : undefined}
              />
            </div>
          );
        }
        // operation node — V2 (operations) or legacy V1 (commits)
        const opData = n.data.operation || null;
        const commitData = n.data.commit || null;
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute', left: pos.x, top: pos.y, zIndex: 2, pointerEvents: 'auto',
            }}
          >
            <OperationNode
              operation={opData}
              commit={commitData}
              onClick={opData && onOperationClick ? onOperationClick : undefined}
              onContextMenu={opData && onOperationContextMenu ? onOperationContextMenu : undefined}
            />
          </div>
        );
      })}

      {/* Ф4.3 — РЕАКЦИЯ при сведении: узел «Лигирование» (ромб) между фрагментами + ниже
          карточка-продукт со слепленными нуклеотидами и восстановленным сайтом. Никакого
          плавающего шва — стык виден как реакция → продукт. */}
      {matedLigations.map((ml) => (
        <Fragment key={ml.key}>
          <div
            data-testid={`dag-ligation-op-${ml.key}`}
            style={{
              position: 'absolute', left: ml.opPos.x, top: ml.opPos.y, zIndex: 4, pointerEvents: 'auto',
            }}
          >
            <OperationNode operation={ml.op} />
          </div>
          <div
            data-testid={`dag-ligation-product-${ml.key}`}
            style={{
              position: 'absolute', left: ml.prodPos.x, top: ml.prodPos.y, zIndex: 3, pointerEvents: 'auto',
            }}
          >
            <ContainerBlock
              container={ml.product}
              maxBp={maxBp}
              // Кольцевой продукт = карта плазмиды (MiniPlasmidMap), без липких хвостов.
              showTails={vertical && !(ml.product.topology && ml.product.topology.circular)}
            />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
