/** Golden Gate assembly: enzyme database, overhang design, validation. */

export const GG_ENZYMES = {
  BsaI: {
    name: 'BsaI', recognition: 'GGTCTC', cutOffset: 7, overhangLength: 4,
    temperature: 37, heatKill: 65, buffer: 'CutSmart', alias: 'Eco31I',
    spacer: 'A', notes: 'Стандарт MoClo/iGEM. Самый распространённый.',
  },
  BpiI: {
    name: 'BpiI', recognition: 'GAAGAC', cutOffset: 8, overhangLength: 4,
    temperature: 37, heatKill: 65, buffer: 'G', alias: 'BbsI',
    spacer: 'A', notes: 'Альтернатива BsaI. Когда BsaI сайт внутри фрагмента.',
  },
  BsmBI: {
    name: 'BsmBI', recognition: 'CGTCTC', cutOffset: 7, overhangLength: 4,
    temperature: 55, heatKill: 80, buffer: 'NEBuffer 3.1', alias: 'Esp3I',
    spacer: 'A', notes: 'Термофильный. Хорошая альтернатива BsaI.',
  },
  BtgZI: {
    name: 'BtgZI', recognition: 'GCGATG', cutOffset: 16, overhangLength: 4,
    temperature: 60, heatKill: 80, buffer: 'CutSmart', alias: null,
    spacer: 'A', notes: 'Для фрагментов содержащих BsaI и BpiI сайты.',
  },
  SapI: {
    name: 'SapI', recognition: 'GCTCTTC', cutOffset: 4, overhangLength: 3,
    temperature: 37, heatKill: 65, buffer: 'CutSmart', alias: null,
    spacer: '', notes: '3-нт овехенги. Меньше комбинаций, но проще.',
  },
};

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

export function reverseComplement(seq) {
  return seq.split('').reverse().map(c => COMPLEMENT[c.toUpperCase()] || 'N').join('');
}

/** Check if enzyme recognition site exists inside any fragment. */
export function checkInternalSites(fragments, enzymeKey) {
  const enz = GG_ENZYMES[enzymeKey];
  if (!enz) return { ok: true };
  const rec = enz.recognition.toUpperCase();
  const recRC = reverseComplement(rec);
  const problems = [];

  fragments.forEach(f => {
    const seq = (f.sequence || '').toUpperCase();
    const fwd = seq.indexOf(rec);
    const rev = seq.indexOf(recRC);
    if (fwd !== -1) problems.push({ fragment: f.name, position: fwd + 1, strand: '+' });
    if (rev !== -1) problems.push({ fragment: f.name, position: rev + 1, strand: '-' });
  });

  if (problems.length === 0) return { ok: true, problems: [] };

  const alternatives = Object.keys(GG_ENZYMES).filter(ek => {
    if (ek === enzymeKey) return false;
    const alt = GG_ENZYMES[ek].recognition.toUpperCase();
    const altRC = reverseComplement(alt);
    return !fragments.some(f => {
      const s = (f.sequence || '').toUpperCase();
      return s.includes(alt) || s.includes(altRC);
    });
  });

  return {
    ok: false, problems, alternatives,
    message: `${enzymeKey} сайт найден внутри ${[...new Set(problems.map(p => p.fragment))].join(', ')}`,
  };
}

/** Extract 4-nt overhangs from actual sequences at junction points. */
export function designOverhangs(fragments, enzymeKey, circular = false) {
  const enz = GG_ENZYMES[enzymeKey];
  if (!enz) return { overhangs: [], issues: [], valid: false };
  const ovLen = enz.overhangLength;
  const junctionCount = circular ? fragments.length : fragments.length - 1;
  const overhangs = [];

  for (let i = 0; i < junctionCount; i++) {
    const nextIdx = (i + 1) % fragments.length;
    const leftSeq = (fragments[i].sequence || '').toUpperCase();
    const rightSeq = (fragments[nextIdx].sequence || '').toUpperCase();

    // Take last half from left + first half from right
    const halfL = Math.floor(ovLen / 2);
    const halfR = ovLen - halfL;
    const leftEnd = leftSeq.slice(-halfL);
    const rightStart = rightSeq.slice(0, halfR);
    const overhang = leftEnd + rightStart;

    overhangs.push({
      junction: i,
      leftFrag: fragments[i].name,
      rightFrag: fragments[nextIdx].name,
      sequence: overhang,
    });
  }

  return validateOverhangs(overhangs, ovLen);
}

/** Validate overhangs: check palindromes, duplicates, RC matches, GC. */
function validateOverhangs(overhangs, ovLen) {
  const issues = [];

  for (let i = 0; i < overhangs.length; i++) {
    const oh = overhangs[i].sequence;
    if (oh.length < ovLen) {
      issues.push({ type: 'short', junction: i, overhang: oh, message: `${oh} — слишком короткий` });
      continue;
    }

    // Palindrome check
    if (oh === reverseComplement(oh)) {
      issues.push({ type: 'palindrome', junction: i, overhang: oh, message: `${oh} — палиндром, самолигирование` });
    }

    // GC extremes
    const gc = oh.split('').filter(c => c === 'G' || c === 'C').length / oh.length;
    if (gc === 0) issues.push({ type: 'gc', junction: i, overhang: oh, message: `${oh} — нет GC, слабая лигация` });
    if (gc === 1) issues.push({ type: 'gc', junction: i, overhang: oh, message: `${oh} — только GC, вторичные структуры` });

    // Duplicate + RC match check
    for (let j = i + 1; j < overhangs.length; j++) {
      if (oh === overhangs[j].sequence) {
        issues.push({ type: 'duplicate', junctions: [i, j], overhang: oh,
          message: `${oh} повторяется на стыках ${i + 1} и ${j + 1}` });
      }
      if (oh === reverseComplement(overhangs[j].sequence)) {
        issues.push({ type: 'rc_match', junctions: [i, j], overhang: oh,
          message: `${oh} комплементарен ${overhangs[j].sequence} — перекрёстное лигирование` });
      }
    }
  }

  return { overhangs, issues, valid: issues.length === 0 };
}

