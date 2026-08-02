/**
 * dna-gapped-occurrence — how a raw alignment becomes a CANONICAL occurrence, and how occurrences
 * are de-duplicated and merged (SPEC §2.6, §2.7, §3.1, §3.2, §3.2.1).
 *
 * Extracted from `dna-gapped-search.js` by U4-CANCEL C1 — a pure move, not a rewrite. The session
 * became a resumable generator, and keeping the canonicalisation rules in the same file would have
 * pushed it past its size budget while mixing two very different concerns: this module knows
 * nothing about scanning, budgets or suspension, only about what an occurrence IS and which of two
 * competing explanations of the same locus wins.
 *
 * Everything here is pure and synchronous — there is no work to suspend, because these rules run
 * over an already-computed handful of alignments, not over the molecule.
 */

const STRAND_RANK = { '+': 0, both: 1, '-': 2 };

export { STRAND_RANK };

/**
 * THE positional order of an emitted window: start, then PHYSICAL endpoint, then strand.
 *
 * The emitted list is positional because an in-molecule list of sites has to read along the
 * molecule; §3.2's ranking travels beside it as `bestIndex`, never as the array order. So this is
 * the only thing that decides where a row appears, and both kernels must decide it the same way —
 * the two answers are compared byte-for-byte, and a window that differs only in the order of two
 * rows at one coordinate is still a different answer.
 *
 * The strand term is not decoration. Two occurrences CAN share a start and an endpoint and stay
 * separate rows: `+` and `−` merge into `both` only when their edit scripts agree, so a locus
 * explained differently on each strand keeps both. Without the strand term those two rows are tied,
 * and a tie in a sort is resolved by input order — which is scanner order, i.e. not a contract at
 * all. The linear kernel omitted it and could therefore emit the pair either way round.
 *
 * `end` is the PHYSICAL endpoint (`(start + span) mod n` on a circle), the same number rule 6 reads,
 * NOT the end of the last displayed segment.
 */
export function comparePositional(aStart, aEnd, aStrand, bStart, bEnd, bStrand) {
  return aStart - bStart || aEnd - bEnd || STRAND_RANK[aStrand] - STRAND_RANK[bStrand];
}

/**
 * Build the §3.1 occurrence from a raw alignment. On a circle a hit may cross the origin once
 * (§2.7): it is then reported as two ordered segments and its mismatch positions are folded back
 * into 0..n−1, so every coordinate a caller sees is a real position on the molecule.
 */
export function occurrenceFrom(a, probeLen, strand, n, circular) {
  let start; let end; let segments; let wrapsOrigin = false;
  if (circular && a.end > n) {
    wrapsOrigin = true;
    start = a.start;
    end = a.end - n;
    segments = [{ start: a.start, end: n }, { start: 0, end }];
  } else {
    start = a.start; end = a.end; segments = [{ start, end }];
  }
  const L = a.alignmentLength; const M = a.M;
  const positions = circular ? a.mismatchPositions.map((p) => (p >= n ? p - n : p)) : a.mismatchPositions;
  const metrics = {
    length: probeLen, // legacy: query length
    queryLength: probeLen,
    alignmentLength: L,
    targetSpan: a.targetSpan,
    // Always a number (§2.5): with an ACGT-only query every column is `=` or `X`, so there is no
    // «identity undefined» case and no compatibility surrogate to fall back to.
    identity: L ? M / L : 0,
    coverage: 1,
    exactMatches: M,
    substitutions: a.X,
    insertions: a.I,
    deletions: a.D,
    indelBases: a.indelBases,
    indelEvents: a.indelEvents,
    editDistance: a.editDistance,
    mismatches: a.X, // legacy alias
    indels: a.indelBases, // legacy alias
    mismatchPositions: positions,
  };
  return {
    strand, wrapsOrigin, segments, start, end, script: a.script, editRuns: a.editRuns, metrics,
  };
}

/**
 * PHYSICAL target endpoint (§3.2.1) from raw coordinates. On a circle the raw `start + targetSpan`
 * depends on where the origin happens to sit — `[8→2]` and `[0→2]` on a 10-mer ring end at the same
 * base but read as 12 and 2 — so it is folded modulo n. Two hits that end at the same base must
 * group together no matter how the molecule is rotated.
 *
 * Exported in this raw form for the literal exact scan, which decides its §3.2 winner while
 * streaming and therefore has only `(start, span)` in hand, not a built occurrence. One definition
 * of «where does this hit end on the molecule» is the point; a second one would drift.
 */
export function physicalEndpointOf(start, targetSpan, n, circular) {
  const raw = start + targetSpan;
  return circular ? ((raw % n) + n) % n : raw;
}

function physicalEndpoint(o, n, circular) {
  return physicalEndpointOf(o.start, o.metrics.targetSpan, n, circular);
}

/**
 * The full §3.2 comparator on a built occurrence. Lower is better; `<0` ⇒ `a` wins.
 * `endA`/`endB` supply rule 6: inside an endpoint group callers pass the SAME lifted `E` for both,
 * so rule 6 cannot discriminate there — otherwise the winner would depend on the ring's rotation.
 */
