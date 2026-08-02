/**
 * dna-linear-scan.js — the gapped-DNA linear kernel, CANDIDATE-GENERATION half.
 *
 * ON THE PRODUCTION SEARCH PATH since U6-F: seq-match.js -> dna-linear-provider.js ->
 * dna-linear-kernel.js -> this module. The §4.2.0 length routing and the 100 nt approximate-search
 * limit are unchanged by that, and so are every budget and the client timeout; what changed is which
 * verifier runs behind them.
 *
 * Normative source: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.5, §4.2.1(2), §4.2.1(4).
 *
 * RESPONSIBILITY: alphabet encoding, the block-vector Myers scanner that proposes candidate END
 * positions, and the one reversed banded free-start DP per window that proposes candidate
 * STARTS. Everything here is a FILTER: it may only over-approximate, never decide. Exact
 * per-start verification lives in dna-linear-verify.js; selection and pruning live in
 * dna-linear-kernel.js. Do not mix those responsibilities back into this file.
 *
 * ============ THE LAST BLOCK READS BIT (m-1)%32, NOT BIT 31 ============
 * The horizontal carry-out of each 32-bit block is read at `hbit[b]`. For every block but the last
 * that is bit 31, but the LAST block is only `m - 32*b` rows tall and its score bit sits at
 * (m-1)&31. Reading bit 31 there corrupts Score[nb-1] for every query whose length is not a
 * multiple of 32: the padding rows above (m-1)&31 are not part of the query.
 *
 * THE ARITHMETIC ITSELF NO LONGER LIVES HERE (U6-B). The block state, the word step, the carry and
 * `hbit` moved to `dna-myers-block`, which the PRODUCTION start-scanner now runs on as well — one
 * recurrence, two adapters. This file keeps the forward traversal, the coded alphabet, the
 * active-block cutoff and the streaming `onEnd` contract.
 *
 * THE GUARD THIS HEADER USED TO DEFER NOW EXISTS. It said the block-boundary cases were blind to
 * corruption that ADDS candidate ends and that «a real guard needs an assertion directly on the
 * scanner output; U3 owns adding it». Both halves are now closed, and by measurement rather than by
 * assertion:
 *   • `u6b-cutoff-contract.test.js` compares the scanner's candidate ENDS directly — cutoff against
 *     no-cutoff against a frozen BigInt oracle — at 31/32/33, 63/64/65, 95/96/97/100, on
 *     low-complexity and foreign-glyph targets, plus 250 seeded fuzz cases.
 *   • `u6b-myers-block-oracle.test.js` compares the whole end-distance array and the exact/approx
 *     start sets for the production adapter.
 * `hbit[b] = 31` unconditionally now REDDENS both files, so the corruption that used to pass 50/50
 * green is caught at the arithmetic, not left to the verifier to absorb.
 *
 * One asymmetry is worth keeping in mind, because it is a property of the design and not a gap: an
 * over-eager GROW cursor cannot change which ends are emitted (an end needs the last block active
 * AND within budget), so it is pinned as a WORK bound instead — measured word evaluations with the
 * cutoff on versus off.
 * =======================================================================
 */

import { BlockMyers, blockCount, buildPeqCoded } from './dna-myers-block';

const CODE = new Uint8Array(256).fill(255);
CODE[0x41] = 0; CODE[0x61] = 0; // A a
CODE[0x43] = 1; CODE[0x63] = 1; // C c
CODE[0x47] = 2; CODE[0x67] = 2; // G g
CODE[0x54] = 3; CODE[0x74] = 3; // T t

export const INVALID_DNA = 'INVALID_DNA';

function invalidDna(what) {
  const e = new Error(`invalid-dna: ${what}`);
  e.code = INVALID_DNA;
  return e;
}

/**
 * Full code point → base code, or the 255 sentinel. Never `undefined`.
 *
 * THE SENTINEL IS DECIDED BEFORE THE TABLE READ, and that ordering is the whole point. `CODE` is
 * a Uint8Array of length 256, so `CODE[321]` reads out of bounds and yields `undefined`; writing
 * `undefined` into a Uint8Array coerces it to 0 — the code for A. So simply deleting the old
 * `& 0xff` would have kept the exact same bug through a different door: `Ł` (U+0141) would go on
 * being adenine. Every code point ≥ 256 is classified as foreign here, before any lookup happens.
 * Lone surrogates land in 0xD800..0xDFFF and are therefore foreign as well.
 */
