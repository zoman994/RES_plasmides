/**
 * Deterministic semiglobal alignment between a primer body (query) and the
 * source annealed sequence / anchor (target). Both inputs are already in primer
 * orientation.
 *
 * The WHOLE physical query lands on a SUBSPAN of the anchor. When their lengths
 * differ, the target's leading and trailing bases may be clipped for free — a
 * terminal trim shortens the honest landing, and the anchor overhang left
 * outside `targetSpan` is a clip, never a run of deletions. Equal physical
 * lengths instead mean the confirmed footprint is the whole target: neither
 * edge is free, while globally cheaper internal I/D is still allowed. The query
 * is never free-clipped: every query base is paired (M/X) or an insertion (I).
 *
 * Runs use half-open offsets against the FULL target string; `targetSpan`
 * reports the effective subspan `[start,end)` the query actually lands on. `I`
 * consumes query only; `D` consumes target only and can only ever be internal —
 * flanked by aligned query on both sides. A trailing target base is clipped, not
 * deleted, so a minimal alignment never ends in `D`.
 *
 * Determinism, in order: minimum edits; then the longest exact physical 3′
 * suffix; then the rightmost (anchor-3′) placement for the remaining ties. A
 * diagonal backtrack wins ordinary equal-cost ties, moving an ambiguous
 * homopolymer gap toward the 5′ side. At a fixed source endpoint, one narrow
 * boundary tie is different: if the entire remaining query prefix can be
 * query-only at the same minimum cost, it is an unpaired 5′ prefix rather than
 * a fabricated row of substitutions against a freely clipped target prefix.
 */

