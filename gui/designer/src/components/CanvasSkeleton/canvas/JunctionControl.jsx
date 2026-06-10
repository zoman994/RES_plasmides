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
import { junctionKindForMethod, methodForJunctionKind, seedJunction } from '../lib/junction-derive';

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
    status: cfg.autoMode === 'manual' ? 'manual' : 'auto',
  };
  return (
    <JunctionPopover
      junction={junction}
      position={position}
      warnings={warnings || []}
      onPick={(kindId) => onChange && onChange({ method: methodForJunctionKind(kindId) })}
      onSetParams={(patch) => onChange && onChange(patch)}
      onResetAuto={() => onChange && onChange({ ...seedJunction(), autoMode: 'auto' })}
      onCancel={onClose}
      onMakeAssemblyMethod={onMakeAssemblyMethod}
    />
  );
}
