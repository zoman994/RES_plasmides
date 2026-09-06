/**
 * adapters/pcr.js — executePCR adapter (single + multi-template).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * R6-4: multi-template support через params.templateIds[].
 * R4-BIO-5: auto-design primer pair при отсутствии primerPairId.
 */
import {
  newContainer,
  reverseComplement,
  autoDesignPrimerPair,
  makeDesignedOligoContainer,
  makeUserOligoContainer,
} from './_shared';
import { resolveOpTemplate } from '../../../lib/op-piece-bridge';
import { resolvePcrProduct } from '../../../../../lib/pcr-amplicon';
import { documentIdentityOf } from '../../../../../lib/primer-live-workflow';
import { evaluateStandardPcrAnnealing } from '../../../../../lib/primer-annealing-policy';


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

function shortExplicitPrimerReason(binding) {
  const query = String(binding ?? '').replace(/\s+/g, '').toUpperCase();
  const verdict = evaluateStandardPcrAnnealing({
    query,
    threePrimeMatchLength: query.length,
  });
  return verdict.status === 'non-annealing' ? verdict.reason : null;
}

function anchorReasonText(reason) {
  return ({
    'no-three-prime-anchor': 'нет посадочной части на матрицу',
    'short-three-prime-anchor': 'на 3′-конце меньше 10 комплементарных нт',
    'noncanonical-three-prime-anchor': 'в 3′-области посадки есть неканонический нуклеотид',
    'invalid-three-prime-anchor-evidence': 'недостаточно данных о 3′-посадке',
  })[reason] || '3′-посадка непригодна для стандартной PCR';
}

function explicitPrimerAnchorError(forwardBinding, reverseBinding) {
  const forwardReason = shortExplicitPrimerReason(forwardBinding);
  if (forwardReason) return `PCR: forward primer — ${anchorReasonText(forwardReason)}`;
  const reverseReason = shortExplicitPrimerReason(reverseBinding);
  if (reverseReason) return `PCR: reverse primer — ${anchorReasonText(reverseReason)}`;
  return null;
}

function explicitBinding(record, field, fallback) {
  return typeof record?.[field] === 'string'
    ? record[field].toUpperCase()
    : String(fallback || '').toUpperCase();
}

function autoDesignedPrimerError(designedPrimers) {
  return explicitPrimerAnchorError(
    designedPrimers?.forward?.sequence,
    designedPrimers?.reverse?.sequence,
  );
}

/**
 * Build the product from the landings the op already knows about.
 *
 * Returns `null` when this is not an occurrence-authored op, so the caller
 * keeps its legacy behaviour byte-for-byte. Returns `{error}` when the op DOES
 * carry landings but they no longer describe a possible reaction — failing
 * closed, because an op that names its sites and cannot use them is a real
 * problem, not an invitation to go looking for different ones.
 */
function resolveFromOccurrences(operation, template) {
  const params = operation.params || {};
  const snaps = params.primerSnapshots;
  const keys = params.occurrenceKeys;
  if (!snaps || !snaps.forward || !snaps.reverse || !Array.isArray(keys)) return null;

  const circular = template.circular === true
    || template.topology === 'circular'
    || template.topology?.circular === true;

  // PRIMER-LIVE-1 — revalidate the molecule, not the coordinates. An edited
  // template usually still HAS positions 4..32, so the geometry alone would
  // happily amplify a different molecule and report success. Fail closed: the
  // op names the version it was resolved against, and if that is no longer
  // what is on the bench, the biolog has to look at it again.
  const declaredIdentity = params.documentIdentity ?? null;
  if (declaredIdentity) {
    const currentIdentity = documentIdentityOf({
      sequence: template.sequence,
      topology: circular ? 'circular' : 'linear',
      resourceHash: template.resourceHash ?? null,
    });
    if (currentIdentity !== declaredIdentity) {
      return {
        error: 'PCR: посадки устарели — молекула изменилась с момента выбора (stale document)',
      };
    }
  }

  const resolved = resolvePcrProduct({
    template: template.sequence,
    topology: circular ? 'circular' : 'linear',
    occurrences: [
      occurrenceFromSnapshot(snaps.forward, 'fwd', 1),
      occurrenceFromSnapshot(snaps.reverse, 'rev', -1),
    ],
    primersById: { fwd: { ...snaps.forward, id: 'fwd' }, rev: { ...snaps.reverse, id: 'rev' } },
  });
  if (resolved.ok !== true) {
    const reason = [
      'no-three-prime-anchor',
      'short-three-prime-anchor',
      'noncanonical-three-prime-anchor',
      'invalid-three-prime-anchor-evidence',
    ].includes(resolved.reason)
      ? anchorReasonText(resolved.reason)
      : resolved.reason;
    return { error: `PCR не собирается по выбранным посадкам: ${reason}` };
  }
  return { sequence: resolved.product.sequence, product: resolved.product };
}

