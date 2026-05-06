/**
 * lib/wrap-tail.js — Sprint M-X.3 K1 pure helpers.
 *
 * Wrap-tail rendering math for circular plasmids в SequenceView.
 * The viewer renders the plasmid as a linear band; biolog working on
 * primer hats that span the origin (e.g. tail на 2580..18 на 2686 bp
 * pUC19) loses the start-of-plasmid context once он скроллит к концу.
 * This sprint inserts 2 leading lines (last ~160 nt of the plasmid)
 * BEFORE the first main line and 2 trailing lines (first ~160 nt)
 * AFTER the last main line, both rendered dimmed (opacity 0.5,
 * pointer-events: none) so они служат «контекстом до/после origin»
 * без поломки selection / caret в main band.
 *
 * Public API (all pure):
 *   shouldEnableWrapTail({ circular, seqLength, cpl, viewportHeight, lineHeight })
 *     → bool. False для linear, для коротких plasmid'ов (≤ 2 main
 *     lines), и когда plasmid + 3 reserve lines помещается в
 *     viewport (биолог уже видит весь plasmid, дублирующие строки
 *     только мешают).
 *
 *   pickWrapTailLines({ totalMainLines })
 *     → 0/1/2. Сколько wrap-tail lines рендерить с каждой стороны.
 *     Отдельный helper чтобы тесты могли пинить boundary cases без
 *     возни с viewport math.
 *
 *   buildWrapTailLines({ fullSeq, cpl, leadingCount, trailingCount })
 *     → { leading: [{start, seq, kind}], trailing: [...] }.
 *     Slice'ит fullSeq на абсолютные start-positions: leading это
 *     последние N main lines (start ближе к seqLength), trailing —
 *     первые N main lines (start от 0). Coords остаются ABSOLUTE
 *     position в plasmid'е, чтобы AnnotationTrack / RulerTrack
 *     рендерили правильные номера nucleotides.
 *
 *   filterAnnotationsForLine(annotations, lineStart, lineEnd)
 *     → отфильтрованный массив фичей попадающих в [lineStart, lineEnd).
 *     Half-open semantics — same as существующий AnnotationTrack
 *     overlap math. Аннотации со span > 1 line попадают в каждую
 *     line которую перекрывают.
 */

const RESERVE_LINES_FOR_FIT_CHECK = 3;
const MIN_TOTAL_LINES_FOR_WRAP_TAIL = 3;

export function shouldEnableWrapTail({
  circular,
  seqLength,
  cpl,
  viewportHeight,
  lineHeight,
}) {
  if (!circular) return false;
  if (!Number.isFinite(seqLength) || seqLength <= 0) return false;
  if (!Number.isFinite(cpl) || cpl <= 0) return false;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return false;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return false;

  const totalMainLines = Math.ceil(seqLength / cpl);
  if (totalMainLines < MIN_TOTAL_LINES_FOR_WRAP_TAIL) return false;

  // If plasmid + reserve fits in viewport, the biolog already sees
  // everything and wrap-tail just clutters the band.
  const mainHeight = totalMainLines * lineHeight;
  const reserveHeight = RESERVE_LINES_FOR_FIT_CHECK * lineHeight;
  if (mainHeight + reserveHeight < viewportHeight) return false;

  return true;
}

export function pickWrapTailLines({ totalMainLines }) {
  if (!Number.isFinite(totalMainLines)) return 0;
  if (totalMainLines >= 5) return 2;
  if (totalMainLines >= 3) return 1;
  return 0;
}

export function buildWrapTailLines({
  fullSeq,
  cpl,
  leadingCount,
  trailingCount,
}) {
  const empty = { leading: [], trailing: [] };
  if (!fullSeq || typeof fullSeq !== 'string') return empty;
  const cplFloor = Math.max(1, Math.floor(cpl || 0));
  if (!Number.isFinite(cplFloor)) return empty;

  const seqLen = fullSeq.length;
  const totalLines = Math.ceil(seqLen / cplFloor);
  const leadCnt = Math.max(0, Math.min(Math.floor(leadingCount || 0), totalLines));
  const trailCnt = Math.max(0, Math.min(Math.floor(trailingCount || 0), totalLines));

  const leading = [];
  // Last leadCnt main lines. Start indices = (totalLines - leadCnt) * cpl,
  // ..., (totalLines - 1) * cpl.
  for (let i = totalLines - leadCnt; i < totalLines; i += 1) {
    const start = i * cplFloor;
    const sliceEnd = Math.min(start + cplFloor, seqLen);
    leading.push({
      start,
      seq: fullSeq.slice(start, sliceEnd),
      kind: 'leading-wrap',
    });
  }

  const trailing = [];
  // First trailCnt main lines. Start indices = 0, cpl, 2*cpl, ...
  for (let i = 0; i < trailCnt; i += 1) {
    const start = i * cplFloor;
    const sliceEnd = Math.min(start + cplFloor, seqLen);
    trailing.push({
      start,
      seq: fullSeq.slice(start, sliceEnd),
      kind: 'trailing-wrap',
    });
  }

  return { leading, trailing };
}

export function filterAnnotationsForLine(annotations, lineStart, lineEnd) {
  if (!Array.isArray(annotations)) return [];
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return [];
  if (lineEnd <= lineStart) return [];
  const out = [];
  for (const ann of annotations) {
    if (!ann) continue;
    const aStart = Number(ann.start);
    const aEnd = Number(ann.end);
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) continue;
    // Half-open overlap: ann [aStart, aEnd) overlaps line [lineStart, lineEnd)
    // iff aStart < lineEnd AND aEnd > lineStart.
    if (aStart < lineEnd && aEnd > lineStart) out.push(ann);
  }
  return out;
}
