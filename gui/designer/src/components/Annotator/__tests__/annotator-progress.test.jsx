/**
 * annotator-progress.test.jsx — Sprint M-X.3 follow-up (05.05.2026).
 *
 * Biolog: «давай только мы еще прогресс бар прикрутим чтобы человек
 * видел что оно грузится а не прсто зависло. аннотация требует
 * времени». L1 detector (homology lookup) and any other plugin run
 * synchronously in JS but the homology DB has thousands of entries —
 * scanning takes hundreds of ms. Without a visible cue, the modal
 * looks frozen and the user starts clicking randomly.
 *
 * Coverage:
 *   - When ANY plugin is running, the AnnotatorProgressBar mounts
 *     with the running plugin's display name.
 *   - When no plugin is running, the bar is NOT in the DOM.
 *   - When multiple plugins run concurrently, the bar shows one of
 *     them (we just confirm something is shown — picking which is
 *     not user-visible).
 *   - Bar disappears as soon as `running[id]` flips to false.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';

// Mock the heavy SequenceView so PreviewTab can mount cheaply.
vi.mock('../../SequenceView', () => ({
  default: () => <div data-testid="mock-sequence-view" />,
}));

import PreviewTab from '../PreviewTab.jsx';

function setRunning(map, results = {}) {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { 'common-features-homology': true },
      results,
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: map,
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
      activeTab: 'linear',
      selectedGhostId: null,
    };
  });
}

beforeEach(() => {
  _resetRegistry();
  registerPlugin({
    id: 'common-features-homology',
    name: 'Common features (homology)',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'fast' },
    isAvailable: () => true,
    run: async () => ({ pluginId: 'common-features-homology', pluginName: 'Common features (homology)', regions: [], runAt: 0, parameters: {}, durationMs: 0 }),
  });
  setRunning({});
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SEQ = 'A'.repeat(2000);

describe('AnnotatorProgressBar — visible during plugin runs', () => {
  it('not rendered when no plugin is running', () => {
    setRunning({});
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.queryByTestId('annotator-progress-bar')).toBeNull();
  });

  it('mounts with the running plugin name when L1 fires', () => {
    setRunning({ 'common-features-homology': true });
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    const bar = screen.getByTestId('annotator-progress-bar');
    expect(bar).toBeTruthy();
    expect(bar.textContent).toMatch(/Common features/i);
  });

  it('falls back to plugin id when registry has no display name', () => {
    setRunning({ 'mystery-plugin': true });
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    const bar = screen.getByTestId('annotator-progress-bar');
    expect(bar.textContent).toMatch(/mystery-plugin/i);
  });

  it('disappears as soon as running flips to false', () => {
    setRunning({ 'common-features-homology': true });
    const { rerender } = render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.getByTestId('annotator-progress-bar')).toBeTruthy();
    act(() => {
      useStore.setState((s) => { s.annotator.running = {}; });
    });
    rerender(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.queryByTestId('annotator-progress-bar')).toBeNull();
  });

  it('handles `running[id]: false` keys (cleared flag, not deleted) the same as no-running', () => {
    setRunning({ 'common-features-homology': false, 'orf-scan': false });
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.queryByTestId('annotator-progress-bar')).toBeNull();
  });
});
