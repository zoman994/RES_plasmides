/**
 * Sprint M-B.2 K4 — lazy-tab mount integration tests.
 *
 * The headline test (`default-overview-no-annotation-editor`) is the V49
 * 50-sec hang regression guard: on default Inspector open with activeTab
 * === 'overview', the heavy SequenceView must NOT be present in the DOM.
 *
 * Importer-merge-tabs (04.05.2026): the dedicated «Аннотации» tab is
 * gone — Inspector is now read-only viewer-only. SequenceTab embeds a
 * LinearFeatureBar «колбаса» at the bottom that calls
 * SequenceView.scrollToPosition(...) on feature click. The
 * AnnotationEditor (heavy edit UI) is no longer imported here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SingleInspector from '../LibrarySingleInspector';

// Capture scrollToPosition calls on the SequenceView mock so the K4
// integration test can verify «click on feature in strip → scroll».
const scrollSpy = vi.fn();

vi.mock('../../../SequenceView', () => ({
  default: forwardRef(function MockSequenceView({ fragments }, ref) {
    useImperativeHandle(ref, () => ({
      scrollToPosition: (pos) => scrollSpy(pos),
    }), []);
    return (
      <div
        data-testid="mock-sequence-map-view"
        data-frag-len={fragments?.[0]?.sequence?.length || 0}
      />
    );
  }),
}));
vi.mock('../../../SequenceView/SettingsPopover', () => ({
  default: () => null,
  SEQUENCE_VIEW_DEFAULTS: {},
}));
vi.mock('../../../PlasmidMiniMap', () => ({
  default: () => <div data-testid="mock-mini-map" />,
}));

const ITEM = {
  _fileName: 'pUC19.gb',
  name: 'pUC19',
  sequence: 'A'.repeat(2700),
  length: 2700,
  topology: 'circular',
  annotations: [
    { id: 'r1', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
    { id: 'r2', type: 'promoter', name: 'lac promoter', start: 1000, end: 1100, level: 'region' },
  ],
};

function harness({ activeTab = 'overview', edits = {}, onUpdateEdits = vi.fn() } = {}) {
  let captured = activeTab;
  const onActiveTabChange = vi.fn((t) => { captured = t; });
  function Wrapper({ tab }) {
    return (
      <SingleInspector
        item={ITEM}
        flags={{ autoAnnotate: true }}
        edits={edits}
        activeTab={tab}
        onActiveTabChange={onActiveTabChange}
        onUpdateFlags={() => {}}
        onUpdateEdits={onUpdateEdits}
        onAppendAdded={() => {}}
        onRenameItem={() => {}}
      />
    );
  }
  return { Wrapper, onActiveTabChange, get captured() { return captured; } };
}

beforeEach(() => {
  scrollSpy.mockClear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('M-B.2 K4 — lazy-tabs (Importer-merge-tabs revision)', () => {
  it('1) default-overview-no-sequence-view — V49 regression guard', () => {
    const { Wrapper } = harness({ activeTab: 'overview' });
    render(<Wrapper tab="overview" />);

    // OverviewTab is mounted; SequenceView is NOT (lazy mount only on
    // sequence tab). The annotations tab was deleted entirely
    // (Importer-merge-tabs); its panel testid must never appear.
    expect(screen.getByTestId('importer-tab-panel-overview')).toBeTruthy();
    expect(screen.queryByTestId('mock-sequence-map-view')).toBeNull();
    expect(screen.queryByTestId('importer-tab-panel-sequence')).toBeNull();
    expect(screen.queryByTestId('importer-tab-panel-annotations')).toBeNull();
  });

  it('2) feature strip is HIDDEN on the Overview tab (Overview owns its own visualisation)', () => {
    // Reshuffle 04.05.2026 — биолог: «убрать из вкладки обзор».
    // The PlasmidMiniMap + categorised sections inside OverviewTab
    // already give the visual feature breakdown; the «колбаса» would
    // duplicate that. It only renders on tabs whose body shows
    // sequence content (Sequence + History).
    const { Wrapper } = harness({ activeTab: 'overview' });
    render(<Wrapper tab="overview" />);
    expect(screen.queryByTestId('importer-single-feature-strip')).toBeNull();
    expect(screen.queryByTestId('importer-linear-feature-bar')).toBeNull();
    expect(screen.queryByTestId('mock-sequence-map-view')).toBeNull();
  });

  it('3) sequence tab mounts SequenceView and the strip is at top of Inspector', () => {
    const { Wrapper } = harness({ activeTab: 'sequence' });
    render(<Wrapper tab="sequence" />);
    expect(screen.getByTestId('importer-tab-panel-sequence')).toBeTruthy();
    const seq = screen.getByTestId('mock-sequence-map-view');
    expect(parseInt(seq.dataset.fragLen, 10)).toBe(ITEM.sequence.length);
    // Strip lives at SingleInspector header (above TabBar) — one
    // instance, not duplicated inside SequenceTab.
    const strips = screen.getAllByTestId('importer-single-feature-strip');
    expect(strips.length).toBe(1);
  });

  it('4) clicking a feature on the strip from the Sequence tab scrolls SequenceView', () => {
    const { Wrapper } = harness({ activeTab: 'sequence' });
    render(<Wrapper tab="sequence" />);
    const featureGroups = screen
      .getByTestId('importer-linear-feature-bar')
      .querySelectorAll('g[style*="cursor"]');
    expect(featureGroups.length).toBeGreaterThan(0);
    fireEvent.click(featureGroups[0]);
    expect(scrollSpy).toHaveBeenCalled();
    const lastCall = scrollSpy.mock.calls[scrollSpy.mock.calls.length - 1];
    expect(typeof lastCall[0]).toBe('number');
    const knownStarts = ITEM.annotations.map((a) => a.start);
    expect(knownStarts).toContain(lastCall[0]);
  });

  it('5) HistoryTab tab not present in TabBar when commits empty (M-B.2 default)', () => {
    const { Wrapper } = harness({ activeTab: 'overview' });
    render(<Wrapper tab="overview" />);
    expect(screen.queryByTestId('importer-tab-history')).toBeNull();
  });

  it('6) annotator is a TOGGLE button, not a strip tab (Игорь 18.05.2026 — «не вкладка, а кнопка преобразующая вивер»); lazy-mount preserved', () => {
    const { Wrapper } = harness({ activeTab: 'overview' });
    render(<Wrapper tab="overview" />);
    // The dedicated «Аннотации» strip tab is gone — annotation access
    // is now a right-aligned toggle button that flips the viewer pane
    // into the Annotator in place, reachable from any active tab.
    expect(screen.queryByTestId('importer-tab-annotations')).toBeNull();
    expect(screen.getByTestId('importer-annotator-toggle')).toBeTruthy();
    // V49 lazy-mount intent preserved: on Overview the Annotator body
    // stays unmounted until the toggle (or onOpenAnnotator) activates it.
    expect(screen.queryByTestId('importer-tab-panel-annotations')).toBeNull();
  });
});
