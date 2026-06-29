/**
 * pieces-to-dag-preview — LIVE derived projection of an assembly's pieces into a
 * source→reaction→fragment graph for the DAG view (Игорь 22.06.2026: «когда я
 * выбрал кусок, на DAG уже должна появиться карточка исходника + Cut = фрагмент»;
 * выбран «живой вывод из кусков»).
 *
 * The DAG view used to show only ALREADY-materialised nodes (`nodeListInZone`),
 * so a freshly picked piece produced nothing until «Реализовать». This derives,
 * per piece, the mechanism the recipe implies — WITHOUT mutating the store:
 *   - sourced piece, acquisitionMethod 'restriction' → source → Cut → fragment;
 *   - sourced piece, any other method               → source → PCR → fragment;
 *   - manual / snippet / synthesis / gap (no source) → a standalone fragment.
 * The same source container used by several pieces is emitted ONCE (deduped), so
 * the graph reads «один исходник → N разрезов».
 *
 * Pure: reuses `draftFromZone` (piece→segment, range-concat, rc, mutations) so the
 * derived fragment sequence matches exactly what realise/SegmentList show.
 * `«Реализовать»` stays the separate materialise-into-a-product-container step.
 */
import { draftFromZone, METHOD_TO_OP_KIND } from './zone-pieces-to-dag';
import { computeAssemblySequence, concatSegmentAnnotations } from './assembly-model';
import {
  segmentOverhangs, junctionInterlock, terminalStagger, orientFragments,
} from './segment-overhangs';
import {
  assemblyReadiness, assemblyJunctionConflicts, junctionKindForMethod, pairKeyFor,
} from './junction-derive';
import { RE_ENZYMES } from '../../../restriction-db';

/** Reaction op kind implied by a sourced piece's acquisition method. */
export function opKindForMethod(method) {
  return method === 'restriction' ? 'cut' : 'pcr';
}

/**
 * synthLigation — Ф4.3 (Игорь 27.06: «свёл объекты → между ними ДЕЙСТВИЕ (ромб), и от
 * него вниз рождается карточка с продуктом, где нуклеотиды слепились; компоновка без
 * реакции невозможна»). Pure: given the two ORIENTED fragment containers being mated and
 * the junction {overhang, enzyme}, synthesize the ligation OPERATION node + the joined
 * PRODUCT container (overhang counted once; the reconstituted RE recognition site is
 * annotated AT the seam so «был сайт — его и показываем», not 4 bare nt).
 *
 * @returns {{op: object, product: object}}
 */
