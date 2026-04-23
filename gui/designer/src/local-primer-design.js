/**
 * local-primer-design.js — Client-side primer design for overlap/GG/KLD/RE assemblies.
 * No API needed. Called reactively when fragments/junctions change.
 */
import { calcTmNN } from './tm-calculator';
import { GG_ENZYMES } from './golden-gate';
import { getTagByName } from './tags-db';
import { generateRETail } from './restriction-db';

function rc(seq) {
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  return seq.split('').reverse().map(c => comp[c.toUpperCase()] || 'N').join('');
}

/**
 * Find minimal binding region from one end with Tm >= target.
 */
function findBinding(seq, direction, tmTarget = 60) {
  const s = seq.toUpperCase();
  const minLen = 18, maxLen = 30;

  if (s.length < minLen) {
    return {
      sequence: s,
      tm: s.length >= 4 ? Math.round(calcTmNN(s) * 10) / 10 : 0,
      length: s.length,
      warning: `Фрагмент слишком короткий (${s.length} bp < ${minLen} bp) — праймер неспецифичен. Рассмотрите merge (Ctrl+Click) с соседним фрагментом.`,
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
 * Tag-aware binding: if the binding region falls entirely within a low-complexity
 * tag/linker annotation, extend past the tag into specific CDS sequence.
 * Returns { sequence, tm, length, warning?, extended? }.
 */
function findBindingTagAware(seq, direction, tmTarget, annotations) {
  const binding = findBinding(seq, direction, tmTarget);
  if (!annotations?.length) return binding;

  const s = seq.toUpperCase();
  const seqLen = s.length;

  // Determine the binding region coordinates on the template
  const bindStart = direction === 'forward' ? 0 : seqLen - binding.length;
  const bindEnd = direction === 'forward' ? binding.length : seqLen;

  // Find tag/linker annotations that substantially overlap with the binding region
  // "Substantial" = tag covers ≥50% of binding, meaning most of the binding falls in tag
  const tagTypes = ['tag', 'cleavage_site', 'linker'];
  const overlappingTag = annotations.find(a => {
    if (!tagTypes.includes(a.type)) return false;
    const overlapStart = Math.max(a.start, bindStart);
    const overlapEnd = Math.min(a.end, bindEnd);
    const overlapLen = Math.max(0, overlapEnd - overlapStart);
    return overlapLen >= binding.length * 0.5;
  });

  if (!overlappingTag) {
    // Check for repeat patterns in binding even without annotation
    const repeatWarning = checkRepeats(binding.sequence);
    if (repeatWarning) return { ...binding, warning: repeatWarning };
    return binding;
  }

  // Check if this tag is low-complexity
  const tagInfo = getTagByName(overlappingTag.name);
  const isLowComplexity = tagInfo?.lowComplexity ?? false;

  if (!isLowComplexity) {
    // Tag is not low-complexity (e.g. FLAG) — normal binding is fine
    const repeatWarning = checkRepeats(binding.sequence);
    if (repeatWarning) return { ...binding, warning: repeatWarning };
    return binding;
  }

  // Extend binding past the tag region + at least 12bp of specific CDS sequence
  const minSpecific = 12;
  if (direction === 'reverse') {
    // Binding is at the 3' end of the sequence (template sense)
    // Tag occupies [tag.start, tag.end). We need to reach tag.start - minSpecific
    const targetLen = seqLen - overlappingTag.start + minSpecific;
    const extLen = Math.min(Math.max(targetLen, binding.length), seqLen);
    const extRegion = s.slice(seqLen - extLen);
    const tm = extLen >= 4 ? Math.round(calcTmNN(extRegion) * 10) / 10 : 0;
    return {
      sequence: extRegion,
      tm,
      length: extLen,
      extended: true,
      warning: `⚠ Binding расширен через ${overlappingTag.name} (повтор, low complexity) — ${extLen} bp, рекомендуется PAGE-очистка`,
    };
  } else {
    // Forward: tag at 5' end
    const targetLen = overlappingTag.end + minSpecific;
    const extLen = Math.min(Math.max(targetLen, binding.length), seqLen);
    const extRegion = s.slice(0, extLen);
    const tm = extLen >= 4 ? Math.round(calcTmNN(extRegion) * 10) / 10 : 0;
    return {
      sequence: extRegion,
      tm,
      length: extLen,
      extended: true,
      warning: `⚠ Binding расширен через ${overlappingTag.name} (повтор, low complexity) — ${extLen} bp, рекомендуется PAGE-очистка`,
    };
  }
}

/** Check for trinucleotide/dinucleotide repeats in a primer binding region. */
function checkRepeats(seq) {
  if (/(CAC){3,}/i.test(seq) || /(GGT){3,}/i.test(seq) || /(GTG){3,}/i.test(seq) || /(ACC){3,}/i.test(seq)) {
    return '⚠ Binding содержит повтор (low complexity) — возможен mispriming';
  }
  return null;
}

/**
 * Calculate overlap tail sequence for a junction.
 */
function overlapTail(junction, leftSeq, rightSeq, side) {
  const j = junction || {};
  const jType = j.type || 'overlap';
  leftSeq = (leftSeq || '').toUpperCase();
  rightSeq = (rightSeq || '').toUpperCase();

  if (jType === 'kld' || jType === 'sticky_end') {
    return '';
  }

  if (jType === 'ligation' || jType === 're_ligation') {
    if (!j.enzyme) return '';
    const tail = generateRETail(j.enzyme);
    // Forward primer (side='right'): RE tail is prepended directly
    // Reverse primer (side='left'): RE tail needs reverse complement
    return side === 'left' ? tail : rc(tail);
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

  // V4-E: If junction explicitly carries an overlapSequence (e.g. a mutant-containing
  // overlap bridge emitted by computeMutagenesisStrategy), source the tail from it
  // instead of the WT flanks. This lets the mutation reach the primer even though
  // the amplified fragments are WT.
  if (mode === 'split' && typeof j.overlapSequence === 'string' && j.overlapSequence.length > 0) {
    const olSeq = j.overlapSequence.toUpperCase();
    const half = Math.ceil(overlapLen / 2);
    if (side === 'left') {
      return olSeq.slice(half);
    } else {
      return rc(olSeq.slice(0, half));
    }
  }

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

  if (fragments.length < 2) {
    if (fragments.length === 1) {
      // V24 (Sprint X K6): single-circular self-closure via overhang tails.
      // PCR product gets a 15-bp tail on each end that enables circularization
      // at the site of linearization (e.g. Gibson / KLD self-closure).
      const frag = fragments[0];
      const seq = (frag.sequence || '').toUpperCase();
      const isCircular = circular || frag.topology === 'circular';
      const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
      if (isCircular && seq.length >= 40) {
        const halfOverlap = 15;
        const fwdTail = rc(seq.slice(0, halfOverlap));
        const revTail = seq.slice(-halfOverlap);
        const fwdBinding = findBindingTagAware(seq, 'forward', tmTarget, frag.annotations);
        const revBinding = findBindingTagAware(seq, 'reverse', tmTarget, frag.annotations);
        const revBindRC = rc(revBinding.sequence);
        const fwdSeq = fwdTail + fwdBinding.sequence;
        const revSeq = revTail + revBindRC;
        primers.push({
          name: `${primerPrefix}001_fwd_${frag.name}_self_closure`,
          sequence: fwdSeq, bindingSequence: fwdBinding.sequence,
          tailSequence: fwdTail, tmBinding: fwdBinding.tm,
          tmAdjusted: Math.round(fwdBinding.tm + tmAdj),
          direction: 'forward', fragmentName: frag.name, fragmentIndex: 0,
          length: fwdSeq.length,
          isInternal: false, mergedBlockName: null,
          purpose: 'self-closure',
          tailPurpose: 'circular self-closure tail',
          needsAmplification: frag.needsAmplification !== false,
        });
        primers.push({
          name: `${primerPrefix}002_rev_${frag.name}_self_closure`,
          sequence: revSeq, bindingSequence: revBindRC,
          tailSequence: revTail, tmBinding: revBinding.tm,
          tmAdjusted: Math.round(revBinding.tm + tmAdj),
          direction: 'reverse', fragmentName: frag.name, fragmentIndex: 0,
          length: revSeq.length,
          isInternal: false, mergedBlockName: null,
          purpose: 'self-closure',
          tailPurpose: 'circular self-closure tail',
          needsAmplification: frag.needsAmplification !== false,
        });
        return { primers, warnings };
      }
      // Sprint X-fix K5 (U2): single-linear terminal PCR.
      // Two binding-only primers at 5'/3' ends; no tails (nothing to join to).
      // Respects needsAmplification — No-PCR backbones don't need primers.
      if (!isCircular && seq.length >= 36 && frag.needsAmplification !== false) {
        const fwdBinding = findBindingTagAware(seq, 'forward', tmTarget, frag.annotations);
        const revBinding = findBindingTagAware(seq, 'reverse', tmTarget, frag.annotations);
        const revBindRC = rc(revBinding.sequence);
        primers.push({
          name: `${primerPrefix}001_fwd_${frag.name}_terminal`,
          sequence: fwdBinding.sequence, bindingSequence: fwdBinding.sequence,
          tailSequence: '', tmBinding: fwdBinding.tm,
          tmAdjusted: Math.round(fwdBinding.tm + tmAdj),
          direction: 'forward', fragmentName: frag.name, fragmentIndex: 0,
          length: fwdBinding.sequence.length,
          isInternal: false, mergedBlockName: null,
          purpose: 'terminal-pcr',
          tailPurpose: '',
          needsAmplification: frag.needsAmplification !== false,
        });
        primers.push({
          name: `${primerPrefix}002_rev_${frag.name}_terminal`,
          sequence: revBindRC, bindingSequence: revBindRC,
          tailSequence: '', tmBinding: revBinding.tm,
          tmAdjusted: Math.round(revBinding.tm + tmAdj),
          direction: 'reverse', fragmentName: frag.name, fragmentIndex: 0,
          length: revBindRC.length,
          isInternal: false, mergedBlockName: null,
          purpose: 'terminal-pcr',
          tailPurpose: '',
          needsAmplification: frag.needsAmplification !== false,
        });
        if (fwdBinding.warning) warnings.push(`${frag.name} fwd: ${fwdBinding.warning}`);
        if (revBinding.warning) warnings.push(`${frag.name} rev: ${revBinding.warning}`);
        return { primers, warnings };
      }
      warnings.push('ℹ️ Один фрагмент — праймеры не требуются (используется целиком без ПЦР). Для линейризации добавьте второй фрагмент или используйте рестрикционное клонирование.');
    }
    return { primers, warnings };
  }

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

    // Forward primer (tag-aware if annotations present)
    const fwdBinding = findBindingTagAware(seq, 'forward', tmTarget, frag.annotations);
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

    // Reverse primer (tag-aware if annotations present)
    const revBinding = findBindingTagAware(seq, 'reverse', tmTarget, frag.annotations);
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

    // Tag-aware warnings
    if (fwdBinding.warning) warnings.push(`${frag.name} fwd: ${fwdBinding.warning}`);
    if (revBinding.warning) warnings.push(`${frag.name} rev: ${revBinding.warning}`);

    if (fwdBinding.tm < tmTarget - 3) {
      warnings.push(`⚠ ${frag.name} fwd: Tm ${fwdBinding.tm}°C < ${tmTarget}°C (последовательность слишком AT-богатая)`);
    }
    if (revBinding.tm < tmTarget - 3) {
      warnings.push(`⚠ ${frag.name} rev: Tm ${revBinding.tm}°C < ${tmTarget}°C`);
    }
    // deltaTm check
    if (Math.abs(fwdBinding.tm - revBinding.tm) > 5) {
      warnings.push(`⚠ ${frag.name}: ΔTm = ${Math.abs(Math.round((fwdBinding.tm - revBinding.tm) * 10) / 10)}°C (fwd ${fwdBinding.tm}°C, rev ${revBinding.tm}°C) — рекомендуется выровнять`);
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

  // CRIT-5: warn about short fragments that produce non-specific primers
  for (const frag of expanded) {
    if (frag.sequence && frag.sequence.length < 18 && frag.needsAmplification !== false) {
      warnings.push(`⚠ ${frag.name} (${frag.sequence.length} bp) — слишком короткий для специфичных праймеров. Рекомендуется merge с соседним (Ctrl+Click).`);
    }
  }

  return { primers, warnings };
}
