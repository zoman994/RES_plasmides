/**
 * format-detect.js — auto-detect format of pasted text in ImportStartScreen.
 *
 * Used by InputZone paste handler to route pasted text into the right parser
 * (parseGenBank / parseFasta / sanitizeSequence). Lightweight detection by
 * leading bytes only — does not parse the full text.
 */

import { sanitizeSequence } from './sequence-utils';

/**
 * Detect format of arbitrary pasted text.
 *
 * @param {string} text
 * @returns {'genbank' | 'fasta' | 'raw' | 'unknown'}
 */
export function detectFormat(text) {
  if (!text || typeof text !== 'string') return 'unknown';
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';

  if (trimmed.startsWith('LOCUS ') || trimmed.startsWith('LOCUS\t')) return 'genbank';

  const firstNonEmpty = trimmed.split(/\r?\n/).find(l => l.trim().length > 0);
  if (firstNonEmpty && firstNonEmpty.trimStart().startsWith('>')) return 'fasta';

  const head = text.slice(0, 1000);
  const cleaned = sanitizeSequence(head);
  if (cleaned.length >= 10) return 'raw';

  return 'unknown';
}
