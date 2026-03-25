/** Mutagenesis strategy engine — KLD / 2-fragment / multi-fragment. */

import { translateDNA, translateCodon, getBestCodon } from './codons';

const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');

/**
 * Choose strategy based on mutation count and spacing.
 * Returns 'kld' | 'two_fragment' | 'multi_fragment'
 */
export function chooseStrategy(mutations) {
  const sorted = [...mutations].sort((a, b) => a.dnaPosition - b.dnaPosition);
  if (sorted.length === 1) return 'kld';
  if (sorted.length === 2 && sorted[1].dnaPosition - sorted[0].dnaPosition < 100) return 'kld';
  if (sorted.length === 2) return 'two_fragment';
  return 'multi_fragment';
}

/**
 * Apply a mutation to a sequence, return mutant sequence.
 */
export function applyMutation(seq, mut) {
  const pos = mut.dnaPosition; // 0-based
  if (mut.type === 'substitution') {
    return seq.slice(0, pos) + mut.newCodon + seq.slice(pos + 3);
  } else if (mut.type === 'deletion') {
    return seq.slice(0, pos) + seq.slice(pos + mut.deleteLength);
  } else if (mut.type === 'insertion') {
    return seq.slice(0, pos) + mut.insertSequence + seq.slice(pos);
  }
  return seq;
}

/**
 * Main entry: compute full mutagenesis strategy.
 * Returns { strategy, fragments, junctions, primers, protocol, warnings, mutantSequence }
 */
export function computeMutagenesisStrategy(templateSeq, mutations, options = {}) {
  const {
    bindingLength = 20,
    overlapLength = 30,
    featureStart = 0,
    featureEnd = templateSeq.length,
  } = options;

  const sorted = [...mutations].sort((a, b) => a.dnaPosition - b.dnaPosition);
  const strategy = chooseStrategy(sorted);

  if (strategy === 'kld') {
    return makeKLDStrategy(templateSeq, sorted, bindingLength);
  }
  return makeFragmentStrategy(templateSeq, sorted, featureStart, featureEnd, overlapLength, bindingLength);
}

/** KLD: back-to-back primers, whole plasmid as template. */
function makeKLDStrategy(templateSeq, mutations, bindingLength) {
  const mut = mutations[0]; // primary mutation
  const pos = mut.dnaPosition; // 0-based
  const warnings = ['5\' phosphorylation required on both primers', 'Use DpnI (1h, 37°C) after PCR to digest template'];

  // Build mutant sequence
  let mutantSeq = templateSeq;
  for (const m of [...mutations].reverse()) { // reverse to preserve positions
    mutantSeq = applyMutation(mutantSeq, m);
  }

  let fwdSeq, revSeq, fwdName, revName;

  if (mut.type === 'substitution') {
    // fwd starts at mutation: mutant codon + downstream binding
    fwdSeq = mut.newCodon + templateSeq.slice(pos + 3, pos + 3 + bindingLength);
    // rev ends just before mutation: upstream binding RC
    const revRegion = templateSeq.slice(Math.max(0, pos - bindingLength), pos);
    revSeq = revComp(revRegion);
    fwdName = `KLD_fwd_${mut.label || 'mut'}`;
    revName = `KLD_rev_${mut.label || 'mut'}`;
  } else if (mut.type === 'insertion') {
    fwdSeq = mut.insertSequence + templateSeq.slice(pos, pos + bindingLength);
    const revRegion = templateSeq.slice(Math.max(0, pos - bindingLength), pos);
    revSeq = revComp(revRegion);
    fwdName = 'KLD_fwd_ins';
    revName = 'KLD_rev_ins';
  } else if (mut.type === 'deletion') {
    const afterDel = pos + mut.deleteLength;
    fwdSeq = templateSeq.slice(afterDel, afterDel + bindingLength);
    const revRegion = templateSeq.slice(Math.max(0, pos - bindingLength), pos);
    revSeq = revComp(revRegion);
    fwdName = 'KLD_fwd_del';
    revName = 'KLD_rev_del';
  }

  // Handle second mutation if present (both in KLD primers)
  if (mutations.length === 2) {
    const mut2 = mutations[1];
    warnings.push(`Both mutations encoded in primers (${mut2.dnaPosition - mut.dnaPosition}bp apart)`);
  }

  const primers = [
    { name: fwdName, sequence: fwdSeq, bindingSequence: fwdSeq, tailSequence: '',
      tailPurpose: mut.type === 'substitution' ? `mutant codon ${mut.newCodon}` : mut.type,
      tmBinding: 0, tmFull: 0, gcPercent: 0, length: fwdSeq.length, direction: 'forward' },
    { name: revName, sequence: revSeq, bindingSequence: revSeq, tailSequence: '',
      tailPurpose: 'back-to-back with fwd',
      tmBinding: 0, tmFull: 0, gcPercent: 0, length: revSeq.length, direction: 'reverse' },
  ];

  return {
    strategy: 'kld',
    fragments: [{ name: 'template', sequence: templateSeq, length: templateSeq.length,
                  needsAmplification: true, type: 'misc_feature', sourceType: 'template_pcr', strand: 1 }],
    junctions: [{ type: 'phosphorylated', overlapMode: 'none', overlapLength: 0, containsMutation: true,
                  mutation: mut }],
    primers,
    protocol: 'PCR (whole plasmid) → DpnI 1h 37°C → KLD mix 5min RT → Transform',
    warnings,
    mutantSequence: mutantSeq,
    mutations: mutations,
  };
}

