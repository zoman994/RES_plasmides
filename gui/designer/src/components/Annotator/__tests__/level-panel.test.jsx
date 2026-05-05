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
  it('renders three level sections in order L1, L2, L3', () => {
    render(<LevelPanel />);
    const sections = screen.getAllByTestId('annotator-level-section');
    expect(sections).toHaveLength(3);
    expect(sections[0].dataset.levelId).toBe('L1');
    expect(sections[1].dataset.levelId).toBe('L2');
    expect(sections[2].dataset.levelId).toBe('L3');
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
});
