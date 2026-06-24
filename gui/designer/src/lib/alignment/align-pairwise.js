/**
 * Pairwise sequence alignment — Needleman–Wunsch (global), semiglobal
 * (free terminal gaps) and Smith–Waterman (local) with affine gap penalties
 * (Gotoh, three-matrix M / Ix / Iy). IUPAC-aware scoring and optional
 * reverse-complement auto-detection. Pure, client-side, no backend.
 *
 * Memory: score rows are rolled (O(m)); only the traceback pointers are kept
 * full-size (Int8). For inputs above `maxFullCells` (or when an explicit
 * `band` is passed) a banded variant restricts the DP to a diagonal band and
 * stores compact traceback — keeps plasmid-vs-plasmid from blowing up.
 *
 * Returns aligned strings with '-' gaps plus a per-column classification used
 * by the alignment + chromatogram renderers. All indices are 0-based.
 */
import { reverseComplement } from '../../sequence-utils.js';
import { computeAlignmentStats } from './alignment-stats.js';
import { wfaAlignByScore } from './wfa.js';
import { anchorWindow } from './anchor.js';

const NEG_INF = -1e9;

const IUPAC = {
  A: 'A', C: 'C', G: 'G', T: 'T', U: 'T',
  R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC',
  B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT',
};

function expand(ch) { return IUPAC[ch] || 'ACGT'; }

// Precomputed A–Z × A–Z compatibility table (built from the exact same set
// logic below). The DP probes basesCompatible once per cell — for an 8M-cell
// read-vs-reference alignment that is millions of expand()+indexOf scans on the
// hot path. A flat Uint8Array lookup keyed by char code turns each into one
// array read, with byte-identical results.
const CC = (() => {
  const t = new Uint8Array(128 * 128);
  for (let a = 65; a <= 90; a++) {
    const sa = expand(String.fromCharCode(a));
    for (let b = 65; b <= 90; b++) {
      const cb = String.fromCharCode(b);
      let ok = (a === b) ? 1 : 0;
      if (!ok) { const sb = expand(cb); for (let i = 0; i < sa.length; i++) if (sb.indexOf(sa[i]) !== -1) { ok = 1; break; } }
      t[a * 128 + b] = ok;
    }
  }
  return t;
})();

/** IUPAC-aware base equality: compatible if their base sets intersect. */
export function basesCompatible(a, b) {
  if (a === b) return true;
  const ca = a.charCodeAt(0);
  const cb = b.charCodeAt(0);
  if (ca >= 65 && ca <= 90 && cb >= 65 && cb <= 90) return CC[ca * 128 + cb] === 1;
  // Non A–Z (shouldn't reach here for cleaned sequences) — exact set logic.
  const sa = expand(a);
  const sb = expand(b);
  for (let i = 0; i < sa.length; i++) if (sb.indexOf(sa[i]) !== -1) return true;
  return false;
}

function clean(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, ''); }

function autoBand(n, m) { return Math.max(64, Math.ceil(0.05 * Math.max(n, m))); }

/* ---------------- full Gotoh ---------------- */

