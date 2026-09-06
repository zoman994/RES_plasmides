import {
  PRIMER_LABEL_GAP,
  PRIMER_LABEL_HEIGHT,
  PRIMER_INSERTION_FONT_SIZE,
  PRIMER_STEP_OFFSET,
  PRIMER_TAIL_OFFSET,
  primerInsertionGeometry,
} from './primer-track-layout';

export const PRIMER_GLYPH_HEIGHT = 14;
export {
  PRIMER_LABEL_GAP,
  PRIMER_LABEL_HEIGHT,
  PRIMER_INSERTION_FONT_SIZE,
  PRIMER_STEP_OFFSET,
  PRIMER_TAIL_OFFSET,
};
export const PRIMER_ARROW_HEAD = 6;
export const PRIMER_LABEL_FONT_SIZE = 9;
export const PRIMER_LABEL_CHAR_WIDTH = 5.5;
export const PRIMER_GLYPH_ROW_STRIDE = PRIMER_GLYPH_HEIGHT + PRIMER_STEP_OFFSET + 6;
const PRIMER_INSERTION_HEIGHT = 12;
const PRIMER_INSERTION_INSET = (PRIMER_GLYPH_HEIGHT - PRIMER_INSERTION_HEIGHT) / 2;
const PRIMER_SELECTION_BRACKET_ARM = 4;

function primerLaneY(direction, lane) {
  const forward = direction !== 'reverse';
  if (lane === 'tail') return forward
    ? PRIMER_STEP_OFFSET - PRIMER_TAIL_OFFSET
    : PRIMER_TAIL_OFFSET;
  if (lane === 'outer') return forward ? 0 : PRIMER_STEP_OFFSET;
  return forward ? PRIMER_STEP_OFFSET : 0;
}

function groupGlyphRuns(glyphs, detached) {
  const runs = [];
  for (let index = 0; index < glyphs.length; index += 1) {
    const op = glyphs[index]?.op || 'M';
    // A substitution still occupies one template coordinate. Keep it in the
    // binding row and express the difference with danger colour; only bases
    // without a paired template position belong in the outer lane.
    const lane = detached ? 'outer' : 'template';
    const previous = runs[runs.length - 1];
    if (op !== 'D' && previous && previous.op === op && previous.lane === lane
      && previous.end === index) {
      previous.end = index + 1;
    } else {
      runs.push({ op, lane, start: index, end: index + 1 });
    }
  }
  return runs;
}

function connectorBoundaries(runs) {
  const out = [];
  for (let index = 1; index < runs.length; index += 1) {
    const before = runs[index - 1];
    const after = runs[index];
    if (before.op !== 'D' && after.op !== 'D' && before.lane !== after.lane) {
      out.push({ boundary: after.start, from: before.lane, to: after.lane });
    }
  }
  return out;
}

function compactBackboneRuns(runs) {
  const out = [];
  for (const run of runs) {
    const previous = out[out.length - 1];
    if (run.op !== 'D' && previous?.op !== 'D' && previous?.lane === run.lane
      && previous?.end === run.start) {
      previous.end = run.end;
    } else {
      out.push({ ...run, op: run.op === 'D' ? 'D' : 'paired' });
    }
  }
  return out;
}

function arrowHeadPath(isFwd, width, laneY) {
  const middle = laneY + PRIMER_GLYPH_HEIGHT / 2;
  return isFwd
    ? `M${width},${laneY} L${width + PRIMER_ARROW_HEAD},${middle} L${width},${laneY + PRIMER_GLYPH_HEIGHT} Z`
    : `M0,${laneY} L${-PRIMER_ARROW_HEAD},${middle} L0,${laneY + PRIMER_GLYPH_HEIGHT} Z`;
}

const cleanCoordinate = (value) => Number(Number(value).toFixed(4));
const pointKey = ([x, y]) => `${x}|${y}`;

