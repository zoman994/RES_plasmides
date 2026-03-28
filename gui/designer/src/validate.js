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
        w.push(`⚠ ${frag.name}: нет стартового кодона ATG`);

      if (seq.length % 3 !== 0)
        w.push(`⚠ ${frag.name}: длина ${seq.length} п.н. не делится на 3 (сдвиг рамки?)`);

      // Internal stop codons (exclude last codon)
      for (let j = 0; j < seq.length - 3; j += 3) {
        const codon = seq.slice(j, j + 3);
        if (STOPS.includes(codon)) {
          w.push(`⚠ ${frag.name}: внутренний стоп-кодон ${codon} в позиции ${j + 1}`);
          break;
        }
      }

      // Missing stop at end
      const lastCodon = seq.slice(-3);
      if (!STOPS.includes(lastCodon))
        w.push(`💡 ${frag.name}: нет стоп-кодона в конце`);
    }

    // Order / context checks
    if (i > 0) {
      const prev = fragments[i - 1];
      if (frag.type === 'CDS' && prev.type !== 'promoter' && prev.type !== 'regulatory' && prev.type !== 'CDS')
        w.push(`💡 ${frag.name}: перед CDS нет промотора`);
      if (frag.type === 'promoter' && prev.type === 'terminator')
        w.push(`💡 Терминатор перед промотором (${prev.name} → ${frag.name}) — обратный порядок?`);
      if (frag.type === 'promoter' && prev.type === 'promoter')
        w.push(`💡 Два промотора подряд (${prev.name} → ${frag.name})`);
    }

    // CDS at end without terminator
    if (frag.type === 'CDS' && i === fragments.length - 1)
      w.push(`💡 ${frag.name}: нет терминатора после последнего CDS`);

    // Two CDS in a row
    if (frag.type === 'CDS' && i < fragments.length - 1 && fragments[i + 1].type === 'CDS')
      w.push(`💡 Два CDS подряд (${frag.name} → ${fragments[i + 1].name}) — полицистрон?`);

    // Flipped regulatory elements
    if (frag.type === 'promoter' && frag.strand === -1)
      w.push(`💡 ${frag.name}: промотор в обратной ориентации (←). Транскрипция пойдёт влево.`);
    if (frag.type === 'terminator' && frag.strand === -1)
      w.push(`⚠ ${frag.name}: терминатор перевёрнут — не будет работать для предыдущего гена.`);

    // Intron warning
    if (frag.has_introns && frag.introns?.length > 0)
      w.push(`⚠ ${frag.name}: содержит ${frag.introns.length} интрон(ов) — удалите для экспрессии в E. coli!`);
  });

  // Identical fragment detection
  for (let i = 0; i < fragments.length; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      if (!fragments[i].sequence || !fragments[j].sequence) continue;
      if (fragments[i].sequence === fragments[j].sequence) {
        const adjacent = j === i + 1;
        if (adjacent) {
          w.push(`⛔ ${fragments[i].name} (#${i + 1}) и ${fragments[j].name} (#${j + 1}) идентичны и стоят рядом — overlap/Gibson сборка НЕВОЗМОЖНА. Overlap-регионы будут одинаковыми → неправильная сборка. Используйте Golden Gate.`);
        } else {
          w.push(`⚠ ${fragments[i].name} (#${i + 1}) и ${fragments[j].name} (#${j + 1}) идентичны — overlap/Gibson может дать ошибочную сборку с повторяющимися фрагментами. Рекомендуется Golden Gate.`);
        }
      }
    }
  }

  return w;
}

/** Check if junctions between identical fragments need Golden Gate. */
export function detectIdenticalFragmentIssues(fragments, junctions) {
  const issues = [];
  for (let i = 0; i < junctions.length; i++) {
    const left = fragments[i];
    const right = fragments[(i + 1) % fragments.length];
    if (!left?.sequence || !right?.sequence) continue;
    if (left.sequence === right.sequence && (junctions[i]?.type || 'overlap') === 'overlap') {
      issues.push({ junctionIndex: i, leftName: left.name, rightName: right.name });
    }
  }
  return issues;
}

/** Group identical fragments for PCR deduplication. Returns map: seqHash → { fragment, indices, count }. */
export function groupIdenticalFragments(fragments) {
  const groups = new Map();
  fragments.forEach((f, i) => {
    if (f.needsAmplification === false || !f.sequence) return;
    const key = f.sequence;
    if (!groups.has(key)) {
      groups.set(key, { fragment: f, indices: [i], count: 1 });
    } else {
      const g = groups.get(key);
      g.indices.push(i);
      g.count++;
    }
  });
  return groups;
}

/** Check primer quality — returns per-primer warning arrays. */
export function checkPrimerQuality(primer) {
  const w = [];
  const bind = (primer.bindingSequence || '').toUpperCase();
  if (!bind) return w;

  if (bind.length >= 4) {
    const last4 = bind.slice(-4);
    const rc4 = revComp(last4);
    if (bind.includes(rc4))
      w.push("3'-самокомплементарность");
  }

  if (bind.length >= 2) {
    const lastTwo = bind.slice(-2);
    const gcCount = (lastTwo.match(/[GC]/g) || []).length;
    if (gcCount === 0) w.push("Нет GC-клэмпа на 3'-конце");
  }

  if (/(.)\1{4,}/.test(bind))
    w.push('Гомополимерный участок (>4 одинаковых оснований)');

  if ((primer.length || 0) > 55)
    w.push('Очень длинный (>55 нт) — используйте PAGE-очистку');

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
