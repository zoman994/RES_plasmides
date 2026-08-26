/**
 * primer-flank — geometry for the «two selected primers flank a
 * fragment» highlight (Игорь 18.05.2026). Pure.
 *
 * Given two RESOLVED primer hits ({start,end,direction} on the
 * sequence — what PrimerTrack already computes via indexOf), return
 * the bracketed amplicon [min(start), max(end)].
 *
 * Biological invariant (Игорь 18.05.2026): an amplicon is flanked by
 * a FORWARD + REVERSE pair. Two same-direction primers (fwd-fwd or
 * rev-rev) do not bracket a product — flankedSpan returns null so no
 * highlight is drawn. null also on bad / missing input.
 */
function norm(h) {
  if (!h || typeof h.start !== 'number' || typeof h.end !== 'number') return null;
  if (!Number.isFinite(h.start) || !Number.isFinite(h.end)) return null;
  return { lo: Math.min(h.start, h.end), hi: Math.max(h.start, h.end) };
}

/**
 * @param {object} a one resolved hit
 * @param {object} b the other
 * @param {{circular?: boolean, seqLength?: number}} [opts]
 *   Omitted (or linear) → the original two-argument answer, byte for byte.
 *   On a ring the arc is walked FORWARD from the forward primer to the
 *   reverse one, because `min..max` on a pair that brackets the origin
 *   describes the whole rest of the plasmid — precisely everything the
 *   product is not — and leaves the real amplicon unpainted.
 */
export function flankedSpan(a, b, opts) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return null;
  // Opposite-direction pair only (fwd+rev / rev+fwd). Same-direction
  // pairs don't define an amplicon → no flank highlight.
  const da = a.direction === 'reverse' ? 'reverse' : 'forward';
  const db = b.direction === 'reverse' ? 'reverse' : 'forward';
  if (da === db) return null;

  const n = Number(opts?.seqLength);
  if (!opts?.circular || !Number.isFinite(n) || n <= 0) {
    return {
      start: Math.min(na.lo, nb.lo),
      end: Math.max(na.hi, nb.hi),
    };
  }

  // The product runs 5'->3' along the top strand: from the FORWARD primer's
  // start to the REVERSE primer's far edge, crossing the origin if it must.
  const fwd = da === 'forward' ? na : nb;
  const rev = da === 'forward' ? nb : na;
  const start = fwd.lo;
  const end = rev.hi;
  const wrapsOrigin = end <= start;
  return {
    start,
    end,
    wrapsOrigin,
    segments: wrapsOrigin
      ? [{ start, end: n }, { start: 0, end }]
      : [{ start, end }],
  };
}
