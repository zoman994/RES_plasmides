/**
 * Sprint M-B.2 K4 — lazy-tab mount integration tests.
 *
 * The headline test (`default-overview-no-annotation-editor`) is the V49
 * 50-sec hang regression guard: on default Inspector open with activeTab
 * === 'overview', AnnotationEditor must NOT be present in the DOM. The
 * other three tests cover toggling tabs and edit propagation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SingleInspector from '../SingleInspector';

// Mock heavy components so the test stays fast and the assertions can
// detect their presence/absence via stable testids.
vi.mock('../../../AnnotationEditor', () => ({
  default: ({ annotations = [], onChange }) => (
    <div data-testid="mock-annotation-editor" data-count={annotations.length}>
      <button
        type="button"
        data-testid="mock-ann-trigger"
        onClick={() => onChange?.([...annotations, { id: 'new', name: 'added', start: 0, end: 5, level: 'detail' }])}
      >+1</button>
    </div>
  ),
}));
vi.mock('../../../SequenceMapView', () => ({
  default: ({ fragments }) => (
    <div data-testid="mock-sequence-map-view" data-frag-len={fragments?.[0]?.sequence?.length || 0} />
  ),
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

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('M-B.2 K4 — lazy-tabs', () => {
  it('1) default-overview-no-annotation-editor — V49 regression guard', () => {
    const { Wrapper } = harness({ activeTab: 'overview' });
    render(<Wrapper tab="overview" />);

    // OverviewTab is mounted; SequenceMapView + AnnotationEditor are NOT.
    expect(screen.getByTestId('importer-tab-panel-overview')).toBeTruthy();
    expect(screen.queryByTestId('mock-annotation-editor')).toBeNull();
    expect(screen.queryByTestId('mock-sequence-map-view')).toBeNull();
    expect(screen.queryByTestId('importer-tab-panel-sequence')).toBeNull();
    expect(screen.queryByTestId('importer-tab-panel-annotations')).toBeNull();
  });

  it('2) switching to annotations tab mounts AnnotationEditor', () => {
    const { Wrapper } = harness({ activeTab: 'annotations' });
    render(<Wrapper tab="annotations" />);

    expect(screen.getByTestId('importer-tab-panel-annotations')).toBeTruthy();
    expect(screen.getByTestId('mock-annotation-editor')).toBeTruthy();
    expect(screen.queryByTestId('importer-tab-panel-overview')).toBeNull();
    expect(screen.queryByTestId('mock-sequence-map-view')).toBeNull();
  });

  it('3) switching back to overview unmounts AnnotationEditor (DOM destroy)', () => {
    const { Wrapper } = harness({ activeTab: 'annotations' });
    const { rerender } = render(<Wrapper tab="annotations" />);
    expect(screen.getByTestId('mock-annotation-editor')).toBeTruthy();

    rerender(<Wrapper tab="overview" />);
    expect(screen.queryByTestId('mock-annotation-editor')).toBeNull();
    expect(screen.getByTestId('importer-tab-panel-overview')).toBeTruthy();
  });

  it('4) edit annotation in AnnotationsTab calls onUpdateEdits with new array', async () => {
    const onUpdateEdits = vi.fn();
    const { Wrapper } = harness({ activeTab: 'annotations', onUpdateEdits });
    render(<Wrapper tab="annotations" />);

    fireEvent.click(screen.getByTestId('mock-ann-trigger'));
    await waitFor(() => {
      expect(onUpdateEdits).toHaveBeenCalled();
    });
    const patch = onUpdateEdits.mock.calls[0][0];
    expect(Array.isArray(patch.editedAnnotations)).toBe(true);
    expect(patch.editedAnnotations.length).toBe(ITEM.annotations.length + 1);
  });

  it('5) sequence tab mounts SequenceMapView read-only (no onAddCustomPrimer)', () => {
    const { Wrapper } = harness({ activeTab: 'sequence' });
    render(<Wrapper tab="sequence" />);
    expect(screen.getByTestId('importer-tab-panel-sequence')).toBeTruthy();
    const seq = screen.getByTestId('mock-sequence-map-view');
    expect(parseInt(seq.dataset.fragLen, 10)).toBe(ITEM.sequence.length);
    // AnnotationEditor still not in DOM.
    expect(screen.queryByTestId('mock-annotation-editor')).toBeNull();
  });

  it('6) HistoryTab tab not present in TabBar when commits empty (M-B.2 default)', () => {
    const { Wrapper } = harness({ activeTab: 'overview' });
    render(<Wrapper tab="overview" />);
    expect(screen.queryByTestId('importer-tab-history')).toBeNull();
  });
});
