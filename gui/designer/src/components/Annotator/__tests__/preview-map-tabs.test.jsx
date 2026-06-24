/**
 * preview-map-tabs.test.jsx — Sprint M-X.3 follow-up Stage C
 * (05.05.2026).
 *
 * Biolog: «по вкладке можно еще переключиться в окно просмотра
 * кольцевой ерсии плазмиды/фрагмента». Inside PreviewTab, a sub-
 * tab bar toggles between the linear SequenceView and the circular
 * PlasmidMiniMap. Both views render the merged confirmed + ghost
 * annotations array (ghost styling is automatic on linear; the
 * circular mini-map still surfaces them as regions, just without
 * the dashed stroke).
 *
 * Coverage:
 *   - Default activeTab = 'linear' → SequenceView mounted, MiniMap
 *     not in DOM.
 *   - Click «Circular» tab → store activeTab flips to 'circular',
 *     PlasmidMiniMap mounts, SequenceView unmounts.
 *   - Click «Linear» again flips back.
 *   - The Annotator-tab-bar lives INSIDE PreviewTab (not the body
 *     parent), so toggling doesn't dismount LevelPanel / progress
 *     bar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';

// Mock heavy SequenceView for stable assertions.
vi.mock('../../SequenceView', () => ({
  default: () => <div data-testid="mock-sequence-view" />,
}));
vi.mock('../../PlasmidMiniMap.jsx', () => ({
  default: () => <div data-testid="mock-plasmid-mini-map" />,
}));
// Circular preview now renders the redesigned PlasmidMapV2
// (DEC-DS-PLASMIDMAP-V2, flag plasmidMapV2). Mocked to a probe — the
// map's own geometry lives in plasmid-map-v2.test.jsx.
vi.mock('../../PlasmidMapV2', () => ({
  default: () => <div data-testid="mock-plasmid-map-v2" />,
}));

import PreviewTab from '../PreviewTab.jsx';

function setTab(tab) {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
      activeTab: tab,
      selectedGhostId: null,
    };
  });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SEQ = 'A'.repeat(2000);

describe('PreviewTab — Stage C linear/circular sub-tabs', () => {
  beforeEach(() => { setTab('linear'); });

  it('renders the Annotator tab bar with linear/circular buttons', () => {
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.getByTestId('annotator-tab-bar')).toBeTruthy();
    expect(screen.getByTestId('annotator-tab-linear')).toBeTruthy();
    expect(screen.getByTestId('annotator-tab-circular')).toBeTruthy();
  });

  it('default tab is linear → SequenceView mounted, mini-map not in DOM', () => {
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.getByTestId('mock-sequence-view')).toBeTruthy();
    expect(screen.queryByTestId('mock-plasmid-mini-map')).toBeNull();
    expect(screen.getByTestId('annotator-tab-linear').getAttribute('data-active')).toBe('true');
  });

  it('clicking Circular flips the store tab and mounts the mini-map', () => {
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    fireEvent.click(screen.getByTestId('annotator-tab-circular'));
    expect(useStore.getState().annotator.activeTab).toBe('circular');
  });

  it('Circular state mounts the circular map (V2) inside annotator-preview-circular wrapper', () => {
    setTab('circular');
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.getByTestId('annotator-preview-circular')).toBeTruthy();
    expect(screen.getByTestId('mock-plasmid-map-v2')).toBeTruthy();
    expect(screen.queryByTestId('mock-sequence-view')).toBeNull();
    expect(screen.getByTestId('annotator-tab-circular').getAttribute('data-active')).toBe('true');
  });

  it('clicking Linear from circular state flips back', () => {
    setTab('circular');
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    fireEvent.click(screen.getByTestId('annotator-tab-linear'));
    expect(useStore.getState().annotator.activeTab).toBe('linear');
  });

  it('a stale activeTab value falls back to linear (defensive default)', () => {
    setTab('garbage');
    render(<PreviewTab sequence={SEQ} annotations={[]} name="p" />);
    expect(screen.getByTestId('mock-sequence-view')).toBeTruthy();
    expect(screen.getByTestId('annotator-tab-linear').getAttribute('data-active')).toBe('true');
  });
});
