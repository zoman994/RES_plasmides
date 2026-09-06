// Outer bases (5′ tails / query-only insertions) must clear the binding box.
// Keeping this beside the packer default prevents production and direct
// layout consumers from silently using different lane geometry.
export const PRIMER_STEP_OFFSET = 14;
export const PRIMER_TAIL_OFFSET = PRIMER_STEP_OFFSET / 2;
export const PRIMER_LABEL_HEIGHT = 10;
export const PRIMER_LABEL_GAP = 1;
export const PRIMER_INSERTION_FONT_SIZE = 10;

export function primerInsertionGeometry({
  insertion,
  clipOffset = 0,
  charPx,
  x = 0,
}) {
  const safeCharPx = Number.isFinite(charPx) && charPx > 0
    ? charPx
    : 1;
  const insertionWidth = Math.max(safeCharPx,
    String(insertion?.bases || '').length * safeCharPx);
  const boundaryX = x
    + ((Number(insertion?.boundary) || 0) - (Number(clipOffset) || 0)) * safeCharPx;
  const start = boundaryX - insertionWidth / 2;
  return {
    boundaryX,
    center: boundaryX,
    end: start + insertionWidth,
    start,
    width: insertionWidth,
  };
}

export function primerTailOf(primer) {
  if (!primer) return '';
  if (typeof primer.tail === 'string') return primer.tail;
  if (typeof primer.tailSequence === 'string') return primer.tailSequence;
  return '';
}