function fullGotoh(A, B, p) {
  const n = A.length;
  const m = B.length;
  const { match, mismatch, gapOpen, gapExtend, mode } = p;
  const local = mode === 'local';
  const semi = mode === 'semiglobal';
  const W = m + 1;

  const tbM = new Int8Array((n + 1) * W);
  const tbX = new Int8Array((n + 1) * W);
  const tbY = new Int8Array((n + 1) * W);

  let Mp = new Float64Array(W);
  let Xp = new Float64Array(W);
  let Yp = new Float64Array(W);
  let Mc = new Float64Array(W);
  let Xc = new Float64Array(W);
  let Yc = new Float64Array(W);

  // row 0 — boundary conditions differ per mode:
  //   local: M[0][*]=0 (an alignment may start anywhere), X/Y = -inf (it may
  //          not start with a gap); semiglobal: Y[0][*]=0 (free leading gap),
  //          M = -inf; global: Y ramps by the gap penalty.
  Mp[0] = 0; Xp[0] = NEG_INF; Yp[0] = NEG_INF;
  for (let j = 1; j <= m; j++) {
    Mp[j] = local ? 0 : NEG_INF;
    Xp[j] = NEG_INF;
    Yp[j] = semi ? 0 : (local ? NEG_INF : gapOpen + (j - 1) * gapExtend);
    tbY[j] = (j === 1) ? 0 : 2;
  }

  const bestLocal = { score: 0, i: 0, j: 0, mat: 0 };
  const bestLastCol = { score: NEG_INF, i: 0, mat: 0 };

  for (let i = 1; i <= n; i++) {
    const ai = A[i - 1];
    Mc[0] = local ? 0 : NEG_INF;
    Yc[0] = NEG_INF;
    Xc[0] = semi ? 0 : (local ? NEG_INF : gapOpen + (i - 1) * gapExtend);
    const rowBase = i * W;
    tbX[rowBase] = (i === 1) ? 0 : 1;

    for (let j = 1; j <= m; j++) {
      const idx = rowBase + j;
      let bestD = Mp[j - 1];
      let code = 0;
      if (Xp[j - 1] > bestD) { bestD = Xp[j - 1]; code = 1; }
      if (Yp[j - 1] > bestD) { bestD = Yp[j - 1]; code = 2; }
      let ms = bestD + (basesCompatible(ai, B[j - 1]) ? match : mismatch);
      if (local && ms < 0) { ms = 0; code = -1; }
      Mc[j] = ms; tbM[idx] = code;

      const openX = Mp[j] + gapOpen;
      const extX = Xp[j] + gapExtend;
      if (openX >= extX) { Xc[j] = openX; tbX[idx] = 0; } else { Xc[j] = extX; tbX[idx] = 1; }

      const openY = Mc[j - 1] + gapOpen;
      const extY = Yc[j - 1] + gapExtend;
      if (openY >= extY) { Yc[j] = openY; tbY[idx] = 0; } else { Yc[j] = extY; tbY[idx] = 2; }

      if (local && Mc[j] > bestLocal.score) { bestLocal.score = Mc[j]; bestLocal.i = i; bestLocal.j = j; bestLocal.mat = 0; }
    }

    if (semi) {
      if (Mc[m] > bestLastCol.score) { bestLastCol.score = Mc[m]; bestLastCol.i = i; bestLastCol.mat = 0; }
      if (Xc[m] > bestLastCol.score) { bestLastCol.score = Xc[m]; bestLastCol.i = i; bestLastCol.mat = 1; }
      if (Yc[m] > bestLastCol.score) { bestLastCol.score = Yc[m]; bestLastCol.i = i; bestLastCol.mat = 2; }
    }

    let t;
    t = Mp; Mp = Mc; Mc = t;
    t = Xp; Xp = Xc; Xc = t;
    t = Yp; Yp = Yc; Yc = t;
  }

  const end = pickEnd(Mp, Xp, Yp, n, m, mode, bestLocal, bestLastCol);
  return { tbM, tbX, tbY, idx: (i, j) => i * W + j, ...end };
}

/* ---------------- banded Gotoh ---------------- */

