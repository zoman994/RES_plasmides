import { calcTmNN } from '../tm-calculator';
import { evaluateStandardPcrAnnealing } from './primer-annealing-policy';

export const P6A_TM_CONDITIONS = Object.freeze({
  monovalentMm: 50,
  magnesiumMm: 0,
  totalDntpMm: 0.2,
  effectiveOligoNm: 250,
});

const PERFECT_DUPLEX_MODEL = 'santalucia-1998-perfect-duplex';
const CANONICAL_DNA = /^[ACGT]+$/;

function calculatePerfectTm(sequence) {
  return calcTmNN(sequence, {
    naConc: P6A_TM_CONDITIONS.monovalentMm,
    mgConc: P6A_TM_CONDITIONS.magnesiumMm,
    dntpConc: P6A_TM_CONDITIONS.totalDntpMm,
    oligoConc: P6A_TM_CONDITIONS.effectiveOligoNm,
  });
}

function notCalculated(reason) {
  return {
    status: 'not-calculated',
    tmC: null,
    model: PERFECT_DUPLEX_MODEL,
    reason,
  };
}

function normalizedSequence(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

function hasImperfectRun(alignment) {
  return (alignment?.runs || []).some((run) => run.op !== 'M');
}

function fullDuplexResult(alignment) {
  if (!alignment || !Array.isArray(alignment.runs)) {
    return notCalculated('alignment-required');
  }
  const query = normalizedSequence(alignment.query);
  const target = normalizedSequence(alignment.target);
  if (!CANONICAL_DNA.test(query) || !CANONICAL_DNA.test(target)) {
    return notCalculated('noncanonical-base');
  }
  if (hasImperfectRun(alignment)) return notCalculated('imperfect-duplex');
  return {
    status: 'calculated',
    tmC: calculatePerfectTm(query),
    model: PERFECT_DUPLEX_MODEL,
    reason: null,
  };
}

function threePrimeAnchorResult(alignment, annealing) {
  const query = normalizedSequence(alignment?.query);
  const length = annealing.threePrimeMatchLength;
  const base = { length, diagnostic: true };
  if (!alignment || !Array.isArray(alignment.runs)) {
    return { ...notCalculated('alignment-required'), ...base };
  }
  if (annealing.reason === 'invalid-three-prime-anchor-evidence'
    || annealing.reason === 'noncanonical-three-prime-anchor') {
    return { ...notCalculated(annealing.reason), ...base };
  }
  if (length === 0) {
    return { ...notCalculated('no-three-prime-anchor'), ...base };
  }
  const sequence = query.slice(-length);
  if (!CANONICAL_DNA.test(sequence)) {
    return { ...notCalculated('noncanonical-base'), ...base };
  }
  return {
    status: 'calculated',
    length,
    tmC: calculatePerfectTm(sequence),
    model: PERFECT_DUPLEX_MODEL,
    diagnostic: true,
    reason: null,
  };
}

function pcrResult(alignment, fullDuplex, annealing) {
  const reasons = [];
  if (!alignment || !Array.isArray(alignment.runs)) reasons.push('alignment-required');
  if (annealing.reason === 'no-three-prime-anchor') {
    reasons.push('no-three-prime-anchor');
    return { status: 'refused', reasons };
  }
  if (fullDuplex.reason === 'imperfect-duplex') reasons.push('imperfect-duplex');
  if (fullDuplex.reason === 'noncanonical-base') reasons.push('noncanonical-base');
  if (
    fullDuplex.status === 'calculated'
    && Number.isFinite(fullDuplex.tmC)
    && fullDuplex.tmC < 50
  ) {
    reasons.push('low-full-duplex-tm');
  }
  if (annealing.reason && annealing.reason !== 'no-three-prime-anchor') {
    reasons.push(annealing.reason);
  }
  if (annealing.status === 'non-annealing') return { status: 'refused', reasons };
  return { status: reasons.length ? 'warning' : 'suitable', reasons };
}

/**
 * Three independent answers for one projected primer landing.
 *
 * The P6a model deliberately has no mismatch or bulge parameters. A scalar
 * full-duplex Tm is therefore returned only for a canonical exact M-only
 * alignment. The perfect-duplex Tm of the continuous exact 3' suffix is a
 * separate diagnostic and never upgrades the PCR verdict by itself.
 */
export function evaluatePrimerDuplexThermodynamics({ alignment = null } = {}) {
  const annealing = evaluateStandardPcrAnnealing(alignment);
  const fullDuplex = fullDuplexResult(alignment);
  const threePrimeAnchor = threePrimeAnchorResult(alignment, annealing);
  return {
    conditions: { ...P6A_TM_CONDITIONS },
    fullDuplex,
    threePrimeAnchor,
    pcr: pcrResult(alignment, fullDuplex, annealing),
  };
}
