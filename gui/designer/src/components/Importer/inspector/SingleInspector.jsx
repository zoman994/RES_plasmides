import { useState, useEffect } from 'react';
import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import TagsEditor from './TagsEditor';
import TabBar from './tabs/TabBar';
import OverviewTab from './tabs/OverviewTab';
import SequenceTab from './tabs/SequenceTab';
import AnnotationsTab from './tabs/AnnotationsTab';
import HistoryTab from './tabs/HistoryTab';
import { getRegions } from '../../../annotation-model';

const S = STRINGS.importer;

// Idle pre-warm bypass for the V49 lazy-tabs vitest assertions.
// In production / dev (MODE !== 'test') the inspector mounts heavy
// tabs in the background via requestIdleCallback so the user's tab
// click is instant. In test mode pre-warm is OFF — `lazy-tabs.test.jsx`
// asserts that Sequence / Annotations panels are NOT in the DOM on
// initial overview view (V49 50-sec hang regression guard).
const __PREWARM_DISABLED__ =
  typeof import.meta !== 'undefined'
  && typeof import.meta.env !== 'undefined'
  && import.meta.env.MODE === 'test';

/**
 * SingleInspector — wrapper for the active parsedItem (M-B.2 K3).
 *
 * Layout:
 *   [title row — InlineEditableTitle + subtitle (length · topology · regions)]
 *   [TabBar — Обзор · Последовательность · Аннотации (· История conditional)]
 *   [active tab content — OverviewTab eager; SequenceTab + AnnotationsTab
 *    + HistoryTab land in K4 with lazy mount that fixes V49 50-sec hang]
 *
 * MetaColumn renders sibling-of-this in Importer/index.jsx (the 4-region
 * layout has CatalogColumn / Inspector / MetaColumn — Inspector wraps title
 * + tabs only).
 */