function bandedGotoh(A, B, p, hbIn) {
  const n = A.length;
  const m = B.length;
  const { match, mismatch, gapOpen, gapExtend, mode } = p;
  const local = mode === 'local';
  const semi = mode === 'semiglobal';
  const effHb = hbIn + Math.abs(m - n);
  const bw = 2 * effHb + 1;
  const lo = (i) => Math.max(0, i - effHb);
  const hi = (i) => Math.min(m, i + effHb);
  const idx = (i, j) => i * bw + (j - lo(i));

  const tbM = new Int8Array((n + 1) * bw);
  const tbX = new Int8Array((n + 1) * bw);
  const tbY = new Int8Array((n + 1) * bw);

  let Mp = new Float64Array(m + 1).fill(NEG_INF);
  let Xp = new Float64Array(m + 1).fill(NEG_INF);
  let Yp = new Float64Array(m + 1).fill(NEG_INF);
  let Mc = new Float64Array(m + 1);
  let Xc = new Float64Array(m + 1);
  let Yc = new Float64Array(m + 1);

  Mp[0] = 0;
  for (let j = Math.max(1, lo(0)); j <= hi(0); j++) {
    Mp[j] = local ? 0 : NEG_INF;
    Yp[j] = semi ? 0 : (local ? NEG_INF : gapOpen + (j - 1) * gapExtend);
    tbY[idx(0, j)] = (j === 1) ? 0 : 2;
  }

  const bestLocal = { score: 0, i: 0, j: 0, mat: 0 };
  const bestLastCol = { score: NEG_INF, i: 0, mat: 0 };

  for (let i = 1; i <= n; i++) {
    Mc.fill(NEG_INF); Xc.fill(NEG_INF); Yc.fill(NEG_INF);
    const ai = A[i - 1];
    const jLo = lo(i);
    const jHi = hi(i);
    if (jLo === 0) {
      if (local) Mc[0] = 0;
      Xc[0] = semi ? 0 : (local ? NEG_INF : gapOpen + (i - 1) * gapExtend);
      tbX[idx(i, 0)] = (i === 1) ? 0 : 1;
    }
    for (let j = Math.max(1, jLo); j <= jHi; j++) {
      const id = idx(i, j);
      let bestD = Mp[j - 1];
      let code = 0;
      if (Xp[j - 1] > bestD) { bestD = Xp[j - 1]; code = 1; }
      if (Yp[j - 1] > bestD) { bestD = Yp[j - 1]; code = 2; }
      let ms = bestD + (basesCompatible(ai, B[j - 1]) ? match : mismatch);
      if (local && ms < 0) { ms = 0; code = -1; }
      Mc[j] = ms; tbM[id] = code;

      const openX = Mp[j] + gapOpen;
      const extX = Xp[j] + gapExtend;
      if (openX >= extX) { Xc[j] = openX; tbX[id] = 0; } else { Xc[j] = extX; tbX[id] = 1; }

      const openY = Mc[j - 1] + gapOpen;
      const extY = Yc[j - 1] + gapExtend;
      if (openY >= extY) { Yc[j] = openY; tbY[id] = 0; } else { Yc[j] = extY; tbY[id] = 2; }

      if (local && Mc[j] > bestLocal.score) { bestLocal.score = Mc[j]; bestLocal.i = i; bestLocal.j = j; bestLocal.mat = 0; }
      if (semi && j === m) {
        if (Mc[m] > bestLastCol.score) { bestLastCol.score = Mc[m]; bestLastCol.i = i; bestLastCol.mat = 0; }
        if (Xc[m] > bestLastCol.score) { bestLastCol.score = Xc[m]; bestLastCol.i = i; bestLastCol.mat = 1; }
        if (Yc[m] > bestLastCol.score) { bestLastCol.score = Yc[m]; bestLastCol.i = i; bestLastCol.mat = 2; }
      }
    }
    let t;
    t = Mp; Mp = Mc; Mc = t;
    t = Xp; Xp = Xc; Xc = t;
    t = Yp; Yp = Yc; Yc = t;
  }

  const end = pickEnd(Mp, Xp, Yp, n, m, mode, bestLocal, bestLastCol);
  return { tbM, tbX, tbY, idx, ...end };
}

/* ---------------- shared end-cell selection + traceback ---------------- */

function pickEnd(Mrow, Xrow, Yrow, n, m, mode, bestLocal, bestLastCol) {
  if (mode === 'local') {
    return { endI: bestLocal.i, endJ: bestLocal.j, endMat: bestLocal.mat, score: bestLocal.score };
  }
  if (mode === 'semiglobal') {
    let best = NEG_INF;
    let bI = n;
    let bJ = m;
    let bMat = 0;
    for (let j = 0; j <= m; j++) {
      if (Mrow[j] > best) { best = Mrow[j]; bI = n; bJ = j; bMat = 0; }
      if (Xrow[j] > best) { best = Xrow[j]; bI = n; bJ = j; bMat = 1; }
      if (Yrow[j] > best) { best = Yrow[j]; bI = n; bJ = j; bMat = 2; }
    }
    if (bestLastCol.score > best) { best = bestLastCol.score; bI = bestLastCol.i; bJ = m; bMat = bestLastCol.mat; }
    return { endI: bI, endJ: bJ, endMat: bMat, score: best };
  }
  // global
  let best = Mrow[m];
  let bMat = 0;
  if (Xrow[m] > best) { best = Xrow[m]; bMat = 1; }
  if (Yrow[m] > best) { best = Yrow[m]; bMat = 2; }
  return { endI: n, endJ: m, endMat: bMat, score: best };
}

