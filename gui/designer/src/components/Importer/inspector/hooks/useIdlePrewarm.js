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
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('sequence')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs((prev) => (prev.has('sequence') ? prev : new Set([...prev, 'sequence'])));
    };
    const useRIC = typeof requestIdleCallback !== 'undefined';
    const handle = useRIC
      ? requestIdleCallback(flush, { timeout: 800 })
      : setTimeout(flush, 250);
    return () => {
      cancelled = true;
      if (useRIC) cancelIdleCallback(handle); else clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('sequence'), testMode]);

  // Annotations pre-warm.
  useEffect(() => {
    if (testMode) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('annotations')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs((prev) => (prev.has('annotations') ? prev : new Set([...prev, 'annotations'])));
    };
    const useRIC = typeof requestIdleCallback !== 'undefined';
    const handle = useRIC
      ? requestIdleCallback(flush, { timeout: 1500 })
      : setTimeout(flush, 400);
    return () => {
      cancelled = true;
      if (useRIC) cancelIdleCallback(handle); else clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('annotations'), testMode]);

  return warmedTabs;
}
