/**
 * useFragmentHandlers — fragment editing, splitting, mutagenesis, variant creation.
 * Extracts ~200 lines of handler logic from App.jsx.
 */
import { useStore, useFragments, useJunctions, usePrimers, pushUndo } from '../store';
import { buildPlainJunctions } from '../assembly-utils';
import { computeMutagenesisStrategy } from '../mutagenesis';
import { buildMutagenesisPayload } from '../lib/mutagenesis-payload';
import { trimAnnotationsForSubFragment } from '../lib/split-annotations';
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

  /**
   * Save edited fragment (bookkeeping only).
   *
   * Sprint X-fix K4: mutation-path removed. Mutagenesis is now driven through
   * applyMutationGit (on "Применить мутагенез") + handleCreateMutagenesisAssembly
   * (on "🧬 Создать сборку"). Any `updated.mutations` passed through this
   * handler is silently ignored — the caller should have routed through the
   * Git reducer instead. See Sprint X-fix §4 decision 7.
   */
  const handleSaveFragment = (updated) => {
    if (editTarget === null) return;
    pushUndo();
    updateActive({
      fragments: fragments.map((f, i) => i === editTarget ? updated : f),
      calculated: false,
    });
    setEditTarget(null);
  };

  const handleSaveAsVariant = (variantData) => {
    const variant = {
      ...variantData,
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceCommits: variantData.sourceCommits,
    };
    addPart(variant);
    if (editTarget !== null) {
      updateActive({
        fragments: fragments.map((f, i) => i === editTarget ? { ...f, ...variant, strand: f.strand, needsAmplification: f.needsAmplification } : f),
        calculated: false,
      });
    }
  };

  // Sprint X-fix K2: translate a Plasmid-Git commit into the shape
  // computeMutagenesisStrategy expects.
  const commitToStrategyMut = (commit) => {
    const pos = commit.parentPos;
    if (commit.type === 'substitution') {
      return { type: 'substitution', dnaPosition: pos, newCodon: commit.payload?.newCodon, label: commit.label };
    }
    if (commit.type === 'deletion') {
      return { type: 'deletion', dnaPosition: pos, deleteLength: commit.payload?.deleteLength || 1, label: commit.label };
    }
    if (commit.type === 'insertion') {
      return { type: 'insertion', dnaPosition: pos, insertSequence: commit.payload?.insertSequence || '', label: commit.label };
    }
    return { type: commit.type, dnaPosition: pos, label: commit.label };
  };

  // Sprint X-fix K2: explicit "create mutagenesis assembly" action — driven by
  // applied commits accumulated via applyMutationGit. Replaces the split-path
  // removed from handleSaveFragment (Sprint X-fix K4).
  const handleCreateMutagenesisAssembly = (fragIndex) => {
    const active = getActive();
    if (!active) return;
    const f = fragments[fragIndex];
    if (!f || !f.baseSnapshot || !Array.isArray(f.commits)) return;
    const appliedCommits = f.commits.filter(c => c.applied !== false);
    if (appliedCommits.length === 0) return;
    pushUndo();

    const normMuts = appliedCommits.map(commitToStrategyMut);
    const templateSeq = f.baseSnapshot.sequence;
    const fragmentContext = {
      topology: f.topology === 'circular' || f.topology === 'linear'
        ? f.topology : (active.circular ? 'circular' : 'linear'),
      isStandalone: fragments.length === 1,
      length: templateSeq.length,
    };
    const result = computeMutagenesisStrategy(templateSeq, normMuts, {
      featureStart: 0, featureEnd: templateSeq.length, fragmentContext,
    });
    const baseCtx = {
      primerPrefix, polymerase,
      existingPrimers: active.primers || [],
      templateName: f.name || 'template',
    };

    if (result.strategy === 'kld') {
      const { primers: builtPrimers, protocolSteps } = buildMutagenesisPayload(result, baseCtx);
      const newFragment = {
        ...f,
        isMutagenesis: true,
        needsAmplification: f.needsAmplification,
        baseSnapshot: {
          sequence: f.sequence,
          annotations: Array.isArray(f.annotations) ? f.annotations.map(a => ({ ...a })) : [],
        },
        commits: [],
      };
      updateActive({
        fragments: fragments.map((fr, i) => i === fragIndex ? newFragment : fr),
        primers: builtPrimers,
        protocolSteps,
        apiWarnings: result.warnings || [],
        calculated: true,
      });
      return;
    }

    // No-PCR guard — can't split what can't be amplified.
    if (f.needsAmplification === false) {
      updateActive({
        apiWarnings: [
          ...(active.apiWarnings || []),
          `⚠ Фрагмент «${f.name}» помечен как без ПЦР — многофрагментный мутагенез невозможен. `
          + `Используйте одну точечную мутацию (KLD) или включите амплификацию.`,
        ],
        calculated: false,
      });
      return;
    }

    const splitGroupId = `sg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const splitGroupFullSequence = result.mutantSequence || '';
    const splitGroupFullParentMutations = normMuts;

    const newFragments = result.fragments.map((sf, i) => {
      const subAnnotations = trimAnnotationsForSubFragment(f.annotations, sf);
      return {
        id: `mf${Date.now()}_${i}_${Math.random().toString(36).slice(2, 4)}`,
        name: `${f.name}_${i + 1}`,
        sequence: sf.sequence,
        length: sf.length,
        type: sf.type || f.type,
        strand: sf.strand || 1,
        needsAmplification: true,
        sourceType: sf.sourceType || 'template_pcr',
        templateStart: sf.templateStart,
        templateEnd: sf.templateEnd,
        partId: i === 0 ? f.partId : undefined,
        isMutagenesis: true,
        splitGroupId,
        splitGroupParentName: f.name,
        splitGroupIndex: i,
        splitGroupTotal: result.fragments.length,
        splitGroupFullSequence,
        splitGroupFullLength: splitGroupFullSequence.length,
        splitGroupFullParentMutations,
        topology: 'linear',
        annotations: subAnnotations,
        baseSnapshot: {
          sequence: sf.sequence,
          annotations: subAnnotations.map(a => ({ ...a })),
        },
        commits: [],
      };
    });

    const strategyJunctions = result.junctions.map(j => ({
      ...j,
      id: `j${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
    }));

    const updatedFragArr = [
      ...fragments.slice(0, fragIndex),
      ...newFragments,
      ...fragments.slice(fragIndex + 1),
    ];
    const updatedJunctionArr = [
      ...junctions.slice(0, fragIndex),
      ...strategyJunctions,
      ...junctions.slice(fragIndex),
    ];

    const { primers: builtPrimers, protocolSteps } = buildMutagenesisPayload(result, baseCtx);

    updateActive({
      fragments: updatedFragArr,
      junctions: updatedJunctionArr,
      primers: builtPrimers,
      protocolSteps,
      apiWarnings: result.warnings || [],
      calculated: false,
    });
  };

  // K12 (Sprint 1.7) — per-fragment topology toggle.
  const toggleFragmentTopology = (index) => {
    const active = getActive();
    if (!active) return;
    const assemblyCircular = !!active.circular;
    pushUndo();
    updateActive({
      fragments: fragments.map((f, i) => {
        if (i !== index) return f;
        const current = f.topology === 'circular' || f.topology === 'linear'
          ? f.topology
          : (assemblyCircular ? 'circular' : 'linear');
        return { ...f, topology: current === 'circular' ? 'linear' : 'circular' };
      }),
    });
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
    pushUndo();

    // K7 — tag split sub-fragments with a shared splitGroupId (not KLD — single fragment).
    const isSplit = result.strategy !== 'kld' && result.fragments.length > 1;
    const splitGroupId = isSplit
      ? `sg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      : null;
    const parentName = result.templateName || 'template';

    // K11 (Sprint 1.7) — propagate full mutant sequence onto each split sub.
    const splitGroupFullSequence = splitGroupId ? (result.mutantSequence || '') : '';
    const splitGroupFullParentMutations = splitGroupId ? (result.mutations || []) : [];

    const baseFragments = result.fragments.map((f, i) => ({
      ...f,
      id: `mf${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      isMutagenesis: true,
      ...(splitGroupId && {
        splitGroupId,
        splitGroupParentName: parentName,
        splitGroupIndex: i,
        splitGroupTotal: result.fragments.length,
        splitGroupFullSequence,
        splitGroupFullLength: splitGroupFullSequence.length,
        splitGroupFullParentMutations,
        topology: 'linear', // K12 — split unavoidably linearizes sub-fragments
      }),
    }));

    // Build primers & protocolSteps through the shared payload helper.
    // For KLD: primers come from strategy (back-to-back phosphorylated pair).
    // For two/multi_fragment: primers stay empty here — auto-design will fill them
    // from junction.overlapSequence (see V4-E, local-primer-design).
    const { primers: builtPrimers, protocolSteps } = buildMutagenesisPayload(result, {
      primerPrefix,
      polymerase,
      existingPrimers: getActive()?.primers || [],
      templateName: result.templateName || 'template',
    });

    updateActive({
      fragments: baseFragments,
      junctions: result.junctions,
      primers: builtPrimers,
      protocolSteps,
      apiWarnings: result.warnings || [],
      calculated: result.strategy === 'kld',
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
    toggleFragmentTopology,
    handleCreateMutagenesisAssembly,
  };
}
