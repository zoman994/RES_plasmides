/**
 * Pure geometry for the LINEAR fragment/plasmid map («колбаска», Игорь 22.06:
 * клик по сайту на линейной форме). Mirrors lib/plasmid-map-v2 but on an x-axis:
 * lane-packing for non-overlapping feature rows + ruler ticks. Unit-tested; the
 * SVG component (LinearMapV2) owns only pixels.
 */
import { rulerStep } from './plasmid-map-v2';

/**
 * Greedy interval-graph lane assignment: pack intervals into the fewest rows so
 * none overlap within a row. Touching intervals ([0,10] + [10,20]) share a lane
 * (end ≤ start). Returns a lane index per interval, ALIGNED TO INPUT ORDER.
 * Used for both feature arrows and (label-extent) RE labels.
 */
export function lanePack(intervals) {
  if (!Array.isArray(intervals) || !intervals.length) return [];
  const order = intervals
    .map((iv, i) => ({ s: Number(iv.start), e: Number(iv.end), i }))
    .filter((iv) => Number.isFinite(iv.s) && Number.isFinite(iv.e))
    .sort((a, b) => a.s - b.s || a.e - b.e);
  const laneEnd = []; // last `end` placed in each lane
  const lanes = new Array(intervals.length).fill(0);
  for (const it of order) {
    let placed = -1;
    for (let L = 0; L < laneEnd.length; L += 1) {
      if (laneEnd[L] <= it.s) { placed = L; break; }
    }
    if (placed === -1) { placed = laneEnd.length; laneEnd.push(it.e); } else laneEnd[placed] = it.e;
    lanes[it.i] = placed;
  }
  return lanes;
}

/** Number of distinct lanes a pack produced (≥1 even for an empty pack). */
export function laneCount(lanes) {
  return lanes && lanes.length ? Math.max(...lanes) + 1 : 1;
}

/** Major ruler ticks for a linear axis 0..total (reuses the circular step). */
export function linearTicks(total) {
  const step = rulerStep(total) || Math.max(1, total);
  const majors = [];
  for (let bp = 0; bp <= total; bp += step) majors.push(bp);
  return { step, majors };
}

/** bp → x within [x0, x1]; clamps degenerate totals so x stays finite. */
export function bpToX(bp, total, x0, x1) {
  const t = total > 0 ? total : 1;
  return x0 + (Number(bp) / t) * (x1 - x0);
}
