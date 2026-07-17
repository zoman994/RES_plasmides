/** Shared semantic colors for current CanvasSkeleton junction rendering. */
import { GG_ENZYMES } from '../../../golden-gate';

export const JUNCTION_STROKE = {
  auto:        '#94a3b8', // grey-400 — ещё не определён kind (placeholder pair)
  overlap:     '#60a5fa', // blue-400
  golden_gate: '#22c55e', // green-500
  re_ligation: '#f97316', // orange-500
  ligation:    '#ef4444', // red-500
  kld:         '#a855f7', // purple-500
  sticky_end:  '#fb923c', // orange-400
  blunt:       '#9ca3af', // gray-400
  preformed:   '#9ca3af',
};

export const JUNCTION_FILL = {
  auto:        '#e2e8f0', // slate-200 background ring
  overlap:     '#dbeafe', // blue-100
  golden_gate: '#dcfce7', // green-100
  re_ligation: '#ffedd5', // orange-100
  ligation:    '#fee2e2', // red-100
  kld:         '#f3e8ff', // purple-100
  sticky_end:  '#ffedd5',
  blunt:       '#f3f4f6', // gray-100
  preformed:   '#f3f4f6',
};

export const JUNCTION_LABEL = {
  auto:        'auto',
  overlap:     'overlap',
  golden_gate: 'GG',
  re_ligation: 'RE',
  ligation:    'lig',
  kld:         'KLD',
  sticky_end:  'sticky',
  blunt:       'blunt',
  preformed:   '—',
};

// F4 DEC-CANVAS-PROD-04 — virtual product preview palette.
export const VIRTUAL_STROKE = {
  incomplete: '#cbd5e1', // slate-300
  disconnected: '#ef4444', // red-500
  valid: '#94a3b8', // slate-400
};
export function virtualStroke(state) {
  return VIRTUAL_STROKE[state] || VIRTUAL_STROKE.incomplete;
}

export function junctionStroke(kind) {
  return JUNCTION_STROKE[kind] || JUNCTION_STROKE.auto;
}

export function junctionFill(kind) {
  return JUNCTION_FILL[kind] || JUNCTION_FILL.auto;
}

export function junctionLabel(kind) {
  return JUNCTION_LABEL[kind] || JUNCTION_LABEL.auto;
}

/**
 * detectJunctionKind — простой эвристический детектор метода
 * сборки на основе `container.ends` пары (NOTES_CANVAS_V2_KICKOFF §2
 * «Connection auto-detect»).
 *
 * Правила (упорядочены по приоритету):
 *  1. Оба контейнера circular → 'auto' (Gibson циркуляризация не
 *     может стартовать с двух circular).
 *  2. Один контейнер circular, другой linear с overhang ends →
 *     'overlap' (Gibson клонирование в плазмиду).
 *  3. Оба linear:
 *     a. Хотя бы у одной стороны 4-nt overhang того же типа (5'/3')
 *        с обоих сторон стыка → 'golden_gate' (Type IIS GG-like).
 *     b. Хотя бы у одной стороны overhang любой длины →
 *        're_ligation' (sticky-end cloning).
 *     c. Обе стороны blunt → 'ligation' (blunt ligation).
 *  4. Сторон ends нет → 'overlap' (Gibson default).
 *
 * Возвращает строку kind. Manual override через SET_JUNCTION_KIND.
 */
