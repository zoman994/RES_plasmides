/**
 * primer-binding-search — PRIMER-1 (Игорь /loop 28.06): «поиск по библиотеке, куда
 * комплиментарен». Given a primer, find WHERE across the library it anneals — the
 * specificity / cross-reference audit the user asked for. Pure, no store.
 *
 * Biology: a primer anneals where its BINDING region (3′ part; the tail does not match
 * the template) is complementary to a strand.
 *   • primer seq found AS-IS in the top strand → it equals that top-strand stretch, so it
 *     anneals the BOTTOM strand and extends rightward → a FORWARD binding ('+').
 *   • reverse-complement of the primer found in the top strand → the primer anneals the
 *     TOP strand and extends leftward → a REVERSE binding ('-').
 * Exact match of the binding region anneals by design. PRIMER-5 adds mismatch-tolerant
 * («слабокомплементарные») hits via `maxMismatches`, flagging 3′-end mismatches (priming-
 * critical) and a multi-binding verdict (`summarizeBindingHits`). Circular entries match
 * across the origin.
 */
import { reverseComplement } from '../sequence-utils';

// 3′-clamp window: a mismatch within the last K bases of the primer's 3′ end usually kills
// priming, so it is flagged separately from internal (tolerable) mismatches.
const THREE_PRIME_CLAMP = 5;

const clean = (s) => String(s || '').toUpperCase().replace(/[^ACGT]/g, '');

function occurrences(hay, needle) {
  const out = [];
  if (!needle || needle.length > hay.length) return out;
  let i = hay.indexOf(needle);
  while (i !== -1) { out.push(i); i = hay.indexOf(needle, i + 1); }
  return out;
}

/**
 * Sliding-window Hamming scan: windows of `needle` length in `hay` with ≤ maxMM mismatches.
 * `threePrimeSide` says where the primer's 3′ end maps in the window ('right' for forward q,
 * 'left' for reverse rc) so a 3′-clamp mismatch can be flagged.
 * @returns {Array<{idx, mismatches, threePrimeMismatch}>}
 */
function fuzzyOccurrences(hay, needle, maxMM, threePrimeSide) {
  const out = [];
  const L = needle.length;
  if (!L || L > hay.length) return out;
  const k3 = Math.min(THREE_PRIME_CLAMP, L);
  const lo = threePrimeSide === 'right' ? L - k3 : 0;
  const hi = threePrimeSide === 'right' ? L : k3; // 3′ region = window indices [lo, hi)
  for (let i = 0; i + L <= hay.length; i += 1) {
    let mm = 0;
    let threeP = false;
    let ok = true;
    for (let j = 0; j < L; j += 1) {
      if (hay[i + j] !== needle[j]) {
        mm += 1;
        if (j >= lo && j < hi) threeP = true;
        if (mm > maxMM) { ok = false; break; }
      }
    }
    if (ok) out.push({ idx: i, mismatches: mm, threePrimeMismatch: threeP });
  }
  return out;
}

/**
 * @param {{sequence?:string, bindingSequence?:string}} primer the query primer (binding
 *   region preferred; the tail is ignored as it does not anneal).
 * @param {Array<{id, name?, sequence, topology?}>} entries library molecules.
 * @param {{minLen?:number, maxMismatches?:number}} opts minimum binding length (default 12);
 *   maxMismatches>0 enables weakly-complementary (mismatch-tolerant) hits (default 0 = exact).
 * @returns {Array<{entryId, entryName, strand:'+'|'-', start, end, matchLen, wraps:boolean,
 *   mismatches:number, threePrimeMismatch:boolean}>}
 *   start/end are 0-based, end-exclusive on the entry's top strand (wrapped for circular).
 */
export function scanLibraryForPrimer(primer, entries, opts = {}) {
  const minLen = opts.minLen || 12;
  const maxMM = Math.max(0, opts.maxMismatches || 0);
  const q = clean(primer && (primer.bindingSequence || primer.sequence));
  if (q.length < minLen) return [];
  const rc = reverseComplement(q);
  const list = Array.isArray(entries) ? entries : [];
  const hits = [];
  for (const e of list) {
    if (!e) continue;
    const seq = clean(e.sequence);
    if (seq.length < q.length) continue;
    const circular = !!(e.topology && e.topology.circular);
    // Circular: append the first (q.length-1) bases so a match that wraps the origin is
    // found; every match start still lands in [0, seq.length).
    const hay = circular ? seq + seq.slice(0, q.length - 1) : seq;
    const add = (idx, strand, mismatches, threePrimeMismatch) => {
      const endRaw = idx + q.length;
      hits.push({
        entryId: e.id,
        entryName: e.name || e.id,
        strand,
        start: idx,
        end: endRaw > seq.length ? endRaw - seq.length : endRaw,
        wraps: endRaw > seq.length,
        matchLen: q.length,
        mismatches,
        threePrimeMismatch,
      });
    };
    if (maxMM === 0) {
      occurrences(hay, q).forEach((i) => add(i, '+', 0, false));
      if (rc !== q) occurrences(hay, rc).forEach((i) => add(i, '-', 0, false));
    } else {
      fuzzyOccurrences(hay, q, maxMM, 'right').forEach((h) => add(h.idx, '+', h.mismatches, h.threePrimeMismatch));
      if (rc !== q) fuzzyOccurrences(hay, rc, maxMM, 'left').forEach((h) => add(h.idx, '-', h.mismatches, h.threePrimeMismatch));
    }
  }
  return hits;
}

/**
 * Specificity verdict over a hit list. A «priming site» is one whose 3′ end is intact
 * (exact, or weak with no 3′-clamp mismatch) — i.e. it will actually extend. Two or more
 * priming sites ⇒ multi-binding (mispriming / off-target risk).
 * @returns {{total, exact, weak, primingSites, multiBinding:boolean}}
 */
export function summarizeBindingHits(hits) {
  const list = Array.isArray(hits) ? hits : [];
  const exact = list.filter((h) => (h.mismatches || 0) === 0).length;
  const priming = list.filter((h) => (h.mismatches || 0) === 0 || !h.threePrimeMismatch).length;
  return {
    total: list.length,
    exact,
    weak: list.length - exact,
    primingSites: priming,
    multiBinding: priming >= 2,
  };
}
