/**
 * annotator-ui.test.jsx — Sprint M-X.2 K8 UI coverage, rewritten for
 * Stage B-2 (05.05.2026).
 *
 * The dual-tab body (Table | Preview) and per-plugin PluginPanel are
 * gone. The Annotator now has:
 *   - LEFT  = always the map (PreviewTab → SequenceView).
 *   - RIGHT = LevelPanel (3 sections: L1 / L2 / L3) with per-row
 *             accept/reject reusing ResultRow.
 *
 * Cases retained from K8:
 *  1) Doesn't render when annotator.open === false.
 *  2) Renders header + target preview + LevelPanel + footer when open.
 *  3) Threshold slider updates state.annotator.threshold.
 *  4) Save button disabled when 0 accepted; enabled when ≥1.
 *  5) Save click emits onApplyAnnotatorResults with accepted regions
 *     only (and applies pendingEdits patches).
 *  6) Back button closes the Annotator.
 *
 * Plugin-checkbox / Run-all-button / ResultsPane assertions migrated
 * to level-panel.test.jsx (those surfaces no longer exist).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import Annotator from '../index.jsx';

const L1_ID = 'common-features-homology';

function resetAnnotatorState() {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { [L1_ID]: true },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
    };
  });
}

const SEQ = 'ATGGCC'.repeat(20);
// Existing CDS placed AWAY from the plugin's predicted region
// (10..30) so the new same-type overlap filter (Sprint M-X.3
// follow-up) doesn't hide the predicted hit these tests rely on.
const ANNS = [{ id: 'r1', name: 'lacZ', type: 'CDS', start: 80, end: 110, level: 'region', strand: 1 }];

beforeEach(() => {
  _resetRegistry();
  // L1 stand-in produces one deterministic hit so the LevelPanel's L1
  // section auto-populates from the open-side-effect.
  registerPlugin({
    id: L1_ID, name: 'Common features (homology)',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'fast' },
    isAvailable: () => true,
    run: async () => ({
      pluginId: L1_ID, pluginName: 'Common features (homology)',
      regions: [{ id: 'A:1', name: 'a-hit-1', type: 'CDS', start: 10, end: 30, confidence: 0.85 }],
      runAt: 0, parameters: {}, durationMs: 0,
    }),
  });
  resetAnnotatorState();
});

afterEach(() => { cleanup(); });

describe('K8 Annotator UI (Stage B-2)', () => {
  it('returns null when annotator.open === false', () => {
    useStore.setState((s) => { s.annotator.open = false; });
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    expect(screen.queryByTestId('annotator-root')).toBeNull();
  });

  it('renders header / target preview / level panel / footer when open', () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    expect(screen.getByTestId('annotator-root')).toBeTruthy();
    expect(screen.getByTestId('annotator-target-preview')).toBeTruthy();
    expect(screen.getByTestId('annotator-level-panel')).toBeTruthy();
    expect(screen.getByTestId('annotator-save-button')).toBeTruthy();
    // The legacy PluginPanel + ResultsPane test ids must be gone.
    expect(screen.queryByTestId('annotator-plugin-panel')).toBeNull();
    expect(screen.queryByTestId('annotator-results-pane')).toBeNull();
    expect(screen.queryByTestId('annotator-results-pane-empty')).toBeNull();
  });

  it('Threshold slider updates store', () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    const slider = screen.getByTestId('annotator-threshold-slider');
    fireEvent.change(slider, { target: { value: '0.85' } });
    expect(useStore.getState().annotator.threshold).toBe(0.85);
  });

  it('Save button disabled when no accepted; enabled after one accept', async () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    expect(screen.getByTestId('annotator-save-button').disabled).toBe(true);
    // L1 auto-runs on open. Wait for the row to appear.
    await waitFor(() => expect(screen.getAllByTestId('annotator-result-accept').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('annotator-result-accept')[0]);
    expect(screen.getByTestId('annotator-save-button').disabled).toBe(false);
  });

  it('Save click emits onApplyAnnotatorResults with accepted regions only', async () => {
    const onApply = vi.fn();
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={onApply} />);
    await waitFor(() => expect(screen.getAllByTestId('annotator-result-accept').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('annotator-result-accept')[0]);
    fireEvent.click(screen.getByTestId('annotator-save-button'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg.length).toBe(1);
    expect(arg[0].name).toBe('a-hit-1');
  });

  it('Back button closes the Annotator', () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    fireEvent.click(screen.getByTestId('annotator-back-button'));
    expect(useStore.getState().annotator.open).toBe(false);
  });
});
