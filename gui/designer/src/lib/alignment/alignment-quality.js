/**
 * alignment-quality.js — honest quality gate over a pairwise alignment result
 * (QA fix-pack #2 feature: «доверие к цифрам»). The raw metrics can mislead:
 * an empty local hit reports identity 0 with no signal, and an all-N read
 * reports identity 100% (IUPAC N matches anything) → a false «высокое сходство».
 * This pure layer surfaces structured quality flags + warnings the verdict and
 * UI can act on. No engine change needed — derived from the result.
 */

// IUPAC degenerate codes (everything that is NOT a definite single base).
const DEGENERATE = new Set(['N', 'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V']);

const LOW_COVERAGE = 35;        // % read covered below which a hit is «local»
const HIGH_AMBIGUITY = 0.5;     // fraction of read columns that are degenerate

/**
 * @param {object} result — alignPairwise output ({ alignedLength, alignedB, coverageB, ... })
 * @returns {{ ambiguousFraction:number, significant:boolean, flags:string[], warnings:string[] }}
 */
export function assessAlignmentQuality(result) {
  if (!result || !result.alignedLength) {
    return {
      ambiguousFraction: 0,
      significant: false,
      flags: ['no-match'],
      warnings: ['Нет значимого совпадения — последовательности не выравниваются.'],
    };
  }

  const alignedB = String(result.alignedB || '');
  let readBases = 0;
  let ambiguous = 0;
  for (const raw of alignedB) {
    if (raw === '-') continue;
    readBases += 1;
    if (DEGENERATE.has(raw.toUpperCase())) ambiguous += 1;
  }
  const ambiguousFraction = readBases ? ambiguous / readBases : 0;

  const flags = [];
  const warnings = [];
  if (ambiguousFraction > HIGH_AMBIGUITY) {
    flags.push('high-ambiguity');
    warnings.push(`Чтение на ${Math.round(ambiguousFraction * 100)}% неоднозначно (N) — идентичность ненадёжна.`);
  }
  if (Number.isFinite(result.coverageB) && result.coverageB < LOW_COVERAGE) {
    // Flag only — the verdict chip already says «локальное совпадение (малое
    // перекрытие)», so a separate warning would be redundant (and would clash
    // with the verdict text in the UI).
    flags.push('low-coverage');
  }

  return { ambiguousFraction, significant: true, flags, warnings };
}

/**
 * N-aware verdict. Quality flags override the raw identity/coverage so a mostly-
 * N or zero-overlap hit never reads as «высокое сходство». Returns the same
 * {text,bg,fg} shape the result view already uses.
 */
export function alignmentVerdict(identity, coverageRead, quality) {
  const flags = (quality && quality.flags) || [];
  if (flags.includes('no-match')) {
    return { text: 'нет совпадения', bg: '#FCEBEB', fg: '#791F1F' };
  }
  if (flags.includes('high-ambiguity')) {
    return { text: 'ненадёжно — много N', bg: '#FAEEDA', fg: '#633806' };
  }
  if (Number.isFinite(coverageRead) && coverageRead < LOW_COVERAGE) {
    return { text: 'локальное совпадение (малое перекрытие)', bg: '#FCEBEB', fg: '#791F1F' };
  }
  if (identity >= 90) return { text: 'высокое сходство', bg: '#EAF3DE', fg: '#27500A' };
  if (identity >= 70) return { text: 'частичное сходство', bg: '#FAEEDA', fg: '#633806' };
  return { text: 'низкое сходство', bg: '#FCEBEB', fg: '#791F1F' };
}
