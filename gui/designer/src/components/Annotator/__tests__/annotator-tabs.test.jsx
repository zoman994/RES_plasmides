/**
 * annotator-tabs.test.jsx — Sprint M-X.3 K3 coverage.
 *
 * Locks in the Annotator's dual-tab shell:
 *   - TabBar renders two buttons («Table» / «Preview»).
 *   - Active tab visually marked via data-active="true".
 *   - Click on a tab dispatches setAnnotatorActiveTab → store flip.
 *   - Body swaps between ResultsPane (Table) and PreviewTab (Preview).
 *   - PluginPanel + header + footer stay mounted regardless of tab.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import Annotator from '../index.jsx';

function openAnnotator() {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { 'fake-a': true },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
      activeTab: 'table',
    };
  });
}

beforeEach(() => {
  _resetRegistry();
  registerPlugin({
    id: 'fake-a', name: 'Fake A',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'fast' },
    isAvailable: () => true,
    run: async () => ({ pluginId: 'fake-a', pluginName: 'Fake A', regions: [], runAt: 0, parameters: {}, durationMs: 0 }),
  });
  openAnnotator();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Annotator — K3 dual-tab shell', () => {
  it('renders TabBar with two buttons', () => {
    render(<Annotator sequence={'A'.repeat(120)} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    expect(screen.getByTestId('annotator-tab-bar')).toBeTruthy();
    expect(screen.getByTestId('annotator-tab-table')).toBeTruthy();
    expect(screen.getByTestId('annotator-tab-preview')).toBeTruthy();
  });

  it('Table tab is active by default; PreviewTab not mounted', () => {
    render(<Annotator sequence={'A'.repeat(120)} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    expect(screen.getByTestId('annotator-tab-table').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('annotator-tab-preview').getAttribute('data-active')).toBe('false');
    // ResultsPane (or its empty placeholder) is in the DOM.
    expect(
      screen.queryByTestId('annotator-results-pane') || screen.queryByTestId('annotator-results-pane-empty')
    ).toBeTruthy();
    expect(screen.queryByTestId('annotator-preview-tab')).toBeNull();
  });

  it('clicking Preview tab flips active + mounts PreviewTab', () => {
    render(<Annotator sequence={'A'.repeat(120)} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    fireEvent.click(screen.getByTestId('annotator-tab-preview'));
    expect(useStore.getState().annotator.activeTab).toBe('preview');
    expect(screen.getByTestId('annotator-tab-preview').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('annotator-tab-table').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('annotator-preview-tab')).toBeTruthy();
    // ResultsPane unmounted while preview is active.
    expect(screen.queryByTestId('annotator-results-pane')).toBeNull();
    expect(screen.queryByTestId('annotator-results-pane-empty')).toBeNull();
  });

  it('clicking Table tab flips back', () => {
    render(<Annotator sequence={'A'.repeat(120)} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    fireEvent.click(screen.getByTestId('annotator-tab-preview'));
    fireEvent.click(screen.getByTestId('annotator-tab-table'));
    expect(useStore.getState().annotator.activeTab).toBe('table');
    expect(screen.queryByTestId('annotator-preview-tab')).toBeNull();
  });

  it('PluginPanel + header + footer stay mounted regardless of active tab', () => {
    render(<Annotator sequence={'A'.repeat(120)} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    // Defaults to table — confirm sidebars render.
    expect(screen.getByTestId('annotator-plugin-panel')).toBeTruthy();
    expect(screen.getByTestId('annotator-back-button')).toBeTruthy();
    expect(screen.getByTestId('annotator-save-button')).toBeTruthy();

    fireEvent.click(screen.getByTestId('annotator-tab-preview'));
    expect(screen.getByTestId('annotator-plugin-panel')).toBeTruthy();
    expect(screen.getByTestId('annotator-back-button')).toBeTruthy();
    expect(screen.getByTestId('annotator-save-button')).toBeTruthy();
  });
});
