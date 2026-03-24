/** Construct and primer validation for the Designer. */

const STOPS = ['TAA', 'TAG', 'TGA'];
const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c] || 'N').join('');

/** Validate fragments on canvas — returns array of warning strings. */
export function validateConstruct(fragments) {
  const w = [];
  fragments.forEach((frag, i) => {
    const seq = (frag.sequence || '').toUpperCase();

    // CDS-specific checks
    if (frag.type === 'CDS' && seq.length > 0) {
      if (!seq.startsWith('ATG'))
        w.push(`\u26a0 ${frag.name}: no ATG start codon`);

      if (seq.length % 3 !== 0)
        w.push(`\u26a0 ${frag.name}: length ${seq.length}bp not divisible by 3 (frameshift?)`);

      // Internal stop codons (exclude last codon)
      for (let j = 0; j < seq.length - 3; j += 3) {
        const codon = seq.slice(j, j + 3);
        if (STOPS.includes(codon)) {
          w.push(`\u26a0 ${frag.name}: internal stop codon ${codon} at position ${j + 1}`);
          break; // report only first
        }
      }

      // Missing stop at end
      const lastCodon = seq.slice(-3);
      if (!STOPS.includes(lastCodon))
        w.push(`\ud83d\udca1 ${frag.name}: no stop codon at end`);
    }

    // Order / context checks
    if (i > 0) {
      const prev = fragments[i - 1];
      if (frag.type === 'CDS' && prev.type !== 'promoter' && prev.type !== 'regulatory' && prev.type !== 'CDS')
        w.push(`\ud83d\udca1 ${frag.name}: no promoter before this CDS`);
      if (frag.type === 'promoter' && prev.type === 'terminator')
        w.push(`\ud83d\udca1 Terminator before promoter (${prev.name} \u2192 ${frag.name}) \u2014 reversed order?`);
      if (frag.type === 'promoter' && prev.type === 'promoter')
        w.push(`\ud83d\udca1 Two promoters in a row (${prev.name} \u2192 ${frag.name})`);
    }

    // CDS at end without terminator
    if (frag.type === 'CDS' && i === fragments.length - 1)
      w.push(`\ud83d\udca1 ${frag.name}: no terminator after last CDS`);

    // Two CDS in a row
    if (frag.type === 'CDS' && i < fragments.length - 1 && fragments[i + 1].type === 'CDS')
      w.push(`\ud83d\udca1 Two CDS in a row (${frag.name} \u2192 ${fragments[i + 1].name}) \u2014 polycistronic?`);
  });
  return w;
}

/** Check primer quality — returns per-primer warning arrays. */
export function checkPrimerQuality(primer) {
  const w = [];
  const bind = (primer.bindingSequence || '').toUpperCase();
  if (!bind) return w;

  // 3' self-complementarity
  if (bind.length >= 4) {
    const last4 = bind.slice(-4);
    const rc4 = revComp(last4);
    if (bind.includes(rc4))
      w.push("3' self-complementary");
  }

  // GC clamp
  if (bind.length >= 2) {
    const lastTwo = bind.slice(-2);
    const gcCount = (lastTwo.match(/[GC]/g) || []).length;
    if (gcCount === 0) w.push("No GC clamp at 3' end");
  }

  // Homopolymer runs
  if (/(.)\1{4,}/.test(bind))
    w.push('Homopolymer run (>4 identical bases)');

  // Length warning
  if ((primer.length || 0) > 55)
    w.push('Very long (>55nt) \u2014 use PAGE purification');

  return w;
}

/** Calculate PCR product size for a fragment given its junction tails. */
export function pcrProductSize(frag, leftJunction, rightJunction) {
  if (!frag.needsAmplification) return null;
  const base = frag.length || (frag.sequence || '').length;
  const leftTail = leftJunction?.overlapLength || 0;
  const rightTail = rightJunction?.overlapLength || 0;
  return base + leftTail + rightTail;
}
