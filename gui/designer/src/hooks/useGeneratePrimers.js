/**
 * useGeneratePrimers — async primer generation via API.
 * Extracts the 120-line generate() function from App.jsx.
 */
import { useStore, useFragments, useJunctions, pushUndo } from '../store';
import { designPrimers } from '../api';
import { PCR_MIXES, ASSEMBLY_PROTOCOLS as ASM_PROTOCOLS } from '../protocol-data';
import { findAllMatches, addPrimersToRegistry } from '../primer-reuse';
import { pcrProductSize } from '../validate';
import { planAssemblyStages } from '../assembly-utils';

export function useGeneratePrimers() {
  const fragments     = useFragments();
  const junctions     = useJunctions();
  const polymerase    = useStore(s => s.polymerase);
  const primerPrefix  = useStore(s => s.primerPrefix);
  const maxFinalParts = useStore(s => s.maxFinalParts);
  const updateActive  = useStore(s => s.updateActive);
  const setLoading    = useStore(s => s.setLoading);
  const getActive     = useStore(s => s.getActive);

  const generate = async () => {
    if (fragments.length < 2) return;
    pushUndo();
    const active = getActive();
    if (!active) return;
    const assemblyType = active.assemblyType || 'overlap';
    const protocol = active.protocol || 'overlap_pcr';
    const circular = active.circular || false;
    const totalBp = fragments.reduce((s, f) => s + (f.sequence || '').length, 0);

    // PCR sizes
    const pcrSizes = fragments.map((f, i) => {
      const leftJ = i > 0 ? junctions[i - 1] : (circular ? junctions[junctions.length - 1] : null);
      const rightJ = i < junctions.length ? junctions[i] : (circular ? junctions[0] : null);
      return pcrProductSize(f, leftJ, rightJ);
    });

    setLoading(true);
    try {
      const data = await designPrimers(
        fragments.map(f => ({ name: f.name, sequence: f.sequence, needsAmplification: f.needsAmplification })),
        junctions, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap_pcr', circular, 60,
      );

      const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
      let pidx = 1;
      let renamedPrimers = (data.primers || []).map(p => ({
        ...p,
        name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_${p.name}`,
        tmAdjusted: Math.round((p.tmBinding || 60) + tmAdj),
      }));

      // Deduplicate identical primers for overlap (not GG — tails differ)
      if (assemblyType !== 'golden_gate') {
        const seen = new Map();
        renamedPrimers = renamedPrimers.filter(p => {
          const key = `${p.direction}_${(p.bindingSequence || p.sequence || '').toUpperCase()}`;
          if (seen.has(key)) return false;
          seen.set(key, p.name);
          return true;
        });
      }

      // Update junctions with calculated overlap data
      const updatedJunctions = junctions.map((j, i) => ({
        ...j,
        overlapSequence: data.junctions?.[i]?.overlapSequence || j.overlapSequence,
        overlapTm: data.junctions?.[i]?.overlapTm || j.overlapTm,
        overlapGc: data.junctions?.[i]?.overlapGc || j.overlapGc,
      }));

      // Build protocol steps
      const pSteps = buildProtocolSteps(
        fragments, updatedJunctions, renamedPrimers, pcrSizes,
        polymerase, protocol, assemblyType, circular, totalBp, maxFinalParts
      );

      const matches = findAllMatches(renamedPrimers);
      addPrimersToRegistry(renamedPrimers);

      updateActive({
        primers: renamedPrimers, apiWarnings: data.warnings || [],
        orderSheet: data.orderSheet || '', primerMatches: matches,
        junctions: updatedJunctions, calculated: true, protocolSteps: pSteps,
      });
    } catch (e) {
      updateActive({ apiWarnings: [`API error: ${e.message}`] });
    }
    setLoading(false);
  };

  return generate;
}

/** Build protocol steps from junction types. */
function buildProtocolSteps(fragments, junctions, primers, pcrSizes, polymerase, protocol, assemblyType, circular, totalBp, maxFinalParts) {
  const pSteps = [];
  const mix = PCR_MIXES[polymerase] || PCR_MIXES.phusion;

  // PCR steps
  fragments.forEach((frag, fi) => {
    if (!frag.needsAmplification) return;
    const fwd = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name));
    const rev = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name));
    const sz = pcrSizes[fi] || frag.length;
    pSteps.push({
      id: `pcr_${fi}`, type: 'pcr', title: `ПЦР ${frag.name}`, subtitle: `${sz} п.н.`,
      template: frag.name, fwdPrimer: fwd?.name, revPrimer: rev?.name,
      annealTemp: Math.round(Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60)),
      expectedSize: sz, extensionTime: Math.ceil(sz / 1000) * mix.extRate, mix,
      statuses: [{ label: 'ПЦР', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }],
    });
  });

  // Junction-type-aware assembly stages
  const jTypes = junctions.map(j => j.type || 'overlap');
  const hasOverlap = jTypes.includes('overlap');
  const hasGG = jTypes.includes('golden_gate');
  const hasKLD = jTypes.includes('kld');
  const hasRE = jTypes.includes('re_ligation') || jTypes.includes('sticky_end');

  if (hasOverlap) {
    const groups = []; let cur = [0];
    for (let gi = 0; gi < junctions.length; gi++) {
      if ((junctions[gi].type || 'overlap') === 'overlap') cur.push((gi + 1) % fragments.length);
      else { groups.push([...cur]); cur = [(gi + 1) % fragments.length]; }
    }
    groups.push([...cur]);
    groups.filter(g => g.length > 1).forEach((group, gi) => {
      const names = group.map(i => fragments[i]?.name || '?');
      if (group.length <= 3 || maxFinalParts === group.length) {
        pSteps.push({ id: `overlap_${gi}`, type: 'assembly',
          title: `Overlap-сборка${groups.filter(g2 => g2.length > 1).length > 1 ? ` (группа ${gi + 1})` : ''}`,
          subtitle: `${names.length} фрагментов → 1 продукт`,
          protocol: ASM_PROTOCOLS.overlap_pcr, expectedSize: null, fragments: names,
          statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }] });
      } else {
        planAssemblyStages(group.map(i => fragments[i]), assemblyType, maxFinalParts).forEach((stage, si) => {
          const stageNames = stage.groups.map(g => g.map(i => group[i] != null ? (fragments[group[i]]?.name || '?') : '?').join('+'));
          pSteps.push({ id: `overlap_${gi}_r${si}`, type: 'assembly',
            title: `Overlap-сборка (раунд ${stage.round})`, subtitle: `→ ${stage.groups.length} продуктов`,
            protocol: ASM_PROTOCOLS.overlap_pcr, expectedSize: null, fragments: stageNames,
            statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }] });
        });
      }
    });
  }
  if (hasGG) {
    const ggJ = junctions.filter(j => j.type === 'golden_gate');
    pSteps.push({ id: 'gg_assembly', type: 'assembly', title: 'Golden Gate сборка',
      subtitle: `${ggJ[0]?.enzyme || 'BsaI'} · ${ggJ.length} стыков · (37°C↔16°C) ×30`,
      protocol: ASM_PROTOCOLS.golden_gate || ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp,
      fragments: ggJ.map(j => j.overhang || '----'),
      statuses: [{ label: 'GG реакция', done: false }, { label: 'Гель', done: false }] });
  }
  if (hasRE) {
    const reJ = junctions.filter(j => j.type === 're_ligation' || j.type === 'sticky_end');
    pSteps.push({ id: 're_assembly', type: 'assembly', title: 'Рестрикция + лигирование',
      subtitle: `${[...new Set(reJ.map(j => j.reEnzyme || j.enzyme || '?'))].join(', ')} · T4 Ligase`,
      protocol: ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp, fragments: [],
      statuses: [{ label: 'Рестрикция', done: false }, { label: 'Лигирование', done: false }, { label: 'Гель', done: false }] });
  }
  if (hasKLD) {
    pSteps.push({ id: 'kld_assembly', type: 'assembly', title: 'KLD (Kinase-Ligase-DpnI)',
      subtitle: 'T4 PNK + T4 Ligase + DpnI · 25°C 30мин', protocol: ASM_PROTOCOLS.overlap_pcr,
      expectedSize: totalBp, fragments: [],
      statuses: [{ label: 'KLD', done: false }, { label: 'Гель', done: false }] });
  }
  if (!hasOverlap && !hasGG && !hasKLD && !hasRE) {
    pSteps.push({ id: 'assembly', type: 'assembly', title: 'Сборка',
      subtitle: (ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr).name,
      protocol: ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp,
      fragments: fragments.map(f => f.name),
      statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }] });
  }

  // Post-assembly
  pSteps.push({ id: 'transform', type: 'transform', title: 'Трансформация', statuses: [{ label: 'Трансф.', done: false }, { label: 'Колонии', done: false }] });
  pSteps.push({ id: 'screening', type: 'screening', title: 'Colony PCR', expectedSize: totalBp, statuses: [{ label: 'Colony PCR', done: false }, { label: 'Отобраны', done: false }] });
  pSteps.push({ id: 'sequencing', type: 'sequencing', title: 'Секвенирование', statuses: [{ label: 'Отправлено', done: false }, { label: 'Подтв.', done: false }] });

  return pSteps;
}
