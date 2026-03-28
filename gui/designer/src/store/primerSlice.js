/**
 * Primer Slice — assembly/custom primer management, generation.
 *
 * Three categories:
 *   assembly[]     — auto-generated for junctions (overwritten on recalculate)
 *   custom[]       — user-created in Sequence View (preserved across recalculations)
 *   verification[] — colony PCR + sequencing (future)
 */

export const createPrimerSlice = (set, get) => ({
  // ═══ Settings ═══
  polymerase: 'phusion',
  primerPrefix: 'IS',
  loading: false,

  setPolymerase: (v) => set({ polymerase: v }, false, 'setPolymerase'),
  setPrimerPrefix: (v) => set({ primerPrefix: v }, false, 'setPrimerPrefix'),

  // ═══ Primer actions ═══
  addCustomPrimer: (primer) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      if (!asm.customPrimers) asm.customPrimers = [];
      asm.customPrimers.push({
        ...primer,
        id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        category: 'custom',
        createdAt: new Date().toISOString(),
      });
    }, false, 'addCustomPrimer');
  },

  deleteCustomPrimer: (id) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.customPrimers = (asm.customPrimers || []).filter(p => p.id !== id);
    }, false, 'deleteCustomPrimer');
  },

  /** Set assembly primers (from generate or KLD). Overwrites, does not touch custom. */
  setAssemblyPrimers: (primers, extras = {}) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.primers = primers;
      asm.calculated = true;
      Object.assign(asm, extras);
    }, false, 'setAssemblyPrimers');
  },

  setLoading: (v) => set({ loading: v }, false, 'setLoading'),
});
