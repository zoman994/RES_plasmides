/**
 * selectors-pcr — pure reactive selectors for PCR operation mode.
 * F3 M-CANVAS-PCR (DEC-CANVAS-PCR-05). Consumers subscribe via
 * `useStore(s => selectPcrPrimers(s, opId))`.
 */
import { suggestPrimers } from '../lib/operation-pcr-bridge';
import { selectTailsForJunction } from './selectors-junction';
import { reverseComplement } from '../../../sequence-utils';

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
 * selectPcrSpans — where the chosen PCR primers bind on the template
 * and the region they flank, for the canvas MiniPlasmidMap overlay
 * (V75). Same binding-match math as adapters/pcr.js executeSingle
 * TemplatePCR: forward binding indexOf'd on the top strand, reverse
 * binding reverse-complemented and found downstream. Returns null
 * (no overlay) when the op is not a resolvable PCR or the chosen
 * primers don't actually bind the template.
 *
 * @returns {{flank:{start,end}, primers:Array<{start,end,direction,name}>}|null}
 */
export function selectPcrSpans(state, operationId) {
  const op = (state?.operations || []).find((o) => o.id === operationId);
  if (!op || op.kind !== 'pcr') return null;
  const template = selectTemplateForOp(state, operationId);
  if (!template || !template.sequence) return null;
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
  return {
    flank: { start: fStart, end: rEnd },
    primers: [
      { start: fStart, end: fStart + fwdBind.length, direction: 'forward', name: p.fwdName || 'fwd' },
      { start: rStart, end: rEnd, direction: 'reverse', name: p.revName || 'rev' },
    ],
  };
}
