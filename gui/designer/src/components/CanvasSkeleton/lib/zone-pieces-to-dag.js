/**
 * zone-pieces-to-dag — T6 K5 (DEC-T6-04/05/15). The A4 reverse-DAG
 * realise algorithm, rewritten to read 4-tier pieces from a zone.
 *
 * `realiseAssembly(state, targetId, perBoundaryMethods, opts)` keeps the
 * exact legacy signature + return shape. Dual-resolution:
 *  - targetId matches state.zones[id]  → build a draft-like from
 *    state.pieces filtered by zoneId (ordered by createdAt).
 *  - else targetId matches state.assemblyDrafts[id] → legacy draft
 *    (kept working through the T6 transition window, R-T6-4).
 *
 * The reverse-DAG core (N PCR ops + N-1 boundary junctions + N+1
 * containers + primer attachments + line layout) is unchanged from the
 * A4 implementation — only the input resolution differs.
 */
import { v7 as uuidv7 } from 'uuid';
import { reverseComplement } from '../../../sequence-utils';
import { computeAssemblySequence, concatSegmentAnnotations } from './assembly-model';
import { transferAnnotations } from './segment-annotation-transfer';
import { applyPieceMutations } from './piece-mutations';
import { defaultJunctionParams, inferEndRequirements } from '../canvas/junction-styles';

// Engine method dict → junction.kind (palette / glyph / inferEndRequirements).
// Exported so junction-derive (the JUNCTION pairKey/seed home) reuses one map
// (carry-note §9a — no second copy).
export const METHOD_TO_JUNCTION = {
  overlap_pcr: 'overlap',
  gibson: 'overlap',
  golden_gate: 'golden_gate',
  restriction: 're_ligation',
  direct_ligation: 'ligation',
  kld: 'kld',
};

// The assembly method → the kind of the single assembly OPERATION (the one-pot
// reaction joining the fragments). One colour per op type (op-colors канон).
const METHOD_TO_OP_KIND = {
  overlap_pcr: 'gibson',
  gibson: 'gibson',
  golden_gate: 'golden_gate',
  restriction: 'restriction',
  direct_ligation: 'ligate',
  kld: 'kld',
};

/**
 * Fix B — pull the realised ops' pre-existing source containers into the zone
 * (zoneId + unpinned) so they render as the op inputs (source→PCR→frag). Frag /
 * product diff containers aren't in `containers` yet → untouched. Pure; returns
 * the same array ref when nothing changes / no zone. (Extracted so the
 * skeleton-state router stays under the .js hard budget.)
 */
export function tagZoneSources(containers, diffOperations, zoneTag) {
  if (!zoneTag) return containers;
  const sourceIds = new Set((diffOperations || []).flatMap((o) => o.inputs || []));
  let changed = false;
  const out = (containers || []).map((c) => {
    if (c && sourceIds.has(c.id)) { changed = true; return { ...c, zoneId: zoneTag, pinned: false }; }
    return c;
  });
  return changed ? out : containers;
}

/**
 * pruneZoneRealiseOutput — drop a zone's PRIOR realise output so re-realising
 * REGENERATES the DAG instead of stacking a duplicate (Игорь 11.06: «сборка
 * дублируется»). Every realise-created op/container tags `origin.assemblyId`;
 * junctions tag `realisedFrom.assemblyId`. Source containers carry no such tag,
 * so they survive. Zone-only — legacy assemblyDrafts keep their multi-revision
 * accumulation (a design-variant feature, DEC-REAL-08). Returns the SAME slice
 * refs when there is nothing to prune (first realise).
 */
export function pruneZoneRealiseOutput(state, zoneId) {
  const mine = (e) => e && e.origin && e.origin.assemblyId === zoneId;
  const goneC = new Set((state.containers || []).filter(mine).map((c) => c.id));
  const goneO = new Set((state.operations || []).filter(mine).map((o) => o.id));
  if (goneC.size === 0 && goneO.size === 0) {
    return {
      containers: state.containers,
      operations: state.operations,
      junctions: state.junctions,
      positions: state.positions,
    };
  }
  const positions = { ...(state.positions || {}) };
  for (const id of goneC) delete positions[id];
  for (const id of goneO) delete positions[id];
  return {
    containers: (state.containers || []).filter((c) => !goneC.has(c.id)),
    operations: (state.operations || []).filter((o) => !goneO.has(o.id)),
    junctions: (state.junctions || []).filter(
      (j) => !(j.realisedFrom && j.realisedFrom.assemblyId === zoneId),
    ),
    positions,
  };
}

