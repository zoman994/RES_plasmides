/**
 * operation-product-assembly — pure product-sequence assembly for the
 * live virtual preview. F4 M-CANVAS-PRODUCT (DEC-CANVAS-PROD-03).
 *
 * ═══════════════════ K1 — R5-R9 reuse audit ══════════════════════════
 * FINDING: do NOT reimplement per-kind assembly. `executeOperation`
 * (components/CanvasSkeleton/canvas/operations/lib-adapters.js) is
 * already PURE — it takes (operation, ctx={containers}) and returns
 * {outputs:[container]} | {error}. All side-effects (freeze inputs,
 * push toast, annotation enrich, conflict scan) live in skeleton-state
 * `handleOpExecute`, NOT in the adapters. So wrapping executeOperation
 * gives a virtual preview that is byte-identical to what OP_EXECUTE
 * will produce — zero drift, zero duplication.
 *
 *   - executeOperation → getAdapter(op.kind) → per-kind v0.5 algo.
 *     Covers pcr / gibson / golden_gate / kld / ligate / cut /
 *     mutagenesis (whatever op-kinds-registry registers).
 *   - status is NOT gated inside executeOperation (handleOpExecute
 *     gates committed→executed); safe to call for a committed/draft op
 *     to preview. Insufficient inputs/params → adapter returns {error}
 *     → that IS the 'disconnected' signal.
 *   - R9-4 annotation enrich (auto-annotate / annotation-conflicts) is
 *     applied in handleOpExecute AFTER adapters; the adapter output
 *     already carries base annotations (DEC-PROD-07 transfer covered;
 *     no gap → no TECH_DEBT).
 *   - lib/bio/* (gibson-primer-design / sanger / codon / strain /
 *     annotation-conflicts) are primer-design / validation helpers —
 *     NOT assembly; not needed here (executeOperation encapsulates it).
 *
 * GAPS: none blocking. Annotation edge cases on partial PCR selection
 * are owned by the pcr adapter (already tested in R5-R9 suites).
 * ══════════════════════════════════════════════════════════════════════
 */
import { executeOperation } from '../canvas/operations/lib-adapters';

/**
 * assembleProduct — pure: returns the would-be product of `op` given
 * its input containers. {ok, sequence?, topology?, annotations?, error?}
 */
export function assembleProduct(op, inputsById) {
  if (!op || !op.kind) return { ok: false, error: 'no_kind' };
  if (!Array.isArray(op.inputs) || op.inputs.length === 0) {
    return { ok: false, error: 'no_inputs' };
  }
  let result;
  try {
    result = executeOperation(op, { containers: inputsById || {} });
  } catch (e) {
    return { ok: false, error: e?.message || 'assembly_error' };
  }
  if (!result || result.error) {
    return { ok: false, error: result?.error || 'unsupported_kind' };
  }
  const out = Array.isArray(result.outputs) ? result.outputs[0] : null;
  if (!out || !out.sequence) return { ok: false, error: 'no_output' };
  return {
    ok: true,
    sequence: out.sequence,
    topology: out.topology || { circular: false },
    annotations: Array.isArray(out.annotations) ? out.annotations : [],
    name: out.name,
  };
}
