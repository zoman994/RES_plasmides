/**
 * line-window.js — pure windowing math for SequenceView virtualization.
 *
 * Problem (Игорь, 19.06.2026 — «выравниватель всё ещё медленный»): the
 * viewer mounts EVERY line of a plasmid at once (no virtualization). On a
 * >5 kb reference that is ~100+ heavy SequenceLine subtrees (ruler + strands
 * + annotations + AA + RE + read-track + chromatogram = thousands of SVG
 * nodes). Two felt symptoms, both measured to be render-bound (the O(seqLen)
 * derivations — detectORFRanges/scanAllSites — are <1 ms on 8 kb):
 *   • «появление» — first paint mounts all N lines synchronously;
 *   • «печать»     — a direct insert shifts every downstream position, so
 *                    every line below the caret legitimately re-renders.
 *
 * Fix: render only the lines whose index is within the on-screen window
 * (± overscan); render every OTHER line index as a fixed-height placeholder
 * that keeps the same outer <div> + data-attributes (so SelectionOverlay /
 * CaretOverlay / scrollToPosition / computeVisible — all of which measure
 * real per-line DOM rects — keep finding every slot) but drops the heavy
 * track subtrees. Active (visible) lines are always real, so the overlays
 * stay pixel-exact against the laid-out DOM.
 *
 * This module is the PURE half (clamp + overscan + equality). The impure
 * half (measuring which rendered lines intersect the scroller viewport,
 * driving the window state on scroll) lives in index.jsx, so this stays
 * unit-testable with no DOM.
 *
 * Gated by size: below VIRTUALIZE_THRESHOLD lines the caller renders every
 * line eagerly (current behaviour) — keeps all existing small-fixture tests
 * on the unchanged path; only large sequences (the slow case) virtualize.
 */

// Lines. 30 lines covers the «>5 kb» complaint at every realistic wrap
// width (5 kb is ~34 lines at 150 cpl, ~63 at 80 cpl), while leaving small
// fixtures (a few lines) on the eager path. Virtualizing a view that fully
// fits the viewport is a no-op anyway: the window then spans every line, so
// all render eagerly — only genuinely tall views actually drop work.
export const VIRTUALIZE_THRESHOLD = 30;

// How many lines beyond the visible band to keep mounted on each side, so a
// normal wheel/drag scroll never exposes a blank placeholder between ticks.
export const DEFAULT_OVERSCAN = 10;

export function shouldVirtualize(lineCount, threshold = VIRTUALIZE_THRESHOLD) {
  return Number.isFinite(lineCount) && lineCount > threshold;
}

export function clampIdx(i, count) {
  if (!Number.isFinite(i) || !Number.isFinite(count) || count <= 0) return 0;
  if (i < 0) return 0;
  const max = count - 1;
  return i > max ? max : Math.floor(i);
}

/**
 * Active window [first, last] (inclusive indices into the main-line array)
 * from the measured first/last VISIBLE main-line indices + overscan.
 *
 * When the visible band can't be measured (e.g. a jump scrolled the whole
 * rendered band off-screen for one tick) the caller passes non-finite
 * firstVisibleIdx/lastVisibleIdx and we keep a head window so something is
 * always mounted; the next tick measures and corrects.
 */
export function computeDesiredWindow({
  count, firstVisibleIdx, lastVisibleIdx, overscan = DEFAULT_OVERSCAN, overscanBefore, overscanAfter,
}) {
  if (!Number.isFinite(count) || count <= 0) return { first: 0, last: 0 };
  // Asymmetric overscan lets the caller LEAD the scroll direction (a fast
  // wheel/drag pre-mounts more lines ahead so no blank placeholder is exposed),
  // while the trailing side keeps only the base buffer. Both default to the
  // symmetric `overscan` for back-compat.
  const ob = Number.isFinite(overscanBefore) ? overscanBefore : overscan;
  const oa = Number.isFinite(overscanAfter) ? overscanAfter : overscan;
  const fv = firstVisibleIdx;
  const lv = lastVisibleIdx;
  if (!Number.isFinite(fv) || !Number.isFinite(lv) || fv > lv) {
    return { first: 0, last: clampIdx(Math.max(ob, oa) * 2, count) };
  }
  return {
    first: clampIdx(fv - ob, count),
    last: clampIdx(lv + oa, count),
  };
}

/**
 * Velocity-aware overscan: extend the buffer on the LEADING edge proportional
 * to scroll speed (lines moved since the previous tick) so a fast wheel /
 * middle-button drag never outruns the window and flashes a blank placeholder.
 * The trailing edge keeps the base buffer; the lead is capped at `max` so a
 * fling doesn't try to mount the whole document in one frame.
 *
 * @param {{deltaLines:number, base?:number, max?:number}} o
 * @returns {{overscanBefore:number, overscanAfter:number}}
 */
export function directionalOverscan({ deltaLines, base = DEFAULT_OVERSCAN, max = base * 4 }) {
  const d = Number.isFinite(deltaLines) ? deltaLines : 0;
  if (d === 0) return { overscanBefore: base, overscanAfter: base };
  const lead = Math.min(max, base + Math.ceil(Math.abs(d) * 1.5));
  return d > 0
    ? { overscanBefore: base, overscanAfter: lead } // scrolling down
    : { overscanBefore: lead, overscanAfter: base }; // scrolling up
}

/**
 * Window centred on a target line index — used for PROGRAMMATIC scrolls
 * (scrollToPosition), where the band may have jumped far from the viewport
 * and the rect-driven measurement would briefly read empty.
 */
export function windowFromAnchor({ count, anchorIdx, viewportLines = 1, overscan = DEFAULT_OVERSCAN }) {
  if (!Number.isFinite(count) || count <= 0) return { first: 0, last: 0 };
  const a = clampIdx(anchorIdx, count);
  const vl = Number.isFinite(viewportLines) && viewportLines > 0 ? Math.ceil(viewportLines) : 1;
  return {
    first: clampIdx(a - overscan, count),
    last: clampIdx(a + vl + overscan, count),
  };
}

/**
 * Merge two windows into the union — used so a programmatic jump window and
 * the subsequently-measured window don't fight (the union never drops a line
 * that either source wants mounted, avoiding a one-frame blank).
 */
export function unionWindow(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { first: Math.min(a.first, b.first), last: Math.max(a.last, b.last) };
}

export function windowsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.first === b.first && a.last === b.last;
}

export function isActiveIdx(idx, win) {
  if (!win) return true;
  return idx >= win.first && idx <= win.last;
}
