/**
 * adapters/gibson.js — executeGibson (overlap-trim concat).
 *
 * R9-2 (14.05.2026): extracted from lib-adapters.js.
 *
 * S2 (14.05.2026): overlap trimming для real Gibson fidelity. Для
 * circular — также trim между last и first fragment.
 */
import {
  newContainer,
  concatWithOverlapTrim,
  mergeAnnotationsForConcat,
} from './_shared';
import { resolveOpInputContainers } from '../../../lib/op-piece-bridge';

export function executeGibson(operation, ctx) {
  // T2 DEC-T2-01 hybrid — multi-input via inputPieces only when set.
  const usePieces = operation.inputPieces && operation.inputPieces.length > 0;
  const fragmentIds = operation.params?.fragmentIds || operation.inputs || [];
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
  const { seq: concat, overlaps } = concatWithOverlapTrim(seqs, circular);
  const missingOverlap = overlaps.filter((k) => k === 0).length;
  const mergedAnns = mergeAnnotationsForConcat(fragments, overlaps);
  const parentNames = fragments.map((f) => f.name || 'frag').join('+');
  const assembly = newContainer({
    name: parentNames.length < 60 ? `${parentNames}_gibson` : 'gibson_assembly',
    sequence: concat,
    circular,
    annotations: mergedAnns,
    origin: {
      kind: 'op_gibson',
      operationId: operation.id,
      method: 'overlap',
      inputIds: fragmentIds,
      overlaps,
      missingOverlap,
    },
  });
  return { outputs: [assembly] };
}
