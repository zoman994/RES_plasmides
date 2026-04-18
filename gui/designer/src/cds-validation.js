/**
 * CDS validation — checks for common problems in coding sequences.
 *
 * Returns structured warnings with levels, messages, and action suggestions.
 * Called after addPart(type=CDS), import, mutagenesis, sequence editing.
 */

import { translateDNA } from './codons';

const STOPS = new Set(['TAA', 'TAG', 'TGA']);

/**
 * Validate a CDS sequence.
 *
 * @param {string} sequence — DNA sequence (uppercase or mixed)
 * @param {Object} [options]
 * @param {string} [options.organismType] — 'prokaryote'|'eukaryote'|null
 * @returns {Array<{ level, type, message, details?, hint?, actions? }>}
 */
export function validateCDS(sequence, options = {}) {
  const { organismType } = options;
  if (!sequence) return [];
  const rawSeq = sequence.toUpperCase();
  const warnings = [];

  // B4: Auto-detect reading frame — if ATG is near the start, trim UTR prefix
  let cdsStart = 0;
  if (rawSeq.length >= 3 && rawSeq.slice(0, 3) !== 'ATG') {
    const atgPos = rawSeq.indexOf('ATG');
    if (atgPos > 0 && atgPos <= 10) {
      cdsStart = atgPos;
    }
  }
  const seq = cdsStart > 0 ? rawSeq.slice(cdsStart) : rawSeq;

  // 1. No start codon
  if (seq.length >= 3 && seq.slice(0, 3) !== 'ATG') {
    warnings.push({
      level: 'warning',
      type: 'no_start',
      message: '\u26A0\uFE0F Последовательность не начинается с ATG',
      actions: [
        { label: '+ATG', action: 'add_start_ATG' },
      ],
    });
  }

  // 2. Length not divisible by 3
  if (seq.length % 3 !== 0) {
    warnings.push({
      level: 'warning',
      type: 'frameshift',
      message: `\u26A0\uFE0F Длина ${seq.length} нт не кратна 3 (возможно включает UTR)`,
      hint: `Остаток: ${seq.length % 3} нт. Проверьте границы CDS.${cdsStart > 0 ? ` ATG найден на позиции ${cdsStart + 1}.` : ''}`,
    });
  }

  // 3. Internal (premature) stop codons
  const protein = translateDNA(seq);
  const internalStops = [];
  for (let i = 0; i < protein.length - 1; i++) {
    if (protein[i] === '*') {
      internalStops.push({
        aaPosition: i + 1,
        ntPosition: i * 3,
        codon: seq.slice(i * 3, i * 3 + 3),
      });
    }
  }
  if (internalStops.length > 0) {
    warnings.push({
      level: 'error',
      type: 'premature_stop',
      message: `\u26D4 ${internalStops.length} преждевременных стоп-кодон(ов)`,
      details: internalStops.map(s =>
        `Позиция ${s.aaPosition}: ${s.codon} (нт ${s.ntPosition + 1})`
      ),
      hint: organismType === 'prokaryote'
        ? 'Возможные причины: (1) ошибка в последовательности, (2) сдвиг рамки считывания'
        : 'Возможные причины: (1) ген содержит интроны — нужна cDNA, ' +
          '(2) ошибка в последовательности, (3) сдвиг рамки считывания',
      actions: organismType === 'prokaryote'
        ? [{ label: 'Игнорировать', action: 'dismiss' }]
        : [
            { label: '\uD83E\uDDEC Разметить интроны', action: 'detect_introns' },
            { label: 'Игнорировать', action: 'dismiss' },
          ],
    });
  }

  // 4. No terminal stop codon
  if (seq.length >= 3) {
    const lastCodon = seq.slice(-3);
    if (!STOPS.has(lastCodon)) {
      warnings.push({
        level: 'warning',
        type: 'no_stop',
        message: '\u26A0\uFE0F Нет стоп-кодона на конце CDS',
        actions: [
          { label: '+TAA', action: 'add_stop_TAA' },
          { label: '+TGA', action: 'add_stop_TGA' },
          { label: '+TAG', action: 'add_stop_TAG' },
        ],
      });
    }
  }

  return warnings;
}
