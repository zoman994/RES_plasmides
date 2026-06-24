/**
 * acquisition-label — S5 (V165). Pure. A compact human label for HOW a fragment
 * is physically obtained (its acquisitionMethod), so the segment bar + list can
 * visually track a multi-source build: RE-cut vs PCR vs synthesised vs picked by
 * cursor. Mirrors the ACQUISITION_METHOD_ENUM of piece-invariants.
 */
const ACQUISITION_LABELS = {
  restriction: { short: 'RE', full: 'Рестрикция (липкие концы)' },
  pcr: { short: 'PCR', full: 'ПЦР' },
  'ov-pcr': { short: 'OV', full: 'Overlap-PCR' },
  synthesis: { short: 'син', full: 'Синтез' },
  direct: { short: '=', full: 'Без ПЦР (как есть)' },
  undefined: { short: '⌖', full: 'Выбран курсором' },
};

/** @returns {{short:string, full:string}} — never null (falls back to cursor). */
export function acquisitionLabel(method) {
  return ACQUISITION_LABELS[method] || ACQUISITION_LABELS.undefined;
}
