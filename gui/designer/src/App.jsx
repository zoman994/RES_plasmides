import { useEffect, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useStore, useFragments, useJunctions, usePrimers, useCustomPrimers } from './store/index';
import PartsPalette from './components/PartsPalette';
import DesignCanvas from './components/DesignCanvas';
import PrimerPanel from './components/PrimerPanel';
import SequenceViewer from './components/SequenceViewer';
import AddFragmentModal from './components/AddFragmentModal';
import RestrictionPanel from './components/RestrictionPanel';
import ProtocolTracker from './components/ProtocolTracker';
import { PCR_MIXES, ASSEMBLY_PROTOCOLS as ASM_PROTOCOLS } from './protocol-data';
import MutagenesisWizard from './components/MutagenesisWizard';
import VerificationPanel from './components/VerificationPanel';
import FragmentSplitter from './components/FragmentSplitter';
import AssemblyTabs from './components/AssemblyTabs';
import ProjectBar from './components/ExperimentSelector';
import ExperimentStats from './components/ExperimentStats';
import OligoManager from './components/OligoManager';
import FragmentEditor from './components/FragmentEditor';
import PartsLibrary from './components/PartsLibrary';
import DataManager from './components/DataManager';
import { fetchParts, designPrimers } from './api';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from './validate';
import { exportGenBank, exportProtocol, saveToPVCS } from './exports';
import { addToInventory } from './inventory';
import { findAllMatches, addPrimersToRegistry } from './primer-reuse';
import { t } from './i18n';
import { getFragColor, isMarker } from './theme';
import { GG_ENZYMES } from './golden-gate';
import { designInlineKLDPrimers } from './mutagenesis';

// ============================================================================
// App — root component, wired to Zustand store
// ============================================================================

