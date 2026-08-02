/**
 * resumable-sort — a comparison sort that can be INTERRUPTED.
 *
 * WHY THIS EXISTS. `Array.prototype.sort` is a single uninterruptible call. Everywhere else on the
 * search path the work is expressed as a generator so a worker can take delivery of a cancel frame
 * mid-search, but a sort defeats that by construction: however many suspension points the scan and
 * the verifier offer, the moment the result set reaches `sort()` the thread is held until the last
 * comparison. On the sequence path the array being sorted is the RESULT SET, whose ceiling is the
 * output budget — 200 000 occurrences — so this is the largest single uninterruptible block the
 * pipeline had left, sitting exactly at its end.
 *
 * Bottom-up merge sort, because the merge is the one shape that suspends cleanly: each merge writes
 * a contiguous stretch of the destination and nothing carries across the pause but two indices.
 *
 * STABLE, and that is load-bearing rather than incidental. The callers below sort by a POSITIONAL
 * key that deliberately does not separate every pair (two occurrences can share start, end and
 * strand), and `Array.prototype.sort` is itself specified stable — so an unstable replacement would
 * silently permute ties and change a canonical answer that is compared byte-for-byte against the
 * other kernel. An element is taken from the RIGHT run only when it compares STRICTLY smaller.
 *
 * Pure leaf: no engine, no store, no UI.
 */

/** Elements written between suspensions. Small enough that a cancel lands promptly, large enough
 *  that the generator overhead stays invisible next to the comparator itself. */
export const CHUNK = 4096;

/**
 * Sort `arr` IN PLACE with `cmp`, suspending every `CHUNK` ELEMENTS WRITTEN.
 *
 * THE UNIT IS THE ELEMENT, NOT THE MERGE. Counting whole merges was a suspension schedule that
 * looked bounded and was not: the final pass of a bottom-up merge sort is ONE merge covering the
 * whole array, so a 200 000-element result set did its entire last pass — and then its whole
 * copy-back — inside a single `next()`. Suspensions existed, so a cancel could be *delivered*; how
 * long it would wait was unbounded, which is the half of the contract that actually matters at the
 * end of a search. Every loop that writes an element therefore counts and yields on the same shared
 * budget: the main merge, both tails, and the copy-back.
 *
 * @param {Array} arr
 * @param {(a:any, b:any) => number} cmp
 * @returns {Array} the same array, sorted
 */
export function* sortSteps(arr, cmp) {
  const n = arr.length;
  if (n < 2) return arr;
  let src = arr;
  let dst = new Array(n);
  let since = 0;
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width, n);
      const hi = Math.min(lo + 2 * width, n);
      let i = lo;
      let j = mid;
      let k = lo;
      while (i < mid && j < hi) {
        // STRICTLY smaller, or the left run keeps the tie — this is the stability rule.
        if (cmp(src[j], src[i]) < 0) { dst[k] = src[j]; j += 1; } else { dst[k] = src[i]; i += 1; }
        k += 1;
        since += 1;
        if (since >= CHUNK) { since = 0; yield; }
      }
      // The tails are not a rounding error: when one run is exhausted early the other is copied
      // wholesale, and on the last pass «the other run» can be most of the array.
      while (i < mid) {
        dst[k] = src[i]; i += 1; k += 1;
        since += 1;
        if (since >= CHUNK) { since = 0; yield; }
      }
      while (j < hi) {
        dst[k] = src[j]; j += 1; k += 1;
        since += 1;
        if (since >= CHUNK) { since = 0; yield; }
      }
    }
    const swap = src; src = dst; dst = swap;
  }
  // An odd number of passes leaves the answer in the scratch buffer; copy it back so the caller's
  // array is the sorted one either way (callers hold the reference, not the return value). This is a
  // full pass over the result set in its own right and suspends on the same budget — a bounded sort
  // followed by an unbounded copy is an unbounded sort.
  if (src !== arr) {
    for (let i = 0; i < n; i += 1) {
      arr[i] = src[i];
      since += 1;
      if (since >= CHUNK) { since = 0; yield; }
    }
  }
  return arr;
}

/** The same sort, DRAINED — one implementation, two drives. */
export function sortDrained(arr, cmp) {
  const gen = sortSteps(arr, cmp);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}