function normalizeSequence(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

function canonicalBasesMatch(queryBase, targetBase) {
  return /[ACGT]/.test(queryBase) && queryBase === targetBase;
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

function alignPrimerBindingWithPolicy(queryValue, targetValue, { fixedThreePrime = false } = {}) {
  const query = normalizeSequence(queryValue);
  const target = normalizeSequence(targetValue);
  const ql = query.length;
  const tl = target.length;
  const fullFootprint = !fixedThreePrime && ql === tl;
  const rows = ql + 1;
  const columns = tl + 1;
  const costs = Array.from({ length: rows }, () => new Uint16Array(columns));

  // Every query base costs. A target prefix is free only for a true length
  // difference; equal-length landings own their whole confirmed footprint.
  for (let i = 1; i < rows; i += 1) costs[i][0] = i;
  if (fullFootprint) {
    for (let j = 1; j < columns; j += 1) costs[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const diagonal = costs[i - 1][j - 1]
        + (canonicalBasesMatch(query[i - 1], target[j - 1]) ? 0 : 1);
      const insertion = costs[i - 1][j] + 1;
      const deletion = costs[i][j - 1] + 1;
      // A confirmed source site fixes the template-side 3′ endpoint. The final
      // target base may therefore be paired (M/X), or followed by a real query
      // insertion at the primer's 3′ edge, but it may not disappear as a free
      // trailing target deletion. That would move the landing away from the
      // source coordinate while still presenting it as the source's answer.
      costs[i][j] = fixedThreePrime && i === ql && j === tl
        ? Math.min(diagonal, insertion)
        : Math.min(diagonal, insertion, deletion);
    }
  }

  // Endpoint choice — only a real length difference gets a free trailing clip.
  // Equal-length landings must finish at the target end; the DP remains global
  // (not Hamming-only), so a genuinely cheaper compensating I/D can still win.
  // Semiglobal ties pick minimum edits, longest exact 3′ suffix, then rightmost.
  const exactSuffix = (end) => {
    let k = 0;
    while (k < ql && end - 1 - k >= 0
      && canonicalBasesMatch(query[ql - 1 - k], target[end - 1 - k])) k += 1;
    return k;
  };
  let minCost = fixedThreePrime || fullFootprint ? costs[ql][tl] : Infinity;
  let bestEnd = fixedThreePrime || fullFootprint ? tl : 0;
  if (!fixedThreePrime && !fullFootprint) {
    for (let j = 0; j < columns; j += 1) minCost = Math.min(minCost, costs[ql][j]);
    let bestSuffix = -1;
    for (let j = 0; j < columns; j += 1) {
      if (costs[ql][j] !== minCost) continue;
      const suffix = exactSuffix(j);
      if (suffix > bestSuffix || (suffix === bestSuffix && j > bestEnd)) {
        bestSuffix = suffix;
        bestEnd = j;
      }
    }
  }

  const reversed = [];
  let i = ql;
  let j = bestEnd;
  // A semiglobal landing stops when the query is exhausted because the target
  // prefix is a free clip. A full-footprint landing backtracks to both origins.
  while (i > 0 || (fullFootprint && j > 0)) {
    const canInsert = i > 0 && costs[i][j] === costs[i - 1][j] + 1;
    if (fixedThreePrime && canInsert && costs[i][j] === i) {
      reversed.push(atomicRun('I', i - 1, i, j, j));
      i -= 1;
      continue;
    }
    if (i > 0 && j > 0) {
      const mismatch = canonicalBasesMatch(query[i - 1], target[j - 1]) ? 0 : 1;
      if (costs[i][j] === costs[i - 1][j - 1] + mismatch) {
        reversed.push(atomicRun(mismatch ? 'X' : 'M', i - 1, i, j - 1, j));
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (canInsert) {
      reversed.push(atomicRun('I', i - 1, i, j, j));
      i -= 1;
      continue;
    }
    if (j > 0) {
      reversed.push(atomicRun('D', i, i, j - 1, j));
      j -= 1;
    }
  }
  const start = j;

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
    editDistance: minCost,
    hasGap: counts.I > 0 || counts.D > 0,
    // The effective landing: which subspan of the anchor the query lands on.
    // Bases outside it are honest clips, not edits.
    targetSpan: { start, end: bestEnd },
    // A query-only base at the physical 3′ edge is a real gap; a trailing target
    // clip after an exact query is NOT — those bases simply left the footprint.
    threePrimeGap: terminal?.op === 'I',
    threePrimeMatchLength: terminal?.op === 'M'
      ? terminal.queryEnd - terminal.queryStart
      : 0,
  };
}

export function alignPrimerBinding(queryValue, targetValue) {
  return alignPrimerBindingWithPolicy(queryValue, targetValue);
}

/**
 * Align a physical oligo to a trusted source footprint without allowing the
 * template-side 3′ endpoint to drift. The target's 5′ prefix may still be an
 * honest clip (a shortened primer), while every query base is represented as
 * M/X/I. This is deliberately a separate policy from the general inspector
 * aligner: only a confirmed source coordinate is authoritative enough to pin
 * an endpoint.
 */
export function alignPrimerBindingAtThreePrimeEnd(queryValue, targetValue) {
  return alignPrimerBindingWithPolicy(queryValue, targetValue, { fixedThreePrime: true });
}

/**
 * Anchored local alignment used to discover the biological 5′ boundary.
 *
 * Both physical 3′ ends are fixed. Only prefixes may be left outside the
 * alignment: a query prefix is the true unpaired 5′ tail, while a target
 * prefix is unused upstream template context. Internal X/I/D runs remain part
 * of the landing when the surrounding complementarity pays for them.
 * `allowTerminalTargetDeletion` is reserved for aligning a recovered prefix
 * immediately before a mandatory core: that terminal D becomes an internal
 * seam once the core is appended. The default physical-3′ contract remains
 * strict and does not admit it.
 *
 * Scores use the project's strict local-DNA policy (+2/−3, affine gap −6/−1).
 * Thus weak accidental similarity is clipped, but a real complementary island
 * can pay for an internal substitution or bulge. Equal-score ties are
 * conservative: fewer edits, then the shorter 5′ span nearest the anchored 3′
 * end.
 *
 * Returns offsets against the full normalized inputs plus `querySpan` and
 * `targetSpan`. Returns null when no positive-scoring alignment reaches the
 * fixed endpoint; callers may then preserve their trusted source fallback.
 */
export function alignPrimerBindingLocallyAtThreePrimeEnd(
  queryValue,
  targetValue,
  { allowTerminalTargetDeletion = false } = {},
) {
  const query = normalizeSequence(queryValue);
  const target = normalizeSequence(targetValue);
  const ql = query.length;
  const tl = target.length;
  if (!ql || !tl) return null;

  const NONE = 0;
  const MATCH = 1;
  const INSERTION = 2;
  const DELETION = 3;
  const MATCH_SCORE = 2;
  const MISMATCH_SCORE = -3;
  const GAP_OPEN = -6;
  const GAP_EXTEND = -1;
  const NEGATIVE_INFINITY = -1_000_000_000;
  const rows = ql + 1;
  const columns = tl + 1;
  const matrix = (fill = 0, Type = Int32Array) => Array.from({ length: rows }, () => {
    const row = new Type(columns);
    if (fill) row.fill(fill);
    return row;
  });
  const makeState = (fill = NEGATIVE_INFINITY) => ({
    scores: matrix(fill),
    edits: matrix(0, Uint32Array),
    queryStarts: matrix(0, Uint32Array),
    targetStarts: matrix(0, Uint32Array),
    pointers: matrix(0, Uint8Array),
  });
  // M is allowed to reset to zero at every cell. Gap states can only open
  // from an existing positive M path, so their untouched cells remain -inf.
  const states = {
    [MATCH]: makeState(0),
    [INSERTION]: makeState(),
    [DELETION]: makeState(),
  };

  const better = (candidate, best) => {
    if (!candidate || candidate.score <= 0) return false;
    if (!best || candidate.score !== best.score) return !best || candidate.score > best.score;
    if (candidate.edits !== best.edits) return candidate.edits < best.edits;
    if (candidate.queryStart !== best.queryStart) {
      return candidate.queryStart > best.queryStart;
    }
    if (candidate.targetStart !== best.targetStart) {
      return candidate.targetStart > best.targetStart;
    }
    return candidate.priority > best.priority;
  };

  const fromState = (stateId, i, j, delta, editDelta, priority) => {
    const state = states[stateId];
    if (state.scores[i][j] <= 0) return null;
    return {
      score: state.scores[i][j] + delta,
      edits: state.edits[i][j] + editDelta,
      queryStart: state.queryStarts[i][j],
      targetStart: state.targetStarts[i][j],
      pointer: stateId,
      priority,
    };
  };

  const storeBest = (state, i, j, best) => {
    if (!best || best.score <= 0) return;
    state.scores[i][j] = best.score;
    state.edits[i][j] = best.edits;
    state.queryStarts[i][j] = best.queryStart;
    state.targetStarts[i][j] = best.targetStart;
    state.pointers[i][j] = best.pointer;
  };

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const mismatch = canonicalBasesMatch(query[i - 1], target[j - 1]) ? 0 : 1;
      const diagonalDelta = mismatch ? MISMATCH_SCORE : MATCH_SCORE;
      let bestMatch = diagonalDelta > 0 ? {
        score: diagonalDelta,
        edits: mismatch,
        queryStart: i - 1,
        targetStart: j - 1,
        pointer: NONE,
        priority: 4,
      } : null;
      for (const [stateId, priority] of [[MATCH, 3], [INSERTION, 2], [DELETION, 1]]) {
        const candidate = fromState(
          stateId, i - 1, j - 1, diagonalDelta, mismatch, priority,
        );
        if (better(candidate, bestMatch)) bestMatch = candidate;
      }
      storeBest(states[MATCH], i, j, bestMatch);

      let bestInsertion = fromState(MATCH, i - 1, j, GAP_OPEN, 1, 2);
      const extendInsertion = fromState(
        INSERTION, i - 1, j, GAP_EXTEND, 1, 1,
      );
      if (better(extendInsertion, bestInsertion)) bestInsertion = extendInsertion;
      storeBest(states[INSERTION], i, j, bestInsertion);

      // A final target-only base would move the apparent physical 3′ endpoint
      // away from the trusted coordinate, so it is never a legal last step.
      if (allowTerminalTargetDeletion || !(i === ql && j === tl)) {
        let bestDeletion = fromState(MATCH, i, j - 1, GAP_OPEN, 1, 2);
        const extendDeletion = fromState(
          DELETION, i, j - 1, GAP_EXTEND, 1, 1,
        );
        if (better(extendDeletion, bestDeletion)) bestDeletion = extendDeletion;
        storeBest(states[DELETION], i, j, bestDeletion);
      }
    }
  }

  let endpoint = null;
  let endpointState = NONE;
  const endpointStates = allowTerminalTargetDeletion
    ? [[MATCH, 3], [INSERTION, 2], [DELETION, 1]]
    : [[MATCH, 2], [INSERTION, 1]];
  for (const [stateId, priority] of endpointStates) {
    const state = states[stateId];
    const candidate = state.scores[ql][tl] > 0 ? {
      score: state.scores[ql][tl],
      edits: state.edits[ql][tl],
      queryStart: state.queryStarts[ql][tl],
      targetStart: state.targetStarts[ql][tl],
      priority,
    } : null;
    if (better(candidate, endpoint)) {
      endpoint = candidate;
      endpointState = stateId;
    }
  }
  if (!endpoint) return null;

  const queryStart = endpoint.queryStart;
  const targetStart = endpoint.targetStart;
  const reversed = [];
  let i = ql;
  let j = tl;
  let stateId = endpointState;
  while (stateId !== NONE) {
    const state = states[stateId];
    const pointer = state.pointers[i][j];
    if (stateId === MATCH) {
      const op = canonicalBasesMatch(query[i - 1], target[j - 1]) ? 'M' : 'X';
      reversed.push(atomicRun(op, i - 1, i, j - 1, j));
      i -= 1;
      j -= 1;
    } else if (stateId === INSERTION) {
      reversed.push(atomicRun('I', i - 1, i, j, j));
      i -= 1;
    } else if (stateId === DELETION) {
      reversed.push(atomicRun('D', i, i, j - 1, j));
      j -= 1;
    } else {
      return null;
    }
    stateId = pointer;
  }
  if (i !== queryStart || j !== targetStart) return null;

  const runs = mergeRuns(reversed.reverse());
  const counts = { M: 0, X: 0, I: 0, D: 0 };
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
    editDistance: counts.X + counts.I + counts.D,
    score: endpoint.score,
    hasGap: counts.I > 0 || counts.D > 0,
    querySpan: { start: queryStart, end: ql },
    targetSpan: { start: targetStart, end: tl },
    threePrimeGap: terminal?.op === 'I',
    threePrimeMatchLength: terminal?.op === 'M'
      ? terminal.queryEnd - terminal.queryStart
      : 0,
  };
}

/**
 * Collapse a sub-span landing onto its effective footprint.
 *
 * A terminal-trimmed primer lands on a SUBSPAN of its anchor. Every downstream
 * consumer (projection footprint, PCR geometry, warning positions) reasons about
 * the effective landing, not the historical anchor, so the alignment is re-based
 * to that subspan: the target string is sliced to `[start,end)`, run target
 * offsets are shifted to start at zero, and `targetSpan` becomes the full sliced
 * length. The honest clips outside the span simply leave the footprint — they
 * are never edits. A full-span alignment is returned unchanged.
 */
export function focusAlignment(alignment) {
  if (!alignment || !alignment.targetSpan) return alignment;
  const { start, end } = alignment.targetSpan;
  if (start === 0 && end === alignment.target.length) return alignment;
  return {
    ...alignment,
    target: alignment.target.slice(start, end),
    runs: alignment.runs.map((r) => ({
      op: r.op,
      queryStart: r.queryStart,
      queryEnd: r.queryEnd,
      targetStart: r.targetStart - start,
      targetEnd: r.targetEnd - start,
    })),
    targetSpan: { start: 0, end: end - start },
  };
}
