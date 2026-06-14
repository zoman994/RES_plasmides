/**
 * annotator-manual-run.test.jsx — end-to-end L2 manual-run coverage.
 *
 * Real-case sweep gap: the L1 auto-run path is tested (annotator-flow), and
 * LevelPanel's Run button is unit-tested with a mocked onRunLevel, but NO test
 * drove the full L2/L3 chain: expand level → click Run → runAnnotatorPipeline →
 * results render → accept → save → persist. This covers it for L2 (orf-scan).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react';
import SingleInspector from '../../Library/inspector/LibrarySingleInspector';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';

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
  id: 'p1', _fileName: 'pUC19.gb', name: 'pUC19',
  sequence: 'ATGGCC'.repeat(60),
  annotations: [{ id: 'r1', type: 'CDS', name: 'lacZα', start: 145, end: 200, level: 'region', strand: 1 }],
  topology: 'circular',
};

const L2_ID = 'orf-scan'; // a Level-2 (predictors) plugin id

beforeEach(() => {
  _resetRegistry();
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: {},
      results: {}, acceptedRegionIds: {}, rejectedRegionIds: {}, pendingEdits: {},
      running: {}, open: false, scope: null,
    };
  });
});
afterEach(() => { cleanup(); });

describe('Annotator — L2 manual run → accept → save → persist', () => {
  it('expands L2, runs it, renders the hit, accepts + saves it into editedAnnotations', async () => {
    registerPlugin(makeFakePlugin(L2_ID, [
      { id: 'orf:250:300', name: 'predicted-orf', type: 'CDS', start: 250, end: 300, confidence: 0.9, level: 'region' },
    ]));
    const onUpdateEdits = vi.fn();
    render(
      <SingleInspector
        item={ITEM}
        edits={null}
        activeTab="annotations"
        onActiveTabChange={vi.fn()}
        onUpdateEdits={onUpdateEdits}
      />,
    );
    act(() => { useStore.getState().openAnnotator({ kind: 'full', sequenceId: 'p1' }); });

    // L2 section is collapsed by default (L1/L2/L3 order) — expand it, then Run.
    const l2 = screen.getAllByTestId('annotator-level-section')[1];
    fireEvent.click(within(l2).getByTestId('annotator-level-header'));
    fireEvent.click(within(l2).getByTestId('annotator-level-run'));

    // Pipeline result renders as an accept-able row inside L2.
    await waitFor(() => expect(within(l2).getAllByTestId('annotator-result-accept').length).toBeGreaterThan(0));
    fireEvent.click(within(l2).getAllByTestId('annotator-result-accept')[0]);
    fireEvent.click(screen.getByTestId('annotator-save-button'));

    // The accepted L2 hit reached editedAnnotations (existing + new).
    const patches = onUpdateEdits.mock.calls.map((c) => c[0]).filter((p) => Array.isArray(p?.editedAnnotations));
    expect(patches.length).toBeGreaterThan(0);
    const last = patches[patches.length - 1].editedAnnotations;
    expect(last.some((a) => a.start === 250 && a.end === 300)).toBe(true);
    expect(last.some((a) => a.id === 'r1')).toBe(true); // existing preserved
  });
});
