/**
 * SantaLucia 1998 Nearest-Neighbor Tm Calculator.
 *
 * Implements the unified thermodynamic parameters from:
 * SantaLucia J. (1998) PNAS 95(4):1460-1465.
 *
 * Accuracy: ±1-2°C vs experimental (was ±5°C with Wallace rule).
 * Conditions: default 50mM Na+, 250nM oligo, adjustable.
 */

// Nearest-neighbor parameters: ΔH (cal/mol) and ΔS (cal/mol·K)
// From SantaLucia 1998, Table 2
const NN_PARAMS = {
  'AA': { dH: -7900, dS: -22.2 },
  'AT': { dH: -7200, dS: -20.4 },
  'TA': { dH: -7200, dS: -21.3 },
  'CA': { dH: -8500, dS: -22.7 },
  'GT': { dH: -8400, dS: -22.4 },
  'CT': { dH: -7800, dS: -21.0 },
  'GA': { dH: -8200, dS: -22.2 },
  'CG': { dH: -10600, dS: -27.2 },
  'GC': { dH: -9800, dS: -24.4 },
  'GG': { dH: -8000, dS: -19.9 },
  'CC': { dH: -8000, dS: -19.9 },
  // Complements (reverse strand pairs)
  'TT': { dH: -7900, dS: -22.2 },  // = AA complement
  'AC': { dH: -8400, dS: -22.4 },  // = GT complement
  'TG': { dH: -8500, dS: -22.7 },  // = CA complement
  'TC': { dH: -8200, dS: -22.2 },  // = GA complement
  'AG': { dH: -7800, dS: -21.0 },  // = CT complement
};

// Initiation parameters
const INIT = {
  // Terminal AT base pair correction
  AT_TERM: { dH: 2300, dS: 4.1 },
  // Terminal GC base pair correction
  GC_TERM: { dH: 100, dS: -2.8 },
};

const R = 1.987; // gas constant cal/(mol·K)

/**
 * Calculate Tm using SantaLucia 1998 nearest-neighbor method.
 *
 * @param {string} seq — primer sequence (5'→3')
 * @param {Object} opts — conditions
 * @param {number} opts.naConc — Na+ concentration in mM (default 50)
 * @param {number} opts.mgConc — Mg2+ concentration in mM (default 1.5)
 * @param {number} opts.dntpConc — dNTP concentration in mM (default 0.2)
 * @param {number} opts.oligoConc — total strand concentration in nM (default 250)
 * @returns {number} Tm in °C
 */
export function calcTmNN(seq, opts = {}) {
  const {
    naConc = 50,     // mM
    mgConc = 1.5,    // mM
    dntpConc = 0.2,  // mM
    oligoConc = 250, // nM
  } = opts;

  const s = seq.toUpperCase().replace(/[^ATGC]/g, '');
  if (s.length < 2) return 0;

  // Sum NN parameters
  let totalDH = 0;
  let totalDS = 0;

  for (let i = 0; i < s.length - 1; i++) {
    const pair = s[i] + s[i + 1];
    const params = NN_PARAMS[pair];
    if (params) {
      totalDH += params.dH;
      totalDS += params.dS;
    } else {
      // Fallback for ambiguous bases
      totalDH += -8000;
      totalDS += -21.0;
    }
  }

  // Initiation corrections
  const first = s[0];
  const last = s[s.length - 1];
  if (first === 'A' || first === 'T') { totalDH += INIT.AT_TERM.dH; totalDS += INIT.AT_TERM.dS; }
  else { totalDH += INIT.GC_TERM.dH; totalDS += INIT.GC_TERM.dS; }
  if (last === 'A' || last === 'T') { totalDH += INIT.AT_TERM.dH; totalDS += INIT.AT_TERM.dS; }
  else { totalDH += INIT.GC_TERM.dH; totalDS += INIT.GC_TERM.dS; }

  // Oligonucleotide concentration correction
  // For self-complementary: Ct = total / 1; for non-self-comp: Ct = total / 4
  const Ct = (oligoConc * 1e-9) / 4; // non-self-complementary assumed

  // Salt correction — applied to entropy BEFORE Tm calculation
  // SantaLucia 1998: ΔS_salt = 0.368 * (N-1) * ln([Na+])
  const mono = naConc * 1e-3; // convert to M
  const mg = mgConc * 1e-3;
  const dntp = dntpConc * 1e-3;
  const freeNg = Math.max(0, mg - dntp); // free Mg2+ after dNTP chelation

  // Na+ dominant: entropy correction
  const saltDS = 0.368 * (s.length - 1) * Math.log(mono);
  let Tm = totalDH / (totalDS + saltDS + R * Math.log(Ct)) - 273.15;

  // Mg2+ dominant: Owczarzy 2008 override (recalculates from 1/Tm form)
  if (freeNg > 0 && mono < 0.22 * Math.sqrt(freeNg)) {
    const fGC = gcFraction(s);
    const lnMg = Math.log(freeNg);
    const a = 3.92e-5;
    const b = -9.11e-6;
    const c = 6.26e-5;
    const d = 1.42e-5;
    const e2 = -4.82e-4;
    const f2 = 5.25e-4;
    const g = 8.31e-5;
    // Owczarzy uses 1M NaCl Tm as baseline — recalculate without salt correction
    const Tm1M = totalDH / (totalDS + 0.368 * (s.length - 1) * Math.log(1.0) + R * Math.log(Ct)) - 273.15;
    const invTm = (1 / (Tm1M + 273.15))
      + a + b * lnMg + fGC * (c + d * lnMg)
      + (1 / (2 * (s.length - 1))) * (e2 + f2 * lnMg + g * lnMg * lnMg);
    Tm = 1 / invTm - 273.15;
  }

  return Math.round(Tm * 10) / 10;
}

/**
 * Simple GC fraction.
 */
function gcFraction(seq) {
  const gc = (seq.match(/[GC]/g) || []).length;
  return gc / seq.length;
}

/**
 * Calculate GC% for a sequence.
 */
export function gcPercent(seq) {
  const clean = seq.toUpperCase().replace(/[^ATGC]/g, '');
  if (!clean.length) return 0;
  return Math.round(gcFraction(clean) * 100);
}

/**
 * Quick Tm for display (uses NN model with default conditions).
 * Drop-in replacement for all simpleTm/calcTm calls.
 */
export function calcTm(seq) {
  return calcTmNN(seq);
}

/**
 * Tm with Phusion/Q5 polymerase adjustment.
 * These polymerases use proprietary buffers that shift Tm.
 */
export function calcTmForPolymerase(seq, polymerase = 'phusion') {
  const base = calcTmNN(seq);
  const adj = { phusion: 3, q5: 3, kod: 2, taq: -5 }[polymerase] || 0;
  return Math.round((base + adj) * 10) / 10;
}

/**
 * Check for hairpin formation (simplified — checks for 4+ bp internal complement).
 */
export function checkHairpin(seq) {
  const s = seq.toUpperCase();
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const rc = s.split('').reverse().map(c => comp[c] || 'N').join('');
  // Check if any 4-mer of the sequence matches its reverse complement
  for (let i = 0; i < s.length - 7; i++) {
    const sub = s.slice(i, i + 4);
    if (rc.includes(sub)) return true;
  }
  return false;
}

/**
 * Check for homodimer formation (simplified — checks 3' complementarity).
 */
export function checkHomodimer(seq) {
  const s = seq.toUpperCase();
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const last6 = s.slice(-6);
  const last6rc = last6.split('').reverse().map(c => comp[c] || 'N').join('');
  return s.includes(last6rc);
}
