/**
 * annotator-ui.test.jsx — Sprint M-X.2 K8 UI coverage.
 *
 * Cases:
 *  1) Doesn't render when annotator.open === false.
 *  2) Renders header / TargetPreview / PluginPanel / ResultsPane / footer when open.
 *  3) Toggling a plugin checkbox dispatches togglePlugin.
 *  4) Disabled state for unavailable plugins (isAvailable === false).
 *  5) [Запустить N] disabled when no plugins enabled.
 *  6) Results grouped by pluginId; ResultRow shows accept/reject/edit.
 *  7) Accept → row data-state="accepted".
 *  8) Reject → row data-state="rejected".
 *  9) Threshold slider updates state.annotator.threshold.
 * 10) [Сохранить] disabled when 0 accepted; enabled when >=1.
 * 11) [Сохранить] click emits onApplyAnnotatorResults with accepted regions.
 * 12) [← Назад] dispatches closeAnnotator.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import Annotator from '../index.jsx';

function resetAnnotatorState() {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { 'fake-a': true, 'fake-b': false, 'fake-disabled': false },
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
const ANNS = [{ id: 'r1', name: 'lacZ', type: 'CDS', start: 0, end: 60, level: 'region', strand: 1 }];

beforeEach(() => {
  _resetRegistry();
  registerPlugin({
    id: 'fake-a', name: 'Fake A',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'fast' },
    isAvailable: () => true,
    run: async () => ({ pluginId: 'fake-a', pluginName: 'Fake A', regions: [
      { id: 'A:1', name: 'a-hit-1', type: 'CDS', start: 10, end: 30, confidence: 0.85 },
    ], runAt: 0, parameters: {}, durationMs: 0 }),
  });
  registerPlugin({
    id: 'fake-b', name: 'Fake B',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
    isAvailable: () => true,
    run: async () => ({ pluginId: 'fake-b', pluginName: 'Fake B', regions: [], runAt: 0, parameters: {}, durationMs: 0 }),
  });
  registerPlugin({
    id: 'fake-disabled', name: 'Fake Disabled',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: true, requiresBackend: false, speedHint: 'slow' },
    isAvailable: () => false,
    unavailableReason: () => 'нет интернета',
    run: async () => { throw new Error('unreachable'); },
  });
  resetAnnotatorState();
});

afterEach(() => { cleanup(); });

describe('K8 Annotator UI', () => {
  it('returns null when annotator.open === false', () => {
    useStore.setState((s) => { s.annotator.open = false; });
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    expect(screen.queryByTestId('annotator-root')).toBeNull();
  });

  it('renders header / target preview / plugin panel / results-empty / footer when open', () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    expect(screen.getByTestId('annotator-root')).toBeTruthy();
    expect(screen.getByTestId('annotator-target-preview')).toBeTruthy();
    expect(screen.getByTestId('annotator-plugin-panel')).toBeTruthy();
    expect(screen.getByTestId('annotator-results-pane-empty')).toBeTruthy();
    expect(screen.getByTestId('annotator-save-button')).toBeTruthy();
  });

  it('Toggling a plugin checkbox flips state.annotator.enabledPluginIds', () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    const checks = screen.getAllByTestId('annotator-plugin-checkbox');
    const fakeBCheck = checks.find((el) => el.dataset.pluginId === 'fake-b');
    expect(fakeBCheck.checked).toBe(false);
    fireEvent.click(fakeBCheck);
    const enabled = useStore.getState().annotator.enabledPluginIds;
    expect(enabled['fake-b']).toBe(true);
  });

  it('Disabled state for unavailable plugins', () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    const rows = screen.getAllByTestId('annotator-plugin-row');
    const disabledRow = rows.find((el) => el.dataset.pluginId === 'fake-disabled');
    expect(disabledRow.dataset.pluginAvailable).toBe('false');
  });

  it('Run button disabled when no plugins enabled', () => {
    useStore.setState((s) => { s.annotator.enabledPluginIds = { 'fake-a': false, 'fake-b': false, 'fake-disabled': false }; });
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    const runBtn = screen.getByTestId('annotator-run-button');
    expect(runBtn.disabled).toBe(true);
  });

  it('Pipeline run populates results and renders rows', async () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    const runBtn = screen.getByTestId('annotator-run-button');
    await act(async () => { fireEvent.click(runBtn); });
    expect(useStore.getState().annotator.results['fake-a']).toBeTruthy();
    const rows = screen.queryAllByTestId('annotator-result-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('Accept toggles row state to accepted', async () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByTestId('annotator-run-button')); });
    const acceptBtn = screen.getAllByTestId('annotator-result-accept')[0];
    fireEvent.click(acceptBtn);
    const row = screen.getAllByTestId('annotator-result-row')[0];
    expect(row.dataset.state).toBe('accepted');
  });

  it('Reject toggles row state to rejected', async () => {
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByTestId('annotator-run-button')); });
    const rejectBtn = screen.getAllByTestId('annotator-result-reject')[0];
    fireEvent.click(rejectBtn);
    const row = screen.getAllByTestId('annotator-result-row')[0];
    expect(row.dataset.state).toBe('rejected');
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
    await act(async () => { fireEvent.click(screen.getByTestId('annotator-run-button')); });
    fireEvent.click(screen.getAllByTestId('annotator-result-accept')[0]);
    expect(screen.getByTestId('annotator-save-button').disabled).toBe(false);
  });

  it('Save click emits onApplyAnnotatorResults with accepted regions only', async () => {
    const onApply = vi.fn();
    render(<Annotator sequence={SEQ} annotations={ANNS} onApplyAnnotatorResults={onApply} />);
    await act(async () => { fireEvent.click(screen.getByTestId('annotator-run-button')); });
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