export function executePCR(operation, ctx) {
  const primerPairId = operation.params?.primerPairId;
  const autoDesign = operation.params?.autoDesign !== false;
  const templateIds = Array.isArray(operation.params?.templateIds)
    ? operation.params.templateIds
    : null;
  if (templateIds && templateIds.length > 1) {
    return executeMultiTemplatePCR(operation, ctx, templateIds, primerPairId, autoDesign);
  }
  const templateId = operation.params?.templateId
    || (templateIds && templateIds[0])
    || operation.inputs?.[0];
  return executeSingleTemplatePCR(operation, ctx, templateId, primerPairId, autoDesign);
}

function executeSingleTemplatePCR(operation, ctx, templateId, primerPairId, autoDesign) {
  // T2 DEC-T2-01/09 hybrid: piece-resolve ONLY when inputPieces is set;
  // otherwise byte-identical legacy ctx.containers[templateId].
  const template = (operation.inputPieces && operation.inputPieces.length > 0
    ? resolveOpTemplate(operation, ctx)
    : null) || ctx.containers[templateId];
  if (!template) return { error: `Темплейт не найден: ${templateId}` };
  if (!template.sequence) return { error: 'Темплейт без последовательности' };
  // PRIMER-LIVE-1 — an op authored from two CHOSEN landings carries them, and
  // the immutable snapshots of what was on the bench. That is enough to build
  // the product without searching the template again, so the preview the user
  // approved and the amplicon that is executed come from the SAME resolver and
  // cannot disagree. Legacy ops, which store only sequences, fall through to
  // the search branches below unchanged.
  const occurrenceProduct = resolveFromOccurrences(operation, template);
  if (occurrenceProduct) {
    if (occurrenceProduct.error) return { error: occurrenceProduct.error };
    const amplicon = newContainer({
      name: `${template.name || 'template'}_amplicon`,
      sequence: occurrenceProduct.sequence,
      circular: false,
      annotations: [],
      origin: {
        kind: 'op_pcr',
        operationId: operation.id,
        parentContainerId: templateId,
        occurrenceKeys: operation.params.occurrenceKeys,
        primerSnapshots: operation.params.primerSnapshots,
        fwdStart: occurrenceProduct.product.forward.start,
        revEnd: occurrenceProduct.product.reverse.end,
        wrapsOrigin: occurrenceProduct.product.wrapsOrigin,
      },
    });
    return { outputs: [amplicon] };
  }
  if (primerPairId && !autoDesign) {
    const oligo = ctx.containers[primerPairId];
    if (!oligo) return { error: `Праймер-пара не найдена: ${primerPairId}` };
    const seqs = oligo?.payload?.sequences || [];
    if (seqs.length < 2) {
      return { error: 'У oligonucleotide-контейнера должно быть 2 sequences (fwd + rev)' };
    }
    const fwdFull = (seqs[0]?.sequence || '').toUpperCase();
    const revFull = (seqs[1]?.sequence || '').toUpperCase();
    if (!fwdFull) return { error: 'Forward primer пустой' };
    if (!revFull) return { error: 'Reverse primer пустой' };
    // V175 (PRIMER-9) — anneal on the BINDING region only: a Gibson/RE 5'-tail
    // (homology arm / RE site) is NOT on the template, so searching the full
    // primer fails. The overhangs are incorporated into the product ENDS.
    // Tailless oligos: bindingSequence falls back to the full seq, tails are ''
    // → byte-identical to the prior behaviour.
    const fwdTail = (seqs[0]?.tail ?? seqs[0]?.tailSequence ?? '').toUpperCase();
    const revTail = (seqs[1]?.tail ?? seqs[1]?.tailSequence ?? '').toUpperCase();
    const fwdBind = explicitBinding(seqs[0], 'bindingSequence', fwdFull);
    const revBind = explicitBinding(seqs[1], 'bindingSequence', revFull);
    const anchorError = explicitPrimerAnchorError(fwdBind, revBind);
    if (anchorError) return { error: anchorError };
    const tplSeq = template.sequence.toUpperCase();
    const fwdIdx = tplSeq.indexOf(fwdBind);
    if (fwdIdx < 0) return { error: 'Forward primer не найден в темплейте' };
    const revRc = reverseComplement(revBind);
    const revRcIdx = tplSeq.indexOf(revRc, fwdIdx);
    if (revRcIdx < 0) return { error: 'Reverse primer не найден downstream от forward' };
    const ampliconSeq = fwdTail
      + template.sequence.slice(fwdIdx, revRcIdx + revBind.length)
      + reverseComplement(revTail);
    const amplicon = newContainer({
      name: `${template.name || 'template'}_amplicon`,
      sequence: ampliconSeq,
      circular: false,
      annotations: [],
      origin: {
        kind: 'op_pcr',
        operationId: operation.id,
        parentContainerId: templateId,
        primerPairId,
        fwdStart: fwdIdx,
        revEnd: revRcIdx + revBind.length,
      },
    });
    return { outputs: [amplicon] };
  }
  // V73 — primers selected/written in the PCR viewer (op.params.
  // userPrimers) are the user's explicit choice; consume them instead
  // of auto-designing. Same bio-correct amplicon math as the explicit
  // oligo-container branch above: locate the binding region on the
  // template (binding-only seq — 5′ tails are not templated), reverse
  // primer reverse-complemented downstream of forward.
  const userPair = operation.params?.userPrimers?.[0];
  if (!primerPairId && userPair && userPair.forward && userPair.reverse) {
    const tplSeq = template.sequence.toUpperCase();
    const fwdBind = explicitBinding(userPair, 'fwdBinding', userPair.forward);
    const revBind = explicitBinding(userPair, 'revBinding', userPair.reverse);
    const anchorError = explicitPrimerAnchorError(fwdBind, revBind);
    if (anchorError) return { error: anchorError };
    const fwdIdx = tplSeq.indexOf(fwdBind);
    if (fwdIdx < 0) return { error: 'Forward primer (выбранный в вьювере) не найден в темплейте' };
    const revRc = reverseComplement(revBind);
    const revRcIdx = tplSeq.indexOf(revRc, fwdIdx);
    if (revRcIdx < 0) return { error: 'Reverse primer (выбранный в вьювере) не найден downstream от forward' };
    const ampliconSeq = template.sequence.slice(fwdIdx, revRcIdx + revBind.length);
    const amplicon = newContainer({
      name: `${template.name || 'template'}_amplicon`,
      sequence: ampliconSeq,
      circular: false,
      annotations: [],
      origin: {
        kind: 'op_pcr',
        operationId: operation.id,
        parentContainerId: templateId,
        userPrimers: true,
        fwdStart: fwdIdx,
        revEnd: revRcIdx + revBind.length,
      },
    });
    // Emit the user's primers as an oligonucleotide container too — mirrors
    // the auto-design branch below — so they surface in PrimerOrderPanel
    // (oligo TSV/FASTA) and protocol-export. Without this they were ordered
    // in the viewer yet invisible to every export. (AM-PCR-OLIGO)
    const userOligoOut = makeUserOligoContainer(operation, templateId, template, userPair);
    return { outputs: [amplicon, userOligoOut] };
  }
  const designedPrimers = autoDesignPrimerPair(template.sequence);
  const designedPrimerError = autoDesignedPrimerError(designedPrimers);
  if (designedPrimerError) return { error: designedPrimerError };
  const ampliconSeq = template.sequence;
  const amplicon = newContainer({
    name: `${template.name || 'template'}_amplicon`,
    sequence: ampliconSeq,
    circular: false,
    annotations: template.annotations || [],
    origin: {
      kind: 'op_pcr',
      operationId: operation.id,
      parentContainerId: templateId,
      autoDesign: true,
      designedPrimers,
    },
  });
  const oligoOut = makeDesignedOligoContainer(operation, templateId, template, designedPrimers);
  return { outputs: [amplicon, oligoOut] };
}

