/**
 * ContainerEditorSkeleton — полнофункциональный editor контейнера.
 *
 * Sprint Canvas V2 Editor Full (DEC-CANVAS-V2-EDITOR-01..06).
 *
 * Композиция тех же sub-tabs, что Library SingleInspector, но driver-
 * state = skeleton-state (не librarySlice). Sub-tabs импортируются
 * напрямую из `Library/inspector/tabs/`; FeatureEditorModal +
 * InlineEditableTitle + useFeatureEditorFlow + useAnnotationUndoRedo
 * переиспользуются. Annotator embedded работает через global Zustand
 * (openAnnotator/closeAnnotator) — тот же contract что в Library.
 *
 * Adapter `buildItemFromContainer` маппит container shape → item
 * shape (DEC-CANVAS-V2-EDITOR-02). Edits буферизуются в
 * `state.pendingEditsByContainer[containerId]` через `onUpdateEdits`
 * (DEC-CANVAS-V2-EDITOR-03); «✓ Применить» / «↶ Отменить» в title row.
 *
 * Двойной клик на feature в SequenceView → FeatureEditorModal через
 * `useFeatureEditorFlow`. Ctrl+Z/Y → annotation undo/redo через
 * `useAnnotationUndoRedo`. Inline rename → SET_CONTAINER_NAME напрямую
 * (не через pending) для немедленной синхронизации с Tree.
 *
 * V2 paradigma guard (Q5, NOTES_CANVAS_V2_KICKOFF §2): placeholder
 * containers с `sequence = null` показывают prompt вместо tabs.
 *
 * Editor всегда editable (DEC-CANVAS-V2-EDITOR-05) — нет readonly_bodge
 * zone в skeleton. `editable=true`, `isReadOnlyZone=false` константно.
 *
 * Old operations toolbar / popups / pills / tabs / PlasmidMapInteractive
 * удалены — operations переезжают на canvas (отдельный sprint).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from '../../../store';
import { documentIdentityOf } from '../../../lib/primer-live-workflow';
import { restrictionSiteKey } from '../../../lib/restriction-occurrence';
import { useSequenceSelection } from '../../../hooks/useSequenceSelection';
import { getRegions } from '../../../annotation-model';
import { buildCurrentDocument } from '../../../lib/library-current-document';
import TabBar from '../../Library/inspector/tabs/TabBar';
// OverviewTab выпилен 12.05.2026 — categorised summary это фича
// Library/Importer, не нужна при заходе из canvas-skeleton editor'а.
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import PieceCreateModal from '../../SequenceView/popups/PieceCreateModal';
import PiecePrimersPickModal from '../../SequenceView/popups/PiecePrimersPickModal';
import {
  buildPieceFromSelection,
  buildPieceFromFeature,
  buildPieceFromPcrProduct,
} from '../lib/piece-authoring';
import { STRINGS as _STR } from '../../../lib/strings';
import AnnotationsTab from '../../Library/inspector/tabs/AnnotationsTab';
import HistoryTab from '../../Library/inspector/tabs/HistoryTab';
import LinearFeatureBar from '../../Library/inspector/tabs/LinearFeatureBar';
import FeatureEditorModal from '../../Library/inspector/FeatureEditorModal';
import InlineEditableTitle from '../../Library/inspector/InlineEditableTitle';
import { useAnnotationUndoRedo } from '../../Library/inspector/hooks/useAnnotationUndoRedo';
import { useCurrentAnnotationController } from '../../Library/inspector/hooks/useCurrentAnnotationController';
import { useEntryPrimers } from '../../Library/inspector/hooks/useEntryPrimers';
import { usePromoteToCommon } from '../../SequenceView/hooks/usePromoteToCommon';
import {
  useSkeletonState,
  useSkeletonActions,
  useEditorTabContext,
  usePendingEdits,
} from '../store/skeleton-context';
import { isVirtualId, selectVirtualById } from '../store/selectors-product';
import {
  buildItemFromContainer,
  buildEditsFromPending,
} from './adapt-container-to-item';
// derive-primers.js deleted K3 (M-CANVAS-OPS, 12.05.2026 — DEC-OPS-02).
// With SKELETON_COMMITS=[], the helper always returned []; the proper
// primer-container linkage lands in K10 via the oligonucleotide kind.
import SequenceToolbar from './SequenceToolbar';
import RestrictionSitePopover from './RestrictionSitePopover';
import PlasmidMapV2 from '../../PlasmidMapV2';
import { Icon } from '../../icons/Icon';

// DEC-CANVAS-V2-EDITOR-04 — explicit namespace разделяет skeleton-target
// от Library-target в global Annotator scope.
const SKELETON_SCOPE_PREFIX = 'skeleton::';

export default function ContainerEditorSkeleton() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const { tabContainerId } = useEditorTabContext();

  // F4 DEC-CANVAS-PROD-05 — virtual product preview (read-only). The
  // `v-` prefix is the only signal; readOnly is derived, not stored.
  const isVirtualPreview = isVirtualId(tabContainerId);
  const virtual = useMemo(
    () => (isVirtualPreview ? selectVirtualById(state, tabContainerId) : null),
    [isVirtualPreview, tabContainerId, state],
  );

  const activeContainer = useMemo(() => {
    if (isVirtualPreview) {
      if (!virtual) return null;
      return {
        id: virtual.id,
        name: virtual.name,
        sequence: virtual.sequence || '',
        topology: virtual.topology || { circular: false },
        annotations: virtual.annotations || [],
        frozen: false,
      };
    }
    return tabContainerId ? state.containers.find((c) => c.id === tabContainerId) : null;
  }, [isVirtualPreview, virtual, tabContainerId, state.containers]);

  // Pending edits buffer (DEC-CANVAS-V2-EDITOR-03).
  const pending = usePendingEdits(tabContainerId);
  const edits = useMemo(() => buildEditsFromPending(pending), [pending]);

  // Q5 placeholder guard: container with null sequence — show prompt,
  // don't mount tabs. (V2 paradigma — NOTES §2.)
  const isPlaceholder = !!activeContainer
    && (activeContainer.sequence == null || activeContainer.sequence === '');

  // Item shape for sub-tabs / hooks.
  const item = useMemo(() => buildItemFromContainer(activeContainer), [activeContainer]);
  const itemKey = item?.id || null;
  // ONE coherent currentDocument DTO (same helper the Library inspector uses):
  // saved container payload overlaid with the pending edit buffer. The feature
  // flow, dedupe and every applyAnnotationEdit read this, never a separately
  // reconstructed saved item + edits.
  const currentDocument = useMemo(() => buildCurrentDocument(item, edits, 0), [item, edits]);
  // 12.05.2026 — Игорь: «при нажатии два раза на контейнер должен
  // открываться сиквенс вивер без оверьвю». Default activeTab перешёл
  // на 'sequence' (был 'overview', match Library pattern). Overview
  // остаётся доступным через клик по табу, но открытие editor'а
  // landings сразу на SequenceView.
  const [activeTab, setActiveTab] = useState('sequence');
  // Reset на sequence при переключении container'а.
  useEffect(() => { setActiveTab('sequence'); }, [itemKey]);

  // Cursor / selection via shared hook (SPEC_VIEWER_UNIFICATION).
  // reBehavior:'cut' — RE-site click opens the "cut here" popover
  // (RestrictionSitePopover → cutContainerAtCursor). The cut handler
  // is defined further down (forward ref), so the hook calls it via a
  // ref to avoid a use-before-declare. pendingScroll stays local
  // (Container-specific scroll-to-caret); the hook feeds it through
  // onAfterCaret. Built-in drag-grace replaces the hand-rolled copy.
  const [pendingScroll, setPendingScroll] = useState(null);
  const cutHandlerRef = useRef(null);
  const sel = useSequenceSelection({
    initialCaret: null,
    resetKey: itemKey,
    reBehavior: 'cut',
    onCutHere: (site, e) => cutHandlerRef.current?.(site, e),
    onAfterCaret: (pos, opts) => {
      if (opts && opts.needsScroll === false) return;
      setPendingScroll({ pos, tick: Date.now(), instant: true });
    },
  });
  const cursorPos = sel.caretPos;
  const cursorAnchor = sel.caretAnchor;
  const cursorSelectionMode = sel.selectionMode;
  const cursorSelectionStrand = sel.selectionStrand;
  // A3 (audit) — the bar settle/scrub handlers called setCursorPos/Anchor/
  // SelectionMode, which never existed → ReferenceError on any strip click.
  // The selection hook's real setters:
  const { setCaretPos, setCaretAnchor, setSelectionMode } = sel;

  // V-followup 22.05.2026 — «затемнение сиквенса после разделителя
  // не работает». Container editor, открытый из assembly, должен
  // показать дим для участков контейнера ВНЕ диапазона того piece'а,
  // через который он был открыт. Резолвим piece-range из state.pieces
  // (первый piece в текущей focused-зоне, sourceIds которого содержит
  // активный контейнер).
  const containerRangeMask = useMemo(() => {
    if (!activeContainer) return null;
    const pieces = state.pieces || [];
    const zoneId = activeContainer.zoneId || state.focusedZoneId || null;
    const candidate = pieces.find((p) => {
      if (!p || !Array.isArray(p.sourceIds) || !p.sourceIds.includes(activeContainer.id)) return false;
      if (zoneId && p.zoneId !== zoneId) return false;
      return true;
    });
    if (!candidate || !Array.isArray(candidate.ranges) || candidate.ranges.length === 0) {
      return null;
    }
    const r = candidate.ranges.find((rg) => rg && rg.sourceId === activeContainer.id);
    if (!r || !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end <= r.start) {
      return null;
    }
    return { start: r.start, end: r.end };
  }, [activeContainer, state.pieces, state.focusedZoneId]);

  // T5 — piece authoring (DEC-T5-07/08/11). onCreatePiece comes from
  // SequenceView (selection via P / context-menu = Способ А; feature =
  // Способ Б). Способ В = PiecePrimersPickModal via the toolbar button.
  const [pieceCreateModal, setPieceCreateModal] = useState(null);
  const [primersPickModal, setPrimersPickModal] = useState(null);

  const handleCreatePiece = useCallback((payload) => {
    if (!activeContainer) return;
    const data = payload.origin === 'feature'
      ? buildPieceFromFeature(activeContainer, payload.feature)
      : buildPieceFromSelection(
        activeContainer, payload.rangeStart, payload.rangeEnd, payload.orientation,
      );
    setPieceCreateModal({
      data,
      origin: payload.origin,
      containerName: activeContainer.name,
      range: data.ranges[0],
      featureName: payload.origin === 'feature' ? data.name : undefined,
    });
  }, [activeContainer]);

  // PRIMER-LIVE-1 — two chosen landings become a piece through the SAME
  // PieceCreate → CREATE_PIECE → derived-reaction chain as every other way of
  // authoring one. There is deliberately no second reaction model and no PCR
  // wizard: the product is already resolved, so this only names it.
  const handleCreatePcrProduct = useCallback((resolved) => {
    if (!activeContainer || !resolved || resolved.ok !== true) return;
    const data = buildPieceFromPcrProduct(activeContainer, resolved);
    setPieceCreateModal({
      data,
      origin: 'pcr-occurrences',
      containerName: activeContainer.name,
      range: data.ranges[0],
    });
  }, [activeContainer]);

  const onPieceCreateConfirm = useCallback((fields) => {
    setPieceCreateModal((cur) => {
      if (!cur || !activeContainer) return null;
      // V-followup 22.05.2026 — biolog «отметил как кусок» в Container
      // Window НЕ должен исчезать в ничто. Target-zone resolve:
      //   1) activeContainer.zoneId (если контейнер сам из зоны)
      //   2) state.focusedZoneId (последняя focused зона канваса)
      //   3) первая существующая зона
      //   4) если зон вообще нет → создаём «Сборка N» и кладём piece туда
      let targetZoneId = activeContainer.zoneId
        || (state && state.focusedZoneId)
        || (state && Array.isArray(state.zones) && state.zones[0] && state.zones[0].id)
        || null;
      if (!targetZoneId) {
        // No zone — create one. Default bounds; reducer auto-naming
        // («Сборка N») берёт на себя `zone-model.nextZoneName`.
        targetZoneId = `zn-${Math.random().toString(36).slice(2, 10)}`;
        actions.zoneDispatch({
          type: 'CREATE_ZONE',
          zone: {
            id: targetZoneId,
            bounds: { x: 80, y: 80, width: 600, height: 320 },
          },
        });
      }
      actions.zoneDispatch({
        type: 'CREATE_PIECE',
        piece: {
          ...cur.data,
          name: fields.name,
          functionalLabel: fields.functionalLabel,
          zoneId: targetZoneId,
        },
      });
      return null;
    });
  }, [actions, activeContainer, state]);

  // Reset pendingScroll when biolog switches container (caret reset is
  // handled by the hook via resetKey={itemKey}).
  useEffect(() => {
    setPendingScroll(null);
  }, [itemKey]);

  // ─── update edits buffer ─────────────────────────────────────────
  const onUpdateEdits = useCallback((patch) => {
    if (!tabContainerId || !patch) return;
    actions.setPendingEdits(tabContainerId, patch);
  }, [tabContainerId, actions]);

  // ─── annotation edit pipeline ────────────────────────────────────
  // Same flow as Library: SequenceView dispatches `{kind, id?, patch?,
  // payload?}` → applyAnnotationEdit → setPendingEdits.editedAnnotations.
  // Pushes BEFORE-state onto undo stack so Ctrl+Z works.
  const currentAnnotationsForUndo = currentDocument?.annotations || [];
  const { pushSnapshot } = useAnnotationUndoRedo({
    itemKey,
    currentAnnotations: currentAnnotationsForUndo,
    onUpdateEdits,
  });
  const {
    onAnnotationEditFromView,
    applyAnnotationBatch,
    featureUnderEdit,
    openFeatureEditor,
    closeFeatureEditor,
    onFeatureSave,
    onFeatureMerge,
    onFeatureDelete,
    duplicateCount,
    onRemoveDuplicates,
  } = useCurrentAnnotationController({
    currentDocument,
    onUpdateEdits,
    pushSnapshot,
    canWrite: Boolean(tabContainerId),
    warnScope: 'ContainerEditorSkeleton',
  });

  // ─── LinearFeatureBar + caret callbacks (LibrarySingleInspector pattern) ──
  const onPendingScrollHandled = useCallback(() => setPendingScroll(null), []);

  const onBarSettle = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    if (activeTab !== 'sequence' && activeTab !== 'annotations') {
      setActiveTab('sequence');
    }
    setCaretPos(pos);
    setCaretAnchor(pos);
    setSelectionMode('dna');
    setPendingScroll({ pos, tick: Date.now(), instant: false });
  }, [activeTab]);

  // rAF-coalesced scrub (PERF-3 pattern from LibrarySingleInspector).
  const scrubFrameRef = useRef(null);
  const scrubLatestRef = useRef(null);
  useEffect(() => () => {
    if (scrubFrameRef.current != null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
  }, []);
  const onBarScrub = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    scrubLatestRef.current = pos;
    if (scrubFrameRef.current != null) return;
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      const next = scrubLatestRef.current;
      if (next == null) return;
      setCaretPos(next);
      setCaretAnchor(next);
      setSelectionMode('dna');
      if (activeTab === 'sequence' || activeTab === 'annotations') {
        setPendingScroll({ pos: next, tick: Date.now(), instant: true });
      }
    });
  }, [activeTab]);

  // Selection handlers come from the shared hook (drag-grace built-in,
  // onAfterCaret feeds pendingScroll).
  const onCaretChangeFromView = sel.onCaretChange;
  const onSelectRangeFromView = sel.onSelectRange;

  // ─── Annotator wire (DEC-CANVAS-V2-EDITOR-04) ────────────────────
  const openAnnotator = useStore((st) => st.openAnnotator);
  const closeAnnotator = useStore((st) => st.closeAnnotator);

  const onOpenAnnotator = useCallback((scopeArg) => {
    if (!tabContainerId) return;
    const sequenceId = `${SKELETON_SCOPE_PREFIX}${tabContainerId}`;
    const scope = scopeArg && scopeArg.kind === 'region'
      ? { kind: 'region', sequenceId, region: scopeArg.region }
      : { kind: 'full', sequenceId };
    openAnnotator?.(scope);
    setActiveTab('annotations');
  }, [openAnnotator, tabContainerId]);

  const onApplyAnnotatorResults = useCallback((acceptedRegions) => {
    applyAnnotationBatch(acceptedRegions);
    closeAnnotator?.();
  }, [applyAnnotationBatch, closeAnnotator]);

  // F1 DEC-WIN-09 — apply / discard / rename / Save-As-fork / back
  // handlers moved to EditorWindowShell (window-level chrome).

  // 12.05.2026 — Toolbar Cut → dispatch CUT_CONTAINER_AT_CURSOR.
  // After cut, close editor — biolog должен видеть результат на canvas
  // (для circular это 1 линеаризованный фрагмент; для linear — 2
  // фрагмента с auto-junction). Иначе editor остаётся поверх canvas
  // и скрывает новые блоки (баг 12.05.2026: «и второго контейнера не
  // генерируется» — на самом деле генерировался, но скрывался editor'ом).
  const onCutAtCursor = useCallback((containerId, cutPos) => {
    if (!containerId || !Number.isFinite(cutPos)) return;
    actions.cutContainerAtCursor(containerId, cutPos);
    actions.closeEditor();
  }, [actions]);

  // 12.05.2026 / 13.05.2026 (UX r2) — RE sites visibility controlled
  // via «Рестриктазы» sidebar panel (RestrictionPanel.jsx). Editor
  // mount просто ensures default=true если ещё не установлено user'ом;
  // НЕ восстанавливает prev на unmount, чтобы пользовательский toggle
  // через panel переживал re-open редактора. Orientation forced
  // horizontal на mount (default vertical неудобен в editor контексте).
  useEffect(() => {
    const stateBefore = useStore.getState();
    if (stateBefore.showReSites === undefined) {
      useStore.setState({ showReSites: true });
    }
    const prevOrientation = stateBefore.sequenceView?.reOrientation;
    if (typeof stateBefore.setSequenceViewSetting === 'function') {
      stateBefore.setSequenceViewSetting('reOrientation', 'horizontal');
    }
    return () => {
      const st = useStore.getState();
      if (prevOrientation && typeof st.setSequenceViewSetting === 'function') {
        st.setSequenceViewSetting('reOrientation', prevOrientation);
      }
    };
  }, []);

  // Popover state: { site, x, y } when an RE-site marker is clicked.
  const [rePopover, setRePopover] = useState(null);
  const onRestrictionClick = useCallback((site, e) => {
    // 13.05.2026 — anchor popover к точке клика (с offset вбок 60 px),
    // чтобы highlight на cut tick оставался видимым. Раньше popover
    // открывался в центре экрана и накрывал собственный highlight
    // («клик не фиксирует выделение»).
    let x = typeof window !== 'undefined' ? window.innerWidth / 2 : 400;
    let y = typeof window !== 'undefined' ? window.innerHeight / 3 : 200;
    if (e && typeof e.clientX === 'number') {
      // Popover ширина 340 + transform: translate(-50%) → центр на x.
      // Чтобы left-edge popover'а отстояла от cut tick на ≥30 px,
      // x должен быть clientX + 170 + 30 = clientX + 200.
      x = e.clientX + 200;
      y = e.clientY + 20;
      // Если справа не помещается — отзеркалим влево.
      if (typeof window !== 'undefined') {
        if (x + 170 > window.innerWidth - 12) {
          x = e.clientX - 200; // mirror to left
        }
        x = Math.max(180, Math.min(x, window.innerWidth - 180));
        y = Math.max(12, Math.min(y, window.innerHeight - 320));
      }
    }
    setRePopover({ site, x, y });
  }, []);
  // SPEC_VIEWER_UNIFICATION — the hook's reBehavior:'cut' strategy
  // calls onCutHere via cutHandlerRef; wire the popover-opener here.
  cutHandlerRef.current = onRestrictionClick;
  const onRestrictionCutHere = useCallback((cutPos) => {
    if (!tabContainerId || !Number.isFinite(cutPos)) {
      setRePopover(null);
      return;
    }
    actions.cutContainerAtCursor(tabContainerId, cutPos);
    setRePopover(null);
    // Close editor → biolog видит результат на canvas (для linear cut
    // — 2 новых фрагмента; для circular — 1 линеаризованный).
    actions.closeEditor();
  }, [tabContainerId, actions]);
  const onRestrictionCancel = useCallback(() => setRePopover(null), []);
  const restrictionHighlightKey = rePopover?.site
    ? restrictionSiteKey(rePopover.site)
    : null;

  // ─── derived for tabs — ONE coherent currentDocument ─────────────
  const sequence = currentDocument?.sequence ?? '';
  const length = currentDocument?.length ?? 0;
  const topology = currentDocument?.topology ?? 'linear';
  // RC-C1 (Игорь 24.06) — circular products get a «Карта» tab (PlasmidMapV2).
  const isCircular = topology === 'circular';
  const displayAnnotations = currentDocument?.annotations ?? [];
  // displayItem useMemo выпилен 12.05.2026 — единственный consumer
  // был OverviewTab, который тоже удалён.
  const regionCount = useMemo(() => getRegions(displayAnnotations).length, [displayAnnotations]);
  // Primer redesign on EVERY SequenceView (Игорь 18.05.2026 «на всех
  // сиквенсвиверах»). Container primers persist to the unified pool,
  // scoped by container id — the same hook the Library inspector uses
  // (supersedes the K10-stub `[]`: render + selection-add now live).
  // PRIMER-LIVE-1 — the container editor opens a CONTAINER, not a library row,
  // so the hook cannot look the project up for itself. Passing it explicitly is
  // what keeps a Ctrl+R primer inside the open project instead of landing
  // project-less and vanishing on the next Open.
  const currentProjectId = useStore((st) => st.currentProjectId);
  const {
    primers: entryPrimers,
    labPrimers: entryLabPrimers,
    onWritePrimer: onWriteEntryPrimer,
    onReuseLabPrimer: onReuseEntryLabPrimer,
  } = useEntryPrimers(item, { projectId: currentProjectId ?? null });

  // A stable name for the molecule on screen, so a primer's landing can later
  // be confirmed against it rather than trusted on coordinates alone.
  const containerDocumentHash = useMemo(
    () => documentIdentityOf({ sequence, topology }),
    [sequence, topology],
  );
  // SPEC_COMMON_FEATURES DEC-CF-05 — «Add to common features» in the Container
  // Editor (an IN viewer); consumer-gated via SequenceTab props.
  const { onPromoteToCommon, checkCommonDuplicate } = usePromoteToCommon();

  // Q4 — hide History tab; container.commits in skeleton are
  // ProjectCommits (canvas DAG), not per-container changelog.
  const showHistory = false;

  // ─── render ──────────────────────────────────────────────────────
  return (
    <div
      data-testid="skeleton-editor"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
      }}
    >
      {/* F4 DEC-CANVAS-PROD-05 — read-only virtual preview banner. */}
      {isVirtualPreview && (
        <div
          data-testid="skeleton-editor-preview-banner"
          data-virtual-state={virtual?.state || 'incomplete'}
          style={{
            padding: '8px 14px',
            background: 'var(--amber-wash, #fdf3e7)',
            borderBottom: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="pcr" size={14} style={{ display: 'inline-block', verticalAlign: '-2px' }} />
          <span>
            Предпросмотр продукта · OP_EXECUTE для финализации
            {virtual && virtual.state !== 'valid' && virtual.warnings?.length > 0
              ? ` — ${virtual.warnings[0]}`
              : ''}
          </span>
        </div>
      )}

      {/* F1 DEC-WIN-09 — header (back / title / apply / discard / fork)
          moved to EditorWindowShell. The slim size subtitle stays in
          the body where its edits-aware data is already derived. */}
      {activeContainer && !isPlaceholder && (
        <div
          data-testid="skeleton-editor-subtitle"
          style={{
            padding: '5px 14px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}
        >
          {length.toLocaleString('ru-RU')} bp · {topology} · {regionCount} regions
        </div>
      )}

      {/* K9 — frozen banner. Появляется когда контейнер использован
          в какой-то operation (DEC-OPS-08). */}
      {activeContainer && !isPlaceholder && activeContainer.frozen && (
        <div
          data-testid="skeleton-editor-frozen-banner"
          style={{
            padding: '8px 14px',
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            color: '#7f1d1d',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="lock" size={14} style={{ display: 'inline-block', verticalAlign: '-2px' }} />
          <span>
            Контейнер использован в операции. Любые изменения создают форк через «Save As fork».
          </span>
        </div>
      )}

      {/* Placeholder guard (Q5) — V2 paradigma. */}
      {activeContainer && isPlaceholder && (
        <div
          data-testid="skeleton-editor-placeholder-prompt"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 8,
            color: 'var(--text-secondary)',
            fontSize: 13,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 22 }}>📦</div>
          <div>Пустой контейнер</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 360, textAlign: 'center' }}>
            Сначала наполните контейнер через Tree-picker (drag из Library или клик на контейнер на canvas).
          </div>
        </div>
      )}

      {!activeContainer && (
        <div
          data-testid="skeleton-editor-empty"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: 13,
          }}
        >Контейнер не выбран</div>
      )}

      {activeContainer && !isPlaceholder && (
        <>
          <TabBar
            activeTab={activeTab}
            onChange={setActiveTab}
            showHistory={showHistory}
            showOverview={false}
            showMap={isCircular}
            showMutagenesis
            showAnnotations={false}
            annotatorActive={activeTab === 'annotations'}
            onToggleAnnotator={() => setActiveTab(
              (t) => (t === 'annotations' ? 'sequence' : 'annotations'),
            )}
          />

          {length > 0 && (
            <div
              data-testid="skeleton-editor-feature-strip"
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
            data-testid="skeleton-editor-tab-content"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: activeTab === 'annotations' ? 'hidden' : 'scroll',
              padding: activeTab === 'annotations' ? 0 : 14,
              display: activeTab === 'annotations' ? 'flex' : 'block',
              flexDirection: activeTab === 'annotations' ? 'column' : undefined,
            }}
          >
            {/* Overview tab выпилен 12.05.2026 — Игорь: «overview в
                целом удалить можно если из канваса заходим — это
                фишка только библиотеки». TabBar получает
                showOverview={false} → tab из списка вообще пропадает,
                activeTab='overview' недостижим. */}
            {activeTab === 'sequence' && (
              <div
                data-testid="skeleton-editor-sequence-shell"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'row',
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <SequenceTab
                    entryId={item.id}
                    sequence={sequence}
                    annotations={displayAnnotations}
                    topology={topology}
                    name={item.name || item._fileName}
                    fileKey={item._fileName}
                    pendingScroll={pendingScroll}
                    onPendingScrollHandled={onPendingScrollHandled}
                    caretPos={cursorPos}
                    caretAnchor={cursorAnchor}
                    selectionMode={cursorSelectionMode}
                    selectionStrand={cursorSelectionStrand}
                    onCaretChange={onCaretChangeFromView}
                    onSelectRange={onSelectRangeFromView}
                    onAnnotationEdit={onAnnotationEditFromView}
                    onOpenAnnotator={onOpenAnnotator}
                    onOpenFeatureEditor={openFeatureEditor}
                    editable
                    isReadOnlyZone={false}
                    primers={entryPrimers}
                    onWritePrimer={onWriteEntryPrimer}
                    labPrimers={entryLabPrimers}
                    onReuseLabPrimer={onReuseEntryLabPrimer}
                    onCreatePcrProduct={handleCreatePcrProduct}
                    entryId={activeContainer?.id ?? null}
                    documentHash={containerDocumentHash}
                    showSelectionTm
                    onRestrictionClick={sel.onRestrictionClick}
                    restrictionHighlightKey={restrictionHighlightKey}
                    onCreatePiece={handleCreatePiece}
                    outOfRangeMask={containerRangeMask}
                    onPromoteToCommon={onPromoteToCommon}
                    checkCommonDuplicate={checkCommonDuplicate}
                  />
                </div>
                <SequenceToolbar
                  tab="sequence"
                  containerId={tabContainerId}
                  cursorPos={cursorPos}
                  containerLength={length}
                  onCut={onCutAtCursor}
                />
              </div>
            )}

            {/* RC-C1 — circular product map. Reuses PlasmidMapV2 (the same
                redesigned circular map as Library/picker); a feature click jumps
                the Sequence tab to that position. */}
            {activeTab === 'map' && (
              <div
                data-testid="skeleton-editor-map"
                style={{
                  flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'flex-start', padding: 12, overflow: 'auto',
                }}
              >
                <div style={{ width: 'min(560px, 80vh)', height: 'min(560px, 80vh)' }}>
                  <PlasmidMapV2
                    fragments={[{ sequence, annotations: displayAnnotations, length }]}
                    constructName={item.name || item._fileName || ''}
                    totalBp={length}
                    topology="circular"
                    onFeatureClick={(f) => { if (f && Number.isFinite(f.start)) onBarSettle(f.start); }}
                    primers={entryPrimers}
                    entryId={item?._libraryEntryId || item?.id || null}
                  />
                </div>
              </div>
            )}

            {activeTab === 'annotations' && (
              <AnnotationsTab
                sequence={sequence}
                annotations={displayAnnotations}
                fileName={`${SKELETON_SCOPE_PREFIX}${item._fileName}`}
                active
                isReadOnlyZone={false}
                onApplyAnnotatorResults={onApplyAnnotatorResults}
                onAnnotationEdit={onAnnotationEditFromView}
                onOpenFeatureEditor={openFeatureEditor}
                duplicateCount={duplicateCount}
                onRemoveDuplicates={onRemoveDuplicates}
                pendingScroll={pendingScroll}
                onPendingScrollHandled={onPendingScrollHandled}
                primers={entryPrimers}
                onWritePrimer={onWriteEntryPrimer}
              />
            )}

            {/* 12.05.2026 — Игорь: «вкладка мутагенез дублирует
                сиквенс вивер, но добавляет дополнительные возможности
                ... возможности позже. пока скопируй сиквенс вивер».
                Идентичный SequenceTab с теми же props. Mutagenesis-
                специфические инструменты (PRimer design / point
                mutation wizard / library design) — в следующем спринте
                M-CANVAS-MUTAGENESIS. */}
            {activeTab === 'mutagenesis' && (
              <div
                data-testid="skeleton-editor-mutagenesis-shell"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'row',
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <SequenceTab
                    entryId={item.id}
                    sequence={sequence}
                    annotations={displayAnnotations}
                    topology={topology}
                    name={item.name || item._fileName}
                    fileKey={`${item._fileName}-mutagenesis`}
                    pendingScroll={pendingScroll}
                    onPendingScrollHandled={onPendingScrollHandled}
                    caretPos={cursorPos}
                    caretAnchor={cursorAnchor}
                    selectionMode={cursorSelectionMode}
                    selectionStrand={cursorSelectionStrand}
                    onCaretChange={onCaretChangeFromView}
                    onSelectRange={onSelectRangeFromView}
                    onAnnotationEdit={onAnnotationEditFromView}
                    onOpenAnnotator={onOpenAnnotator}
                    onOpenFeatureEditor={openFeatureEditor}
                    editable
                    isReadOnlyZone={false}
                    primers={entryPrimers}
                    onWritePrimer={onWriteEntryPrimer}
                    labPrimers={entryLabPrimers}
                    onReuseLabPrimer={onReuseEntryLabPrimer}
                    onCreatePcrProduct={handleCreatePcrProduct}
                    entryId={activeContainer?.id ?? null}
                    documentHash={containerDocumentHash}
                    showSelectionTm
                    onRestrictionClick={sel.onRestrictionClick}
                    restrictionHighlightKey={restrictionHighlightKey}
                    onCreatePiece={handleCreatePiece}
                    outOfRangeMask={containerRangeMask}
                    onPromoteToCommon={onPromoteToCommon}
                    checkCommonDuplicate={checkCommonDuplicate}
                  />
                </div>
                <SequenceToolbar
                  tab="mutagenesis"
                  containerId={tabContainerId}
                  cursorPos={cursorPos}
                  containerLength={length}
                  onCut={onCutAtCursor}
                />
              </div>
            )}

            {activeTab === 'history' && showHistory && (
              <HistoryTab commits={activeContainer?.commits || []} />
            )}
          </div>
        </>
      )}

      {/* T5 Способ В — toolbar entry to author a piece from existing
          primers (opens PiecePrimersPickModal → PieceCreateModal). */}
      {activeContainer && !isPlaceholder && (
        <button
          type="button"
          data-testid="piece-from-primers-btn"
          onClick={() => setPrimersPickModal({})}
          style={{
            position: 'absolute', top: 8, right: 12, zIndex: 26,
            padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            background: 'var(--surface-2)', color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
          }}
        >
          {_STR.canvasSkeleton.pieces.contextMenu.createFromExistingPrimers}
        </button>
      )}

      {pieceCreateModal && (
        <PieceCreateModal
          containerName={pieceCreateModal.containerName}
          range={pieceCreateModal.range}
          origin={pieceCreateModal.origin}
          featureName={pieceCreateModal.featureName}
          onConfirm={onPieceCreateConfirm}
          onCancel={() => setPieceCreateModal(null)}
        />
      )}

      {primersPickModal && activeContainer && (
        <PiecePrimersPickModal
          containerId={activeContainer.id}
          containerName={activeContainer.name}
          containerSequence={activeContainer.sequence || ''}
          /* Игорь 19.05.2026: «праймеры есть а кусок выбрать нельзя».
             Источник = тот же unified-pool, что рисует праймеры на
             сиквенсе (useEntryPrimers), а НЕ пустой легаси state.primers. */
          primers={entryPrimers}
          onConfirm={(pieceData) => {
            setPrimersPickModal(null);
            setPieceCreateModal({
              data: pieceData,
              origin: 'existing-primers',
              containerName: activeContainer.name,
              range: pieceData.ranges[0],
            });
          }}
          onCancel={() => setPrimersPickModal(null)}
        />
      )}

      <FeatureEditorModal
        feature={featureUnderEdit}
        seqLength={length}
        topology={topology}
        neighbours={displayAnnotations}
        onSave={onFeatureSave}
        onMerge={onFeatureMerge}
        onDelete={onFeatureDelete}
        onClose={closeFeatureEditor}
      />

      {/* 12.05.2026 — Restriction-site popover (clickable RE sites). */}
      {rePopover?.site && (
        <RestrictionSitePopover
          site={rePopover.site}
          position={{ x: rePopover.x, y: rePopover.y }}
          onCut={onRestrictionCutHere}
          onCancel={onRestrictionCancel}
        />
      )}
    </div>
  );
}