const LAYOUT_Y = 480;
const STEP_X = 280;

export function nameWithRevision(base, revision) {
  return revision > 1 ? `${base}-r${revision}` : base;
}

function junctionForMethod(method, fromId, toId) {
  const kind = METHOD_TO_JUNCTION[method] || 'overlap';
  const params = defaultJunctionParams(kind);
  if (method === 'gibson') params.overlapLength = Math.max(params.overlapLength || 0, 30);
  return {
    id: `jun-${uuidv7()}`,
    fromContainerId: fromId,
    toContainerId: toId,
    kind,
    autoDetectedKind: kind,
    status: 'manual',
    overlapTarget: params.overlapTarget,
    overlapLength: params.overlapLength,
    overlapTm: params.overlapTm,
    endRequirements: inferEndRequirements(kind, params.overlapTarget, params.overlapLength),
    realisedFrom: null,
  };
}

function mapPrimersForSegment(primers, seg) {
  // V130 (A6) — match the canonical auto-group record by `source.pieceId`
  // regardless of kind (in draftFromZone the segment id === piece id, and the
  // auto-group primer carries `source.pieceId`). Without this, auto-group
  // primers (which carry the overlap/GG/RE tails) miss the whitelist and
  // realise falls back to the tailless autoPrimerPair → blunt ends. The
  // legacy segment/boundary match stays as fallback for manual primers.
  const fwd = primers.find((p) => p.direction === 'forward' && p.source && (
    p.source.pieceId === seg.id
    || (p.source.kind === 'segment' && p.source.segmentId === seg.id)
    || (p.source.kind === 'boundary' && p.source.leftSegmentId === seg.id)));
  const rev = primers.find((p) => p.direction === 'reverse' && p.source && (
    p.source.pieceId === seg.id
    || (p.source.kind === 'segment' && p.source.segmentId === seg.id)
    || (p.source.kind === 'boundary' && p.source.rightSegmentId === seg.id)));
  if (!fwd && !rev) return null;
  return {
    forward: fwd ? fwd.sequence : '',
    reverse: rev ? rev.sequence : '',
    fwdBinding: fwd ? fwd.bindingSequence : '',
    revBinding: rev ? rev.bindingSequence : '',
    fwdTm: fwd ? fwd.tm : 0,
    revTm: rev ? rev.tm : 0,
    source: 'assembly',
  };
}

function autoPrimerPair(seq) {
  const s = String(seq || '');
  const n = Math.min(20, s.length);
  return {
    forward: s.slice(0, n),
    reverse: reverseComplement(s.slice(Math.max(0, s.length - n))),
    fwdTm: 0,
    revTm: 0,
    source: 'auto',
  };
}

/**
 * Build a legacy draft-like {id,name,topology,segments[],...} from a
 * zone's pieces. Each sourced piece → a container-source segment with
 * its sequence reconstructed off the source container (RC on reverse);
 * a missing source container is flagged `source.unavailable` so
 * computeAssemblySequence reports it as an orphan. A gap piece → a
 * sequence-less manual segment (blocks realise like a legacy gap).
 */
