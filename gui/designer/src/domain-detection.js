/** Auto-detection of protein domains within CDS sequences. */

import { translateDNA } from './codons';

const HYDRO = new Set('AVLIFWM'.split(''));
const SMALL = new Set('AGST'.split(''));
const LINKER_AA = new Set('STPG'.split(''));

export const DOMAIN_COLORS = {
  signal: '#CC79A7',
  propeptide: '#E69F00',
  domain: '#56B4E9',
  linker: '#999999',
  tag: '#F0E442',
  binding: '#009E73',
  transmembrane: '#D55E00',
  custom: '#0072B2',
};

const CHARGED = new Set('DEKR'.split(''));

/** Detect signal peptide via hydrophobicity scan. */
export function detectSignalPeptide(protein) {
  let best = 0, bestS = 0;
  for (let c = 15; c <= Math.min(35, protein.length - 10); c++) {
    const w = protein.slice(0, c);
    const hyd = w.split('').filter(a => HYDRO.has(a)).length / c;

    // Penalize charged residues in hydrophobic core (positions 3..c)
    const core = w.slice(3);
    const chargedFrac = core.split('').filter(a => CHARGED.has(a)).length / (core.length || 1);
    const chargePenalty = chargedFrac > 0.2 ? (chargedFrac - 0.2) * 0.8 : 0;

    // Von Heijne -3,-1 small residue rule
    const site = protein.slice(Math.max(0, c - 3), c);
    const sb = site.length >= 3 && SMALL.has(site[0]) && SMALL.has(site[2]) ? 0.15 : 0;

    // N-region positive charge (1-2 K/R is typical, cap bonus)
    const nr = protein.slice(0, 5);
    const nrKR = (nr.match(/[KR]/g) || []).length;
    const cb = Math.min(nrKR, 2) * 0.03;

    const s = hyd + sb + cb - chargePenalty;
    if (s > bestS) { bestS = s; best = c; }
  }
  return { found: bestS > 0.4, cleavageSite: best, confidence: bestS };
}

/** Detect His-tag (6+ consecutive histidines). */
export function detectHisTag(protein) {
  const m = protein.match(/H{6,}/);
  if (!m) return null;
  const pos = protein.indexOf(m[0]);
  return { startAA: pos + 1, endAA: pos + m[0].length, length: m[0].length };
}

/** Detect propeptide end (KR or KK dibasic cleavage site after signal). */
export function detectPropeptide(protein, signalEnd) {
  if (!signalEnd || signalEnd >= protein.length - 20) return null;
  const region = protein.slice(signalEnd, Math.min(signalEnd + 80, protein.length));
  const krIdx = region.search(/KR|KK|RR/);
  if (krIdx >= 5 && krIdx <= 60) return { endAA: signalEnd + krIdx + 2 };
  return null;
}

/** Detect linker regions (S/T/P/G rich, 10-50 aa). */
export function detectLinkers(protein) {
  const linkers = [];
  const winSize = 15;
  let inLinker = false, start = 0;
  for (let i = 0; i <= protein.length - winSize; i++) {
    const win = protein.slice(i, i + winSize);
    const linkerFrac = win.split('').filter(a => LINKER_AA.has(a)).length / winSize;
    if (linkerFrac > 0.6 && !inLinker) { inLinker = true; start = i; }
    if ((linkerFrac <= 0.6 || i === protein.length - winSize) && inLinker) {
      const end = i + winSize;
      if (end - start >= 10 && end - start <= 60) {
        linkers.push({ startAA: start + 1, endAA: end, length: end - start });
      }
      inLinker = false;
    }
  }
  return linkers;
}

/**
 * Run all detectors on a DNA sequence. Returns domain array.
 * @param {string} dna - DNA sequence
 * @param {string} geneName - fragment name for labeling
 * @returns {{ name, type, startAA, endAA, color, confidence? }[]}
 */
export function autoDetectDomains(dna, geneName = 'CDS') {
  const protein = translateDNA(dna);
  if (protein.length < 20) return [];

  const domains = [];
  const shortName = geneName.replace(/\s+/g, '_');

  // Signal peptide
  const sp = detectSignalPeptide(protein);
  if (sp.found) {
    domains.push({
      name: `${shortName}_ss`, type: 'signal',
      startAA: 1, endAA: sp.cleavageSite,
      color: DOMAIN_COLORS.signal, confidence: sp.confidence,
    });

    // Propeptide
    const pro = detectPropeptide(protein, sp.cleavageSite);
    if (pro) {
      domains.push({
        name: 'propeptide', type: 'propeptide',
        startAA: sp.cleavageSite + 1, endAA: pro.endAA,
        color: DOMAIN_COLORS.propeptide,
      });
    }
  }

  // His-tag
  const his = detectHisTag(protein);
  if (his) {
    domains.push({
      name: `His${his.length}-tag`, type: 'tag',
      startAA: his.startAA, endAA: his.endAA,
      color: DOMAIN_COLORS.tag,
    });
  }

  // Linkers
  const linkers = detectLinkers(protein);
  linkers.forEach((lnk, i) => {
    domains.push({
      name: `linker${linkers.length > 1 ? i + 1 : ''}`, type: 'linker',
      startAA: lnk.startAA, endAA: lnk.endAA,
      color: DOMAIN_COLORS.linker,
    });
  });

  // Fill remaining unlabeled regions as 'domain'
  domains.sort((a, b) => a.startAA - b.startAA);
  const filled = [];
  let pos = 1;
  for (const d of domains) {
    if (d.startAA > pos) {
      filled.push({
        name: filled.length === 0 && !sp.found ? shortName : `domain_${filled.length + 1}`,
        type: 'domain', startAA: pos, endAA: d.startAA - 1,
        color: DOMAIN_COLORS.domain,
      });
    }
    filled.push(d);
    pos = d.endAA + 1;
  }
  if (pos <= protein.length) {
    filled.push({
      name: filled.length === 0 ? shortName : `domain_${filled.length + 1}`,
      type: 'domain', startAA: pos, endAA: protein.length,
      color: DOMAIN_COLORS.domain,
    });
  }

  return filled;
}