function unionRectangleLoops(rectangles) {
  const rects = rectangles
    .map(({ x, y, width, height }) => ({
      x1: cleanCoordinate(x),
      y1: cleanCoordinate(y),
      x2: cleanCoordinate(x + width),
      y2: cleanCoordinate(y + height),
    }))
    .filter(({ x1, y1, x2, y2 }) => x2 > x1 && y2 > y1);
  if (!rects.length) return [];
  const xs = [...new Set(rects.flatMap(({ x1, x2 }) => [x1, x2]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(({ y1, y2 }) => [y1, y2]))].sort((a, b) => a - b);
  const occupied = Array.from({ length: ys.length - 1 }, () => Array(xs.length - 1).fill(false));
  for (let row = 0; row < ys.length - 1; row += 1) {
    for (let column = 0; column < xs.length - 1; column += 1) {
      const cx = (xs[column] + xs[column + 1]) / 2;
      const cy = (ys[row] + ys[row + 1]) / 2;
      occupied[row][column] = rects.some((rect) => (
        cx >= rect.x1 && cx < rect.x2 && cy >= rect.y1 && cy < rect.y2
      ));
    }
  }
  const edges = [];
  const add = (a, b) => edges.push({ a, b });
  for (let row = 0; row < occupied.length; row += 1) {
    for (let column = 0; column < occupied[row].length; column += 1) {
      if (!occupied[row][column]) continue;
      const x1 = xs[column]; const x2 = xs[column + 1];
      const y1 = ys[row]; const y2 = ys[row + 1];
      if (!occupied[row - 1]?.[column]) add([x1, y1], [x2, y1]);
      if (!occupied[row]?.[column + 1]) add([x2, y1], [x2, y2]);
      if (!occupied[row + 1]?.[column]) add([x2, y2], [x1, y2]);
      if (!occupied[row]?.[column - 1]) add([x1, y2], [x1, y1]);
    }
  }
  const starts = new Map();
  edges.forEach((edge, index) => {
    const key = pointKey(edge.a);
    starts.set(key, [...(starts.get(key) || []), index]);
  });
  const unused = new Set(edges.map((_, index) => index));
  const loops = [];
  while (unused.size) {
    const first = unused.values().next().value;
    unused.delete(first);
    const loop = [edges[first].a, edges[first].b];
    const start = pointKey(edges[first].a);
    let cursor = pointKey(edges[first].b);
    while (cursor !== start) {
      const next = (starts.get(cursor) || []).find((index) => unused.has(index));
      if (next == null) break;
      unused.delete(next);
      loop.push(edges[next].b);
      cursor = pointKey(edges[next].b);
    }
    if (cursor !== start) continue;
    loop.pop();
    let changed = true;
    while (changed && loop.length > 4) {
      changed = false;
      for (let index = 0; index < loop.length; index += 1) {
        const before = loop[(index - 1 + loop.length) % loop.length];
        const current = loop[index];
        const after = loop[(index + 1) % loop.length];
        if ((before[0] === current[0] && current[0] === after[0])
          || (before[1] === current[1] && current[1] === after[1])) {
          loop.splice(index, 1);
          changed = true;
          break;
        }
      }
    }
    loops.push(loop);
  }
  return loops;
}

function occupiedEnvelopePath({
  runs, insertions, clipOffset, charPx, inlineTail, tailX, tailWidth,
  tailY, insertionY, insertionYs, laneYOf, isFwd, width, headHere, headY,
}) {
  const rectangles = runs
    .filter((run) => run.op !== 'D')
    .map((run) => ({
      x: run.start * charPx,
      y: laneYOf(run.lane),
      width: (run.end - run.start) * charPx,
      height: PRIMER_GLYPH_HEIGHT,
    }));
  for (const [insertionIndex, insertion] of (insertions || []).entries()) {
    const geometry = primerInsertionGeometry({
      insertion, clipOffset, charPx,
    });
    rectangles.push({
      x: geometry.start,
      y: Number.isFinite(insertionYs?.[insertionIndex])
        ? insertionYs[insertionIndex] + PRIMER_INSERTION_INSET
        : insertionY + PRIMER_INSERTION_INSET,
      width: geometry.width,
      height: PRIMER_INSERTION_HEIGHT,
    });
  }
  if (inlineTail && tailWidth > 0) {
    rectangles.push({
      x: tailX, y: tailY, width: tailWidth, height: PRIMER_GLYPH_HEIGHT,
    });
  }
  const loops = unionRectangleLoops(rectangles);
  let headAttached = false;
  const baseX = isFwd ? width : 0;
  const tipX = isFwd ? width + PRIMER_ARROW_HEAD : -PRIMER_ARROW_HEAD;
  const headBottom = headY + PRIMER_GLYPH_HEIGHT;
  const paths = loops.map((loop) => {
    let path = `M${loop[0][0]},${loop[0][1]}`;
    for (let index = 0; index < loop.length; index += 1) {
      const from = loop[index];
      const to = loop[(index + 1) % loop.length];
      const isHeadBase = headHere && !headAttached
        && from[0] === baseX && to[0] === baseX
        && Math.min(from[1], to[1]) === headY
        && Math.max(from[1], to[1]) === headBottom;
      if (isHeadBase) {
        path += ` L${tipX},${headY + PRIMER_GLYPH_HEIGHT / 2}`;
        headAttached = true;
      }
      path += ` L${to[0]},${to[1]}`;
    }
    return `${path} Z`;
  });
  if (headHere && !headAttached) paths.push(arrowHeadPath(isFwd, width, headY));
  return { path: paths.join(' '), componentCount: paths.length };
}

function SelectionBrackets({ selected, width, bodyY }) {
  if (!selected || width <= 0) return null;
  const top = bodyY - 2;
  const bottom = bodyY + PRIMER_GLYPH_HEIGHT + 2;
  return (
    <>
      <path
        data-primer-selection-bracket="start"
        d={`M${PRIMER_SELECTION_BRACKET_ARM},${top} H0 V${bottom} H${PRIMER_SELECTION_BRACKET_ARM}`}
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth={1.25}
        style={{ pointerEvents: 'none' }}
      />
      <path
        data-primer-selection-bracket="end"
        d={`M${width - PRIMER_SELECTION_BRACKET_ARM},${top} H${width} V${bottom} H${width - PRIMER_SELECTION_BRACKET_ARM}`}
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth={1.25}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}

export default function PrimerStepGlyph({
  isFwd,
  filled,
  selected,
  expanded = true,
  color,
  width,
  headHere,
  baseFont,
  glyphs,
  fallbackBases,
  visibleInsertions,
  clipOffset,
  charPx,
  inlineTail,
  tailWidth,
  tailX,
  tail,
  showLetters,
  labelX,
  labelWidth,
  labelText,
  annealingStatus,
  visStart = 0,
  templateY: packedTemplateY,
  tailY: packedTailY,
  outerY: packedOuterY,
  labelY: packedLabelY,
  insertionYs: packedInsertionYs,
  insertionTiers: packedInsertionTiers,
  insertionY: packedInsertionY,
  insertionLane: packedInsertionLane,
}) {
  const direction = isFwd ? 'forward' : 'reverse';
  const detached = annealingStatus === 'non-annealing';
  const hasAlignment = Array.isArray(glyphs);
  const displayGlyphs = hasAlignment
    ? glyphs
    : [...fallbackBases].map((base) => ({ base, op: 'M' }));
  const runs = groupGlyphRuns(displayGlyphs, detached);
  const compactRuns = compactBackboneRuns(runs);
  const connectors = connectorBoundaries(runs);
  const hasInsertions = (visibleInsertions || []).length > 0;
  const legacyFlat = !inlineTail && !detached && !hasInsertions
    && displayGlyphs.length > 0
    && displayGlyphs.every((glyph) => glyph?.op === 'M');
  const templateY = Number.isFinite(packedTemplateY)
    ? packedTemplateY
    : primerLaneY(direction, 'template');
  const outerY = Number.isFinite(packedOuterY)
    ? packedOuterY
    : primerLaneY(direction, 'outer');
  const tailY = Number.isFinite(packedTailY)
    ? packedTailY
    : primerLaneY(direction, 'tail');
  const insertionY = Number.isFinite(packedInsertionY) ? packedInsertionY : outerY;
  const insertionYAt = (index) => (Number.isFinite(packedInsertionYs?.[index])
    ? packedInsertionYs[index]
    : insertionY);
  const insertionTierAt = (index) => (
    Number.isInteger(packedInsertionTiers?.[index]) && packedInsertionTiers[index] > 0
      ? packedInsertionTiers[index]
      : (insertionYAt(index) === outerY ? 1 : 2)
  );
  const insertionLaneAt = (index) => {
    if (packedInsertionLane) return packedInsertionLane;
    const tier = insertionTierAt(index);
    if (tier === 1) return 'outer';
    return tier === 2 ? 'far-outer' : `outer-${tier}`;
  };
  const insertionRenderItems = (visibleInsertions || []).map((insertion, insertionIndex) => {
    const y = insertionYAt(insertionIndex);
    const boxTop = y + PRIMER_INSERTION_INSET;
    const boxBottom = boxTop + PRIMER_INSERTION_HEIGHT;
    return {
      insertion,
      insertionIndex,
      geometry: primerInsertionGeometry({ insertion, clipOffset, charPx }),
      y,
      centerY: y + PRIMER_GLYPH_HEIGHT / 2,
      boxTop,
      boxBottom,
      tier: insertionTierAt(insertionIndex),
      lane: insertionLaneAt(insertionIndex),
    };
  });
  const visibleInsertionYs = insertionRenderItems.map(({ y }) => y);
  const laneYOf = (lane) => (lane === 'outer' ? outerY : templateY);
  const headLane = detached ? 'outer' : 'template';
  const fivePrimeLane = detached ? 'outer' : 'template';
  const headY = laneYOf(headLane);
  const bindingBodyY = detached ? outerY : templateY;
  const occupiedTop = Math.min(
    detached ? outerY : templateY,
    inlineTail ? tailY : Infinity,
    hasInsertions ? Math.min(...visibleInsertionYs) : Infinity,
  );
  const labelY = Number.isFinite(packedLabelY)
    ? packedLabelY
    : occupiedTop - PRIMER_LABEL_GAP - PRIMER_LABEL_HEIGHT;
  const localTailX = Number.isFinite(tailX) ? tailX : (isFwd ? -tailWidth : width);
  const occupiedRuns = runs
    .filter((run) => run.op !== 'D')
    .map((run) => `${run.op}:${run.start}-${run.end}`)
    .join(',');
  const insertionSummary = (visibleInsertions || [])
    .map((insertion) => `${insertion.boundary}:${insertion.bases.length}`)
    .join(',');
  const envelope = !legacyFlat && (
    runs.some((run) => run.op !== 'D') || hasInsertions || (inlineTail && tailWidth > 0)
  )
    ? occupiedEnvelopePath({
      runs,
      insertions: visibleInsertions,
      clipOffset,
      charPx,
      inlineTail,
      tailX: localTailX,
      tailWidth,
      tailY,
      insertionY,
      insertionYs: visibleInsertionYs,
      laneYOf,
      isFwd,
      width,
      headHere,
      headY,
    })
    : null;
  if (!expanded) {
    const centerY = (lane) => laneYOf(lane) + PRIMER_GLYPH_HEIGHT / 2;
    const compactFocusPath = envelope?.path || (headHere
      ? arrowHeadPath(isFwd, width, headY)
      : `M0,${templateY} H${width} V${templateY + PRIMER_GLYPH_HEIGHT} H0 Z`);
    return (
      <>
        <path
          data-testid="sequence-view-primer-envelope"
          data-primer-envelope="compact-focus-perimeter"
          data-primer-envelope-occupied-runs={occupiedRuns}
          data-primer-envelope-insertions={insertionSummary}
          data-primer-envelope-component-count={envelope?.componentCount ?? 1}
          data-primer-focus-perimeter="true"
          d={compactFocusPath}
          fill="none"
          stroke="transparent"
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
        {compactRuns.map((run, index) => {
          const start = run.start * charPx;
          const end = run.end * charPx;
          const y = centerY(run.op === 'D' ? (detached ? 'outer' : 'template') : run.lane);
          return (
            <line
              key={`${run.op}-${run.start}-${index}`}
              data-testid={run.op === 'D'
                ? 'sequence-view-primer-deletion-bridge'
                : 'sequence-view-primer-compact-run'}
              data-primer-alignment-op={run.op === 'D' ? 'D' : 'paired'}
              data-primer-lane={run.op === 'D' ? (detached ? 'outer' : 'template') : run.lane}
              data-primer-lane-y={run.op === 'D'
                ? (detached ? outerY : templateY)
                : laneYOf(run.lane)}
              x1={start}
              x2={end}
              y1={y}
              y2={y}
              stroke={color}
              strokeWidth={run.op === 'D' ? 1.25 : 2}
              strokeDasharray={run.op === 'D' ? '3 2' : undefined}
              strokeLinecap="round"
            />
          );
        })}
        {runs.filter((run) => run.op === 'X').map((run, index) => (
          <line
            key={`compact-X-${run.start}-${index}`}
            data-testid="sequence-view-primer-compact-mismatch"
            data-primer-alignment-op="X"
            data-primer-lane={run.lane}
            data-primer-lane-y={laneYOf(run.lane)}
            x1={run.start * charPx}
            x2={run.end * charPx}
            y1={centerY(run.lane)}
            y2={centerY(run.lane)}
            stroke="var(--danger-fg)"
            strokeWidth={2}
            strokeLinecap="butt"
          />
        ))}
        {connectors.map((connector) => {
          const x = connector.boundary * charPx;
          return (
            <line
              key={`${connector.boundary}-${connector.from}-${connector.to}`}
              data-testid="sequence-view-primer-step-connector"
              x1={x}
              x2={x}
              y1={centerY(connector.from)}
              y2={centerY(connector.to)}
              stroke={color}
              strokeWidth={1}
            />
          );
        })}
        {inlineTail && (
          <line
            data-testid="sequence-view-primer-tail"
            data-primer-tail="true"
            data-primer-tail-direction={direction}
            data-primer-lane="tail"
            data-primer-lane-y={tailY}
            x1={localTailX}
            x2={localTailX + tailWidth}
            y1={tailY + PRIMER_GLYPH_HEIGHT / 2}
            y2={tailY + PRIMER_GLYPH_HEIGHT / 2}
            stroke={color}
            strokeWidth={2}
            strokeOpacity={0.72}
            strokeLinecap="round"
          />
        )}
        {insertionRenderItems.map(({
          insertion, insertionIndex, geometry, centerY: insertionCenter,
        }) => (
          <line
            key={`I-connector-${insertion.boundary}-${insertionIndex}`}
            data-testid="sequence-view-primer-step-connector"
            data-primer-step-source="insertion"
            x1={geometry.boundaryX}
            x2={geometry.boundaryX}
            y1={bindingBodyY + PRIMER_GLYPH_HEIGHT / 2}
            y2={insertionCenter}
            stroke="var(--danger-fg)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
        {insertionRenderItems.map(({
          insertion, insertionIndex, geometry, y, centerY: insertionCenter, tier, lane,
        }) => (
          <line
            key={`I-callout-${insertion.boundary}-${insertionIndex}`}
            data-testid="sequence-view-primer-insertion"
            data-primer-alignment-op="I"
            data-primer-insertion-count={insertion.bases.length}
            data-primer-insertion-tier={tier}
            data-primer-lane={lane}
            data-primer-lane-y={y}
            x1={geometry.start}
            x2={geometry.end}
            y1={insertionCenter}
            y2={insertionCenter}
            stroke="var(--danger-fg)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
        {headHere && (
          <path
            data-testid="sequence-view-primer-arrowhead"
            data-primer-arrow={direction}
            data-primer-lane={headLane}
            data-primer-lane-y={headY}
            d={isFwd
              ? `M${width - 3},${centerY(headLane) - 3} L${width + PRIMER_ARROW_HEAD},${centerY(headLane)} L${width - 3},${centerY(headLane) + 3}`
              : `M3,${centerY(headLane) - 3} L${-PRIMER_ARROW_HEAD},${centerY(headLane)} L3,${centerY(headLane) + 3}`}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {inlineTail && tailY !== laneYOf(fivePrimeLane) && (
          <line
            data-testid="sequence-view-primer-step-connector"
            data-primer-step-source="tail"
            x1={isFwd ? 0 : width}
            x2={isFwd ? 0 : width}
            y1={tailY + PRIMER_GLYPH_HEIGHT / 2}
            y2={centerY(fivePrimeLane)}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
        <SelectionBrackets
          selected={selected}
          width={width}
          bodyY={bindingBodyY}
        />
        <text
          data-testid="sequence-view-primer-label"
          data-primer-label-y={labelY}
          data-primer-label-height={PRIMER_LABEL_HEIGHT}
          x={labelX}
          y={labelY + PRIMER_LABEL_HEIGHT / 2}
          fontSize={PRIMER_LABEL_FONT_SIZE}
          fontWeight={600}
          fill="var(--text-primary)"
          dominantBaseline="central"
          style={{ fontFamily: 'inherit' }}
          textLength={labelText ? labelWidth : undefined}
          lengthAdjust={labelText ? 'spacingAndGlyphs' : undefined}
        >
          {labelText}
        </text>
      </>
    );
  }

  return (
    <>
      {legacyFlat && (
        <path
          data-testid={headHere ? 'sequence-view-primer-arrowhead' : undefined}
          data-primer-arrow={direction}
          data-primer-focus-perimeter="true"
          data-primer-lane="template"
          data-primer-lane-y={templateY}
          transform={templateY ? `translate(0, ${templateY})` : undefined}
          d={headHere
            ? (isFwd
              ? `M0,0 L${width},0 L${width + PRIMER_ARROW_HEAD},${PRIMER_GLYPH_HEIGHT / 2} L${width},${PRIMER_GLYPH_HEIGHT} L0,${PRIMER_GLYPH_HEIGHT} Z`
              : `M${width},0 L0,0 L${-PRIMER_ARROW_HEAD},${PRIMER_GLYPH_HEIGHT / 2} L0,${PRIMER_GLYPH_HEIGHT} L${width},${PRIMER_GLYPH_HEIGHT} Z`)
            : `M0,0 L${width},0 L${width},${PRIMER_GLYPH_HEIGHT} L0,${PRIMER_GLYPH_HEIGHT} Z`}
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={filled ? 0.5 : 1}
          opacity={filled ? 0.78 : 1}
        />
      )}

      {!legacyFlat && runs.map((run, index) => {
        const x = run.start * charPx;
        const runWidth = (run.end - run.start) * charPx;
        const laneY = laneYOf(run.lane);
        if (run.op === 'D') {
          const bridgeY = (detached ? outerY : templateY) + PRIMER_GLYPH_HEIGHT / 2;
          return (
            <line
              key={`D-${run.start}-${index}`}
              data-testid="sequence-view-primer-deletion-bridge"
              data-primer-alignment-op="D"
              data-primer-lane={detached ? 'outer' : 'template'}
              data-primer-lane-y={detached ? outerY : templateY}
              x1={x + 1}
              x2={x + runWidth - 1}
              y1={bridgeY}
              y2={bridgeY}
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth={1.25}
              strokeDasharray="3 2"
            />
          );
        }
        return (
          <rect
            key={`${run.op}-${run.start}-${index}`}
            data-testid="sequence-view-primer-run"
            data-primer-alignment-op={run.op}
            data-primer-lane={run.lane}
            data-primer-lane-y={laneY}
            x={x}
            y={laneY}
            width={runWidth}
            height={PRIMER_GLYPH_HEIGHT}
            rx={0}
            fill={run.op === 'X' ? 'var(--danger-bg)' : (filled ? color : 'var(--surface-1)')}
            fillOpacity={run.op === 'X' ? 1 : (filled ? 0.78 : 1)}
            stroke="none"
            strokeWidth={0}
          />
        );
      })}

      {!legacyFlat && connectors.map((connector) => {
        const fromY = laneYOf(connector.from) + PRIMER_GLYPH_HEIGHT / 2;
        const toY = laneYOf(connector.to) + PRIMER_GLYPH_HEIGHT / 2;
        const x = connector.boundary * charPx;
        return (
          <line
            key={`${connector.boundary}-${connector.from}-${connector.to}`}
            data-testid="sequence-view-primer-step-connector"
            x1={x}
            x2={x}
            y1={fromY}
            y2={toY}
            stroke={color}
            strokeWidth={1}
          />
        );
      })}

      {headHere && !legacyFlat && (
        <path
          data-testid="sequence-view-primer-arrowhead"
          data-primer-arrow={direction}
          data-primer-lane={headLane}
          data-primer-lane-y={headY}
          d={arrowHeadPath(isFwd, width, headY)}
          fill={filled ? color : 'var(--surface-1)'}
          fillOpacity={filled ? 0.78 : 1}
          stroke="none"
          strokeWidth={0}
        />
      )}

      {inlineTail && (
        <rect
          data-testid="sequence-view-primer-tail"
          data-primer-tail="true"
          data-primer-tail-direction={direction}
          data-primer-lane="tail"
          data-primer-lane-y={tailY}
          x={localTailX}
          y={tailY}
          width={tailWidth}
          height={PRIMER_GLYPH_HEIGHT}
          fill={color}
          fillOpacity={0.24}
          stroke="none"
          strokeWidth={0}
        />
      )}
      {envelope && (
        <path
          data-testid="sequence-view-primer-envelope"
          data-primer-envelope="stepped-perimeter"
          data-primer-envelope-occupied-runs={occupiedRuns}
          data-primer-envelope-insertions={insertionSummary}
          data-primer-envelope-component-count={envelope.componentCount}
          data-primer-focus-perimeter="true"
          d={envelope.path}
          fill="none"
          stroke={color}
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {insertionRenderItems.map(({
        insertion, insertionIndex, geometry, boxTop, boxBottom,
      }) => {
        const insertionAbove = boxBottom <= bindingBodyY;
        return (
          <line
            key={`I-connector-${insertion.boundary}-${insertionIndex}`}
            data-testid="sequence-view-primer-step-connector"
            data-primer-step-source="insertion"
            x1={geometry.boundaryX}
            x2={geometry.boundaryX}
            y1={insertionAbove
              ? bindingBodyY + PRIMER_GLYPH_HEIGHT
              : bindingBodyY}
            y2={insertionAbove ? boxBottom : boxTop}
            stroke="var(--danger-fg)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
      {insertionRenderItems.map(({
        insertion, insertionIndex, geometry, y, tier, lane,
      }) => (
        <g
          key={`I-callout-${insertion.boundary}-${insertionIndex}`}
          data-testid="sequence-view-primer-insertion"
          data-primer-alignment-op="I"
          data-primer-insertion-count={insertion.bases.length}
          data-primer-insertion-tier={tier}
          data-primer-lane={lane}
          data-primer-lane-y={y}
          transform={`translate(${geometry.boundaryX}, ${y})`}
          style={{ pointerEvents: 'none' }}
        >
          <rect
            x={geometry.start - geometry.boundaryX}
            y={PRIMER_INSERTION_INSET}
            width={geometry.width}
            height={PRIMER_INSERTION_HEIGHT}
            rx={1}
            fill="var(--danger-bg)"
            stroke="var(--danger-fg)"
            strokeWidth={1.25}
          />
          {showLetters && (
            <text
              x={geometry.center - geometry.boundaryX}
              y={PRIMER_GLYPH_HEIGHT / 2}
              fontSize={Math.max(
                baseFont,
                Math.min(PRIMER_INSERTION_FONT_SIZE, charPx * 1.4),
              )}
              fontWeight={600}
              fill="var(--danger-fg)"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            >
              {insertion.bases}
            </text>
          )}
        </g>
      ))}
      {inlineTail && showLetters && (
        <text
          data-testid="sequence-view-primer-tail-bases"
          x={localTailX}
          y={tailY + PRIMER_GLYPH_HEIGHT / 2}
          fontSize={baseFont}
          fontWeight={600}
          fill="var(--text-primary)"
          textAnchor="start"
          dominantBaseline="central"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', letterSpacing: 0 }}
          textLength={tailWidth}
          lengthAdjust="spacingAndGlyphs"
        >
          {tail}
        </text>
      )}

      {showLetters && displayGlyphs.some((glyph) => glyph?.op !== 'D' && glyph?.base) && (
        <text
          data-testid="sequence-view-primer-bases"
          fontSize={baseFont}
          fontWeight={600}
          fill={filled ? 'var(--primer-feature-body-text)' : color}
          dominantBaseline="central"
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', letterSpacing: 0 }}
        >
          {displayGlyphs.map((glyph, baseIndex) => {
            if (!glyph?.base || glyph.op === 'D') return null;
            const lane = detached ? 'outer' : 'template';
            const laneY = laneYOf(lane);
            return (
              <tspan
                key={`${baseIndex}-${glyph.op}`}
                x={(baseIndex + 0.5) * charPx}
                y={laneY + PRIMER_GLYPH_HEIGHT / 2}
                textAnchor="middle"
                data-testid={glyph.op === 'X' ? 'sequence-view-primer-base-mismatch' : undefined}
                data-primer-base-mismatch={glyph.op === 'X' ? 'true' : undefined}
                data-primer-alignment-op={glyph.op}
                data-primer-template-coordinate={visStart + baseIndex}
                fill={glyph.op === 'X' ? 'var(--danger-fg)' : undefined}
              >
                {glyph.base}
              </tspan>
            );
          })}
        </text>
      )}

      {inlineTail && tailY !== laneYOf(fivePrimeLane) && (
        <line
          data-testid="sequence-view-primer-step-connector"
          data-primer-step-source="tail"
          x1={isFwd ? 0 : width}
          x2={isFwd ? 0 : width}
          y1={tailY + PRIMER_GLYPH_HEIGHT / 2}
          y2={laneYOf(fivePrimeLane) + PRIMER_GLYPH_HEIGHT / 2}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}

      <SelectionBrackets
        selected={selected}
        width={width}
        bodyY={bindingBodyY}
      />

      <text
        data-testid="sequence-view-primer-label"
        data-primer-label-y={labelY}
        data-primer-label-height={PRIMER_LABEL_HEIGHT}
        x={labelX}
        y={labelY + PRIMER_LABEL_HEIGHT / 2}
        fontSize={PRIMER_LABEL_FONT_SIZE}
        fontWeight={600}
        fill="var(--text-primary)"
        dominantBaseline="central"
        style={{ fontFamily: 'inherit' }}
        textLength={labelText ? labelWidth : undefined}
        lengthAdjust={labelText ? 'spacingAndGlyphs' : undefined}
      >
        {labelText}
      </text>
    </>
  );
}
