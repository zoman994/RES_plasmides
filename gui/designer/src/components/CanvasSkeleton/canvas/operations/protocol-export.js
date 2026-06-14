/**
 * protocol-export — генерация lab-notebook текста из выполненных
 * операций canvas-skeleton.
 *
 * R6-2 (14.05.2026). Биолог нажимает «Протокол» → видит step-by-step
 * текст с реагентами, временами, температурами, прогревами. Может
 * скопировать в Notion / Word / лабораторную тетрадь без ручной
 * перепечатки.
 *
 * Generated lines for each operation kind:
 *   - cut          → restriction step + buffer/temp.
 *   - pcr          → primers + Q5 / Phusion program.
 *   - gibson       → NEBuilder mix + 50°C 15 min.
 *   - golden_gate  → Type IIS + T4 ligase cycling.
 *   - ligate       → T4 ligase + PEG (blunt) / sticky-end variants.
 *   - kld          → PCR around plasmid + KLD mix + DpnI.
 *   - mutagenesis  → fall-back to KLD-style narrative.
 *
 * Warnings sourced from op.origin.{missingOverlap, overlaps, deletionSize}
 * so biologist видит red flags в protocol (нет homology, no-overhang
 * concat, etc).
 *
 * R8-1 (14.05.2026): добавлен strain-compatibility section (dam/dcm
 * methylation considerations) перед reagents.
 */
import { checkStrainCompatibility, recommendStrainsForOps } from '../../../../lib/bio/strain-compatibility';
import { codonScore, findRareCodons } from '../../../../lib/bio/codon-optimize-ecoli';

const ENZYME_BUFFERS = {
  EcoRI: 'EcoRI buffer (NEB) или CutSmart',
  BamHI: 'NEBuffer 3.1 или CutSmart',
  HindIII: 'NEBuffer 2 или CutSmart',
  XhoI: 'CutSmart',
  SalI: 'NEBuffer 3.1',
  NdeI: 'CutSmart',
  NcoI: 'CutSmart',
  SacI: 'CutSmart',
  KpnI: 'CutSmart',
  NotI: 'CutSmart',
  SpeI: 'CutSmart',
  XbaI: 'CutSmart',
  PstI: 'CutSmart',
  SmaI: 'CutSmart (25°C!)',
  BsaI: 'CutSmart / NEBuffer r3.1 (Type IIS)',
  BpiI: 'Tango buffer (Thermo) / G buffer',
  BsmBI: 'NEBuffer r3.1',
  SapI: 'CutSmart',
};

function resolveName(containersById, id) {
  if (!id) return '?';
  const c = containersById[id];
  return c?.name || (typeof id === 'string' ? id.slice(0, 8) : String(id));
}

function stepCut(op, containersById) {
  const tpl = op.params?.templateId || op.inputs?.[0];
  const enzymes = op.params?.enzymes || [];
  const enzList = enzymes.join(' + ');
  const buffer = enzymes.length === 1
    ? (ENZYME_BUFFERS[enzymes[0]] || 'CutSmart')
    : 'CutSmart (double-digest)';
  return {
    title: `Рестрикция ${resolveName(containersById, tpl)} (${enzList})`,
    body: [
      `- Темплейт: ${resolveName(containersById, tpl)}`,
      `- Ферменты: ${enzList}`,
      `- Буфер: ${buffer}`,
      `- Температура: 37°C (SmaI: 25°C)`,
      `- Время: 1 ч, затем heat-inactivate 65°C 20 мин (или 80°C для BamHI).`,
      `- Очистить: QIAquick spin column или gel purification.`,
    ].join('\n'),
  };
}

