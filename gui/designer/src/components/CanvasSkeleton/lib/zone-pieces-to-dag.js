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
import { orientFragments, reflectAnnotations, reverseComplementSegment } from './segment-overhangs';
import { RE_ENZYMES } from '../../../restriction-db';

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
  // #111 — SLIC = overlap homology (Gibson family); MoClo = Type IIS (Golden Gate preset).
  slic: 'overlap',
  moclo: 'golden_gate',
};

// The assembly method → the kind of the single assembly OPERATION (the one-pot
// reaction joining the fragments). One colour per op type (op-colors канон).
// EVERY value MUST be a registered op kind (op-kinds-registry KNOWN_OP_KINDS) —
// otherwise the realised node has no adapter and is un-executable. 'restriction'
// maps to 'ligate' (the join step of RE cloning; the per-fragment digest is a
// separate 'cut' op) — there is no registered 'restriction' kind. Guarded by
// consistency-op-kind-map.test.js.
export const METHOD_TO_OP_KIND = {
  overlap_pcr: 'gibson',
  gibson: 'gibson',
  golden_gate: 'golden_gate',
  restriction: 'ligate',
  direct_ligation: 'ligate',
  kld: 'kld',
  // #111 — SLIC realises via the overlap (gibson) op; MoClo via the Type IIS (golden_gate) op.
  slic: 'gibson',
  moclo: 'golden_gate',
};

/**
 * F / M1 (audit) — the enzyme the realised assembly OP carries (→ protocol),
 * resolved from the SAME source
 * the primer tails use: the construct enzyme (zone.assemblyEnzyme) first, else the
 * per-junction config (closure-only «применить к замыканию» sets the enzyme on the
 * junction, NOT assemblyEnzyme — so the op fell back to the default EcoRI/BsaI and
 * the protocol named the wrong enzyme vs the primers). Falls back to the method
 * default last.
 */
function resolveRealiseEnzyme(state, targetId, method, draftEnzyme) {
  // #111 — MoClo is a Type IIS (Golden Gate) preset → carries an enzyme like golden_gate.
  const typeIIS = method === 'golden_gate' || method === 'moclo';
  if (!typeIIS && method !== 'restriction') return null;
  if (draftEnzyme) return draftEnzyme;
  const zone = ((state && state.zones) || []).find((z) => z && z.id === targetId);
  const js = (zone && zone.junctions) || {};
  for (const k of Object.keys(js)) {
    if (js[k] && js[k].method === method && js[k].enzyme) return js[k].enzyme;
  }
  return typeIIS ? 'BsaI' : 'EcoRI';
}

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
// P0.2 (Игорь 27.06) — memoize draftFromZone per (immutable state, zoneId). Within one render
// several selectors call draftFromZone with the SAME state object; without memo each repeats the
// full build incl. orientFragments (~2N segmentOverhangs) → 2–5× per keystroke. State is immutable
// (Zustand/Immer): the same state ref ⇒ identical inputs ⇒ identical result, so a WeakMap keyed by
// state (auto-GC'd when the state is replaced) is a safe, standard reselect-style cache. Consumers
// treat the draft as read-only (derived view); none mutate it.
const _draftCache = new WeakMap();

