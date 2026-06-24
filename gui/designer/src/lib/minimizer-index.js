/**
 * minimizer-index.js — (w,k) minimizer sketching + a global library index for
 * fast homology candidate generation (литобзор §A6; minimizers — Roberts et al.
 * 2004; the seeding core of minimap2, Li 2018). Pure, client-side.
 *
 * Why: the exact seed-and-extend search (`sequence-search.js`) is great per
 * pair but O(library) when scanning every entry. A minimizer sketch reduces
 * each sequence to a small, strand-canonical set of representative k-mers; a
 * one-time inverted index over the library then answers «which entries share
 * minimizers with this query?» in roughly O(query sketch), so the expensive
 * aligner only runs on the top candidates. Reverse-complement homologs are
 * found because each k-mer is hashed CANONICALLY (min of forward / revcomp).
 */

const CODE = { A: 0, C: 1, G: 2, T: 3 };

// 32-bit avalanche mix so minimizer selection isn't biased by lexicographic
// k-mer order (a plain 2-bit code would always pick poly-A windows).
function mix32(x) {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/**
 * Strand-canonical (w,k) minimizers of `seq`.
 * @returns {Array<{h:number,pos:number}>} deduped minimizers in order.
 */
export function computeMinimizers(seq, opts = {}) {
  const k = opts.k ?? 12;
  const w = opts.w ?? 8;
  const s = String(seq || '').toUpperCase();
  const n = s.length;
  if (n < k) return [];
  const mask = (1 << (2 * k)) >>> 0; // 4^k; used as modulus via (x % mask)
  // Canonical k-mer hash at each start position (skip windows with non-ACGT).
  const kmerHash = new Array(n - k + 1).fill(-1);
  let fwd = 0;
  let rev = 0;
  let valid = 0; // consecutive valid bases
  const top = 2 * (k - 1);
  for (let i = 0; i < n; i++) {
    const c = CODE[s[i]];
    if (c === undefined) { valid = 0; fwd = 0; rev = 0; continue; }
    fwd = ((fwd << 2) | c) % mask;
    rev = ((rev >>> 2) | ((3 - c) << top)) % mask; // revcomp rolling
    valid += 1;
    if (valid >= k) {
      const start = i - k + 1;
      kmerHash[start] = Math.min(mix32(fwd), mix32(rev));
    }
  }
  // Slide a window of w consecutive k-mers; the minimum hash is the minimizer.
  const out = [];
  let lastPos = -1;
  for (let i = 0; i + k - 1 < n; i++) {
    const winEnd = i + w; // k-mers [i, i+w)
    if (winEnd > kmerHash.length) break;
    let bestH = Infinity;
    let bestPos = -1;
    for (let p = i; p < winEnd; p++) {
      const h = kmerHash[p];
      if (h >= 0 && h < bestH) { bestH = h; bestPos = p; }
    }
    if (bestPos >= 0 && bestPos !== lastPos) { out.push({ h: bestH, pos: bestPos }); lastPos = bestPos; }
  }
  return out;
}

/** Set of minimizer hashes for `seq` (sketch). */
export function minimizerSketch(seq, opts = {}) {
  return new Set(computeMinimizers(seq, opts).map((m) => m.h));
}

/**
 * Build an inverted index over library entries.
 * @param {Array<{id:string,sequence:string}>} entries
 * @returns {{ byHash:Map<number,string[]>, sketchSize:Map<string,number>, opts:object }}
 */
export function buildMinimizerIndex(entries, opts = {}) {
  const k = opts.k ?? 12;
  const w = opts.w ?? 8;
  const byHash = new Map();
  const sketchSize = new Map();
  for (const e of entries || []) {
    if (!e || typeof e.sequence !== 'string') continue;
    const sketch = minimizerSketch(e.sequence, { k, w });
    sketchSize.set(e.id, sketch.size);
    for (const h of sketch) {
      let arr = byHash.get(h);
      if (!arr) { arr = []; byHash.set(h, arr); }
      arr.push(e.id);
    }
  }
  return { byHash, sketchSize, opts: { k, w } };
}

/**
 * Rank library entries by minimizer overlap with the query (a fast pre-filter
 * before exact alignment). Ranks by `score = max(jaccard, containment)`:
 * Jaccard rewards whole-sequence similarity, while CONTAINMENT
 * (shared / min(|q|,|e|)) keeps a SHORT-but-identical fragment near the top —
 * Jaccard alone would bury it under the size mismatch, dropping a true homolog
 * from the pre-filter (adversarial-review §A6 recall fix). A pre-filter must
 * favour recall; the exact aligner downstream handles precision.
 * @returns {Array<{entryId:string, shared:number, jaccard:number, containment:number, score:number}>} desc.
 */
export function rankByMinimizers(index, querySeq, opts = {}) {
  const { byHash, sketchSize } = index;
  const k = index.opts?.k ?? 12;
  const w = index.opts?.w ?? 8;
  const limit = opts.limit ?? 16;
  const excludeId = opts.excludeId ?? null;
  const qSketch = minimizerSketch(querySeq, { k, w });
  const shared = new Map();
  for (const h of qSketch) {
    const arr = byHash.get(h);
    if (!arr) continue;
    for (const id of arr) {
      if (id === excludeId) continue;
      shared.set(id, (shared.get(id) || 0) + 1);
    }
  }
  const qSize = qSketch.size || 1;
  const ranked = [];
  for (const [entryId, sh] of shared) {
    const eSize = sketchSize.get(entryId) || 0;
    const union = (qSize + eSize - sh) || 1;
    const jaccard = sh / union;
    const containment = sh / (Math.min(qSize, eSize) || 1);
    ranked.push({ entryId, shared: sh, jaccard, containment, score: Math.max(jaccard, containment) });
  }
  ranked.sort((a, b) => b.score - a.score || b.shared - a.shared);
  return ranked.slice(0, limit);
}
