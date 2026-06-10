/**
 * Annotator — Sprint M-X.2 K8 fullscreen annotation orchestrator.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ← Назад   Аннотатор      [scope info]   threshold N% │ ← header
 *   ├─────────────────────────────────────────────────────────┤
 *   │ TargetPreview (linear strip + scope highlight)          │
 *   ├──────────────┬──────────────────────────────────────────┤
 *   │ PluginPanel  │ ResultsPane                              │
 *   │ (left)       │ (right)                                  │
 *   ├──────────────┴──────────────────────────────────────────┤
 *   │ Принято: N · Отклонено: M · Изменено: K   [Сохранить] │ ← footer
 *   └─────────────────────────────────────────────────────────┘
 *
 * Driven by `state.annotator` (DEC-ANN-07). Plugin pipeline runs
 * via `runAnnotatorPipeline` (K7). On `[Сохранить]`, accepted
 * regions (with pendingEdits applied) are emitted to
 * `onApplyAnnotatorResults` — K10 wires this to SingleInspector's
 * onUpdateEdits.
 *
 * Source-of-truth for state lives in the store; this component is
 * purely a controlled view + dispatch surface.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { selectAnnotator } from '../../store/uiSlice.js';
import { STRINGS } from '../../lib/strings';
import { getPluginById } from '../../lib/annotator-plugins';
import { runAnnotatorPipeline } from '../../lib/annotator-pipeline.js';

// Sprint M-X.3 follow-up (05.05.2026, Stage A) — biolog: «Дальше
// сразу открыватся аннотатор … и на этой карте показывают гост
// фичи». Level-1 detector (homology lookup against the curated
// known-features DB) auto-runs on annotator open so the user
// sees ghost annotations immediately, with no «press Run» step.
// Levels 2 (structural predictors) and 3 (BLAST) keep their
// manual-trigger semantics — they're slower / noisier.
const LEVEL_1_PLUGIN_ID = 'common-features-homology';
import TargetPreview from './TargetPreview.jsx';
import PreviewTab from './PreviewTab.jsx';
import LevelPanel, { LEVELS } from './LevelPanel.jsx';

const S = STRINGS.importer.annotator;

export default function Annotator({
  sequence,
  annotations,
  onApplyAnnotatorResults,
  // Sprint M-X.3 follow-up (05.05.2026) — biolog: «давай меню
  // аннотатора прям во вкладке. сейчас вкладка инвалид». Embedded
  // mode skips the modal chrome (backdrop, centred panel, back
  // button) and renders the body inline so AnnotationsTab can host
  // the whole Annotator UI directly. The store's annotator slice
  // is shared either way; embedded just bypasses the open-flag
  // visibility gate (fullscreen modal stays gated as before).
  embedded = false,
  // Sequence id for openAnnotator dispatch when embedded mode mounts
  // and no scope is set yet.
  embeddedSequenceId = 'embedded',
  // Sprint M-X.3 follow-up — biolog: «при нажатии на плазмиду в
  // билиотеке снапгена опять бросает на аннотатор модалку, а должно
  // просто овервью показывать». SingleInspector pre-warms hidden
  // tabs (display:none) — without this gate, the embedded Annotator
  // mounted-but-hidden would dispatch openAnnotator on mount,
  // which flips annotator.open to true and surfaces the MODAL
  // Annotator over the visible Overview tab. Default true so
  // direct tests that mount Annotator without a tab wrapper still
  // exercise the auto-open path.
  embeddedActive = true,
  // Sprint M-X.3 follow-up — biolog: «надо дать возможность
  // растягивать сжимать фичи, редачить двойным кликом». Forwarded
  // to PreviewTab → SequenceView so embedded mode is fully editable.
  onAnnotationEdit,
  onOpenFeatureEditor,
  // 2026-05-06 — SingleInspector wires the same `pendingScroll` it
  // sends to SequenceTab so the LinearFeatureBar's click/drag also
  // navigates the embedded preview.
  pendingScroll = null,
  onPendingScrollHandled,
  // 18.05.2026 — primers are base functionality on EVERY sequence
  // viewer (Игорь). Forwarded host → AnnotationsTab → here →
  // PreviewTab → SequenceView. Optional (absent ⇒ no primers).
  primers,
  onWritePrimer,
}) {
  const annotator = useStore(selectAnnotator);
  const closeAnnotator = useStore((s) => s.closeAnnotator);
  const openAnnotatorAction = useStore((s) => s.openAnnotator);
  const setThreshold = useStore((s) => s.setAnnotatorThreshold);
  const setRunning = useStore((s) => s.setAnnotatorRunning);
  const setResult = useStore((s) => s.setAnnotatorResult);
  const acceptRegion = useStore((s) => s.acceptRegion);
  const rejectRegion = useStore((s) => s.rejectRegion);
  const acceptManyRegions = useStore((s) => s.acceptManyRegions);
  const editPendingRegion = useStore((s) => s.editPendingRegion);
  const setShowDuplicates = useStore((s) => s.setAnnotatorShowDuplicates);
  const resetAnnotatorScope = useStore((s) => s.resetAnnotatorScope);

  // Esc closes the modal (third escape route alongside Back button
  // + backdrop click). Capture-phase + stopPropagation so the App's
  // global Escape hotkey doesn't also fire popFullscreen and dump
  // biolog out of the Importer back to Start (same fix the
  // FeatureEditorModal + PreImportModal got).
  // Embedded mode has no «close» — ignored, the tab itself handles
  // navigation.
  useEffect(() => {
    if (embedded) return undefined;
    if (!annotator.open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeAnnotator();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [annotator.open, closeAnnotator, embedded]);

  // Embedded mode — open the annotator slice on mount (and on tab
  // activation) so the L1 auto-run effect fires and the body has a
  // scope. The `embeddedActive` gate prevents this from firing
  // while the AnnotationsTab is pre-warmed-but-hidden in
  // SingleInspector (clicking a SnapGene catalog item used to
  // trigger this and surface the modal Annotator on top of the
  // intended Overview tab).
  useEffect(() => {
    if (!embedded) return;
    if (!embeddedActive) return;
    if (annotator.open && annotator.scope?.sequenceId === embeddedSequenceId) return;
    openAnnotatorAction({ kind: 'full', sequenceId: embeddedSequenceId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, embeddedActive, embeddedSequenceId]);

  const seqLength = (sequence || '').length;
  const scope = annotator.scope;
  const region = scope?.kind === 'region' ? scope.region : null;

  // Stage A — fire-once-per-sequenceId ref so re-renders (threshold
  // tweaks, tab toggles, etc.) don't re-trigger the L1 plugin.
  const autoRunFiredFor = useRef(null);
  useEffect(() => {
    if (!annotator.open) return;
    if (!sequence) return;
    // V133 — key the auto-run on the sequence CONTENT, not scope.sequenceId.
    // Embedded mode reuses a sticky sequenceId, so a NEW plasmid with the
    // same id used to leave the previous L1 result mapped onto it until a
    // manual «Run again». Track content; a change (we already fired for a
    // DIFFERENT one) clears the stale L1/L2/L3 results + verdicts and re-runs.
    const contentKey = sequence;
    if (autoRunFiredFor.current === contentKey) return;
    const results = annotator.results || {};
    const running = annotator.running || {};
    if (running[LEVEL_1_PLUGIN_ID]) return;        // race-guard
    const plugin = getPluginById(LEVEL_1_PLUGIN_ID);
    if (!plugin) return;                           // registry not populated yet
    const contentChanged = autoRunFiredFor.current !== null;
    // First fire for THIS content with results already present (restored /
    // pre-seeded) → keep them, don't re-run. A content CHANGE makes the
    // existing results stale → fall through to clear + re-run.
    if (!contentChanged && results[LEVEL_1_PLUGIN_ID]) return;
    autoRunFiredFor.current = contentKey;
    if (contentChanged) resetAnnotatorScope();     // drop stale L1/L2/L3 + verdicts
    setRunning(LEVEL_1_PLUGIN_ID, true);
    // Cancellation flag so a settled L1 promise doesn't write into a
    // stale store after the Annotator unmounts (or the user opens a
    // different plasmid before L1 completes). Without this guard,
    // closing the Annotator mid-run produced a "Can't perform a React
    // state update on an unmounted component" warning and could land
    // old plasmid's regions in the new annotator.results slice.
    //
    // 2026-05-06 (perf profile via Chrome MCP) — L1 auto-run on a
    // 14 kb plasmid is a ~450 ms synchronous scan of common-features.
    // Used to fire in microtask, which blocked the main thread BEFORE
    // the Annotations tab could even paint — biolog saw 1 s of frozen
    // UI on tab click. Deferred to a double-rAF: tab paints first
    // (16 ms), THEN the heavy scan starts, so the user sees the tab
    // snap into place and «Running…» badge before the freeze. Same
    // total CPU cost, much better perceived responsiveness.
    let cancelled = false;
    let rafId = 0;
    const startScan = () => {
      if (cancelled) return;
      Promise.resolve()
        .then(() => plugin.run(sequence || '', region, { threshold: annotator.threshold }))
        .then((res) => { if (!cancelled && res) setResult(LEVEL_1_PLUGIN_ID, res); })
        .catch((err) => {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.warn('[Annotator] L1 auto-run failed:', err?.message || err);
        })
        .finally(() => { if (!cancelled) setRunning(LEVEL_1_PLUGIN_ID, false); });
    };
    rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      rafId = requestAnimationFrame(startScan);
    });
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
    // Deps: open + sequence CONTENT. autoRunFiredFor guards re-render churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotator.open, sequence]);

  // Stage B-2 — per-level Run dispatcher. LevelPanel emits
  // `onRunLevel('L2' | 'L3' | …)` from its level-section Run
  // buttons; we translate that into a runAnnotatorPipeline call
  // forcing the level's plugin ids ON for one shot, regardless of
  // the user's `enabledPluginIds` checkbox state. (The old per-
  // plugin checkbox UI is gone — opting in to a level means «run
  // everything in this level».)
  const handleRunLevel = async (levelId, regionOverride) => {
    const ids = LEVELS[levelId];
    if (!Array.isArray(ids) || ids.length === 0) return;
    const enabled = {};
    for (const id of ids) enabled[id] = true;
    for (const id of ids) setRunning(id, true);
    // Sprint M-X.3 follow-up — regionOverride lets the «BLAST this
    // region» context-menu entry run a sub-region without touching
    // annotator.scope (which would re-trigger L1 auto-run).
    const effectiveRegion = regionOverride || region;
    const { results, errors } = await runAnnotatorPipeline(
      sequence || '',
      effectiveRegion,
      enabled,
      {
        threshold: annotator.threshold,
        existingConfident: annotations || [],
        onPluginStart: (id) => setRunning(id, true),
        onPluginEnd: (id, res) => {
          setRunning(id, false);
          if (res) setResult(id, res);
        },
      },
    );
    for (const id of Object.keys(results)) setResult(id, results[id]);
    for (const id of Object.keys(errors)) setRunning(id, false);
  };

  // Selection → BLAST handler. Wires the SequenceView context-menu
  // «BLAST this region» entry to a one-shot L3 run scoped to the
  // selection. The full-sequence scope and existing L1 / L2 results
  // stay untouched.
  const handleBlastSelection = (regionRange) => {
    if (!regionRange || !Number.isFinite(regionRange.start) || !Number.isFinite(regionRange.end)) return;
    if (regionRange.end <= regionRange.start) return;
    handleRunLevel('L3', { region: regionRange });
  };

  // Visible save confirmation. Biolog: «после сейв кнопка должна
  // явно сообщать что сохранение завершено и пересохранять ли?».
  // After a Save click, flip `justSavedAt` so the LevelPanel button
  // briefly renders «Saved ✓» (green); after 2 seconds it reverts to
  // its normal style. Repeat clicks safely re-apply — DEC-ANN-09
  // dedup at create-batch drops same-type >50% overlaps, so a
  // double-save can't introduce duplicates.
  const [justSavedAt, setJustSavedAt] = useState(0);
  // Round-16 (06.05.2026 biolog «нужно чтобы когда нажимаешь на имя
  // комон фичи она тебя телепортировала»): local pendingScroll
  // overlay so a click on a ResultRow name in the LevelPanel scrolls
  // the embedded SequenceView to that region's start. Merged with
  // the parent's pendingScroll (LinearFeatureBar drag) — most recent
  // tick wins. Cleared via the same onPendingScrollHandled callback.
  const [innerScroll, setInnerScroll] = useState(null);
  const handleLocateRegion = (region) => {
    if (!region || !Number.isFinite(region.start)) return;
    setInnerScroll({ pos: region.start, tick: Date.now(), instant: false });
  };
  const mergedPendingScroll = (() => {
    if (!innerScroll) return pendingScroll || null;
    if (!pendingScroll) return innerScroll;
    return (innerScroll.tick || 0) >= (pendingScroll.tick || 0)
      ? innerScroll
      : pendingScroll;
  })();
  const handlePendingScrollHandled = () => {
    setInnerScroll(null);
    onPendingScrollHandled?.();
  };
  useEffect(() => {
    if (!justSavedAt) return undefined;
    const t = setTimeout(() => setJustSavedAt(0), 2000);
    return () => clearTimeout(t);
  }, [justSavedAt]);
  const handleSave = () => {
    const accepted = annotator.acceptedRegionIds || {};
    const pending = annotator.pendingEdits || {};
    const out = [];
    for (const res of Object.values(annotator.results || {})) {
      for (const region of res.regions || []) {
        const id = region.id || `${region.start}:${region.end}:${region.type || ''}:${region.name || ''}`;
        if (accepted[id]) {
          out.push({ ...region, ...(pending[id] || {}) });
        }
      }
    }
    onApplyAnnotatorResults?.(out);
    setJustSavedAt(Date.now());
  };

  const acceptedCount = Object.keys(annotator.acceptedRegionIds || {}).length;
  const rejectedCount = Object.keys(annotator.rejectedRegionIds || {}).length;
  const editedCount = Object.keys(annotator.pendingEdits || {}).length;

  // Embedded mode renders inline regardless of the annotator.open
  // visibility flag (the parent tab is the visibility gate). Modal
  // mode keeps the previous «only render when open» semantic.
  if (!embedded && !annotator.open) return null;

  // Inner body shared between modal and embedded rendering paths —
  // header (back button + threshold) → TargetPreview → body
  // (PreviewTab + LevelPanel) → footer (counts + Save).
  const innerContent = (
    <>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px',
          borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
          background: 'var(--surface-1, #fff)',
          flexShrink: 0,
        }}
      >
        {/* Back button only in modal mode — embedded version lives
            inside a tab so navigation goes through the TabBar. */}
        {!embedded && (
          <button
            type="button"
            data-testid="annotator-back-button"
            onClick={closeAnnotator}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: '0.5px solid var(--border-default, #d4d4d4)',
              borderRadius: 'var(--radius-sm, 3px)',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-primary, #111)',
            }}
          >{S.backButton}</button>
        )}
        <div style={{ fontWeight: 500, fontSize: 14 }}>{S.title}</div>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }} data-testid="annotator-scope-info">
          {scope?.kind === 'region' && scope.region
            ? S.scopeRegion(scope.region.start + 1, scope.region.end)
            : S.scopeFull}
        </div>
        <label
          data-testid="annotator-show-duplicates"
          title={S.showDuplicatesHint}
          style={{
            fontSize: 11, color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            data-testid="annotator-show-duplicates-checkbox"
            checked={!!annotator.showDuplicates}
            onChange={(e) => setShowDuplicates(e.target.checked)}
            style={{ accentColor: 'var(--accent-500)', cursor: 'pointer' }}
          />
          <span>{S.showDuplicatesLabel}</span>
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{S.thresholdLabel(annotator.threshold)}</span>
          {/* UX-018 — slider used to be markless, biolog had no idea
              what 75% meant in the wild. Tick datalist gives 50/75/90
              anchors (browsers render tiny notches under the track),
              and a click on each value jumps the slider for free. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <input
              type="range"
              data-testid="annotator-threshold-slider"
              min={0}
              max={1}
              step={0.05}
              value={annotator.threshold}
              list="annotator-threshold-ticks"
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <datalist id="annotator-threshold-ticks">
              <option value="0.5" label="50%" />
              <option value="0.75" label="75%" />
              <option value="0.9" label="90%" />
            </datalist>
            <div
              aria-hidden="true"
              style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 8, color: 'var(--text-tertiary)',
                marginTop: -2, padding: '0 4px',
              }}
            >
              <span>50</span>
              <span style={{ marginLeft: 16 }}>75</span>
              <span>90</span>
            </div>
          </div>
        </label>
      </div>

      {/* TargetPreview — only in modal mode. The embedded path lives
          inside SingleInspector, which already mounts the labelled
          LinearFeatureBar at the top; rendering TargetPreview here
          would stack two visually-similar strips («с надписями и
          без» — biolog asked to keep only the labelled one). */}
      {!embedded && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <TargetPreview annotations={annotations} sequenceLength={seqLength} scope={scope} />
        </div>
      )}

      {/* Body — Sprint M-X.3 follow-up Stage B-2 (05.05.2026).
          Biolog: «И справа должно показываться таблица с комон фичами.
          С вариантом принять не принять каждую». The dual-tab body
          (Table | Preview) and the per-plugin PluginPanel are gone:
            - LEFT  = always the map (linear SequenceView; Stage C
                      will add a Linear/Circular sub-tab).
            - RIGHT = LevelPanel — three-section progression
                      (L1 auto-runs, L2/L3 have Run buttons), with
                      per-row Accept/Reject reusing ResultRow.
          The legacy `state.annotator.activeTab` is now reused by
          Stage C for the linear/circular toggle inside PreviewTab. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <PreviewTab
            sequence={sequence || ''}
            annotations={annotations || []}
            topology={scope?.topology || 'linear'}
            name="annotator-preview"
            onAnnotationEdit={onAnnotationEdit}
            onOpenFeatureEditor={onOpenFeatureEditor}
            onBlastSelection={handleBlastSelection}
            pendingScroll={mergedPendingScroll}
            onPendingScrollHandled={handlePendingScrollHandled}
            primers={primers}
            onWritePrimer={onWritePrimer}
          />
        </div>
        <LevelPanel
          results={annotator.results}
          running={annotator.running}
          acceptedRegionIds={annotator.acceptedRegionIds}
          rejectedRegionIds={annotator.rejectedRegionIds}
          pendingEdits={annotator.pendingEdits}
          threshold={annotator.threshold}
          existingAnnotations={annotations}
          showDuplicates={!!annotator.showDuplicates}
          acceptedCount={acceptedCount}
          rejectedCount={rejectedCount}
          editedCount={editedCount}
          justSaved={!!justSavedAt}
          onAccept={acceptRegion}
          onReject={rejectRegion}
          onAcceptMany={acceptManyRegions}
          onEditPatch={editPendingRegion}
          onRunLevel={handleRunLevel}
          onLocateRegion={handleLocateRegion}
          onSave={handleSave}
        />
      </div>
    </>
  );

  // Embedded mode — render inline inside the parent tab. The tab
  // owns the surrounding chrome (its own padding, scroll, etc.).
  if (embedded) {
    return (
      <div
        data-testid="annotator-root"
        data-embedded="true"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-1, #ffffff)',
          color: 'var(--text-primary, #111)',
          overflow: 'hidden',
        }}
      >{innerContent}</div>
    );
  }

  // Modal mode — translucent backdrop + centred panel. Bug-rush
  // #10 (04.05.2026 evening): biolog wants the Annotator to render
  // as a LARGE MODAL — big enough to drive but with the
  // surrounding UI still visible at the edges, so clicking outside
  // dismisses (alternative to the Back button).
  return (
    <div
      data-testid="annotator-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeAnnotator();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4vh 4vw',
      }}
    >
      <div
        data-testid="annotator-root"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '1400px',
          background: 'var(--surface-1, #ffffff)',
          border: '0.5px solid var(--border-default, #d4d4d4)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-primary, #111)',
        }}
      >{innerContent}</div>
    </div>
  );
}