function traceback(A, B, tbM, tbX, tbY, idx, endI, endJ, endMat, mode) {
  const semi = mode === 'semiglobal';
  const local = mode === 'local';
  let i = endI;
  let j = endJ;
  let mat = endMat;
  const aOut = [];
  const bOut = [];
  while (i > 0 || j > 0) {
    if (mat === 0) {
      const from = tbM[idx(i, j)];
      if (local && from === -1) break; // reached the reset (H=0) cell — alignment starts after it
      aOut.push(A[i - 1]); bOut.push(B[j - 1]);
      i -= 1; j -= 1;
      mat = from;
    } else if (mat === 1) {
      const from = tbX[idx(i, j)];
      aOut.push(A[i - 1]); bOut.push('-');
      i -= 1;
      mat = from === 0 ? 0 : 1;
    } else {
      const from = tbY[idx(i, j)];
      aOut.push('-'); bOut.push(B[j - 1]);
      j -= 1;
      mat = from === 0 ? 0 : 2;
    }
    if ((semi || local) && (i === 0 || j === 0)) break;
  }
  return { alignedA: aOut.reverse().join(''), alignedB: bOut.reverse().join(''), aStart: i, bStart: j };
}

function buildColumns(alignedA, alignedB, aStart, bStart) {
  const cols = [];
  let ai = aStart;
  let bi = bStart;
  for (let k = 0; k < alignedA.length; k++) {
    const ca = alignedA[k];
    const cb = alignedB[k];
    let status;
    if (ca === '-') status = 'gapA';
    else if (cb === '-') status = 'gapB';
    else status = basesCompatible(ca, cb) ? 'match' : 'mismatch';
    cols.push({ a: ca, b: cb, ai: ca === '-' ? null : ai, bi: cb === '-' ? null : bi, status });
    if (ca !== '-') ai += 1;
    if (cb !== '-') bi += 1;
  }
  return cols;
}

function runAlign(A, B, p) {
  // Anchored windowing for read-vs-reference (n ≫ m) in local / semiglobal:
  // seed the read's position, slice the reference to a narrow window, and run
  // the SAME exact DP there. Skipped for global (must span the full reference),
  // when a band is forced, or when anchoring opts it out. Falls through to the
  // full DP whenever anchoring is ambiguous (anchorWindow → null), so the
  // optimum never changes — the window only ever removes reference that a
  // local/semiglobal read alignment could not have used anyway.
  if (p.anchor !== false && p.band == null && (p.mode === 'local' || p.mode === 'semiglobal') && A.length > B.length) {
    const win = anchorWindow(A, B, p.anchorOpts);
    if (win) {
      const sub = A.slice(win.winStart, win.winEnd);
      const res = runAlignCore(sub, B, p);
      // Remap A-coordinates back to the FULL reference; downstream buildColumns
      // derives every ai from aStart, so this is the only shift needed.
      return { ...res, aStart: res.aStart + win.winStart, engine: `${res.engine || 'gotoh'}+anchored` };
    }
  }
  return runAlignCore(A, B, p);
}