function stepPCR(op, containersById) {
  const tpl = op.params?.templateId || op.inputs?.[0];
  const primerPair = op.params?.primerPairId;
  const autoDesign = op.params?.autoDesign;
  const outputs = op.outputs || [];
  const designedOligo = outputs
    .map((id) => containersById[id])
    .find((c) => c?.kind === 'oligonucleotide');

  let primerLines = [];
  if (autoDesign && designedOligo?.payload?.sequences) {
    const ss = designedOligo.payload.sequences;
    for (const s of ss) {
      const tm = s.Tm ? `Tm ${s.Tm}°C` : '';
      const gc = s.GC ? `GC ${s.GC}%` : '';
      primerLines.push(`  - ${s.name}: 5'-${s.sequence}-3' (${s.sequence.length} nt, ${[tm, gc].filter(Boolean).join(', ')})`);
    }
  } else if (primerPair) {
    const oligo = containersById[primerPair];
    const ss = oligo?.payload?.sequences || [];
    for (let i = 0; i < ss.length; i += 1) {
      const s = ss[i];
      const tm = s.Tm ? `Tm ${s.Tm}°C` : '';
      primerLines.push(`  - ${s.name || (i === 0 ? 'fwd' : 'rev')}: 5'-${s.sequence}-3' (${s.sequence.length} nt${tm ? ', ' + tm : ''})`);
    }
  } else {
    primerLines.push('  - (праймеры не заданы — design праймеры под template вручную)');
  }
  return {
    title: `PCR ${resolveName(containersById, tpl)}`,
    body: [
      `- Темплейт: ${resolveName(containersById, tpl)}`,
      `- Праймеры:`,
      ...primerLines,
      `- Полимераза: Q5 High-Fidelity (NEB M0491) или Phusion HF (Thermo F530).`,
      `- Реакция (50 мкл): 10 мкл 5× Q5 buffer + 1 мкл 10 mM dNTP + 2.5 мкл fwd 10 µM + 2.5 мкл rev 10 µM + 1 ng template + 0.5 мкл Q5.`,
      `- Программа: 98°C 30 с → [98°C 10 с / annealing Tm−5°C 30 с / 72°C 30 с/kb] × 30 → 72°C 5 мин → 4°C hold.`,
      `- Очистить: PCR purification (QIAquick) или gel purification.`,
    ].join('\n'),
  };
}

function stepGibson(op, containersById) {
  const fragmentIds = op.params?.fragmentIds || op.inputs || [];
  const fragmentNames = fragmentIds.map((id) => resolveName(containersById, id)).join(', ');
  const ori = op.origin || {};
  const warning = ori.missingOverlap > 0
    ? `\n⚠ WARNING: ${ori.missingOverlap} junction'ов без homology overlap (≥15 bp). Реальная сборка не пройдёт без добавления homology arms на праймеры или synthesis insert'ов с overlap.`
    : '';
  return {
    title: `Gibson Assembly (${fragmentIds.length} фрагментов)`,
    body: [
      `- Фрагменты: ${fragmentNames}`,
      `- NEBuilder HiFi DNA Assembly Master Mix (NEB E2621) 2×, или Gibson Master Mix.`,
      `- Соотношение: vector 0.03-0.2 pmol + insert 0.06-0.4 pmol (2:1 insert:vector мол).`,
      `- Реакция (20 мкл): 10 мкл 2× master mix + 0.03-0.2 pmol фрагментов + dH2O.`,
      `- Инкубация: 50°C 15-60 мин (15 мин для 2-3 фрагментов; 60 мин для 4-6).`,
      `- Хранение: −20°C или сразу 2 мкл смеси → трансформация в DH5α / NEB 5-alpha / NEB Stable.${warning}`,
    ].join('\n'),
  };
}

function stepGoldenGate(op, containersById) {
  const fragmentIds = op.params?.fragmentIds || op.inputs || [];
  const fragmentNames = fragmentIds.map((id) => resolveName(containersById, id)).join(', ');
  const enz = op.params?.enzyme || 'BsaI';
  return {
    title: `Golden Gate Assembly (${enz}, ${fragmentIds.length} parts)`,
    body: [
      `- Фрагменты: ${fragmentNames}`,
      `- ${enz} (10-20 U/мкл, NEB) — 1 мкл`,
      `- T4 DNA Ligase (400 U/мкл, NEB M0202) — 0.5 мкл (HC: 1 мкл)`,
      `- T4 DNA Ligase Buffer 10× — 2 мкл (содержит ATP)`,
      `- Фрагменты: по 30-50 нг каждый (эквимолярно).`,
      `- Объём: до 20 мкл dH2O.`,
      `- Программа: [37°C 1 мин → 16°C 1 мин] × 25-30 циклов → 55°C 5 мин (для финальной digestion remaining recognition sites) → 80°C 10 мин (heat-inactivate).`,
      `- 2 мкл → трансформация.`,
    ].join('\n'),
  };
}

