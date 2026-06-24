/**
 * annotator-intron-scope.test.jsx — Игорь 18.06.2026: «заблочим детекцию
 * интронов без выделения — иначе на всю плазмиду кучу всего размечает».
 *
 * The ab-initio gene parser runs ONLY on the user's selection (the gene). With
 * no selection it must not run on the whole plasmid. Here a confirmed feature
 * spanning the gene is clicked (mock SequenceView → onAnnotationClick → live
 * selection → analysisRegion), then «🧬 Интроны» runs on exactly that range.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import { CBH1 } from '../../../lib/splice/__tests__/fixtures/genes.js';

// Mock SequenceView so a click on a confirmed feature triggers onAnnotationClick
// → the lifted selection hook (range-select), exactly as the real viewer does.
vi.mock('../../SequenceView', () => ({
  default: ({ fragments, onAnnotationClick }) => {
    const ann = (fragments?.[0]?.annotations) || [];
    return (
      <div data-testid="mock-sequence-view">
        {ann.map((a) => (
          <button
            key={a.id || `${a.start}:${a.end}`}
            data-testid={`mock-ann-${a.id || 'noid'}`}
            onClick={() => onAnnotationClick?.(a)}
          >{a.name || a.type}</button>
        ))}
      </div>
    );
  },
}));

import Annotator from '../index.jsx';

const L1_ID = 'common-features-homology';
const geneParser = () => useStore.getState().annotator.results['gene-parser'];

beforeEach(() => {
  _resetRegistry();
  registerPlugin({
    id: L1_ID, name: 'L1',
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'fast' },
    run: async () => ({ pluginId: L1_ID, pluginName: 'L1', regions: [], runAt: 0, parameters: {}, durationMs: 0 }),
  });
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { [L1_ID]: true },
      results: {}, acceptedRegionIds: {}, rejectedRegionIds: {}, pendingEdits: {}, running: {},
      open: true, scope: { kind: 'full', sequenceId: 'p1' },
    };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Annotator — intron analysis requires a selection', () => {
  it('runs on the gene selected by clicking its feature', async () => {
    const geneFeature = { id: 'cbh', name: 'cbh1', type: 'CDS', start: 0, end: CBH1.length, level: 'region', strand: 1 };
    render(<Annotator sequence={CBH1} annotations={[geneFeature]} onApplyAnnotatorResults={vi.fn()} />);
    fireEvent.click(screen.getByTestId('mock-ann-cbh'));       // select the whole gene
    fireEvent.click(screen.getByTestId('annotator-detect-introns'));
    await waitFor(() => expect(geneParser()).toBeTruthy());
    expect(geneParser().regions.filter((r) => r.type === 'intron')).toHaveLength(2);
  });

  it('does nothing on the whole plasmid when nothing is selected', () => {
    render(<Annotator sequence={CBH1} annotations={[]} onApplyAnnotatorResults={vi.fn()} />);
    fireEvent.click(screen.getByTestId('annotator-detect-introns'));
    expect(geneParser()).toBeFalsy();
    expect(screen.getByTestId('annotator-splice-result').textContent).toMatch(/Выдели ген/i);
  });
});