function codeOf(cp) {
  return cp < 256 ? CODE[cp] : 255;
}

/**
 * Target: anything outside ACGT becomes 255 and can never produce '=' (§2.5). Length is
 * preserved exactly — a foreign symbol is one `X` column, never a deletion, so coordinates
 * downstream keep meaning physical target positions.
 *
 * RESUMABLE, because a megabase target is real work and it all happens BEFORE the scanner's first
 * suspension point: a cancel issued at the start of a search could not be observed until the whole
 * molecule had been encoded. This generator is the only implementation; `encodeTarget` drains it.
 */
export function* encodeTargetSteps(s) {
  const n = s.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i > 0 && (i & 65535) === 0) yield;
    out[i] = codeOf(s.charCodeAt(i));
  }
  return out;
}

/** The same encoding, DRAINED. */
export function encodeTarget(s) {
  const gen = encodeTargetSteps(s);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/** Query: trim + uppercase only, then fail-closed ACGT validation (§2.5). */
export function encodeQuery(s) {
  const t = String(s).trim();
  const n = t.length;
  // Empty or whitespace-only is fail-closed, not an empty search: an empty probe would otherwise
  // read as "matches nothing" when the caller actually supplied no query at all.
  if (n === 0) throw invalidDna('query must not be empty');
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = codeOf(t.charCodeAt(i));
    // Foreign symbols are REFUSED, never stripped and never normalised. Stripping would let
    // `ACŁGT` be re-read as the 4-mer `ACGT` and report a 100% hit for a query the biologist
    // never typed; every downstream coordinate would shift with it.
    if (c > 3) throw invalidDna(`query must be ACGT only (position ${i})`);
    out[i] = c;
  }
  return out;
}

/** Reverse complement of a coded query, in interruptible chunks. Short on the product path (the
 *  §4.2.0 limit is 100 nt), but this entry point is reachable with any query, and «short in
 *  practice» is not the same as bounded. */
export function* revCompCodesSteps(q) {
  const n = q.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i > 0 && (i & 65535) === 0) yield;
    out[i] = 3 - q[n - 1 - i];
  }
  return out;
}

