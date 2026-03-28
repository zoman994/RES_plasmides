/**
 * useFragmentHandlers — fragment editing, splitting, mutagenesis, variant creation.
 * Extracts ~200 lines of handler logic from App.jsx.
 */
import { useStore, useFragments, useJunctions, usePrimers } from '../store';
import { adjustDomains, buildPlainJunctions } from '../assembly-utils';
import { designInlineKLDPrimers } from '../mutagenesis';
import { PCR_MIXES } from '../protocol-data';
import { addToInventory } from '../inventory';
import { getFragColor, isMarker } from '../theme';

export function useFragmentHandlers() {
  const fragments    = useFragments();
  const junctions    = useJunctions();
  const primers      = usePrimers();
  const parts        = useStore(s => s.parts);
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
  const handleFragmentSplit = (result) => {
    const idx = splitTarget;
    if (idx === null) return;
    const active = getActive();
    if (!active) return;
    const assemblyType = active.assemblyType || 'overlap';
    const circular = active.circular || false;

    const nf = [...fragments];
    const frag = nf[idx];
    const cutAA = result.cutPosition ? Math.floor(result.cutPosition / 3) : 0;

    if (result.action === 'split') {
      const domSplit = adjustDomains(frag.domains, cutAA, 'split');
      const p1 = { id: `f${Date.now()}`, name: result.part1Name, type: frag.type,
        sequence: result.part1DNA, length: result.part1DNA.length, strand: 1, needsAmplification: true,
        domains: domSplit.part1 || [] };
      nf[idx] = { ...frag, name: result.part2Name, sequence: result.part2DNA, length: result.part2DNA.length,
        domains: domSplit.part2 || [] };
      nf.splice(idx, 0, p1);
    } else if (result.action === 'remove_part1') {
      nf[idx] = { ...frag, sequence: result.sequence, length: result.sequence.length,
        domains: adjustDomains(frag.domains, cutAA, 'remove_part1') };
    } else if (result.action === 'remove_part2') {
      nf[idx] = { ...frag, sequence: result.sequence, length: result.sequence.length,
        domains: adjustDomains(frag.domains, cutAA, 'remove_part2') };
    } else if (result.action === 'replace_part1') {
      const rep = { id: `f${Date.now()}`, name: result.replacementName, type: result.replacementType || frag.type,
        sequence: result.replacementSeq, length: result.replacementSeq.length, strand: 1, needsAmplification: true };
      nf[idx] = { ...frag, name: result.part2Name, sequence: result.part2DNA, length: result.part2DNA.length,
        domains: adjustDomains(frag.domains, cutAA, 'remove_part1') };
      nf.splice(idx, 0, rep);
    }
    updateActive({ fragments: nf, junctions: buildPlainJunctions(nf, assemblyType, circular), calculated: false });
    setSplitTarget(null);
  };

  /** Save edited fragment, create variant in parts library if mutations present. */
  const handleSaveFragment = (updated) => {
    if (editTarget === null) return;
    const original = fragments[editTarget];
    const hasMutations = updated.mutations?.length > 0 && updated.mutations !== original.mutations;

    updateActive({
      fragments: fragments.map((f, i) => i === editTarget ? updated : f),
      calculated: false, primers: [],
    });

    if (hasMutations) {
      // Find root parent Part
      const findRoot = (name, id) => {
        let p = parts.find(x => x.id === id) || parts.find(x => x.id === original.partId);
        if (p?.parentId) p = parts.find(x => x.id === p.parentId) || p;
        if (!p) { const baseName = name.replace(/\(.*\)$/, '').trim(); p = parts.find(x => x.name === baseName && !x.parentId); }
        if (!p) p = parts.find(x => x.name === name);
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
          mutations: updated.mutations, testResults: [], domains: updated.domains,
          source: 'mutagenesis', createdAt: new Date().toISOString(),
        };
        updatePart(rootPart.id, { children: [...(rootPart.children || []), variantId] });
        addPart(variant);
        updateActive({
          fragments: fragments.map((f, i) => i === editTarget ? { ...updated, partId: variantId } : f),
          calculated: false, primers: [],
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
        updateActive({ fragments: fragments.map((f, i) => i === editTarget ? updated : f), primers: kldPrimers, calculated: true, protocolSteps: kldSteps });
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
        calculated: false, primers: [],
      });
    }
  };

  const handleSwapVariant = (fragIndex, variant) => {
    updateActive({
      fragments: fragments.map((f, i) => i === fragIndex ? {
        ...f, id: variant.id, name: variant.name, sequence: variant.sequence,
        length: variant.length, domains: variant.domains, parentId: variant.parentId,
        modification: variant.modification, testResults: variant.testResults, customColor: variant.customColor,
      } : f),
      calculated: false, primers: [],
    });
  };

  const handleMutagenesis = (result) => {
    updateActive({
      fragments: result.fragments.map(f => ({ ...f, id: `mf${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, isMutagenesis: true })),
      junctions: result.junctions, calculated: false, primers: [],
    });
  };

  const handleReusePrimer = (primerName, existingPrimer) => {
    updateActive({ primers: primers.map(p => p.name === primerName ? { ...p, reused: true, reusedFrom: existingPrimer.name } : p) });
  };

  /** Mark assembly as complete, create merged product. */
  const completeAssembly = () => {
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
    const mergedProduct = {
      id: `product_${Date.now()}`, name: active.name,
      type: circular ? 'plasmid' : 'pcr_product', sequence: fullSeq, length: totalLen,
      strand: 1, needsAmplification: false, subFragments,
      sourceType: 'assembly', sourceAssemblyId: active.id,
      components: fragments.map(f => f.name), completedAt: new Date().toISOString(),
    };
    addToInventory({ ...mergedProduct, verified: circular });
    if (!parts.some(p => p.name === active.name && p.sourceAssemblyId === active.id)) {
      addPart(mergedProduct);
    }
    updateActive({
      completed: true, product: mergedProduct,
      originalFragments: fragments, originalJunctions: junctions,
      fragments: [mergedProduct], junctions: [],
    });
    incrementInventoryVersion();
  };

  const clearAssembly = () => {
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
