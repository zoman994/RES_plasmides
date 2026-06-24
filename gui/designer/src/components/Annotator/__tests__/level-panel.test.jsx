/**
 * level-panel.test.jsx — Sprint M-X.3 follow-up Stage B-1.
 *
 * LevelPanel replaces the old PluginPanel + ResultsPane pair with a
 * three-section progression matching biolog's mental model:
 *   L1 — Common features (auto-runs, expanded by default)
 *   L2 — Predictors    (collapsed, manual Run)
 *   L3 — BLAST         (collapsed, manual Run)
 *
 * The component is store-agnostic — it receives results/running/
 * verdicts as props and emits onAccept/onReject/onEditPatch/
 * onRunLevel callbacks. Tests exercise the contract directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import LevelPanel, { LEVELS } from '../LevelPanel.jsx';

afterEach(() => { cleanup(); });

const COMMON_RESULT = {
  pluginId: 'common-features-homology',
  pluginName: 'Common features (homology)',
  regions: [
    { id: 'cf-1', name: 'AmpR', type: 'CDS', start: 100, end: 250, strand: 1, level: 'region', confidence: 0.95, predicted: true },
    { id: 'cf-2', name: 'lacZα', type: 'CDS', start: 300, end: 450, strand: 1, level: 'region', confidence: 0.92, predicted: true },
  ],
  runAt: 0, parameters: {}, durationMs: 0,
};

describe('LevelPanel — three-level progression', () => {
  it('renders level sections in order L1, L2, L3, GENE', () => {
    render(<LevelPanel />);
    const sections = screen.getAllByTestId('annotator-level-section');
    expect(sections).toHaveLength(4);
    expect(sections[0].dataset.levelId).toBe('L1');
    expect(sections[1].dataset.levelId).toBe('L2');
    expect(sections[2].dataset.levelId).toBe('L3');
    expect(sections[3].dataset.levelId).toBe('GENE'); // «Структура гена»
  });

  it('L1 is expanded by default; L2 and L3 are collapsed', () => {
    render(<LevelPanel />);
    const sections = screen.getAllByTestId('annotator-level-section');
    expect(sections[0].dataset.expanded).toBe('true');
    expect(sections[1].dataset.expanded).toBe('false');
    expect(sections[2].dataset.expanded).toBe('false');
  });

  it('clicking a header toggles the section', () => {
    render(<LevelPanel />);
    const headers = screen.getAllByTestId('annotator-level-header');
    fireEvent.click(headers[1]); // L2
    const sections = screen.getAllByTestId('annotator-level-section');
    expect(sections[1].dataset.expanded).toBe('true');
    fireEvent.click(headers[1]);
    expect(sections[1].dataset.expanded).toBe('false');
  });

  it('L1 with results shows ResultRow per region with accept/reject', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <LevelPanel
        results={{ 'common-features-homology': COMMON_RESULT }}
        threshold={0}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );
    const rows = screen.getAllByTestId('annotator-result-row');
    expect(rows).toHaveLength(2);
    // Click accept on the first row.
    const accepts = screen.getAllByTestId('annotator-result-accept');
    fireEvent.click(accepts[0]);
    expect(onAccept).toHaveBeenCalledWith('cf-1');
    // Click reject on the second row.
    const rejects = screen.getAllByTestId('annotator-result-reject');
    fireEvent.click(rejects[1]);
    expect(onReject).toHaveBeenCalledWith('cf-2');
  });

  it('L1 status shows hit count when results are present', () => {
    render(
      <LevelPanel
        results={{ 'common-features-homology': COMMON_RESULT }}
        threshold={0}
      />,
    );
    const statuses = screen.getAllByTestId('annotator-level-status');
    // L1 status — first one in DOM order.
    expect(statuses[0].textContent).toMatch(/2 hit/i);
  });

  it('L1 status shows running label when its plugin is running', () => {
    render(
      <LevelPanel
        running={{ 'common-features-homology': true }}
      />,
    );
    const sections = screen.getAllByTestId('annotator-level-section');
    expect(sections[0].dataset.running).toBe('true');
    const statuses = screen.getAllByTestId('annotator-level-status');
    expect(statuses[0].textContent).toMatch(/running/i);
  });

  it('L2 and L3 collapsed by default — Run buttons not in DOM until expanded', () => {
    render(<LevelPanel />);
    // Only L1 (expanded) shows its body initially.
    const bodies = screen.getAllByTestId('annotator-level-body');
    expect(bodies).toHaveLength(1);
    // After expanding L2, its Run button appears.
    fireEvent.click(screen.getAllByTestId('annotator-level-header')[1]);
    expect(screen.getAllByTestId('annotator-level-body')).toHaveLength(2);
  });

  it('Run button on a level dispatches onRunLevel(levelId)', () => {
    const onRunLevel = vi.fn();
    render(<LevelPanel onRunLevel={onRunLevel} />);
    // Expand L2 to access its Run button.
    fireEvent.click(screen.getAllByTestId('annotator-level-header')[1]);
    const runs = screen.getAllByTestId('annotator-level-run');
    // L1 button comes first (always expanded), L2 second (just expanded).
    fireEvent.click(runs[1]);
    expect(onRunLevel).toHaveBeenCalledWith('L2');
  });

  it('Run button is disabled while the level is running', () => {
    render(
      <LevelPanel
        running={{ 'common-features-homology': true }}
      />,
    );
    const runs = screen.getAllByTestId('annotator-level-run');
    expect(runs[0].disabled).toBe(true);
  });

  it('threshold filters out low-confidence hits in level rows', () => {
    const lowConfidence = {
      ...COMMON_RESULT,
      regions: [
        { ...COMMON_RESULT.regions[0], confidence: 0.95 },
        { ...COMMON_RESULT.regions[1], confidence: 0.40 },
      ],
    };
    render(
      <LevelPanel
        results={{ 'common-features-homology': lowConfidence }}
        threshold={0.7}
      />,
    );
    // Only the high-confidence row makes it through.
    const rows = screen.getAllByTestId('annotator-result-row');
    expect(rows).toHaveLength(1);
  });

  it('L2 aggregates results across all four structural plugins', () => {
    render(
      <LevelPanel
        results={{
          'orf-scan': { pluginId: 'orf-scan', pluginName: 'ORF', regions: [
            { id: 'orf-1', name: 'orf1', type: 'CDS', start: 1, end: 100, confidence: 0.9 },
          ] },
          'sigma70-promoter': { pluginId: 'sigma70-promoter', pluginName: 'σ70', regions: [
            { id: 'p70-1', name: 'p70', type: 'promoter', start: 200, end: 230, confidence: 0.85 },
          ] },
        }}
        threshold={0}
      />,
    );
    // Expand L2 to render its body.
    fireEvent.click(screen.getAllByTestId('annotator-level-header')[1]);
    const rows = screen.getAllByTestId('annotator-result-row');
    expect(rows).toHaveLength(2);
  });

  // Sprint M-X.3 follow-up — biolog: «когда последовательность
  // аннотирована, он не должен давать поверх те же фичи что уже
  // есть на плазмиде если они совпадают». Predicted regions that
  // duplicate an existing same-type annotation (>50% overlap) are
  // hidden from the panel before the user even sees them.
  describe('Existing-annotation overlap suppression', () => {
    const PREDICTED_OVERLAPPING = {
      pluginId: 'common-features-homology',
      pluginName: 'Common features (homology)',
      regions: [
        // cf-1 overlaps the existing «AmpR» CDS at 100..250 (>50%
        // overlap, same type) — should be hidden.
        { id: 'cf-1', name: 'AmpR', type: 'CDS', start: 105, end: 245, strand: 1, level: 'region', confidence: 0.95, predicted: true },
        // cf-2 hits a different region — should remain visible.
        { id: 'cf-2', name: 'lacZα', type: 'CDS', start: 600, end: 800, strand: 1, level: 'region', confidence: 0.92, predicted: true },
      ],
      runAt: 0, parameters: {}, durationMs: 0,
    };

    it('hides predicted regions that overlap existing same-type annotations >50%', () => {
      render(
        <LevelPanel
          results={{ 'common-features-homology': PREDICTED_OVERLAPPING }}
          threshold={0}
          existingAnnotations={[
            { id: 'existing-ampr', name: 'AmpR', type: 'CDS', start: 100, end: 250, level: 'region', strand: 1 },
          ]}
        />,
      );
      const rows = screen.getAllByTestId('annotator-result-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].dataset.regionId).toBe('cf-2');
    });

    it('keeps predicted regions whose type differs from the overlapping confirmed one', () => {
      render(
        <LevelPanel
          results={{ 'common-features-homology': PREDICTED_OVERLAPPING }}
          threshold={0}
          existingAnnotations={[
            // Same coords, different type — predicted CDS should NOT
            // be hidden by an existing «promoter» occupying the same
            // span.
            { id: 'existing-prom', name: 'p_lac', type: 'promoter', start: 100, end: 250, level: 'region', strand: 1 },
          ]}
        />,
      );
      const rows = screen.getAllByTestId('annotator-result-row');
      expect(rows).toHaveLength(2);
    });

    it('keeps predicted regions that do not overlap with any same-type confirmed region', () => {
      render(
        <LevelPanel
          results={{ 'common-features-homology': PREDICTED_OVERLAPPING }}
          threshold={0}
          existingAnnotations={[
            // Existing 50..80 — neither cf-1 (105..245) nor cf-2
            // (600..800) overlaps it, so both predicted regions
            // remain visible.
            { id: 'existing-elsewhere', name: 'tag', type: 'CDS', start: 50, end: 80, level: 'region', strand: 1 },
          ]}
        />,
      );
      const rows = screen.getAllByTestId('annotator-result-row');
      expect(rows).toHaveLength(2);
    });

    it('with showDuplicates=true, the duplicate is shown again', () => {
      render(
        <LevelPanel
          results={{ 'common-features-homology': PREDICTED_OVERLAPPING }}
          threshold={0}
          existingAnnotations={[
            { id: 'existing-ampr', name: 'AmpR', type: 'CDS', start: 100, end: 250, level: 'region', strand: 1 },
          ]}
          showDuplicates
        />,
      );
      // Both predicted regions show — biolog opted in to seeing
      // duplicates.
      const rows = screen.getAllByTestId('annotator-result-row');
      expect(rows).toHaveLength(2);
    });

    it('Accept-all count excludes suppressed duplicates', () => {
      const onAcceptMany = vi.fn();
      render(
        <LevelPanel
          results={{ 'common-features-homology': PREDICTED_OVERLAPPING }}
          threshold={0}
          existingAnnotations={[
            { id: 'existing-ampr', name: 'AmpR', type: 'CDS', start: 100, end: 250, level: 'region', strand: 1 },
          ]}
          onAcceptMany={onAcceptMany}
        />,
      );
      const btn = screen.getAllByTestId('annotator-level-accept-all')[0];
      expect(btn.textContent).toMatch(/1/);
      fireEvent.click(btn);
      expect(onAcceptMany).toHaveBeenCalledWith(['cf-2']);
    });
  });

  // Sprint M-X.3 follow-up — biolog: «ок поставь пока заглушку».
  // L3 BLAST plugin is a placeholder until the backend proxy lands.
  describe('L3 «Coming soon» placeholder', () => {
    it('L3 expanded shows the placeholder card and hides the Run button', () => {
      render(<LevelPanel />);
      // Expand L3.
      fireEvent.click(screen.getAllByTestId('annotator-level-header')[2]);
      const placeholder = screen.getByTestId('annotator-level-placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder.textContent).toMatch(/coming soon/i);
      // Run button is gone for L3 (only L1's run remains in the DOM,
      // since L1 is the only other expanded level by default).
      const runs = screen.queryAllByTestId('annotator-level-run');
      // L1 always has a Run button; L3 doesn't. Verify exactly L1's
      // is still present and L3 doesn't add a second.
      expect(runs).toHaveLength(1);
    });

    it('L3 status reads «Coming soon» even before any run', () => {
      render(<LevelPanel />);
      const statuses = screen.getAllByTestId('annotator-level-status');
      // L1 / L2 / L3 in DOM order — L3 is index 2.
      expect(statuses[2].textContent).toMatch(/coming soon/i);
    });

    it('L1 and L2 still render their Run buttons normally', () => {
      render(<LevelPanel />);
      // Expand L2.
      fireEvent.click(screen.getAllByTestId('annotator-level-header')[1]);
      const runs = screen.getAllByTestId('annotator-level-run');
      // L1 + L2 = 2 Run buttons; L3 still placeholder.
      expect(runs).toHaveLength(2);
    });
  });

  it('LEVELS map exports the canonical plugin → level grouping', () => {
    expect(LEVELS.L1).toContain('common-features-homology');
    expect(LEVELS.L2).toContain('orf-scan');
    expect(LEVELS.L2).toContain('sigma70-promoter');
    expect(LEVELS.L2).toContain('stem-loop-terminator');
    expect(LEVELS.L2).toContain('sgrna-scaffold');
    expect(LEVELS.L3).toContain('blast-ncbi');
  });

  // Sprint M-X.3 follow-up — biolog «добавь возможность одним кликом
  // согласиться со всеми комон фичами которые нашел на L1». Accept-
  // all shortcut on each level section.
  describe('Accept all', () => {
    it('button is hidden when there are no pending hits', () => {
      render(<LevelPanel />);
      expect(screen.queryByTestId('annotator-level-accept-all')).toBeNull();
    });

    it('button shows on L1 when results have pending (unverdicted) hits, with a count', () => {
      render(
        <LevelPanel
          results={{ 'common-features-homology': COMMON_RESULT }}
          threshold={0}
        />,
      );
      const btn = screen.getAllByTestId('annotator-level-accept-all')[0];
      expect(btn).toBeTruthy();
      expect(btn.textContent).toMatch(/2/);
    });

    it('clicking Accept all dispatches onAcceptMany with all pending ids in this level', () => {
      const onAcceptMany = vi.fn();
      render(
        <LevelPanel
          results={{ 'common-features-homology': COMMON_RESULT }}
          threshold={0}
          onAcceptMany={onAcceptMany}
        />,
      );
      const btns = screen.getAllByTestId('annotator-level-accept-all');
      fireEvent.click(btns[0]);
      expect(onAcceptMany).toHaveBeenCalledTimes(1);
      const ids = onAcceptMany.mock.calls[0][0];
      expect(ids).toEqual(expect.arrayContaining(['cf-1', 'cf-2']));
      expect(ids).toHaveLength(2);
    });

    it('button count drops as the user accepts hits one by one', () => {
      const { rerender } = render(
        <LevelPanel
          results={{ 'common-features-homology': COMMON_RESULT }}
          threshold={0}
        />,
      );
      expect(screen.getAllByTestId('annotator-level-accept-all')[0].textContent).toMatch(/2/);
      // After accepting cf-1 manually, only 1 pending left.
      rerender(
        <LevelPanel
          results={{ 'common-features-homology': COMMON_RESULT }}
          threshold={0}
          acceptedRegionIds={{ 'cf-1': true }}
        />,
      );
      expect(screen.getAllByTestId('annotator-level-accept-all')[0].textContent).toMatch(/1/);
    });

    it('button disappears when every hit has a verdict (accepted or rejected)', () => {
      render(
        <LevelPanel
          results={{ 'common-features-homology': COMMON_RESULT }}
          threshold={0}
          acceptedRegionIds={{ 'cf-1': true }}
          rejectedRegionIds={{ 'cf-2': true }}
        />,
      );
      expect(screen.queryByTestId('annotator-level-accept-all')).toBeNull();
    });

    it('threshold-filtered hits are excluded from the pending count', () => {
      const lowConfidence = {
        ...COMMON_RESULT,
        regions: [
          { ...COMMON_RESULT.regions[0], confidence: 0.95 },
          { ...COMMON_RESULT.regions[1], confidence: 0.40 },
        ],
      };
      render(
        <LevelPanel
          results={{ 'common-features-homology': lowConfidence }}
          threshold={0.7}
        />,
      );
      // Only the 0.95-confidence hit survives the threshold → count of 1.
      expect(screen.getAllByTestId('annotator-level-accept-all')[0].textContent).toMatch(/1/);
    });
  });

  // «Структура гена» — the 🧬 intron analysis surfaced as a panel level, with a
  // single «Принять структуру» (gene + introns are cross-linked → one unit).
  describe('Структура гена (intron analysis)', () => {
    const GENE_RESULT = {
      pluginId: 'gene-parser',
      pluginName: 'Структура гена',
      regions: [
        { id: 'g1', name: 'ген', type: 'gene', level: 'region', start: 0, end: 1500, strand: 1 },
        { id: 'i1', name: 'интрон 1', type: 'intron', level: 'detail', regionId: 'g1', start: 461, end: 529, strand: 1 },
        { id: 'i2', name: 'интрон 2', type: 'intron', level: 'detail', regionId: 'g1', start: 1226, end: 1289, strand: 1 },
      ],
    };

    it('renders the GENE section last and auto-expands it on a result', () => {
      render(<LevelPanel results={{ 'gene-parser': GENE_RESULT }} threshold={0} />);
      const sections = screen.getAllByTestId('annotator-level-section');
      const gene = sections.find((s) => s.dataset.levelId === 'GENE');
      expect(gene.dataset.expanded).toBe('true');
      expect(screen.getByTestId('annotator-gene-structure')).toBeTruthy();
    });

    it('accepts the WHOLE structure as one unit (gene + introns)', () => {
      const onAcceptMany = vi.fn();
      render(<LevelPanel results={{ 'gene-parser': GENE_RESULT }} threshold={0} onAcceptMany={onAcceptMany} />);
      fireEvent.click(screen.getByTestId('annotator-gene-accept'));
      expect(onAcceptMany).toHaveBeenCalledWith(['g1', 'i1', 'i2']);
      // there is NO per-row accept in the gene section (no partial accept)
      expect(screen.queryByTestId('annotator-result-accept')).toBeNull();
    });

    it('rejects every region of the structure', () => {
      const onReject = vi.fn();
      render(<LevelPanel results={{ 'gene-parser': GENE_RESULT }} threshold={0} onReject={onReject} />);
      fireEvent.click(screen.getByTestId('annotator-gene-reject'));
      expect(onReject).toHaveBeenCalledTimes(3);
    });

    it('shows the accepted state once every region is accepted', () => {
      render(
        <LevelPanel
          results={{ 'gene-parser': GENE_RESULT }}
          threshold={0}
          acceptedRegionIds={{ g1: true, i1: true, i2: true }}
        />,
      );
      expect(screen.getByText(/структура принята/)).toBeTruthy();
    });

    it('hosts the analysis controls (organism + 🧬) in the section, auto-expanded', () => {
      const onDetect = vi.fn();
      render(
        <LevelPanel
          geneAnalysis={{ organism: 'fungi', onOrganismChange: vi.fn(), onDetect, busy: false, hasSelection: true, result: null }}
        />,
      );
      const gene = screen.getAllByTestId('annotator-level-section').find((s) => s.dataset.levelId === 'GENE');
      expect(gene.dataset.expanded).toBe('true');         // controls visible without manual expand
      expect(screen.getByTestId('annotator-organism')).toBeTruthy();
      fireEvent.click(screen.getByTestId('annotator-detect-introns'));
      expect(onDetect).toHaveBeenCalled();
    });

    it('shows the result status message inside the section', () => {
      render(
        <LevelPanel
          geneAnalysis={{ organism: 'fungi', onOrganismChange: vi.fn(), onDetect: vi.fn(), busy: false, hasSelection: false, result: { needsSelection: true, cryptic: [] } }}
        />,
      );
      expect(screen.getByTestId('annotator-splice-result').textContent).toMatch(/Выдели ген/i);
    });
  });
});
