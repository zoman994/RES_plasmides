/**
 * adapters/blunt.js — executeBlunt adapter (GAP-1, Игорь /loop 28.06).
 *
 * An exonuclease/polymerase end-blunting reaction: ONE fragment with sticky
 * ends → ONE blunt-ended fragment. The biology (which enzyme blunts which
 * overhang, fill vs chew) lives in lib/end-blunting.js. This adapter maps the
 * container `ends` model ({fivePrime,threePrime:{overhang,type:'5overhang'
 * |'3overhang'|'blunt'}}) onto that engine, validates the enzyme can blunt
 * every overhang the fragment has, and emits the blunt product.
 *
 * Sequence: KEPT as-is. Overhangs are metadata at the container level (cut
 * slices at the top cut — V155/V159), so making an end blunt resolves the
 * overhang without rewriting the stored top strand. A naive trim would be
 * biologically wrong (the overhang bases may live on the neighbour fragment).
 * `origin.overhangsRemoved` records the footprint shrink for downstream display.
 */
import { newContainer } from './_shared';
import { resolveOpTemplate } from '../../../lib/op-piece-bridge';
import { BLUNTING_ENZYMES, bluntEnd } from '../../../lib/end-blunting';

/** container end {overhang,type:'5overhang'|'3overhang'|'blunt'} → engine end. */
function toEngineEnd(cEnd) {
  if (!cEnd) return null;
  if (cEnd.type === 'blunt') return { type: 'blunt', seq: '', delta: 0 };
  const five = cEnd.type === '5overhang';
  const len = (cEnd.overhang || '').length;
  return { type: five ? '5prime' : '3prime', seq: cEnd.overhang || '', delta: five ? len : -len };
}

export function executeBlunt(operation, ctx) {
  const inputId = operation.params?.templateId || operation.inputs?.[0];
  const enzymeKey = operation.params?.enzyme || 'T4pol';
  const input = (operation.inputPieces && operation.inputPieces.length > 0
    ? resolveOpTemplate(operation, ctx)
    : null) || ctx.containers[inputId];
  if (!input) return { error: `Фрагмент не найден: ${inputId}` };
  if (!input.sequence) return { error: 'Фрагмент без последовательности' };
  if (!BLUNTING_ENZYMES[enzymeKey]) return { error: `Неизвестный фермент затупления: ${enzymeKey}` };

  const ends = input.ends || {};
  const left = bluntEnd(toEngineEnd(ends.fivePrime), enzymeKey);
  const right = bluntEnd(toEngineEnd(ends.threePrime), enzymeKey);
  if (!left.ok) return { error: `Левый конец: ${left.reason}` };
  if (!right.ok) return { error: `Правый конец: ${right.reason}` };

  const bluntMeta = (mode) => ({ overhang: '', type: 'blunt', enzymeUsed: enzymeKey, blunted: mode });
  const overhangsRemoved = (left.mode === 'chew' ? left.overhangLen : 0)
    + (right.mode === 'chew' ? right.overhangLen : 0);
  const out = newContainer({
    name: `${input.name || 'fragment'}_blunt`,
    sequence: input.sequence,
    circular: false,
    annotations: Array.isArray(input.annotations) ? input.annotations : [],
    ends: { fivePrime: bluntMeta(left.mode), threePrime: bluntMeta(right.mode) },
    origin: {
      kind: 'op_blunt',
      operationId: operation.id,
      parentContainerId: inputId,
      enzyme: enzymeKey,
      leftMode: left.mode,
      rightMode: right.mode,
      overhangsRemoved,
    },
  });
  return { outputs: [out] };
}
