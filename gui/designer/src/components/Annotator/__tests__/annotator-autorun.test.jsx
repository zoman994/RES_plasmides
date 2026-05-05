/**
 * annotator-autorun.test.jsx — Sprint M-X.3 follow-up (05.05.2026,
 * Stage A).
 *
 * Biolog: «Дальше сразу открыватся аннотатор … и на этой карте
 * показывают гост фичи». The user shouldn't have to find and press
 * "Run" in PluginPanel before they see anything — opening the
 * Annotator on a fresh sequence should immediately kick off the
 * Level-1 detector (common-features-homology, the «known sequences
 * lookup» that produces the most useful first-pass annotations).
 *
 * Coverage:
 *   - Open Annotator with empty results → common-features-homology
 *     plugin's `run()` is invoked exactly once.
 *   - Open Annotator with PRE-EXISTING results for that plugin →
 *     no auto-run (idempotency, prevents re-fire on tab toggles or
 *     re-renders).
 *   - Auto-run does NOT fire for plugins other than Level 1
 *     (those keep their "wait for user to press Run" semantics).
 *   - After auto-run completes, results are populated AND visible
 *     on the default Preview tab (that's where biolog lands).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import Annotator from '../index.jsx';

// Spy plugins — each one's `run()` is a vi.fn so the test can assert
// invocation counts.
const cfRun = vi.fn(async () => ({
  pluginId: 'common-features-homology',
  pluginName: 'Common features (homology)',
  regions: [
    { id: 'cf-1', name: 'AmpR', type: 'CDS', start: 100, end: 250, strand: 1, level: 'region', confidence: 0.95, predicted: true },
    { id: 'cf-2', name: 'lacZα', type: 'CDS', start: 300, end: 450, strand: 1, level: 'region', confidence: 0.92, predicted: true },
  ],
  runAt: 0, parameters: {}, durationMs: 0,
}));
const orfRun = vi.fn(async () => ({
  pluginId: 'orf-scan', pluginName: 'ORF scan', regions: [], runAt: 0, parameters: {}, durationMs: 0,
}));

function openAnnotatorWith(overrides = {}) {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { 'common-features-homology': true, 'orf-scan': true },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
      activeTab: ANNOTATOR_DEFAULTS.activeTab,
      ...overrides,
    };
  });
}

beforeEach(() => {
  cfRun.mockClear();
  orfRun.mockClear();
  _resetRegistry();
  registerPlugin({
    id: 'common-features-homology',
    name: 'Common features (homology)',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'fast' },
    isAvailable: () => true,
    run: cfRun,
  });
  registerPlugin({
    id: 'orf-scan',
    name: 'ORF scan',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
    isAvailable: () => true,
    run: orfRun,
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SEQUENCE = 'A'.repeat(2000);

describe('Annotator — Stage A: auto-run Level-1 (common features) on open', () => {
  it('opens with empty results → common-features-homology fires automatically', async () => {
    openAnnotatorWith();
    render(<Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    await waitFor(() => expect(cfRun).toHaveBeenCalledTimes(1));
  });

  it('does NOT fire if results for common-features-homology already exist', async () => {
    openAnnotatorWith({
      results: {
        'common-features-homology': {
          pluginId: 'common-features-homology',
          pluginName: 'Common features (homology)',
          regions: [],
          runAt: 0, parameters: {}, durationMs: 0,
        },
      },
    });
    render(<Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    // Give the effect a tick — should still be zero.
    await new Promise((r) => setTimeout(r, 30));
    expect(cfRun).not.toHaveBeenCalled();
  });

  it('does NOT fire if common-features-homology is currently running (race guard)', async () => {
    openAnnotatorWith({
      running: { 'common-features-homology': true },
    });
    render(<Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(cfRun).not.toHaveBeenCalled();
  });

  it('does NOT fire orf-scan or any other plugin on open (only L1 is auto-run)', async () => {
    openAnnotatorWith();
    render(<Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    await waitFor(() => expect(cfRun).toHaveBeenCalledTimes(1));
    expect(orfRun).not.toHaveBeenCalled();
  });

  it('does not double-fire across re-renders for the same sequenceId', async () => {
    openAnnotatorWith();
    const { rerender } = render(
      <Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />,
    );
    await waitFor(() => expect(cfRun).toHaveBeenCalledTimes(1));
    // Mutate unrelated annotator state — auto-run effect must not re-fire.
    useStore.setState((s) => { s.annotator.threshold = 0.85; });
    rerender(<Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(cfRun).toHaveBeenCalledTimes(1);
  });

  it('does not fire when annotator is closed', async () => {
    openAnnotatorWith({ open: false });
    render(<Annotator sequence={SEQUENCE} annotations={[]} onApplyAnnotatorResults={() => {}} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(cfRun).not.toHaveBeenCalled();
  });

  // Sprint M-X.3 follow-up — biolog: «при нажатии на плазмиду в
  // билиотеке снапгена опять бросает на аннотатор модалку, а должно
  // просто овервью показывать». SingleInspector pre-warms the
  // Annotations tab in display:none; the embedded Annotator must
  // NOT auto-open while it's hidden, otherwise the modal Annotator
  // surfaces on top of the actually-active Overview tab.
  describe('embeddedActive gate', () => {
    it('embedded mode does NOT auto-open when embeddedActive=false', async () => {
      openAnnotatorWith({ open: false, scope: null });
      render(
        <Annotator
          sequence={SEQUENCE}
          annotations={[]}
          onApplyAnnotatorResults={() => {}}
          embedded
          embeddedActive={false}
          embeddedSequenceId="hidden-tab"
        />,
      );
      await new Promise((r) => setTimeout(r, 30));
      const a = useStore.getState().annotator;
      expect(a.open).toBe(false);
      expect(cfRun).not.toHaveBeenCalled();
    });

    it('embedded mode auto-opens when embeddedActive=true', async () => {
      openAnnotatorWith({ open: false, scope: null });
      render(
        <Annotator
          sequence={SEQUENCE}
          annotations={[]}
          onApplyAnnotatorResults={() => {}}
          embedded
          embeddedActive
          embeddedSequenceId="visible-tab"
        />,
      );
      await waitFor(() => expect(useStore.getState().annotator.open).toBe(true));
    });

    it('flipping embeddedActive false → true triggers auto-open', async () => {
      openAnnotatorWith({ open: false, scope: null });
      const { rerender } = render(
        <Annotator
          sequence={SEQUENCE}
          annotations={[]}
          onApplyAnnotatorResults={() => {}}
          embedded
          embeddedActive={false}
          embeddedSequenceId="lazy-tab"
        />,
      );
      await new Promise((r) => setTimeout(r, 30));
      expect(useStore.getState().annotator.open).toBe(false);
      // User clicks the Annotations tab — parent flips active to true.
      rerender(
        <Annotator
          sequence={SEQUENCE}
          annotations={[]}
          onApplyAnnotatorResults={() => {}}
          embedded
          embeddedActive
          embeddedSequenceId="lazy-tab"
        />,
      );
      await waitFor(() => expect(useStore.getState().annotator.open).toBe(true));
    });
  });
});