export function compareOccurrence(a, b, endA, endB) {
  const am = a.metrics; const bm = b.metrics;
  // 1 — identity ratio, cross-multiplied (integers only; never a float comparison)
  const lhs = am.exactMatches * bm.alignmentLength;
  const rhs = bm.exactMatches * am.alignmentLength;
  if (lhs !== rhs) return rhs - lhs;
  if (am.exactMatches !== bm.exactMatches) return bm.exactMatches - am.exactMatches; // 2 more matched
  if (am.editDistance !== bm.editDistance) return am.editDistance - bm.editDistance; // 3
  if (am.indelEvents !== bm.indelEvents) return am.indelEvents - bm.indelEvents; //     4
  const da = Math.abs(am.targetSpan - am.queryLength);
  const db = Math.abs(bm.targetSpan - bm.queryLength);
  if (da !== db) return da - db; //                                                     5
  if (endA !== endB) return endA - endB; //                                             6
  return a.script < b.script ? -1 : a.script > b.script ? 1 : 0; //                     7
}

/**
 * Endpoint-shadow pruning (SPEC §3.2.1). For one `(strand, physicalEndpoint)` only the
 * comparator-best candidate survives: B is dropped iff some A shares its physical endpoint, is
 * STRICTLY nested in either direction, and strictly wins the §3.2 comparator. A strict tie drops
 * nothing.
 *
 * Direction is deliberately NOT privileged. An exact N-mer at a low threshold produces two ladders
 * that end at the same base — a right one (`I^d =^(N−d)`, shifted start, nested INSIDE the full
 * hit) and a mirror left one (leading substitutions plus interior deletions, CONTAINING it). Both
 * are just alternative explanations of the same boundary, so both collapse onto the exact hit.
 * Igor's minimal case: query `ACGT` on `AACGT` — `=D===` (4/5, `[0,5)`) and the exact `====`
 * (`[1,5)`) share endpoint 5, and the exact one wins.
 *
 * Sharing an endpoint means the intervals are `[E − span, E)`, so "strictly nested" reduces to
 * "different span". It is NOT overlap clustering: different endpoints never collapse, so `AA` in
 * `AAAA` keeps starts 0,1,2 and tandem repeats keep every copy.
 *
 * Removal is decided against the ORIGINAL set (an A that is itself dropped still shadows B — the
 * comparator is a strict order, so the eventual winner shadows B too). Callers apply it per
 * strand, BEFORE ranking, `limit` and the `both`-merge.
 */
export function pruneEndpointShadows(occs, n, circular) {
  const groups = new Map();
  for (const o of occs) {
    const p = physicalEndpoint(o, n, circular);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(o);
  }
  const dropped = new Set();
  for (const [E, group] of groups) {
    if (group.length < 2) continue;
    for (const b of group) {
      for (const a of group) {
        if (a === b) continue;
        if (a.metrics.targetSpan === b.metrics.targetSpan) continue; // not strictly nested
        // Same lifted end for both — rule 6 is a no-op inside the group (rotation invariance).
        if (compareOccurrence(a, b, E, E) < 0) { dropped.add(b); break; }
      }
    }
  }
  return dropped.size ? occs.filter((o) => !dropped.has(o)) : occs;
}

/**
 * Index of the canonical §3.2 winner over the WHOLE set — the answer that has to be computed HERE,
 * because here is the last place it can be computed at all (P1-3).
 *
 * The comparator ends with a lexical tiebreak on the edit `script`, and the compact boundary drops
 * the script by design (U4). So rule 7 is decidable exactly once, on these objects; every later
 * stage can only carry the verdict, never re-derive it. Naming an INDEX rather than reordering is
 * deliberate: the emitted list stays positional — an in-molecule list of sites must read along the
 * molecule — while the winner survives as a fact travelling beside it.
 *
 * What makes this non-optional: on a circle the winner is the hit with the smallest PHYSICAL
 * endpoint (rule 6), and a hit ending exactly at the origin has endpoint 0 with the LARGEST start on
 * the molecule. It is therefore the first casualty of any positional cap.
 *
 * @param {Array} occs
 * @param {number} n — molecule length
 * @param {boolean} circular
 * @returns {number} index into `occs`, or −1 for an empty set
 */
export function canonicalBestIndex(occs, n, circular) {
  if (!Array.isArray(occs) || occs.length === 0) return -1;
  let best = 0;
  let bestEnd = physicalEndpoint(occs[0], n, circular);
  for (let i = 1; i < occs.length; i += 1) {
    const end = physicalEndpoint(occs[i], n, circular);
    if (compareOccurrence(occs[i], occs[best], end, bestEnd) < 0) { best = i; bestEnd = end; }
  }
  return best;
}

function locationKey(o) {
  return `${o.start}|${o.end}|${o.segments.map((s) => `${s.start}:${s.end}`).join(',')}`;
}

/**
 * Merge `+`/`−` occurrences that share physical location AND an EQUIVALENT alignment (§2.6). The
 * canonical edit `script` is the discriminator, not just the M/U/X/I/D totals: two alignments can
 * carry the same counts yet place the substitution/gap at different positions (e.g. `=I=X` vs
 * `IX==`), which are genuinely different occurrences and MUST stay separate. Scripts run in
 * ascending target-offset order on both strands, so an exact palindrome (EcoRI `======`) still
 * merges while a differently-placed edit does not.
 */
export function mergeStrands(plus, minus) {
  const out = [...plus];
  const byLoc = new Map(out.map((o) => [locationKey(o), o]));
  for (const m of minus) {
    const p = byLoc.get(locationKey(m));
    if (p && p.strand === '+' && p.script === m.script) p.strand = 'both';
    else out.push(m);
  }
  return out;
}
