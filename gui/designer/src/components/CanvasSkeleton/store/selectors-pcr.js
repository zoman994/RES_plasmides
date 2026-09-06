/**
 * selectors-pcr — pure reactive selectors for PCR operation mode.
 * F3 M-CANVAS-PCR (DEC-CANVAS-PCR-05). Consumers subscribe via
 * `useStore(s => selectPcrPrimers(s, opId))`.
 */
import { suggestPrimers } from '../lib/operation-pcr-bridge';
import { selectTailsForJunction } from './selectors-junction';
import { reverseComplement } from '../../../sequence-utils';
import { resolvePcrProduct } from '../../../lib/pcr-amplicon';


/**
 * The pair an occurrence-authored op already committed to.
 *
 * `null` for every other kind of op, so the legacy auto-design / user-primer
 * branches below stay byte-identical.
 */
function occurrencePairOf(op) {
  const snaps = op?.params?.primerSnapshots;
  if (!snaps || !snaps.forward || !snaps.reverse) return null;
  return {
    forward: snaps.forward.sequence,
    reverse: snaps.reverse.sequence,
    fwdBinding: snaps.forward.bindingSequence || snaps.forward.sequence,
    revBinding: snaps.reverse.bindingSequence || snaps.reverse.sequence,
    fwdName: snaps.forward.name || 'fwd',
    revName: snaps.reverse.name || 'rev',
    fwdTail: snaps.forward.tail || '',
    revTail: snaps.reverse.tail || '',
    occurrenceKeys: [snaps.forward.occurrenceKey, snaps.reverse.occurrenceKey],
    // Marks the pair as already decided, so an editor knows it is changing a
    // committed choice rather than a suggestion.
    source: 'occurrences',
  };
}

function occurrenceFromSnapshot(snapshot, primerId, strand) {
  return {
    key: snapshot.occurrenceKey,
    primerId,
    start: snapshot.start,
    end: snapshot.end,
    strand,
    ...(Array.isArray(snapshot.segments) ? {
      segments: snapshot.segments.map(({ start, end }) => ({ start, end })),
    } : {}),
    ...(snapshot.alignment ? {
      alignment: {
        ...snapshot.alignment,
        runs: Array.isArray(snapshot.alignment.runs)
          ? snapshot.alignment.runs.map((run) => ({ ...run }))
          : snapshot.alignment.runs,
        counts: snapshot.alignment.counts
          ? { ...snapshot.alignment.counts }
          : snapshot.alignment.counts,
        targetSpan: snapshot.alignment.targetSpan
          ? { ...snapshot.alignment.targetSpan }
          : snapshot.alignment.targetSpan,
      },
    } : {}),
  };
}

export function selectTemplateForOp(state, operationId) {
  if (!state || !operationId) return null;
  const op = (state.operations || []).find((o) => o.id === operationId);
  if (!op || !Array.isArray(op.inputs) || op.inputs.length === 0) return null;
  return (state.containers || []).find((c) => c.id === op.inputs[0]) || null;
}

/**
 * selectPcrPrimers — reactive primer pairs for a PCR op.
 *   - op.params.userPrimers override wins (manual / reused edits).
 *   - else auto-suggest via bridge, feeding adjacent-junction tails
 *     from the F2 selector.
 */
export function selectPcrPrimers(state, operationId) {
  const op = (state?.operations || []).find((o) => o.id === operationId);
  if (!op) return { pairs: [], status: 'error' };
  const template = selectTemplateForOp(state, operationId);
  if (!template || !template.sequence) return { pairs: [], status: 'error' };

  // PRIMER-LIVE-1 — an op authored from two CHOSEN landings already has its
  // pair. Auto-designing a different one here is how the viewer ends up
  // showing primers that are not the primers that get executed.
  const chosen = occurrencePairOf(op);
  if (chosen) return { pairs: [chosen], status: 'ready' };

  const userPrimers = op.params && op.params.userPrimers;
  if (Array.isArray(userPrimers) && userPrimers.length > 0) {
    return { pairs: userPrimers, status: 'ready' };
  }

  const inputId = op.inputs[0];
  const junction = (state.junctions || []).find(
    (j) => j.fromContainerId === inputId || j.toContainerId === inputId,
  );
  const tails = junction ? selectTailsForJunction(state, junction.id) : null;

  const result = suggestPrimers(template, tails, {});
  return {
    pairs: result.pairs,
    status: result.pairs.length > 0 ? 'ready' : 'error',
    warnings: result.warnings,
  };
}

