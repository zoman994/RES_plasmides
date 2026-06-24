/**
 * cnn-scorer.js — minisplice vi2-7k 1D-CNN splice-site scorer (Phase 2).
 *
 * A clean-room JS port of the minisplice forward pass behind the SAME interface
 * as the PWM baseline (`scoreSpliceSites` in splice-sites.js), so the gene-model
 * decoder can swap scorers without changing. Weights are CC0 (cnn-weights.js,
 * Zenodo 15931054); only the architecture — a generic 1D-CNN — is reproduced.
 *
 * Architecture (all f32 weights, computed here in f64):
 *   one-hot[4×202] → conv1d(16, k5, valid, kernel-flipped) → ReLU
 *   → maxpool(k3,s3) → conv1d(16, k5, valid, flipped) → ReLU → maxpool(k3,s3)
 *   → flatten(channel-major, 336) → dense(16)+ReLU → dense(2) → sigmoid; P = out[1].
 * Calibration: P → bin floor(P/step) → cnn-weights cali.score[bin] = 2·log2 odds.
 *
 * Window: the canonical dinucleotide (GT donor / AG acceptor) sits at offset
 * [ext, ext+1] = [100,101]; the model sees 100 bp of flanking context each side.
 * Sites without full context (within `ext` of the sequence ends) are OMITTED,
 * exactly as the upstream tool skips out-of-range sites.
 *
 * Convention (identical to the PWM scorer): donor.pos = index of the G in GT
 * (intron start); acceptor.pos = index of the G in AG (intron end).
 */
import { CNN_MODEL } from './cnn-weights.js';

export const CNN_LEN = CNN_MODEL.meta.len;   // 202
export const CNN_EXT = CNN_MODEL.meta.ext;   // 100
const BASES = 'ACGT';

// ----------------------------------------------------------- weight decoding
function b64ToFloat32(b64) {
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // copy into an aligned buffer (charCodeAt path) before viewing as f32
  return new Float32Array(bytes.buffer.slice(0));
}

let W = null;
function weights() {
  if (W) return W;
  const m = CNN_MODEL;
  W = {
    c1: { w: b64ToFloat32(m.conv1.w), Cout: 16, Cin: 4, k: 5 },
    c2: { w: b64ToFloat32(m.conv2.w), Cout: 16, Cin: 16, k: 5 },
    dense: { w: b64ToFloat32(m.dense.w), b: b64ToFloat32(m.dense.b), out: 16, in: 336 },
    cost: { w: b64ToFloat32(m.cost.w), b: b64ToFloat32(m.cost.b), out: 2, in: 16 },
    cali: { step: m.cali.step, score: m.cali.score },
  };
  return W;
}

// ----------------------------------------------------------------- the layers
/** 1D convolution, valid padding, kernel rotated 180° (true convolution). */
function conv1dFlip(x, Cin, Win, w, Cout, k) {
  const ow = Win - k + 1;
  const y = new Float64Array(Cout * ow);
  for (let c1 = 0; c1 < Cout; c1++) {
    const yo = c1 * ow;
    for (let c0 = 0; c0 < Cin; c0++) {
      const wbase = (c1 * Cin + c0) * k;
      const xbase = c0 * Win;
      for (let l = 0; l < k; l++) {
        const wv = w[wbase + (k - 1 - l)]; // rotated kernel index
        if (wv === 0) continue;
        for (let j = 0; j < ow; j++) y[yo + j] += wv * x[xbase + l + j];
      }
    }
  }
  return { y, C: Cout, W: ow };
}

function reluInPlace(a) {
  for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0;
  return a;
}

/** 1D max pooling, pad-left 0; right edge is read only where it exists (no zero-pad). */
function max1d(x, C, Win, k = 3, s = 3) {
  const ow = Math.floor((Win - k + (s - 1)) / s) + 1;
  const y = new Float64Array(C * ow);
  for (let c = 0; c < C; c++) {
    const xo = c * Win;
    for (let j = 0; j < ow; j++) {
      let m = -Infinity;
      for (let l = 0; l < k; l++) {
        const v = j * s + l;
        if (v < Win && x[xo + v] > m) m = x[xo + v];
      }
      y[c * ow + j] = m;
    }
  }
  return { y, C, W: ow };
}

