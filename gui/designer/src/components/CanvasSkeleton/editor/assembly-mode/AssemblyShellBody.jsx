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
import { segmentOverhangs, junctionInterlock, terminalStagger } from '../../lib/segment-overhangs';
import { assemblyEndChemistry } from '../../lib/end-chemistry';
import { assemblyRestrictionCloning } from '../../lib/restriction-cloning';
import { junctionSeamView, seamFrameForBoundary } from '../../lib/junction-seam';
import { TRANSLATABLE_TYPES } from '../../../SequenceView/constants';
import { verifyAssembly } from '../../lib/assembly-verify';
import { RE_ENZYMES } from '../../../../restriction-db';
import AssemblyHeader from './AssemblyHeader';
import AssemblySidebar from './AssemblySidebar';
import AssemblySegmentBar from './AssemblySegmentBar';
import SegmentList from './SegmentList';
// V94 / C3 (audit) — SegmentDetailPanel deleted (its range/RC/colour/label/delete
// функции inline в SegmentList rows via chevron-expand).
import AssemblyToolbar from './AssemblyToolbar';
// SPEC_ASSEMBLY_PICKER_UNIFICATION — one library picker for both surfaces;
// bespoke assembly-only pickers were removed.
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
  enrichZonesWithJunctions, assemblyReadiness, assemblyJunctionConflicts, methodsFromJunctions,
  pairKeyFor, junctionKindForMethod, DEFAULT_JUNCTION_METHOD,
} from '../../lib/junction-derive';
import { applyClosure } from '../../lib/circularize-apply';
import CircularizeModal from './CircularizeModal';
import { suggestMethodForBoundary } from '../../lib/assembly-realise-suggest';
import JunctionControl from '../../canvas/JunctionControl';
import { useSequenceSelection } from '../../../../hooks/useSequenceSelection';
import { SYNTHESIS_THRESHOLD_DEFAULT } from '../../lib/assembly-edit-router';
import { useAssemblyEdit } from './useAssemblyEdit';
import { assemblyMutationPlan } from '../../lib/assembly-mutation-plan';
import { deriveAssemblyPrimerRecords } from '../../lib/derived-primer-records';
import { buildMutagenesisOpPayload } from '../../lib/derived-mutagenesis-op';
import { STRINGS } from '../../../../lib/strings';
// Inline file-import for the picker (Игорь 17.06.2026): parse a dropped
// .gb/.fasta/.dna here (the picker stays presentational) → add to the
// library → immediately usable as a segment source.
import { handleFilesImport } from '../../../../file-import';
import { buildEntriesFromImportResults } from '../../../Library/lib/build-library-entry';