function stepLigate(op, containersById) {
  const fragmentIds = op.params?.fragmentIds || op.inputs || [];
  const fragmentNames = fragmentIds.map((id) => resolveName(containersById, id)).join(', ');
  const ends = op.params?.ends || 'blunt';
  // F — an RE-лигирование op carries the chosen restriction enzyme: name it (the
  // digest + ligation) so the protocol matches the biolog's choice, not a blank.
  const enz = op.params?.enzyme;
  const ori = op.origin || {};
  const zeroOverhang = Array.isArray(ori.overlaps) ? ori.overlaps.filter((k) => k === 0).length : 0;
  const stickyWarning = (ends === 'sticky' && zeroOverhang > 0)
    ? `\n⚠ WARNING: ${zeroOverhang} junction'ов без совпадающего overhang'а — концы не лигируются.`
    : '';
  return {
    title: `Лигирование (${enz ? `${enz}, ` : ''}${ends})`,
    body: [
      `- Фрагменты: ${fragmentNames}`,
      ...(enz ? [`- Рестрикция концов: ${enz} (буфер ${ENZYME_BUFFERS[enz] || 'CutSmart'}), затем очистка перед лигированием.`] : []),
      `- T4 DNA Ligase 400 U/мкл (NEB M0202) — 1 мкл`,
      `- T4 Ligase Buffer 10× — 2 мкл`,
      ends === 'blunt'
        ? `- Концы: blunt — добавить 5% PEG 4000 (опционально 50% PEG 4000 = 2 мкл из stock).`
        : `- Концы: sticky-end.`,
      `- Соотношение: insert 3:1 vector мол.`,
      ends === 'blunt'
        ? `- 16°C overnight или 25°C 6-12 ч (blunt — медленная реакция).`
        : `- 16°C overnight (sticky), либо 25°C 1-2 ч (быстрая sticky).`,
      `- Heat-inactivate 65°C 10 мин → трансформация (2 мкл).${stickyWarning}`,
    ].join('\n'),
  };
}

function stepKLD(op, containersById) {
  const tpl = op.params?.templateId || op.inputs?.[0];
  const primerPair = op.params?.primerPairId;
  const ori = op.origin || {};
  const mutDesc = [];
  if (ori.insertionSize > 0) mutDesc.push(`insertion ${ori.insertionSize} bp`);
  if (ori.deletionSize > 0) mutDesc.push(`deletion ${ori.deletionSize} bp`);
  if (mutDesc.length === 0) mutDesc.push('substitution / point mutation');
  const dpniNote = ori.dpniDigest === false
    ? '\n⚠ WARNING: DpnI отключён — высокий background неммутированного template.'
    : '';
  return {
    title: `KLD-мутагенез (${mutDesc.join(', ')})`,
    body: [
      `- Темплейт (circular plasmid, isolated from dam+ E.coli — DH5α / NEB 5-alpha): ${resolveName(containersById, tpl)}`,
      `- Праймер-пара (back-to-back, mutation в 5' tail): ${resolveName(containersById, primerPair)}`,
      `- Шаг 1 — PCR around plasmid: Q5 + back-to-back primers, 25 циклов, extension 30 с/kb.`,
      `- Шаг 2 — KLD reaction (NEB M0554S, Q5 Site-Directed Mutagenesis Kit):`,
      `  - 1 мкл PCR product (≥1 нг)`,
      `  - 5 мкл 2× KLD Reaction Buffer`,
      `  - 1 мкл 10× KLD Enzyme Mix (Kinase + Ligase + DpnI)`,
      `  - dH2O до 10 мкл`,
      `- Инкубация: 25°C 5 мин (room temp).`,
      `- 5 мкл → трансформация в DH5α high-efficiency cells.${dpniNote}`,
    ].join('\n'),
  };
}

