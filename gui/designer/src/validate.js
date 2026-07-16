/** Construct and primer validation for the Designer. */

import { getRegions } from './annotation-model';
import { validateCDS } from './cds-validation';
import { calcTmNN, gcPercent } from './tm-calculator';
import { RE_ENZYMES, siteToRegex } from './restriction-db';
import { reverseComplement as ggRC, GG_ENZYMES } from './golden-gate';

const STOPS = ['TAA', 'TAG', 'TGA'];
const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c] || 'N').join('');

/** Validate fragments on canvas — returns array of warning strings. */
export function validateConstruct(fragments) {
  const w = [];
  fragments.forEach((frag, i) => {
    const seq = (frag.sequence || '').toUpperCase();

    // Region-based CDS validation (for fusion parts with CDS regions)
    const regions = getRegions(frag.annotations);
    for (const region of regions) {
      if (region.type !== 'CDS' && region.type !== 'gene') continue;
      const rSeq = seq.slice(region.start, region.end);
      if (rSeq.length === 0) continue;
      const cdsWarnings = validateCDS(rSeq);
      for (const cw of cdsWarnings) {
        w.push(`${cw.level === 'error' ? '\u26D4' : '\u26A0'} ${frag.name}/${region.name}: ${cw.message}`);
      }
    }

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

    // Intron warning — host-aware. A fungal host (A. niger / T. reesei) SPLICES
    // introns, so a genomic gene with introns is usually correct to KEEP; the
    // danger case is expressing an intron-containing gene in a host that won't
    // splice (E. coli). Phrase it both ways instead of assuming E. coli.
    if (frag.has_introns && frag.introns?.length > 0)
      w.push(`💡 ${frag.name}: содержит ${frag.introns.length} интрон(ов) — сохранить для сплайсинга в грибном хозяине (A. niger / T. reesei); удалить (→ кДНК) для экспрессии в E. coli.`);
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
  // Account for overlap mode: split shares overlap between fragments,
  // left_only/right_only means one side already contains the full overlap
  const leftAdd = !leftJunction ? 0
    : leftJunction.overlapMode === 'right_only' ? 0
    : leftJunction.overlapMode === 'split' ? Math.ceil((leftJunction.overlapLength || 0) / 2)
    : leftJunction.overlapLength || 0;
  const rightAdd = !rightJunction ? 0
    : rightJunction.overlapMode === 'left_only' ? 0
    : rightJunction.overlapMode === 'split' ? Math.ceil((rightJunction.overlapLength || 0) / 2)
    : rightJunction.overlapLength || 0;
  return base + leftAdd + rightAdd;
}

/**
 * Validate junction end compatibility between adjacent fragments.
 * Call BEFORE primer calculation to catch issues early.
 *
 * @param {Array} fragments — assembly fragments with .sequence
 * @param {Array} junctions — junction configs with .type, .overlapLength, etc.
 * @param {boolean} circular — is the assembly circular
 * @returns {Array<{junction: number, severity: 'error'|'warning'|'info', message: string}>}
 */
export function validateJunctionEnds(fragments, junctions, circular) {
  const warnings = [];
  const n = junctions.length;

  for (let i = 0; i < n; i++) {
    const j = junctions[i];
    const left = fragments[i];
    const right = fragments[(i + 1) % fragments.length];
    if (!left?.sequence || !right?.sequence) continue;

    const jType = j.type || 'overlap';

    // ═══ OVERLAP / GIBSON ═══
    if (jType === 'overlap') {
      // 1. Identical fragments → assembly impossible
      if (left.sequence === right.sequence) {
        warnings.push({
          junction: i, severity: 'error',
          message: `⛔ Стык ${i+1}: идентичные фрагменты (${left.name} = ${right.name}) — overlap/Gibson невозможен. Используйте Golden Gate.`
        });
        continue;
      }

      // 2. Overlap zone analysis
      const overlapLen = j.overlapLength || 30;
      const mode = j.overlapMode || 'split';

      let overlapSeq;
      if (mode === 'split') {
        const half = Math.ceil(overlapLen / 2);
        overlapSeq = left.sequence.slice(-half) + right.sequence.slice(0, overlapLen - half);
      } else if (mode === 'left_only') {
        overlapSeq = left.sequence.slice(-overlapLen);
      } else {
        overlapSeq = right.sequence.slice(0, overlapLen);
      }

      // 3. GC% check
      const gc = gcPercent(overlapSeq);
      if (gc < 20) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: GC% overlap = ${gc}% (< 20%) — очень слабый отжиг, сборка может не работать`
        });
      }
      if (gc > 80) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: GC% overlap = ${gc}% (> 80%) — возможны вторичные структуры`
        });
      }

      // 4. Tm check
      const overlapTm = calcTmNN(overlapSeq);
      if (overlapTm < 50) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: Tm overlap = ${overlapTm}°C (< 50°C) — слишком низкая, увеличьте overlap`
        });
      }
      if (overlapTm > 72) {
        warnings.push({
          junction: i, severity: 'info',
          message: `💡 Стык ${i+1}: Tm overlap = ${overlapTm}°C (> 72°C) — можно уменьшить overlap`
        });
      }

      // 5. Repeat check — overlap sequence appears elsewhere in the construct
      const fullSeq = fragments.map(f => f.sequence || '').join('');
      if (overlapSeq.length >= 15) {
        const check = overlapSeq.toUpperCase();
        const first = fullSeq.toUpperCase().indexOf(check);
        const second = fullSeq.toUpperCase().indexOf(check, first + 1);
        if (second >= 0) {
          warnings.push({
            junction: i, severity: 'warning',
            message: `⚠ Стык ${i+1}: overlap (${overlapSeq.slice(0,10)}...) повторяется в конструкте — риск мисассембли`
          });
        }
      }

      // 6. Self-complementary check (palindrome in overlap)
      const rc = ggRC(overlapSeq.toUpperCase());
      if (overlapSeq.toUpperCase() === rc) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: overlap палиндромный — возможен hairpin`
        });
      }
    }

    // ═══ RE / ЛИГИРОВАНИЕ ═══
    if (jType === 're_ligation' || jType === 'sticky_end') {
      const enzyme = j.reEnzyme || j.enzyme;
      if (!enzyme) {
        warnings.push({
          junction: i, severity: 'error',
          message: `⛔ Стык ${i+1}: рестриктаза не выбрана`
        });
        continue;
      }

      const reInfo = RE_ENZYMES[enzyme];
      if (!reInfo) {
        warnings.push({
          junction: i, severity: 'error',
          message: `⛔ Стык ${i+1}: неизвестный фермент "${enzyme}"`
        });
        continue;
      }

      const leftEnd30 = (left.sequence.slice(-30) || '').toUpperCase();
      const rightStart30 = (right.sequence.slice(0, 30) || '').toUpperCase();
      const site = reInfo.site.toUpperCase();

      const re = siteToRegex(site);
      re.lastIndex = 0;
      const leftHas = re.test(leftEnd30);
      re.lastIndex = 0;
      const rightHas = re.test(rightStart30);

      if (!leftHas && !rightHas) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: сайт ${enzyme} (${site}) не найден на концах фрагментов — убедитесь что фрагменты подготовлены рестрикцией`
        });
      }

      if (reInfo.end === 'blunt') {
        warnings.push({
          junction: i, severity: 'info',
          message: `💡 Стык ${i+1}: ${enzyme} даёт blunt ends — направление вставки неопределённо (50/50)`
        });
      }
    }

    // ═══ KLD ═══
    if (jType === 'kld') {
      if (left.needsAmplification === false || right.needsAmplification === false) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: KLD требует ПЦР обоих фрагментов — один из них помечен как "без ПЦР"`
        });
      }
    }

    // ═══ GOLDEN GATE ═══
    if (jType === 'golden_gate') {
      const oh = (j.overhang || '').toUpperCase();
      if (!oh || oh.length < 3) {
        warnings.push({
          junction: i, severity: 'error',
          message: `⛔ Стык ${i+1}: Golden Gate overhang не задан`
        });
        continue;
      }

      const ohRC = ggRC(oh);
      if (oh === ohRC) {
        warnings.push({
          junction: i, severity: 'error',
          message: `⛔ Стык ${i+1}: overhang ${oh} палиндромный — самолигирование`
        });
      }

      const ohGC = (oh.match(/[GC]/g) || []).length;
      if (ohGC === 0) {
        warnings.push({
          junction: i, severity: 'warning',
          message: `⚠ Стык ${i+1}: overhang ${oh} без GC — слабая лигация`
        });
      }

      for (let k = i + 1; k < n; k++) {
        if (junctions[k]?.type !== 'golden_gate') continue;
        const otherOH = (junctions[k].overhang || '').toUpperCase();
        if (oh === otherOH) {
          warnings.push({
            junction: i, severity: 'error',
            message: `⛔ Стык ${i+1} и ${k+1}: одинаковый overhang ${oh} — перекрёстная лигация`
          });
        }
        if (oh === ggRC(otherOH)) {
          warnings.push({
            junction: i, severity: 'error',
            message: `⛔ Стык ${i+1} и ${k+1}: RC-совпадение (${oh} ↔ ${otherOH}) — перекрёстная лигация`
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SMART END SCANNING: Detect existing RE/GG cloning sites at fragment ends
    // Only for overlap junctions where we MIGHT be able to suggest a better method
    // ═══════════════════════════════════════════════════════════════

    const SCAN_DEPTH = 30;
    const MIN_FRAG_LEN = 50;

    if ((jType === 'overlap' || !j.type)
        && left.sequence.length >= MIN_FRAG_LEN
        && right.sequence.length >= MIN_FRAG_LEN) {

      const leftEnd = left.sequence.slice(-SCAN_DEPTH).toUpperCase();
      const rightStart = right.sequence.slice(0, SCAN_DEPTH).toUpperCase();

      // ─── 1. Scan for classical RE sites ───
      const foundLeft = [];
      const foundRight = [];

      for (const [name, info] of Object.entries(RE_ENZYMES)) {
        if (info.note && info.note.includes('methylat')) continue;
        if (info.site.length < 6) continue;

        const re = siteToRegex(info.site);

        let m;
        re.lastIndex = 0;
        while ((m = re.exec(leftEnd)) !== null) {
          foundLeft.push({ enzyme: name, position: leftEnd.length - m.index, site: info.site, overhang: info.overhang, end: info.end });
          if (m.index === re.lastIndex) re.lastIndex++;
        }

        re.lastIndex = 0;
        while ((m = re.exec(rightStart)) !== null) {
          foundRight.push({ enzyme: name, position: m.index, site: info.site, overhang: info.overhang, end: info.end });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      }

      // ─── 2. Find MATCHING sites (same enzyme on both ends) ───
      for (const ls of foundLeft) {
        const match = foundRight.find(rs => rs.enzyme === ls.enzyme);
        if (match) {
          warnings.push({
            junction: i, severity: 'info',
            message: `💡 Стык ${i+1}: сайт ${ls.enzyme} (${ls.site}) найден на обоих концах (${left.name} и ${right.name}) — можно использовать RE лигирование вместо overlap`,
            suggestion: { type: 're_ligation', enzyme: ls.enzyme, site: ls.site, overhang: ls.overhang }
          });
        }
      }

      // ─── 3. Find COMPATIBLE ends (different RE, same overhang+type) ───
      for (const ls of foundLeft) {
        if (!ls.overhang || ls.end === 'blunt') continue;
        for (const rs of foundRight) {
          if (rs.enzyme === ls.enzyme) continue;
          if (rs.overhang === ls.overhang && rs.end === ls.end) {
            warnings.push({
              junction: i, severity: 'info',
              message: `💡 Стык ${i+1}: совместимые концы ${ls.enzyme} (${ls.site}) и ${rs.enzyme} (${rs.site}) — оба дают ${ls.end === '5prime' ? "5'" : "3'"} overhang ${ls.overhang}`,
              suggestion: { type: 're_ligation', enzyme: ls.enzyme, compatibleEnzyme: rs.enzyme, overhang: ls.overhang }
            });
          }
        }
      }

      // ─── 4. Scan for GG (Type IIS) sites ───
      for (const [name, enz] of Object.entries(GG_ENZYMES)) {
        const rec = enz.recognition.toUpperCase();
        const recRC = ggRC(rec);

        const leftHasGG = leftEnd.includes(rec) || leftEnd.includes(recRC);
        const rightHasGG = rightStart.includes(rec) || rightStart.includes(recRC);

        if (leftHasGG || rightHasGG) {
          const leftBody = left.sequence.slice(0, -SCAN_DEPTH).toUpperCase();
          const rightBody = right.sequence.slice(SCAN_DEPTH).toUpperCase();
          const inBody = leftBody.includes(rec) || leftBody.includes(recRC)
                      || rightBody.includes(rec) || rightBody.includes(recRC);

          if (!inBody) {
            warnings.push({
              junction: i, severity: 'info',
              message: `💡 Стык ${i+1}: сайт ${name} (${rec}) обнаружен ${leftHasGG && rightHasGG ? 'на обоих концах' : leftHasGG ? `на конце ${left.name}` : `на начале ${right.name}`} — возможен Golden Gate`,
              suggestion: { type: 'golden_gate', enzyme: name }
            });
          }
        }
      }
    }
  }

  return warnings;
}