export function draftFromZone(state, zone) {
  if (state && zone) {
    const byZone = _draftCache.get(state);
    if (byZone) { const hit = byZone.get(zone.id); if (hit) return hit; }
  }
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
    // Multi-range sourced piece (e.g. an inverted/backbone fragment that wraps
    // the circular origin = [hi..end] + [0..lo]): concat every range's
    // (rc-aware) slice. A single-range piece behaves EXACTLY as before — the
    // invariant forbids start>=end, so a wrap is modelled as two valid ranges.
    const ranges = (Array.isArray(p.ranges) && p.ranges.length > 0) ? p.ranges : [{}];
    const r = ranges[0] || {};
    const c = containers.find((x) => x.id === r.sourceId);
    const isReverse = ranges.some((rr) => rr.orientation === 'reverse');
    const fwdSliceOf = (rr) => {
      const cc = containers.find((x) => x.id === rr.sourceId);
      return cc ? String(cc.sequence || '').slice(rr.start, rr.end) : '';
    };
    const fwdSeq = ranges.map(fwdSliceOf).join('');
    // V184 — OVERHANG-AWARE orientation. Build the FORWARD top strand, then flip the
    // whole segment with sticky-end awareness. A plain per-range reverseComplement
    // (the old path) dropped the overhang stagger, so a reversed RE fragment's
    // recognition site at the seam vanished (Игорь «после лигирования не
    // обнаруживается сайт ApaI … он на обратной цепи теперь»). The helper preserves
    // length and falls back to a plain RC for blunt / non-palindromic (unknown) ends.
    const orientedSeq = isReverse
      ? reverseComplementSegment(
        {
          acquisitionMethod: p.acquisitionMethod,
          acquisitionParams: p.acquisitionParams,
          sequence: fwdSeq,
          reverseComplement: false,
        },
        RE_ENZYMES,
      )
      : fwdSeq;
    // S2 §5.4 — apply mutations to the (post-rc) top-strand so the
    // assembled view shows the edited base, not the wild-type one.
    const seq = applyPieceMutations(orientedSeq, p.mutations);
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
      // V161 — carry the piece's acquisition method + params onto the segment so
      // segmentOverhangs / junctionInterlock can derive RE sticky ends, junction
      // compatibility, and the readiness chemistry gate in the assembly editor.
      // Without this the segment lost them, so the whole RE-overhang chain (V158
      // chips, V160 seam, S1 readiness) was dead on the real store-driven draft —
      // only crafted coloredZones ever showed it.
      acquisitionMethod: p.acquisitionMethod || 'undefined',
      acquisitionParams: p.acquisitionParams || {},
      // Inherit the source container's features clipped to this slice. Transfer
      // PER RANGE and shift by the cumulative offset, so a WRAP fragment (two
      // ranges through the origin) keeps its features instead of dropping them
      // (Игорь 22.06 — coord-stitch pass). Single-range = one pass, offset 0 →
      // byte-identical to the prior behaviour.
      annotations: (() => {
        if (!c) return [];
        const out = [];
        let offset = 0;
        for (const rr of ranges) {
          const cc = containers.find((x) => x.id === rr.sourceId) || c;
          const transferred = transferAnnotations(
            cc.annotations || [], rr.start, rr.end, rr.orientation === 'reverse', rr.sourceId,
          );
          for (const an of transferred) out.push({ ...an, start: an.start + offset, end: an.end + offset });
          offset += Math.max(0, (Number(rr.end) || 0) - (Number(rr.start) || 0));
        }
        return out;
      })(),
    };
  });
  // «В модель» (Игорь 27.06 «окно сиквенса должно соответствовать DAG», выбор «полностью в
  // модель») — нормализуем RE-сборку к тому, что показывает DAG: авто-ориентации фрагментов
  // (orientFragments: rc-последовательность + отражённые фичи + флаг) + авто-замыкание в кольцо
  // (orient.closes). ЕДИНЫЙ источник → DAG, Sequence И «Реализовать» дают один ориентированный
  // кольцевой продукт. Не-RE сборки (нет липких концов) НЕ затрагиваются: orientFragments даёт
  // reversed=false / closes=false → segments + topology байт-идентичны прежним.
  // P0 (Игорь 27.06) — respect an EXPLICIT user topology choice: once the «Линейная/Кольцевая»
  // toggle has been used (zone.topology.explicit), auto-close must NOT override it.
  const explicitTopology = !!(zone.topology && zone.topology.explicit);
  let normSegments = segments;
  let circular = !!(zone.topology && zone.topology.circular);
  try {
    const orient = orientFragments(segments, RE_ENZYMES, { circular: true });
    // Orientation normalization always applies (the assembled sequence must be correct
    // for linear AND circular); only the auto-CLOSE respects the explicit choice.
    normSegments = segments.map((seg, i) => {
      const want = !!(orient.orientations[i] && orient.orientations[i].reversed);
      if (want === !!seg.reverseComplement) return seg;
      const sq = seg.sequence || '';
      return {
        ...seg,
        // V184 — overhang-aware flip: a plain reverseComplement(topSlice) would not
        // restore the sticky-end stagger, so the reversed fragment's RE site at the
        // seam would vanish (Игорь «после лигирования не обнаруживается сайт ApaI»).
        sequence: reverseComplementSegment(seg, RE_ENZYMES),
        annotations: reflectAnnotations(seg.annotations || [], sq.length),
        reverseComplement: want,
      };
    });
    // Auto-close only a MULTI-fragment assembly (the RE-cloning ring outcome) AND only when
    // the user hasn't explicitly chosen a topology. A single fragment that self-mates stays
    // linear unless circularised explicitly.
    if (!explicitTopology) circular = circular || (segments.length >= 2 && orient.closes);
  } catch { normSegments = segments; }

  const result = {
    id: zone.id,
    name: zone.name,
    topology: { ...(zone.topology || {}), circular },
    // M-CIRCULARIZE / AM-2 — carry the construct method so realise's
    // assemblyMethod fallback (and methodsFromJunctions' default) can recover the
    // chosen method for boundaries with no seeded junction config (notably the
    // single-fragment self-closure, where the finalizer clears zone.junctions).
    assemblyMethod: zone.assemblyMethod || null,
    // F — the construct-level enzyme (GG Type IIS / RE), so realise's assembly op
    // params + the protocol can name the chosen enzyme instead of defaulting BsaI.
    assemblyEnzyme: zone.assemblyEnzyme || null,
    // RC-SEP (Игорь 25.06) — the ring-closing reaction as ONE assembly property
    // (decoupled from internal junctions + topology). Survives the finalizer's
    // zone.junctions reset, so a single-fragment self-closure keeps its method.
    closureMethod: zone.closureMethod || null,
    closureEnzyme: zone.closureEnzyme || null,
    segments: normSegments,
    realiseRevision: zone.realiseRevision || 0,
    position: zone.bounds ? { x: zone.bounds.x, y: zone.bounds.y } : null,
  };
  if (state && zone) {
    let byZone = _draftCache.get(state);
    if (!byZone) { byZone = new Map(); _draftCache.set(state, byZone); }
    byZone.set(zone.id, result);
  }
  return result;
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

  // V171/F2 (audit) — a RING-closing reaction must be a valid closure method.
  // overlap_pcr makes a LINEAR product (its ring counterpart is Gibson); kld is
  // whole-plasmid self-closure of a SINGLE fragment (cannot join N>1). Both →
  // gibson. blunt (direct_ligation) + gibson/golden_gate/restriction are valid
  // closures and stay. (A membership-in-CLOSURE_METHODS check would wrongly drop
  // direct_ligation, which CircularizeModal appends as a real blunt-ring closure.)
  const guardClosureMethod = (m, n) => {
    if (m === 'overlap_pcr') return 'gibson';
    if (m === 'kld' && n > 1) return 'gibson';
    return m;
  };

  // Assembly operation — the one-pot reaction that joins the fragments into the
  // product (Игорь 10.06): source→PCR→frag→[assembly]→product. Without it the
  // product floats (the renderer reads only op in/out, not junctions). Kind =
  // the assembly method → one colour per op type (op-colors). Per-boundary
  // methods stay as params here + as junction metadata below.
  if (fragContainerIds.length >= 2) {
    let repMethod = (perBoundaryMethods && perBoundaryMethods[0]) || draft.assemblyMethod
      || ((draft.topology && draft.topology.circular) ? 'gibson' : 'overlap_pcr');
    // V171/F2 — on a circular product the one-pot method is a ring-former; guard it.
    if (draft.topology && draft.topology.circular) {
      repMethod = guardClosureMethod(repMethod, fragContainerIds.length);
    }
    const asmEnzyme = resolveRealiseEnzyme(state, targetId, repMethod, draft.assemblyEnzyme);
    const asmOpId = `op-${uuidv7()}`;
    const asmX = 80 + col * STEP_X;
    operations.push({
      id: asmOpId,
      kind: METHOD_TO_OP_KIND[repMethod] || 'ligate',
      status: 'committed',
      position: { x: asmX, y: baseY },
      inputs: [...fragContainerIds],
      outputs: [finalId],
      params: {
        perBoundaryMethods: perBoundaryMethods || {}, method: repMethod,
        ...(asmEnzyme ? { enzyme: asmEnzyme } : {}),
        // L7 (audit) — RE cloning produces sticky ends; without this the protocol's
        // stepLigate defaults to 'blunt' and prints the PEG/overnight blunt recipe.
        ...(repMethod === 'restriction' ? { ends: 'sticky' } : {}),
      },
      origin: { kind: 'realised-assembly', assemblyId: targetId, revision },
      pinned: false,
    });
    positionsLayout.operations[asmOpId] = { x: asmX, y: baseY };
    col += 1;
  } else if (draft.topology && draft.topology.circular && fragContainerIds.length === 1) {
    // M-CIRCULARIZE C3 — single-fragment self-closure: the lone fragment's two
    // ends close into a plasmid (KLD whole-plasmid PCR + ligation, or blunt
    // self-ligation). Emit a self-closure op (frag → circular product) so the
    // product is reachable instead of floating.
    let closeMethod = (perBoundaryMethods && perBoundaryMethods[0]) || draft.assemblyMethod || 'kld';
    // V171/F2 — single-fragment self-closure: overlap_pcr→gibson; kld stays (valid for 1 frag).
    closeMethod = guardClosureMethod(closeMethod, 1);
    const closeEnzyme = resolveRealiseEnzyme(state, targetId, closeMethod, draft.assemblyEnzyme);
    const closeOpId = `op-${uuidv7()}`;
    const closeX = 80 + col * STEP_X;
    operations.push({
      id: closeOpId,
      kind: METHOD_TO_OP_KIND[closeMethod] || 'ligate',
      status: 'committed',
      position: { x: closeX, y: baseY },
      inputs: [fragContainerIds[0]],
      outputs: [finalId],
      params: {
        method: closeMethod, selfClosure: true,
        ...(closeEnzyme ? { enzyme: closeEnzyme } : {}),
        ...(closeMethod === 'restriction' ? { ends: 'sticky' } : {}),
      },
      origin: { kind: 'realised-assembly', assemblyId: targetId, revision },
      pinned: false,
    });
    positionsLayout.operations[closeOpId] = { x: closeX, y: baseY };
    col += 1;
  }
  positionsLayout.containers[finalId] = { x: 80 + col * STEP_X, y: baseY };

  // Boundary junctions between consecutive fragment/oligo containers. The
  // INTERNAL fuse default is overlap_pcr (never gibson — internal joins are not
  // the ring-closing reaction; AM-5). The closure block below owns the ring join.
  for (let i = 0; i < fragContainerIds.length - 1; i += 1) {
    const method = (perBoundaryMethods && perBoundaryMethods[i]) || 'overlap_pcr';
    const j = junctionForMethod(method, fragContainerIds[i], fragContainerIds[i + 1]);
    j.realisedFrom = {
      assemblyId: targetId, boundaryIdx: i, revision, method,
    };
    junctions.push(j);
  }

  // M-CIRCULARIZE C2 — closure junction (last fragment → first) when the product
  // is circular. Without it realise only emitted the N−1 internal joins, so the
  // ring never visibly closed («кольцевание» was cosmetic — the product carried
  // the circular flag but no DAG edge modelled the close-out reaction). Method =
  // the closure boundary config (perBoundaryMethods[N−1], allBoundaries order),
  // else the construct method, else gibson.
  if (draft.topology && draft.topology.circular && fragContainerIds.length >= 2) {
    const ci = fragContainerIds.length - 1;
    let method = (perBoundaryMethods && perBoundaryMethods[ci])
      || draft.assemblyMethod || 'gibson';
    method = guardClosureMethod(method, fragContainerIds.length); // V171/F2 — overlap_pcr/kld-multi → gibson
    const cj = junctionForMethod(method, fragContainerIds[ci], fragContainerIds[0]);
    cj.realisedFrom = {
      assemblyId: targetId, boundaryIdx: ci, revision, method, role: 'closure',
    };
    junctions.push(cj);
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