/** Fragment assembly: cut between mutations, mutations in overlap zones. */
function makeFragmentStrategy(templateSeq, mutations, featureStart, featureEnd, overlapLength, bindingLength) {
  const warnings = [];
  const halfOL = Math.floor(overlapLength / 2);

  // Build mutant sequence
  let mutantSeq = templateSeq;
  for (const m of [...mutations].reverse()) {
    mutantSeq = applyMutation(mutantSeq, m);
  }

  // Cut points — midway between mutations
  const cutPoints = [];
  for (let i = 0; i < mutations.length - 1; i++) {
    cutPoints.push(Math.floor((mutations[i].dnaPosition + mutations[i + 1].dnaPosition) / 2));
  }

  // Fragment boundaries with context
  const ctx = 200;
  const boundaries = [
    Math.max(0, featureStart - ctx),
    ...cutPoints,
    Math.min(templateSeq.length, featureEnd + ctx),
  ];

  const fragments = [];
  const junctions = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    // Fragment uses WILD-TYPE template for PCR
    fragments.push({
      id: `mfrag_${i}`,
      name: `frag_${i + 1}`,
      sequence: templateSeq.slice(start, end),
      length: end - start,
      needsAmplification: true,
      type: 'misc_feature',
      sourceType: 'template_pcr',
      strand: 1,
      templateStart: start,
      templateEnd: end,
    });
  }

  // Junctions with MUTANT overlap sequences
  for (let i = 0; i < cutPoints.length; i++) {
    const cut = cutPoints[i];
    const olStart = Math.max(0, cut - halfOL);
    const olEnd = Math.min(mutantSeq.length, cut + halfOL);
    const olSeq = mutantSeq.slice(olStart, olEnd); // MUTANT sequence in overlap

    junctions.push({
      type: 'overlap',
      overlapMode: 'split',
      overlapSequence: olSeq,
      overlapLength: olSeq.length,
      overlapTm: 0, // will be calculated by API
      containsMutation: true,
      mutation: mutations[i],
      mutationLabel: mutations[i].label || `mut${i + 1}`,
    });
  }

  return {
    strategy: mutations.length === 2 ? 'two_fragment' : 'multi_fragment',
    fragments,
    junctions,
    primers: [], // will be generated by standard assembly engine
    protocol: `PCR ${fragments.length} fragments from template → Overlap PCR fusion → Transform`,
    warnings,
    mutantSequence: mutantSeq,
    mutations,
  };
}

/** Validate mutations and return warnings. */
export function validateMutations(templateSeq, mutations, featureStart = 0) {
  const warnings = [];
  const sorted = [...mutations].sort((a, b) => a.dnaPosition - b.dnaPosition);

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    // Check if mutation creates/destroys common RE sites
    const RE_SITES = ['GAATTC','GGATCC','AAGCTT','GGTCTC','TCTAGA','CTCGAG'];
    const pos = m.dnaPosition;
    const ctx = 10;
    const before = templateSeq.slice(Math.max(0, pos - ctx), pos + ctx);
    let after = before;
    if (m.type === 'substitution') after = before.slice(0, ctx) + m.newCodon + before.slice(ctx + 3);

    for (const site of RE_SITES) {
      const hadSite = before.includes(site);
      const hasSite = after.includes(site);
      if (!hadSite && hasSite) warnings.push(`⚠ ${m.label}: creates ${site} site (useful for screening!)`);
      if (hadSite && !hasSite) warnings.push(`💡 ${m.label}: destroys ${site} site`);
    }

    // Check overlap with next mutation
    if (i < sorted.length - 1) {
      const gap = sorted[i + 1].dnaPosition - m.dnaPosition;
      if (gap < 6) warnings.push(`⚠ ${m.label} and ${sorted[i + 1].label}: overlap (<6bp) — combine into one change`);
      else if (gap < 30) warnings.push(`💡 ${m.label} and ${sorted[i + 1].label}: close (${gap}bp) — can encode both in one primer`);
    }
  }

  return warnings;
}
