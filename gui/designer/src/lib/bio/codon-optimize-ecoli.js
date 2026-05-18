/**
 * codon-optimize-ecoli — codon optimization helper для экспрессии в
 * E.coli K-12.
 *
 * R7-3 (14.05.2026). Биолог клонирует CDS из eukaryotic source в
 * pET / pBAD vector → редкие codons в E.coli ломают expression.
 * Этот helper:
 *   1. translateDNA(cds) → aa sequence.
 *   2. optimizeCdsForEcoli(cds) → CDS с replaced codons на E.coli-preferred.
 *   3. codonScore(cds) → % codons уже E.coli-preferred (грубая CAI proxy).
 *
 * Codon usage table — E.coli K-12, GenScript / Kazusa DB:
 * https://www.genscript.com/tools/codon-frequency-table
 *
 * "Preferred" = single most frequent codon per amino acid. Stop codon =
 * TAA (most efficient termination в E.coli).
 *
 * NOT included (out of scope для skeleton):
 *   - Multi-codon avoidance (consecutive same-codon = secondary structure).
 *   - Restriction site avoidance.
 *   - mRNA folding analysis.
 *   - GC content balancing.
 *   - Rare codon tandem detection.
 */

// E.coli K-12 preferred codon per AA (single best per AA).
const ECOLI_PREFERRED = {
  F: 'TTC', L: 'CTG', I: 'ATC', M: 'ATG', V: 'GTG',
  S: 'AGC', P: 'CCG', T: 'ACC', A: 'GCG', Y: 'TAC',
  H: 'CAC', Q: 'CAG', N: 'AAC', K: 'AAA', D: 'GAC',
  E: 'GAA', C: 'TGC', W: 'TGG', R: 'CGC', G: 'GGC',
  '*': 'TAA',
};

// Reverse-codon map: codon → AA. Standard genetic code.
const CODON_TABLE = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

/**
 * translateDNA — DNA codon-codon translation. Поддерживает Met start;
 * stop = '*'. Frame 0.
 *
 * @param dna  — DNA (5'→3', uppercase OK).
 * @returns {{aa: string, errors: string[]}}.
 */
export function translateDNA(dna) {
  if (!dna || typeof dna !== 'string') return { aa: '', errors: ['Empty input'] };
  const seq = dna.toUpperCase();
  const errors = [];
  let aa = '';
  if (seq.length % 3 !== 0) errors.push('Length не делится на 3');
  for (let i = 0; i + 3 <= seq.length; i += 3) {
    const codon = seq.slice(i, i + 3);
    const a = CODON_TABLE[codon];
    if (!a) {
      errors.push(`Невалидный codon в позиции ${i}: ${codon}`);
      aa += 'X';
    } else {
      aa += a;
    }
  }
  return { aa, errors };
}

/**
 * optimizeCdsForEcoli — заменяет каждый codon на E.coli-preferred.
 * Stop codon = TAA. Start codon (если первый ATG) сохраняется.
 *
 * @param cds  — CDS DNA (5'→3', начинается с ATG, кончается stop codon).
 * @returns {{optimized: string, changes: number, replaced: Array, aaSeq: string, errors: string[]}}.
 */
export function optimizeCdsForEcoli(cds) {
  if (!cds || typeof cds !== 'string') return { optimized: '', changes: 0, replaced: [], aaSeq: '', errors: ['Empty input'] };
  const seq = cds.toUpperCase();
  const errors = [];
  if (seq.length % 3 !== 0) errors.push('Length не делится на 3');
  let optimized = '';
  let aaSeq = '';
  let changes = 0;
  const replaced = [];
  for (let i = 0; i + 3 <= seq.length; i += 3) {
    const codon = seq.slice(i, i + 3);
    const aa = CODON_TABLE[codon];
    if (!aa) {
      errors.push(`Невалидный codon в позиции ${i}: ${codon}`);
      optimized += codon;
      aaSeq += 'X';
      continue;
    }
    const preferred = ECOLI_PREFERRED[aa];
    aaSeq += aa;
    if (preferred && preferred !== codon) {
      optimized += preferred;
      changes += 1;
      replaced.push({ position: i, from: codon, to: preferred, aa });
    } else {
      optimized += codon;
    }
  }
  return { optimized, changes, replaced, aaSeq, errors };
}

/**
 * codonScore — % codons уже E.coli-preferred. Грубая CAI proxy.
 *
 * @param cds  — DNA sequence.
 * @returns {{totalCodons: number, preferredCount: number, percent: number, byAA: {[aa]: {total, preferred, percent}}}}.
 */
export function codonScore(cds) {
  if (!cds || typeof cds !== 'string') return { totalCodons: 0, preferredCount: 0, percent: 0, byAA: {} };
  const seq = cds.toUpperCase();
  const byAA = {};
  let totalCodons = 0;
  let preferredCount = 0;
  for (let i = 0; i + 3 <= seq.length; i += 3) {
    const codon = seq.slice(i, i + 3);
    const aa = CODON_TABLE[codon];
    if (!aa) continue;
    totalCodons += 1;
    if (!byAA[aa]) byAA[aa] = { total: 0, preferred: 0, percent: 0 };
    byAA[aa].total += 1;
    if (ECOLI_PREFERRED[aa] === codon) {
      byAA[aa].preferred += 1;
      preferredCount += 1;
    }
  }
  for (const aa of Object.keys(byAA)) {
    byAA[aa].percent = byAA[aa].total > 0
      ? Math.round((byAA[aa].preferred / byAA[aa].total) * 1000) / 10
      : 0;
  }
  return {
    totalCodons,
    preferredCount,
    percent: totalCodons > 0 ? Math.round((preferredCount / totalCodons) * 1000) / 10 : 0,
    byAA,
  };
}

/**
 * findRareCodons — finds positions с rare codons (NOT E.coli-preferred).
 *
 * @param cds  — DNA.
 * @returns Array<{position, codon, aa, preferred}>.
 */
export function findRareCodons(cds) {
  if (!cds || typeof cds !== 'string') return [];
  const seq = cds.toUpperCase();
  const rare = [];
  for (let i = 0; i + 3 <= seq.length; i += 3) {
    const codon = seq.slice(i, i + 3);
    const aa = CODON_TABLE[codon];
    if (!aa) continue;
    if (ECOLI_PREFERRED[aa] !== codon) {
      rare.push({ position: i, codon, aa, preferred: ECOLI_PREFERRED[aa] });
    }
  }
  return rare;
}
