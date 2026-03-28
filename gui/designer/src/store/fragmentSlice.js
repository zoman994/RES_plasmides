/**
 * Fragment Slice — fragments on canvas, CRUD operations.
 * Fragments are instances of Parts placed in an assembly.
 */

let nextId = 1;
export const setNextId = (n) => { nextId = n; };

export const createFragmentSlice = (set, get) => ({
  // ═══ Parts library (global, not per-assembly) ═══
  parts: [],
  setParts: (parts) => set({ parts }, false, 'setParts'),
  addPart: (part) => set(state => { state.parts.push(part); }, false, 'addPart'),
  updatePart: (id, updates) => set(state => {
    const p = state.parts.find(x => x.id === id);
    if (p) Object.assign(p, updates);
  }, false, 'updatePart'),

  // ═══ Fragment actions (modify active assembly) ═══
  addFragment: (part) => {
    const frag = {
      id: `f${nextId++}`, name: part.name, type: part.type,
      sequence: part.sequence || '', length: part.length || 0,
      strand: 1, needsAmplification: part.needsAmplification ?? true,
      sourceAssemblyId: part.sourceAssemblyId, partId: part.id,
      customColor: part.customColor, domains: part.domains,
    };
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.fragments.push(frag);
      // Add junction if more than 1 fragment
      if (asm.fragments.length > 1) {
        asm.junctions.push({
          type: asm.assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
          enzyme: 'BsaI', overhang: '',
        });
      }
      asm.calculated = false;
      asm.primers = [];
    }, false, 'addFragment');
    // Auto-adjust junctions (force GG for identical neighbors, etc.)
    get().autoAdjustJunctions();
    // Auto-design GG overhangs if any junction is GG
    const asm = get().assemblies.find(a => a.id === get().activeId);
    if (asm?.junctions.some(j => j.type === 'golden_gate')) {
      setTimeout(() => get().autoDesignGGOverhangs(), 50);
    }
  },

  removeFragment: (index) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.fragments.splice(index, 1);
      // Rebuild junctions
      const n = asm.fragments.length;
      const count = asm.circular ? n : Math.max(0, n - 1);
      asm.junctions = Array.from({ length: count }, (_, i) => asm.junctions[i] || {
        type: asm.assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
        overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
      });
      asm.calculated = false;
    }, false, 'removeFragment');
  },

  flipFragment: (index) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const f = asm.fragments[index];
      if (!f) return;
      const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
      f.sequence = f.sequence.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');
      f.strand = f.strand === 1 ? -1 : 1;
      asm.calculated = false;
      asm.primers = [];
    }, false, 'flipFragment');
  },

  reorderFragments: (from, to) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm || from === to) return;
      const [moved] = asm.fragments.splice(from, 1);
      asm.fragments.splice(to, 0, moved);
      // Rebuild junctions
      const n = asm.fragments.length;
      const count = asm.circular ? n : Math.max(0, n - 1);
      asm.junctions = Array.from({ length: count }, () => ({
        type: asm.assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
        overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
      }));
      asm.calculated = false;
    }, false, 'reorderFragments');
  },

  toggleAmplification: (index) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const f = asm.fragments[index];
      if (f) f.needsAmplification = !f.needsAmplification;
      asm.calculated = false;
    }, false, 'toggleAmplification');
    // Auto-adjust junction modes after toggling
    get().autoAdjustJunctions();
  },

  updateFragment: (index, updates) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm || !asm.fragments[index]) return;
      Object.assign(asm.fragments[index], updates);
      asm.calculated = false;
      asm.primers = [];
    }, false, 'updateFragment');
  },
});
