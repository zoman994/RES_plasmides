/**
 * useFragmentHandlers — fragment editing, splitting, mutagenesis, variant creation.
 * Extracts ~200 lines of handler logic from App.jsx.
 */
import { useStore, useFragments, useJunctions, usePrimers, pushUndo } from '../store';
import { buildPlainJunctions } from '../assembly-utils';
import { designInlineKLDPrimers } from '../mutagenesis';
import { PCR_MIXES } from '../protocol-data';
import { addToInventory } from '../inventory';
import { getFragColor, isMarker } from '../theme';
import { formatProductName } from '../parts-grouping';

export function useFragmentHandlers() {
  const fragments    = useFragments();
  const junctions    = useJunctions();
  const primers      = usePrimers();
  const parts        = useStore(s => s.parts);
  const projectName  = useStore(s => s.projectName);
  const polymerase   = useStore(s => s.polymerase);
  const primerPrefix = useStore(s => s.primerPrefix);
  const editTarget   = useStore(s => s.editTarget);
  const splitTarget  = useStore(s => s.splitTarget);
  const updateActive = useStore(s => s.updateActive);
  const getActive    = useStore(s => s.getActive);
  const addFragment  = useStore(s => s.addFragment);
  const addPart      = useStore(s => s.addPart);
  const updatePart   = useStore(s => s.updatePart);
  const setEditTarget  = useStore(s => s.setEditTarget);
  const setSplitTarget = useStore(s => s.setSplitTarget);
  const incrementInventoryVersion = useStore(s => s.incrementInventoryVersion);

  /** Handle fragment split / trim / replace results. */
  const handleFragmentSplit = (result) => { pushUndo();
    const idx = splitTarget;
    if (idx === null) return;
    const active = getActive();
    if (!active) return;
    const assemblyType = active.assemblyType || 'overlap';
    const circular = active.circular || false;

    const nf = [...fragments];
    const frag = nf[idx];
    if (result.action === 'split') {
      const cutBP = result.cutPosition;

      // Split annotations between two parts
      const parentAnns = frag.annotations || [];
      const anns1 = [], anns2 = [];
      for (const a of parentAnns) {
        if (a.end <= cutBP) {
          anns1.push({ ...a });
        } else if (a.start >= cutBP) {
          anns2.push({ ...a, start: a.start - cutBP, end: a.end - cutBP });
        } else {
          // Annotation spans the cut — clone to both sides, trimmed
          anns1.push({ ...a, end: cutBP, trimmed: true });
          anns2.push({ ...a, start: 0, end: a.end - cutBP, trimmed: true });
        }
      }

      const p1 = { id: `f${Date.now()}`, name: result.part1Name, type: frag.type,
        sequence: result.part1DNA, length: result.part1DNA.length, strand: 1, needsAmplification: true,
        annotations: anns1 };
      nf[idx] = { ...frag, name: result.part2Name, sequence: result.part2DNA, length: result.part2DNA.length,
        annotations: anns2 };
      nf.splice(idx, 0, p1);
    } else if (result.action === 'remove_part1') {
      nf[idx] = { ...frag, sequence: result.sequence, length: result.sequence.length };
    } else if (result.action === 'remove_part2') {
      nf[idx] = { ...frag, sequence: result.sequence, length: result.sequence.length };
    } else if (result.action === 'replace_part1') {
      const cutBP = result.cutPosition;
      const anns2 = (frag.annotations || [])
        .filter(a => a.end > cutBP)
        .map(a => ({ ...a, start: Math.max(0, a.start - cutBP), end: a.end - cutBP }));

      const rep = { id: `f${Date.now()}`, name: result.replacementName, type: result.replacementType || frag.type,
        sequence: result.replacementSeq, length: result.replacementSeq.length, strand: 1, needsAmplification: true };
      nf[idx] = { ...frag, name: result.part2Name, sequence: result.part2DNA, length: result.part2DNA.length,
        annotations: anns2 };
      nf.splice(idx, 0, rep);
    } else if (result.action === 'split_for_insert') {
      const parentAnns = frag.annotations || [];

      // 5' flank annotations
      const flank5Start = result.cutStart - result.flank5DNA.length;
      const anns5 = parentAnns
        .filter(a => a.start >= flank5Start && a.end <= result.cutStart)
        .map(a => ({ ...a, start: a.start - flank5Start, end: a.end - flank5Start }));

      // 3' flank annotations
      const anns3 = parentAnns
        .filter(a => a.start >= result.cutEnd && a.end <= result.cutEnd + result.flank3DNA.length)
        .map(a => ({ ...a, start: a.start - result.cutEnd, end: a.end - result.cutEnd }));

      const flank5 = {
        id: `f${Date.now()}_5f`, name: result.flank5Name, type: 'homology_arm',
        sequence: result.flank5DNA, length: result.flank5DNA.length,
        strand: 1, needsAmplification: true, annotations: anns5,
      };
      const flank3 = {
        id: `f${Date.now()}_3f`, name: result.flank3Name, type: 'homology_arm',
        sequence: result.flank3DNA, length: result.flank3DNA.length,
        strand: 1, needsAmplification: true, annotations: anns3,
      };
      nf.splice(idx, 1, flank5, flank3);
    }
    updateActive({ fragments: nf, junctions: buildPlainJunctions(nf, assemblyType, circular), calculated: false });
    setSplitTarget(null);
  };

  /** Save edited fragment, create variant in parts library if mutations present. */
  const handleSaveFragment = (updated) => {
    if (editTarget === null) return;
    pushUndo();
    const original = fragments[editTarget];
    const hasMutations = updated.mutations?.length > 0 && updated.mutations !== original.mutations;

    updateActive({
      fragments: fragments.map((f, i) => i === editTarget ? updated : f),
      calculated: false,
    });

    if (hasMutations) {
      // Find root parent Part
      const findRoot = (_name, id) => {
        let p = parts.find(x => x.id === id) || parts.find(x => x.id === original.partId);
        // Traverse parentId chain to the root
        while (p?.parentId) {
          const parent = parts.find(x => x.id === p.parentId);
          if (!parent) break;
          p = parent;
        }
        return p;
      };
      const rootPart = findRoot(original.name, original.id);
      if (rootPart) {
        const variantId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newMuts = updated.mutations.filter(m => !(original.mutations || []).some(om => om.label === m.label));
        const variant = {
          id: variantId, name: updated.name, type: rootPart.type,
          sequence: updated.sequence, length: updated.length, organism: rootPart.organism,
          parentId: rootPart.id, modification: { type: 'mutation', description: newMuts.map(m => m.label).join(', ') },
          mutations: updated.mutations, testResults: [],
          source: 'mutagenesis', createdAt: new Date().toISOString(),
        };
        updatePart(rootPart.id, { children: [...(rootPart.children || []), variantId] });
        addPart(variant);
        updateActive({
          fragments: fragments.map((f, i) => i === editTarget ? { ...updated, partId: variantId } : f),
          calculated: false,
        });
      }

      // Auto-design KLD primers
      const lastMut = updated.mutations[updated.mutations.length - 1];
      if (lastMut?.codonStart != null || lastMut?.label) {
        const mutSite = lastMut.codonStart ?? ((parseInt(lastMut.label?.match(/\d+/)?.[0] || '1') - 1) * 3);
        const kldP = designInlineKLDPrimers(updated.sequence, mutSite, 60);
        let pidx = 1;
        const kldPrimers = [
          { name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_mut_fwd_${original.name}`,
            sequence: kldP.forward.sequence, bindingSequence: kldP.forward.sequence, tailSequence: '',
            tmBinding: kldP.forward.tm, direction: 'forward', isMutagenesis: true, mutation: lastMut.label },
          { name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_mut_rev_${original.name}`,
            sequence: kldP.reverse.sequence, bindingSequence: kldP.reverse.sequence, tailSequence: '',
            tmBinding: kldP.reverse.tm, direction: 'reverse', isMutagenesis: true, mutation: lastMut.label },
        ];
        const kldSteps = [
          { id: 'kld_pcr', type: 'pcr', title: `Обратная ПЦР ${updated.name}`, subtitle: `${updated.length} п.н.`,
            template: original.name, fwdPrimer: kldPrimers[0].name, revPrimer: kldPrimers[1].name,
            annealTemp: Math.round(Math.min(kldP.forward.tm, kldP.reverse.tm)),
            expectedSize: updated.length, extensionTime: Math.ceil(updated.length / 1000) * 30,
            mix: PCR_MIXES[polymerase], statuses: [{ label: 'ПЦР', done: false }, { label: 'Гель', done: false }] },
          { id: 'kld_asm', type: 'assembly', title: 'KLD реакция', subtitle: '25°C 30мин', statuses: [{ label: 'KLD', done: false }] },
          { id: 'transform', type: 'transform', title: 'Трансформация', statuses: [{ label: 'Трансф.', done: false }, { label: 'Колонии', done: false }] },
          { id: 'screening', type: 'screening', title: 'Colony PCR', expectedSize: updated.length, statuses: [{ label: 'Colony PCR', done: false }] },
          { id: 'sequencing', type: 'sequencing', title: 'Секвенирование', statuses: [{ label: 'Отправлено', done: false }, { label: 'Подтв.', done: false }] },
        ];
        const existingNonMut = (getActive()?.primers || []).filter(p => !p.isMutagenesis);
        updateActive({ fragments: fragments.map((f, i) => i === editTarget ? updated : f), primers: [...existingNonMut, ...kldPrimers], calculated: true, protocolSteps: kldSteps });
      }
    }
    setEditTarget(null);
  };

  const handleSaveAsVariant = (variantData) => {
    const variant = { ...variantData, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    addPart(variant);
    if (editTarget !== null) {
      updateActive({
        fragments: fragments.map((f, i) => i === editTarget ? { ...f, ...variant, strand: f.strand, needsAmplification: f.needsAmplification } : f),
        calculated: false,
      });
    }
  };

  const handleSwapVariant = (fragIndex, variant) => {
    updateActive({
      fragments: fragments.map((f, i) => i === fragIndex ? {
        ...f, id: variant.id, name: variant.name, sequence: variant.sequence,
        length: variant.length, parentId: variant.parentId,
        modification: variant.modification, testResults: variant.testResults, customColor: variant.customColor,
      } : f),
      calculated: false,
    });
  };

  const handleMutagenesis = (result) => {
    updateActive({
      fragments: result.fragments.map(f => ({ ...f, id: `mf${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, isMutagenesis: true })),
      junctions: result.junctions, calculated: false,
    });
  };

  const handleReusePrimer = (primerName, existingPrimer) => {
    updateActive({ primers: primers.map(p => p.name === primerName ? { ...p, reused: true, reusedFrom: existingPrimer.name } : p) });
  };

  /** Mark assembly as complete, create merged product. */
  const completeAssembly = () => { pushUndo();
    const active = getActive();
    if (!active) return;
    const circular = active.circular || false;
    const fullSeq = fragments.map(f => f.sequence || '').join('');
    const totalLen = fullSeq.length;
    const subFragments = fragments.map((f, i) => ({
      name: f.name, type: f.type, length: f.length,
      color: isMarker(f.name) ? '#F0E442' : getFragColor(f.type, i),
      pct: (f.length / totalLen) * 100,
    }));
    // Merge annotations from all fragments with offset coordinates
    const mergedAnnotations = [];
    let offset = 0;
    for (const frag of fragments) {
      for (const ann of (frag.annotations || [])) {
        mergedAnnotations.push({
          ...ann, start: ann.start + offset, end: ann.end + offset,
          sourceFragment: frag.name,
        });
      }
      offset += (frag.sequence || '').length;
    }
    const productName = formatProductName(projectName || 'Project', active.name);
    const mergedProduct = {
      id: `product_${Date.now()}`, name: productName,
      type: circular ? 'plasmid' : 'pcr_product', sequence: fullSeq, length: totalLen,
      strand: 1, needsAmplification: false, subFragments,
      assemblyMethod: (() => {
        const asmType = active.assemblyType || 'overlap';
        if (asmType === 'golden_gate') return 'golden_gate';
        if (asmType === 'kld') return 'kld';
        if (asmType === 're_ligation') return 're_ligation';
        const jTypes = (active.junctions || []).map(j => j.type || 'overlap');
        if (jTypes.every(t => t === 'ligation')) return 'restriction_cloning';
        if (jTypes.some(t => t === 'ligation' || t === 're_ligation')) return 're_ligation';
        return circular ? 'gibson' : 'overlap_pcr';
      })(),
      protocol: active.protocolSteps?.length > 0 ? 'complete' : 'manual',
      annotations: mergedAnnotations,
      topology: circular ? 'circular' : 'linear',
      sourceType: 'assembly', sourceAssemblyId: active.id,
      components: fragments.map(f => f.name), completedAt: new Date().toISOString(),
    };
    addToInventory({ ...mergedProduct, verified: circular });
    if (!parts.some(p => p.name === productName && p.sourceAssemblyId === active.id)) {
      addPart(mergedProduct);
    }
    updateActive({
      product: mergedProduct,
      originalFragments: fragments, originalJunctions: junctions,
      fragments: [mergedProduct], junctions: [],
      calculated: false,
    });
    incrementInventoryVersion();
  };

  const clearAssembly = () => { pushUndo();
    updateActive({ fragments: [], junctions: [], primers: [], apiWarnings: [], orderSheet: '',
      calculated: false, protocolSteps: [], completed: false, product: null });
  };

  const addCustomFragment = (fragData) => {
    addFragment({
      name: fragData.name, type: fragData.type || 'misc_feature',
      sequence: fragData.sequence || '', length: fragData.length || (fragData.sequence || '').length,
      strand: fragData.strand || 1, needsAmplification: fragData.needsAmplification ?? true,
      sourceType: fragData.sourceType || 'sequence', subParts: fragData.subParts,
    });
  };

  return {
    handleFragmentSplit, handleSaveFragment, handleSaveAsVariant,
    handleSwapVariant, handleMutagenesis, handleReusePrimer,
    completeAssembly, clearAssembly, addCustomFragment,
  };
}
