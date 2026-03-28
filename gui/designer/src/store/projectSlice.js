/**
 * Project Slice — projects, assemblies, active selection.
 * Manages the top-level hierarchy: Project → Assembly.
 */

function newAssembly(id, name) {
  return {
    id, name,
    fragments: [], junctions: [],
    assemblyType: 'overlap', protocol: 'overlap_pcr',
    circular: false, calculated: false,
    primers: [], customPrimers: [],
    apiWarnings: [], orderSheet: '', primerMatches: {},
    protocolSteps: [],
    completed: false, product: null,
  };
}

export const createProjectSlice = (set, get) => ({
  // ═══ State ═══
  projects: [{ id: 'proj_1', name: 'Проект 1', assemblies: [newAssembly('asm_1', 'Сборка 1')], activeId: 'asm_1' }],
  activeProjectId: 'proj_1',
  projectName: 'Проект 1',
  assemblies: [newAssembly('asm_1', 'Сборка 1')],
  activeId: 'asm_1',

  // ═══ Assembly actions ═══
  addAssembly: () => {
    const id = `asm_${Date.now()}`;
    set(state => {
      const num = state.assemblies.length + 1;
      state.assemblies.push(newAssembly(id, `Сборка ${num}`));
      state.activeId = id;
    }, false, 'addAssembly');
  },

  removeAssembly: (id) => {
    set(state => {
      if (state.assemblies.length <= 1) return;
      state.assemblies = state.assemblies.filter(a => a.id !== id);
      if (state.activeId === id) state.activeId = state.assemblies[0].id;
    }, false, 'removeAssembly');
  },

  renameAssembly: (id, name) => {
    set(state => {
      const asm = state.assemblies.find(a => a.id === id);
      if (asm) asm.name = name;
    }, false, 'renameAssembly');
  },

  switchAssembly: (id) => {
    set({ activeId: id }, false, 'switchAssembly');
  },

  // ═══ Project actions ═══
  setProjectName: (name) => set({ projectName: name }, false, 'setProjectName'),

  addProject: () => {
    set(state => {
      // Save current project
      const cur = state.projects.find(p => p.id === state.activeProjectId);
      if (cur) { cur.name = state.projectName; cur.assemblies = state.assemblies; cur.activeId = state.activeId; }

      const id = `proj_${Date.now()}`;
      const asmId = `asm_${Date.now()}`;
      state.projects.push({ id, name: `Проект ${state.projects.length + 1}`, assemblies: [newAssembly(asmId, 'Сборка 1')], activeId: asmId });
      state.activeProjectId = id;
      state.projectName = `Проект ${state.projects.length}`;
      state.assemblies = [newAssembly(asmId, 'Сборка 1')];
      state.activeId = asmId;
    }, false, 'addProject');
  },

  switchProject: (id) => {
    set(state => {
      if (id === state.activeProjectId) return;
      // Save current
      const cur = state.projects.find(p => p.id === state.activeProjectId);
      if (cur) { cur.name = state.projectName; cur.assemblies = state.assemblies; cur.activeId = state.activeId; }
      // Load target
      const proj = state.projects.find(p => p.id === id);
      if (!proj) return;
      state.activeProjectId = id;
      state.projectName = proj.name;
      state.assemblies = proj.assemblies || [newAssembly('asm_1', 'Сборка 1')];
      state.activeId = proj.activeId || proj.assemblies?.[0]?.id || 'asm_1';
    }, false, 'switchProject');
  },

  removeProject: (id) => {
    set(state => {
      if (state.projects.length <= 1) return;
      state.projects = state.projects.filter(p => p.id !== id);
      if (id === state.activeProjectId) {
        const next = state.projects[0];
        state.activeProjectId = next.id;
        state.projectName = next.name;
        state.assemblies = next.assemblies || [newAssembly('asm_1', 'Сборка 1')];
        state.activeId = next.activeId || next.assemblies?.[0]?.id || 'asm_1';
      }
    }, false, 'removeProject');
  },
});

export { newAssembly };
