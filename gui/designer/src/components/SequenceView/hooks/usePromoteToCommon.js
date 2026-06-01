/**
 * usePromoteToCommon — DRY wiring for the «Add to common features» flow
 * (SPEC_COMMON_FEATURES DEC-CF-05). A viewer mounts this once and spreads the
 * two callbacks onto <SequenceView>:
 *
 *   const p = usePromoteToCommon();
 *   <SequenceView onPromoteToCommon={p.onPromoteToCommon}
 *                 checkCommonDuplicate={p.checkCommonDuplicate} … />
 *
 * `onPromoteToCommon` writes to the overlay slice (promoteFeature, which
 * dedups via the shared match-core). `checkCommonDuplicate` is the modal's
 * pre-confirm probe — same dedup verdict, so the warning the biolog sees
 * matches what the write will do.
 *
 * Protein for CDS/marker/reporter promotes (DEC-CF-D): the modal hands us the
 * region's coding-strand DNA (strand already baked in at draft time), so here
 * we translate frame-0 to get `protein` — net-new CDS then detects via the
 * protein pathway, exactly like a factory CDS.
 */
import { useCallback } from 'react';
import { useStore } from '../../../store';
import { translateDNA } from '../../../codons';
import { getMergedFeatureDB } from '../../../store/commonFeaturesSlice';
import { checkDuplicateAgainst } from '../../../lib/feature-dedup';

const PROTEIN_TYPES = new Set(['CDS', 'marker', 'reporter']);

/** Build the overlay-feature candidate from the modal payload. */
export function buildPromoteCandidate({ name, type, sequence }) {
  const coding = String(sequence || '').toUpperCase().replace(/[^A-Z]/g, '');
  const candidate = {
    name: String(name || '').trim(),
    type: type || 'misc_feature',
    sequence: coding,
  };
  if (PROTEIN_TYPES.has(candidate.type) && coding.length >= 30) {
    // Strip a trailing stop so the stored protein is the clean ORF.
    const prot = translateDNA(coding).replace(/\*+$/, '');
    if (prot.length >= 10) candidate.protein = prot;
  }
  return candidate;
}

export function usePromoteToCommon() {
  const promoteFeature = useStore((s) => s.promoteFeature);

  const onPromoteToCommon = useCallback(
    (payload) => promoteFeature(buildPromoteCandidate(payload)),
    [promoteFeature],
  );

  const checkCommonDuplicate = useCallback(async (payload) => {
    const candidate = buildPromoteCandidate(payload);
    const merged = await getMergedFeatureDB();
    return checkDuplicateAgainst(candidate, merged.features);
  }, []);

  return { onPromoteToCommon, checkCommonDuplicate };
}
