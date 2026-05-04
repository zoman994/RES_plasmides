/**
 * annotator-slice.test.js — Sprint M-X.2 K6 coverage for the
 * `annotator` slice on uiSlice (DEC-ANN-07).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../index';
import { ANNOTATOR_STORAGE_KEY, ANNOTATOR_DEFAULTS, selectAnnotator } from '../uiSlice';
import { _setFallbackForTests, _resetMemoryStore, getJSON } from '../../lib/storage';

function resetAnnotator() {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { ...ANNOTATOR_DEFAULTS.enabledPluginIds },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
    };
  });
}

describe('K6 annotator slice', () => {
  beforeEach(() => {
    _setFallbackForTests(true);
    _resetMemoryStore();
    resetAnnotator();
  });

  afterEach(() => {
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  it('openAnnotator sets open=true and stores the scope', () => {
    useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' });
    expect(selectAnnotator(useStore.getState()).open).toBe(true);
    expect(selectAnnotator(useStore.getState()).scope).toEqual({ kind: 'full', sequenceId: 'p1' });
  });

  it('closeAnnotator preserves results and pendingEdits (re-open in same session)', () => {
    useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' });
    useStore.getState().setAnnotatorResult('orf-scan', { pluginId: 'orf-scan', regions: [] });
    useStore.getState().acceptRegion('r1');
    useStore.getState().closeAnnotator();
    expect(selectAnnotator(useStore.getState()).open).toBe(false);
    expect(selectAnnotator(useStore.getState()).results['orf-scan']).toBeTruthy();
    expect(selectAnnotator(useStore.getState()).acceptedRegionIds.r1).toBe(true);
  });

  it('togglePlugin flips a plugin and persists enabled map + threshold to localStorage', () => {
    useStore.getState().togglePlugin('blast-ncbi');
    expect(selectAnnotator(useStore.getState()).enabledPluginIds['blast-ncbi']).toBe(true);
    const persisted = getJSON(ANNOTATOR_STORAGE_KEY, null);
    expect(persisted).toBeTruthy();
    expect(persisted.enabledPluginIds['blast-ncbi']).toBe(true);
    expect(persisted.threshold).toBe(ANNOTATOR_DEFAULTS.threshold);
  });

  it('setAnnotatorThreshold persists value (clamped to [0,1])', () => {
    useStore.getState().setAnnotatorThreshold(0.5);
    expect(selectAnnotator(useStore.getState()).threshold).toBe(0.5);
    useStore.getState().setAnnotatorThreshold(2.0); // out of range — ignored
    expect(selectAnnotator(useStore.getState()).threshold).toBe(0.5);
  });

  it('acceptRegion / rejectRegion are mutually exclusive', () => {
    useStore.getState().acceptRegion('r1');
    expect(selectAnnotator(useStore.getState()).acceptedRegionIds.r1).toBe(true);
    useStore.getState().rejectRegion('r1');
    expect(selectAnnotator(useStore.getState()).rejectedRegionIds.r1).toBe(true);
    expect(selectAnnotator(useStore.getState()).acceptedRegionIds.r1).toBeUndefined();
    useStore.getState().acceptRegion('r1');
    expect(selectAnnotator(useStore.getState()).acceptedRegionIds.r1).toBe(true);
    expect(selectAnnotator(useStore.getState()).rejectedRegionIds.r1).toBeUndefined();
  });

  it('clearRegionVerdict removes both flags', () => {
    useStore.getState().acceptRegion('r1');
    useStore.getState().clearRegionVerdict('r1');
    expect(selectAnnotator(useStore.getState()).acceptedRegionIds.r1).toBeUndefined();
  });

  it('editPendingRegion accumulates patches', () => {
    useStore.getState().editPendingRegion('r1', { name: 'foo' });
    useStore.getState().editPendingRegion('r1', { strand: -1 });
    expect(selectAnnotator(useStore.getState()).pendingEdits.r1).toEqual({ name: 'foo', strand: -1 });
  });

  it('resetAnnotatorScope clears transient state but preserves enabled + threshold', () => {
    useStore.getState().togglePlugin('blast-ncbi');
    useStore.getState().setAnnotatorThreshold(0.85);
    useStore.getState().acceptRegion('r1');
    useStore.getState().setAnnotatorResult('orf-scan', { pluginId: 'orf-scan', regions: [] });
    useStore.getState().resetAnnotatorScope();
    const a = selectAnnotator(useStore.getState());
    expect(a.acceptedRegionIds).toEqual({});
    expect(a.results).toEqual({});
    expect(a.enabledPluginIds['blast-ncbi']).toBe(true);
    expect(a.threshold).toBe(0.85);
  });

  it('openAnnotator on a different sequenceId resets transient state', () => {
    useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' });
    useStore.getState().acceptRegion('r1');
    useStore.getState().setAnnotatorResult('orf-scan', { pluginId: 'orf-scan', regions: [] });
    // Switch plasmid → reset.
    useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p2' });
    const a = selectAnnotator(useStore.getState());
    expect(a.acceptedRegionIds).toEqual({});
    expect(a.results).toEqual({});
  });

  // ─── Sprint M-X.3 K3 — Annotator dual-tab activeTab ─────────────
  // Sprint M-X.3 follow-up (05.05.2026, Stage A) — biolog wants the
  // map (Preview) to be the default landing surface, not the table:
  // «открыватся аннотатор … и на этой карте показывают гост фичи».
  it('activeTab defaults to "preview"', () => {
    const a = selectAnnotator(useStore.getState());
    expect(a.activeTab).toBe('preview');
  });

  it('setAnnotatorActiveTab switches between table and preview', () => {
    useStore.getState().setAnnotatorActiveTab('preview');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('preview');
    useStore.getState().setAnnotatorActiveTab('table');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('table');
  });

  it('setAnnotatorActiveTab ignores garbage values', () => {
    useStore.getState().setAnnotatorActiveTab('table');
    useStore.getState().setAnnotatorActiveTab('not-a-tab');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('table');
    useStore.getState().setAnnotatorActiveTab(null);
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('table');
  });

  // ─── Sprint M-X.3 K4 — selectedGhostId for the drill-in panel ──
  it('selectedGhostId defaults to null', () => {
    const a = selectAnnotator(useStore.getState());
    expect(a.selectedGhostId).toBeNull();
  });

  it('setSelectedGhost sets and clears the id', () => {
    useStore.getState().setSelectedGhost('ghost-r1');
    expect(selectAnnotator(useStore.getState()).selectedGhostId).toBe('ghost-r1');
    useStore.getState().setSelectedGhost(null);
    expect(selectAnnotator(useStore.getState()).selectedGhostId).toBeNull();
  });

  it('acceptRegion clears selectedGhostId if it matches', () => {
    useStore.getState().setSelectedGhost('ghost-r1');
    useStore.getState().acceptRegion('ghost-r1');
    expect(selectAnnotator(useStore.getState()).selectedGhostId).toBeNull();
  });

  it('rejectRegion clears selectedGhostId if it matches', () => {
    useStore.getState().setSelectedGhost('ghost-r1');
    useStore.getState().rejectRegion('ghost-r1');
    expect(selectAnnotator(useStore.getState()).selectedGhostId).toBeNull();
  });

  it('accepting a different region leaves selectedGhostId untouched', () => {
    useStore.getState().setSelectedGhost('ghost-r1');
    useStore.getState().acceptRegion('ghost-r2');
    expect(selectAnnotator(useStore.getState()).selectedGhostId).toBe('ghost-r1');
  });
});
