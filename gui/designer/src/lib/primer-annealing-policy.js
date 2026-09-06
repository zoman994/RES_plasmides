/**
 * The single product policy for standard PCR primer annealing.
 *
 * Alignment owns the chemistry truth. This helper does not relabel an M, X,
 * I, or D; it only decides whether the continuous exact suffix already
 * measured by `threePrimeMatchLength` is long enough to support standard PCR.
 */
export const MIN_STANDARD_PCR_THREE_PRIME_MATCH = 10;

function normalizedQuery(alignment) {
  return typeof alignment?.query === 'string'
    ? alignment.query.replace(/\s+/g, '').toUpperCase()
    : null;
}

function claimedMatchLength(alignment, query) {
  const claimed = alignment?.threePrimeMatchLength;
  if (!Number.isSafeInteger(claimed) || claimed < 0 || claimed > query.length) return null;
  if (!Array.isArray(alignment?.runs)) return claimed;
  const terminal = alignment.runs[alignment.runs.length - 1] || null;
  const measured = terminal?.op === 'M' && terminal.queryEnd === query.length
    ? terminal.queryEnd - terminal.queryStart
    : 0;
  return measured === claimed ? claimed : null;
}

export function evaluateStandardPcrAnnealing(alignment) {
  if (alignment == null) {
    return {
      status: 'non-annealing',
      reason: 'no-three-prime-anchor',
      threePrimeMatchLength: 0,
      minimumMatchLength: MIN_STANDARD_PCR_THREE_PRIME_MATCH,
    };
  }

  const query = normalizedQuery(alignment);
  if (query == null) {
    return {
      status: 'non-annealing',
      reason: 'invalid-three-prime-anchor-evidence',
      threePrimeMatchLength: 0,
      minimumMatchLength: MIN_STANDARD_PCR_THREE_PRIME_MATCH,
    };
  }
  const claimed = claimedMatchLength(alignment, query);
  if (claimed == null) {
    return {
      status: 'non-annealing',
      reason: 'invalid-three-prime-anchor-evidence',
      threePrimeMatchLength: 0,
      minimumMatchLength: MIN_STANDARD_PCR_THREE_PRIME_MATCH,
    };
  }

  let canonicalSuffixLength = 0;
  const suffix = query.slice(query.length - claimed);
  for (let index = suffix.length - 1; index >= 0; index -= 1) {
    if (!/[ACGT]/.test(suffix[index])) break;
    canonicalSuffixLength += 1;
  }
  const threePrimeMatchLength = claimed >= MIN_STANDARD_PCR_THREE_PRIME_MATCH
    ? canonicalSuffixLength
    : claimed;
  let reason = null;
  if (threePrimeMatchLength === 0) reason = 'no-three-prime-anchor';
  else if (claimed >= MIN_STANDARD_PCR_THREE_PRIME_MATCH
    && canonicalSuffixLength < MIN_STANDARD_PCR_THREE_PRIME_MATCH) {
    reason = 'noncanonical-three-prime-anchor';
  } else if (threePrimeMatchLength < MIN_STANDARD_PCR_THREE_PRIME_MATCH) {
    reason = 'short-three-prime-anchor';
  }
  return {
    status: reason ? 'non-annealing' : 'annealing',
    reason,
    threePrimeMatchLength,
    minimumMatchLength: MIN_STANDARD_PCR_THREE_PRIME_MATCH,
  };
}