export function draftFromZone(state, zone) {
  const containers = state.containers || [];
  const pieces = (state.pieces || [])
    .filter((p) => p.zoneId === zone.id)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const segments = pieces.map((p) => {
    if (p.kind === 'gap') {
      // V83 — a known gap sequence (linker/custom) is preserved; only a
      // sequence-less gap renders as N×length downstream.
      const gseq = (typeof p.gapSequence === 'string' && p.gapSequence.length > 0)
        ? p.gapSequence : '';
      return {
        id: p.id,
        source: { type: 'manual' },
        reverseComplement: false,
        sequence: gseq,
        length: gseq ? gseq.length : (p.gapLength || 0),
        gapKind: gseq ? 'known' : (p.gapHint || 'unknown'),
        label: p.name,
        pieceKind: 'gap',
        groupId: p.groupId || null,
        groupLayer: typeof p.groupLayer === 'number' ? p.groupLayer : 0,
        annotations: [],
      };
    }
    // M-CANVAS-WORKFLOW-UX K6 — inline-sequence kinds (snippet /
    // synthesis / intermediate). Render as manual segments carrying the
    // inline sequence; SegmentList uses pieceKind for the icon.
    if (p.kind === 'snippet' || p.kind === 'synthesis' || p.kind === 'intermediate') {
      const seq = typeof p.sequence === 'string' ? p.sequence : '';
      return {
        id: p.id,
        source: { type: 'manual' },
        reverseComplement: false,
        sequence: seq,
        length: seq.length,
        label: p.name,
        pieceKind: p.kind,
        groupId: p.groupId || null,
        groupLayer: typeof p.groupLayer === 'number' ? p.groupLayer : 0,
        annotations: [],
      };
    }
    const r = (p.ranges && p.ranges[0]) || {};
    const c = containers.find((x) => x.id === r.sourceId);
    const raw = c ? String(c.sequence || '').slice(r.start, r.end) : '';
    const rcSeq = r.orientation === 'reverse' ? reverseComplement(raw) : raw;
    // S2 §5.4 — apply mutations to the (post-rc) top-strand so the
    // assembled view shows the edited base, not the wild-type one.
    const seq = applyPieceMutations(rcSeq, p.mutations);
    return {
      id: p.id,
      source: {
        type: 'container',
        containerId: r.sourceId,
        sourceContainerName: c ? c.name : '',
        ...(c ? {} : { unavailable: true }),
      },
      start: r.start,
      end: r.end,
      reverseComplement: r.orientation === 'reverse',
      sequence: seq,
      length: seq.length,
      color: p.color,
      label: p.name,
      pieceKind: 'sourced',
      // K6 — pass through per-piece mutations so SegmentList can show
      // the 💎 badge / K14 mutation entry can edit them.
      mutations: Array.isArray(p.mutations) ? p.mutations : [],
      // K8 — op-group affiliation surfaced to the strip so SegmentList
      // can wrap consecutive same-groupId rows in a bordered container.
      groupId: p.groupId || null,
      groupLayer: typeof p.groupLayer === 'number' ? p.groupLayer : 0,
      // Inherit the source container's features clipped to this slice
      // (same proven helper as legacy makeSourcedSegment) — was [] in
      // the 4-tier path, so realised products lost annotations.
      annotations: c
        ? transferAnnotations(
          c.annotations || [], r.start, r.end, r.orientation === 'reverse', r.sourceId,
        )
        : [],
    };
  });
  return {
    id: zone.id,
    name: zone.name,
    topology: zone.topology || { circular: false },
    segments,
    realiseRevision: zone.realiseRevision || 0,
    position: zone.bounds ? { x: zone.bounds.x, y: zone.bounds.y } : null,
  };
}

/** Resolve targetId → a draft-like object (zone-pieces first, legacy fallback). */
function resolveTarget(state, targetId) {
  const zone = (state.zones || []).find((z) => z.id === targetId);
  if (zone) return draftFromZone(state, zone);
  return (state.assemblyDrafts || []).find((d) => d.id === targetId) || null;
}

/**
 * realiseAssembly — main entry. `options.revision` (default current+1)
 * suffixes generated names. Returns {ok:false,error} on orphan / gap.
 */