function runAlignCore(A, B, p) {
  const n = A.length;
  const m = B.length;

  // Exact WFA fast path for GLOBAL alignment (literature-review §A2; Marco-Sola
  // et al. 2021). O(n·s) — far faster than O(n·m) when the pair is similar
  // (small cost s), which is our common case (plasmid vs near-identical
  // version). Used when forced (`wfa:true`) or when the pair would otherwise go
  // BANDED (approximate) — WFA stays EXACT there. A divergence cap ties WFA's
  // budget to the full-DP cell budget; if exceeded (divergent pair) we fall
  // through to banded Gotoh. `wfaAlignByScore` itself declines outside the
  // model-coincidence regime (2e < x), so this never changes the optimum.
  if (p.mode === 'global' && p.wfa !== false && p.band == null) {
    const large = n * m > p.maxFullCells;
    if (p.wfa === true || large) {
      const cap = p.wfa === true ? Infinity : Math.max(64, Math.floor(p.maxFullCells / Math.max(1, n + m)));
      const w = wfaAlignByScore(A, B, p, cap);
      if (w) {
        return {
          alignedA: w.alignedA, alignedB: w.alignedB, score: w.score,
          aStart: 0, bStart: 0, banded: false, engine: 'wfa',
        };
      }
    }
  }

  let core;
  let banded = false;
  if (p.band != null) {
    core = bandedGotoh(A, B, p, p.band);
    banded = true;
  } else if (n * m > p.maxFullCells) {
    core = bandedGotoh(A, B, p, autoBand(n, m));
    banded = true;
  } else {
    core = fullGotoh(A, B, p);
  }
  const tb = traceback(A, B, core.tbM, core.tbX, core.tbY, core.idx, core.endI, core.endJ, core.endMat, p.mode);
  return { ...tb, score: core.score, banded, engine: 'gotoh' };
}

/**
 * @param {string} rawA  reference / sequence A
 * @param {string} rawB  query / sequence B (the Sanger read, when applicable)
 * @param {object} [opts]
 *   mode: 'global'|'semiglobal'|'local' (default 'global')
 *   match, mismatch, gapOpen, gapExtend  (scores; gapOpen<0, gapExtend<0)
 *   tryRevComp: also align revcomp(B), keep the better-scoring orientation
 *   band: explicit half-band width (forces banded)
 *   maxFullCells: auto-switch to banded above this n*m (default 36e6)
 */
export function alignPairwise(rawA, rawB, opts = {}) {
  const A = clean(rawA);
  const B0 = clean(rawB);
  const p = {
    mode: 'global', match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1,
    tryRevComp: false, band: null, maxFullCells: 36e6, wfa: 'auto', anchor: true, ...opts,
  };

  if (!A.length || !B0.length) {
    return {
      alignedA: '', alignedB: '', score: 0, strand: 'forward',
      aStart: 0, bStart: 0, columns: [],
      matches: 0, mismatches: 0, gaps: 0, alignedLength: 0, coreLength: 0, identity: 0,
      coverageA: 0, coverageB: 0,
      mode: p.mode, banded: false, warnings: ['пустая последовательность на входе'],
    };
  }

  const candidates = [{ strand: 'forward', B: B0 }];
  if (p.tryRevComp) candidates.push({ strand: 'reverse', B: reverseComplement(B0) });

  let best = null;
  for (const cand of candidates) {
    const res = runAlign(A, cand.B, p);
    if (!best || res.score > best.res.score) best = { strand: cand.strand, res };
  }

  const { alignedA, alignedB, score, aStart, bStart, banded, engine } = best.res;
  const columns = buildColumns(alignedA, alignedB, aStart, bStart);
  const stats = computeAlignmentStats(columns);

  // Coverage = fraction of each input that ended up inside the alignment. This
  // is what tells apart a short local hit (low coverage) from full-length
  // homology (high coverage) — essential under local mode.
  let aBases = 0;
  let bBases = 0;
  for (let k = 0; k < columns.length; k++) {
    if (columns[k].a !== '-') aBases += 1;
    if (columns[k].b !== '-') bBases += 1;
  }
  const coverageA = A.length ? (aBases / A.length) * 100 : 0;
  const coverageB = B0.length ? (bBases / B0.length) * 100 : 0;

  const warnings = [];
  if (banded && p.band == null) warnings.push('длинные последовательности: banded-выравнивание (возможна субоптимальность при крупных инделах)');

  return {
    alignedA, alignedB, score, strand: best.strand, aStart, bStart, columns,
    ...stats, coverageA, coverageB, mode: p.mode, banded, engine: engine || 'gotoh', warnings,
  };
}
