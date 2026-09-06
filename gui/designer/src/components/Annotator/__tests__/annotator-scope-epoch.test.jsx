/**
 * ANN-INTEGRITY / BG-033: async Annotator replies are bound to the exact
 * document, effective scope, plugin set, and monotonic execution that launched
 * them. The production-shaped test below exercises two real L2 runs rather
 * than calling the result reducer directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS, selectAnnotator } from '../../../store/uiSlice';
import { _setFallbackForTests, _resetMemoryStore } from '../../../lib/storage';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import AnnotationsTab from '../../Library/inspector/tabs/AnnotationsTab.jsx';
import {
  documentSignature,
  makeRunKey,
  runContextSignature,
  scopeSignature,
  isStaleReply,
  nextJob,
} from '../../../lib/annotator-run-identity';

vi.mock('../PreviewTab.jsx', () => ({
  default: ({ onBlastSelection, selection }) => (
    <>
      <button
        type="button"
        data-testid="probe-blast-region"
        onClick={() => onBlastSelection?.({ start: 12, end: 48, strand: -1 })}
      >probe region</button>
      <button
        type="button"
        data-testid="probe-live-selection"
        onClick={() => selection?.onSelectRange?.(70, 100, 'dna', 1)}
      >move live selection</button>
      <button
        type="button"
        data-testid="probe-gene-a"
        onClick={() => selection?.onSelectRange?.(0, 240, 'dna', 1)}
      >select gene A</button>
      <button
        type="button"
        data-testid="probe-gene-b"
        onClick={() => selection?.onSelectRange?.(300, 540, 'dna', 1)}
      >select gene B</button>
      <span data-testid="probe-selection-value">
        {selection?.hasSelection ? `${selection.selStart}:${selection.selEnd}` : 'none'}
      </span>
    </>
  ),
}));

function resetAnnotator() {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: {},
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      activeRunKeys: {},
      runContexts: {},
      resultRunKeys: {},
      open: false,
      scope: null,
      jobSeq: 0,
      activeRunKey: null,
      currentDocumentSignature: null,
      executedRunKey: null,
      executedScope: null,
    };
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function result(id) {
  return {
    pluginId: 'orf-scan',
    pluginName: 'Fake ORF',
    regions: [{ id, start: 0, end: 9, type: 'CDS', level: 'region' }],
    runAt: 0,
    parameters: {},
    durationMs: 0,
  };
}

describe('annotator run identity', () => {
  it('distinguishes full/region contexts and every monotonic execution', () => {
    const base = {
      entryId: 'e1',
      docEpoch: 2,
      topology: 'circular',
      scope: { kind: 'full' },
    };
    expect(scopeSignature(base.scope)).toBe('full');
    expect(scopeSignature({ kind: 'region', region: { start: 100, end: 400, strand: -1 } }))
      .toBe('region:100:400:-1');
    expect(documentSignature(base)).toBe('e1|2|circular');
    expect(runContextSignature(base)).toBe('e1|2|circular|full');
    expect(makeRunKey({ ...base, jobSeq: 1 })).toBe('e1|2|circular|full|1');
    expect(makeRunKey({ ...base, jobSeq: 2 })).toBe('e1|2|circular|full|2');
  });

  it('rejects mismatched and untagged replies fail-closed', () => {
    expect(isStaleReply('current', 'old')).toBe(true);
    expect(isStaleReply('current', 'current')).toBe(false);
    expect(isStaleReply('current', null)).toBe(true);
    expect(isStaleReply('current', undefined)).toBe(true);
    expect(isStaleReply(null, 'reply')).toBe(true);
  });

  it('nextJob is monotonic', () => {
    expect(nextJob(0)).toBe(1);
    expect(nextJob(41)).toBe(42);
    expect(nextJob(undefined)).toBe(1);
  });
});

describe('annotator slice per-plugin coexistence', () => {
  beforeEach(() => {
    _setFallbackForTests(true);
    _resetMemoryStore();
    resetAnnotator();
  });

  afterEach(() => {
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  it('one multi-plugin job shares a key and preserves an accepted independent level', () => {
    const context = {
      entryId: 'e1', docEpoch: 1, topology: 'circular', scope: { kind: 'full' },
    };
    const l1Key = useStore.getState().beginAnnotatorJob(context, ['common-features-homology']);
    useStore.getState().setAnnotatorResult(
      'common-features-homology',
      { pluginId: 'common-features-homology', regions: [{ id: 'l1' }] },
      l1Key,
    );
    const l2Key = useStore.getState().beginAnnotatorJob(context, ['orf-scan', 'sigma70-promoter']);
    useStore.getState().setAnnotatorResult(
      'orf-scan',
      { pluginId: 'orf-scan', regions: [{ id: 'l2' }] },
      l2Key,
    );
    useStore.getState().setAnnotatorResult(
      'sigma70-promoter',
      { pluginId: 'sigma70-promoter', regions: [{ id: 'l2b' }] },
      l2Key,
    );

    const annotator = selectAnnotator(useStore.getState());
    expect(l2Key).not.toBe(l1Key);
    expect(annotator.activeRunKeys['orf-scan']).toBe(l2Key);
    expect(annotator.activeRunKeys['sigma70-promoter']).toBe(l2Key);
    expect(annotator.results['common-features-homology'].regions[0].id).toBe('l1');
    expect(annotator.results['orf-scan'].regions[0].id).toBe('l2');
    expect(annotator.results['sigma70-promoter'].regions[0].id).toBe('l2b');
  });
});

describe('AnnotationsTab real deferred execution', () => {
  beforeEach(() => {
    _setFallbackForTests(true);
    _resetMemoryStore();
    _resetRegistry();
    resetAnnotator();
  });

  afterEach(() => {
    cleanup();
    _resetRegistry();
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  it('same-length document B supersedes A; late A neither writes nor clears B running', async () => {
    const runA = deferred();
    const runB = deferred();
    const run = vi.fn()
      .mockImplementationOnce(() => runA.promise)
      .mockImplementationOnce(() => runB.promise);
    registerPlugin({
      id: 'orf-scan',
      name: 'Fake ORF',
      capabilities: {
        fullSequenceOk: true,
        async: true,
        needsRegion: false,
        requiresNetwork: false,
        requiresBackend: false,
        speedHint: 'instant',
      },
      isAvailable: () => true,
      run,
    });

    const sequence = 'ATGGCC'.repeat(60);
    const props = {
      sequence,
      annotations: [],
      fileName: 'same-length.gb',
      active: true,
      entryId: 'p1',
      topology: 'circular',
      onApplyAnnotatorResults: vi.fn(),
    };
    const view = render(<AnnotationsTab {...props} docEpoch={1} />);

    const l2 = screen.getAllByTestId('annotator-level-section')
      .find((node) => node.dataset.levelId === 'L2');
    fireEvent.click(within(l2).getByTestId('annotator-level-header'));
    const runButton = within(l2).getByTestId('annotator-level-run');

    await act(async () => {
      fireEvent.click(runButton);
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
    const keyA = selectAnnotator(useStore.getState()).activeRunKeys['orf-scan'];
    expect(keyA).toBeTruthy();
    expect(selectAnnotator(useStore.getState()).running['orf-scan']).toBe(keyA);

    view.rerender(<AnnotationsTab {...props} docEpoch={2} />);
    await waitFor(() => expect(runButton.disabled).toBe(false));

    await act(async () => {
      fireEvent.click(runButton);
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(2);
    const keyB = selectAnnotator(useStore.getState()).activeRunKeys['orf-scan'];
    expect(keyB).toBeTruthy();
    expect(keyB).not.toBe(keyA);

    await act(async () => {
      runA.resolve(result('late-A'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    let annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['orf-scan']).toBeUndefined();
    expect(annotator.running['orf-scan']).toBe(keyB);

    await act(async () => {
      runB.resolve(result('fresh-B'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['orf-scan'].regions[0].id).toBe('fresh-B');
    expect(annotator.running['orf-scan']).toBeUndefined();
  });

  it('freezes the actual BLAST region override into the same context sent to the plugin', async () => {
    const blastRun = vi.fn(async (_sequence, region) => ({
      pluginId: 'blast-ncbi',
      pluginName: 'Fake BLAST',
      regions: [{ id: 'blast-hit', start: region.start, end: region.end, type: 'misc_feature' }],
    }));
    registerPlugin({
      id: 'blast-ncbi',
      name: 'Fake BLAST',
      capabilities: {
        fullSequenceOk: true,
        async: true,
        needsRegion: false,
        requiresNetwork: true,
        requiresBackend: false,
        speedHint: 'instant',
      },
      isAvailable: () => true,
      run: blastRun,
    });

    render(
      <AnnotationsTab
        sequence={'A'.repeat(120)}
        annotations={[]}
        fileName="region.gb"
        active
        entryId="p-region"
        docEpoch={4}
        topology="circular"
      />,
    );
    fireEvent.click(screen.getByTestId('probe-blast-region'));

    await waitFor(() => {
      expect(blastRun).toHaveBeenCalledTimes(1);
      expect(selectAnnotator(useStore.getState()).resultRunKeys['blast-ncbi']).toBeTruthy();
    });
    expect(blastRun.mock.calls[0][1]).toEqual({ start: 12, end: 48, strand: -1 });
    const annotator = selectAnnotator(useStore.getState());
    const runKey = annotator.resultRunKeys['blast-ncbi'];
    expect(runKey).toContain('|4|circular|region:12:48:-1|');
    expect(annotator.runContexts[runKey].scope).toEqual({
      kind: 'region',
      region: { start: 12, end: 48, strand: -1 },
    });

    const frozenScopeLabel = screen.getByTestId('annotator-scope-info').textContent;
    fireEvent.click(screen.getByTestId('probe-live-selection'));
    await waitFor(() => {
      expect(screen.getByTestId('probe-selection-value').textContent).toBe('70:100');
    });
    expect(screen.getByTestId('annotator-scope-info').textContent).toBe(frozenScopeLabel);
  });

  it('keeps accepted full-scope L1 visible and saveable after a region-scope L3 run', async () => {
    registerPlugin({
      id: 'common-features-homology',
      name: 'Fake L1',
      capabilities: {
        fullSequenceOk: true, async: true, needsRegion: false,
        requiresNetwork: false, requiresBackend: false, speedHint: 'instant',
      },
      isAvailable: () => true,
      run: async () => ({
        pluginId: 'common-features-homology',
        pluginName: 'Fake L1',
        regions: [{ id: 'l1-full', start: 60, end: 90, type: 'promoter', confidence: 0.95 }],
      }),
    });
    registerPlugin({
      id: 'blast-ncbi',
      name: 'Fake L3',
      capabilities: {
        fullSequenceOk: true, async: true, needsRegion: false,
        requiresNetwork: true, requiresBackend: false, speedHint: 'instant',
      },
      isAvailable: () => true,
      run: async (_sequence, region) => ({
        pluginId: 'blast-ncbi',
        pluginName: 'Fake L3',
        regions: [{ id: 'l3-region', start: region.start, end: region.end, type: 'misc_feature', confidence: 0.95 }],
      }),
    });
    const onApply = vi.fn();
    render(
      <AnnotationsTab
        sequence={'A'.repeat(180)}
        annotations={[]}
        fileName="coexist.gb"
        active
        entryId="p-coexist"
        docEpoch={11}
        topology="circular"
        onApplyAnnotatorResults={onApply}
      />,
    );

    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).results['common-features-homology']).toBeTruthy();
    });
    const l1 = screen.getAllByTestId('annotator-level-section')
      .find((node) => node.dataset.levelId === 'L1');
    fireEvent.click(within(l1).getByTestId('annotator-result-accept'));
    expect(selectAnnotator(useStore.getState()).acceptedRegionIds['l1-full']).toBe(true);

    fireEvent.click(screen.getByTestId('probe-blast-region'));
    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).results['blast-ncbi']).toBeTruthy();
    });

    let annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['common-features-homology'].regions[0].id).toBe('l1-full');
    expect(annotator.acceptedRegionIds['l1-full']).toBe(true);
    const l3 = screen.getAllByTestId('annotator-level-section')
      .find((node) => node.dataset.levelId === 'L3');
    fireEvent.click(within(l3).getByTestId('annotator-level-header'));
    fireEvent.click(within(l3).getByTestId('annotator-result-accept'));
    fireEvent.click(screen.getByTestId('annotator-save-button'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const savedIds = onApply.mock.calls[0][0].map((candidate) => candidate.id).sort();
    expect(savedIds).toEqual(['l1-full', 'l3-region']);
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.acceptedRegionIds['l1-full']).toBe(true);
  });

  it('base-scope full to region A to B reruns only L1 and preserves accepted L3', async () => {
    const fullRun = deferred();
    const regionARun = deferred();
    const regionBRun = deferred();
    const l1Run = vi.fn()
      .mockImplementationOnce(() => fullRun.promise)
      .mockImplementationOnce(() => regionARun.promise)
      .mockImplementationOnce(() => regionBRun.promise);
    const l1Result = (id, start) => ({
      pluginId: 'common-features-homology',
      pluginName: 'Fake L1',
      regions: [{ id, start, end: start + 20, type: 'promoter', confidence: 0.95 }],
    });
    registerPlugin({
      id: 'common-features-homology',
      name: 'Fake L1',
      capabilities: {
        fullSequenceOk: true, async: true, needsRegion: false,
        requiresNetwork: false, requiresBackend: false, speedHint: 'instant',
      },
      isAvailable: () => true,
      run: l1Run,
    });
    registerPlugin({
      id: 'blast-ncbi',
      name: 'Independent L3',
      capabilities: {
        fullSequenceOk: true, async: true, needsRegion: false,
        requiresNetwork: true, requiresBackend: false, speedHint: 'instant',
      },
      isAvailable: () => true,
      run: async (_sequence, region) => ({
        pluginId: 'blast-ncbi',
        pluginName: 'Independent L3',
        regions: [{
          id: 'independent-l3', start: region.start, end: region.end,
          type: 'misc_feature', confidence: 0.95,
        }],
      }),
    });

    render(
      <AnnotationsTab
        sequence={'A'.repeat(240)}
        annotations={[]}
        fileName="base-scope.gb"
        active
        entryId="p-base-scope"
        docEpoch={12}
        topology="circular"
      />,
    );
    await waitFor(() => expect(l1Run).toHaveBeenCalledTimes(1));
    await act(async () => {
      fullRun.resolve(l1Result('l1-full-base', 100));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).results['common-features-homology']
        ?.regions?.[0]?.id).toBe('l1-full-base');
    });

    fireEvent.click(screen.getByTestId('probe-blast-region'));
    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).results['blast-ncbi']).toBeTruthy();
    });
    const l3 = screen.getAllByTestId('annotator-level-section')
      .find((node) => node.dataset.levelId === 'L3');
    fireEvent.click(within(l3).getByTestId('annotator-level-header'));
    fireEvent.click(within(l3).getByTestId('annotator-result-accept'));
    act(() => useStore.getState().editPendingRegion('independent-l3', { name: 'kept L3' }));

    const regionA = { start: 20, end: 100, strand: 1 };
    act(() => useStore.getState().openAnnotator({
      kind: 'region', sequenceId: 'base-scope.gb', region: regionA,
    }));
    await waitFor(() => expect(l1Run).toHaveBeenCalledTimes(2));
    let annotator = selectAnnotator(useStore.getState());
    expect(l1Run.mock.calls[1][1]).toEqual(regionA);
    expect(annotator.results['blast-ncbi']?.regions?.[0]?.id).toBe('independent-l3');
    expect(annotator.acceptedRegionIds['independent-l3']).toBe(true);
    expect(annotator.pendingEdits['independent-l3']).toEqual({ name: 'kept L3' });

    const regionB = { start: 120, end: 200, strand: -1 };
    act(() => useStore.getState().openAnnotator({
      kind: 'region', sequenceId: 'base-scope.gb', region: regionB,
    }));
    await waitFor(() => expect(l1Run).toHaveBeenCalledTimes(3));
    const regionBKey = selectAnnotator(useStore.getState())
      .activeRunKeys['common-features-homology'];
    expect(l1Run.mock.calls[2][1]).toEqual(regionB);

    await act(async () => {
      regionARun.resolve(l1Result('late-l1-region-a', 30));
      await Promise.resolve();
      await Promise.resolve();
    });
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.results['common-features-homology']).toBeUndefined();
    expect(annotator.running['common-features-homology']).toBe(regionBKey);
    expect(annotator.results['blast-ncbi']?.regions?.[0]?.id).toBe('independent-l3');
    expect(annotator.acceptedRegionIds['independent-l3']).toBe(true);

    await act(async () => {
      regionBRun.resolve(l1Result('fresh-l1-region-b', 140));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).results['common-features-homology']
        ?.regions?.[0]?.id).toBe('fresh-l1-region-b');
    });
    annotator = selectAnnotator(useStore.getState());
    expect(annotator.running['common-features-homology']).toBeUndefined();
    expect(annotator.results['blast-ncbi']?.regions?.[0]?.id).toBe('independent-l3');
    expect(annotator.acceptedRegionIds['independent-l3']).toBe(true);
    expect(annotator.pendingEdits['independent-l3']).toEqual({ name: 'kept L3' });
  });

  it('keeps Save disabled and no-op for stale, untagged, and mixed verdict state', async () => {
    const onApply = vi.fn();
    render(
      <AnnotationsTab
        sequence={'A'.repeat(180)}
        annotations={[]}
        fileName="save-guard.gb"
        active
        entryId="p-save"
        docEpoch={9}
        topology="circular"
        onApplyAnnotatorResults={onApply}
      />,
    );
    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).currentDocumentSignature)
        .toBe('p-save|9|circular');
    });

    const saveButton = screen.getByTestId('annotator-save-button');
    const seed = (patch) => act(() => {
      useStore.setState((state) => {
        Object.assign(state.annotator, {
          results: {},
          acceptedRegionIds: {},
          rejectedRegionIds: {},
          pendingEdits: {},
          activeRunKeys: {},
          resultRunKeys: {},
          runContexts: {},
          ...patch,
        });
      });
    });
    const candidate = (id) => ({ id, start: 10, end: 30, type: 'misc_feature' });

    seed({
      results: { stale: { pluginId: 'stale', regions: [candidate('stale-id')] } },
      acceptedRegionIds: { 'stale-id': true },
      activeRunKeys: { stale: 'stale-key' },
      resultRunKeys: { stale: 'stale-key' },
      runContexts: {
        'stale-key': {
          entryId: 'p-save', docEpoch: 8, topology: 'circular', scope: { kind: 'full' },
        },
      },
    });
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);

    seed({
      results: { untagged: { pluginId: 'untagged', regions: [candidate('untagged-id')] } },
      acceptedRegionIds: { 'untagged-id': true },
    });
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);

    seed({
      results: { current: { pluginId: 'current', regions: [candidate('fresh-id')] } },
      acceptedRegionIds: { 'stale-verdict-id': true },
      activeRunKeys: { current: 'current-key' },
      resultRunKeys: { current: 'current-key' },
      runContexts: {
        'current-key': {
          entryId: 'p-save', docEpoch: 9, topology: 'circular', scope: { kind: 'full' },
        },
      },
    });
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('drops deferred local gene-parser A after document B owns result and busy state', async () => {
    const runA = deferred();
    const runB = deferred();
    const buildGeneAnnotations = vi.fn((_sub, { offset }) => ({
      regions: [
        {
          id: `gene-${offset}`, name: `gene-${offset}`, start: offset, end: offset + 240,
          strand: 1, type: 'gene', level: 'region',
        },
        {
          id: `intron-${offset}`, start: offset + 80, end: offset + 120,
          strand: 1, type: 'intron', level: 'detail',
          parentId: `gene-${offset}`, regionId: `gene-${offset}`,
        },
      ],
      cryptic: [],
      intronCount: offset === 0 ? 1 : 2,
      strand: 1,
      orf: 80,
    }));
    const modules = [
      { scoreSpliceSitesCNN: vi.fn(() => ({ donors: [], acceptors: [] })) },
      { buildGeneAnnotations },
    ];
    const loadGeneParserModules = vi.fn()
      .mockImplementationOnce(() => runA.promise)
      .mockImplementationOnce(() => runB.promise);
    const sequence = 'A'.repeat(600);
    const props = {
      sequence,
      annotations: [],
      fileName: 'gene-race.gb',
      active: true,
      entryId: 'p-gene',
      topology: 'circular',
      loadGeneParserModules,
    };
    const view = render(<AnnotationsTab {...props} docEpoch={1} />);
    fireEvent.click(screen.getByTestId('probe-gene-a'));
    await waitFor(() => {
      expect(screen.getByTestId('probe-selection-value').textContent).toBe('0:240');
    });
    const detectButton = screen.getByTestId('annotator-detect-introns');
    fireEvent.click(detectButton);
    await waitFor(() => expect(detectButton.disabled).toBe(true));
    expect(loadGeneParserModules).toHaveBeenCalledTimes(1);
    const keyA = selectAnnotator(useStore.getState()).activeRunKeys['gene-parser'];
    expect(selectAnnotator(useStore.getState()).running['gene-parser']).toBe(keyA);

    view.rerender(<AnnotationsTab {...props} docEpoch={2} />);
    await waitFor(() => expect(detectButton.disabled).toBe(false));
    expect(selectAnnotator(useStore.getState()).results['gene-parser']).toBeUndefined();
    expect(screen.queryByTestId('annotator-splice-result')).toBeNull();

    fireEvent.click(screen.getByTestId('probe-gene-b'));
    await waitFor(() => {
      expect(screen.getByTestId('probe-selection-value').textContent).toBe('300:540');
    });
    fireEvent.click(detectButton);
    await waitFor(() => expect(detectButton.disabled).toBe(true));
    expect(loadGeneParserModules).toHaveBeenCalledTimes(2);
    const keyB = selectAnnotator(useStore.getState()).activeRunKeys['gene-parser'];
    expect(keyB).not.toBe(keyA);

    await act(async () => {
      runA.resolve(modules);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(buildGeneAnnotations).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ offset: 0 }),
      );
    });
    expect(selectAnnotator(useStore.getState()).results['gene-parser']).toBeUndefined();
    expect(selectAnnotator(useStore.getState()).running['gene-parser']).toBe(keyB);
    expect(detectButton.disabled).toBe(true);
    expect(screen.queryByTestId('annotator-splice-result')).toBeNull();

    await act(async () => {
      runB.resolve(modules);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(selectAnnotator(useStore.getState()).results['gene-parser']?.regions?.[0]?.id)
        .toBe('gene-300');
      expect(detectButton.disabled).toBe(false);
    });
    const annotator = selectAnnotator(useStore.getState());
    expect(buildGeneAnnotations).toHaveBeenCalledTimes(2);
    expect(annotator.results['gene-parser'].regions.some((candidate) => candidate.id === 'gene-0'))
      .toBe(false);
    expect(annotator.running['gene-parser']).toBeUndefined();
    expect(screen.getByTestId('annotator-splice-result').textContent).toContain('2');
    expect(screen.getByTestId('annotator-gene-summary').textContent).toContain('gene-300');
  });
});