export function detectJunctionKind(from, to, opts = {}) {
  if (!from || !to) return 'auto';
  const fc = !!from.topology?.circular;
  const tc = !!to.topology?.circular;
  if (fc && tc) return 'auto';
  if (fc !== tc) {
    // mixed circular+linear → Gibson default (overlap).
    return 'overlap';
  }
  // Both linear.
  const fromEnd = from.ends?.threePrime;
  const toEnd = to.ends?.fivePrime;
  if (!fromEnd && !toEnd) {
    // F2 DEC-JUNC-07: cascade-aware — inherit a neighbour's chosen kind
    // when no ends signal is available and it is still biologically OK.
    if (opts.preferredKind && opts.preferredKind !== 'auto') return opts.preferredKind;
    return 'overlap';
  }
  const fromOver = fromEnd?.overhang || '';
  const toOver = toEnd?.overhang || '';
  // JC-5 — Golden Gate is defined by Type IIS ENZYME provenance, NOT overhang
  // length (a classic RE also leaves 4-nt cohesive ends: EcoRI→AATT, BamHI→GATC).
  // Classify by the cutting enzyme; a bare cohesive pair with no enzyme info is
  // re_ligation, never golden_gate (enzyme-separation hard rule). A biologist can
  // still override to golden_gate manually via SET_JUNCTION_KIND.
  const enzUsed = fromEnd?.enzymeUsed || toEnd?.enzymeUsed || null;
  if (enzUsed && GG_ENZYMES[enzUsed]) return 'golden_gate';
  if (fromOver || toOver) return 're_ligation';
  // Both ends explicitly blunt.
  if (fromEnd?.type === 'blunt' && toEnd?.type === 'blunt') return 'ligation';
  return 'overlap';
}

// F2 DEC-CANVAS-JUNC-01 — default overlap params per junction kind.
const JUNCTION_PARAM_DEFAULTS = {
  overlap:     { overlapTarget: 'right', overlapLength: 30, overlapTm: null },
  re_ligation: { overlapTarget: 'right', overlapLength: 30, overlapTm: null },
  golden_gate: { overlapTarget: 'right', overlapLength: 4,  overlapTm: null },
  kld:         { overlapTarget: 'both',  overlapLength: 0,  overlapTm: null },
  ligation:    { overlapTarget: 'right', overlapLength: 0,  overlapTm: null },
  blunt:       { overlapTarget: 'right', overlapLength: 0,  overlapTm: null },
  sticky_end:  { overlapTarget: 'right', overlapLength: 4,  overlapTm: null },
  preformed:   { overlapTarget: 'right', overlapLength: null, overlapTm: null },
  auto:        { overlapTarget: 'right', overlapLength: null, overlapTm: null },
};

export function defaultJunctionParams(kind) {
  const d = JUNCTION_PARAM_DEFAULTS[kind] || JUNCTION_PARAM_DEFAULTS.auto;
  return { ...d };
}

/**
 * inferEndRequirements — what the junction requires of the contiguous
 * containers' ends. Infrastructure for Spec 3 primer/digest cascade;
 * in Spec 2 it only feeds the popover preview + validation compare.
 */
export function inferEndRequirements(kind, overlapTarget = 'right', length = null) {
  const overhang = (len) => ({ type: 'overhang', length: typeof len === 'number' ? len : 0 });
  const blunt = () => ({ type: 'blunt' });
  const any = () => ({ type: 'any' });
  let base;
  switch (kind) {
    case 'overlap':
      // Overlap PCR / Gibson — the homology arm length flows into the overhang.
      base = { fromEnd: overhang(length ?? 30), toEnd: overhang(length ?? 30) };
      break;
    case 'golden_gate':
    case 'sticky_end':
    case 're_ligation':
      // Enzyme-defined sticky ends — a FIXED placeholder overhang (≈4 nt), NOT
      // the overlap `length` (a stale overlapLength must not leak into preview;
      // exact per-enzyme overhang comes with the enzyme picker, step 3).
      base = { fromEnd: overhang(4), toEnd: overhang(4) };
      break;
    case 'ligation':
    case 'blunt':
    case 'kld':
      base = { fromEnd: blunt(), toEnd: blunt() };
      break;
    case 'preformed':
    case 'auto':
    default:
      base = { fromEnd: any(), toEnd: any() };
      break;
  }
  // overlapTarget narrows which side carries the requirement ONLY for overlap:
  // a single-sided overlap leaves the opposite end unconstrained. Enzyme kinds
  // carry their overhang on BOTH ends symmetrically — a stale 'left' must not
  // drop the to-end to `any` for RE/GG.
  if (kind === 'overlap' && overlapTarget === 'left') return { fromEnd: base.fromEnd, toEnd: any() };
  return base;
}

