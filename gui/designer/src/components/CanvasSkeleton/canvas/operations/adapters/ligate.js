/**
 * adapters/ligate.js — executeLigate (sticky / blunt).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * S2 (14.05.2026): sticky-end overlap trim (короткий 1-6 nt); blunt
 * = pure concat без overlap.
 */
import {
  newContainer,
  findOverlap,
  mergeAnnotationsForConcat,
} from './_shared';
import { resolveOpInputContainers } from '../../../lib/op-piece-bridge';

export function executeLigate(operation, ctx) {
  // T2 DEC-T2-01 hybrid — multi-input via inputPieces only when set.
  const usePieces = operation.inputPieces && operation.inputPieces.length > 0;
  const fragmentIds = operation.params?.fragmentIds || operation.inputs || [];
  const ends = operation.params?.ends || 'blunt';
  const circular = operation.params?.circular !== false;
  const count = usePieces ? operation.inputPieces.length : fragmentIds.length;
  if (count < 2) return { error: 'Нужно ≥2 фрагментов' };

  const fragments = usePieces
    ? resolveOpInputContainers(operation, ctx)
    : fragmentIds.map((id) => ctx.containers[id]).filter(Boolean);
  if (fragments.length !== count) {
    return { error: 'Один или несколько фрагментов не найдены' };
  }

  const seqs = fragments.map((f) => f.sequence || '');
  let concat;
  let overlaps = [];
  if (ends === 'sticky') {
    const result = (function () {
      if (seqs.length === 0) return { seq: '', overlaps: [] };
      let acc = seqs[0];
      const olaps = [];
      for (let i = 1; i < seqs.length; i += 1) {
        const k = findOverlap(acc, seqs[i], 6, 1);
        olaps.push(k);
        acc += seqs[i].slice(k);
      }
      if (circular && seqs.length > 1) {
        const k = findOverlap(acc, seqs[0], 6, 1);
        olaps.push(k);
        if (k > 0) acc = acc.slice(0, acc.length - k);
      }
      return { seq: acc, overlaps: olaps };
    }());
    concat = result.seq;
    overlaps = result.overlaps;
  } else {
    concat = seqs.join('');
    overlaps = new Array(Math.max(0, seqs.length - 1)).fill(0);
  }

  const mergedAnns = mergeAnnotationsForConcat(fragments, overlaps);
  const parentNames = fragments.map((f) => f.name || 'frag').join('+');

  const assembly = newContainer({
    name: parentNames.length < 60 ? `${parentNames}_ligate_${ends}` : `ligate_${ends}_assembly`,
    sequence: concat,
    circular,
    annotations: mergedAnns,
    origin: {
      kind: 'op_ligate',
      operationId: operation.id,
      ends,
      inputIds: fragmentIds,
      overlaps,
    },
  });
  return { outputs: [assembly] };
}
