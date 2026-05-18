/**
 * adapters/golden-gate.js — executeGoldenGate (Type IIS, 4-nt overhang).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * S2 (14.05.2026): trim recognition site + 4-nt sticky overhangs.
 */
import { GG_ENZYMES } from '../../../../../golden-gate';
import {
  newContainer,
  concatWithOverlapTrim,
  mergeAnnotationsForConcat,
} from './_shared';

export function executeGoldenGate(operation, ctx) {
  const fragmentIds = operation.params?.fragmentIds || operation.inputs || [];
  const enzyme = operation.params?.enzyme || 'BsaI';
  const circular = operation.params?.circular !== false;
  if (fragmentIds.length < 2) return { error: 'Нужно ≥2 фрагментов' };

  const fragments = fragmentIds.map((id) => ctx.containers[id]).filter(Boolean);
  if (fragments.length !== fragmentIds.length) {
    return { error: 'Один или несколько фрагментов не найдены' };
  }

  const enzInfo = GG_ENZYMES[enzyme];
  const recog = (enzInfo?.recognition || '').toUpperCase();
  let recogTrimmed = 0;
  const trim = (s, isFirst, isLast) => {
    if (!s || !recog) return s;
    let r = s;
    const ru = r.toUpperCase();
    if (!isFirst && ru.startsWith(recog)) {
      r = r.slice(recog.length);
      recogTrimmed += recog.length;
    }
    if (!isLast && r.toUpperCase().endsWith(recog)) {
      r = r.slice(0, r.length - recog.length);
      recogTrimmed += recog.length;
    }
    return r;
  };
  const trimmedSeqs = fragments.map((f, i) => trim(
    f.sequence,
    i === 0 && !circular,
    i === fragments.length - 1 && !circular,
  ));
  const { seq: concat, overlaps } = concatWithOverlapTrim(trimmedSeqs, circular);

  // R5-3: annotation merge с recog trimming shift.
  const trimmedFragments = fragments.map((f, i) => {
    const isFirst = i === 0 && !circular;
    const isLast = i === fragments.length - 1 && !circular;
    let leftTrim = 0;
    if (!isFirst && (f.sequence || '').toUpperCase().startsWith(recog)) {
      leftTrim = recog.length;
    }
    let rightTrim = 0;
    if (!isLast && (f.sequence || '').toUpperCase().endsWith(recog)) {
      rightTrim = recog.length;
    }
    const newLen = (f.sequence || '').length - leftTrim - rightTrim;
    const shiftedAnns = (Array.isArray(f.annotations) ? f.annotations : [])
      .filter((a) => typeof a?.start === 'number' && typeof a?.end === 'number')
      .map((a) => ({ ...a, start: a.start - leftTrim, end: a.end - leftTrim }))
      .filter((a) => a.start >= 0 && a.end <= newLen && a.end > a.start);
    return { ...f, sequence: trimmedSeqs[i], annotations: shiftedAnns };
  });
  const mergedAnns = mergeAnnotationsForConcat(trimmedFragments, overlaps);
  const parentNames = fragments.map((f) => f.name || 'frag').join('+');

  const assembly = newContainer({
    name: parentNames.length < 60 ? `${parentNames}_gg_${enzyme}` : `gg_${enzyme}_assembly`,
    sequence: concat,
    circular,
    annotations: mergedAnns,
    origin: {
      kind: 'op_golden_gate',
      operationId: operation.id,
      enzyme,
      method: 'goldengate',
      inputIds: fragmentIds,
      overlaps,
      recogTrimmed,
    },
  });
  return { outputs: [assembly] };
}