/**
 * selectPcrSpans — where the chosen PCR primers bind on the template and the
 * region they flank, for the canvas MiniPlasmidMap overlay (V75).
 *
 * PRIMER-LIVE-1 — the landings are still located here, because a PCR op stores
 * primer SEQUENCES rather than chosen occurrences; but once they are located,
 * the product itself is measured by the ONE shared resolver, so the overlay,
 * the preview and the execution cannot disagree about what would come out.
 *
 * The landing search itself is UNCHANGED legacy behaviour (first match, reverse
 * downstream of forward). It is not the two-occurrence path: an op of this kind
 * stores no chosen occurrences, so there is nothing better to resolve from. The
 * new path that DOES know its occurrences never comes through here.
 *
 * @returns {{flank:{start,end}, primers:Array<{start,end,direction,name}>}|null}
 */
export function selectPcrSpans(state, operationId) {
  const op = (state?.operations || []).find((o) => o.id === operationId);
  if (!op || op.kind !== 'pcr') return null;
  const template = selectTemplateForOp(state, operationId);
  if (!template || !template.sequence) return null;

  // The chosen landings ARE the spans. Searching for them again would answer
  // about the first copy of a repeated site rather than the clicked one.
  const snaps = op.params?.primerSnapshots;
  if (snaps && snaps.forward && snaps.reverse) {
    const circularNow = template.circular === true
      || template.topology === 'circular'
      || template.topology?.circular === true;
    const resolvedChosen = resolvePcrProduct({
      template: template.sequence,
      topology: circularNow ? 'circular' : 'linear',
      occurrences: [
        occurrenceFromSnapshot(snaps.forward, 'fwd', 1),
        occurrenceFromSnapshot(snaps.reverse, 'rev', -1),
      ],
      primersById: { fwd: { ...snaps.forward, id: 'fwd' }, rev: { ...snaps.reverse, id: 'rev' } },
      documentIdentity: op.params?.documentIdentity ?? null,
    });
    if (resolvedChosen.ok !== true) return null;
    return {
      flank: { start: snaps.forward.start, end: snaps.reverse.end },
      product: resolvedChosen.product,
      warnings: resolvedChosen.warnings,
      primers: [
        {
          start: snaps.forward.start,
          end: snaps.forward.end,
          direction: 'forward',
          name: snaps.forward.name || 'fwd',
        },
        {
          start: snaps.reverse.start,
          end: snaps.reverse.end,
          direction: 'reverse',
          name: snaps.reverse.name || 'rev',
        },
      ],
    };
  }

  const { pairs } = selectPcrPrimers(state, operationId);
  const p = pairs && pairs[0];
  if (!p || !p.forward || !p.reverse) return null;
  const tpl = template.sequence.toUpperCase();
  const fwdBind = String(p.fwdBinding || p.forward).toUpperCase();
  const revBind = String(p.revBinding || p.reverse).toUpperCase();
  const fStart = tpl.indexOf(fwdBind);
  if (fStart < 0) return null;
  const revRc = reverseComplement(revBind);
  const rStart = tpl.indexOf(revRc, fStart);
  if (rStart < 0) return null;
  const rEnd = rStart + revRc.length;

  const circular = template.circular === true
    || template.topology === 'circular'
    || template.topology?.circular === true;
  const resolved = resolvePcrProduct({
    template: tpl,
    topology: circular ? 'circular' : 'linear',
    occurrences: [
      { key: `${operationId}#fwd`, primerId: 'fwd', start: fStart, end: fStart + fwdBind.length, strand: 1 },
      { key: `${operationId}#rev`, primerId: 'rev', start: rStart, end: rEnd, strand: -1 },
    ],
    primersById: {
      fwd: {
        id: 'fwd', name: p.fwdName || 'fwd', sequence: String(p.forward).toUpperCase(),
        bindingSequence: fwdBind, direction: 'forward',
      },
      rev: {
        id: 'rev', name: p.revName || 'rev', sequence: String(p.reverse).toUpperCase(),
        bindingSequence: revBind, direction: 'reverse',
      },
    },
  });
  if (resolved.ok !== true) return null;

  return {
    flank: { start: fStart, end: rEnd },
    product: resolved.product,
    warnings: resolved.warnings,
    primers: [
      { start: fStart, end: fStart + fwdBind.length, direction: 'forward', name: p.fwdName || 'fwd' },
      { start: rStart, end: rEnd, direction: 'reverse', name: p.revName || 'rev' },
    ],
  };
}
