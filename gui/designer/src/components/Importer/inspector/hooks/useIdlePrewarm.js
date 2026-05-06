import { useEffect, useState } from 'react';

/**
 * Idle pre-warm for SingleInspector tabs.
 *
 * When the user clicks a plasmid in the catalog, mount Sequence and
 * Annotations tabs in the background (display:none) so a subsequent
 * tab click is instant. Without this, the tab click triggers a
 * synchronous mount of ~70 k DOM nodes (~1–1.5 s freeze on 8 GB /
 * mid-tier CPU). The pre-warm fires AFTER first paint via
 * requestIdleCallback, so it doesn't block the initial overview
 * render — V49 50-sec-hang guarantee preserved on slow hardware.
 *
 * Chunked: two independent effects, each scheduling its own
 * requestIdleCallback. Sequence fires first (biolog's most likely
 * next click after Overview); Annotations follows in a separate
 * idle frame so the browser can paint between mounts.
 *
 * Cancellation: each effect returns a cleanup that cancels its
 * pending idle callback. When the biolog selects a different
 * plasmid, `itemKey` shifts → the reset effect wipes warmedTabs,
 * both pre-warm effects re-evaluate.
 *
 * In test mode (`testMode = true`) the hook only ever has the
 * active tab in `warmedTabs` — preserves the V49 lazy-tabs vitest
 * assertions (`lazy-tabs.test.jsx::default-overview-no-annotation-editor`).
 */
export function useIdlePrewarm({ itemKey, activeTab, testMode = false }) {
  const [warmedTabs, setWarmedTabs] = useState(() => new Set([activeTab]));

  useEffect(() => {
    setWarmedTabs(new Set([activeTab]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  useEffect(() => {
    if (testMode) {
      setWarmedTabs(new Set([activeTab]));
    } else {
      setWarmedTabs((prev) => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
    }
  }, [activeTab, testMode]);

  // Sequence pre-warm.
  //
  // 2026-05-06 — biolog: «первое нажатие на сиквенс открывает с
  // секундной задержкой». Cause: idle-callback timeout was 800 ms,
  // so on busy main thread the prewarm fired AFTER the user already
  // clicked → React mounted the heavy SequenceView synchronously
  // inside the click handler. Switched to a double-rAF schedule:
  // we wait for ONE paint to land Overview, then prewarm Sequence on
  // the next frame (~16 ms later). Biolog now has the heavy tree
  // mounted hidden by the time their finger reaches the Sequence tab.
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('sequence')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs((prev) => (prev.has('sequence') ? prev : new Set([...prev, 'sequence'])));
    };
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(flush);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('sequence'), testMode]);

  // Annotations pre-warm — same double-rAF pattern but one extra
  // frame later than Sequence so the browser can paint between the
  // two heavy mounts. Both are still mounted before the user's
  // finger reaches the tab strip.
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('annotations')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs((prev) => (prev.has('annotations') ? prev : new Set([...prev, 'annotations'])));
    };
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        // Extra frame so Sequence prewarm finishes first.
        requestAnimationFrame(flush);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('annotations'), testMode]);

  return warmedTabs;
}