function denseRelu(x, w, b, nOut, nIn) {
  const y = new Float64Array(nOut);
  for (let j = 0; j < nOut; j++) {
    let s = b[j];
    const wo = j * nIn;
    for (let k = 0; k < nIn; k++) s += w[wo + k] * x[k];
    y[j] = s > 0 ? s : 0;
  }
  return y;
}

function dense(x, w, b, nOut, nIn) {
  const y = new Float64Array(nOut);
  for (let j = 0; j < nOut; j++) {
    let s = b[j];
    const wo = j * nIn;
    for (let k = 0; k < nIn; k++) s += w[wo + k] * x[k];
    y[j] = s;
  }
  return y;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// ------------------------------------------------------------- one-hot + pass
/** window: Int8Array(202) of base codes 0..3 (A0 C1 G2 T3). */
function oneHot(window) {
  const x = new Float64Array(4 * CNN_LEN);
  for (let i = 0; i < CNN_LEN; i++) {
    const c = window[i];
    if (c >= 0 && c < 4) x[c * CNN_LEN + i] = 1;
  }
  return x;
}

function forward(window, debug) {
  const w = weights();
  const x = oneHot(window);
  const a = reluInPlace(conv1dFlip(x, 4, CNN_LEN, w.c1.w, w.c1.Cout, w.c1.k).y);
  const aW = CNN_LEN - w.c1.k + 1;
  const p1 = max1d(a, w.c1.Cout, aW);
  const c = reluInPlace(conv1dFlip(p1.y, p1.C, p1.W, w.c2.w, w.c2.Cout, w.c2.k).y);
  const cW = p1.W - w.c2.k + 1;
  const p2 = max1d(c, w.c2.Cout, cW);
  const flat = p2.y; // channel-major c*W+i == dense input layout (336)
  const h = denseRelu(flat, w.dense.w, w.dense.b, w.dense.out, w.dense.in);
  const z = dense(h, w.cost.w, w.cost.b, w.cost.out, w.cost.in);
  const P = sigmoid(z[1]);
  if (!debug) return P;
  const sum = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s; };
  return {
    conv1_sum: sum(a), pool1_sum: sum(p1.y), conv2_sum: sum(c), pool2_sum: sum(p2.y),
    dense_sum: sum(h), logit0: z[0], logit1: z[1], P,
  };
}

// ------------------------------------------------------------------ exports
/** P(real splice site) for a 202-base window (Int8Array of 0..3). */
export function cnnSiteProb(window) { return forward(window, false); }

/** Per-layer fingerprints + P, for validation against the numpy reference. */
export function cnnForwardDebug(window) { return forward(window, true); }

/** Calibrated odds-ratio score (2·log2) for a probability, via the cali table. */
export function cnnSiteScore(P) {
  const { step, score } = weights().cali;
  let bi = Math.floor(P / step);
  if (bi < 0) bi = 0;
  if (bi >= score.length) bi = score.length - 1;
  return score[bi];
}

/**
 * Score every canonical GT/AG with full 202 bp context — drop-in for the PWM
 * scoreSpliceSites. Returns {donors, acceptors} with {pos, score, prob}.
 */
export function scoreSpliceSitesCNN(seq) {
  const s = String(seq || '').toUpperCase();
  const n = s.length;
  const donors = [];
  const acceptors = [];
  // reusable window buffer
  const win = new Int8Array(CNN_LEN);
  const fill = (start) => {
    for (let t = 0; t < CNN_LEN; t++) {
      const c = BASES.indexOf(s[start + t]);
      if (c < 0) return false; // ambiguous / off-end → skip site
      win[t] = c;
    }
    return true;
  };
  for (let i = 0; i + 1 < n; i++) {
    const isGT = s[i] === 'G' && s[i + 1] === 'T';
    const isAG = s[i] === 'A' && s[i + 1] === 'G';
    if (!isGT && !isAG) continue;
    const start = i - CNN_EXT; // dinucleotide lands at window[ext, ext+1]
    if (start < 0 || start + CNN_LEN > n) continue; // no full context
    if (!fill(start)) continue;
    const prob = cnnSiteProb(win);
    const score = cnnSiteScore(prob);
    if (isGT) donors.push({ pos: i, score, prob });
    else acceptors.push({ pos: i + 1, score, prob }); // acceptor reported at G of AG
  }
  return { donors, acceptors };
}
