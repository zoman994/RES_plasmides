/**
 * local-primer-design.js — Client-side primer design for overlap/GG/KLD/RE assemblies.
 * No API needed. Called reactively when fragments/junctions change.
 */
import { calcTmNN } from './tm-calculator';
import { GG_ENZYMES } from './golden-gate';

function rc(seq) {
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  return seq.split('').reverse().map(c => comp[c.toUpperCase()] || 'N').join('');
}

/**
 * Find minimal binding region from one end with Tm >= target.
 */
function findBinding(seq, direction, tmTarget = 60) {
  const s = seq.toUpperCase();
  const minLen = 15, maxLen = 30;

  if (s.length < minLen) {
    return {
      sequence: s,
      tm: s.length >= 4 ? Math.round(calcTmNN(s) * 10) / 10 : 0,
      length: s.length,
      warning: `Последовательность слишком короткая (${s.length} bp < ${minLen} bp)`,
    };
  }

  for (let len = minLen; len <= Math.min(maxLen, s.length); len++) {
    const region = direction === 'forward' ? s.slice(0, len) : s.slice(-len);
    const tm = calcTmNN(region);
    if (tm >= tmTarget) {
      return { sequence: region, tm: Math.round(tm * 10) / 10, length: len };
    }
  }
  const fallback = direction === 'forward' ? s.slice(0, Math.min(maxLen, s.length)) : s.slice(-Math.min(maxLen, s.length));
  return { sequence: fallback, tm: Math.round(calcTmNN(fallback) * 10) / 10, length: fallback.length };
}

/**
 * Calculate overlap tail sequence for a junction.
 */
function overlapTail(junction, leftSeq, rightSeq, side) {
  const j = junction || {};
  const jType = j.type || 'overlap';

  if (jType === 'kld' || jType === 're_ligation' || jType === 'sticky_end') {
    return '';
  }

  if (jType === 'golden_gate') {
    const enz = GG_ENZYMES[j.enzyme || 'BsaI'];
    if (!enz) return '';
    const oh = (j.overhang || '').toUpperCase();
    if (side === 'right') {
      return enz.recognition + (enz.spacer || 'A') + oh;
    } else {
      return rc(enz.recognition) + (enz.spacer || 'A') + rc(oh);
    }
  }

  // Overlap junction
  const overlapLen = j.overlapLength || 30;
  const mode = j.overlapMode || 'split';

  if (mode === 'split') {
    const half = Math.ceil(overlapLen / 2);
    if (side === 'left') {
      return rightSeq.slice(0, half).toUpperCase();
    } else {
      return rc(leftSeq.slice(-half)).toUpperCase();
    }
  } else if (mode === 'left_only') {
    if (side === 'left') return rightSeq.slice(0, overlapLen).toUpperCase();
    return '';
  } else {
    if (side === 'right') return rc(leftSeq.slice(-overlapLen)).toUpperCase();
    return '';
  }
}

/**
 * Design all primers for an assembly — fully client-side.
 */
