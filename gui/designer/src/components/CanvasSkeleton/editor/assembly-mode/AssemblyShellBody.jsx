/**
 * AssemblyShellBody — the mounted assembly editor (draft guaranteed
 * non-null). Thin orchestrator over the SHARED Library SequenceTab
 * (same V71 reuse philosophy as PcrModeShell): coloured segment zones,
 * drag-insert (K4), segment list + detail (K5), source picker (K6),
 * gap modal (K7), selection-driven primer writing (K8).
 *
 * Layout (G2 DEC-CANVAS-ASM-13 + A2 DEC-CANVAS-ASM-UX-02):
 *   AssemblyHeader
 *   ┌───────────────────────────────┬──────────────┐
 *   │ SequenceTab (+coloredZones)   │ AssemblySidebar│
 *   │                               │ (+DetailPanel) │
 *   └───────────────────────────────┴──────────────┘
 *   SegmentList footer + AssemblyToolbar
 */
import {
  useMemo, useState, useCallback, useRef,
} from 'react';
import SequenceTab from '../../../Library/inspector/tabs/SequenceTab';
import { useSkeletonState, useSkeletonActions } from '../../store/skeleton-context';
import { segmentBoundaries, computeAssemblySequence } from '../../lib/assembly-model';
import { collectAssemblyAnnotations } from '../../lib/assembly-annotations';
import AssemblyHeader from './AssemblyHeader';
import AssemblySidebar from './AssemblySidebar';
import AssemblySegmentBar from './AssemblySegmentBar';
import SegmentList from './SegmentList';
/* V94 — SegmentDetailPanel orphan'нут (inline-editor в SegmentList).
   Импорт сохранён закомментированным как pointer для cleanup-PR. */
// import SegmentDetailPanel from './SegmentDetailPanel';
import AssemblyToolbar from './AssemblyToolbar';
// SPEC_ASSEMBLY_PICKER_UNIFICATION — единый library-picker для обеих
// поверхностей; bespoke EmptyAssemblyLibrary + assembly-usage
// PlaceholderTreePicker удалены.
import LibrarySearchBar from '../../canvas/LibrarySearchBar';
import { useStore } from '../../../../store';
import RangePickerModal from './RangePickerModal';
import OpGroupPicker from './OpGroupPicker';
import AssemblyPipelinePanel from './AssemblyPipelinePanel';
import MutationModal from './MutationModal';
import { autoGroupPipeline } from '../../lib/auto-group-pipeline';
import AssemblyPrimersPanel from './AssemblyPrimersPanel';
import { useAssemblyPrimerWriting } from './useAssemblyPrimerWriting';
import { findInsertIndexAtPosition } from '../../lib/assembly-primer-utils';
import {
  enrichZonesWithJunctions, assemblyReadiness, methodsFromJunctions,
} from '../../lib/junction-derive';
import { applyCircularize } from '../../lib/circularize-apply';
import CircularizeModal from './CircularizeModal';
import { suggestMethodForBoundary } from '../../lib/assembly-realise-suggest';
import JunctionControl from '../../canvas/JunctionControl';
import { useSequenceSelection } from '../../../../hooks/useSequenceSelection';
import { routeAssemblyEdit, computeSeqDelta, SYNTHESIS_THRESHOLD_DEFAULT } from '../../lib/assembly-edit-router';
import { STRINGS } from '../../../../lib/strings';

const EA = STRINGS.canvasSkeleton.editableAssembly;
// noop reasons that mean "deferred to S2" → surface an info toast; the
// rest (malformed ops) are silent.
const DEFERRED_NOOP = new Set(['sourced-interior', 'intermediate-interior', 'cross-boundary']);
const EMPTY_JUNCTIONS = {};

function segLabel(seg, idx) {
  if (seg.label) return seg.label;
  if (seg.source?.type === 'container') {
    return seg.source.sourceContainerName || `Сегмент ${idx + 1}`;
  }
  if (seg.source?.type === 'manual') {
    return seg.gapKind ? `Gap (${seg.gapKind})` : `Manual ${idx + 1}`;
  }
  if (seg.source?.type === 'imported') {
    return seg.source.sourceLabel || `Imported ${idx + 1}`;
  }
  return `Сегмент ${idx + 1}`;
}