export default function App() {

  // ═══════════ Store: domain state ═══════════
  const fragments     = useFragments();
  const junctions     = useJunctions();
  const primers       = usePrimers();
  const customPrimers = useCustomPrimers();

  const assemblies       = useStore(s => s.assemblies);
  const activeId         = useStore(s => s.activeId);
  const projectName      = useStore(s => s.projectName);
  const projects         = useStore(s => s.projects);
  const activeProjectId  = useStore(s => s.activeProjectId);
  const parts            = useStore(s => s.parts);
  const polymerase       = useStore(s => s.polymerase);
  const primerPrefix     = useStore(s => s.primerPrefix);
  const ggEnzyme         = useStore(s => s.ggEnzyme);
  const ggSiteCheck      = useStore(s => s.ggSiteCheck);
  const loading          = useStore(s => s.loading);

  // ═══════════ Store: UI state ═══════════
  const modalMode        = useStore(s => s.modalMode);
  const splitTarget      = useStore(s => s.splitTarget);
  const showMutagenesis  = useStore(s => s.showMutagenesis);
  const showOligos       = useStore(s => s.showOligos);
  const showPartsLib     = useStore(s => s.showPartsLib);
  const globalCDSPart    = useStore(s => s.globalCDSPart);
  const editTarget       = useStore(s => s.editTarget);
  const showDataMgr      = useStore(s => s.showDataMgr);
  const activeTab        = useStore(s => s.activeTab);
  const warningsOpen     = useStore(s => s.warningsOpen);
  const expertMode       = useStore(s => s.expertMode);
  const firstLaunch      = useStore(s => s.firstLaunch);
  const maxFinalParts    = useStore(s => s.maxFinalParts);
  const inventoryVersion = useStore(s => s.inventoryVersion);

  // ═══════════ Store: actions ═══════════
  const addFragment          = useStore(s => s.addFragment);
  const removeFragment       = useStore(s => s.removeFragment);
  const flipFragment         = useStore(s => s.flipFragment);
  const reorderFragments     = useStore(s => s.reorderFragments);
  const toggleAmplification  = useStore(s => s.toggleAmplification);
  const updateActive         = useStore(s => s.updateActive);
  const getActive            = useStore(s => s.getActive);
  const addAssembly          = useStore(s => s.addAssembly);
  const removeAssembly       = useStore(s => s.removeAssembly);
  const renameAssembly       = useStore(s => s.renameAssembly);
  const switchAssembly       = useStore(s => s.switchAssembly);
  const addProject           = useStore(s => s.addProject);
  const switchProject        = useStore(s => s.switchProject);
  const removeProject        = useStore(s => s.removeProject);
  const setProjectName       = useStore(s => s.setProjectName);
  const updateJunction       = useStore(s => s.updateJunction);
  const toggleCircular       = useStore(s => s.toggleCircular);
  const setAssemblyType      = useStore(s => s.setAssemblyType);
  const autoDesignGGOverhangs = useStore(s => s.autoDesignGGOverhangs);
  const setGgEnzyme          = useStore(s => s.setGgEnzyme);
  const addCustomPrimer      = useStore(s => s.addCustomPrimer);
  const deleteCustomPrimer   = useStore(s => s.deleteCustomPrimer);
  const setLoading           = useStore(s => s.setLoading);
  const setPolymerase        = useStore(s => s.setPolymerase);
  const setPrimerPrefix      = useStore(s => s.setPrimerPrefix);
  const setParts             = useStore(s => s.setParts);
  const addPart              = useStore(s => s.addPart);
  const updatePart           = useStore(s => s.updatePart);
  const toggleExpertMode     = useStore(s => s.toggleExpertMode);
  const setModalMode         = useStore(s => s.setModalMode);
  const setShowMutagenesis   = useStore(s => s.setShowMutagenesis);
  const setShowOligos        = useStore(s => s.setShowOligos);
  const setShowPartsLib      = useStore(s => s.setShowPartsLib);
  const setShowDataMgr       = useStore(s => s.setShowDataMgr);
  const setGlobalCDSPart     = useStore(s => s.setGlobalCDSPart);
  const setEditTarget        = useStore(s => s.setEditTarget);
  const setSplitTarget       = useStore(s => s.setSplitTarget);
  const setActiveTab         = useStore(s => s.setActiveTab);
  const setWarningsOpen      = useStore(s => s.setWarningsOpen);
  const setMaxFinalParts     = useStore(s => s.setMaxFinalParts);
  const incrementInventoryVersion = useStore(s => s.incrementInventoryVersion);
  const setFirstLaunch       = useStore(s => s.setFirstLaunch);

  // ═══════════ Active assembly shorthand ═══════════
  const active       = getActive() || { id: 'asm_1', name: 'Сборка 1', fragments: [], junctions: [] };
  const assemblyType = active.assemblyType || 'overlap';
  const protocol     = active.protocol || 'overlap_pcr';
  const circular     = active.circular || false;
  const calculated   = active.calculated || false;
  const apiWarnings  = active.apiWarnings || [];
  const orderSheet   = active.orderSheet || '';
  const primerMatches = active.primerMatches || {};
  const protocolSteps = active.protocolSteps || [];

  // ═══════════ Derived / computed ═══════════
  const allPrimers = useMemo(() => [
    ...primers.map(p => ({ ...p, category: 'assembly' })),
    ...customPrimers.map(p => ({ ...p, category: 'custom' })),
  ], [primers, customPrimers]);

  const constructWarnings = useMemo(() => validateConstruct(fragments), [fragments]);
  const primerQuality = useMemo(() =>
    primers.map(p => ({ name: p.name, warnings: checkPrimerQuality(p) }))
      .filter(pq => pq.warnings.length > 0),
    [primers]);
  const pcrSizes = useMemo(() =>
    fragments.map((f, i) => {
      const leftJ  = i > 0 ? junctions[i - 1] : (circular ? junctions[junctions.length - 1] : null);
      const rightJ = i < junctions.length ? junctions[i] : (circular ? junctions[0] : null);
      return pcrProductSize(f, leftJ, rightJ);
    }),
    [fragments, junctions, circular]);
  const totalBp = fragments.reduce((s, f) => s + (f.sequence || '').length, 0);

  // ═══════════ Assembly efficiency helpers ═══════════
  const estimateEfficiency = (count, method) => {
    if (method === 'golden_gate') {
      if (count <= 4) return { pct: '>90%', color: 'green' };
      if (count <= 8) return { pct: '~70%', color: 'green' };
      if (count <= 12) return { pct: '~50%', color: 'amber' };
      return { pct: '<30%', color: 'red' };
    }
    if (count <= 2) return { pct: '~95%', color: 'green' };
    if (count === 3) return { pct: '~80%', color: 'green' };
    if (count === 4) return { pct: '~50%', color: 'amber' };
    if (count === 5) return { pct: '~30%', color: 'amber' };
    return { pct: '<20%', color: 'red' };
  };

  const effectiveFinalParts = maxFinalParts === 0
    ? (fragments.length <= 3 ? fragments.length : 3)
    : Math.min(maxFinalParts, fragments.length);
  const efficiency = fragments.length >= 2
    ? estimateEfficiency(effectiveFinalParts, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap')
    : null;

  function planAssemblyStages(frags, _method, maxParts) {
    const target = maxParts === 0 ? (frags.length <= 3 ? frags.length : 3) : Math.min(maxParts, frags.length);
    if (frags.length <= target) return [{ round: 0, groups: [frags.map((_, i) => i)] }];
    const stages = [];
    let currentGroups = frags.map((_, i) => [i]);
    let round = 1;
    while (currentGroups.length > target) {
      const merged = [];
      for (let i = 0; i < currentGroups.length; i += 2) {
        merged.push(i + 1 < currentGroups.length
          ? [...currentGroups[i], ...currentGroups[i + 1]]
          : currentGroups[i]);
      }
      stages.push({ round, groups: merged.map(g => [...g]) });
      currentGroups = merged;
      round++;
    }
    return stages;
  }

  // ═══════════ Load parts on mount (merge API parts with persisted user variants) ═══════════
  useEffect(() => {
    const mergeParts = (apiParts) => {
      const existingIds = new Set(parts.map(p => p.id));
      // User-created variants (parentId set, or source=mutagenesis) must be preserved
      const userParts = parts.filter(p => p.parentId || p.source === 'mutagenesis');
      // API parts: add only if not already present
      const newApiParts = apiParts.filter(p => !existingIds.has(p.id));
      // Merge: API base parts + user variants
      const baseParts = apiParts.filter(p => existingIds.has(p.id) ? false : true);
      setParts([...baseParts, ...userParts]);
    };
    const fallback = [
      { id: 'd1', name: 'PglaA', type: 'promoter', sequence: 'ATCG'.repeat(212), length: 850 },
      { id: 'd2', name: 'XynTL', type: 'CDS', sequence: 'ATGC'.repeat(225), length: 900 },
      { id: 'd3', name: 'TtrpC', type: 'terminator', sequence: 'GCTA'.repeat(185), length: 740 },
      { id: 'd4', name: 'HygR', type: 'CDS', sequence: 'ATCG'.repeat(256), length: 1026 },
      { id: 'd5', name: 'PgpdA', type: 'promoter', sequence: 'GCGC'.repeat(135), length: 540 },
      { id: 'd6', name: 'pyrG', type: 'CDS', sequence: 'TAGC'.repeat(241), length: 966 },
    ];
    fetchParts().then(mergeParts).catch(() => mergeParts(fallback));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════ Complex handlers (need multiple store actions + API) ═══════════

  /** Generate primers via API, build protocol steps. */
  const generate = async () => {
    if (fragments.length < 2) return;
    const asmId = active.id;
    setLoading(true);
    try {
      const data = await designPrimers(
        fragments.map(f => ({ name: f.name, sequence: f.sequence, needsAmplification: f.needsAmplification })),
        junctions, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap_pcr', circular, 60,
      );
      const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
      let pidx = 1;
      let renamedPrimers = (data.primers || []).map(p => ({
        ...p, name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_${p.name}`,
        tmAdjusted: Math.round((p.tmBinding || 60) + tmAdj),
      }));
      if (assemblyType !== 'golden_gate') {
        const seenBinding = new Map();
        renamedPrimers = renamedPrimers.filter(p => {
          const key = `${p.direction}_${(p.bindingSequence || p.sequence || '').toUpperCase()}`;
          if (seenBinding.has(key)) return false;
          seenBinding.set(key, p.name);
          return true;
        });
      }
      const updatedJunctions = junctions.map((j, i) => ({
        ...j, overlapSequence: data.junctions?.[i]?.overlapSequence || j.overlapSequence,
        overlapTm: data.junctions?.[i]?.overlapTm || j.overlapTm,
        overlapGc: data.junctions?.[i]?.overlapGc || j.overlapGc,
      }));
      const pSteps = [];
      const mix = PCR_MIXES[polymerase] || PCR_MIXES.phusion;
      fragments.forEach((frag, fi) => {
        if (!frag.needsAmplification) return;
        const fwd = renamedPrimers.find(p => p.direction === 'forward' && p.name.includes(frag.name));
        const rev = renamedPrimers.find(p => p.direction === 'reverse' && p.name.includes(frag.name));
        const sz = pcrSizes[fi] || frag.length;
        pSteps.push({ id: `pcr_${fi}`, type: 'pcr', title: `ПЦР ${frag.name}`, subtitle: `${sz} п.н.`, template: frag.name,
          fwdPrimer: fwd?.name, revPrimer: rev?.name, annealTemp: Math.round(Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60)),
          expectedSize: sz, extensionTime: Math.ceil(sz / 1000) * mix.extRate, mix,
          statuses: [{ label: 'ПЦР', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }] });
      });
      // Junction-type-aware assembly stages
      const jTypes = updatedJunctions.map(j => j.type || 'overlap');
      const hasOverlap = jTypes.includes('overlap');
      const hasGG = jTypes.includes('golden_gate');
      const hasKLD = jTypes.includes('kld');
      const hasRE = jTypes.includes('re_ligation') || jTypes.includes('sticky_end');

      if (hasOverlap) {
        const overlapGroups = []; let currentGroup = [0];
        for (let gi = 0; gi < updatedJunctions.length; gi++) {
          const jt = updatedJunctions[gi].type || 'overlap';
          const nextFrag = (gi + 1) % fragments.length;
          if (jt === 'overlap') { currentGroup.push(nextFrag); }
          else { overlapGroups.push([...currentGroup]); currentGroup = [nextFrag]; }
        }
        overlapGroups.push([...currentGroup]);
        overlapGroups.filter(g => g.length > 1).forEach((group, gi) => {
          const groupFragNames = group.map(i => fragments[i]?.name || '?');
          if (group.length <= 3 || maxFinalParts === group.length) {
            pSteps.push({ id: `overlap_${gi}`, type: 'assembly',
              title: `Overlap-сборка${overlapGroups.filter(g2 => g2.length > 1).length > 1 ? ` (группа ${gi + 1})` : ''}`,
              subtitle: `${groupFragNames.length} фрагментов → 1 продукт`,
              protocol: ASM_PROTOCOLS.overlap_pcr, expectedSize: null, fragments: groupFragNames,
              statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }] });
          } else {
            const stages = planAssemblyStages(group.map(i => fragments[i]), assemblyType, maxFinalParts);
            stages.forEach((stage, si) => {
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
        const ggJunctions = updatedJunctions.filter(j => j.type === 'golden_gate');
        const enzyme = ggJunctions[0]?.enzyme || 'BsaI';
        pSteps.push({ id: 'gg_assembly', type: 'assembly', title: 'Golden Gate сборка',
          subtitle: `${enzyme} · ${ggJunctions.length} стыков · (37°C↔16°C) ×30`,
          protocol: ASM_PROTOCOLS.golden_gate || ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp,
          fragments: ggJunctions.map(j => j.overhang || '----'),
          statuses: [{ label: 'GG реакция', done: false }, { label: 'Гель', done: false }] });
      }
      if (hasRE) {
        const reJunctions = updatedJunctions.filter(j => j.type === 're_ligation' || j.type === 'sticky_end');
        const enzymes = [...new Set(reJunctions.map(j => j.reEnzyme || j.enzyme || '?'))];
        pSteps.push({ id: 're_assembly', type: 'assembly', title: 'Рестрикция + лигирование',
          subtitle: `${enzymes.join(', ')} · T4 Ligase · 16°C overnight`,
          protocol: ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp, fragments: enzymes,
          statuses: [{ label: 'Рестрикция', done: false }, { label: 'Лигирование', done: false }, { label: 'Гель', done: false }] });
      }
      if (hasKLD) {
        pSteps.push({ id: 'kld_assembly', type: 'assembly', title: 'KLD (Kinase-Ligase-DpnI)',
          subtitle: 'T4 PNK + T4 Ligase + DpnI · 25°C 30мин',
          protocol: ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp, fragments: [],
          statuses: [{ label: 'KLD', done: false }, { label: 'Гель', done: false }] });
      }
      if (!hasOverlap && !hasGG && !hasKLD && !hasRE) {
        pSteps.push({ id: 'assembly', type: 'assembly', title: 'Сборка',
          subtitle: (ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr).name,
          protocol: ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp,
          fragments: fragments.map(f => f.name),
          statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }] });
      }
      pSteps.push({ id: 'transform', type: 'transform', title: 'Трансформация',
        statuses: [{ label: 'Трансф.', done: false }, { label: 'Колонии', done: false }] });
      pSteps.push({ id: 'screening', type: 'screening', title: 'Colony PCR', expectedSize: totalBp,
        statuses: [{ label: 'Colony PCR', done: false }, { label: 'Отобраны', done: false }] });
      pSteps.push({ id: 'sequencing', type: 'sequencing', title: 'Секвенирование',
        statuses: [{ label: 'Отправлено', done: false }, { label: 'Подтв.', done: false }] });
      const matches = findAllMatches(renamedPrimers);
      addPrimersToRegistry(renamedPrimers);
      // Use updateActive to batch-set all results
      updateActive({ primers: renamedPrimers, apiWarnings: data.warnings || [], orderSheet: data.orderSheet || '',
        primerMatches: matches, junctions: updatedJunctions, calculated: true, protocolSteps: pSteps });
    } catch (e) {
      updateActive({ apiWarnings: [`API error: ${e.message}`] });
    }
    setLoading(false);
  };

  /** Handle fragment split / trim / replace results. */
  const handleFragmentSplit = (result) => {
    const idx = splitTarget; if (idx === null) return;
    const nf = [...fragments]; const frag = nf[idx];
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
        const mutDesc = newMuts.map(m => m.label).join(', ');
        const variant = {
          id: variantId, name: updated.name, type: rootPart.type,
          sequence: updated.sequence, length: updated.length, organism: rootPart.organism,
          parentId: rootPart.id, modification: { type: 'mutation', description: mutDesc },
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
      // Auto-design KLD primers for mutations
      const lastMut = updated.mutations[updated.mutations.length - 1];
      if (lastMut?.codonStart != null || lastMut?.label) {
        const mutSite = lastMut.codonStart ?? ((parseInt(lastMut.label?.match(/\d+/)?.[0] || '1') - 1) * 3);
        const kldP = designInlineKLDPrimers(updated.sequence, mutSite, 60);
        let pidx2 = 1;
        const kldPrimers = [
          { name: `${primerPrefix}${String(pidx2++).padStart(3, '0')}_mut_fwd_${original.name}`,
            sequence: kldP.forward.sequence, bindingSequence: kldP.forward.sequence, tailSequence: '',
            tmBinding: kldP.forward.tm, direction: 'forward', isMutagenesis: true, mutation: lastMut.label },
          { name: `${primerPrefix}${String(pidx2++).padStart(3, '0')}_mut_rev_${original.name}`,
            sequence: kldP.reverse.sequence, bindingSequence: kldP.reverse.sequence, tailSequence: '',
            tmBinding: kldP.reverse.tm, direction: 'reverse', isMutagenesis: true, mutation: lastMut.label },
        ];
        const kldSteps = [
          { id: 'kld_pcr', type: 'pcr', title: `Обратная ПЦР ${updated.name}`, subtitle: `${updated.length} п.н. (вся плазмида)`,
            template: original.name, fwdPrimer: kldPrimers[0].name, revPrimer: kldPrimers[1].name,
            annealTemp: Math.round(Math.min(kldP.forward.tm, kldP.reverse.tm)),
            expectedSize: updated.length, extensionTime: Math.ceil(updated.length / 1000) * 30,
            mix: PCR_MIXES[polymerase],
            statuses: [{ label: 'ПЦР', done: false }, { label: 'Гель', done: false }] },
          { id: 'kld_asm', type: 'assembly', title: 'KLD реакция', subtitle: 'T4 PNK + T4 Ligase + DpnI · 25°C 30мин',
            statuses: [{ label: 'KLD', done: false }] },
          { id: 'transform', type: 'transform', title: 'Трансформация',
            statuses: [{ label: 'Трансф.', done: false }, { label: 'Колонии', done: false }] },
          { id: 'screening', type: 'screening', title: 'Colony PCR', expectedSize: updated.length,
            statuses: [{ label: 'Colony PCR', done: false }] },
          { id: 'sequencing', type: 'sequencing', title: 'Секвенирование',
            statuses: [{ label: 'Отправлено', done: false }, { label: 'Подтв.', done: false }] },
        ];
        updateActive({
          fragments: fragments.map((f, i) => i === editTarget ? updated : f),
          primers: kldPrimers, calculated: true, protocolSteps: kldSteps,
        });
      }
    }
    setEditTarget(null);
  };

  const handleMutagenesis = (result) => {
    updateActive({ fragments: result.fragments.map(f => ({ ...f, id: `mf${Date.now()}_${Math.random().toString(36).slice(2,5)}`, isMutagenesis: true })),
      junctions: result.junctions, calculated: false, primers: [] });
  };

  const handleReusePrimer = (primerName, existingPrimer) => {
    updateActive({ primers: primers.map(p => p.name === primerName ? { ...p, reused: true, reusedFrom: existingPrimer.name } : p) });
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

  /** Mark assembly as complete, create merged product. */
  const completeAssembly = () => {
    const fullSeq = fragments.map(f => f.sequence || '').join('');
    const totalLen = fullSeq.length;
    const productType = circular ? 'plasmid' : 'pcr_product';
    const subFragments = fragments.map(f => ({
      name: f.name, type: f.type, length: f.length,
      color: isMarker(f.name) ? '#F0E442' : getFragColor(f.type, fragments.indexOf(f)),
      pct: (f.length / totalLen) * 100,
    }));
    const mergedProduct = {
      id: `product_${Date.now()}`, name: active.name,
      type: productType, sequence: fullSeq, length: totalLen,
      strand: 1, needsAmplification: false, subFragments,
      sourceType: 'assembly', sourceAssemblyId: active.id,
      components: fragments.map(f => f.name), completedAt: new Date().toISOString(),
    };
    addToInventory({ ...mergedProduct, verified: circular });
    // Add to parts library if not already present
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

  // ═══════════ Utility: domain position adjustment for splits ═══════════
  function adjustDomains(domains, cutAA, action) {
    if (!domains?.length) return [];
    if (action === 'remove_part1') {
      return domains.filter(d => d.endAA > cutAA).map(d => ({ ...d, startAA: Math.max(1, d.startAA - cutAA), endAA: d.endAA - cutAA }));
    }
    if (action === 'remove_part2') {
      return domains.filter(d => d.startAA <= cutAA).map(d => ({ ...d, endAA: Math.min(d.endAA, cutAA) }));
    }
    if (action === 'split') {
      return {
        part1: domains.filter(d => d.startAA <= cutAA).map(d => ({ ...d, endAA: Math.min(d.endAA, cutAA) })),
        part2: domains.filter(d => d.endAA > cutAA).map(d => ({ ...d, startAA: Math.max(1, d.startAA - cutAA), endAA: d.endAA - cutAA })),
      };
    }
    return domains;
  }

  /** Build plain junctions array (no auto-adjust, used after split). */
  function buildPlainJunctions(frags, asmType, isCirc) {
    const count = isCirc ? frags.length : Math.max(0, frags.length - 1);
    return Array.from({ length: count }, () => ({
      type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
      overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
      enzyme: 'BsaI', overhang: '',
    }));
  }

  // ═══════════ Render ═══════════
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#f8f9fa' }}>
        {/* Header */}
        <header className="px-6 py-2.5 flex items-center justify-between shrink-0"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px) saturate(180%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}>
          <div className="flex items-center gap-3">
            <span className="text-lg">&#x1F9EC;</span>
            <h1 className="text-base font-bold text-white">{t('Construct Designer')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleExpertMode}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition border ${
                expertMode ? 'bg-purple-500/20 border-purple-400/30 text-purple-300' : 'bg-green-500/20 border-green-400/30 text-green-300'}`}>
              {expertMode ? '🔬 Эксперт' : '🎓 Студент'}
            </button>
            <div className="w-px h-4 bg-white/15 mx-1" />
            <span className="text-xs text-gray-400">Метод:</span>
            <button onClick={() => setAssemblyType('overlap')}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'overlap' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
              Overlap / Gibson
            </button>
            {expertMode && (
              <button onClick={() => setAssemblyType('golden_gate')}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                  ${assemblyType === 'golden_gate' ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                Golden Gate
              </button>
            )}
            {expertMode && assemblyType === 'golden_gate' && (
              <select value={ggEnzyme} onChange={e => { setGgEnzyme(e.target.value); setTimeout(autoDesignGGOverhangs, 50); }}
                className="text-[10px] bg-white/10 text-gray-300 border-0 rounded px-2 py-1">
                {Object.entries(GG_ENZYMES).map(([k, e]) => (
                  <option key={k} value={k}>{e.name}{e.alias ? `/${e.alias}` : ''} ({e.overhangLength}nt)</option>
                ))}
              </select>
            )}
            {expertMode && (
              <button onClick={() => setShowMutagenesis(true)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition">
                {'🔬'} {t('Mutagenesis')}
              </button>
            )}
            <div className="w-px h-4 bg-white/15 mx-1" />
            {expertMode && (
              <button onClick={() => setShowOligos(true)}
                className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
                {'📋'} Олиги
              </button>
            )}
            <button onClick={() => setShowPartsLib(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📦'} Запчасти
            </button>
            <button onClick={() => setShowDataMgr(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition"
              title="Экспорт / Импорт данных">
              {'💾'} Данные
            </button>
            {expertMode && (<>
              <div className="w-px h-4 bg-white/15 mx-1" />
              <select value={polymerase} onChange={e => setPolymerase(e.target.value)}
                className="text-xs bg-white/10 text-gray-300 border-0 rounded px-2 py-1">
                <option value="phusion">Phusion/Q5</option>
                <option value="taq">Taq</option>
                <option value="kod">KOD</option>
              </select>
              <div className="flex items-center gap-1 ml-1 text-xs text-gray-400">
                <span>Prefix:</span>
                <input value={primerPrefix} onChange={e => setPrimerPrefix(e.target.value)}
                  className="w-10 bg-white/10 text-gray-300 border-0 rounded px-1 py-0.5 text-xs" maxLength={4} />
              </div>
            </>)}
            {fragments.length > 0 && (
              <button onClick={clearAssembly} className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded ml-1">
                {t('Clear')}
              </button>
            )}
          </div>
        </header>

        {/* Project selector */}
        <ProjectBar />

        {/* Assembly tabs */}
        <AssemblyTabs
          assemblies={assemblies}
          activeId={activeId}
          onSelect={switchAssembly}
          onAdd={addAssembly}
          onRemove={removeAssembly}
          onRename={renameAssembly}
        />

        <div className="flex flex-1 overflow-hidden">
          <PartsPalette />
          <div className="flex-1 flex flex-col p-3 gap-2 overflow-y-auto">

            {active.completed && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                <span className="text-green-600 text-xl">{'✅'}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-green-800">Сборка завершена</div>
                  <div className="text-xs text-green-600">
                    Продукт {'«'}{active.product?.name}{'»'} ({active.product?.length} п.н.)
                    {active.product?.components && ` = ${active.product.components.join(' + ')}`}
                  </div>
                </div>
                {active.originalFragments && (
                  <button onClick={() => {
                    if (active.originalFragments && fragments[0]?.subFragments) {
                      updateActive({ fragments: active.originalFragments, junctions: active.originalJunctions || [] });
                    } else {
                      updateActive({ fragments: [active.product], junctions: [] });
                    }
                  }}
                    className="text-[10px] px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                    {fragments[0]?.subFragments ? '🔍 Показать фрагменты' : '📦 Свернуть в продукт'}
                  </button>
                )}
              </div>
            )}

            {constructWarnings.length > 0 && (
              <div>
                <button onClick={() => setWarningsOpen(!warningsOpen)}
                  className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-left hover:bg-amber-100 transition">
                  <span className="text-xs font-medium text-amber-700">
                    {'⚠'} {constructWarnings.length} замечани{constructWarnings.length === 1 ? 'е' : constructWarnings.length < 5 ? 'я' : 'й'}
                  </span>
                  <span className="text-amber-400 text-sm">{warningsOpen ? '▲' : '▼'}</span>
                </button>
                {warningsOpen && (
                  <div className="bg-amber-50 border border-t-0 border-amber-200 rounded-b-lg px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
                    {constructWarnings.map((w, i) => (
                      <div key={i} className={`text-xs ${w.startsWith('⛔') ? 'text-red-800' : 'text-amber-800'}`}>
                        {w}
                        {w.includes('Golden Gate') && w.startsWith('⛔') && (
                          <button onClick={() => {
                            const newJ = junctions.map(j => ({ ...j, type: 'golden_gate', enzyme: ggEnzyme }));
                            updateActive({ junctions: newJ, assemblyType: 'golden_gate', calculated: false, primers: [] });
                            setTimeout(() => autoDesignGGOverhangs(), 100);
                          }}
                            className="ml-2 text-[10px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 inline-flex items-center gap-1">
                            {'🔶'} Golden Gate
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <DesignCanvas
              onDrop={addFragment} onRemove={removeFragment}
              onToggleAmplification={toggleAmplification} onJunctionChange={updateJunction}
              onReorder={reorderFragments} onFlip={flipFragment}
              pcrSizes={pcrSizes} onSplitSignal={setSplitTarget}
              onEditFragment={setEditTarget}
              onSwapVariant={handleSwapVariant}
              onToggleCircular={toggleCircular}
              onAddCustomPrimer={addCustomPrimer} />

            {fragments.length >= 2 && !active.completed && (
              <div className="space-y-2">
                {/* GG internal site warning */}
                {assemblyType === 'golden_gate' && ggSiteCheck && !ggSiteCheck.ok && (
                  <div className="text-[10px] bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-2">
                    <span className="text-amber-500 shrink-0">{'⚠'}</span>
                    <div>
                      <span className="text-amber-800">{ggSiteCheck.message}</span>
                      {ggSiteCheck.alternatives?.length > 0 && (
                        <div className="mt-1">Рекомендуется: {ggSiteCheck.alternatives.map(a => (
                          <button key={a} onClick={() => { setGgEnzyme(a); setTimeout(autoDesignGGOverhangs, 50); }}
                            className="text-blue-600 hover:underline mr-2 font-medium">{a}</button>
                        ))}</div>
                      )}
                    </div>
                  </div>
                )}
                {/* Assembly strategy selector */}
                {expertMode && fragments.length > 2 && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg flex-wrap">
                    <span className="text-[11px] text-gray-600">Стратегия:</span>
                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      {[
                        { val: 0, label: '🎯 Авто' },
                        { val: fragments.length, label: '🙏 Всё разом' },
                        ...(fragments.length > 3 ? [{ val: 3, label: '3 части' }] : []),
                        ...(fragments.length > 2 ? [{ val: 2, label: '2 части' }] : []),
                      ].map(opt => (
                        <button key={opt.val} onClick={() => setMaxFinalParts(opt.val)}
                          className={`px-3 py-1 text-[10px] transition border-r last:border-r-0 border-gray-200 ${
                            maxFinalParts === opt.val ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {efficiency && (
                      <span className={`text-[10px] font-medium ${
                        efficiency.color === 'green' ? 'text-green-600' :
                        efficiency.color === 'amber' ? 'text-amber-600' : 'text-red-600'}`}>
                        Эфф.: {efficiency.pct}
                      </span>
                    )}
                  </div>
                )}
                {/* Strategy description */}
                {expertMode && fragments.length > 2 && (() => {
                  const jt = junctions.map(j => j.type || 'overlap');
                  const methods = [...new Set(jt)];
                  const isMixed = methods.length > 1;
                  if (isMixed) {
                    const pts = [];
                    if (jt.includes('overlap')) pts.push('Overlap-склеивание');
                    if (jt.includes('golden_gate')) pts.push('Golden Gate');
                    if (jt.includes('re_ligation') || jt.includes('sticky_end')) pts.push('RE/Лигирование');
                    if (jt.includes('kld')) pts.push('KLD');
                    return (
                      <div className="text-[10px] text-gray-500 text-center">
                        {'🔀'} <b>Мультиметодная:</b> {pts.join(' → ')}
                      </div>
                    );
                  }
                  return (
                    <div className="text-[10px] text-gray-500 text-center">
                      {maxFinalParts === 0 && <span>{'🎯'} <b>Авто:</b> {fragments.length <= 3 ? 'Gibson/GG из всех фрагментов разом' : `попарный overlap → финальная сборка из ${effectiveFinalParts} частей`}</span>}
                      {maxFinalParts === fragments.length && <span>{'🙏'} <b>Всё разом:</b> ПЦР всех {fragments.length} фрагментов → сборка из {fragments.length} частей{fragments.length > 4 && <span className="text-amber-600"> (эффективность может быть низкой)</span>}</span>}
                      {maxFinalParts > 0 && maxFinalParts < fragments.length && maxFinalParts === 3 && <span>{'📐'} <b>Через 3:</b> попарный overlap → финальная сборка из 3 частей</span>}
                      {maxFinalParts > 0 && maxFinalParts < fragments.length && maxFinalParts === 2 && <span>{'📐'} <b>Через 2:</b> несколько раундов overlap → финальная сборка из 2 частей</span>}
                      {maxFinalParts > 0 && maxFinalParts < fragments.length && maxFinalParts !== 2 && maxFinalParts !== 3 && maxFinalParts !== fragments.length && <span>{'📐'} Иерархическая сборка → финальный этап из {effectiveFinalParts} частей</span>}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-center gap-3">
                  <button onClick={generate} disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                    {loading ? t('Calculating...') : t('Generate Primers')}
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            {(fragments.length > 0 || primers.length > 0) && (
              <div className="flex gap-1 border-b">
                {fragments.length > 0 && (
                  <button onClick={() => setActiveTab('sequence')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'sequence' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'}`}>
                    {'🧬 Последовательность'}
                  </button>
                )}
                {allPrimers.length > 0 && (
                  <button onClick={() => setActiveTab('primers')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'primers' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'}`}>
                    {'🧪 Праймеры'} ({allPrimers.length})
                  </button>
                )}
                {expertMode && calculated && protocolSteps.length > 0 && (
                  <button onClick={() => setActiveTab('protocol')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'protocol' ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500'}`}>
                    {'📋 Протокол'} ({protocolSteps.length})
                  </button>
                )}
                {expertMode && calculated && (
                  <button onClick={() => setActiveTab('stats')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'stats' ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500'}`}>
                    {'📊 Статистика'}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'sequence' && fragments.length > 0 && (
              <SequenceViewer fragments={fragments} circular={circular} primers={primers} />
            )}
            {activeTab === 'primers' && primers.length > 0 && (
              <PrimerPanel primers={allPrimers} warnings={[...apiWarnings]}
                orderSheet={orderSheet} primerQuality={primerQuality}
                primerMatches={primerMatches} onReusePrimer={handleReusePrimer}
                onDeletePrimer={(id) => deleteCustomPrimer(id)} />
            )}
            {activeTab === 'protocol' && calculated && (
              <>
                <ProtocolTracker fragments={fragments} junctions={junctions} primers={primers} pcrSizes={pcrSizes}
                  polymerase={polymerase} protocol={protocol} circular={circular}
                  assemblyId={active.id}
                  onInventoryUpdate={incrementInventoryVersion} />
                {!active.completed && (
                  <button onClick={completeAssembly}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition w-full">
                    {'✅'} Сборка завершена {'—'} создать продукт
                  </button>
                )}
              </>
            )}
            {activeTab === 'stats' && (
              <ExperimentStats assemblies={assemblies} />
            )}

            {/* Analysis panels */}
            {fragments.length > 0 && (
              <RestrictionPanel sequence={fragments.map(f => f.sequence || '').join('')}
                fragments={fragments} circular={circular} />
            )}
            {fragments.length > 0 && primers.length > 0 && (
              <VerificationPanel fragments={fragments} circular={circular} />
            )}

            {primers.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => exportGenBank(fragments, active.name || 'designed_construct', circular)}
                  className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200">
                  {t('Export GenBank')} (.gb)
                </button>
                <button onClick={() => exportProtocol(fragments, junctions, primers, protocol, circular)}
                  className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 border border-purple-200">
                  {t('Export Protocol')} (.txt)
                </button>
                <button onClick={async () => {
                  const r = await saveToPVCS(fragments, junctions, primers, protocol, circular);
                  if (r.success) alert('Сохранено в PlasmidVCS!'); else alert(`Ошибка: ${r.error}`);
                }}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">
                  {t('Save to PlasmidVCS')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      {modalMode && (
        <AddFragmentModal mode={modalMode} onAdd={addCustomFragment} onClose={() => setModalMode(null)} />
      )}
      {showMutagenesis && (
        <MutagenesisWizard onComplete={handleMutagenesis} onClose={() => setShowMutagenesis(false)} />
      )}
      {splitTarget !== null && fragments[splitTarget] && (
        <FragmentSplitter fragment={fragments[splitTarget]} onSplit={handleFragmentSplit}
          onClose={() => setSplitTarget(null)} partsLibrary={parts} />
      )}
      {editTarget !== null && fragments[editTarget] && (
        <FragmentEditor
          fragment={fragments[editTarget]}
          onSave={handleSaveFragment}
          onClose={() => setEditTarget(null)}
          onColorChange={(color) => {
            updateActive({
              fragments: fragments.map((f, i) => i === editTarget ? { ...f, customColor: color } : f),
            });
          }}
          onSaveAsVariant={handleSaveAsVariant}
        />
      )}
      {showPartsLib && (
        <PartsLibrary parts={parts} onClose={() => setShowPartsLib(false)}
          onOpenCDSEditor={(part) => { setGlobalCDSPart(part); setShowPartsLib(false); }}
          onAddToCanvas={(part) => addFragment(part)}
          onUpdatePart={(id, data) => updatePart(id, data)} />
      )}
      {globalCDSPart && (
        <FragmentEditor
          fragment={globalCDSPart}
          onSave={(updated) => {
            updatePart(globalCDSPart.id, updated);
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? updated : f), calculated: false, primers: [] });
            setGlobalCDSPart(null);
          }}
          onClose={() => setGlobalCDSPart(null)}
          onColorChange={(color) => {
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? { ...f, customColor: color } : f) });
          }}
        />
      )}
      {showDataMgr && (
        <DataManager onClose={() => setShowDataMgr(false)} parts={parts} projectName={projectName} />
      )}
      {/* First launch welcome */}
      {firstLaunch && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center">
            <h2 className="text-lg font-bold mb-2">Добро пожаловать в PlasmidVCS!</h2>
            <p className="text-sm text-gray-600 mb-6">Выберите режим работы:</p>
            <div className="flex gap-4">
              <button onClick={() => { if (expertMode) toggleExpertMode(); setFirstLaunch(false); }}
                className="flex-1 p-4 rounded-xl border-2 border-green-200 hover:bg-green-50 transition">
                <div className="text-2xl mb-2">{'🎓'}</div>
                <div className="font-semibold">Студент</div>
                <div className="text-[11px] text-gray-500 mt-1">Простой интерфейс для обучения клонированию</div>
              </button>
              <button onClick={() => { if (!expertMode) toggleExpertMode(); setFirstLaunch(false); }}
                className="flex-1 p-4 rounded-xl border-2 border-purple-200 hover:bg-purple-50 transition">
                <div className="text-2xl mb-2">{'🔬'}</div>
                <div className="font-semibold">Эксперт</div>
                <div className="text-[11px] text-gray-500 mt-1">Все инструменты: мутагенез, Golden Gate, протоколы</div>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-4">Можно переключить в любой момент в шапке программы</p>
          </div>
        </div>
      )}
      {showOligos && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/30"
          onClick={() => setShowOligos(false)}>
          <div className="w-[900px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <OligoManager assemblies={assemblies} onClose={() => setShowOligos(false)} />
          </div>
        </div>
      )}
    </DndProvider>
  );
}
