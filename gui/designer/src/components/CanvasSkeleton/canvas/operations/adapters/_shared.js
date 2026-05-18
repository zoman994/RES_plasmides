/**
 * adapters/_shared.js — общие helpers всех adapter modules.
 *
 * R9-2 (14.05.2026 — DEC-OPS-LIB-ADAPTERS-SPLIT). Раскол монолитного
 * lib-adapters.js (~40 KB) на per-op файлы. _shared.js содержит:
 *   - newContainer
 *   - reverseComplement
 *   - findOverlap (suffix-prefix)
 *   - concatWithOverlapTrim (Gibson-style)
 *   - mergeAnnotationsForConcat (multi-fragment annotation re-coord)
 *   - autoDesignPrimerPair (Tm-aware bracketing primers)
 *   - makeDesignedOligoContainer (factory)
 */
import { v7 as uuidv7 } from 'uuid';
import { calcTm } from '../../../../../tm-calculator';

export function newContainer({ name, sequence, circular = false, annotations = [], origin = {}, ends = null }) {
  return {
    id: uuidv7(),
    kind: 'molecule',
    name,
    topology: { circular },
    length: sequence.length,
    sequence,
    annotations,
    ends,
    origin,
    parentCommitId: null,
  };
}

export const COMPLEMENT_DNA = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

export function reverseComplement(s) {
  if (!s) return '';
  return s.toUpperCase().split('').reverse().map((c) => COMPLEMENT_DNA[c] || c).join('');
}

/**
 * findOverlap — наибольший суффикс A, совпадающий с префиксом B
 * (case-insensitive). Возвращает длину overlap'а (>=0).
 */
export function findOverlap(a, b, maxLen = 40, minLen = 15) {
  if (!a || !b) return 0;
  const aUp = a.toUpperCase();
  const bUp = b.toUpperCase();
  const lim = Math.min(maxLen, aUp.length, bUp.length);
  for (let k = lim; k >= minLen; k -= 1) {
    if (aUp.slice(aUp.length - k) === bUp.slice(0, k)) return k;
  }
  return 0;
}

/**
 * concatWithOverlapTrim — sequential concat избегая duplicate overlaps.
 */
export function concatWithOverlapTrim(seqs, circular) {
  if (seqs.length === 0) return { seq: '', overlaps: [] };
  let acc = seqs[0];
  const overlaps = [];
  for (let i = 1; i < seqs.length; i += 1) {
    const k = findOverlap(acc, seqs[i]);
    overlaps.push(k);
    acc += seqs[i].slice(k);
  }
  if (circular && seqs.length > 1) {
    const k = findOverlap(acc, seqs[0]);
    overlaps.push(k);
    if (k > 0) acc = acc.slice(0, acc.length - k);
  }
  return { seq: acc, overlaps };
}

/**
 * mergeAnnotationsForConcat — re-coord annotations для merged assembly.
 *
 * R5-1 (14.05.2026): preserve ori/AmpR/MCS из родительских фрагментов.
 */
export function mergeAnnotationsForConcat(fragments, overlaps) {
  if (!Array.isArray(fragments) || fragments.length === 0) return [];
  const merged = [];
  let offset = 0;
  for (let i = 0; i < fragments.length; i += 1) {
    const f = fragments[i];
    const anns = Array.isArray(f.annotations) ? f.annotations : [];
    for (const ann of anns) {
      if (typeof ann?.start !== 'number' || typeof ann?.end !== 'number') continue;
      if (i > 0 && ann.end <= overlaps[i - 1]) continue;
      const newStart = ann.start + offset;
      const newEnd = ann.end + offset;
      if (newEnd > newStart) {
        merged.push({ ...ann, start: newStart, end: newEnd });
      }
    }
    const seqLen = (f.sequence || '').length;
    const nextOverlap = i < fragments.length - 1 ? (overlaps[i] || 0) : 0;
    offset += seqLen - nextOverlap;
  }
  return merged;
}

/**
 * autoDesignPrimerPair — Tm-aware bracketing primer pair для linear template.
 *
 * R4-BIO-5 (14.05.2026): picks shortest segment from each end, picks the
 * length с Tm closest to target (58°C default). Range 18-26 nt.
 */
export function autoDesignPrimerPair(seq, opts = {}) {
  const targetTm = opts.targetTm ?? 58;
  const minLen = 18;
  const maxLen = 26;
  const pickBest = (anchor) => {
    let best = null;
    for (let n = minLen; n <= maxLen; n += 1) {
      const sub = anchor === 'forward' ? seq.slice(0, n) : seq.slice(seq.length - n);
      let s = sub;
      if (anchor === 'reverse') s = reverseComplement(sub);
      const tm = calcTm(s);
      const gc = ((s.toUpperCase().match(/[GC]/g) || []).length / s.length) * 100;
      const diff = Math.abs(tm - targetTm);
      if (!best || diff < best.diff) {
        best = {
          sequence: s,
          length: s.length,
          Tm: Math.round(tm * 10) / 10,
          GC: Math.round(gc * 10) / 10,
          diff,
        };
      }
    }
    return { sequence: best.sequence, length: best.length, Tm: best.Tm, GC: best.GC };
  };
  return { forward: pickBest('forward'), reverse: pickBest('reverse') };
}

/**
 * makeDesignedOligoContainer — factory for oligonucleotide container
 * с designed primer pair attached.
 */
export function makeDesignedOligoContainer(operation, templateId, template, designedPrimers) {
  return {
    id: uuidv7(),
    kind: 'oligonucleotide',
    name: `${template.name || 'template'}_primers`,
    topology: { circular: false },
    length: 0,
    sequence: '',
    annotations: [],
    ends: null,
    payload: {
      sequences: [
        { name: 'fwd', sequence: designedPrimers.forward.sequence, Tm: designedPrimers.forward.Tm, GC: designedPrimers.forward.GC },
        { name: 'rev', sequence: designedPrimers.reverse.sequence, Tm: designedPrimers.reverse.Tm, GC: designedPrimers.reverse.GC },
      ],
      purpose: 'pcr_primer',
    },
    origin: { kind: 'op_pcr_designed', operationId: operation.id, parentContainerId: templateId },
    parentCommitId: null,
  };
}
