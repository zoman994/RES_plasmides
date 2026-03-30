/**
 * Duplicate / homology checker for the Parts library.
 *
 * checkDuplicates(newSequence, library) → sorted array of matches.
 */

/**
 * Hamming distance between two equal-length strings.
 */
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

/**
 * Check a new sequence against every Part in the library.
 *
 * @param {string} newSequence — uppercase DNA
 * @param {Array}  library     — array of Part objects ({ id, name, sequence, … })
 * @returns {Array<{part, match, identity, message}>} sorted by identity DESC
 */
export function checkDuplicates(newSequence, library) {
  if (!newSequence || !library?.length) return [];

  const seq = newSequence.toUpperCase();
  const results = [];

  for (const part of library) {
    if (!part.sequence) continue;
    const lib = part.sequence.toUpperCase();

    // 1. Exact match
    if (seq === lib) {
      results.push({
        part,
        match: 'exact',
        identity: 100,
        message: `Идентичен ${part.name}`,
      });
      continue;
    }

    // 2. Substring checks
    if (seq.length < lib.length && lib.includes(seq)) {
      results.push({
        part,
        match: 'subset',
        identity: 100,
        message: `Является частью ${part.name}`,
      });
      continue;
    }

    if (lib.length < seq.length && seq.includes(lib)) {
      results.push({
        part,
        match: 'superset',
        identity: 100,
        message: `Содержит ${part.name} целиком`,
      });
      continue;
    }

    // 3. High homology — only when lengths are within 10%
    if (seq.length !== lib.length) {
      const ratio = Math.min(seq.length, lib.length) / Math.max(seq.length, lib.length);
      if (ratio < 0.9) continue; // lengths differ >10%, skip
    }

    // For Hamming distance, sequences must be the same length
    if (seq.length !== lib.length) continue;

    const dist = hamming(seq, lib);
    const identity = +((1 - dist / seq.length) * 100).toFixed(2);

    if (identity > 90) {
      results.push({
        part,
        match: 'homolog',
        identity,
        message: `${part.name}: ${identity}% идентичности (${dist} замен)`,
      });
    }
  }

  results.sort((a, b) => b.identity - a.identity);
  return results;
}