function executeMultiTemplatePCR(operation, ctx, templateIds, primerPairId, autoDesign) {
  const amplicons = [];
  const errors = [];
  const skipped = [];

  if (primerPairId && !autoDesign) {
    const oligo = ctx.containers[primerPairId];
    if (!oligo) return { error: `Праймер-пара не найдена: ${primerPairId}` };
    const seqs = oligo?.payload?.sequences || [];
    if (seqs.length < 2) return { error: 'У oligonucleotide-контейнера должно быть 2 sequences' };
    const fwdFull = (seqs[0]?.sequence || '').toUpperCase();
    const revFull = (seqs[1]?.sequence || '').toUpperCase();
    if (!fwdFull || !revFull) return { error: 'Primer sequences пустые' };
    // V175 (PRIMER-9) — anneal on binding only; overhangs go to product ends.
    const fwdTail = (seqs[0]?.tail ?? seqs[0]?.tailSequence ?? '').toUpperCase();
    const revTail = (seqs[1]?.tail ?? seqs[1]?.tailSequence ?? '').toUpperCase();
    const fwd = explicitBinding(seqs[0], 'bindingSequence', fwdFull);
    const rev = explicitBinding(seqs[1], 'bindingSequence', revFull);
    const anchorError = explicitPrimerAnchorError(fwd, rev);
    if (anchorError) return { error: anchorError };
    const revRc = reverseComplement(rev);
    for (const tid of templateIds) {
      const template = ctx.containers[tid];
      if (!template) {
        errors.push(`${tid}: не найден`);
        continue;
      }
      if (!template.sequence) {
        errors.push(`${template.name || tid}: без последовательности`);
        continue;
      }
      const tplSeq = template.sequence.toUpperCase();
      const fwdIdx = tplSeq.indexOf(fwd);
      if (fwdIdx < 0) {
        skipped.push(template.name || tid);
        continue;
      }
      const revRcIdx = tplSeq.indexOf(revRc, fwdIdx);
      if (revRcIdx < 0) {
        skipped.push(template.name || tid);
        continue;
      }
      const ampliconSeq = fwdTail
        + template.sequence.slice(fwdIdx, revRcIdx + rev.length)
        + reverseComplement(revTail);
      amplicons.push(newContainer({
        name: `${template.name || 'template'}_amplicon`,
        sequence: ampliconSeq,
        circular: false,
        annotations: [],
        origin: {
          kind: 'op_pcr',
          operationId: operation.id,
          parentContainerId: tid,
          primerPairId,
          fwdStart: fwdIdx,
          revEnd: revRcIdx + rev.length,
          multiTemplate: true,
          skipped,
        },
      }));
    }
    if (amplicons.length === 0) {
      return { error: `Multi-PCR: ни один template не аннелировал к primer pair. ${errors.join('; ')}` };
    }
    return { outputs: amplicons };
  }

  const outputs = [];
  for (const tid of templateIds) {
    const template = ctx.containers[tid];
    if (!template || !template.sequence) {
      errors.push(`${tid}: invalid`);
      continue;
    }
    const designedPrimers = autoDesignPrimerPair(template.sequence);
    const designedPrimerError = autoDesignedPrimerError(designedPrimers);
    if (designedPrimerError) {
      skipped.push(template.name || tid);
      errors.push(`${template.name || tid}: ${designedPrimerError}`);
      continue;
    }
    const amplicon = newContainer({
      name: `${template.name || 'template'}_amplicon`,
      sequence: template.sequence,
      circular: false,
      annotations: template.annotations || [],
      origin: {
        kind: 'op_pcr',
        operationId: operation.id,
        parentContainerId: tid,
        autoDesign: true,
        designedPrimers,
        multiTemplate: true,
        skipped,
      },
    });
    const oligoOut = makeDesignedOligoContainer(operation, tid, template, designedPrimers);
    outputs.push(amplicon, oligoOut);
  }
  if (outputs.length === 0) {
    return { error: `Multi-PCR: ни один template не дал пригодные праймеры. ${errors.join('; ')}` };
  }
  return { outputs };
}
