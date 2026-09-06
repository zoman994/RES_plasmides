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

function setTaggedResult(pluginId, result, entryId = 'p1') {
  const key = useStore.getState().beginAnnotatorJob({
    entryId,
    docEpoch: 1,
    topology: 'linear',
    scope: { kind: 'full' },
  }, [pluginId]);
  useStore.getState().setAnnotatorResult(pluginId, result, key);
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
    setTaggedResult('orf-scan', { pluginId: 'orf-scan', regions: [] });
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
    setTaggedResult('orf-scan', { pluginId: 'orf-scan', regions: [] });
    useStore.getState().resetAnnotatorScope();
    const a = selectAnnotator(useStore.getState());
    expect(a.acceptedRegionIds).toEqual({});
    expect(a.results).toEqual({});
    expect(a.enabledPluginIds['blast-ncbi']).toBe(true);
    expect(a.threshold).toBe(0.85);
  });

  it('a canonical entry context change resets transient state', () => {
    useStore.getState().syncAnnotatorContext({
      entryId: 'p1', docEpoch: 1, topology: 'linear', scope: { kind: 'full' },
    });
    useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' });
    useStore.getState().acceptRegion('r1');
    setTaggedResult('orf-scan', { pluginId: 'orf-scan', regions: [] });
    // A UI sequenceId is only routing metadata; canonical context owns reset.
    useStore.getState().syncAnnotatorContext({
      entryId: 'p2', docEpoch: 1, topology: 'linear', scope: { kind: 'full' },
    });
    useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p2' });
    const a = selectAnnotator(useStore.getState());
    expect(a.acceptedRegionIds).toEqual({});
    expect(a.results).toEqual({});
  });

  it('keys same-context jobs monotonically and stale callbacks cannot write or clear the newer run', () => {
    const context = {
      entryId: 'p1',
      docEpoch: 7,
      topology: 'circular',
      scope: { kind: 'full' },
    };

    const staleKey = useStore.getState().beginAnnotatorJob(context, ['orf-scan']);
    useStore.getState().setAnnotatorRunning('orf-scan', true, staleKey);
    const freshKey = useStore.getState().beginAnnotatorJob(context, ['orf-scan']);
    useStore.getState().setAnnotatorRunning('orf-scan', true, freshKey);

    expect(staleKey).not.toBe(freshKey);
    expect(staleKey).toContain('|7|circular|full|1');
    expect(freshKey).toContain('|7|circular|full|2');

    useStore.getState().setAnnotatorResult(
      'orf-scan',
      { pluginId: 'orf-scan', regions: [{ id: 'stale' }] },
      staleKey,
    );
    useStore.getState().setAnnotatorRunning('orf-scan', false, staleKey);
    useStore.getState().setAnnotatorResult(
      'orf-scan',
      { pluginId: 'orf-scan', regions: [{ id: 'untagged' }] },
    );

    let annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['orf-scan']).toBeUndefined();
    expect(annotator.running['orf-scan']).toBe(freshKey);

    useStore.getState().setAnnotatorResult(
      'orf-scan',
      { pluginId: 'orf-scan', regions: [{ id: 'fresh' }] },
      freshKey,
    );
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['orf-scan'].regions[0].id).toBe('fresh');
    expect(annotator.running['orf-scan']).toBeUndefined();
  });

  it('shares one key across a multi-plugin job and completes running independently', () => {
    const context = {
      entryId: 'p1', docEpoch: 8, topology: 'circular', scope: { kind: 'full' },
    };
    const key = useStore.getState().beginAnnotatorJob(context, ['orf-scan', 'sigma70-promoter']);
    let annotator = selectAnnotator(useStore.getState());
    expect(annotator.activeRunKeys['orf-scan']).toBe(key);
    expect(annotator.activeRunKeys['sigma70-promoter']).toBe(key);
    expect(annotator.running['orf-scan']).toBe(key);
    expect(annotator.running['sigma70-promoter']).toBe(key);

    useStore.getState().setAnnotatorResult(
      'orf-scan', { pluginId: 'orf-scan', regions: [{ id: 'orf' }] }, key,
    );
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.running['orf-scan']).toBeUndefined();
    expect(annotator.running['sigma70-promoter']).toBe(key);
    useStore.getState().setAnnotatorResult(
      'sigma70-promoter', { pluginId: 'sigma70-promoter', regions: [{ id: 'sigma' }] }, key,
    );
    annotator = selectAnnotator(useStore.getState());
    expect(Object.keys(annotator.results).sort()).toEqual(['orf-scan', 'sigma70-promoter']);
    expect(annotator.running).toEqual({});
  });

  it('full to region and region A to B supersede only the targeted plugin', () => {
    const doc = { entryId: 'p1', docEpoch: 9, topology: 'circular' };
    const l1Key = useStore.getState().beginAnnotatorJob(
      { ...doc, scope: { kind: 'full' } }, ['common-features-homology'],
    );
    useStore.getState().setAnnotatorResult(
      'common-features-homology',
      { pluginId: 'common-features-homology', regions: [{ id: 'l1-full' }] },
      l1Key,
    );
    useStore.getState().acceptRegion('l1-full');

    const l3AKey = useStore.getState().beginAnnotatorJob({
      ...doc, scope: { kind: 'region', region: { start: 10, end: 40 } },
    }, ['blast-ncbi']);
    let annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['common-features-homology'].regions[0].id).toBe('l1-full');
    expect(annotator.acceptedRegionIds['l1-full']).toBe(true);
    useStore.getState().setAnnotatorResult(
      'blast-ncbi', { pluginId: 'blast-ncbi', regions: [{ id: 'l3-a' }] }, l3AKey,
    );
    useStore.getState().acceptRegion('l3-a');

    const l3BKey = useStore.getState().beginAnnotatorJob({
      ...doc, scope: { kind: 'region', region: { start: 50, end: 80 } },
    }, ['blast-ncbi']);
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['common-features-homology'].regions[0].id).toBe('l1-full');
    expect(annotator.acceptedRegionIds['l1-full']).toBe(true);
    expect(annotator.results['blast-ncbi']).toBeUndefined();
    expect(annotator.acceptedRegionIds['l3-a']).toBeUndefined();
    expect(annotator.running['blast-ncbi']).toBe(l3BKey);
  });

  it('docEpoch and topology changes invalidate every plugin and verdict', () => {
    const seed = (docEpoch, topology) => {
      const key = useStore.getState().beginAnnotatorJob({
        entryId: 'p1', docEpoch, topology, scope: { kind: 'full' },
      }, ['orf-scan', 'blast-ncbi']);
      useStore.getState().setAnnotatorResult(
        'orf-scan', { pluginId: 'orf-scan', regions: [{ id: `orf-${docEpoch}-${topology}` }] }, key,
      );
      useStore.getState().acceptRegion(`orf-${docEpoch}-${topology}`);
    };
    seed(1, 'circular');
    useStore.getState().syncAnnotatorContext({
      entryId: 'p1', docEpoch: 2, topology: 'circular', scope: { kind: 'region', region: { start: 1, end: 9 } },
    });
    let annotator = selectAnnotator(useStore.getState());
    expect(annotator.results).toEqual({});
    expect(annotator.acceptedRegionIds).toEqual({});
    expect(annotator.running).toEqual({});

    seed(2, 'circular');
    useStore.getState().syncAnnotatorContext({
      entryId: 'p1', docEpoch: 2, topology: 'linear', scope: { kind: 'full' },
    });
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.results).toEqual({});
    expect(annotator.acceptedRegionIds).toEqual({});
    expect(annotator.running).toEqual({});
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
