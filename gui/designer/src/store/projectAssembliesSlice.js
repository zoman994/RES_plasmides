/**
 * projectAssembliesSlice — список сборок активного проекта для рельса
 * (UX_DIRECTION фаза 2: «при выборе проекта сборки раскрываются из проекта»).
 *
 * Сборки = zones, живут в skeleton-state канваса и персистятся ПО ПРОЕКТУ в
 * IndexedDB (`stateKeyFor(projectId)`). Главный стор (где сайдбар) их не держит,
 * поэтому здесь мы асинхронно читаем снапшот активного проекта и кешируем
 * лёгкий список `{id, name}` для отрисовки в рельсе.
 *
 * `pendingAssemblyId` — мост к skeleton-context (который владеет
 * `activeAssemblyId` в СВОЁМ сторе): рельс ставит id перед открытием канваса,
 * `SkeletonProvider` его «потребляет» и фокусирует нужную вкладку-сборку.
 */
import { loadSnapshot } from '../components/CanvasSkeleton/store/skeleton-persistence';

// Sentinel `pendingAssemblyId` meaning «create a NEW assembly on open» (the rail's
// «Новая сборка»): the rail can't dispatch CREATE_ZONE into the skeleton store, so it
// sets this sentinel + opens the canvas; SkeletonProvider sees it, creates a fresh zone
// and focuses it (mirrors the «focus an existing assembly by id» bridge).
export const PENDING_NEW_ASSEMBLY = '__new_assembly__';

export function createProjectAssembliesSlice(set, get) {
  return {
    activeProjectAssemblies: [], // [{ id, name }]
    pendingAssemblyId: null,

    setActiveProjectAssemblies: (list) => set((s) => {
      s.activeProjectAssemblies = Array.isArray(list) ? list : [];
    }),

    setPendingAssemblyId: (id) => set((s) => { s.pendingAssemblyId = id || null; }),

    consumePendingAssemblyId: () => {
      const id = get().pendingAssemblyId;
      if (id) set((s) => { s.pendingAssemblyId = null; });
      return id || null;
    },

    /**
     * Перечитать сборки активного проекта из его per-project снапшота.
     * No-op в безопасную сторону при отсутствии проекта / гонке смены проекта.
     */
    refreshActiveProjectAssemblies: async () => {
      const id = get().currentProjectId;
      if (!id) { set((s) => { s.activeProjectAssemblies = []; }); return; }
      let zones = [];
      try {
        const snap = await loadSnapshot(id);
        zones = Array.isArray(snap && snap.zones) ? snap.zones : [];
      } catch { zones = []; }
      // Проект могли переключить пока грузился снапшот — не затираем чужим.
      if (get().currentProjectId !== id) return;
      set((s) => {
        s.activeProjectAssemblies = zones.map((z) => ({ id: z.id, name: z.name || 'Сборка' }));
      });
    },
  };
}

export function selectActiveProjectAssemblies(state) {
  return Array.isArray(state && state.activeProjectAssemblies) ? state.activeProjectAssemblies : [];
}
