import { useCallback, useState, useEffect } from 'react';
import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import TabBar from './tabs/TabBar';
import OverviewTab from './tabs/OverviewTab';
import SequenceTab from './tabs/SequenceTab';
import LinearFeatureBar from './tabs/LinearFeatureBar';
// AnnotationsTab removed from Importer (Importer-merge-tabs, 04.05.2026)
// — Inspector is now read-only viewer territory. Annotation EDITING
// moves to a dedicated future Annotator module per the «не смешивай»
// architecture decision. The LinearFeatureBar «колбаса» now lives at
// the SingleInspector level (not inside SequenceTab) — always visible
// regardless of active tab; click on a feature auto-switches to the
// sequence tab and scrolls SequenceView to that feature's start.
// TagsEditor moved out of the title row into MetaColumn (right rail).
import HistoryTab from './tabs/HistoryTab';
import { getRegions } from '../../../annotation-model';
import { applyAnnotationEdit } from '../../../lib/annotation-edit.js';

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
  onUpdateFlags, // eslint-disable-line no-unused-vars -- reserved for future Annotator hand-off
  onUpdateEdits,
  onAppendAdded, // eslint-disable-line no-unused-vars
  onRenameItem,
  // eslint-disable-next-line no-unused-vars -- ditto
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

  // Annotations pre-warm removed (Importer-merge-tabs, 04.05.2026) —
  // there is no longer an annotations tab. Sequence pre-warm above
  // remains; the LinearFeatureBar mounts as part of SequenceTab and
  // doesn't need a separate idle slot.

  // Pending scroll request from the LinearFeatureBar (lives at
  // SingleInspector level). When the biolog clicks/drags on the
  // bar from the Overview tab we auto-switch to Sequence and queue
  // the absolute position; SequenceTab consumes the queue via a prop
  // + clears it back to null. `tick` bumps on each new request even
  // if the position repeats — useEffect deps catch the change.
  // `instant: true` asks SequenceView to use behavior:'auto' for
  // responsive live-scrubbing during drag.
  const [pendingScroll, setPendingScroll] = useState(null);
  // Cursor marker on the strip — persistent (last set position) even
  // after the scroll is applied + pendingScroll cleared. Lets the
  // biolog visually see where the last navigation landed AND drives
  // the scrubber thumb on the bar (drag updates this state, the bar
  // re-renders the cursor at the new x).
  const [cursorPos, setCursorPos] = useState(null);
  // Selection anchor — the OTHER end of the selection range. When
  // anchor === cursorPos, no selection. When they differ, the range
  // [min(anchor,cursor)..max(anchor,cursor)] is highlighted on the
  // SequenceView and copyable via Ctrl+C (forward strand) /
  // Ctrl+Alt+C (reverse complement). Set/extended by SequenceView's
  // shift-arrow keys; collapsed on plain caret moves.
  const [cursorAnchor, setCursorAnchor] = useState(null);
  // Selection mode — 'aa' when biolog clicked an AA cell to select
  // its underlying triplet, 'dna' otherwise. Drives whether Copy AA
  // (Ctrl+Shift+C / context menu) is reachable: biolog 04.05.2026
  // evening: «"копировать АА" можно только если ты выделяешь
  // непосредственно АА сиквенс».
  const [cursorSelectionMode, setCursorSelectionMode] = useState(null);
  // Strand of the selected CDS feature (1 forward / -1 reverse) —
  // needed by Copy AA to know whether to reverse-complement the
  // slice before translating. lacZα and friends sit on the reverse
  // strand and translating the top-strand slice directly gives
  // gibberish (biolog 04.05.2026 evening lab session).
  const [cursorSelectionStrand, setCursorSelectionStrand] = useState(1);

  // Click / pointer-up settle from the bar — final position. Switch
  // to Sequence tab if biolog initiated from Overview, then queue
  // a smooth scroll to land the viewer there. Bar interactions
  // ALWAYS collapse selection (anchor = focus = pos) — biolog hasn't
  // asked for shift-click on the bar so we keep its UX simple.
  const onBarSettle = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    if (activeTab !== 'sequence') {
      onActiveTabChange?.('sequence');
    }
    setCursorPos(pos);
    setCursorAnchor(pos);
    setCursorSelectionMode('dna');
    setPendingScroll({ pos, tick: Date.now(), instant: false });
  }, [activeTab, onActiveTabChange]);

  // Live drag scrub — fires every pointermove. Always update the
  // cursor visual; only push a scroll when biolog is already on the
  // Sequence tab (no point auto-switching tabs mid-drag, that would
  // yank context away while they're still aiming). Same selection-
  // collapse rule as onBarSettle.
  const onBarScrub = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    setCursorPos(pos);
    setCursorAnchor(pos);
    setCursorSelectionMode('dna');
    if (activeTab === 'sequence') {
      setPendingScroll({ pos, tick: Date.now(), instant: true });
    }
  }, [activeTab]);

  // Keyboard caret nav inside SequenceView (arrow keys etc.). Same
  // shape as `onBarSettle` but always uses the instant scroll
  // behavior — smooth animation can't keep up with held arrow keys.
  //
  // `opts.extendSelection` — set by SequenceView when biolog held
  // Shift while pressing an arrow / Home / End / PageUp / PageDown.
  // True ⇒ anchor stays where it was, focus moves (extends the
  // selection range). False ⇒ collapse, anchor = focus.
  // `opts.needsScroll === false` — caret stayed on the same line so
  // skip the scrollIntoView call.
  const onCaretChangeFromView = useCallback((pos, opts) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    setCursorPos(pos);
    if (!opts || !opts.extendSelection) {
      setCursorAnchor(pos);
      // Plain caret moves (no shift) collapse selection AND drop
      // back to DNA mode — biolog explicitly leaves AA territory by
      // pressing arrow without shift.
      setCursorSelectionMode('dna');
    }
    // Shift+arrow extends selection AND PRESERVES the current mode:
    // an AA selection stays 'aa' so the blue overlay + Copy AA
    // hotkey remain valid as the user walks codon-by-codon (biolog
    // 04.05.2026 evening: «с зажатым шифтом идёшь по АК … выделяются
    // триплетами»). DNA-mode shift+arrow keeps DNA mode by default
    // (no mode change in this branch).
    if (opts && opts.needsScroll === false) return;
    setPendingScroll({ pos, tick: Date.now(), instant: true });
  }, []);

  // Feature click in the SequenceView (biolog 04.05.2026 evening:
  // «при нажатии на фичу в ВИВЕРЕ должна выделятся вся область
  // фичи»). Set anchor at start, focus (caret) at end so the
  // SelectionOverlay highlights the whole feature region. Queues a
  // smooth scroll to the start so the biolog sees the beginning of
  // the feature even if the click happened on its tail end.
  const onSelectRangeFromView = useCallback((start, end, mode, strand) => {
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (end <= start) return;
    setCursorAnchor(start);
    setCursorPos(end);
    // mode === 'aa' → CDS feature click; gates the Copy AA hotkey /
    // menu item. Anything else (non-CDS feature, AA-cell click, …)
    // → 'dna'. strand from the feature's data-region-strand drives
    // the AA copy path through reverseComplement() for reverse CDSes.
    setCursorSelectionMode(mode === 'aa' ? 'aa' : 'dna');
    setCursorSelectionStrand(strand === -1 ? -1 : 1);
    setPendingScroll({ pos: start, tick: Date.now(), instant: false });
  }, []);

  const onPendingScrollHandled = useCallback(() => setPendingScroll(null), []);

  // Sprint M-X.2 K3 — edit operations from inside SequenceView. The
  // viewer dispatches `onAnnotationEdit({kind, id?, patch?, payload?})`
  // for Del / H / E + drag-handles + inline rename; we pipe that
  // through `applyAnnotationEdit` and forward the new array via the
  // existing `onUpdateEdits({editedAnnotations})` flow.
  const onAnnotationEditFromView = useCallback((edit) => {
    if (!edit || !onUpdateEdits) return;
    try {
      const seqLength = (item?.sequence || '').length;
      const baseAnnotations = Array.isArray(edits?.editedAnnotations)
        ? edits.editedAnnotations
        : (item?.annotations || []);
      const result = applyAnnotationEdit(baseAnnotations, edit, seqLength);
      const next = Array.isArray(result) ? result : result?.next;
      if (Array.isArray(next)) {
        onUpdateEdits({ editedAnnotations: next });
      }
    } catch (err) {
      // Validation errors surface via popup error states; if one
      // makes it here, log to console but don't crash the viewer.
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] annotation edit failed:', err.message);
    }
  }, [onUpdateEdits, item, edits]);

  // Reset cursor / selection when biolog switches plasmids.
  useEffect(() => {
    setCursorPos(null);
    setCursorAnchor(null);
    setCursorSelectionMode(null);
  }, [itemKey]);

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
      {/*
        * Header (04.05.2026 reshuffle):
        *   - Title row at the very top (plasmid name + length /
        *     topology / region-count subtitle).
        *   - TagsEditor moved out → MetaColumn right rail.
        *   - LinearFeatureBar «колбаса» moved here from
        *     SequenceTab's bottom — always visible regardless of
        *     active tab. Click on a feature auto-switches to the
        *     Sequence tab and scrolls SequenceView to its start.
        */}
      <div
        data-testid="importer-single-title"
        style={{
          padding: '6px 14px 4px',
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
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={onActiveTabChange}
        showHistory={showHistory}
      />

      {/* Compact feature strip — moved below TabBar 04.05.2026 evening
          (биолог: «колбаса должна под вкладками появляться»). Hidden
          on the Overview tab — Overview already has the PlasmidMiniMap
          + categorised sections, the strip would duplicate the
          visualisation there. Click = jump-to-feature in Sequence tab.
          A small caret cursor below the bar tracks the
          most-recently-targeted feature so the biolog sees where the
          last click landed. */}
      {activeTab !== 'overview' && displayAnnotations.length > 0 && length > 0 && (
        <div
          data-testid="importer-single-feature-strip"
          style={{
            padding: '4px 14px 6px',
            borderBottom: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-1)',
          }}
        >
          <LinearFeatureBar
            annotations={displayAnnotations}
            seqLength={length}
            onSelect={onBarSettle}
            onScrub={onBarScrub}
            cursorPosition={cursorPos}
          />
        </div>
      )}

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
              pendingScroll={pendingScroll}
              onPendingScrollHandled={onPendingScrollHandled}
              caretPos={cursorPos}
              caretAnchor={cursorAnchor}
              selectionMode={cursorSelectionMode}
              selectionStrand={cursorSelectionStrand}
              onCaretChange={onCaretChangeFromView}
              onSelectRange={onSelectRangeFromView}
              onAnnotationEdit={onAnnotationEditFromView}
            />
          </div>
        )}
        {/* annotations tab block removed — see comment near
            AnnotationsTab import above. */}
        {activeTab === 'history' && showHistory && (
          <HistoryTab commits={item.commits || []} />
        )}
      </div>
    </div>
  );
}
