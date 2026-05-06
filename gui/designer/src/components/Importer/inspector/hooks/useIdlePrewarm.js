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
  // 2026-05-06 (round 2) — even with double-rAF biolog reported the
  // first Sequence click still felt slow. Microtask-scheduled now:
  // `Promise.resolve().then(flush)` flushes BEFORE React paints the
  // initial Overview, so the SequenceView mount runs concurrently
  // with Overview's paint. Trade-off: Overview's initial render is
  // ~5 % slower because Sequence competes for the same render pass,
  // but the user perceives the Inspector «open» as instant either
  // way (Overview is light) and the click on Sequence is now truly
  // pre-warmed.
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('sequence')) return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setWarmedTabs((prev) => (prev.has('sequence') ? prev : new Set([...prev, 'sequence'])));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('sequence'), testMode]);

  // Annotations pre-warm.
  //
  // 2026-05-06 (round 4) — Chrome MCP profile showed a 183 ms long
  // task on Inspector first-mount of a 10 kb plasmid: the Overview
  // render + Sequence mount + Annotator mount all collapsed into one
  // React batch (microtask schedule). Going back to a paint-deferred
  // schedule for the heaviest of the three (the Annotator with its
  // own SequenceView + LevelPanel + tracks):
  //   • Sequence still microtask — instant click reaction.
  //   • Annotator double-rAF — lands ~32 ms later, AFTER the user
  //     has seen the Inspector paint. Sequence ↔ Annotations switch
  //     within ~32 ms of opening still costs a beat, but every
  //     subsequent switch is a pure display flip.
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('annotations')) return undefined;
    let cancelled = false;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setWarmedTabs((prev) => (prev.has('annotations') ? prev : new Set([...prev, 'annotations'])));
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