/** The same, DRAINED. */
export function revCompCodes(q) {
  const gen = revCompCodesSteps(q);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/**
 * Candidate-END scanner over the shared block-Myers recurrence (§4.2.1(4)).
 *
 * U6-B moved the word arithmetic, the carry between words and the score bit into `dna-myers-block`,
 * which the production start-scanner now uses as well. This class keeps everything that is ITS own:
 * the forward traversal, the coded 4-letter alphabet, the active-block cutoff, and the streaming
 * `onEnd` contract. The recurrence it runs is byte-for-byte the one it ran before — it simply is no
 * longer a second copy of it.
 */
export class MyersScanner {
  constructor(qcodes, k) {
    const m = qcodes.length;
    this.m = m;
    this.k = k;
    this.nb = blockCount(m);
    this.Peq = buildPeqCoded(qcodes, 4);
    this.state = new BlockMyers(m, k);
  }

  reset() {
    this.state.reset(true);
  }

  /**
   * Candidate END positions (exclusive, 1..len) with free-start unit edit distance <= k.
   * With K = floor(qLen*(10000-thr)/thr) this is a provable SUPERSET of every acceptable
   * end, so the scan is a filter and never a decision.
   *
   * STREAMING (§4.2.1(10)). Candidate ends are handed to `onEnd` as they are produced and are
   * never accumulated here. The old version returned a full `ends[]`, which on a low-complexity
   * target — poly-A, a tandem repeat, a shared backbone — qualifies at nearly every position and
   * so allocated O(target) before verification had rejected any of it. Nothing about the answer
   * changes: the same positions are produced in the same order.
   *
   * `ctl` carries the per-call resource hooks: `charge()` is called once per scanned position so
   * the scan axis is measured where the work happens, and `checkCancel()` runs on a fixed stride
   * so an abort is deterministic rather than dependent on machine speed.
   *
   * @param {boolean} cutoff active-block cutoff on (false = reference path, for tests)
   */
  /**
   * RESUMABLE form. The generator suspends where the synchronous version merely checked a flag:
   * a worker cannot deliver a cancel frame while the thread is held, so a `checkCancel` that runs
   * inside a synchronous call can only ever observe a decision taken BEFORE the call started.
   * Suspending at the same stride makes the same decision observable DURING it.
   */
  * scanStreamSteps(ext, len, cutoff, onEnd, ctl) {
    this.state.reset(cutoff);
    const { nb, Peq, state } = this;
    const charge = ctl && ctl.charge;
    const checkCancel = ctl && ctl.checkCancel;
    const stride = (ctl && ctl.cancelStride) || 4096;
    for (let j = 0; j < len; j++) {
      if (charge) charge();
      // BOTH mechanisms, at the same point and for different drives: `checkCancel` is the
      // synchronous abort a caller armed before the call, `yield` is where a cooperative driver
      // gets the thread back. Replacing the first with the second would have silently changed the
      // synchronous contract — the deterministic-checkpoint test caught exactly that.
      // Fixed stride, not elapsed time: the same input must consume the same number of checks on
      // every machine, otherwise "cancelled after N checks" is untestable.
      if ((j % stride) === 0) { if (checkCancel) checkCancel(); yield; }
      const c = ext[j];
      const base = (c < 4) ? c * nb : -1;
      const dist = state.advance(Peq, base, cutoff);
      if (dist >= 0 && dist <= this.k) onEnd(j + 1);
    }
  }

  /**
   * The same walk, DRAINED — one implementation, two drives. It used to be a second copy of the
   * loop, which is exactly how a resumable path and a synchronous one start answering differently.
   */
  scanStream(ext, len, cutoff, onEnd, ctl) {
    const gen = this.scanStreamSteps(ext, len, cutoff, onEnd, ctl);
    let step = gen.next();
    while (!step.done) step = gen.next();
  }
}

/**
 * For the window of candidate ends [e1..e2] (ALL retained) decide, for every forward start s
 * in [wStart, e2-1], whether ANY alignment [s, e) with e <= e2 satisfies M/L >= theta.
 * Reversing query and window turns "all forward starts" into "all reversed end columns", so
 * one sweep answers the whole window — the §4.2.1(2) shared bounded window.
 * score = 10000*M - theta*L => weights '=' +10000, 'X' 0, 'I' 0, 'D' -theta;
 * accept iff score >= theta*m.
 */
/**
 * RESUMABLE form of the shared bounded window. Suspends every 64 rows — the same stride at which
 * the synchronous version checked its cancel flag, and for the same reason: this DP is the dominant
 * cost of the whole engine on low-complexity input, so it is exactly where a cancel has to land.
 */
export function* windowAcceptSteps(q, ext, wStart, e2, thr, out, ctl) {
  const m = q.length;
  const Lw = e2 - wStart;
  if (Lw < 1) return;
  if (ctl) { ctl.chargeVerifier(m * Lw); ctl.checkCancel(); }
  yield;
  let prev = new Float64Array(Lw + 1);
  let cur = new Float64Array(Lw + 1);
  const nonD = new Float64Array(Lw + 1);
  if (ctl) ctl.noteWindow(24 * (Lw + 1));
  prev.fill(0);
  for (let i = 1; i <= m; i++) {
    if ((i & 63) === 0) { if (ctl) ctl.checkCancel(); yield; }
    const qc = q[m - i];
    cur[0] = 0;
    const last = (i === m);
    if (last) nonD[0] = 0;
    for (let j = 1; j <= Lw; j++) {
      const tc = ext[e2 - j];
      const diag = prev[j - 1] + ((tc < 4 && tc === qc) ? 10000 : 0);
      const ins = prev[j];
      let best = diag > ins ? diag : ins;
      if (last) nonD[j] = best;
      const del = cur[j - 1] - thr;
      if (del > best) best = del;
      cur[j] = best;
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  const need = thr * m;
  for (let j = 1; j <= Lw; j++) {
    if (nonD[j] >= need) {
      const s = e2 - j;
      if (s >= 0) out(s);
    }
  }
}

/** The same sweep, DRAINED — kept for synchronous callers, never a second copy of the DP. */
export function windowAccept(q, ext, wStart, e2, thr, out, ctl) {
  const gen = windowAcceptSteps(q, ext, wStart, e2, thr, out, ctl);
  let step = gen.next();
  while (!step.done) step = gen.next();
}