export function synthLigation(a, b, junction, reEnzymes, opts = {}) {
  const circular = !!(opts && opts.circular);
  const aSeq = (a && a.sequence) || '';
  const bSeq = (b && b.sequence) || '';
  // Engine convention (computeAssemblySequence): stored fragment ranges already account for
  // the shared overhang (it lives in ONE fragment), so the assembly = plain concat, no dedup.
  const joined = aSeq + bSeq;
  const enzyme = (junction && junction.enzyme) || '';
  // Product INHERITS each fragment's feature annotations (Игорь 27.06 «полученная
  // плазмида должна наследовать разметку фичей»), remapped to product coords: A at [0,aLen),
  // B shifted by aLen.
  const annotations = [];
  const bOffset = aSeq.length;
  const remap = (anns, off, tag) => {
    for (const an of (Array.isArray(anns) ? anns : [])) {
      const s = Number(an.start);
      const e = Number(an.end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const ns = Math.max(0, s + off);
      const ne = Math.min(joined.length, e + off);
      if (ne <= ns) continue;
      annotations.push({
        ...an,
        id: `lig${tag}-${an.id != null ? an.id : `${s}-${e}`}`,
        start: ns,
        end: ne,
      });
    }
  };
  remap(a && a.annotations, 0, 'A');
  remap(b && b.annotations, bOffset, 'B');
  const recRaw = enzyme && reEnzymes && reEnzymes[enzyme]
    && (reEnzymes[enzyme].seq || reEnzymes[enzyme].site || reEnzymes[enzyme].recognition);
  if (recRaw) {
    const L = String(recRaw).length;
    const center = aSeq.length; // the A|B seam
    const start = Math.max(0, center - Math.floor(L / 2));
    const end = Math.min(joined.length, start + L);
    if (end > start) {
      annotations.push({
        id: `dag-ligsite-${a.id}-${b.id}`,
        type: 'protein_bind',
        level: 'region',
        name: `сайт ${enzyme}`,
        start,
        end,
      });
    }
  }
  const product = {
    id: `dag-ligprod-${a.id}-${b.id}`,
    kind: 'molecule',
    name: circular ? 'продукт (плазмида)' : 'продукт',
    sequence: joined,
    length: joined.length,
    // RE-ligation of two fragments whose ends close → CIRCULAR plasmid (Игорь: «собираться
    // должно в кольцо»), not a linear concat. Caller passes circular from orient.closes.
    topology: { circular },
    annotations,
    origin: { kind: 'ligation', circular },
    _role: 'product',
    _derived: true,
  };
  const op = {
    id: `dag-ligate-${a.id}-${b.id}`,
    kind: 'ligate',
    status: 'committed',
    inputs: [a.id, b.id],
    outputs: [product.id],
    params: { method: 'restriction' },
    _derived: true,
  };
  return { op, product };
}

/** Severity of a junctionInterlock verdict for per-fragment readiness (worst end wins). */
function verdictRank(v) {
  if (v === 'incompatible') return 2;
  if (v === 'unknown') return 1;
  return 0; // compatible | blunt → ready
}

export function derivePiecesToGraph(state, zone) {
  if (!state || !zone) return { containers: [], operations: [] };
  const draft = draftFromZone(state, zone);
  const segs = (draft && draft.segments) || [];
  const byId = new Map((state.containers || []).map((c) => [c.id, c]));
  // Ф5 — orientation + closure are NORMALIZED into the model by draftFromZone, so the draft's
  // segments are already oriented and its topology already reflects the ring closure. orient
  // here is only for the per-junction verdicts/overhang (assemblyJunctions) + the readiness
  // border; the segment rc/topology decisions live in draftFromZone now.
  const circularTopo = !!(draft && draft.topology && draft.topology.circular);
  const orient = orientFragments(segs, RE_ENZYMES, { circular: circularTopo });
  // ringCloses now equals the (already-normalized) topology — kept for the view-synthesized
  // LINEAR ligation product (matedLigations): linear when the assembly didn't close.
  const ringCloses = circularTopo;
  const containers = [];
  const operations = [];
  // Ф2/Ф4 — per-junction descriptors from the ORIENTED assignment (single source with
  // the rc flip + closure gate): {fromId,toId,verdict,overhang,len,blunt,closure}.
  // Drives the vertical DAG's magnet-snap + meshed seam. Self-closure (from===to) skipped.
  const assemblyJunctions = orient.junctions
    .filter((j) => j.from !== j.to && segs[j.from] && segs[j.to])
    .map((j) => ({
      fromId: `dag-frag-${segs[j.from].id}`,
      toId: `dag-frag-${segs[j.to].id}`,
      verdict: j.mates ? 'compatible' : 'incompatible',
      overhang: j.overhang || '',
      len: j.len || 0,
      blunt: !!j.blunt,
      closure: !!j.closure,
    }));
  const seenSource = new Set();

  segs.forEach((seg, i) => {
    const fragId = `dag-frag-${seg.id}`;
    const sourced = !!(seg.source && seg.source.type === 'container' && seg.source.containerId);

    // Source container node (deduped across pieces that share one source).
    let sourceNodeId = null;
    if (sourced) {
      const src = byId.get(seg.source.containerId);
      if (src) {
        sourceNodeId = `dag-src-${src.id}`;
        if (!seenSource.has(sourceNodeId)) {
          seenSource.add(sourceNodeId);
          containers.push({
            ...src, id: sourceNodeId, zoneId: zone.id, _derived: true, _role: 'source',
          });
        }
      }
    }

    const kind = opKindForMethod(seg.acquisitionMethod);

    // VERT-1 — sticky-end staircase geometry for the vertical DAG card («хвосты выходят
    // из карточки»). The SAME terminalStagger model the V160 seam + the compatibility
    // gate consume, so the protruding/recessed strands a card draws can never disagree
    // with the verdict. null for blunt / non-restriction fragments (no tail to draw).
    // Ф5 — ориентация уже НОРМАЛИЗОВАНА в draftFromZone (seg уже rc, если назначено), поэтому
    // здесь НЕ переворачиваем повторно — рисуем seg как есть; _reversed только для бейджа «rc».
    const reversed = !!seg.reverseComplement;
    const stagger = terminalStagger(seg, RE_ENZYMES);

    // Fragment (the reaction's product).
    containers.push({
      id: fragId,
      zoneId: zone.id,
      kind: 'molecule',
      name: seg.label || `фрагмент ${i + 1}`,
      sequence: seg.sequence || '',
      length: (seg.sequence || '').length,
      topology: { circular: false },
      annotations: seg.annotations || [],
      origin: sourceNodeId
        ? { kind, parentName: (seg.source && seg.source.sourceContainerName) || '' }
        : { kind: 'synthesis' },
      _stagger: stagger,
      _reversed: reversed,
      _derived: true,
      _role: 'fragment',
    });

    // Reaction op — only when there is a source to act on (a synthesised /
    // manual fragment is its own node, no upstream reaction).
    if (sourceNodeId) {
      operations.push({
        id: `dag-op-${seg.id}`,
        zoneId: zone.id,
        kind,
        status: 'committed',
        inputs: [sourceNodeId],
        outputs: [fragId],
        params: kind === 'cut'
          ? {
            enzymes: (seg.acquisitionParams && seg.acquisitionParams.enzymes) || [],
            cutSites: (seg.acquisitionParams && seg.acquisitionParams.cutSites) || [],
          }
          : {},
        _derived: true,
      });
    }
  });

  // RC-CLOSE-GATE (Игорь 25.06) — the CLOSURE / ring-forming step used to be
  // INVISIBLE in the live DAG: derivePiecesToGraph stopped at source→Cut→fragment,
  // and the closure op + circular product only appeared AFTER «Реализовать» (via
  // realiseAssembly). So a само-замыкание (the assembly finale) showed as a dangling
  // linear fragment. For a CIRCULAR assembly, synthesise the same closure op +
  // circular product here (mirrors realiseAssembly's self-closure / assembly block),
  // so the ring-forming process is shown before materialisation. Pure — no store mutation.
  const circular = !!(draft && draft.topology && draft.topology.circular);
  if (circular && segs.length >= 1) {
    const fragIds = segs.map((s) => `dag-frag-${s.id}`);
    const productId = `dag-product-${zone.id}`;
    const selfClosure = segs.length === 1;
    // V169 (Игорь 26.06) — METHOD must follow the fragments' chemistry, NOT default to
    // Gibson: fragments cut by restriction enzymes assemble by RE-LIGATION (digest+ligate,
    // no primers), which the op-kind map renders as a `ligate` op. The explicit closure
    // reaction (RC-SEP draft.closureMethod) or zone.assemblyMethod wins; else if EVERY
    // sourced fragment is RE-acquired → restriction; else the topology default.
    // When EVERY fragment was obtained by a classical restriction digest, the only way
    // to join them is RE-LIGATION — they have sticky/blunt RE ends, not Gibson homology
    // arms or Type IIS Golden-Gate sites. So `restriction` OVERRIDES an inapplicable
    // explicit gibson/golden_gate (V169: the live Сборка 4 had golden_gate set, which
    // masked the incompatibility because GG/Gibson rework the ends). A MIXED assembly
    // (not all-RE) still honours the explicit closure reaction / topology default.
    const allRE = segs.length > 0 && segs.every((s) => s.acquisitionMethod === 'restriction');
    const closeMethod = allRE
      ? 'restriction'
      : ((draft && draft.closureMethod) || (zone && zone.assemblyMethod) || (selfClosure ? 'kld' : 'gibson'));

    // V169 — COMPATIBILITY GATE: the preview must not draw a sealed ring that the real
    // Realise would refuse. Recompute the SAME `incompatible` verdict as assemblyReadiness
    // (which gates the Realise button, V161/S1) from the segments' sticky ends: an internal
    // junction blocks only for STICKY_JOIN_KINDS, the ring-closure only for re_ligation/
    // ligation — single-sourced inside assemblyReadiness, so the preview can't drift from it.
    const ovr = segs.map((s) => segmentOverhangs(s, RE_ENZYMES));
    const internalKind = junctionKindForMethod(closeMethod);
    const last = segs.length - 1;
    const zonesLite = segs.map((s, i) => ({
      label: s.label || `фрагмент ${i + 1}`,
      reOverhangs: ovr[i] || null,
      interlock: i < last
        ? junctionInterlock(ovr[i] && ovr[i].right, ovr[i + 1] && ovr[i + 1].left)
        : null,
      junctionRight: i < last ? { kind: internalKind } : null,
    }));
    const closure = {
      interlock: junctionInterlock(ovr[last] && ovr[last].right, ovr[0] && ovr[0].left),
      kind: junctionKindForMethod(closeMethod),
      pairKey: pairKeyFor(segs[last].id, segs[0].id),
      selfClosure,
      leftLabel: (segs[last] && segs[last].label) || 'последний',
      rightLabel: (segs[0] && segs[0].label) || 'первый',
    };
    const blocked = assemblyReadiness(zonesLite, closure).incompatible > 0;
    const conflicts = blocked ? assemblyJunctionConflicts(zonesLite, closure) : [];
    const reason = (conflicts[0] && conflicts[0].message)
      || 'Несовместимые концы — кольцо не замыкается';

    let productSeq = '';
    try { productSeq = (computeAssemblySequence(draft) || {}).sequence || ''; } catch { productSeq = ''; }
    containers.push({
      id: productId,
      zoneId: zone.id,
      kind: 'molecule',
      name: `${draft.name || zone.name || 'сборка'} (плазмида)`,
      sequence: productSeq,
      length: productSeq.length,
      topology: { circular: true },
      // Product INHERITS each fragment's features (Игорь 29.06 «потеряно
      // отображение фичей на собранной плазмиде» — the ring was empty). Same
      // basis as realiseAssembly's product (concatSegmentAnnotations), so the
      // live DAG preview and the materialised product agree. Plus a junction
      // seam marker at every fragment boundary incl. the ring closure («потеряна
      // фича стыковки двух фрагментов»).
      annotations: (() => {
        const inherited = concatSegmentAnnotations(segs);
        const plen = productSeq.length || 0;
        const seams = [];
        let acc = 0;
        for (let si = 0; si < segs.length; si += 1) {
          acc += (segs[si].sequence || '').length;
          const pos = plen ? (acc % plen) : acc;
          seams.push({
            id: `seam-${zone.id}-${si}`,
            name: 'стык',
            type: 'misc_feature',
            level: 'point',
            start: pos,
            end: Math.min(pos + 1, plen || (pos + 1)),
            strand: 1,
            _seam: true,
          });
        }
        return [...inherited, ...seams];
      })(),
      origin: { kind: 'closure', method: closeMethod, selfClosure },
      // V169 — an impossible assembly renders via VirtualBlock «disconnected» (red broken
      // ring + reason), not a clean sealed plasmid. Forwarded by ZoneGraphContent.
      ...(blocked ? { _virtualState: 'disconnected', _virtualWarnings: [reason] } : {}),
      _derived: true,
      _role: 'product',
    });
    operations.push({
      id: `dag-close-op-${zone.id}`,
      zoneId: zone.id,
      kind: METHOD_TO_OP_KIND[closeMethod] || 'ligate',
      status: blocked ? 'failed' : 'committed',
      inputs: fragIds,
      outputs: [productId],
      params: { method: closeMethod, selfClosure, ...(blocked ? { blocked: true, reason } : {}) },
      _derived: true,
    });
  }

  // VERT-READINESS (Игорь 27.06: «цвет рамки = готовность к сборке») — per-fragment border
  // state from whether its assembly junctions CAN be made (Игорь 27.06 корректировка био:
  // «стыки 1 рестриктазой собираются если перевернуть фрагмент; тупые RE-концы лигируются»):
  //   - a junction between two DISTINCT fragments is feasible if ANY pairing of their ends
  //     mates (so a same-enzyme overhang facing a blunt end is fine — flip the fragment, the
  //     matching overhang faces the seam), reusing junctionInterlock (blunt+blunt → ligates);
  //   - 'incompatible' (red) only when NO orientation mates (e.g. EcoRI vs SalI overhang);
  //   - a self-closure (single circular fragment) mates its own two ends directly (no flip).
  // Internal junctions exist for ANY topology; the ring closure is added only when circular.
  // Worst junction wins; a fragment with NO junction (a lone piece) gets no signal.
  if (segs.length >= 1) {
    const ovrR = segs.map((s) => segmentOverhangs(s, RE_ENZYMES));
    const endsOf = (i) => (ovrR[i] ? [ovrR[i].left, ovrR[i].right] : [null, null]);
    const feasRank = (ai, bi) => {
      if (ai === bi) { // self-closure: the fragment's two distinct ends must mate (no flip).
        const o = ovrR[ai];
        return verdictRank(junctionInterlock(o && o.right, o && o.left).verdict);
      }
      let best = 2; // try every end-pairing (both fragments flippable); keep the best.
      for (const a of endsOf(ai)) {
        for (const b of endsOf(bi)) {
          const r = verdictRank(junctionInterlock(a, b).verdict);
          if (r < best) best = r;
        }
      }
      return best;
    };
    const lastR = segs.length - 1;
    const circ = !!(draft && draft.topology && draft.topology.circular);
    const junctions = [];
    for (let i = 0; i < lastR; i += 1) junctions.push([i, i + 1]);
    if (circ && segs.length >= 2) junctions.push([lastR, 0]);
    if (circ && segs.length === 1) junctions.push([0, 0]); // self-closure
    const worst = segs.map(() => -1);
    junctions.forEach(([a, b]) => {
      const r = feasRank(a, b);
      if (r > worst[a]) worst[a] = r;
      if (r > worst[b]) worst[b] = r;
    });
    segs.forEach((s, i) => {
      const fragC = containers.find((c) => c.id === `dag-frag-${s.id}`);
      if (!fragC) return;
      const w = worst[i];
      // eslint-disable-next-line no-nested-ternary
      fragC._readiness = w < 0 ? null
        : (w === 2 ? 'incompatible' : w === 1 ? 'check' : 'ready');
    });
  }

  return {
    containers, operations, assemblyJunctions, ringCloses,
  };
}