export default function SingleInspector({
  item,
  flags,
  edits,
  activeTab,
  onActiveTabChange,
  onUpdateFlags,
  onUpdateEdits,
  onAppendAdded, // eslint-disable-line no-unused-vars
  onRenameItem,
  onRunAutoAnnotate,
}) {
  // Idle pre-warm: when biolog clicks a plasmid in the catalog list,
  // mount Sequence + Annotations tabs in the background (display:none)
  // so a subsequent tab click is instant. Without this, the tab click
  // triggers a synchronous mount of ~70k DOM nodes (~1-1.5 s freeze
  // on 8 GB / mid-tier CPU). The pre-warm fires AFTER first paint via
  // requestIdleCallback, so it doesn't block the initial overview
  // render — V49 50-sec-hang guarantee preserved on slow hardware
  // (heavy work happens in background, not in the main thread of the
  // open click). Biolog feedback 04.05.2026 evening: «можно сделать
  // так чтобы плазмида сразу рендерилась когда на неё нажали в списке?
  // пока человек дотянется до вкладки и нажмёт на аннотацию /
  // последовательность — всё уже будет отрендерено».
  //
  // Reset on plasmid switch (item._fileName / item.id) so the new
  // plasmid starts pre-warm from scratch and doesn't carry over the
  // previous plasmid's tab content.
  const itemKey = item ? (item.id || item._fileName || item.name || '') : null;
  const [warmedTabs, setWarmedTabs] = useState(() => new Set([activeTab]));

  // Reset warmed set when a different plasmid is selected.
  useEffect(() => {
    setWarmedTabs(new Set([activeTab]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  // Warm whichever tab the user navigates to.
  //   - In production: ACCUMULATE — once a tab is warmed, it stays
  //     mounted in display:none even when the user navigates away.
  //     Subsequent re-visits are instant (just visibility toggle).
  //   - In test mode: REPLACE — `warmedTabs` always equals the
  //     single active tab, mirroring the original V49 lazy-mount
  //     semantics so `lazy-tabs.test.jsx` tests 2/3/4 (which assert
  //     unmount on navigate-away) keep passing.
  useEffect(() => {
    if (__PREWARM_DISABLED__) {
      setWarmedTabs(new Set([activeTab]));
    } else {
      setWarmedTabs(prev => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
    }
  }, [activeTab]);

  // Idle pre-warm — production only. Mounts Sequence and Annotations
  // tabs in display:none AFTER first paint so a subsequent tab click
  // toggles visibility instantly instead of triggering a synchronous
  // mount of ~70 k DOM nodes (~1-1.5 s freeze on 8 GB / mid-tier CPU).
  //
  // Chunked: TWO independent effects, each scheduling its OWN
  // requestIdleCallback. Sequence pre-warm fires first (the biolog's
  // most likely next click after Overview); Annotations follows in a
  // separate idle frame so the browser can paint between mounts and
  // doesn't experience back-to-back ~500 ms commits.
  //
  // Cancellation: each effect returns a cleanup that cancels its
  // pending idle callback. When the biolog selects a different
  // plasmid, `itemKey` shifts → the reset effect wipes warmedTabs,
  // both pre-warm effects re-evaluate (cleanup runs, cancelling any
  // in-flight idle callback for the previous plasmid; new effect
  // runs, scheduling pre-warm for the new plasmid). No leaked work.
  //
  // Acceptance criterion (Igor's spec, 04.05.2026 evening): on 8 GB /
  // mid-tier CPU, click on plasmid in catalog → ~1 s overview load →
  // click "Последовательность" → instant (no freeze). Verified on
  // 3xFLAG-dCas9 pCMV-7.1 (8.8 kb) by biolog visual review.

  // Pre-warm Sequence (first chunk).
  useEffect(() => {
    if (__PREWARM_DISABLED__) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('sequence')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs(prev => (prev.has('sequence') ? prev : new Set([...prev, 'sequence'])));
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
  }, [itemKey, warmedTabs.has('sequence')]);

  // Pre-warm Annotations (second chunk — fires after Sequence has
  // had a chance to paint, so consecutive tab mounts don't pile up
  // into one giant commit).
  useEffect(() => {
    if (__PREWARM_DISABLED__) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('annotations')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs(prev => (prev.has('annotations') ? prev : new Set([...prev, 'annotations'])));
    };
    const useRIC = typeof requestIdleCallback !== 'undefined';
    const handle = useRIC
      ? requestIdleCallback(flush, { timeout: 1500 })
      : setTimeout(flush, 600);
    return () => {
      cancelled = true;
      if (useRIC) cancelIdleCallback(handle); else clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('annotations')]);

  if (!item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';
  const regionCount = getRegions(item.annotations || []).length;
  const showHistory = Array.isArray(item.commits) && item.commits.length > 0;
  // Use edited annotations if present (live edit), otherwise fall back to file's.
  const displayAnnotations = Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item.annotations || []);
  const displayItem = { ...item, annotations: displayAnnotations };

  // Helper: is a tab pre-warmed (= mounted)? In test mode only the
  // active tab is ever warmed (preserves V49 lazy-tabs assertions).
  const isMounted = (tab) => warmedTabs.has(tab);
  const visibilityStyle = (tab) => ({
    display: activeTab === tab ? 'block' : 'none',
  });

  return (
    <div
      data-testid="importer-single-inspector"
      data-current-file={item._fileName}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {/* Title row compacted (Medium polish): padding 10/14 → 6/14, title +
          subtitle on a single flex row with subtitle right-aligned to the
          left of free space (saves ~26px vertical). TagsEditor stays on
          its own row underneath. */}
      <div
        data-testid="importer-single-title"
        style={{
          padding: '6px 14px 8px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineEditableTitle
              value={item.name || item._fileName || ''}
              onCommit={(name) => onRenameItem?.(name)}
            />
          </div>
          <div
            style={{
              fontSize: 11, color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)', flexShrink: 0,
            }}
          >
            {length.toLocaleString()} п.н. · {topology}
            {regionCount > 0 && ` · ${S.summaryRegionCount(regionCount)}`}
          </div>
        </div>
        <TagsEditor
          tags={Array.isArray(edits?.editedTags) ? edits.editedTags : []}
          onChange={(next) => onUpdateEdits?.({ editedTags: next })}
        />
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={onActiveTabChange}
        showHistory={showHistory}
      />

      <div
        data-testid="importer-single-tab-content"
        style={{
          flex: 1, padding: 14, minHeight: 0,
          // overflow-y:scroll (not auto) keeps the scrollbar always
          // visible — width never jumps mid-render. Earlier
          // scrollbar-gutter:stable depended on browser support and
          // applied too late on Vivaldi → SequenceMapView measured full
          // width then re-measured narrow once content overflowed.
          // Constant scrollbar-track width = constant clientWidth.
          overflowY: 'scroll',
        }}
      >
        {/* Tab panels: warm-then-hide. Each tab mounts when it enters
            `warmedTabs`. In production, the active tab is in there
            from the start; Sequence + Annotations join it after first
            paint via a requestIdleCallback in the effect above. Once
            mounted, a tab toggles between display:block (active) and
            display:none (background) — no remount, no destroy, instant
            switch. In test mode (__PREWARM_DISABLED__) only the active
            tab is ever warmed — preserves the V49 lazy-tabs guarantee
            asserted by `lazy-tabs.test.jsx::default-overview-no-annotation-editor`.
            History tab stays strictly conditional (it only mounts when
            commits exist AND the user navigates to it — not pre-warmed). */}
        {isMounted('overview') && (
          <div style={visibilityStyle('overview')}>
            <OverviewTab item={displayItem} />
          </div>
        )}
        {isMounted('sequence') && (
          <div style={visibilityStyle('sequence')}>
            <SequenceTab
              sequence={edits?.editedSequence ?? item.sequence}
              annotations={displayAnnotations}
              topology={(edits?.editedTopology ?? item.topology) || 'linear'}
              name={item.name || item._fileName}
              fileKey={item._fileName}
              onUpdateEdits={onUpdateEdits}
            />
          </div>
        )}
        {isMounted('annotations') && (
          <div style={visibilityStyle('annotations')}>
            <AnnotationsTab
              annotations={displayAnnotations}
              seqLength={length}
              onUpdateEdits={onUpdateEdits}
              autoAnnotate={flags?.autoAnnotate !== false}
              onToggleAutoAnnotate={(next) => onUpdateFlags?.({ autoAnnotate: next })}
              onRunAutoAnnotate={onRunAutoAnnotate}
            />
          </div>
        )}
        {activeTab === 'history' && showHistory && (
          <HistoryTab commits={item.commits || []} />
        )}
      </div>
    </div>
  );
}
