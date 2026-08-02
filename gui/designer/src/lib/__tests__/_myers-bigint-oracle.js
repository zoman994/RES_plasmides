/**
 * TEST-ONLY ORACLE — the single-BigInt Myers sweep exactly as production ran it before U6-B.
 *
 * This is a frozen copy of `dna-approx-scan`'s recurrence, kept so the block-vector replacement can
 * be compared against the thing it replaces rather than against a re-derived expectation. It is
 * imported ONLY by tests; nothing under `src/lib` may import it, and a repo check asserts that.
 *
 * The reason it has to exist is that end-to-end parity is not enough to catch the failure this port
 * is most likely to have. A wrong `hbit` or a dropped carry between words produces EXTRA candidate
 * starts, and the verifier downstream throws extras away — so the user-visible answer stays green
 * while the scan silently does more work and, on a different input, could just as easily lose a
 * candidate instead. The comparison therefore has to reach the scanner's own output: the whole
 * end-distance array and the exact/approx start sets, not the occurrences they eventually become.
 *
 * Verbatim, deliberately: any «tidying» here would weaken it as a reference.
 */

/** Myers' bit-vector recurrence on one arbitrary-width BigInt word. */
function runMyersBigInt(m, pat, charAt, n, visit) {
  if (m === 0) {
    for (let j = 0; j < n; j += 1) visit(j, 0);
    return;
  }
  const ONE = 1n;
  const fullMask = (ONE << BigInt(m)) - ONE;
  const highBit = ONE << BigInt(m - 1);
  const Peq = Object.create(null);

  let Pv = fullMask;
  let Mv = 0n;
  let score = m;
  for (let j = 0; j < n; j += 1) {
    const c = charAt(j);
    let Eq = Peq[c];
    if (Eq === undefined) {
      Eq = 0n;
      for (let i = 0; i < m; i += 1) if (pat[i] === c) Eq |= (ONE << BigInt(i));
      Peq[c] = Eq;
    }
    const Xv = Eq | Mv;
    const Xh = ((((Eq & Pv) + Pv) & fullMask) ^ Pv) | Eq;
    let Ph = Mv | (~(Xh | Pv) & fullMask);
    let Mh = Pv & Xh;
    if (Ph & highBit) score += 1;
    else if (Mh & highBit) score -= 1;
    Ph = (Ph << ONE) & fullMask;
    Mh = (Mh << ONE) & fullMask;
    Pv = Mh | (~(Xv | Ph) & fullMask);
    Mv = Ph & Xv;
    visit(j, score);
  }
}

/** `out[j]` = edit distance of `pattern` against the best text substring ending at `j+1`. */
export function oracleEndDistances(pattern, text) {
  const n = text.length;
  const out = new Array(n);
  runMyersBigInt(pattern.length, pattern, (j) => text[j], n, (j, s) => { out[j] = s; });
  return out;
}

/** Forward start positions within `k` edits — the union the old single-threshold scan returned. */
export function oracleCandidateStarts(query, target, k) {
  const n = target.length;
  const m = query.length;
  if (!query || !target || m > n + k) return [];
  const budget = Math.max(0, Math.floor(k));
  const pat = new Array(m);
  for (let i = 0; i < m; i += 1) pat[i] = query[m - 1 - i];
  const charAt = (j) => target[n - 1 - j];
  const starts = new Set();
  runMyersBigInt(m, pat, charAt, n, (j, score) => {
    if (score <= budget) {
      const start = n - (j + 1);
      if (start >= 0) starts.add(start);
    }
  });
  if (m <= budget) starts.add(n);
  return [...starts].sort((a, b) => a - b);
}

/** The same sweep, keeping exact (distance 0) and approximate starts apart. */
export function oracleCandidateStartsSplit(query, target, k) {
  const n = target.length;
  const m = query.length;
  if (!query || !target || m > n + k) return { exact: [], approx: [] };
  const budget = Math.max(0, Math.floor(k));
  const pat = new Array(m);
  for (let i = 0; i < m; i += 1) pat[i] = query[m - 1 - i];
  const charAt = (j) => target[n - 1 - j];
  const exact = new Set();
  const approx = new Set();
  runMyersBigInt(m, pat, charAt, n, (j, score) => {
    if (score > budget) return;
    const start = n - (j + 1);
    if (start < 0) return;
    (score === 0 ? exact : approx).add(start);
  });
  if (m <= budget) approx.add(n);
  const asc = (s) => [...s].sort((a, b) => a - b);
  return { exact: asc(exact), approx: asc(approx) };
}
