import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, bootstrapStore } from '../index';

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState((s) => {
    s.currentProjectId = null;
    s.activeProjectAssemblies = [];
    s.pendingAssemblyId = null;
  });
});

describe('projectAssembliesSlice', () => {
  it('setActiveProjectAssemblies устанавливает список (guard на не-массив)', () => {
    useStore.getState().setActiveProjectAssemblies([{ id: 'z1', name: 'Сборка 1' }]);
    expect(useStore.getState().activeProjectAssemblies).toEqual([{ id: 'z1', name: 'Сборка 1' }]);
    useStore.getState().setActiveProjectAssemblies(null);
    expect(useStore.getState().activeProjectAssemblies).toEqual([]);
  });

  it('pendingAssemblyId: set + consume (возвращает и очищает)', () => {
    useStore.getState().setPendingAssemblyId('z7');
    expect(useStore.getState().pendingAssemblyId).toBe('z7');
    const got = useStore.getState().consumePendingAssemblyId();
    expect(got).toBe('z7');
    expect(useStore.getState().pendingAssemblyId).toBe(null);
    expect(useStore.getState().consumePendingAssemblyId()).toBe(null);
  });

  it('refreshActiveProjectAssemblies без проекта → пустой список', async () => {
    useStore.setState((s) => { s.activeProjectAssemblies = [{ id: 'stale', name: 'x' }]; });
    await useStore.getState().refreshActiveProjectAssemblies();
    expect(useStore.getState().activeProjectAssemblies).toEqual([]);
  });

  it('refreshActiveProjectAssemblies с проектом без снапшота → пустой (не падает)', async () => {
    useStore.setState((s) => { s.currentProjectId = 'p-no-snapshot'; });
    await useStore.getState().refreshActiveProjectAssemblies();
    expect(useStore.getState().activeProjectAssemblies).toEqual([]);
  });
});
