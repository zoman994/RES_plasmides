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
 * @param {number} opts.mgConc — Mg2+ concentration in mM (default 0 — monovalent-
 *   only by default; pass a real PCR value, e.g. 1.5–2, to apply the Owczarzy
 *   divalent correction. Default kept at 0 so existing primer calibration is
 *   unchanged; making PCR-Mg the default is a separate calibration decision.)
 * @param {number} opts.dntpConc — dNTP concentration in mM (default 0.2)
 * @param {number} opts.oligoConc — total strand concentration in nM (default 250)
 * @returns {number} Tm in °C
 */
export function calcTmNN(seq, opts = {}) {
  const {
    naConc = 50,     // mM
    mgConc = 0,      // mM — monovalent-only default (see JSDoc); pass real Mg to apply Owczarzy
    dntpConc = 0.2,  // mM
    oligoConc = 250, // nM
  } = opts;

  // Keep IUPAC degenerate codes — silently stripping them shortens a degenerate
  // primer and mis-estimates Tm; the NN loop already has a fallback for unknown
  // pairs. Only drop genuinely non-nucleotide characters.
  const s = seq.toUpperCase().replace(/[^ACGTURYSWKMBDHVN]/g, '');
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

  // ── Salt correction: SantaLucia monovalent + Owczarzy 2008 divalent ──
  const monoM = naConc * 1e-3;       // M
  const mgM = mgConc * 1e-3;         // M
  const dntpM = dntpConc * 1e-3;     // M
  const freeMg = Math.max(0, mgM - dntpM); // free Mg2+ after dNTP chelation

  // Baseline Tm at 1 M monovalent (salt entropy term vanishes, ln(1)=0).
  const Tm1M = totalDH / (totalDS + R * Math.log(Ct)) - 273.15;

  // Owczarzy ratio R = sqrt([Mg2+]) / [Mon+] picks the dominant cation. The old
  // code fired the Mg branch only when R was huge (≈ ≥52 mM Mg), so for normal
  // PCR (1.5–4 mM Mg, R≈0.7) the documented Mg correction was DEAD — every Tm
  // was computed monovalent-only.
  const ratio = freeMg > 0 && monoM > 0
    ? Math.sqrt(freeMg) / monoM
    : (freeMg > 0 ? Infinity : 0);

  let Tm;
  if (freeMg > 0 && ratio >= 0.22) {
    // Divalent contributes: competing (0.22 ≤ R ≤ 6) or divalent-dominant (R > 6).
    const fGC = gcFraction(s);
    const lnMg = Math.log(freeMg);
    let a = 3.92e-5; let d = 1.42e-5; let g = 8.31e-5;
    if (ratio <= 6.0 && monoM > 0) {
      // Competing regime — monovalent modifies a, d, g (Owczarzy 2008).
      const lnMon = Math.log(monoM);
      a *= 0.843 - 0.352 * Math.sqrt(monoM) * lnMon;
      d *= 1.279 - 4.03e-3 * lnMon - 8.03e-3 * lnMon * lnMon;
      g *= 0.486 - 0.258 * lnMon + 5.25e-3 * lnMon * lnMon * lnMon;
    }
    const b = -9.11e-6; const c = 6.26e-5; const e2 = -4.82e-4; const f2 = 5.25e-4;
    const invTm = (1 / (Tm1M + 273.15))
      + a + b * lnMg + fGC * (c + d * lnMg)
      + (1 / (2 * (s.length - 1))) * (e2 + f2 * lnMg + g * lnMg * lnMg);
    Tm = 1 / invTm - 273.15;
  } else if (monoM > 0) {
    // Monovalent-only entropy correction (SantaLucia 1998).
    const saltDS = 0.368 * (s.length - 1) * Math.log(monoM);
    Tm = totalDH / (totalDS + saltDS + R * Math.log(Ct)) - 273.15;
  } else {
    // No salt info at all (naConc=0, no Mg) — fall back to the 1 M baseline
    // instead of dividing by −Infinity → −273 °C.
    Tm = Tm1M;
  }

  if (!Number.isFinite(Tm)) return 0;
  // RC-CLOSE-GATE (Игорь 25.06) — the NN two-state model breaks down below ~6 nt:
  // the four terminal-initiation corrections can outweigh the few stacking pairs
  // and flip the entropy sign, yielding a large NEGATIVE, unphysical Tm (≈ −100 °C).
  // A DNA duplex never melts below 0 °C meaningfully, so on a very short oligo a
  // sub-physical result means «no real duplex» → 0 («no Tm»), never a garbage
  // negative. Guards ONLY the short-and-negative case → never touches real primers.
  if (s.length < 6 && Tm < 0) return 0;
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
 * Calculate ΔG (kcal/mol) of a short duplex at given temperature using NN params.
 * Used for hairpin stem stability filtering.
 */
function stemDeltaG(stemSeq, tempC = 60) {
  const s = stemSeq.toUpperCase();
  if (s.length < 2) return 0;
  const T = tempC + 273.15;
  let dH = 0, dS = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const pair = s[i] + s[i + 1];
    const p = NN_PARAMS[pair];
    if (p) { dH += p.dH; dS += p.dS; }
  }
  // ΔG = ΔH - T·ΔS (cal/mol → kcal/mol)
  return (dH - T * dS) / 1000;
}

/**
 * Check for hairpin formation with thermodynamic filtering.
 * Reports true only if stem ΔG < -2 kcal/mol at 60°C (stable hairpin).
 */
export function checkHairpin(seq) {
  const s = seq.toUpperCase();
  if (s.length < 11) return false; // need MIN_STEM*2 + MIN_LOOP
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const MIN_STEM = 4;
  const MIN_LOOP = 3;
  const MAX_LOOP = 8;
  const DG_THRESHOLD = -2; // kcal/mol at 60°C

  for (let stemLen = MIN_STEM; stemLen <= Math.floor((s.length - MIN_LOOP) / 2); stemLen++) {
    for (let i = 0; i <= s.length - 2 * stemLen - MIN_LOOP; i++) {
      const stem5 = s.slice(i, i + stemLen);
      for (let loopLen = MIN_LOOP; loopLen <= MAX_LOOP; loopLen++) {
        const j = i + stemLen + loopLen;
        if (j + stemLen > s.length) break;
        const stem3 = s.slice(j, j + stemLen);
        let match = true;
        for (let k = 0; k < stemLen; k++) {
          if (comp[stem5[k]] !== stem3[stemLen - 1 - k]) { match = false; break; }
        }
        if (match && stemDeltaG(stem5) < DG_THRESHOLD) return true;
      }
    }
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
