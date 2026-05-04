/**
 * SequenceView scroll-handle helpers — pure DOM utilities extracted
 * from `index.jsx` in Sprint M-X.2 K1 decomposition.
 *
 *   findScrollingAncestor(el)
 *     Walks up the DOM from `el` looking for the nearest ancestor
 *     whose computed overflow-y is `auto` or `scroll` AND that
 *     actually scrolls (scrollHeight > clientHeight). Falls back to
 *     `document.scrollingElement` / `document.documentElement` when
 *     nothing closer scrolls. Used by the auto-scroll edge logic to
 *     locate the real scroller (Importer wraps SequenceView in a
 *     parent that owns the scrollbar).
 *
 *   attachScrollHandle(_ref, containerRef) → factory
 *     Returns the imperative `scrollToPosition(absolutePos, opts)`
 *     handler bound to `containerRef`. Resolves the line containing
 *     `absolutePos` via the `data-line-start` attribute, scrolls the
 *     element into view (using `Element.scrollIntoView` so it works
 *     regardless of which ancestor actually owns the scrollbar), and
 *     skips entirely when the target line is already on screen
 *     (biolog 04.05.2026: «если около края нажимать то не
 *     центрировалось на каретку» — recentering felt like the viewer
 *     was «yanking» the user's eye for no reason). Caller can opt out
 *     with { force: true } if a future workflow needs an
 *     unconditional center.
 */

export function findScrollingAncestor(el) {
  if (!el || typeof getComputedStyle !== "function") return null;
  let cur = el.parentElement;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = getComputedStyle(cur);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export function attachScrollHandle(_ref, containerRef) {
  return () => ({
    scrollToPosition(absolutePos, opts) {
      const root = containerRef.current;
      if (!root) return;
      const lines = root.querySelectorAll(
        '[data-testid="sequence-view-line"]',
      );
      if (lines.length === 0) return;
      let target = null;
      for (const el of lines) {
        const start = parseInt(el.dataset.lineStart || "", 10);
        if (Number.isNaN(start)) continue;
        if (start > absolutePos) break;
        target = el;
      }
      if (!target) return;
      const force = !!(opts && opts.force);
      try {
        if (!force && target.getBoundingClientRect) {
          const targetRect = target.getBoundingClientRect();
          const scroller = findScrollingAncestor(root);
          const scrollerRect = scroller && scroller !== document.body && scroller !== document.documentElement
            ? scroller.getBoundingClientRect()
            : { top: 0, bottom: window.innerHeight || document.documentElement.clientHeight };
          if (
            targetRect.top >= scrollerRect.top
            && targetRect.bottom <= scrollerRect.bottom
          ) {
            return; // already on screen — don't recenter
          }
        }
      } catch { /* fall through to scrollIntoView */ }
      const behavior = (opts && opts.behavior) || "smooth";
      try {
        if (typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ behavior, block: "center" });
        } else {
          const containerRect = root.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const offset = targetRect.top - containerRect.top + root.scrollTop;
          root.scrollTop = offset;
        }
      } catch {
        // happy-dom + some jsdom builds throw on getBoundingClientRect
        // when the element isn't laid out — accept the no-op, the
        // caret marker still tells the biolog where the jump landed.
      }
    },
  });
}
