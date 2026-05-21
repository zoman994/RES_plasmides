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
import SegmentList from './SegmentList';
import SegmentDetailPanel from './SegmentDetailPanel';
import AssemblyToolbar from './AssemblyToolbar';
import PlaceholderTreePicker from '../../canvas/PlaceholderTreePicker';
import { v7 as uuidv7 } from 'uuid';
import InsertGapModal from './InsertGapModal';
import SnippetCatalogModal from './SnippetCatalogModal';
import SynthesisModal from './SynthesisModal';
import RangePickerModal from './RangePickerModal';
import SnippetOnboardingTip from './SnippetOnboardingTip';
import OpGroupPicker from './OpGroupPicker';
import AssemblyPipelinePanel from './AssemblyPipelinePanel';
import MutationModal from './MutationModal';
import { autoGroupPipeline } from '../../lib/auto-group-pipeline';
import AssemblyPrimersPanel from './AssemblyPrimersPanel';
import RealiseModal from './RealiseModal';
import EmptyAssemblyLibrary from './EmptyAssemblyLibrary';
import { useAssemblyPrimerWriting } from './useAssemblyPrimerWriting';
import { findInsertIndexAtPosition } from '../../lib/assembly-primer-utils';

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

export default function AssemblyShellBody({ draft }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  // Always-fresh skeleton state for the post-dispatch macrotask in
  // onPickEntry — the captured `state` closure is stale right after the
  // ADD_CONTAINER_FROM_ENTRY dispatch re-render (Игорь 19.05.2026).
  const stateRef = useRef(state);
  stateRef.current = state;
  const draftId = draft.id;

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

  const coloredZones = useMemo(() => boundaries.map((b, i) => ({
    zoneId: b.segmentId,
    start: b.startOnAssembly,
    end: b.endOnAssembly,
    color: b.color,
    label: segLabel(draft.segments[i], i),
    isOrphan: orphanIds.has(b.segmentId),
  })), [boundaries, draft.segments, orphanIds]);

  // Selection state for the shared viewer (mirrors PcrModeShell).
  const [caretPos, setCaretPos] = useState(0);
  const [caretAnchor, setCaretAnchor] = useState(0);
  const [selectionMode, setSelectionMode] = useState('dna');
  const [selectionStrand, setSelectionStrand] = useState(1);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gapOpen, setGapOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  // K5 — range-picker context: { kind:'entry'|'container', payload, atIndex? }.
  const [rangeSource, setRangeSource] = useState(null);
  // K7 — grouping: per-zone-piece selection + OpGroupPicker open state.
  const [selectedSegmentIds, setSelectedSegmentIds] = useState(() => new Set());
  const [groupPickerIds, setGroupPickerIds] = useState(null);
  // K14 — mutation modal context: { pieceId, fromBase, position } | null.
  const [mutationFor, setMutationFor] = useState(null);
  const [realiseOpen, setRealiseOpen] = useState(false);
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

  const onSelectRange = useCallback((start, end, mode, strand) => {
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    setCaretAnchor(start);
    setCaretPos(end);
    setSelectionMode(mode === 'aa' ? 'aa' : 'dna');
    setSelectionStrand(strand === -1 ? -1 : 1);
  }, []);

  const onCaretChange = useCallback((pos, opts) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    setCaretPos(pos);
    if (!opts || !opts.extendSelection) {
      setCaretAnchor(pos);
      setSelectionMode('dna');
    }
  }, []);

  const openDetail = useCallback((segId) => {
    setSelectedSegmentId(segId);
    setDetailOpen(true);
  }, []);

  // K8 — primer writing (Ctrl+R / Ctrl+Alt+R + right-click), reuses the
  // F3 V72/V74 mechanism but attaches the primer to the assembly draft.
  const { onWritePrimer, primers: viewerPrimers } = useAssemblyPrimerWriting({
    draftId, sequence, boundaries, caretAnchor, caretPos, actions, state,
  });

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

  const onInsertGap = useCallback((params) => {
    actions.insertManualSegment(draftId, params, undefined);
    setGapOpen(false);
  }, [actions, draftId]);

  // K3 — «+ Обвес»: a snippet piece (embeds into a neighbour primer
  // tail; visually a strip block). Closes the catalog on pick.
  const onInsertSnippet = useCallback((snippet) => {
    actions.insertSnippet(draftId, snippet, undefined);
    setSnippetOpen(false);
  }, [actions, draftId]);

  // K4 — «+ Синтез». inline → kind='synthesis' piece. container →
  // materialise a reusable molecule (caller-side id, no race) then a
  // sourced segment off it (same shape as the drag-insert path).
  const onInsertSynthesis = useCallback(({ sequence, name, mode }) => {
    if (mode === 'container') {
      const cid = `cnt-${uuidv7()}`;
      actions.addContainer({
        id: cid,
        kind: 'molecule',
        name: name || 'Синтез',
        sequence,
        annotations: [],
        topology: { circular: false },
      });
      actions.insertSegment(draftId, cid, 0, sequence.length, false, undefined);
    } else {
      actions.insertSynthesis(draftId, { sequence, name }, undefined);
    }
    setSynthesisOpen(false);
  }, [actions, draftId]);

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
        paletteLegend={coloredZones}
        canRealise={draft.segments.length >= 2}
        onRename={(name) => actions.renameAssemblyDraft(draftId, name)}
        onToggleTopology={() => actions.setAssemblyDraftTopology(
          draftId, !(draft.topology && draft.topology.circular),
        )}
        onRealise={() => setRealiseOpen(true)}
        /* V92 — «Палитра» button restores hidden side-panels back when
           at least one is hidden. Otherwise behaves as before (opens
           color legend). */
        anyPanelHidden={hiddenPanels.size > 0}
        onPaletteClick={hiddenPanels.size > 0 ? showAllPanels : undefined}
        /* AV-K10 — collapse editor → canvas sequence view of this zone.
           Сохраняет state, just closes the editor and flips the zone
           viewMode to 'sequence'. Re-entry through «🧬 Открыть сборку»
           on the zone frame opens the editor again. */
        onToggleSequenceView={() => {
          if (typeof actions.zoneDispatch === 'function') {
            actions.zoneDispatch({
              type: 'SET_ZONE_VIEW_MODE', zoneId: draftId, viewMode: 'sequence',
            });
          }
          if (typeof actions.closeEditor === 'function') actions.closeEditor();
        }}
      />

      <SnippetOnboardingTip
        hasSnippet={(draft.segments || []).some((s) => s.pieceKind === 'snippet')}
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
            <EmptyAssemblyLibrary
              onPickEntry={onPickEntry}
              onAddSnippet={() => setSnippetOpen(true)}
              onAddSynthesis={() => setSynthesisOpen(true)}
              onAddGap={() => setGapOpen(true)}
            />
          ) : (
            <SequenceTab
              sequence={sequence}
              annotations={assemblyAnnotations}
              topology={draft.topology?.circular ? 'circular' : 'linear'}
              name={draft.name}
              editable={false}
              isReadOnlyZone={false}
              caretPos={caretPos}
              caretAnchor={caretAnchor}
              selectionMode={selectionMode}
              selectionStrand={selectionStrand}
              onCaretChange={onCaretChange}
              onSelectRange={onSelectRange}
              onWritePrimer={onWritePrimer}
              showSelectionTm
              primers={viewerPrimers}
              coloredZones={coloredZones}
              onZoneClick={openDetail}
              onZoneHover={() => {}}
            />
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

        {detailOpen && selectedSegmentId && (
          <SegmentDetailPanel
            key={selectedSegmentId}
            draftId={draftId}
            segmentId={selectedSegmentId}
            onClose={() => setDetailOpen(false)}
          />
        )}
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
          onConfirm={(m) => {
            actions.addPieceMutation(mutationFor.pieceId, m);
            setMutationFor(null);
          }}
          onCancel={() => setMutationFor(null)}
        />
      )}

      {groupPickerIds && (
        <OpGroupPicker
          pieceIds={groupPickerIds}
          zoneFinalTopology={(draft.topology && draft.topology.circular) ? 'circular' : (draft.finalTopology || 'circular')}
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
        onAddSnippet={() => setSnippetOpen(true)}
        onAddSynthesis={() => setSynthesisOpen(true)}
        onAddGap={() => setGapOpen(true)}
        selectedSegmentIds={selectedSegmentIds}
        onSewSelected={() => setGroupPickerIds(Array.from(selectedSegmentIds))}
        /* Игорь 20.05.2026: «снизу кнопки обвес и тд убрать». When the
           assembly is empty, the toolbar hides the + buttons and shows
           only Undo/Redo. The + entry-points are taken over by the
           inline EmptyAssemblyLibrary in the centre. */
        compact={draft.segments.length === 0}
      />

      {pickerOpen && (
        <PlaceholderTreePicker
          onPick={onPickEntry}
          onCancel={() => setPickerOpen(false)}
        />
      )}
      {rangeSource && rangeSourceShape && (
        <RangePickerModal
          source={rangeSourceShape}
          onConfirm={onRangeConfirm}
          onCancel={() => setRangeSource(null)}
        />
      )}
      {gapOpen && (
        <InsertGapModal
          onInsert={onInsertGap}
          onCancel={() => setGapOpen(false)}
        />
      )}
      {snippetOpen && (
        <SnippetCatalogModal
          onPick={onInsertSnippet}
          onCancel={() => setSnippetOpen(false)}
        />
      )}
      {synthesisOpen && (
        <SynthesisModal
          onConfirm={onInsertSynthesis}
          onCancel={() => setSynthesisOpen(false)}
        />
      )}
      {realiseOpen && (
        <RealiseModal
          draftId={draftId}
          onClose={() => setRealiseOpen(false)}
        />
      )}
    </div>
  );
}
