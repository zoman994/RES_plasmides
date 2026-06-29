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
    const fwdBind = (seqs[0]?.bindingSequence || fwdFull).toUpperCase();
    const revBind = (seqs[1]?.bindingSequence || revFull).toUpperCase();
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
    const fwdBind = String(userPair.fwdBinding || userPair.forward).toUpperCase();
    const revBind = String(userPair.revBinding || userPair.reverse).toUpperCase();
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
    const fwd = (seqs[0]?.bindingSequence || fwdFull).toUpperCase();
    const rev = (seqs[1]?.bindingSequence || revFull).toUpperCase();
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
      },
    });
    const oligoOut = makeDesignedOligoContainer(operation, tid, template, designedPrimers);
    outputs.push(amplicon, oligoOut);
  }
  if (outputs.length === 0) {
    return { error: `Multi-PCR: ни один template не валиден. ${errors.join('; ')}` };
  }
  return { outputs };
}