const EA = STRINGS.canvasSkeleton.editableAssembly;
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
  const addLibraryEntry = useStore((s) => s.addLibraryEntry);
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

  // RC-B2 — pinned reading frame (RC-B1) so the junction-seam readout can show
  // the AA that straddles each join + flag a premature stop. null → bases only.
  const overrideFrame = useStore((s) => (s.sequenceView ? s.sequenceView.overrideFrame : null));

  const coloredZones = useMemo(() => {
    // Per-segment overhangs computed once so a boundary can compare its LEFT
    // segment's RIGHT end against its RIGHT segment's LEFT end (V160 стык).
    const ovr = draft.segments.map((s) => segmentOverhangs(s, RE_ENZYMES));
    const base = boundaries.map((b, i) => ({
      zoneId: b.segmentId,
      start: b.startOnAssembly,
      end: b.endOnAssembly,
      color: b.color,
      label: segLabel(draft.segments[i], i),
      isOrphan: orphanIds.has(b.segmentId),
      // S5 (V165) — visual tracking: how each fragment is obtained + where from,
      // so the bar reads as a multi-source build at a glance.
      acquisitionMethod: (draft.segments[i] && draft.segments[i].acquisitionMethod) || 'undefined',
      sourceName: (draft.segments[i] && draft.segments[i].source && draft.segments[i].source.sourceContainerName) || '',
      // «Липкие концы» в сборке (Игорь): RE-cut сегмент несёт оверхенги на
      // концах — SegmentZonesOverlay рисует ступеньку + чип «5′ AATT».
      reOverhangs: ovr[i],
      // V160 «визуализировать стык» — interlock of THIS segment's right end with
      // the NEXT segment's left end: do the two sticky ends mate (совместимы)?
      // SegmentZonesOverlay draws the seam (ступеньки сцепляются) + verdict.
      interlock: i < boundaries.length - 1
        ? junctionInterlock(ovr[i] && ovr[i].right, ovr[i + 1] && ovr[i + 1].left)
        : null,
      // RC-B2 (Игорь 24.06) «визуализировать на стыке нуклеотидный сиквенс» —
      // the actual bases of the join + the codon/AA that straddles it. RC-BIO-2:
      // the seam reading frame is the frame of the CDS/gene that SPANS the seam
      // (codons anchored at the CDS start), not the global product-0 override — a
      // «STOP across the join» is only meaningful in the real CDS frame. Falls back
      // to the manual override (or null) when no CDS spans the boundary.
      seam: i < boundaries.length - 1
        ? junctionSeamView({
          seq: sequence,
          boundaryPos: b.endOnAssembly,
          window: 6,
          frame: seamFrameForBoundary(assemblyAnnotations, b.endOnAssembly, TRANSLATABLE_TYPES, overrideFrame),
        })
        : null,
    }));
    // JUNCTION step-2 FIX — enrich each internal boundary with a junctionRight
    // (method/kind from zone.junctions) so SegmentZonesOverlay draws the
    // clickable junction glyph on the editor strip. Legacy drafts (no zone)
    // stay plain → no glyph.
    return isZoneTarget ? enrichZonesWithJunctions(base, zoneJunctions, assemblyMethod) : base;
  }, [boundaries, draft.segments, orphanIds, isZoneTarget, zoneJunctions, assemblyMethod, sequence, overrideFrame, assemblyAnnotations]);

  // «Физическая ступенька» (Игорь 22.06): the LINEAR construct's free ENDS carry
  // the first segment's LEFT overhang + the last segment's RIGHT overhang → the
  // viewer staggers the bottom strand at those termini (reuses the same
  // segmentOverhangs model the seam + gate use). Circular = no free ends → null.
  const constructTerminalStagger = useMemo(() => {
    if (draft.topology?.circular) return null;
    const segs = draft.segments || [];
    if (!segs.length) return null;
    const first = terminalStagger(segs[0], RE_ENZYMES);
    const last = terminalStagger(segs[segs.length - 1], RE_ENZYMES);
    const left = first ? first.left : null;
    const right = last ? last.right : null;
    return (left || right) ? { left, right } : null;
  }, [draft.segments, draft.topology]);
  // RC-BIO-3 — the CIRCULAR closure seam (last fragment's right end ↔ first
  // fragment's left end) is a real ligation junction that must mate too, but it is
  // not an adjacent-zone boundary so it's evaluated separately and fed to readiness.
  // Without this, a circular RE build whose ring can't close would report «ready».
  const closureSeam = useMemo(() => {
    const segs = (draft && draft.segments) || [];
    // RC-CLOSE-GATE (Игорь 25.06) — also compute for a SINGLE-fragment self-closure
    // (segs.length === 1): the ring is the fragment's own two ends (right ↔ left),
    // which must mate too. Previously gated `< 2`, so a self-closure of an RE
    // fragment with non-mating ends (blunt + sticky) reported «ready». The closure
    // METHOD still decides whether the mismatch blocks (closureBlocks → only
    // re_ligation / blunt ligation; overlap/KLD/Gibson rework the ends).
    if (!(draft.topology && draft.topology.circular) || segs.length < 1) return null;
    const ovr = segs.map((s) => segmentOverhangs(s, RE_ENZYMES));
    const last = segs.length - 1;
    const pairKey = pairKeyFor(segs[last].id, segs[0].id);
    const cfg = zoneJunctions[pairKey];
    // RC-SEP (Игорь 25.06) — the closure reaction is ONE assembly property
    // (draft.closureMethod, set via the header «Замыкание» button), decoupled from the
    // internal-fuse method (assemblyMethod / overlap_pcr) and surviving the finalizer's
    // zone.junctions reset. Default: 1-fragment self-closure → KLD, multi-fragment ring
    // → Gibson (mirrors methodsFromJunctions). A legacy per-closure junction cfg still
    // wins if present (back-compat).
    const closureDefault = segs.length === 1 ? 'kld' : 'gibson';
    const method = (cfg && cfg.method) || draft.closureMethod || closureDefault;
    return {
      interlock: junctionInterlock(ovr[last] && ovr[last].right, ovr[0] && ovr[0].left),
      kind: junctionKindForMethod(method),
      method,
      pairKey,
      selfClosure: segs.length === 1,
      leftLabel: segLabel(segs[last], last),
      rightLabel: segLabel(segs[0], 0),
    };
  }, [draft.segments, draft.topology, zoneJunctions, assemblyMethod]);

  // UX slice 4 — one readiness summary for the whole assembly (+ RC-BIO-3 closure).
  const readiness = useMemo(() => assemblyReadiness(coloredZones, closureSeam), [coloredZones, closureSeam]);
  // RC-D1 (Игорь 24.06) — name WHICH seams don't mate, so a 3-/4-fragment build
  // tells the biolog exactly which junction to fix, not just a count (+ closure).
  const junctionConflicts = useMemo(() => assemblyJunctionConflicts(coloredZones, closureSeam), [coloredZones, closureSeam]);
  // S2 (V162) — derived end-chemistry: which fragment ends ship 5′-OH into a
  // ligation (need T4 PNK) and which junctions lack a chosen enzyme. Pure,
  // read-only; never touches stored ranges / tails / product (bio-safe).
  const endChem = useMemo(
    // CH-3 — feed the ring-closure / self-closure seam so a blunt/KLD-closed ring
    // (or a 1-fragment self-closure) also counts toward the T4-PNK phosphorylation
    // verdict. closureSeam is null for linear builds → unchanged.
    () => assemblyEndChemistry(draft.segments, zoneJunctions, assemblyMethod, RE_ENZYMES, closureSeam),
    [draft.segments, zoneJunctions, assemblyMethod, closureSeam],
  );
  // S3 (V163) — RE-cloning chemistry: per-fragment double-digest staging
  // (sequential when buffers/temps differ) + directional vs self-ligation
  // (→ dephosphorylate the vector). Pure, read-only (bio-safe).
  const reCloning = useMemo(
    () => assemblyRestrictionCloning(draft.segments, RE_ENZYMES),
    [draft.segments],
  );
  // S4 (V164) — ONE transparent verdict: «buildable + why-not», aggregating
  // S1/S2/S3 into blockers (un-buildable) + warnings (protocol guidance). The
  // single source of truth for the readiness line, protocol, and build-plan.
  const verify = useMemo(
    () => verifyAssembly({ readiness, endChem, reCloning }),
    [readiness, endChem, reCloning],
  );

  // Selection via shared hook (SPEC_VIEWER_UNIFICATION). reBehavior:
  // 'off' — assembled view has coloured zones, no RE pair/cut here.
  const sel = useSequenceSelection({ initialCaret: 0, reBehavior: 'off' });
  const { caretPos, caretAnchor } = sel;
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // K5 — range-picker context: { kind:'entry'|'container', payload, atIndex? }.
  const [rangeSource, setRangeSource] = useState(null);
  // K7 — grouping: per-zone-piece selection + OpGroupPicker open state.
  const [selectedSegmentIds, setSelectedSegmentIds] = useState(() => new Set());
  const [groupPickerIds, setGroupPickerIds] = useState(null);
  // K14 — mutation modal context: { pieceId, fromBase, position } | null.
  const [mutationFor, setMutationFor] = useState(null);
  // RC-SEP — closure-reaction modal open state (opened from the header «Замыкание»
  // button, circular only).
  const [circularizeOpen, setCircularizeOpen] = useState(false);

  // RC-SEP (Игорь 25.06) — TOPOLOGY is set directly here from the header toggle, fully
  // decoupled from the closure reaction + internal junctions. Routes a zone to
  // SET_ZONE_TOPOLOGY, a legacy assembly-draft to setAssemblyDraftTopology.
  const onSetTopology = useCallback((circular) => {
    if (isZoneTarget && typeof actions.zoneDispatch === 'function') {
      actions.zoneDispatch({ type: 'SET_ZONE_TOPOLOGY', zoneId: draftId, circular: !!circular });
    } else if (typeof actions.setAssemblyDraftTopology === 'function') {
      actions.setAssemblyDraftTopology(draftId, !!circular);
    }
  }, [actions, draftId, isZoneTarget]);

  // RC-SEP — apply ONLY the closure reaction (the ring-closing last→first / self-closure
  // junction). Internal junctions stay on the strip ромбы; topology is the toggle above.
  const onClosureConfirm = useCallback(({ method, enzyme }) => {
    setCircularizeOpen(false);
    applyClosure(actions, {
      draftId, method, enzyme, segments: draft.segments,
    });
  }, [actions, draftId, draft.segments]);

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
    // S1 (V161) — defensive: never realise a chemically-impossible construct
    // (an incompatible sticky-end junction). The button is already disabled, but
    // a programmatic call must bail too.
    if (readiness.incompatible > 0) return;
    const boundaryCount = segs.length - 1;
    const suggestions = [];
    for (let i = 0; i < boundaryCount; i += 1) {
      suggestions.push(suggestMethodForBoundary(state, draftId, i));
    }
    const methods = methodsFromJunctions(draft, zoneJunctions, suggestions);
    actions.realiseAssembly(draftId, methods);
  }, [draft, state, draftId, zoneJunctions, actions, readiness]);
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

  // §5.2/§5.8 — the edit→piece-op router + primer/caret maintenance lives in
  // useAssemblyEdit now (size-budget §7); behaviour identical.
  const { onSequenceEdit } = useAssemblyEdit({
    draft, boundaries, threshold, actions, statePieces: state.pieces, draftId, sel,
  });
  // Edit-driven mutagenesis (Кирпич 2) — for every segment carrying in-editor
  // substitutions, derive the molecular MECHANISM (KLD vs overlap-extension)
  // + ⚓ No-PCR viability. Pure read; Кирпич 3 realises it onto the canvas.
  // Кирпич 4 — expert mechanism override (KLD ↔ overlap-extension); null = auto.
  const [mechOverride, setMechOverride] = useState(null);
  const mutationPlan = useMemo(
    () => assemblyMutationPlan(draft, { forceStrategy: mechOverride }),
    [draft, mechOverride],
  );
  // 3b — derive the designed primers into the assembly primer-pool, tagged with
  // project + assembly provenance (Игорь: «отметка отношения к проекту и
  // сборке»). Reuses the existing pool — не плодит сущности.
  const onDeriveReaction = useCallback((seg) => {
    if (!seg) return;
    // (a) designed primers → assembly pool, tagged with project + assembly.
    if (Array.isArray(seg.primers) && seg.primers.length > 0) {
      const b = boundaries.find((x) => x.segmentId === seg.segmentId);
      const anchorPos = (b ? b.startOnAssembly : 0) + (seg.anchorLocalPos || 0);
      const records = deriveAssemblyPrimerRecords(seg.primers, {
        draftId,
        anchorPos,
        provenance: {
          kind: 'derived-mutagenesis',
          projectId: currentProjectId || null,
          assemblyId: draftId,
          mechanism: seg.mechanism,
        },
      });
      if (records.length > 0) actions.addDerivedAssemblyPrimers(draftId, records);
    }
    // (b) the op_mutagenesis NODE on the canvas, derived from the edit.
    const ds = (draft.segments || []).find((s) => s.id === seg.segmentId);
    const opPayload = buildMutagenesisOpPayload({
      templateId: ds && ds.source && ds.source.containerId,
      mutations: (ds && ds.mutations) || [],
    });
    if (opPayload && typeof actions.deriveMutagenesisOp === 'function') {
      actions.deriveMutagenesisOp(opPayload);
    }
  }, [boundaries, draftId, currentProjectId, actions, draft.segments]);

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
  // step 2). The shared library search remains; materialise happens at
  // range-confirm so the picker is purely pre-flight.
  const onPickEntry = useCallback((entry) => {
    if (!entry || !entry.id) return;
    setPickerOpen(false);
    setRangeSource({ kind: 'entry', payload: entry });
  }, []);

  // RangePicker confirm: materialise (for an entry) OR reuse the
  // existing canvas container id, then insert a sourced segment with
  // the chosen [start, end, rc]. For the entry path the fresh container
  // id is recovered via snapshot-diff on the *latest* state (stateRef).
  const onRangeConfirm = useCallback(({
    start, end, rc, acquisitionMethod, acquisitionParams, ranges,
  }) => {
    if (!rangeSource) return;
    // V89 — picker says как фрагмент был выбран; пробрасываем в action
    // как opts, чтобы piece получил `acquisitionMethod='restriction'`
    // (или другую отметку) и auto-grouping/junction-derivation потом
    // дефолтили на ligation-junction для RE-pieces.
    // V157 — + RE enzymes/cut sites so the piece's acquisitionParams are
    // non-empty (piece-invariants requires it for 'restriction').
    const opts = { acquisitionMethod, acquisitionParams, ranges };
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

  // RC-A2 (Игорь 24.06) — the enzymes that cut the PREVIOUS RE fragment of this
  // assembly, handed to the picker so it can suggest «продолжить теми же
  // рестриктазами» (or a compatible overhang, or adding the site via a primer
  // tail) on the fragment being added. Take the most recent restriction segment.
  const priorEnzymes = useMemo(() => {
    const segs = (draft && draft.segments) || [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const ap = s && s.acquisitionParams;
      if (s && s.acquisitionMethod === 'restriction' && ap && Array.isArray(ap.enzymes) && ap.enzymes.length) {
        return Array.from(new Set(ap.enzymes.filter(Boolean)));
      }
    }
    return [];
  }, [draft]);

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

  // Inline file-import (Игорь «нужна возможность импортировать файл прямо
  // тут, иначе человек обязан идти в библиотеку»). Parse the dropped/
  // picked files → add each as a library entry (so it persists + shows in
  // the picker) → for a single import, jump straight into the range-picker
  // (immediate use, «не два клика»); for several, leave them in the
  // collection for the biolog to pick. .dna needs the Python backend —
  // handleFilesImport surfaces a per-file error which we toast.
  const handleImportFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    actions.showToast({ kind: 'info', message: 'Импортирую…' });
    let items;
    try {
      items = await handleFilesImport(files, { autoAnnotate: true });
    } catch (e) {
      actions.showToast({ kind: 'error', message: e?.message || 'Ошибка импорта' });
      return;
    }
    const { entries, errors } = buildEntriesFromImportResults(items);
    for (const er of errors) {
      actions.showToast({ kind: 'error', message: `${er.name}: ${er.error}` });
    }
    if (entries.length === 0) return;
    for (const entry of entries) {
      try { await addLibraryEntry(entry); } catch { /* dexie write — non-fatal */ }
    }
    setPickerOpen(false);
    if (entries.length === 1) {
      // Straight into the range-picker — same path a library click takes.
      onPickEntry(entries[0]);
    } else {
      actions.showToast({ kind: 'success', message: `Импортировано: ${entries.length} (в коллекции)` });
    }
  }, [actions, addLibraryEntry, onPickEntry]);

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
        canRealise={(draft.segments.length >= 2
          || (draft.segments.length === 1 && !!(draft.topology && draft.topology.circular)))
          /* S1 (V161) — block Realise while any junction's sticky ends don't mate. */
          && readiness.incompatible === 0}
        onRename={(name) => actions.renameAssemblyDraft(draftId, name)}
        onRealise={onRealise}
        /* RC-SEP — topology toggle (direct) + closure button (circular only, opens
           the closure-reaction modal). Internal junctions are the strip ромбы. */
        onSetTopology={onSetTopology}
        closureMethod={closureSeam ? closureSeam.method : null}
        onOpenClosure={() => setCircularizeOpen(true)}
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
                onImportFiles={handleImportFiles}
              />
            </div>
          ) : (
            <>
              {/* UX slice 4 — one readiness line: settled vs N defaults to check.
                  RC-CLOSE-GATE — also show it when a CLOSURE (incl. a 1-fragment
                  self-closure, which has no internal junction so total===0) is
                  incompatible, so the block has a visible reason, not just a greyed
                  Realise button. */}
              {isZoneTarget && (readiness.total > 0 || readiness.incompatible > 0) && (
                <div
                  data-testid="assembly-readiness"
                  data-incompatible={readiness.incompatible || 0}
                  data-needs-phos={endChem.needsPhosphorylationCount || 0}
                  data-sequential={reCloning.sequentialDigestCount || 0}
                  data-dephos={reCloning.dephosphorylationCount || 0}
                  data-buildable={verify.buildable ? 'true' : 'false'}
                  data-warnings={verify.warnings.length}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', marginBottom: 8, fontSize: 11.5,
                    borderRadius: 'var(--radius-md)',
                    // S1 (V161) — incompatible sticky ends (red) outrank the
                    // trust-state line: the construct can't ligate, so «готово»
                    // must not show.
                    color: readiness.incompatible > 0
                      ? 'var(--danger, #dc2626)'
                      : readiness.ready ? 'var(--emerald, #4A7C59)' : 'var(--text-secondary)',
                    background: 'var(--surface-2)', border: '0.5px solid var(--border-subtle)',
                  }}
                >
                  {readiness.incompatible > 0
                    ? `⚠ Несовместимые липкие концы на ${readiness.incompatible} стык(е/ах) — сборка невозможна`
                    : readiness.ready
                      ? '✓ Все стыки заданы — готово к сборке'
                      : `${readiness.tentative} стык(ов) по умолчанию — проверьте`}
                  {readiness.incompatible === 0 && readiness.differs > 0 ? ` · ${readiness.differs} отличается от сборки` : ''}
                  {/* S4 — ONE consolidated protocol-guidance line (amber, non-
                      blocking): phosphorylation / sequential digest / dephospho /
                      unresolved enzyme. «tentative» stays in the headline above. */}
                  {verify.warnings.filter((w) => w.kind !== 'tentative').length > 0 && (
                    <span
                      data-testid="assembly-verify-warnings"
                      style={{ color: 'var(--amber, #b8860b)', marginLeft: 2 }}
                    >· {verify.warnings.filter((w) => w.kind !== 'tentative').map((w) => w.message).join(' · ')}</span>
                  )}
                  {/* RC-D1 — name the exact incompatible seams (which junction to fix)
                      so a 3-/4-fragment build is actionable, not just «N стыков». */}
                  {junctionConflicts.length > 0 && (
                    <ul
                      data-testid="assembly-conflict-list"
                      /* flexBasis:100% — the readiness row is display:flex/align-center,
                         so the list must break onto its OWN line below the headline
                         (else the bullets squash inline). RC-D1 review. */
                      style={{ flexBasis: '100%', width: '100%', margin: '4px 0 0', padding: '0 0 0 16px', listStyle: 'disc', color: 'var(--danger, #dc2626)' }}
                    >
                      {junctionConflicts.map((c) => (
                        <li key={c.pairKey || c.index} data-pair-key={c.pairKey || ''} style={{ fontSize: 10.5 }}>
                          {c.leftLabel} → {c.rightLabel}: {c.message}
                          {/* RC-ORIENT — don't make the user guess orientation: if
                              flipping the next fragment would mate the ends, say so. */}
                          {c.flipFix && (
                            <span
                              data-testid="assembly-conflict-flip-hint"
                              data-flip-label={c.flipFix.label}
                              style={{ color: 'var(--accent-600, #b85c3e)', fontWeight: 600, marginLeft: 4 }}
                            >
                              ↻ совместимо, если перевернуть «{c.flipFix.label}»
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {/* Кирпич 2 — edit-driven mutagenesis: the derived molecular
                  mechanism (KLD vs overlap-extension) for in-editor edits.
                  Renders independent of readiness.total (a single edited
                  plasmid has no junctions but still has a mechanism). */}
              {mutationPlan.count > 0 && (
                <div
                  data-testid="assembly-mutation-mechanism"
                  data-mechanism={mutationPlan.perSegment[0].mechanism}
                  data-mech-blocked={mutationPlan.anyBlocker ? 'true' : 'false'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', marginBottom: 8, fontSize: 11.5,
                    borderRadius: 'var(--radius-md)',
                    color: mutationPlan.anyBlocker ? 'var(--danger, #dc2626)' : 'var(--text-secondary)',
                    background: 'var(--surface-2)', border: '0.5px solid var(--border-subtle)',
                  }}
                >
                  <span>
                    {'Правка → механика: '}
                    {mutationPlan.perSegment[0].label.full}
                    {mutationPlan.count > 1 ? ` (+${mutationPlan.count - 1})` : ''}
                  </span>
                  {mutationPlan.perSegment[0].primerCount > 0 && (
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {`· праймеры: ${mutationPlan.perSegment[0].primerCount}`}
                    </span>
                  )}
                  {mutationPlan.perSegment[0].protocol && (
                    <span
                      title={mutationPlan.perSegment[0].protocol}
                      style={{
                        color: 'var(--text-tertiary)', maxWidth: 360,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {`· протокол: ${mutationPlan.perSegment[0].protocol}`}
                    </span>
                  )}
                  <button
                    type="button"
                    data-testid="assembly-derive-primers-btn"
                    onClick={() => onDeriveReaction(mutationPlan.perSegment[0])}
                    style={{
                      marginLeft: 'auto', fontSize: 11, padding: '3px 8px',
                      borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                      background: 'var(--surface-1)', color: 'var(--text-primary)',
                      border: '0.5px solid var(--border-subtle)', whiteSpace: 'nowrap',
                    }}
                  >Вывести реакцию</button>
                  {/* Кирпич 4 — swap mechanism (KLD valid only on a circular
                      standalone template; overlap is always available). */}
                  {(mutationPlan.perSegment[0].mechanism === 'kld' || mutationPlan.perSegment[0].canKld) && (
                    <button
                      type="button"
                      data-testid="assembly-mech-swap-btn"
                      onClick={() => setMechOverride(
                        mutationPlan.perSegment[0].mechanism === 'kld' ? 'two_fragment' : 'kld',
                      )}
                      title="Сменить механику сборки (KLD ↔ overlap-extension)"
                      style={{
                        marginLeft: 6, fontSize: 11, padding: '3px 8px',
                        borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                        background: 'transparent', color: 'var(--text-secondary)',
                        border: '0.5px solid var(--border-subtle)', whiteSpace: 'nowrap',
                      }}
                    >{mutationPlan.perSegment[0].mechanism === 'kld' ? '⇄ overlap' : '⇄ KLD'}</button>
                  )}
                  {mutationPlan.anyBlocker && (
                    <span style={{ color: 'var(--danger, #dc2626)' }}>
                      {'· '}
                      {mutationPlan.perSegment.find((p) => p.blockers.length > 0).blockers[0].message}
                    </span>
                  )}
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
                terminalStagger={constructTerminalStagger}
                closureSeam={closureSeam}
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
        endChemBySegment={endChem.perSegment}
        reCloningBySegment={reCloning.perSegment}
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
          // V197 — a whole-plasmid KLD (circular + single segment) carries an interior
          // mutation via back-to-back mutagenic primers, so suppress the false «oligos
          // amplify wild-type» interior warning for that case.
          kldApplies={!!(draft.topology && draft.topology.circular) && (draft.segments || []).length === 1}
          onConfirm={(m) => {
            actions.addPieceMutation(mutationFor.pieceId, m);
            setMutationFor(null);
          }}
          onCancel={() => setMutationFor(null)}
        />
      )}

      {/* RC-SEP — closure-reaction picker (ring-forming chemistry only). Opened from
          the header «Замыкание» button, which is itself shown only when circular. */}
      {circularizeOpen && (
        <CircularizeModal
          draft={draft}
          closureMethod={closureSeam ? closureSeam.method : null}
          onConfirm={onClosureConfirm}
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
              onImportFiles={handleImportFiles}
            />
          </div>
        </div>
      )}
      {rangeSource && rangeSourceShape && (
        <RangePickerModal
          source={rangeSourceShape}
          priorEnzymes={priorEnzymes}
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
