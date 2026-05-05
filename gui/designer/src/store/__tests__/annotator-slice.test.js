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

  // ─── Sprint M-X.3 follow-up (05.05.2026, Stage C) — Annotator
  // map sub-tab (Linear / Circular). The dual-body Table/Preview
  // shell is gone (Stage B); activeTab now selects the map view
  // inside PreviewTab. Biolog: «по вкладке можно еще переключиться
  // в окно просмотра кольцевой ерсии плазмиды/фрагмента».
  it('activeTab defaults to "linear"', () => {
    const a = selectAnnotator(useStore.getState());
    expect(a.activeTab).toBe('linear');
  });

  it('setAnnotatorActiveTab switches between linear and circular', () => {
    useStore.getState().setAnnotatorActiveTab('circular');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('circular');
    useStore.getState().setAnnotatorActiveTab('linear');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('linear');
  });

  it('setAnnotatorActiveTab ignores garbage values', () => {
    useStore.getState().setAnnotatorActiveTab('linear');
    useStore.getState().setAnnotatorActiveTab('not-a-tab');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('linear');
    useStore.getState().setAnnotatorActiveTab(null);
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('linear');
    // Old value 'preview' is no longer valid.
    useStore.getState().setAnnotatorActiveTab('preview');
    expect(selectAnnotator(useStore.getState()).activeTab).toBe('linear');
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

  // ─── Sprint M-X.3 follow-up — bulk accept ─────────────────────────
  // Biolog: «добавь возможность одним кликом согласиться со всеми
  // комон фичами которые нашел на L1». Bulk shortcut for the
  // unverdicted hits without trampling the user's manual rejects.
  describe('acceptManyRegions', () => {
    it('accepts every id in the list', () => {
      useStore.getState().acceptManyRegions(['a', 'b', 'c']);
      const a = selectAnnotator(useStore.getState());
      expect(a.acceptedRegionIds.a).toBe(true);
      expect(a.acceptedRegionIds.b).toBe(true);
      expect(a.acceptedRegionIds.c).toBe(true);
    });

    it('preserves a manually rejected id (does not flip to accepted)', () => {
      useStore.getState().rejectRegion('a');
      useStore.getState().acceptManyRegions(['a', 'b']);
      const a = selectAnnotator(useStore.getState());
      // 'a' stays rejected — bulk shortcut respects manual choices.
      expect(a.acceptedRegionIds.a).toBeUndefined();
      expect(a.rejectedRegionIds.a).toBe(true);
      // 'b' was pending, now accepted.
      expect(a.acceptedRegionIds.b).toBe(true);
    });

    it('clears selectedGhostId when the drilled-in ghost is bulk-accepted', () => {
      useStore.getState().setSelectedGhost('ghost-x');
      useStore.getState().acceptManyRegions(['ghost-x', 'ghost-y']);
      expect(selectAnnotator(useStore.getState()).selectedGhostId).toBeNull();
    });

    it('keeps selectedGhostId when none of the bulk ids matches', () => {
      useStore.getState().setSelectedGhost('ghost-x');
      useStore.getState().acceptManyRegions(['ghost-y', 'ghost-z']);
      expect(selectAnnotator(useStore.getState()).selectedGhostId).toBe('ghost-x');
    });

    it('empty / non-array input is a safe no-op', () => {
      const before = selectAnnotator(useStore.getState()).acceptedRegionIds;
      useStore.getState().acceptManyRegions([]);
      useStore.getState().acceptManyRegions(null);
      useStore.getState().acceptManyRegions(undefined);
      const after = selectAnnotator(useStore.getState()).acceptedRegionIds;
      expect(after).toEqual(before);
    });

    it('skips garbage entries (non-string / empty) without throwing', () => {
      useStore.getState().acceptManyRegions(['valid-id', '', null, 42, 'another']);
      const a = selectAnnotator(useStore.getState());
      expect(a.acceptedRegionIds['valid-id']).toBe(true);
      expect(a.acceptedRegionIds['another']).toBe(true);
      expect(Object.keys(a.acceptedRegionIds)).toHaveLength(2);
    });
  });

  // Sprint M-X.3 follow-up — biolog: «На скрытие дубликата поставь
  // галку, вдруг кто то и захочет их видеть». User-controlled
  // duplicate-visibility toggle.
  describe('setAnnotatorShowDuplicates', () => {
    it('defaults to false', () => {
      const a = selectAnnotator(useStore.getState());
      expect(a.showDuplicates).toBe(false);
    });

    it('flips the flag', () => {
      useStore.getState().setAnnotatorShowDuplicates(true);
      expect(selectAnnotator(useStore.getState()).showDuplicates).toBe(true);
      useStore.getState().setAnnotatorShowDuplicates(false);
      expect(selectAnnotator(useStore.getState()).showDuplicates).toBe(false);
    });

    it('coerces truthy/falsy inputs to booleans', () => {
      useStore.getState().setAnnotatorShowDuplicates('yes');
      expect(selectAnnotator(useStore.getState()).showDuplicates).toBe(true);
      useStore.getState().setAnnotatorShowDuplicates(0);
      expect(selectAnnotator(useStore.getState()).showDuplicates).toBe(false);
    });
  });
});