export default function AssemblyShellBody({ draft, embedded = false }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  // Global library (unified picker source) — same shape EmptyAssemblyLibrary
  // read before it was removed (SPEC_ASSEMBLY_PICKER_UNIFICATION).
  const libraryEntriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  // Always-fresh skeleton state for the post-dispatch macrotask in
  // onPickEntry — the captured `state` closure is stale right after the
  // ADD_CONTAINER_FROM_ENTRY dispatch re-render (Игорь 19.05.2026).
  const stateRef = useRef(state);
  stateRef.current = state;
  const draftId = draft.id;
  // JUNCTION step-2 FIX — the live zone (this editor's draftId IS the zone id
  // for a zone target) + its per-junction config. The clickable strip junction
  // + JunctionControl read this; legacy assemblyDrafts have no zone → no glyph.
  const zone = useMemo(
    () => (state.zones || []).find((z) => z.id === draftId) || null,
    [state.zones, draftId],
  );
  const isZoneTarget = !!zone;
  const zoneJunctions = (zone && zone.junctions) || EMPTY_JUNCTIONS;
  // UX slice 3 — the construct-level method (default overlap PCR); junctions
  // the biolog hasn't overridden inherit it, divergent ones are flagged.
  const assemblyMethod = (zone && zone.assemblyMethod) || 'overlap_pcr';

  const { boundaries, totalLength } = useMemo(
    () => segmentBoundaries(draft),
    [draft],
  );
  const { sequence, orphans } = useMemo(
    () => computeAssemblySequence(draft),
    [draft],
  );
  const orphanIds = useMemo(
    () => new Set(orphans.map((o) => o.segmentId)),
    [orphans],
  );

  // Fragment features ON the assembly (Игорь 17.05.2026): each sourced
  // segment's source-container annotations, clipped to the slice and
  // remapped onto assembly coords (RC-aware). Gap/orphan → none.
  const assemblyAnnotations = useMemo(
    () => collectAssemblyAnnotations(draft, boundaries, state.containers || []),
    [draft, boundaries, state.containers],
  );

  const coloredZones = useMemo(() => {
    const base = boundaries.map((b, i) => ({
      zoneId: b.segmentId,
      start: b.startOnAssembly,
      end: b.endOnAssembly,
      color: b.color,
      label: segLabel(draft.segments[i], i),
      isOrphan: orphanIds.has(b.segmentId),
    }));
    // JUNCTION step-2 FIX — enrich each internal boundary with a junctionRight
    // (method/kind from zone.junctions) so SegmentZonesOverlay draws the
    // clickable junction glyph on the editor strip. Legacy drafts (no zone)
    // stay plain → no glyph.
    return isZoneTarget ? enrichZonesWithJunctions(base, zoneJunctions, assemblyMethod) : base;
  }, [boundaries, draft.segments, orphanIds, isZoneTarget, zoneJunctions, assemblyMethod]);
  // UX slice 4 — one readiness summary for the whole assembly.
  const readiness = useMemo(() => assemblyReadiness(coloredZones), [coloredZones]);

  // Selection via shared hook (SPEC_VIEWER_UNIFICATION). reBehavior:
  // 'off' — assembled view has coloured zones, no RE pair/cut here.
  const sel = useSequenceSelection({ initialCaret: 0, reBehavior: 'off' });
  const { caretPos, caretAnchor } = sel;
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // K5 — range-picker context: { kind:'entry'|'container', payload, atIndex? }.
  const [rangeSource, setRangeSource] = useState(null);
  // K7 — grouping: per-zone-piece selection + OpGroupPicker open state.
  const [selectedSegmentIds, setSelectedSegmentIds] = useState(() => new Set());
  const [groupPickerIds, setGroupPickerIds] = useState(null);
  // K14 — mutation modal context: { pieceId, fromBase, position } | null.
  const [mutationFor, setMutationFor] = useState(null);
  // M-CIRCULARIZE — «замкнуть в плазмиду» modal open state.
  const [circularizeOpen, setCircularizeOpen] = useState(false);

  // M-CIRCULARIZE C1 — apply the modal's decision: topology + assembly/closure
  // method. One method for the whole assembly (Игорь) when «применить ко всем»,
  // else only the closure junction (last→first). The closure actually realises
  // into the DAG in C2 (zone-pieces-to-dag); here we set topology + config.
  const onCircularizeConfirm = useCallback(({
    circular, method, applyToAll, enzyme,
  }) => {
    setCircularizeOpen(false);
    applyCircularize(actions, {
      draftId, circular, method, applyToAll, enzyme, isZoneTarget, segments: draft.segments,
    });
  }, [actions, draftId, isZoneTarget, draft.segments]);

  // «Реализовать как DAG» — the confirm modal was removed (Игорь 11.06): the
  // strip junctions already own the per-boundary method (J9) and the real DAG
  // renders on the canvas (now topology-correct), so the button realises
  // directly. methods come from the junctions, with the A4 suggestion as
  // fallback (the same source the old modal used). The reducer raises the
  // outcome toast (success / «лимит ревизий» / error) — the single source of
  // truth — so the editor stays quiet here. Ctrl+Z reverts; re-realising a
  // zone regenerates (it does not duplicate).
  const onRealise = useCallback(() => {
    const segs = (draft && draft.segments) || [];
    // M-CIRCULARIZE C3 — a single-fragment CIRCULAR assembly self-closes, so it
    // is realisable too (the lone fragment closes its own ends into a plasmid).
    const isCircular = !!(draft && draft.topology && draft.topology.circular);
    if (segs.length < 2 && !(segs.length === 1 && isCircular)) return;
    const boundaryCount = segs.length - 1;
    const suggestions = [];
    for (let i = 0; i < boundaryCount; i += 1) {
      suggestions.push(suggestMethodForBoundary(state, draftId, i));
    }
    const methods = methodsFromJunctions(draft, zoneJunctions, suggestions);
    actions.realiseAssembly(draftId, methods);
  }, [draft, state, draftId, zoneJunctions, actions]);
  // JUNCTION step-2 FIX — viewport coords of the clicked junction glyph so the
  // JunctionControl popover anchors to it (else it lands top-left, looked broken).
  const [junctionPos, setJunctionPos] = useState(null);
  // V92 — каждая правая/нижняя панель получает свой close (×); скрытие
  // живёт в `hiddenPanels` set. «Палитра» button (AssemblyHeader) ребёт
  // restoring: click clears the set → все скрытые панели возвращаются.
  const [hiddenPanels, setHiddenPanels] = useState(() => new Set());
  const hidePanel = useCallback((id) => {
    setHiddenPanels((prev) => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
  }, []);
  const showAllPanels = useCallback(() => setHiddenPanels(new Set()), []);
  const dropPosRef = useRef(0);

  const openDetail = useCallback((segId) => {
    setSelectedSegmentId(segId);
    setDetailOpen(true);
  }, []);

  // JUNCTION step-2 FIX — the strip's onZoneClick channel now carries EITHER a
  // segment-zone id (string → open segment detail) OR a junction descriptor
  // (object with pairKey → open JunctionControl for that boundary). The strip
  // junction glyph is the only emitter of the object form; segment handles stay
  // string, so all other consumers are unaffected.
  const onZoneClick = useCallback((arg) => {
    if (arg && typeof arg === 'object' && arg.pairKey) {
      setJunctionPos(Number.isFinite(arg.clientX)
        ? { x: arg.clientX, y: arg.clientY } : null);
      if (typeof actions.zoneDispatch === 'function') {
        actions.zoneDispatch({
          type: 'OPEN_JUNCTION_METHOD_PICKER',
          zoneId: draftId,
          fromPieceId: arg.fromPieceId,
          toPieceId: arg.toPieceId,
        });
      }
      return;
    }
    openDetail(arg);
  }, [actions, draftId, openDetail]);

  // K8 — primer writing (Ctrl+R / Ctrl+Alt+R + right-click), reuses the
  // F3 V72/V74 mechanism but attaches the primer to the assembly draft.
  const { onWritePrimer, primers: viewerPrimers } = useAssemblyPrimerWriting({
    draftId, sequence, boundaries, caretAnchor, caretPos, actions, state,
  });
  // Del on a selected primer in the assembly sequence-view removes it from
  // the draft (the viewer hit carries `id` via viewerPrimers).
  const onDeletePrimer = useCallback((hit) => {
    if (hit && hit.id) actions.removeAssemblyPrimer(draftId, hit.id);
  }, [actions, draftId]);

  // ── SPEC_EDITABLE_ASSEMBLY_S1 — editable assembled view ────────────
  // §5.9 — settings-tunable synthesis threshold (default 80).
  const synthesisLengthThreshold = useStore((s) => s.displaySettings?.synthesisLengthThreshold);
  const threshold = Number.isFinite(synthesisLengthThreshold)
    ? synthesisLengthThreshold : SYNTHESIS_THRESHOLD_DEFAULT;

  // §5.1 — the assembled view is editable when the zone is not read-only
  // (always false in this skeleton) AND no piece is frozen by an executed
  // reaction AND there is no source-less orphan. Otherwise editing the
  // derived sequence is unsafe → read-only + an explanatory banner.
  const zonePieces = useMemo(
    () => (state.pieces || []).filter((p) => p.zoneId === draftId),
    [state.pieces, draftId],
  );
  const hasFrozenPiece = useMemo(() => zonePieces.some((p) => p.frozen), [zonePieces]);
  const hasOrphan = orphans.length > 0;
  // The piece-based edit path (INSERT_SNIPPET / UPDATE_PIECE) only exists
  // for zone-backed assemblies; a legacy assemblyDrafts target has no
  // pieces, so it stays read-only. (isZoneTarget derived up top.)
  const editable = isZoneTarget && !hasFrozenPiece && !hasOrphan;
  const disabledBannerMsg = hasFrozenPiece ? EA.frozenBanner : (hasOrphan ? EA.orphanBanner : null);

  // §5.2/§5.8 (+ S2 §5) — translate an onSequenceEdit-op (assembly
  // coords) into piece operation(s) via the pure router, disband the
  // op-group(s) of every affected piece first (§5.6/S2 §5.8), apply, then
  // move the caret.
  const insertSnippetAt = useCallback((sequence, insertAtIndex) => {
    actions.insertSnippet(draftId, {
      sequence, embedsInPrimer: true, name: EA.newBlockName,
    }, insertAtIndex);
  }, [actions, draftId]);

  const onSequenceEdit = useCallback((op) => {
    const result = routeAssemblyEdit(op, draft, boundaries, { threshold });
    if (!result || result.kind === 'noop') {
      if (result && DEFERRED_NOOP.has(result.reason)) {
        actions.showToast({ kind: 'info', message: EA.editDeferred });
      }
      return;
    }
    // §5.6 / S2 §5.8 — disband the op-group of every affected piece first.
    const affected = result.kind === 'plan'
      ? (result.steps || []).map((s) => s.pieceId).filter(Boolean)
      : (result.pieceId ? [result.pieceId] : []);
    let disbanded = false;
    for (const pid of affected) {
      const piece = (state.pieces || []).find((p) => p.id === pid);
      if (piece && piece.groupId) { actions.disbandOpGroup(piece.groupId); disbanded = true; }
    }
    if (disbanded) actions.showToast({ kind: 'warning', message: EA.groupDisbanded });

    switch (result.kind) {
      case 'update-inline': {
        const changes = result.targetKind === 'gap'
          ? { gapSequence: result.sequence, gapLength: result.sequence.length, gapHint: 'known' }
          : { sequence: result.sequence, ...(result.kindFlip ? { kind: result.kindFlip } : {}) };
        actions.updatePiece(result.pieceId, changes);
        break;
      }
      case 'remove-block':
        actions.removeSegment(draftId, result.pieceId);
        break;
      case 'new-block':
        insertSnippetAt(result.char, result.insertAtIndex);
        break;
      case 'split-insert': // S2 — insert inside a sourced piece
        actions.splitPiece(result.pieceId, result.atOffset);
        insertSnippetAt(result.char, result.insertAtIndex);
        break;
      case 'mutate': // S2 — equal-length substitution
        for (const m of result.mutations || []) actions.addPieceMutation(result.pieceId, m);
        break;
      case 'trim': // S2 — edge delete in a sourced piece
        actions.updatePiece(result.pieceId, { ranges: [result.range] });
        break;
      case 'split-delete': // S2 — mid delete in a sourced piece
        actions.splitPiece(result.pieceId, result.atOffset, result.deleteLen);
        if (result.insertSeq) insertSnippetAt(result.insertSeq, result.insertAtIndex);
        break;
      case 'plan': // S2 — spanning delete / replace
        for (const step of result.steps || []) {
          if (step.op === 'remove') actions.removeSegment(draftId, step.pieceId);
          else if (step.op === 'trim') actions.updatePiece(step.pieceId, { ranges: [step.range] });
          else if (step.op === 'splice-inline') {
            const ch = step.targetKind === 'gap'
              ? { gapSequence: step.sequence, gapLength: step.sequence.length, gapHint: 'known' }
              : { sequence: step.sequence };
            actions.updatePiece(step.pieceId, ch);
          } else if (step.op === 'insert-snippet') {
            insertSnippetAt(step.sequence, step.insertAtIndex);
          }
        }
        break;
      default: break;
    }
    // S3 §5.4 — maintain SAVED primer coordinates after the edit shifted
    // the assembled sequence (shift right-of / stale-mark in-region).
    const sd = computeSeqDelta(op);
    if (sd) actions.shiftAssemblyPrimers(draftId, sd.atPos, sd.delta);
    // §5.8 — caret follows the edit (insert → +1; delete → in place;
    // replace → after the replacement).
    let nextCaret = null;
    if (op.kind === 'insert') nextCaret = op.pos + 1;
    else if (op.kind === 'delete') nextCaret = op.pos;
    else if (op.kind === 'replace') {
      nextCaret = op.start + (typeof op.replacement === 'string' ? op.replacement.length : 0);
    }
    if (nextCaret != null) {
      sel.setCaretPos(nextCaret);
      sel.setCaretAnchor(nextCaret);
    }
  }, [draft, boundaries, threshold, actions, state.pieces, draftId, sel, insertSnippetAt]);

  // K5 — drag a container from the sidebar; drop anywhere on the viewer
  // opens the RangePickerModal pre-loaded with that container so the
  // biolog confirms the slice + RC before insert (SPEC §3.1.A).
  const onDrop = useCallback((e) => {
    e.preventDefault();
    let containerId = '';
    try {
      containerId = e.dataTransfer.getData('application/x-bodge-container-id')
        || e.dataTransfer.getData('text/plain') || '';
    } catch { containerId = ''; }
    if (!containerId) return;
    const c = (state.containers || []).find((x) => x.id === containerId);
    if (!c) return;
    const atIndex = findInsertIndexAtPosition(dropPosRef.current, boundaries);
    setRangeSource({ kind: 'container', payload: c, atIndex });
  }, [state.containers, boundaries]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    dropPosRef.current = caretPos;
  }, [caretPos]);

  // K5 — pick a Library entry → open RangePickerModal step (SPEC §3.1.A
  // step 2). Reuse of the shared PlaceholderTreePicker remains (Игорь
  // 19.05.2026: «У НАС вот уже было такое окно поиска»); materialise
  // happens at range-confirm so the picker is purely pre-flight.
  const onPickEntry = useCallback((entry) => {
    if (!entry || !entry.id) return;
    setPickerOpen(false);
    setRangeSource({ kind: 'entry', payload: entry });
  }, []);

  // RangePicker confirm: materialise (for an entry) OR reuse the
  // existing canvas container id, then insert a sourced segment with
  // the chosen [start, end, rc]. For the entry path the fresh container
  // id is recovered via snapshot-diff on the *latest* state (stateRef).
  const onRangeConfirm = useCallback(({ start, end, rc, acquisitionMethod }) => {
    if (!rangeSource) return;
    // V89 — picker says как фрагмент был выбран; пробрасываем в action
    // как opts, чтобы piece получил `acquisitionMethod='restriction'`
    // (или другую отметку) и auto-grouping/junction-derivation потом
    // дефолтили на ligation-junction для RE-pieces.
    const opts = { acquisitionMethod };
    if (rangeSource.kind === 'entry') {
      const entry = rangeSource.payload;
      const before = new Set((stateRef.current.containers || []).map((c) => c.id));
      actions.addContainerFromEntry(entry);
      setRangeSource(null);
      setTimeout(() => {
        const containers = stateRef.current.containers || [];
        const fresh = containers.find(
          (c) => !before.has(c.id) && c.origin && c.origin.sourceEntryId === entry.id,
        ) || containers.find((c) => !before.has(c.id));
        if (!fresh) return;
        actions.insertSegment(draftId, fresh.id, start, end, rc, undefined, opts);
      }, 0);
    } else {
      actions.insertSegment(draftId, rangeSource.payload.id, start, end, rc, rangeSource.atIndex, opts);
      setRangeSource(null);
    }
  }, [actions, draftId, rangeSource]);

  // Normalise the rangeSource payload into the shape RangePickerModal
  // expects ({ name, sequence, annotations, circular }).
  const rangeSourceShape = rangeSource ? (rangeSource.kind === 'entry' ? {
    name: rangeSource.payload.name,
    sequence: (rangeSource.payload.payload && rangeSource.payload.payload.sequence) || '',
    annotations: (rangeSource.payload.payload && rangeSource.payload.payload.annotations) || [],
    circular: (rangeSource.payload.payload && rangeSource.payload.payload.topology) === 'circular',
  } : {
    name: rangeSource.payload.name,
    sequence: rangeSource.payload.sequence || '',
    annotations: rangeSource.payload.annotations || [],
    circular: !!(rangeSource.payload.topology && rangeSource.payload.topology.circular),
  }) : null;

  // SPEC_ASSEMBLY_CUSTOM_SEGMENT §3 (SAFE) — «вставить свой сиквенс» из
  // единого пикера. Reuses the existing INSERT_MANUAL_SEGMENT path (V83
  // known-gap: stored verbatim as `gapSequence`). Position: after the
  // selected segment, else appended at the end. No SPLIT_PIECE (that's
  // §6, deferred). Закрывает popover после вставки.
  const onPasteSequence = useCallback((seq) => {
    if (!seq) return;
    let atIndex; // undefined → append at end
    if (selectedSegmentId) {
      const idx = (draft.segments || []).findIndex((s) => s.id === selectedSegmentId);
      if (idx >= 0) atIndex = idx + 1;
    }
    actions.insertManualSegment(draftId, { sequence: seq }, atIndex);
    setPickerOpen(false);
  }, [actions, draftId, selectedSegmentId, draft.segments]);

  return (
    <div
      data-testid="assembly-mode-shell"
      data-draft-id={draftId}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
      }}
    >
      <AssemblyHeader
        draft={draft}
        length={totalLength}
        segmentCount={draft.segments.length}
        canRealise={draft.segments.length >= 2
          || (draft.segments.length === 1 && !!(draft.topology && draft.topology.circular))}
        onRename={(name) => actions.renameAssemblyDraft(draftId, name)}
        onRealise={onRealise}
        /* M-CIRCULARIZE — the «замкнуть в плазмиду» modal owns topology + method
           (chip shows the current value). */
        assemblyMethod={assemblyMethod}
        onOpenCircularize={() => setCircularizeOpen(true)}
        /* V92 — restore editor side-panels hidden via their × (was «Палитра»). */
        anyPanelHidden={hiddenPanels.size > 0}
        onRestorePanels={hiddenPanels.size > 0 ? showAllPanels : undefined}
        /* AV-K10 — collapse editor → canvas sequence view of this zone.
           Сохраняет state, just closes the editor and flips the zone
           viewMode to 'sequence'. Re-entry through «🧬 Открыть сборку»
           on the zone frame opens the editor again. */
        /* M-WORKSPACE — when embedded as the Sequence view tab there is no
           overlay to collapse and viewMode no longer drives the body, so the
           collapse button is suppressed (undefined → AssemblyHeader hides it). */
        onToggleSequenceView={embedded ? undefined : () => {
          if (typeof actions.zoneDispatch === 'function') {
            actions.zoneDispatch({
              type: 'SET_ZONE_VIEW_MODE', zoneId: draftId, viewMode: 'sequence',
            });
          }
          if (typeof actions.closeEditor === 'function') actions.closeEditor();
        }}
      />

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          data-testid="assembly-viewer-wrap"
          onDragOver={onDragOver}
          onDrop={onDrop}
          style={{
            flex: 1, minWidth: 0, overflow: 'auto', padding: 12,
            display: 'flex', flexDirection: 'column',
          }}
        >
          {draft.segments.length === 0 ? (
            <div
              data-testid="assembly-empty-library"
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '24px 16px',
                gap: 12,
                overflow: 'hidden',
              }}
            >
              <div
                data-testid="assembly-empty-hint"
                style={{
                  fontSize: 12.5, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 560,
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }} aria-hidden>📚</div>
                Выберите контейнер из библиотеки — откроется sequence-viewer
                для выбора фрагмента (праймеры / сайты рестрикции / диапазон / фича).
              </div>
              <LibrarySearchBar
                inline
                autoFocus
                testId="assembly-source-picker"
                libraryEntries={libraryEntriesById}
                projectsById={projectsById}
                currentProjectId={currentProjectId}
                onSelectEntry={({ entry }) => { if (entry) onPickEntry(entry); }}
                onPasteSequence={onPasteSequence}
              />
            </div>
          ) : (
            <>
              {/* UX slice 4 — one readiness line: settled vs N defaults to check. */}
              {isZoneTarget && readiness.total > 0 && (
                <div
                  data-testid="assembly-readiness"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', marginBottom: 8, fontSize: 11.5,
                    borderRadius: 'var(--radius-md)',
                    color: readiness.ready ? 'var(--emerald, #4A7C59)' : 'var(--text-secondary)',
                    background: 'var(--surface-2)', border: '0.5px solid var(--border-subtle)',
                  }}
                >
                  {readiness.ready
                    ? '✓ Все стыки заданы — готово к сборке'
                    : `${readiness.tentative} стык(ов) по умолчанию — проверьте`}
                  {readiness.differs > 0 ? ` · ${readiness.differs} отличается от сборки` : ''}
                </div>
              )}
              {/* R1 «блок сборки сверху» — the assembled fragments as a
                  prominent top plashka (coloured segments + clickable junction
                  ромб), above the sequence string. Same coloredZones + the same
                  onZoneClick contract SegmentZonesOverlay uses on the strip, so
                  a segment click opens its detail and a ромб opens JunctionControl. */}
              <AssemblySegmentBar coloredZones={coloredZones} onZoneClick={onZoneClick} />
              {!editable && disabledBannerMsg && (
                <div
                  data-testid="assembly-edit-disabled-banner"
                  style={{
                    padding: '6px 12px',
                    marginBottom: 8,
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-2)',
                    border: '0.5px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >{disabledBannerMsg}</div>
              )}
              <SequenceTab
                sequence={sequence}
                annotations={assemblyAnnotations}
                topology={draft.topology?.circular ? 'circular' : 'linear'}
                name={draft.name}
                editable={editable}
                onSequenceEdit={editable ? onSequenceEdit : undefined}
                isReadOnlyZone={false}
                caretPos={sel.caretPos}
                caretAnchor={sel.caretAnchor}
                selectionMode={sel.selectionMode}
                selectionStrand={sel.selectionStrand}
                onCaretChange={sel.onCaretChange}
                onSelectRange={sel.onSelectRange}
                onWritePrimer={onWritePrimer}
                onDeletePrimer={onDeletePrimer}
                showSelectionTm
                primers={viewerPrimers}
                coloredZones={coloredZones}
                onZoneClick={onZoneClick}
                onZoneHover={() => {}}
              />
            </>
          )}
        </div>

        {/* Right rail — conditional panels per spec §4 + Игорь 20.05.2026:
            «спрятать мини канвас в правом верхнем углу». Now strictly
            gated on `segments.length > 0` — when the assembly is empty
            the centre library picker is the only UI. */}
        {draft.segments.length > 0 && (
          (() => {
            const showSidebar = (state.containers || []).length > 0 && !hiddenPanels.has('sidebar');
            const showPrimers = (((viewerPrimers || []).length > 0) || draft.segments.length > 0)
              && !hiddenPanels.has('primers');
            if (!showSidebar && !showPrimers) return null;
            return (
              <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {showSidebar && (
                  <AssemblySidebar
                    containers={state.containers || []}
                    onClose={() => hidePanel('sidebar')}
                  />
                )}
                {showPrimers && (
                  <AssemblyPrimersPanel
                    draftId={draftId}
                    onClose={() => hidePanel('primers')}
                  />
                )}
              </div>
            );
          })()
        )}

        {/* AE-K2 spec §4 deviation: panel shows on op-groups OR ≥2 segments.
            Strict spec hides until first group exists, but Auto-собрать
            button (the only way to bulk-group remaining pieces) lives
            inside the panel — gating it behind "must create a group first"
            traps users. Keeping it reachable as soon as grouping is
            biologically meaningful (≥2 segments).
            Игорь 20.05.2026: also hide when segments.length === 0 to
            keep the empty-state editor library-picker-only. */}
        {draft.segments.length > 0 && !hiddenPanels.has('pipeline') && ((state.operations || []).some(
          (op) => op && op.isOpGroup && op.zoneId === draftId,
        ) || draft.segments.length >= 2) && (
        <AssemblyPipelinePanel
          draftId={draftId}
          zoneId={draftId}
          onClose={() => hidePanel('pipeline')}
          onAutomode={() => {
            // K10 — run the heuristic on the latest state; apply only
            // layer-0 groups (real piece ids). Layer-1+ uses indices
            // into layer-0 outputs; the K15 finalizer materialises the
            // intermediates before those can be applied.
            const stateNow = stateRef.current;
            const zone = (stateNow.zones || []).find((z) => z.id === draftId);
            if (!zone) return;
            const plan = autoGroupPipeline(zone, stateNow);
            for (const g of plan.groups || []) {
              if (g.layer === 0 && Array.isArray(g.pieceIds) && g.pieceIds.length >= 2) {
                actions.createOpGroup(draftId, g.kind, '', g.pieceIds);
              }
            }
          }}
        />
        )}

        {/* V94 — SegmentDetailPanel снят: его функции (диапазон / RC /
            цвет / метка / Удалить) встроены inline в SegmentList rows
            через chevron-expand. Selected-segment state остаётся для
            highlight-эффекта в strip, но drawer больше не открывается. */}
      </div>

      <SegmentList
        draft={draft}
        boundaries={boundaries}
        orphanIds={orphanIds}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={openDetail}
        selectedSegmentIds={selectedSegmentIds}
        onToggleSelect={(id) => setSelectedSegmentIds((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id); else n.add(id);
          return n;
        })}
        onSew={(ids) => setGroupPickerIds(ids)}
        operations={state.operations || []}
        onAddMutation={(pid) => {
          // The default position seeds at the centre of the piece's
          // assembled span; fromBase is taken from the piece sequence
          // (best-effort, '?' fallback). Biolog edits in the modal.
          const seg = (draft.segments || []).find((s) => s.id === pid);
          const pos = 0;
          const fromBase = seg && typeof seg.sequence === 'string' && seg.sequence.length > 0
            ? seg.sequence[pos] : '?';
          setMutationFor({ pieceId: pid, position: pos, fromBase });
        }}
      />

      {mutationFor && (
        <MutationModal
          sourceName={((state.containers || []).find(
            (c) => c.id === ((state.pieces || []).find((p) => p.id === mutationFor.pieceId)
              || {}).sourceIds?.[0],
          ) || {}).name || 'piece'}
          defaultPosition={mutationFor.position}
          fromBase={mutationFor.fromBase}
          // A15 — pass the piece sequence so «Original base» tracks the position.
          sequence={((draft.segments || []).find((s) => s.id === mutationFor.pieceId) || {}).sequence || ''}
          onConfirm={(m) => {
            actions.addPieceMutation(mutationFor.pieceId, m);
            setMutationFor(null);
          }}
          onCancel={() => setMutationFor(null)}
        />
      )}

      {/* M-CIRCULARIZE — «замкнуть в плазмиду» modal (topology + assembly/closure
          method). Opened from the AssemblyHeader chip. */}
      {circularizeOpen && (
        <CircularizeModal
          draft={draft}
          assemblyMethod={assemblyMethod}
          onConfirm={onCircularizeConfirm}
          onCancel={() => setCircularizeOpen(false)}
        />
      )}

      {groupPickerIds && (
        <OpGroupPicker
          pieceIds={groupPickerIds}
          /* TOP-2 — derive from draft.topology (draftFromZone always sets it);
             never hard-code 'circular' for a linear assembly. */
          zoneFinalTopology={draft.topology && draft.topology.circular ? 'circular' : 'linear'}
          onConfirm={({ kind, name }) => {
            actions.createOpGroup(draftId, kind, name, groupPickerIds);
            setGroupPickerIds(null);
            setSelectedSegmentIds(new Set());
          }}
          onCancel={() => setGroupPickerIds(null)}
        />
      )}

      <AssemblyToolbar
        onAddSegment={() => setPickerOpen(true)}
        selectedSegmentIds={selectedSegmentIds}
        onSewSelected={() => setGroupPickerIds(Array.from(selectedSegmentIds))}
        /* SPEC_ASSEMBLY_CUSTOM_SEGMENT — single «+ Сегмент» button (Обвес/
           Синтез/Gap упразднены). Empty assembly: toolbar compact (only
           Undo/Redo); add-surface is the centre unified picker. */
        compact={draft.segments.length === 0}
      />

      {pickerOpen && (
        <div
          data-testid="assembly-source-picker-popover"
          style={pickerPopoverBackdrop}
          onClick={() => setPickerOpen(false)}
        >
          <div style={pickerPopoverPanel} onClick={(e) => e.stopPropagation()}>
            <LibrarySearchBar
              inline
              autoFocus
              testId="assembly-source-picker"
              libraryEntries={libraryEntriesById}
              projectsById={projectsById}
              currentProjectId={currentProjectId}
              onSelectEntry={({ entry }) => { if (entry) onPickEntry(entry); }}
              onPasteSequence={onPasteSequence}
            />
          </div>
        </div>
      )}
      {rangeSource && rangeSourceShape && (
        <RangePickerModal
          source={rangeSourceShape}
          onConfirm={onRangeConfirm}
          onCancel={() => setRangeSource(null)}
        />
      )}
      {/* JUNCTION step-2 FIX — clicking a strip junction glyph opens this
          control (evolution of JunctionPopover) for the live zone.junctions
          config. onChange → SET_BOUNDARY_OVERLAP; onClose → CLOSE_JUNCTION_PICKER. */}
      {state.junctionPicker && state.junctionPicker.zoneId === draftId && (
        <JunctionControl
          pairKey={state.junctionPicker.pairKey}
          config={zoneJunctions[state.junctionPicker.pairKey]}
          position={junctionPos}
          onChange={(patch) => {
            if (typeof actions.zoneDispatch === 'function') {
              actions.zoneDispatch({
                type: 'SET_BOUNDARY_OVERLAP',
                zoneId: draftId,
                pairKey: state.junctionPicker.pairKey,
                ...patch,
              });
            }
          }}
          onClose={() => {
            if (typeof actions.zoneDispatch === 'function') {
              actions.zoneDispatch({ type: 'CLOSE_JUNCTION_PICKER' });
            }
          }}
          /* UX slice 3 — promote this junction's method to the whole assembly. */
          onMakeAssemblyMethod={() => {
            if (typeof actions.zoneDispatch !== 'function') return;
            const cfg = zoneJunctions[state.junctionPicker.pairKey];
            actions.zoneDispatch({
              type: 'SET_ASSEMBLY_METHOD',
              zoneId: draftId,
              method: (cfg && cfg.method) || 'overlap_pcr',
              // L6 (audit) — carry the junction's enzyme too, else promoting a
              // BamHI/BsmBI junction reset the construct enzyme to the default.
              enzyme: cfg && cfg.enzyme,
            });
          }}
        />
      )}
    </div>
  );
}

// «+ Сегмент» popover host for the non-empty assembler —
// reuses the same inline unified picker as the empty state.
const pickerPopoverBackdrop = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  background: 'rgba(28,25,23,0.32)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '64px 16px',
};
const pickerPopoverPanel = {
  width: '100%',
  maxWidth: 560,
  maxHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};