export function designPrimersLocal(fragments, junctions, circular, opts = {}) {
  const { tmTarget = 60, primerPrefix = 'P', polymerase = 'phusion' } = opts;
  const primers = [];
  const warnings = [];

  if (fragments.length < 2) return { primers, warnings };

  // ═══ Expand merged fragments into sub-fragments ═══
  const expanded = [];
  const expandedJunctions = [];

  for (let fi = 0; fi < fragments.length; fi++) {
    const frag = fragments[fi];
    if (frag.subFragments?.length > 0 && frag.sequence) {
      // Expand merged into sub-fragments
      let offset = 0;
      for (let si = 0; si < frag.subFragments.length; si++) {
        const sub = frag.subFragments[si];
        expanded.push({
          name: sub.name, type: sub.type,
          sequence: frag.sequence.slice(offset, offset + sub.length),
          length: sub.length, needsAmplification: true,
          _isFirst: si === 0,
          _isLast: si === frag.subFragments.length - 1,
          _mergedName: frag.name,
          _mergedIndex: fi,
        });
        // Internal junction between sub-fragments
        if (si < frag.subFragments.length - 1) {
          expandedJunctions.push({
            type: frag.assemblyMethod === 'golden_gate' ? 'golden_gate' : 'overlap',
            overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
          });
        }
        offset += sub.length;
      }
    } else {
      expanded.push({ ...frag, _isFirst: null, _isLast: null, _mergedName: null, _mergedIndex: null });
    }
    // Add the junction AFTER this fragment (if exists)
    if (fi < junctions.length) {
      expandedJunctions.push(junctions[fi]);
    }
  }

  const n = expanded.length;
  const juncs = expandedJunctions;
  const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
  let pidx = 1;

  for (let i = 0; i < n; i++) {
    const frag = expanded[i];
    if (!frag.sequence) continue;
    // Don't skip needsAmplification=false — design primers for ALL fragments.
    // The flag affects protocol only, not primer design.

    const seq = frag.sequence.toUpperCase();

    const prevFrag = i > 0 ? expanded[i - 1] : (circular ? expanded[n - 1] : null);
    const leftJIdx = i > 0 ? i - 1 : (circular ? n - 1 : -1);
    const leftJ = leftJIdx >= 0 && leftJIdx < juncs.length ? juncs[leftJIdx] : null;

    const nextFrag = i < n - 1 ? expanded[i + 1] : (circular ? expanded[0] : null);
    const rightJIdx = i < n - 1 ? i : (circular ? i : -1);
    const rightJ = rightJIdx >= 0 && rightJIdx < juncs.length ? juncs[rightJIdx] : null;

    // isInternal: primer is inside a merged block (not the outer edge)
    const fwdIsInternal = frag._mergedName !== null && !frag._isFirst;
    const revIsInternal = frag._mergedName !== null && !frag._isLast;

    // Forward primer
    const fwdBinding = findBinding(seq, 'forward', tmTarget);
    if (fwdBinding.warning) warnings.push(`⚠ ${frag.name} fwd: ${fwdBinding.warning}`);
    let fwdTail = '';
    if (leftJ && prevFrag?.sequence) {
      // If left neighbor is No-PCR (not from merged expansion) → carry FULL overlap
      const leftIsNoPCR = prevFrag.needsAmplification === false && prevFrag._mergedName === null;
      const effectiveLeftJ = (leftIsNoPCR && (leftJ.overlapMode || 'split') === 'split')
        ? { ...leftJ, overlapMode: 'right_only' }
        : leftJ;
      fwdTail = overlapTail(effectiveLeftJ, prevFrag.sequence, seq, 'right');
    }
    const fwdSeq = fwdTail + fwdBinding.sequence;

    primers.push({
      name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_fwd_${frag.name}`,
      sequence: fwdSeq, bindingSequence: fwdBinding.sequence,
      tailSequence: fwdTail, tmBinding: fwdBinding.tm,
      tmAdjusted: Math.round(fwdBinding.tm + tmAdj),
      direction: 'forward', fragmentName: frag.name, fragmentIndex: i,
      length: fwdSeq.length,
      isInternal: fwdIsInternal,
      mergedBlockName: frag._mergedName,
      purpose: fwdIsInternal ? `OV-PCR ${frag._mergedName}` : null,
      needsAmplification: frag.needsAmplification !== false,
    });

    // Reverse primer
    const revBinding = findBinding(seq, 'reverse', tmTarget);
    if (revBinding.warning) warnings.push(`⚠ ${frag.name} rev: ${revBinding.warning}`);
    let revTail = '';
    if (rightJ && nextFrag?.sequence) {
      // If right neighbor is No-PCR → carry FULL overlap
      const rightIsNoPCR = nextFrag.needsAmplification === false && nextFrag._mergedName === null;
      const effectiveRightJ = (rightIsNoPCR && (rightJ.overlapMode || 'split') === 'split')
        ? { ...rightJ, overlapMode: 'left_only' }
        : rightJ;
      revTail = overlapTail(effectiveRightJ, seq, nextFrag.sequence, 'left');
    }
    const revBindRC = rc(revBinding.sequence);
    const revSeq = revTail + revBindRC;

    primers.push({
      name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_rev_${frag.name}`,
      sequence: revSeq, bindingSequence: revBindRC,
      tailSequence: revTail, tmBinding: revBinding.tm,
      tmAdjusted: Math.round(revBinding.tm + tmAdj),
      direction: 'reverse', fragmentName: frag.name, fragmentIndex: i,
      length: revSeq.length,
      isInternal: revIsInternal,
      mergedBlockName: frag._mergedName,
      purpose: revIsInternal ? `OV-PCR ${frag._mergedName}` : null,
      needsAmplification: frag.needsAmplification !== false,
    });

    if (fwdBinding.tm < tmTarget - 3) {
      warnings.push(`⚠ ${frag.name} fwd: Tm ${fwdBinding.tm}°C < ${tmTarget}°C (последовательность слишком AT-богатая)`);
    }
    if (revBinding.tm < tmTarget - 3) {
      warnings.push(`⚠ ${frag.name} rev: Tm ${revBinding.tm}°C < ${tmTarget}°C`);
    }
    if (fwdSeq.length > 60) {
      warnings.push(`💡 ${frag.name} fwd: ${fwdSeq.length} нт — длинный праймер, рекомендуется PAGE-очистка`);
    }
    if (revSeq.length > 60) {
      warnings.push(`💡 ${frag.name} rev: ${revSeq.length} нт — длинный праймер, рекомендуется PAGE-очистка`);
    }
  }

  // Check for N+N adjacency (impossible overlap)
  for (let i = 0; i < n - 1; i++) {
    const left = expanded[i];
    const right = expanded[i + 1];
    const junc = i < juncs.length ? juncs[i] : null;
    if (left.needsAmplification === false && left._mergedName === null &&
        right.needsAmplification === false && right._mergedName === null &&
        (junc?.type || 'overlap') === 'overlap') {
      warnings.push(
        `⛔ ${left.name} → ${right.name}: оба "без ПЦР" — overlap невозможен. Переключите хотя бы один на ПЦР или используйте RE-лигирование.`
      );
    }
  }
  if (circular && n >= 2) {
    const first = expanded[0];
    const last = expanded[n - 1];
    const lastJunc = juncs[n - 1] || null;
    if (first.needsAmplification === false && first._mergedName === null &&
        last.needsAmplification === false && last._mergedName === null &&
        (lastJunc?.type || 'overlap') === 'overlap') {
      warnings.push(
        `⛔ ${last.name} → ${first.name}: оба "без ПЦР" — circular overlap невозможен.`
      );
    }
  }

  return { primers, warnings };
}
