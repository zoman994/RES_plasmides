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
import AssemblySourcePicker from './AssemblySourcePicker';
import InsertGapModal from './InsertGapModal';
import AssemblyPrimersPanel from './AssemblyPrimersPanel';
import RealiseModal from './RealiseModal';
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
  const [realiseOpen, setRealiseOpen] = useState(false);
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

  // K4 — drag a container from the sidebar; drop anywhere on the viewer
  // inserts a full-length segment at the caret-nearest boundary, then
  // auto-opens the detail panel to trim range / RC.
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
    const before = (draft.segments || []).map((s) => s.id);
    actions.insertSegment(draftId, containerId, 0, (c.sequence || '').length, false, atIndex);
    // Auto-select the freshly-inserted segment for range adjust.
    setTimeout(() => {
      const after = (state.assemblyDrafts || []).find((d) => d.id === draftId);
      const fresh = after && after.segments.find((s) => !before.includes(s.id));
      if (fresh) openDetail(fresh.id);
    }, 0);
  }, [state.containers, state.assemblyDrafts, boundaries, draft.segments, actions, draftId, openDetail]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    dropPosRef.current = caretPos;
  }, [caretPos]);

  const onInsertFromPicker = useCallback(({ containerId, start, end, rc }) => {
    actions.insertSegment(draftId, containerId, start, end, rc, undefined);
    setPickerOpen(false);
  }, [actions, draftId]);

  const onInsertGap = useCallback((params) => {
    actions.insertManualSegment(draftId, params, undefined);
    setGapOpen(false);
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
        </div>

        <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <AssemblySidebar containers={state.containers || []} />
          <AssemblyPrimersPanel draftId={draftId} />
        </div>

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
      />

      <AssemblyToolbar
        onAddSegment={() => setPickerOpen(true)}
        onAddGap={() => setGapOpen(true)}
      />

      {pickerOpen && (
        <AssemblySourcePicker
          containers={state.containers || []}
          onInsert={onInsertFromPicker}
          onCancel={() => setPickerOpen(false)}
        />
      )}
      {gapOpen && (
        <InsertGapModal
          onInsert={onInsertGap}
          onCancel={() => setGapOpen(false)}
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