function mergeSpans(spans) {
  const sorted = (spans || [])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && span[0] <= previous[1]) previous[1] = Math.max(previous[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

function spansOverlap(left, right) {
  return left.some(([a, b]) => right.some(([c, d]) => a < d && b > c));
}

function paddedSpans(spans, padding) {
  const pad = Number.isFinite(padding) && padding > 0 ? padding : 0;
  return mergeSpans((spans || []).map(([start, end]) => [start - pad, end + pad]));
}

function packRows(items, collisionPadding) {
  const groupsByKey = new Map();
  items.forEach((item, index) => {
    const rowKey = item.rowKey ?? item.key;
    let group = groupsByKey.get(rowKey);
    if (!group) {
      group = {
        rowKey, index, templateSpans: [], tailSpans: [], outerSpans: [], farOuterSpans: [],
        insertionSpans: [], labelSpans: [], maxInsertionTier: 0,
      };
      groupsByKey.set(rowKey, group);
    }
    group.templateSpans.push(...item.templateSpans);
    group.tailSpans.push(...item.tailSpans);
    group.outerSpans.push(...item.outerSpans);
    group.farOuterSpans.push(...item.farOuterSpans);
    group.insertionSpans.push(...item.insertionSpans);
    group.labelSpans.push(...item.labelSpans);
    group.maxInsertionTier = Math.max(group.maxInsertionTier, item.maxInsertionTier || 0);
  });
  const groups = [...groupsByKey.values()]
    .map((group) => {
      const templateSpans = mergeSpans(group.templateSpans);
      const tailSpans = mergeSpans(group.tailSpans);
      const outerSpans = mergeSpans(group.outerSpans);
      const farOuterSpans = mergeSpans(group.farOuterSpans);
      const insertionSpans = mergeSpans(group.insertionSpans);
      const labelSpans = mergeSpans(group.labelSpans);
      return {
        ...group,
        templateSpans,
        tailSpans,
        outerSpans,
        farOuterSpans,
        insertionSpans,
        labelSpans,
        // Different primers may not share a visual row when any painted or
        // interactive footprint overlaps. Components with the same rowKey are
        // grouped first, so a primer's own stepped tail remains attached.
        collisionSpans: paddedSpans(
          [
            ...templateSpans, ...tailSpans, ...outerSpans, ...farOuterSpans,
            ...insertionSpans, ...labelSpans,
          ],
          collisionPadding,
        ),
      };
    })
    .filter((group) => group.collisionSpans.length)
    .sort((a, b) => {
      const aStart = a.collisionSpans[0]?.[0] ?? Infinity;
      const bStart = b.collisionSpans[0]?.[0] ?? Infinity;
      return aStart - bStart || a.index - b.index;
    });
  const rows = [];
  const assignments = new Map();
  for (const group of groups) {
    let row = rows.findIndex((occupied) => (
      !spansOverlap(group.collisionSpans, occupied.collisionSpans)
    ));
    if (row < 0) {
      row = rows.length;
      rows.push({
        templateSpans: [], tailSpans: [], outerSpans: [], farOuterSpans: [],
        insertionSpans: [], labelSpans: [], collisionSpans: [], maxInsertionTier: 0,
      });
    }
    rows[row].templateSpans.push(...group.templateSpans);
    rows[row].tailSpans.push(...group.tailSpans);
    rows[row].outerSpans.push(...group.outerSpans);
    rows[row].farOuterSpans.push(...group.farOuterSpans);
    rows[row].insertionSpans.push(...group.insertionSpans);
    rows[row].labelSpans.push(...group.labelSpans);
    rows[row].collisionSpans.push(...group.collisionSpans);
    rows[row].maxInsertionTier = Math.max(
      rows[row].maxInsertionTier,
      group.maxInsertionTier,
    );
    assignments.set(group.rowKey, row);
  }
  return { assignments, count: rows.length, rows };
}

export function packPrimerTrackBands(items, {
  direction = 'forward', glyphHeight = 14, laneGap = 1, bandGap = 6,
  stepOffset = PRIMER_STEP_OFFSET, tailOffset = PRIMER_TAIL_OFFSET,
  labelHeight = PRIMER_LABEL_HEIGHT, labelGap = PRIMER_LABEL_GAP,
  collisionPadding = 2,
} = {}) {
  const normalized = (items || []).map((item) => ({
    ...item,
    templateSpans: mergeSpans(item.templateSpans),
    tailSpans: mergeSpans(item.tailSpans),
    outerSpans: mergeSpans(item.outerSpans),
    farOuterSpans: mergeSpans(item.farOuterSpans),
    insertionSpans: mergeSpans(item.insertionSpans),
    labelSpans: mergeSpans(item.labelSpans),
    maxInsertionTier: item.maxInsertionTier || 0,
  }));
  const packed = packRows(normalized, collisionPadding);
  const byKey = Object.fromEntries(normalized.map((item) => {
    const row = packed.assignments.get(item.rowKey ?? item.key) ?? null;
    return [item.key, {
      row,
      templateLane: item.templateSpans.length ? row : null,
      tailLane: item.tailSpans.length ? row : null,
      outerLane: item.outerSpans.length ? row : null,
      farOuterLane: item.farOuterSpans.length ? row : null,
      templateY: null,
      tailY: null,
      outerY: null,
      farOuterY: null,
      insertionYs: [],
      insertionTiers: (item.insertionPlacements || []).map(({ tier }) => tier),
      labelY: null,
    }];
  }));
  const hasTemplate = normalized.some((item) => item.templateSpans.length > 0);
  const hasTail = normalized.some((item) => item.tailSpans.length > 0);
  const hasOuter = normalized.some((item) => item.outerSpans.length > 0);
  const hasFarOuter = normalized.some((item) => item.farOuterSpans.length > 0);
  const templateRows = new Set(normalized
    .filter((item) => item.templateSpans.length > 0)
    .map((item) => byKey[item.key].row));
  const tailRows = new Set(normalized
    .filter((item) => item.tailSpans.length > 0)
    .map((item) => byKey[item.key].row));
  const outerRows = new Set(normalized
    .filter((item) => item.outerSpans.length > 0)
    .map((item) => byKey[item.key].row));
  const farOuterRows = new Set(normalized
    .filter((item) => item.farOuterSpans.length > 0)
    .map((item) => byKey[item.key].row));
  const detachedOnly = !hasTemplate && !hasTail && (hasOuter || hasFarOuter)
    && normalized.some((item) => item.detachedBinding);
  const forward = direction !== 'reverse';
  const offsets = {
    templateSpans: 0,
    tailSpans: forward ? -tailOffset : tailOffset,
    outerSpans: forward ? -stepOffset : stepOffset,
    farOuterSpans: forward ? -2 * stepOffset : 2 * stepOffset,
  };
  const bands = [
    ['templateSpans', 'templateY'],
    ['tailSpans', 'tailY'],
    ['outerSpans', 'outerY'],
    ['farOuterSpans', 'farOuterY'],
  ];
  const rowGeometry = packed.rows.map((row) => {
    const activeOffsets = bands
      .filter(([spanKey]) => row[spanKey].length > 0)
      .map(([spanKey]) => offsets[spanKey]);
    if (row.maxInsertionTier > 2) {
      activeOffsets.push(forward
        ? -row.maxInsertionTier * stepOffset
        : row.maxInsertionTier * stepOffset);
    }
    const minOffset = activeOffsets.length ? Math.min(...activeOffsets) : 0;
    const maxOffset = activeOffsets.length ? Math.max(...activeOffsets) : 0;
    const hasLabel = row.labelSpans.length > 0;
    const labelBandHeight = hasLabel ? labelHeight + labelGap : 0;
    return {
      minOffset,
      maxOffset,
      labelBandHeight,
      height: labelBandHeight + (maxOffset - minOffset) + glyphHeight,
    };
  });
  const activeBandCount = [hasTemplate, hasTail, hasOuter, hasFarOuter].filter(Boolean).length;
  const leadingPad = direction === 'reverse' && detachedOnly
    ? bandGap
    : (forward && activeBandCount === 1 && hasTemplate ? bandGap : 0);
  const trailingPad = forward && detachedOnly ? bandGap : 0;
  const rowY = Array(packed.count).fill(0);
  let cursor = leadingPad;
  const visualRows = direction === 'reverse'
    ? Array.from({ length: packed.count }, (_, row) => row)
    : Array.from({ length: packed.count }, (_, row) => packed.count - 1 - row);
  for (const row of visualRows) {
    rowY[row] = cursor;
    cursor += rowGeometry[row].height + laneGap;
  }
  for (const item of normalized) {
    const placement = byKey[item.key];
    if (placement.row == null) continue;
    const geometry = rowGeometry[placement.row];
    const anchorY = forward
      ? rowY[placement.row] - geometry.minOffset
      : rowY[placement.row] + geometry.labelBandHeight - geometry.minOffset;
    for (const [spanKey, yKey] of bands) {
      if (item[spanKey].length > 0) placement[yKey] = anchorY + offsets[spanKey];
    }
    placement.insertionYs = (item.insertionPlacements || []).map(({ tier }) => (
      anchorY + (forward ? -tier * stepOffset : tier * stepOffset)
    ));
    if (item.labelSpans.length > 0) {
      const bodyY = item.detachedBinding ? placement.outerY : placement.templateY;
      if (Number.isFinite(bodyY)) {
        placement.labelY = forward
          ? bodyY + glyphHeight + labelGap
          : bodyY - labelGap - labelHeight;
      }
    }
  }
  const height = packed.count > 0 ? cursor - laneGap + trailingPad : 0;
  return {
    byKey,
    height,
    rowCount: packed.count,
    templateLaneCount: templateRows.size,
    tailLaneCount: tailRows.size,
    outerLaneCount: outerRows.size,
    farOuterLaneCount: farOuterRows.size,
  };
}

export function primerBandSpans({
  key,
  rowKey = key,
  x,
  width,
  headHere,
  headWidth,
  isFwd,
  detached,
  glyphs,
  insertions,
  clipOffset,
  charPx,
  inlineTail,
  tailWidth,
  tailX,
  separateTail,
  labelX,
  labelWidth,
  promoteInsertions,
}) {
  const templateSpans = [];
  const tailSpans = [];
  const outerBaseSpans = [];
  const labelSpans = [];
  if (width > 0) {
    const display = Array.isArray(glyphs) && glyphs.length
      ? glyphs
      : Array.from({ length: Math.max(1, Math.round(width / charPx)) }, () => ({ op: 'M' }));
    display.forEach((glyph, index) => {
      // Mismatches consume a real template coordinate and therefore share the
      // binding row. The outer band is reserved for unpaired sequence only.
      const lane = detached ? outerBaseSpans : templateSpans;
      lane.push([x + index * charPx, x + (index + 1) * charPx]);
    });
    if (headHere) {
      const lane = detached ? outerBaseSpans : templateSpans;
      lane.push(isFwd ? [x + width, x + width + headWidth] : [x - headWidth, x]);
    }
  }
  const insertionSpans = [];
  const insertionItems = [];
  for (const [insertionIndex, insertion] of (insertions || []).entries()) {
    const geometry = primerInsertionGeometry({
      insertion, clipOffset, charPx, x,
    });
    const span = [geometry.start, geometry.end];
    insertionSpans.push(span);
    insertionItems.push({
      key: `${key}:I:${insertion.boundary}:${insertionIndex}`,
      span,
    });
  }
  if (inlineTail && tailWidth > 0) {
    const localTailX = Number.isFinite(tailX) ? tailX : (isFwd ? -tailWidth : width);
    tailSpans.push([x + localTailX, x + localTailX + tailWidth]);
  }
  if (separateTail) tailSpans.push([separateTail.x, separateTail.x + separateTail.w]);
  const normalizedTailSpans = mergeSpans(tailSpans);
  const normalizedOuterBaseSpans = mergeSpans(outerBaseSpans);
  const outerObstacleSpans = mergeSpans([
    ...normalizedOuterBaseSpans,
    ...normalizedTailSpans,
  ]);
  const normalizedInsertionSpans = mergeSpans(insertionSpans);
  const promotedInsertions = normalizedInsertionSpans.length > 0 && (
    promoteInsertions === true
    || (promoteInsertions == null
      && spansOverlap(normalizedInsertionSpans, outerObstacleSpans))
  );
  if (Number.isFinite(labelX) && Number.isFinite(labelWidth) && labelWidth > 0) {
    labelSpans.push([x + labelX, x + labelX + labelWidth]);
  }
  return {
    key,
    rowKey,
    templateSpans: mergeSpans(templateSpans),
    tailSpans: normalizedTailSpans,
    outerSpans: mergeSpans([
      ...normalizedOuterBaseSpans,
      ...(promotedInsertions ? [] : normalizedInsertionSpans),
    ]),
    farOuterSpans: promotedInsertions ? normalizedInsertionSpans : [],
    outerObstacleSpans,
    outerBaseSpans: normalizedOuterBaseSpans,
    insertionSpans: normalizedInsertionSpans,
    insertionItems,
    labelSpans: mergeSpans(labelSpans),
    detachedBinding: detached && width > 0,
    forceInsertionPromotion: promoteInsertions === true,
    promotedInsertions,
  };
}

export function resolvePrimerInsertionTiers(items, assignedTiers = null) {
  const normalized = (items || []).map((item) => ({
    ...item,
    tailSpans: mergeSpans(item.tailSpans),
    outerBaseSpans: mergeSpans(item.outerBaseSpans ?? item.outerSpans),
    outerObstacleSpans: mergeSpans(item.outerObstacleSpans),
    insertionSpans: mergeSpans(item.insertionSpans),
    insertionItems: Array.isArray(item.insertionItems)
      ? item.insertionItems.map((entry) => ({ ...entry, span: [...entry.span] }))
      : (item.insertionSpans || []).map((span, index) => ({
        key: `${item.key}:I:${index}`,
        span: [...span],
      })),
  }));
  const tiersByKey = assignedTiers instanceof Map ? new Map(assignedTiers) : new Map();

  if (!(assignedTiers instanceof Map)) {
    const groups = new Map();
    normalized.forEach((item, itemIndex) => {
      const rowKey = item.rowKey ?? item.key;
      let group = groups.get(rowKey);
      if (!group) {
        group = { insertions: [], obstacleSpans: [] };
        groups.set(rowKey, group);
      }
      group.obstacleSpans.push(...item.outerObstacleSpans);
      item.insertionItems.forEach((entry, insertionIndex) => group.insertions.push({
        ...entry,
        itemIndex,
        insertionIndex,
        forcePromotion: item.forceInsertionPromotion === true,
      }));
    });
    for (const group of groups.values()) {
      const obstacles = mergeSpans(group.obstacleSpans);
      const occupiedByTier = [];
      const candidates = [...group.insertions].sort((left, right) => (
        left.span[0] - right.span[0]
        || left.span[1] - right.span[1]
        || left.key.localeCompare(right.key)
      ));
      for (const candidate of candidates) {
        const interactiveSpan = paddedSpans([candidate.span], 2);
        let tier = candidate.forcePromotion
          || spansOverlap(interactiveSpan, paddedSpans(obstacles, 2))
          ? 2
          : 1;
        while (spansOverlap(
          interactiveSpan,
          paddedSpans(occupiedByTier[tier] || [], 2),
        )) tier += 1;
        (occupiedByTier[tier] ||= []).push(candidate.span);
        tiersByKey.set(candidate.key, tier);
      }
    }
  }

  return normalized.map((item) => {
    const insertionPlacements = item.insertionItems.map((entry) => ({
      ...entry,
      tier: tiersByKey.get(entry.key) || 1,
    }));
    if (insertionPlacements.length === 0) return {
      ...item,
      insertionPlacements,
      maxInsertionTier: 0,
    };
    const tierSpans = (tier) => insertionPlacements
      .filter((entry) => entry.tier === tier)
      .map((entry) => entry.span);
    const promotedInsertions = insertionPlacements.some(({ tier }) => tier > 1);
    return {
      ...item,
      outerSpans: mergeSpans([
        ...item.outerBaseSpans,
        ...tierSpans(1),
      ]),
      farOuterSpans: mergeSpans(tierSpans(2)),
      insertionPlacements,
      maxInsertionTier: Math.max(...insertionPlacements.map(({ tier }) => tier)),
      promotedInsertions,
    };
  });
}

export function projectPrimerTail({
  hit,
  isFwd,
  tail,
  charPx,
  labelChars,
  lineStart,
  lineEnd,
  seqLen,
  bindingVisible,
  showLetters,
  hasWrap,
  wrapAt,
  wrapWidthChars,
  seqLength,
  circular,
}) {
  const tailLength = tail.length;
  const hasTail = tailLength > 0;
  const tailWidth = tailLength * charPx;
  let inlineTail = false;
  let separateTail = null;
  const wrapsOrigin = circular && hasTail && seqLen > 0
    && (isFwd ? hit.start - tailLength < 0 : hit.end + tailLength > seqLen);

  if (hasWrap) {
    const holdsFivePrime = isFwd ? hit._visStart === hit.start : hit._visEnd === hit.end;
    if (hasTail && holdsFivePrime && seqLength > 0) {
      const colForPosition = (position) => {
        if (position >= lineStart && position < seqLength) return position - lineStart;
        if (position >= 0 && position < wrapWidthChars) return wrapAt + position;
        return null;
      };
      const visible = [];
      for (let index = 0; index < tailLength; index += 1) {
        const raw = isFwd ? hit.start - tailLength + index : hit.end + index;
        const position = ((raw % seqLength) + seqLength) % seqLength;
        const column = colForPosition(position);
        if (column != null) visible.push({ column, base: tail[index] });
      }
      if (visible.length) {
        const columns = visible.map(({ column }) => column);
        const lo = Math.min(...columns);
        const hi = Math.max(...columns);
        separateTail = {
          x: (labelChars + lo) * charPx,
          w: (hi - lo + 1) * charPx,
          bases: showLetters ? visible.map(({ base }) => base).join('') : '',
        };
      }
    }
  } else if (wrapsOrigin) {
    const visible = [];
    for (let index = 0; index < tailLength; index += 1) {
      const raw = isFwd ? hit.start - tailLength + index : hit.end + index;
      const position = ((raw % seqLen) + seqLen) % seqLen;
      if (position >= lineStart && position < lineEnd) {
        visible.push({ column: position - lineStart, base: tail[index] });
      }
    }
    if (visible.length) {
      visible.sort((a, b) => a.column - b.column);
      const lo = visible[0].column;
      const hi = visible[visible.length - 1].column;
      separateTail = {
        x: (labelChars + lo) * charPx,
        w: (hi - lo + 1) * charPx,
        bases: showLetters ? visible.map(({ base }) => base).join('') : '',
      };
    }
  } else {
    const fivePrimeOnLine = isFwd
      ? hit.start >= lineStart && hit.start < lineEnd
      : hit.end > lineStart && hit.end <= lineEnd;
    const tailFits = isFwd
      ? hit.start - tailLength >= lineStart || lineStart === 0
      : hit.end + tailLength <= lineEnd || lineEnd === seqLen;
    inlineTail = hasTail && bindingVisible && fivePrimeOnLine && tailFits;
    if (hasTail && !inlineTail) {
      const tailStart = isFwd ? Math.max(0, hit.start - tailLength) : hit.end;
      const tailEnd = isFwd ? hit.start : Math.min(seqLen, hit.end + tailLength);
      const visibleStart = Math.max(tailStart, lineStart);
      const visibleEnd = Math.min(tailEnd, lineEnd);
      if (visibleEnd > visibleStart) {
        const from = isFwd
          ? visibleStart - (hit.start - tailLength)
          : visibleStart - hit.end;
        const to = isFwd ? visibleEnd - (hit.start - tailLength) : visibleEnd - hit.end;
        separateTail = {
          x: (labelChars + visibleStart - lineStart) * charPx,
          w: (visibleEnd - visibleStart) * charPx,
          bases: showLetters ? tail.slice(from, to) : '',
        };
      }
    }
  }
  return {
    hasTail,
    tailLength,
    tailWidth,
    inlineTail,
    separateTail,
  };
}
