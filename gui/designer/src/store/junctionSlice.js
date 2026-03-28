/**
 * Junction Slice — junctions between fragments, Golden Gate overhangs.
 * Handles overlap/GG/RE/KLD junction configuration.
 */
import { GG_ENZYMES, checkInternalSites, designOverhangs, resolveConflicts } from '../golden-gate';

export const createJunctionSlice = (set, get) => ({
  // ═══ GG-specific state ═══
  ggEnzyme: 'BsaI',
  ggSiteCheck: null,

  setGgEnzyme: (enzyme) => set({ ggEnzyme: enzyme }, false, 'setGgEnzyme'),

  // ═══ Junction actions ═══
  updateJunction: (index, config) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm || !asm.junctions[index]) return;

      // Auto-extract overhang when switching to golden_gate
      if (config.type === 'golden_gate' && asm.junctions[index].type !== 'golden_gate') {
        const left = asm.fragments[index];
        const right = asm.fragments[(index + 1) % asm.fragments.length];
        if (left?.sequence && right?.sequence) {
          const ovLen = GG_ENZYMES[config.enzyme || state.ggEnzyme]?.overhangLength || 4;
          const half = Math.floor(ovLen / 2);
          config.overhang = (left.sequence.slice(-half) + right.sequence.slice(0, ovLen - half)).toUpperCase();
        }
        config.enzyme = config.enzyme || state.ggEnzyme;
      }

      Object.assign(asm.junctions[index], config);
      asm.calculated = false;
    }, false, 'updateJunction');
  },

  toggleCircular: () => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.circular = !asm.circular;
      const n = asm.fragments.length;
      const count = asm.circular ? n : Math.max(0, n - 1);
      asm.junctions = Array.from({ length: count }, (_, i) => asm.junctions[i] || {
        type: asm.assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
        overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
      });
      asm.calculated = false;
    }, false, 'toggleCircular');
  },

  setAssemblyType: (type) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (asm) asm.assemblyType = type;
    }, false, 'setAssemblyType');
    if (type === 'golden_gate') {
      setTimeout(() => get().autoDesignGGOverhangs(), 50);
    }
  },

  /** Auto-adjust junction modes based on fragment amplification status + identical neighbors. */
  autoAdjustJunctions: () => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const n = asm.fragments.length;
      asm.junctions.forEach((j, i) => {
        const left = asm.fragments[i];
        const right = asm.fragments[(i + 1) % n];
        if (!left || !right) return;

        // Force GG for identical adjacent fragments
        if (left.sequence && right.sequence && left.sequence === right.sequence) {
          if (j.type === 'overlap' || !j.type) {
            j.type = 'golden_gate';
            j.enzyme = j.enzyme || state.ggEnzyme || 'BsaI';
            j.autoMode = true;
            j.autoReason = 'Идентичные фрагменты — только Golden Gate';
          }
          return;
        }

        if (j.type !== 'overlap') return;
        const lPCR = left.needsAmplification !== false;
        const rPCR = right.needsAmplification !== false;
        if (!lPCR && rPCR) { j.overlapMode = 'right_only'; j.autoMode = true; }
        else if (lPCR && !rPCR) { j.overlapMode = 'left_only'; j.autoMode = true; }
        else if (!lPCR && !rPCR) { j.autoMode = true; j.autoWarning = 'Оба без ПЦР'; }
      });
    }, false, 'autoAdjustJunctions');
  },

  /** Auto-design Golden Gate overhangs for all GG junctions. */
  autoDesignGGOverhangs: () => {
    const state = get();
    const asm = state.assemblies.find(a => a.id === state.activeId);
    if (!asm || asm.fragments.length < 2) return;

    const siteCheck = checkInternalSites(asm.fragments, state.ggEnzyme);
    const enzyme = siteCheck.ok ? state.ggEnzyme : (siteCheck.alternatives?.[0] || state.ggEnzyme);

    set(s => { s.ggSiteCheck = siteCheck; }, false, 'setGgSiteCheck');
    if (!siteCheck.ok && siteCheck.alternatives?.length) {
      set({ ggEnzyme: enzyme }, false, 'autoSwitchGgEnzyme');
    }

    const ovLen = GG_ENZYMES[enzyme]?.overhangLength || 4;

    // Extract overhangs from sequences
    set(s => {
      const a = s.assemblies.find(x => x.id === s.activeId);
      if (!a) return;
      a.junctions.forEach((j, i) => {
        if (j.type !== 'golden_gate' && a.assemblyType !== 'golden_gate') return;
        j.type = 'golden_gate';
        j.enzyme = enzyme;
        const left = a.fragments[i];
        const right = a.fragments[(i + 1) % a.fragments.length];
        if (left?.sequence && right?.sequence) {
          const half = Math.floor(ovLen / 2);
          j.overhang = (left.sequence.slice(-half) + right.sequence.slice(0, ovLen - half)).toUpperCase();
        }
      });
    }, false, 'extractOverhangs');

    // Validate and resolve conflicts
    const result = designOverhangs(asm.fragments, enzyme, asm.circular);
    if (!result.valid) {
      const resolved = resolveConflicts(asm.fragments, enzyme, asm.circular);
      if (resolved.overhangs?.length) {
        set(s => {
          const a = s.assemblies.find(x => x.id === s.activeId);
          if (!a) return;
          a.junctions.forEach((j, i) => {
            if (j.type === 'golden_gate' && resolved.overhangs[i]) {
              j.overhang = resolved.overhangs[i].sequence;
            }
          });
        }, false, 'resolveGGConflicts');
      }
    }
  },
});
