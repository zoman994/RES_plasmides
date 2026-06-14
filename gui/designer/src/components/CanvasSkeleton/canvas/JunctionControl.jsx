/**
 * JunctionControl — JUNCTION layer 3 J6. The inline per-junction editor for the
 * LIVE zone.junctions[pairKey] config (pre-realise), an EVOLUTION of
 * JunctionPopover (not a rebuild): it reuses JunctionPopover's whole UI — the
 * 6-method picker, overlapTarget L/R/both, length⊕Tm, ends-preview, validation,
 * status АВТО/ВРУЧНУЮ, Escape-close, reset-to-auto — and adapts it from the
 * post-realise container-junction shape to the zone.junctions config:
 *
 *   • config.method is the ENGINE dict (overlap_pcr|gibson|golden_gate|
 *     restriction|direct_ligation|kld); JunctionPopover speaks junction.kind, so
 *     we map method→kind for display and kind→method on pick (junction-derive).
 *   • config.autoMode:'manual' → JunctionPopover status 'manual'.
 *   • onChange(patch) → the parent dispatches SET_BOUNDARY_OVERLAP(zoneId,
 *     pairKey, ...patch); reset-to-auto sends the seed defaults + autoMode:'auto'.
 *
 * Binding-pair (length/Tm) handles + method-filter by role + the suggestion
 * badge are step 3 (J6 §5); step 2 lands the surface + method/overlap edit.
 */
import JunctionPopover from './JunctionPopover';
import {
  junctionKindForMethod, methodForJunctionKind, seedJunction, INTERNAL_METHODS,
  defaultEnzymeForMethod,
} from '../lib/junction-derive';
import { defaultJunctionParams } from './junction-styles';

// JC-1 — this glyph is ALWAYS an internal-fuse boundary (the closure is set only
// in CircularizeModal). Internal fuses are biologically limited to overlap-PCR /
// restriction → kinds overlap / re_ligation. (KLD/Gibson/blunt are circular
// one-pot / single-fragment reactions, not internal fuses.)
const INTERNAL_KINDS = INTERNAL_METHODS.map(junctionKindForMethod);

export default function JunctionControl({
  pairKey, config, position, warnings, onChange, onClose, onMakeAssemblyMethod,
}) {
  if (!pairKey) return null;
  const cfg = config || seedJunction();
  // Adapt the engine-dict config → the JunctionPopover junction shape.
  const junction = {
    kind: junctionKindForMethod(cfg.method || 'overlap_pcr'),
    overlapTarget: cfg.overlapTarget != null ? cfg.overlapTarget : 'right',
    overlapLength: cfg.overlapLength,
    overlapTm: cfg.overlapTm,
    // F — surface the chosen enzyme (GG/RE) so the popover's picker reflects it.
    enzyme: cfg.enzyme,
    status: cfg.autoMode === 'manual' ? 'manual' : 'auto',
  };
  return (
    <JunctionPopover
      junction={junction}
      position={position}
      warnings={warnings || []}
      allowedKinds={INTERNAL_KINDS}
      onPick={(kindId) => {
        if (!onChange) return;
        // JC-3 — re-picking the displayed kind is a no-op (the gibson→overlap
        // round-trip would silently downgrade the method otherwise).
        if (junction.kind === kindId) return;
        // JC-4 — snap overlap params to the new kind's defaults so a stale
        // overlapLength (e.g. 30 bp) can't linger on a non-overlap chemistry.
        // F — seed the new kind's default enzyme (RE→EcoRI; overlap→null clears).
        const method = methodForJunctionKind(kindId);
        onChange({ method, enzyme: defaultEnzymeForMethod(method), ...defaultJunctionParams(kindId) });
      }}
      onSetParams={(patch) => onChange && onChange(patch)}
      onResetAuto={() => onChange && onChange({ ...seedJunction(), autoMode: 'auto' })}
      onCancel={onClose}
      onMakeAssemblyMethod={onMakeAssemblyMethod}
    />
  );
}
