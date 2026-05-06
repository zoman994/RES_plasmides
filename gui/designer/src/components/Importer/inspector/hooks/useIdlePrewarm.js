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
  // 2026-05-06 (round 3) — biolog: «между вкладками должно быстрее
  // мысли переключаться». Earlier rAF schedule meant Annotations
  // finished warming ~48 ms after Inspector mount; quick Sequence →
  // Annotations switches caught it half-warmed and React still had
  // to mount the heavy Annotator inline. Microtask now — both
  // Sequence and Annotations land in the same React batch as the
  // Overview render, so any tab switch from second 1 onwards is a
  // pure display:none → display:block flip.
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('annotations')) return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setWarmedTabs((prev) => (prev.has('annotations') ? prev : new Set([...prev, 'annotations'])));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('annotations'), testMode]);

  return warmedTabs;
}
