/**
 * annotator-introns.test.jsx — «выбрал фрагмент → нажал анализ» (Phase 1).
 * The 🧬 Интроны button runs ab-initio intron detection and surfaces the gene
 * structure in the «Структура гена» level of the panel (store result under
 * 'gene-parser') for a Review → «Принять структуру» step, plus a result banner.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';
import { _resetRegistry, registerPlugin } from '../../../lib/annotator-plugins/registry.js';
import { CBH1 } from '../../../lib/splice/__tests__/fixtures/genes.js';
import Annotator from '../index.jsx';

const L1_ID = 'common-features-homology';

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
      open: true, scope: { kind: 'full', sequenceId: 'gene1' },
    };
  });
});
afterEach(cleanup);

describe('Annotator — intron analysis button', () => {
  const geneParser = () => useStore.getState().annotator.results['gene-parser'];
  const selectRegion = (start, end) =>
    useStore.setState((s) => { s.annotator.scope = { kind: 'region', region: { start, end }, sequenceId: 'gene1' }; });

  it('blocks detection without a selection (no whole-plasmid run, shows a hint)', () => {
    // scope is 'full' (no selection) from beforeEach
    render(<Annotator sequence={CBH1} annotations={[]} onApplyAnnotatorResults={vi.fn()} />);
    fireEvent.click(screen.getByTestId('annotator-detect-introns'));
    expect(geneParser()).toBeFalsy();
    expect(screen.getByTestId('annotator-splice-result').textContent).toMatch(/Выдели ген/i);
  });

  it('detects introns on the SELECTED gene (neural parser)', async () => {
    selectRegion(0, CBH1.length);
    render(<Annotator sequence={CBH1} annotations={[]} onApplyAnnotatorResults={vi.fn()} />);
    fireEvent.click(screen.getByTestId('annotator-detect-introns'));
    // lazy CNN chunk + parse can be slow under full-suite parallel load
    await waitFor(() => expect(geneParser()).toBeTruthy(), { timeout: 4000 });
    const introns = geneParser().regions.filter((r) => r.type === 'intron').sort((a, b) => a.start - b.start);
    expect(introns).toHaveLength(2); // cbh1 has two introns
    expect(introns[0]).toMatchObject({ start: 461, end: 529, strand: 1 });
    expect(introns[1]).toMatchObject({ start: 1226, end: 1289 });
    expect(screen.getByTestId('annotator-splice-result').textContent).toContain('парсер гена');
  });

  it('warns when the selection is too short for the neural model', () => {
    selectRegion(0, 50); // < MIN_CNN_LEN (220)
    render(<Annotator sequence={CBH1} annotations={[]} onApplyAnnotatorResults={vi.fn()} />);
    fireEvent.click(screen.getByTestId('annotator-detect-introns'));
    expect(geneParser()).toBeFalsy();
    expect(screen.getByTestId('annotator-splice-result').textContent).toMatch(/короч/i);
  });
});
