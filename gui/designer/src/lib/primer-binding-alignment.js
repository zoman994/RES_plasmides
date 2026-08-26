/**
 * Deterministic edit alignment between a primer body (query) and the source
 * annealed sequence (target). Both inputs are already in primer orientation.
 *
 * Runs use half-open offsets. `I` consumes query only; `D` consumes target
 * only. A diagonal backtrack wins equal-cost ties, which moves an ambiguous
 * homopolymer gap toward the 5′ side and preserves the longest honest 3′
 * complementary suffix.
 */

function normalizeSequence(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

function atomicRun(op, queryStart, queryEnd, targetStart, targetEnd) {
  return {
    op, queryStart, queryEnd, targetStart, targetEnd,
  };
}

function mergeRuns(steps) {
  const runs = [];
  for (const step of steps) {
    const previous = runs[runs.length - 1];
    if (previous
      && previous.op === step.op
      && previous.queryEnd === step.queryStart
      && previous.targetEnd === step.targetStart) {
      previous.queryEnd = step.queryEnd;
      previous.targetEnd = step.targetEnd;
    } else {
      runs.push({ ...step });
    }
  }
  return runs;
}

export function alignPrimerBinding(queryValue, targetValue) {
  const query = normalizeSequence(queryValue);
  const target = normalizeSequence(targetValue);
  const rows = query.length + 1;
  const columns = target.length + 1;
  const costs = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let i = 1; i < rows; i += 1) costs[i][0] = i;
  for (let j = 1; j < columns; j += 1) costs[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const diagonal = costs[i - 1][j - 1] + (query[i - 1] === target[j - 1] ? 0 : 1);
      const insertion = costs[i - 1][j] + 1;
      const deletion = costs[i][j - 1] + 1;
      costs[i][j] = Math.min(diagonal, insertion, deletion);
    }
  }

  const reversed = [];
  let i = query.length;
  let j = target.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const mismatch = query[i - 1] === target[j - 1] ? 0 : 1;
      if (costs[i][j] === costs[i - 1][j - 1] + mismatch) {
        reversed.push(atomicRun(
          mismatch ? 'X' : 'M', i - 1, i, j - 1, j,
        ));
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      reversed.push(atomicRun('I', i - 1, i, j, j));
      i -= 1;
      continue;
    }
    reversed.push(atomicRun('D', i, i, j - 1, j));
    j -= 1;
  }

  const runs = mergeRuns(reversed.reverse());
  const counts = {
    M: 0, X: 0, I: 0, D: 0,
  };
  for (const item of runs) {
    counts[item.op] += item.op === 'D'
      ? item.targetEnd - item.targetStart
      : item.queryEnd - item.queryStart;
  }
  const terminal = runs[runs.length - 1] || null;

  return {
    query,
    target,
    runs,
    counts,
    editDistance: costs[query.length][target.length],
    hasGap: counts.I > 0 || counts.D > 0,
    targetSpan: { start: 0, end: target.length },
    threePrimeGap: terminal?.op === 'I' || terminal?.op === 'D',
    threePrimeMatchLength: terminal?.op === 'M'
      ? terminal.queryEnd - terminal.queryStart
      : 0,
  };
}