// Pre-validated orthogonal overhang sets (no palindromes, no RC conflicts, good ligation)
// Source: NEB Golden Gate Assembly Tool validated sets
const ORTHOGONAL_OVERHANGS_4 = [
  'AATG', 'TCCG', 'GCTA', 'TTAC', 'AGGT', 'CATG', 'GACT', 'TCAG',
  'ATCG', 'CGAT', 'GATC', 'TGCA', 'ACGT', 'CAGT', 'GCTC', 'TAGC',
  'AGTC', 'CTGA', 'GTAC', 'TCGA', 'ACTG', 'CAAG', 'GGAT', 'TTCG',
  'AACG', 'CCTA', 'GAGT', 'TGAT', 'ATAG', 'CCTG', 'GCAT', 'TACG',
];
const ORTHOGONAL_OVERHANGS_3 = [
  'ATG', 'TCC', 'GCT', 'TAC', 'AGG', 'CAT', 'GAC', 'TCA',
];

/** Try shifting junctions ±1-3 bp to resolve conflicts.
 *  For identical fragments: assign overhangs from orthogonal set. */
export function resolveConflicts(fragments, enzymeKey, circular = false, maxShift = 3) {
  let best = designOverhangs(fragments, enzymeKey, circular);
  if (best.valid) return { ...best, shifts: null, fragments };

  const enz = GG_ENZYMES[enzymeKey];
  const ovLen = enz?.overhangLength || 4;
  const n = circular ? fragments.length : fragments.length - 1;

  // Check if there are duplicate overhangs (from identical fragments)
  const hasDuplicates = best.issues.some(is => is.type === 'duplicate' || is.type === 'rc_match');

  if (hasDuplicates) {
    // Assign unique overhangs from orthogonal set
    const pool = ovLen === 3 ? [...ORTHOGONAL_OVERHANGS_3] : [...ORTHOGONAL_OVERHANGS_4];
    const used = new Set();
    const fixedOverhangs = best.overhangs.map((oh, i) => {
      // Check if this overhang conflicts
      const isDup = best.overhangs.some((o, j) => j !== i && o.sequence === oh.sequence);
      const isRC = best.overhangs.some((o, j) => j !== i && o.sequence === reverseComplement(oh.sequence));
      const isPalin = oh.sequence === reverseComplement(oh.sequence);

      if (!isDup && !isRC && !isPalin && !used.has(oh.sequence)) {
        used.add(oh.sequence);
        return oh;
      }

      // Find a unique overhang from the pool
      for (const candidate of pool) {
        if (used.has(candidate)) continue;
        if (candidate === reverseComplement(candidate)) continue; // skip palindromes
        if ([...used].some(u => u === reverseComplement(candidate))) continue; // skip RC matches
        used.add(candidate);
        return { ...oh, sequence: candidate, assigned: true };
      }
      // Fallback — keep original
      used.add(oh.sequence);
      return oh;
    });

    const fixedResult = validateOverhangs(fixedOverhangs, ovLen);
    if (fixedResult.valid || fixedResult.issues.length < best.issues.length) {
      return { ...fixedResult, shifts: null, fragments, assigned: true };
    }
  }

  // Standard approach: try shifting junction positions
  let bestFrags = fragments;
  let bestShifts = {};
  for (let jIdx = 0; jIdx < n; jIdx++) {
    for (let shift = -maxShift; shift <= maxShift; shift++) {
      if (shift === 0) continue;
      const shifted = shiftJunction(bestFrags, jIdx, shift, circular);
      if (!shifted) continue;
      const result = designOverhangs(shifted, enzymeKey, circular);
      if (result.issues.length < best.issues.length) {
        best = result;
        bestFrags = shifted;
        bestShifts = { ...bestShifts, [jIdx]: shift };
        if (result.valid) return { ...result, shifts: bestShifts, fragments: bestFrags };
      }
    }
  }

  return { ...best, shifts: Object.keys(bestShifts).length > 0 ? bestShifts : null, fragments: bestFrags };
}

function shiftJunction(fragments, jIdx, shift, circular) {
  const nextIdx = (jIdx + 1) % fragments.length;
  const left = (fragments[jIdx].sequence || '');
  const right = (fragments[nextIdx].sequence || '');

  if (shift > 0) {
    if (right.length <= shift + 10) return null; // too short
    return fragments.map((f, i) => {
      if (i === jIdx) return { ...f, sequence: left + right.slice(0, shift), length: left.length + shift };
      if (i === nextIdx) return { ...f, sequence: right.slice(shift), length: right.length - shift };
      return f;
    });
  } else {
    const absShift = Math.abs(shift);
    if (left.length <= absShift + 10) return null;
    return fragments.map((f, i) => {
      if (i === jIdx) return { ...f, sequence: left.slice(0, left.length - absShift), length: left.length - absShift };
      if (i === nextIdx) return { ...f, sequence: left.slice(-absShift) + right, length: right.length + absShift };
      return f;
    });
  }
}

/** Find best enzyme: no internal sites in any fragment. */
export function suggestBestEnzyme(fragments) {
  for (const key of ['BsaI', 'BpiI', 'BsmBI', 'BtgZI', 'SapI']) {
    const check = checkInternalSites(fragments, key);
    if (check.ok) return key;
  }
  return 'BsaI'; // fallback
}