function stepMutagenesis(op, containersById) {
  const tpl = op.params?.templateId || op.inputs?.[0];
  const muts = op.params?.mutations || [];
  const mutType = op.params?.mutationType || 'point';
  const mutDesc = muts.map((m) => {
    if (mutType === 'point') return `pos ${m.position}: ${m.from || '?'}→${m.to || '?'}`;
    if (mutType === 'insertion') return `pos ${m.position}: ins '${m.insert || ''}'`;
    if (mutType === 'deletion') return `pos ${m.position}: del ${m.length || 1} bp`;
    return `pos ${m.position}`;
  }).join('; ');
  return {
    title: `Site-directed mutagenesis (${mutType})`,
    body: [
      `- Темплейт: ${resolveName(containersById, tpl)}`,
      `- Мутации: ${mutDesc || '(не задано)'}`,
      `- Рекомендуется через KLD pipeline (NEB Q5 Site-Directed Mutagenesis Kit M0554) с primer-pair encoding mutation в 5' tail.`,
      `- Альтернатива: QuikChange-style (overlapping primers), но требует strand-displacement Pfu polymerase.`,
    ].join('\n'),
  };
}

const STEP_BUILDERS = {
  cut: stepCut,
  pcr: stepPCR,
  gibson: stepGibson,
  golden_gate: stepGoldenGate,
  ligate: stepLigate,
  kld: stepKLD,
  mutagenesis: stepMutagenesis,
};

