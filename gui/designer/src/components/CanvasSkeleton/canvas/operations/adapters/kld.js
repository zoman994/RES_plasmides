/**
 * adapters/kld.js — executeKLD (Kinase + Ligase + DpnI mutagenesis).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * R6-1 pipeline:
 *   1. Find fwd/rev annealing positions on circular template (≥10 nt).
 *   2. Verify back-to-back orientation (longWay ≤ shortWay).
 *   3. Build circular mutant = fwd_full + interior + revRc_full.
 *   4. Annotations внутри interior preserved with shift.
 *   5. DpnI digest assumed (origin.dpniDigest); skeleton doesn't track
 *      methylation, так это noop.
 */
import { newContainer, reverseComplement } from './_shared';
import { resolveOpTemplate } from '../../../lib/op-piece-bridge';

export function executeKLD(operation, ctx) {
  const templateId = operation.params?.templateId || operation.inputs?.[0];
  const primerPairId = operation.params?.primerPairId;
  // T2 DEC-T2-01 hybrid — piece-resolve only when inputPieces set.
  const template = (operation.inputPieces && operation.inputPieces.length > 0
    ? resolveOpTemplate(operation, ctx)
    : null) || ctx.containers[templateId];
  if (!template) return { error: `Темплейт не найден: ${templateId}` };
  if (!template.topology?.circular) return { error: 'KLD требует circular template' };
  if (!primerPairId) return { error: 'KLD требует праймер-пару (oligonucleotide)' };

  const oligo = ctx.containers[primerPairId];
  if (!oligo) return { error: `Праймер-пара не найдена: ${primerPairId}` };
  const seqs = oligo?.payload?.sequences || [];
  if (seqs.length < 2) return { error: 'У праймер-пары должно быть 2 sequences (fwd + rev)' };

  const fwd = (seqs[0]?.sequence || '').toUpperCase();
  const rev = (seqs[1]?.sequence || '').toUpperCase();
  if (!fwd) return { error: 'Forward primer пустой' };
  if (!rev) return { error: 'Reverse primer пустой' };

  const tplOrig = template.sequence;
  const tpl = tplOrig.toUpperCase();
  const L = tpl.length;
  const tpl2 = tpl + tpl;

  const findAnneal = (primer) => {
    for (let n = Math.min(primer.length, 40); n >= 10; n -= 1) {
      const tail3 = primer.slice(primer.length - n);
      const idx = tpl2.indexOf(tail3);
      if (idx >= 0 && idx < L) {
        return { annealLen: n, annealStart: idx, primerTailLen: primer.length - n };
      }
    }
    return null;
  };

  const fwdA = findAnneal(fwd);
  if (!fwdA) return { error: 'Forward primer не аннелирует к темплейту (нужен ≥10 nt match на 3-конце)' };
  const revRc = reverseComplement(rev);
  const revA = findAnneal(revRc);
  if (!revA) return { error: 'Reverse primer не аннелирует к темплейту (revRC не найден в top strand)' };

  const fwdAnnealEnd = fwdA.annealStart + fwdA.annealLen;
  const shortWay = (revA.annealStart - fwdAnnealEnd + L) % L;
  const longWay = (fwdA.annealStart - (revA.annealStart + revA.annealLen) + L) % L;
  if (longWay > shortWay) {
    return { error: `KLD: праймеры не back-to-back (face each other). Interior ${shortWay}bp, gap ${longWay}bp. Для KLD primers должны point AWAY друг от друга.` };
  }
  const gap = longWay;
  if (gap > 50) {
    return { error: `KLD: gap слишком большой (${gap} bp). Allow ≤50 bp deletion mutations.` };
  }

  let interior;
  if (revA.annealStart >= fwdAnnealEnd) {
    interior = tplOrig.slice(fwdAnnealEnd, revA.annealStart);
  } else {
    interior = tplOrig.slice(fwdAnnealEnd) + tplOrig.slice(0, revA.annealStart);
  }

  const mutantSeq = fwd + interior + revRc;

  const newAnnotations = [];
  const anns = Array.isArray(template.annotations) ? template.annotations : [];
  const interiorLen = interior.length;
  const firstPartLen = revA.annealStart >= fwdAnnealEnd ? interiorLen : (L - fwdAnnealEnd);
  for (const ann of anns) {
    if (typeof ann?.start !== 'number' || typeof ann?.end !== 'number') continue;
    if (revA.annealStart >= fwdAnnealEnd) {
      if (ann.start >= fwdAnnealEnd && ann.end <= revA.annealStart) {
        newAnnotations.push({
          ...ann,
          start: fwd.length + (ann.start - fwdAnnealEnd),
          end: fwd.length + (ann.end - fwdAnnealEnd),
        });
      }
    } else {
      if (ann.start >= fwdAnnealEnd && ann.end <= L) {
        newAnnotations.push({
          ...ann,
          start: fwd.length + (ann.start - fwdAnnealEnd),
          end: fwd.length + (ann.end - fwdAnnealEnd),
        });
      } else if (ann.start >= 0 && ann.end <= revA.annealStart) {
        newAnnotations.push({
          ...ann,
          start: fwd.length + firstPartLen + ann.start,
          end: fwd.length + firstPartLen + ann.end,
        });
      }
    }
  }

  const mutant = newContainer({
    name: `${template.name || 'template'}_kld`,
    sequence: mutantSeq,
    circular: true,
    annotations: newAnnotations,
    origin: {
      kind: 'op_kld',
      operationId: operation.id,
      parentContainerId: templateId,
      primerPairId,
      fwdTailLen: fwdA.primerTailLen,
      revTailLen: revA.primerTailLen,
      fwdAnnealLen: fwdA.annealLen,
      revAnnealLen: revA.annealLen,
      deletionSize: gap,
      insertionSize: fwdA.primerTailLen + revA.primerTailLen,
      dpniDigest: operation.params?.dpniDigest !== false,
    },
  });
  return { outputs: [mutant] };
}
