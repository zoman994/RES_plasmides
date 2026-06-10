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

// V102 (23.05.2026, подтверждено Игорём) — wrap-tail / «псевдокольцо» —
// нужная фича: показывается ВСЕГДА для кольцевых плазмид (и коротких).
// Прежний origin-crossing гейт + MIN_TOTAL_LINES-лимит откатаны: гейт
// убивал фичу для обычных плазмид (ничего не пересекало ориджин → полос
// нет) И завязывал включение на ЖИВОЕ выделение, отчего wrap-tail мигал
// при drag'е (toggle → leading-строки reflow'ят раскладку → re-measure →
// toggle обратно → осцилляция). Снятие гейта делает включение стабильным
// (нет зависимости от выделения) И сохраняет фичу для любой кольцевой
// плазмиды. Объём псевдоначала/псевдоконца — фиксированный ≈200 п.о.
// целыми строками с каждой стороны (биолог: «строки аккуратнее»).
const WRAP_TAIL_PREVIEW_BP = 200;

export function shouldEnableWrapTail({
  circular,
  seqLength,
  cpl,
  viewportHeight,
  lineHeight,
}) {
  // Always on for any valid circular plasmid (no origin-crossing gate, no
  // length limit). cpl / viewportHeight / lineHeight stay on the
  // signature (callsite passes them) but are unused — minimal diff.
  void cpl;
  void viewportHeight;
  void lineHeight;
  return circular && Number.isFinite(seqLength) && seqLength > 0;
}

/**
 * Fixed preview volume: ≈WRAP_TAIL_PREVIEW_BP whole lines on EACH side,
 * applied to both leading («псевдоконец») and trailing («псевдоначало»).
 * Independent of total plasmid length — short circular plasmids get
 * wrap-tail too (V102 23.05). `buildWrapTailLines` clamps to the real
 * line count, so a plasmid shorter than the preview just shows fewer.
 */
export function pickWrapTailLines({ cpl }) {
  if (!Number.isFinite(cpl) || cpl <= 0) return 0;
  return Math.ceil(WRAP_TAIL_PREVIEW_BP / cpl);
}

/**
 * Round-10 (06.05.2026 biolog «новой строки быть не должно»):
 * trailing wrap-tail moved INLINE — the last main line is widened to
 * a full cpl by appending wrap chars from the plasmid start, with a
 * vertical origin divider INSIDE the line at `wrapAt` (= number of
 * real-plasmid chars before the wrap). Returns null when the last
 * line is already a full cpl (no wrap needed) or when the inputs
 * are invalid / linear.
 *
 * Output: {
 *   start, seq, wrapAt, kind: 'main', wrapsOrigin: true
 * }
 *  - `start` is the plasmid coord where this line begins
 *  - `seq` is `cpl` chars: real_chars_to_seqLen + wrap_chars_from_origin
 *  - `wrapAt` is the column index where origin sits (== number of
 *     real chars in the line)
 */
export function buildWrapBridgeLine({ fullSeq, cpl, circular }) {
  if (!circular || !fullSeq || typeof fullSeq !== 'string') return null;
  const cplFloor = Math.max(1, Math.floor(cpl || 0));
  const seqLen = fullSeq.length;
  if (seqLen === 0) return null;
  const totalLines = Math.ceil(seqLen / cplFloor);
  if (totalLines < 2) return null; // 1-line plasmid: nothing to bridge
  const lastStart = (totalLines - 1) * cplFloor;
  const realChars = seqLen - lastStart;
  if (realChars >= cplFloor) return null; // last line already full cpl
  const wrapNeeded = cplFloor - realChars;
  // Defensive: don't wrap past plasmid (a tiny plasmid where
  // wrapNeeded > seqLen would just re-render the whole thing —
  // pointless context).
  const wrapTake = Math.min(wrapNeeded, seqLen);
  const seq = fullSeq.slice(lastStart) + fullSeq.slice(0, wrapTake);
  return {
    start: lastStart,
    seq,
    wrapAt: realChars,
    kind: 'main',
    wrapsOrigin: true,
  };
}

export function buildWrapTailLines({
  fullSeq,
  cpl,
  leadingCount,
  trailingCount,
  trailingStart = 0,
}) {
  const empty = { leading: [], trailing: [] };
  if (!fullSeq || typeof fullSeq !== 'string') return empty;
  const cplFloor = Math.max(1, Math.floor(cpl || 0));
  if (!Number.isFinite(cplFloor)) return empty;

  const seqLen = fullSeq.length;
  if (seqLen === 0) return empty;
  const totalLines = Math.ceil(seqLen / cplFloor);
  const leadCnt = Math.max(0, Math.min(Math.floor(leadingCount || 0), totalLines));
  const trailCnt = Math.max(0, Math.min(Math.floor(trailingCount || 0), totalLines));

  const leading = [];
  // Leading wrap-tail is the LAST `leadCnt` × cpl nucleotides of the
  // plasmid, aligned so the FINAL leading line ends exactly at seqLen.
  // Biolog 06.05.2026 round 6: «там должно быть черта и сразу за
  // чертой призрачный сиквенс другого конца, а не с новой строки» —
  // i.e. visual continuity with main:first across the origin marker.
  // The naive grid alignment (start = i × cpl) used to leave the last
  // leading line short (e.g. 48 chars on 4948 bp / cpl=140) which
  // looked like an «обрыв» before the origin. Shift-anchor: each
  // leading line is exactly cpl characters wide and the strip ends on
  // the last nucleotide of the plasmid.
  if (leadCnt > 0) {
    const leadingTotalLen = Math.min(leadCnt * cplFloor, seqLen);
    const leadingStart = seqLen - leadingTotalLen;
    for (let i = 0; i < leadCnt; i += 1) {
      const start = leadingStart + i * cplFloor;
      if (start >= seqLen) break;
      const sliceEnd = Math.min(start + cplFloor, seqLen);
      leading.push({
        start,
        seq: fullSeq.slice(start, sliceEnd),
        kind: 'leading-wrap',
      });
    }
  }

  // Round-13 (06.05.2026): biolog «дублирование начала
  // последовательности, из-за чего она странно выделяется с гапом».
  // Trailing rows now start AFTER bridge's wrap-half (param
  // `trailingStart`, computed by the caller as cpl - bridge.wrapAt
  // — the number of plasmid chars bridge already shows past origin).
  // No more duplicated chars between bridge wrap-half and
  // trailing[0]; the visual tape reads as one continuous strip
  // bridge → trailing[0] → trailing[1] without overlap.
  const trailing = [];
  const tStartFloor = Math.max(0, Math.floor(trailingStart || 0));
  for (let i = 0; i < trailCnt; i += 1) {
    const start = tStartFloor + i * cplFloor;
    if (start >= seqLen) break;
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