export function realiseAssembly(state, targetId, perBoundaryMethods, options = {}) {
  const draft = resolveTarget(state, targetId);
  if (!draft) return { ok: false, error: 'assembly draft не найден' };
  const segs = draft.segments || [];
  if (segs.length === 0) return { ok: false, error: 'в сборке нет сегментов' };

  const { orphans } = computeAssemblySequence(draft);
  if (orphans.length > 0) {
    return { ok: false, error: `orphan-source: ${orphans.length} сегмент(ов) потеряли источник — почини перед Realise` };
  }
  // Gap without sequence (manual placeholder) blocks realisation.
  for (let i = 0; i < segs.length; i += 1) {
    const s = segs[i];
    const isManual = s.source?.type !== 'container';
    const noSeq = !(typeof s.sequence === 'string' && s.sequence.length > 0);
    if (isManual && noSeq) {
      return { ok: false, error: `gap-without-sequence: сегмент #${i + 1} без последовательности — заполни в редакторе` };
    }
  }

  const revision = options.revision || ((draft.realiseRevision || 0) + 1);
  const baseName = draft.name || 'assembly';
  const primers = (state.assemblyDraftPrimers && state.assemblyDraftPrimers[targetId]) || [];

  const operations = [];
  const containers = [];
  const junctions = [];
  const primerAttachments = [];
  const positionsLayout = { operations: {}, containers: {} };

  // Bottom-area line layout; shift down if occupied.
  let baseY = LAYOUT_Y;
  const occupied = Object.values(state.positions || {}).some(
    (p) => p && Math.abs((p.y || 0) - baseY) < 90,
  );
  let shifted = false;
  if (occupied) { baseY += 200; shifted = true; }

  let col = 0;
  const fragContainerIds = [];
  segs.forEach((seg, i) => {
    const isManual = seg.source?.type !== 'container';
    const cId = `cnt-${uuidv7()}`;
    if (isManual) {
      // gap-with-sequence → synthetic oligo container, no PCR op.
      containers.push({
        id: cId,
        kind: 'molecule',
        name: nameWithRevision(`${baseName}-gap-${i + 1}`, revision),
        sequence: seg.sequence,
        annotations: [],
        topology: { circular: false },
        origin: { kind: 'realised-oligo', assemblyId: targetId, revision },
        pinned: false,
      });
      positionsLayout.containers[cId] = { x: 80 + col * STEP_X, y: baseY };
      fragContainerIds.push(cId);
      col += 1;
      return;
    }
    const opId = `op-${uuidv7()}`;
    containers.push({
      id: cId,
      kind: 'molecule',
      name: nameWithRevision(`${baseName}-frag-${i + 1}`, revision),
      sequence: seg.sequence,
      annotations: seg.annotations || [],
      topology: { circular: false },
      origin: { kind: 'realised', assemblyId: targetId, revision, segmentId: seg.id },
      pinned: false,
    });
    const userPrimers = mapPrimersForSegment(primers, seg) || autoPrimerPair(seg.sequence);
    operations.push({
      id: opId,
      kind: 'pcr',
      status: 'committed',
      position: { x: 80 + col * STEP_X, y: baseY },
      inputs: [seg.source.containerId],
      outputs: [cId],
      params: { userPrimers: [userPrimers] },
      origin: { kind: 'realised', assemblyId: targetId, revision, segmentId: seg.id },
      pinned: false,
    });
    primerAttachments.push({ opId, userPrimers: [userPrimers] });
    positionsLayout.operations[opId] = { x: 80 + col * STEP_X, y: baseY };
    positionsLayout.containers[cId] = { x: 80 + col * STEP_X, y: baseY + 90 };
    fragContainerIds.push(cId);
    col += 1;
  });

  // Final product container.
  const finalId = `cnt-${uuidv7()}`;
  const finalSeq = computeAssemblySequence(draft).sequence;
  containers.push({
    id: finalId,
    kind: 'molecule',
    name: nameWithRevision(`${baseName}-product`, revision),
    sequence: finalSeq,
    // Product = concat of segments → union of each segment's
    // (inherited) annotations, offset by its position in the concat.
    annotations: concatSegmentAnnotations(segs),
    topology: draft.topology || { circular: false },
    origin: { kind: 'realised-product', assemblyId: targetId, revision },
    pinned: false,
  });

  // Assembly operation — the one-pot reaction that joins the fragments into the
  // product (Игорь 10.06): source→PCR→frag→[assembly]→product. Without it the
  // product floats (the renderer reads only op in/out, not junctions). Kind =
  // the assembly method → one colour per op type (op-colors). Per-boundary
  // methods stay as params here + as junction metadata below.
  if (fragContainerIds.length >= 2) {
    const repMethod = (perBoundaryMethods && perBoundaryMethods[0]) || draft.assemblyMethod || 'gibson';
    const asmOpId = `op-${uuidv7()}`;
    const asmX = 80 + col * STEP_X;
    operations.push({
      id: asmOpId,
      kind: METHOD_TO_OP_KIND[repMethod] || 'ligate',
      status: 'committed',
      position: { x: asmX, y: baseY },
      inputs: [...fragContainerIds],
      outputs: [finalId],
      params: { perBoundaryMethods: perBoundaryMethods || {}, method: repMethod },
      origin: { kind: 'realised-assembly', assemblyId: targetId, revision },
      pinned: false,
    });
    positionsLayout.operations[asmOpId] = { x: asmX, y: baseY };
    col += 1;
  }
  positionsLayout.containers[finalId] = { x: 80 + col * STEP_X, y: baseY };

  // Boundary junctions between consecutive fragment/oligo containers.
  for (let i = 0; i < fragContainerIds.length - 1; i += 1) {
    const method = (perBoundaryMethods && perBoundaryMethods[i]) || 'gibson';
    const j = junctionForMethod(method, fragContainerIds[i], fragContainerIds[i + 1]);
    j.realisedFrom = {
      assemblyId: targetId, boundaryIdx: i, revision, method,
    };
    junctions.push(j);
  }

  return {
    ok: true,
    diff: {
      operations,
      junctions,
      containers,
      primerAttachments,
      positionsLayout,
      revision,
      layoutShifted: shifted,
    },
  };
}
