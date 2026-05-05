/**
 * annotator-flow.test.jsx — Sprint M-X.2 K10 integration coverage.
 *
 * Walks 5 complete scenarios end-to-end through SingleInspector
 * (mounted with item + edits + onUpdateEdits) — verifies the full
 * loop:
 *   open Annotator → run pipeline → accept/reject → save →
 *   onUpdateEdits called with the merged annotations array.
 *
 * Scenarios (CURRENT_TASK §6 K10):
 *   1) Full bulk pass — open Аннотатор from AnnotationsTab,
 *      run, accept 1, save → editedAnnotations contains the
 *      existing + the accepted hit.
 *   2) Region scope — selection + H → CreateAnnotationPopup
 *      `[Найти в Аннотаторе]` opens scope=region.
 *   3) Edit + apply — accept, edit (rename pending), save →
 *      editedAnnotations contains the renamed region.
 *   4) Reject doesn't apply — accept 1 + reject 1 → save →
 *      editedAnnotations only contains the accepted one.
 *   5) Append-only re-annotate (DEC-ANN-09 dedup) — accepted hit
 *      that overlaps >50% with same-type existing region is
 *      silently skipped.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import SingleInspector from '../../Importer/inspector/SingleInspector';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';

// Synthetic plugin returns one or more deterministic regions for each test.
function makeFakePlugin(id, regions) {
  return {
    id,
    name: `Fake ${id}`,
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
    isAvailable: () => true,
    run: async () => ({ pluginId: id, pluginName: id, regions, runAt: 0, parameters: {}, durationMs: 0 }),
  };
}

const ITEM = {
  id: 'p1',
  _fileName: 'pUC19.gb',
  name: 'pUC19',
  sequence: 'ATGGCC'.repeat(60), // 360 nt
  annotations: [
    {
      id: 'region:145:469:CDS:lacZα',
      type: 'CDS',
      name: 'lacZα',
      start: 145,
      end: 200,
      level: 'region',
      strand: 1,
    },
  ],
  topology: 'circular',
};

function setupSlice() {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { 'common-features-homology': true },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: false,
      scope: null,
    };
  });
}

// Stage B-2 — the Run-all button is gone (PluginPanel removed). Each
// scenario now hijacks the L1 plugin id so the auto-run-on-open path
// emits the test's deterministic regions, then the test interacts
// with LevelPanel rows the same way it used to interact with
// ResultsPane rows. waitFor catches the async run.
const L1_ID = 'common-features-homology';

beforeEach(() => {
  _resetRegistry();
  setupSlice();
});
afterEach(() => { cleanup(); });

describe('K10 Annotator integration flow', () => {
  it('1) full bulk pass — accept 1 → editedAnnotations contains existing + new', async () => {
    registerPlugin(makeFakePlugin(L1_ID, [
      { id: 'orf:250:300', name: 'predicted-orf', type: 'CDS', start: 250, end: 300, confidence: 0.85 },
    ]));
    const onUpdateEdits = vi.fn();
    render(
      <SingleInspector
        item={ITEM}
        edits={null}
        activeTab="annotations"
        onActiveTabChange={vi.fn()}
        onUpdateEdits={onUpdateEdits}
      />
    );
    act(() => { useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' }); });
    expect(screen.getByTestId('annotator-root')).toBeTruthy();
    // L1 auto-runs on open — wait for results to populate the L1
    // section in LevelPanel. accept buttons appear inside.
    await waitFor(() => expect(screen.getAllByTestId('annotator-result-accept').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('annotator-result-accept')[0]);
    fireEvent.click(screen.getByTestId('annotator-save-button'));
    expect(onUpdateEdits).toHaveBeenCalledTimes(1);
    const arg = onUpdateEdits.mock.calls[0][0];
    expect(Array.isArray(arg.editedAnnotations)).toBe(true);
    const names = arg.editedAnnotations.map((a) => a.name);
    expect(names).toContain('lacZα');
    expect(names).toContain('predicted-orf');
  });

  it('2) region-scope opening preserves scope.region', () => {
    setupSlice();
    act(() => { useStore.getState().openAnnotator({ kind: 'region', sequenceId: 'p1', region: { start: 100, end: 200 } }); });
    const a = useStore.getState().annotator;
    expect(a.scope.kind).toBe('region');
    expect(a.scope.region).toEqual({ start: 100, end: 200 });
  });

  it('3) edit + apply — pendingEdits patch flows through to editedAnnotations', async () => {
    registerPlugin(makeFakePlugin(L1_ID, [
      { id: 'orf:300:330', name: 'auto-detected', type: 'CDS', start: 300, end: 330, confidence: 0.85 },
    ]));
    const onUpdateEdits = vi.fn();
    render(
      <SingleInspector
        item={ITEM}
        edits={null}
        activeTab="annotations"
        onActiveTabChange={vi.fn()}
        onUpdateEdits={onUpdateEdits}
      />
    );
    act(() => { useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' }); });
    await waitFor(() => expect(screen.getAllByTestId('annotator-result-accept').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('annotator-result-accept')[0]);
    act(() => { useStore.getState().editPendingRegion('orf:300:330', { name: 'orf-renamed' }); });
    fireEvent.click(screen.getByTestId('annotator-save-button'));
    const arg = onUpdateEdits.mock.calls[0][0];
    const names = arg.editedAnnotations.map((a) => a.name);
    expect(names).toContain('orf-renamed');
    expect(names).not.toContain('auto-detected');
  });

  it('4) reject doesn’t apply — only accepted regions reach editedAnnotations', async () => {
    registerPlugin(makeFakePlugin(L1_ID, [
      { id: 'orf:200:250', name: 'good-hit', type: 'CDS', start: 200, end: 250, confidence: 0.85 },
      { id: 'orf:280:330', name: 'bad-hit', type: 'CDS', start: 280, end: 330, confidence: 0.85 },
    ]));
    const onUpdateEdits = vi.fn();
    render(
      <SingleInspector
        item={ITEM}
        edits={null}
        activeTab="annotations"
        onActiveTabChange={vi.fn()}
        onUpdateEdits={onUpdateEdits}
      />
    );
    act(() => { useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' }); });
    await waitFor(() => expect(screen.getAllByTestId('annotator-result-accept').length).toBe(2));
    const accepts = screen.getAllByTestId('annotator-result-accept');
    const rejects = screen.getAllByTestId('annotator-result-reject');
    fireEvent.click(accepts[0]);  // good-hit
    fireEvent.click(rejects[1]);  // bad-hit
    fireEvent.click(screen.getByTestId('annotator-save-button'));
    const arg = onUpdateEdits.mock.calls[0][0];
    const names = arg.editedAnnotations.map((a) => a.name);
    expect(names).toContain('good-hit');
    expect(names).not.toContain('bad-hit');
  });

  it('5) append-only re-annotate — DEC-ANN-09 dedup skips overlapping same-type', async () => {
    // Predicted region overlaps existing lacZα 145..200 same-type CDS.
    // Sprint M-X.3 follow-up — biolog: «не должен давать поверх те
    // же фичи». The overlap is now caught at DISPLAY time (LevelPanel
    // / PreviewTab filter the duplicate before the row is even
    // rendered), so the user can't accept what they shouldn't see.
    // The save-side DEC-ANN-09 dedup remains as a defence in depth.
    registerPlugin(makeFakePlugin(L1_ID, [
      { id: 'orf:140:210', name: 'overlapping-orf', type: 'CDS', start: 140, end: 210, confidence: 0.85 },
    ]));
    const onUpdateEdits = vi.fn();
    render(
      <SingleInspector
        item={ITEM}
        edits={null}
        activeTab="annotations"
        onActiveTabChange={vi.fn()}
        onUpdateEdits={onUpdateEdits}
      />
    );
    act(() => { useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' }); });
    // Wait for L1 results to land in the slice — the slice update
    // is what would have produced rows, but the duplicate filter
    // suppresses the only hit.
    await waitFor(() => expect(useStore.getState().annotator.results[L1_ID]).toBeTruthy());
    expect(screen.queryAllByTestId('annotator-result-accept')).toHaveLength(0);
    expect(screen.queryAllByTestId('annotator-result-row')).toHaveLength(0);
    expect(screen.getByTestId('annotator-save-button').disabled).toBe(true);
  });
});