function buildReagentsBlock(operations, containersById) {
  const enzymes = new Set();
  const primerOligos = new Set();
  for (const op of operations) {
    if (op.kind === 'cut' && Array.isArray(op.params?.enzymes)) {
      for (const e of op.params.enzymes) enzymes.add(e);
    }
    if ((op.kind === 'golden_gate' || op.kind === 'ligate') && op.params?.enzyme) enzymes.add(op.params.enzyme);
    if (op.params?.primerPairId) {
      const oligo = containersById[op.params.primerPairId];
      if (oligo?.kind === 'oligonucleotide') primerOligos.add(oligo.id);
    }
    if (Array.isArray(op.outputs)) {
      for (const oid of op.outputs) {
        const c = containersById[oid];
        if (c?.kind === 'oligonucleotide') primerOligos.add(c.id);
      }
    }
  }
  const lines = [];
  if (enzymes.size > 0) {
    lines.push(`Ферменты:`);
    for (const e of enzymes) {
      lines.push(`- ${e}${ENZYME_BUFFERS[e] ? ` (буфер: ${ENZYME_BUFFERS[e]})` : ''}`);
    }
    lines.push('');
  }
  if (primerOligos.size > 0) {
    lines.push(`Олигонуклеотиды (заказать у Evrogen / Syntol / IDT, scale 25 nmol, deprotection standard):`);
    for (const id of primerOligos) {
      const oligo = containersById[id];
      const seqs = oligo?.payload?.sequences || [];
      lines.push(`- ${oligo?.name || id}:`);
      for (const s of seqs) {
        const parts = [`${s.sequence.length} nt`];
        if (s.Tm) parts.push(`Tm ${s.Tm}°C`);
        if (s.GC) parts.push(`GC ${s.GC}%`);
        lines.push(`  - ${s.name || '?'}: 5'-${s.sequence}-3' (${parts.join(', ')})`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * buildProtocol — entry point.
 *
 * @param {Operation[]} operations  — sorted list (executed first by executedAt).
 * @param {Container[]} containers
 * @returns {{ text: string, steps: { title: string, body: string }[] }}
 */
export function buildProtocol(operations, containers) {
  const containersArr = Array.isArray(containers) ? containers : [];
  const containersById = Object.fromEntries(containersArr.map((c) => [c.id, c]));

  const executed = (operations || [])
    .filter((o) => o && o.status === 'executed' && o.executedAt)
    .sort((a, b) => String(a.executedAt).localeCompare(String(b.executedAt)));

  const lines = [];
  lines.push('# Протокол сборки');
  lines.push(`Дата: ${new Date().toLocaleDateString('ru-RU')}`);
  lines.push(`Операций выполнено: ${executed.length}`);
  lines.push('');

  if (executed.length === 0) {
    lines.push('_Нет выполненных операций. Запустите операции с Execute-кнопкой._');
    return { text: lines.join('\n'), steps: [] };
  }

  const steps = [];
  for (let i = 0; i < executed.length; i += 1) {
    const op = executed[i];
    const builder = STEP_BUILDERS[op.kind] || ((o) => ({
      title: `Операция ${o.kind}`,
      body: `(нет шаблона для kind="${o.kind}")`,
    }));
    const step = builder(op, containersById);
    steps.push(step);
    lines.push(`## Шаг ${i + 1}. ${step.title}`);
    if (step.body) lines.push(step.body);
    lines.push('');
  }

  // R8-1: strain considerations.
  const strainBlock = buildStrainBlock(executed);
  if (strainBlock) {
    lines.push('---');
    lines.push('## E.coli strain');
    lines.push(strainBlock);
    lines.push('');
  }

  // R8-2: codon analysis для CDS annotations в output containers.
  const codonBlock = buildCodonBlock(executed, containersById);
  if (codonBlock) {
    lines.push('---');
    lines.push('## Codon usage (E.coli K-12)');
    lines.push(codonBlock);
    lines.push('');
  }

  const reagentsBlock = buildReagentsBlock(executed, containersById);
  if (reagentsBlock) {
    lines.push('---');
    lines.push('## Реагенты');
    lines.push(reagentsBlock);
  }

  return { text: lines.join('\n'), steps };
}

function buildCodonBlock(operations, containersById) {
  // Collect all CDS annotations from output containers of executed ops.
  // CDS detection: annotation.type === 'CDS' OR annotation.kind === 'CDS'
  // OR annotation.feature === 'CDS' OR annotation.name содержит 'CDS'.
  const cdsList = [];
  const seenContainers = new Set();
  for (const op of operations) {
    const outputIds = Array.isArray(op.outputs) ? op.outputs : [];
    for (const oid of outputIds) {
      if (seenContainers.has(oid)) continue;
      seenContainers.add(oid);
      const c = containersById[oid];
      if (!c || !c.sequence || !Array.isArray(c.annotations)) continue;
      for (const ann of c.annotations) {
        if (!isCDSAnnotation(ann)) continue;
        if (typeof ann.start !== 'number' || typeof ann.end !== 'number') continue;
        const start = Math.max(0, ann.start);
        const end = Math.min(c.sequence.length, ann.end);
        if (end - start < 6) continue; // too short
        const cdsSeq = c.sequence.slice(start, end);
        cdsList.push({
          containerName: c.name || c.id?.slice?.(0, 8) || '?',
          annotationName: ann.name || 'CDS',
          start,
          end,
          length: end - start,
          sequence: cdsSeq,
        });
      }
    }
  }
  if (cdsList.length === 0) return '';
  const lines = [];
  for (const cds of cdsList) {
    const score = codonScore(cds.sequence);
    const rare = findRareCodons(cds.sequence);
    lines.push(`### ${cds.containerName} — ${cds.annotationName} (${cds.length} bp, codons ${score.totalCodons})`);
    lines.push(`- Preferred-codon match: ${score.percent}% (${score.preferredCount}/${score.totalCodons}).`);
    if (rare.length > 0 && rare.length <= 10) {
      lines.push(`- Rare codons (consider optimization):`);
      for (const r of rare) {
        lines.push(`  - pos ${r.position}: ${r.codon} (${r.aa}) → ${r.preferred}`);
      }
    } else if (rare.length > 10) {
      lines.push(`- ${rare.length} rare codons (расширенный список — рекомендуется codon optimization для E.coli expression).`);
    } else {
      lines.push(`- ✓ Все codons E.coli-preferred.`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function isCDSAnnotation(ann) {
  if (!ann) return false;
  const candidates = [ann.type, ann.kind, ann.feature, ann.featureType];
  for (const c of candidates) {
    if (typeof c === 'string' && c.toUpperCase() === 'CDS') return true;
  }
  if (typeof ann.name === 'string' && /\bCDS\b/i.test(ann.name)) return true;
  return false;
}

function buildStrainBlock(operations) {
  const recommendations = recommendStrainsForOps(operations);
  const warnings = checkStrainCompatibility(operations);
  if (recommendations.length === 0 && warnings.length === 0) return '';
  const lines = [];
  for (const rec of recommendations) {
    const prefix = rec.severity === 'high' ? '⚠⚠ '
      : rec.severity === 'medium' ? '⚠ '
      : '';
    lines.push(`${prefix}${rec.message}`);
  }
  // List specific enzyme warnings.
  const enzymeWarnings = warnings.filter((w) => w.kind !== 'dam-required');
  if (enzymeWarnings.length > 0) {
    lines.push('');
    lines.push('Methylation-sensitive enzymes detected:');
    for (const w of enzymeWarnings) {
      lines.push(`- ${w.enzyme}: ${w.message}`);
    }
  }
  return lines.join('\n');
}
