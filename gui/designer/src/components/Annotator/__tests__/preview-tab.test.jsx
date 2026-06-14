/**
 * preview-tab.test.jsx — Sprint M-X.3 K4 coverage.
 *
 * PreviewTab mounts SequenceView with confirmed annotations + the
 * predicted regions from `state.annotator.results`, merged into a
 * single fragment. Single-click on a ghost feature opens the
 * GhostDrillInPanel with Accept / Reject / BLAST / Re-run controls.
 *
 * We mock SequenceView to avoid the heavy real renderer + DOM
 * measurement assumptions; the test surface here is the merge logic
 * + click → drill-in plumbing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';

// Mock SequenceView with a minimal stub that exposes onAnnotationClick
// + receives `fragments` so the test can assert what was merged in.
// Also surfaces optional onAnnotationEdit / onOpenFeatureEditor /
// onBlastSelection plumbing so Sprint M-X.3 follow-up tests can
// trigger those code paths directly.
vi.mock('../../SequenceView', () => ({
  default: ({
    fragments,
    onAnnotationClick,
    onAnnotationEdit,
    onOpenFeatureEditor,
    onBlastSelection,
    readOnly,
    primers,
    onWritePrimer,
  }) => {
    const ann = (fragments?.[0]?.annotations) || [];
    return (
      <div data-testid="mock-sequence-view" data-readonly={readOnly ? 'true' : 'false'}>
        <div data-testid="mock-fragment-name">{fragments?.[0]?.name || ''}</div>
        <div data-testid="mock-ann-count">{ann.length}</div>
        {ann.map((a) => (
          <button
            key={a.id || `${a.start}:${a.end}`}
            data-testid={`mock-ann-${a.id || 'noid'}`}
            data-region-predicted={a.predicted ? 'true' : undefined}
            onClick={() => onAnnotationClick?.(a)}
          >{a.name || a.type}</button>
        ))}
        {onAnnotationEdit && (
          <button
            data-testid="mock-trigger-edit"
            onClick={() => onAnnotationEdit({ kind: 'delete', id: 'c1' })}
          >edit</button>
        )}
        {onOpenFeatureEditor && (
          <button
            data-testid="mock-trigger-feature-editor"
            onClick={() => onOpenFeatureEditor({ id: 'c1', name: 'AmpR' })}
          >open editor</button>
        )}
        {onBlastSelection && (
          <button
            data-testid="mock-trigger-blast"
            onClick={() => onBlastSelection({ start: 100, end: 200 })}
          >blast</button>
        )}
        <div data-testid="mock-primer-count">{(primers || []).length}</div>
        {onWritePrimer && (
          <button
            data-testid="mock-trigger-writeprimer"
            onClick={() => onWritePrimer({
              direction: 'forward', start: 1, end: 20, name: 'p', sequence: 'ATGC',
            })}
          >wp</button>
        )}
      </div>
    );
  },
}));

import PreviewTab from '../PreviewTab.jsx';

const CONFIRMED = [
  { id: 'c1', name: 'AmpR', type: 'CDS', start: 10, end: 100, level: 'region' },
];

function ghost(id, name = 'Probable σ70') {
  return {
    id, name, type: 'promoter',
    start: 200, end: 230, strand: 1, level: 'region',
    predicted: true, confidence: 0.85,
  };
}

const SEQUENCE = 'A'.repeat(2000);

function setResults(results) {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { ...ANNOTATOR_DEFAULTS.enabledPluginIds },
      results,
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
      activeTab: 'linear',
      selectedGhostId: null,
    };
  });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PreviewTab — K4 SequenceView merge + drill-in', () => {
  beforeEach(() => { setResults({}); });

  it('renders SequenceView with confirmed annotations when no results', () => {
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    expect(screen.getByTestId('mock-sequence-view')).toBeTruthy();
    expect(screen.getByTestId('mock-fragment-name').textContent).toBe('pTest');
    expect(screen.getByTestId('mock-ann-count').textContent).toBe('1');
  });

  it('merges predicted regions from store.results into the fragment', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [ghost('g1', 'σ70 hit'), ghost('g2', 'σ70 hit 2')],
      },
    });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    expect(screen.getByTestId('mock-ann-count').textContent).toBe('3'); // 1 confirmed + 2 ghosts
    expect(screen.getByTestId('mock-ann-g1')).toBeTruthy();
    expect(screen.getByTestId('mock-ann-g1').getAttribute('data-region-predicted')).toBe('true');
  });

  // V134 — биолог: «кусок с парт, не кусок без парт; одно имя». A confirmed
  // feature whose predicted partial sits on the same locus DISPLAYS the part
  // name; the redundant prediction is absorbed → one feature, not two.
  it('confirmed feature + overlapping predicted partial → one feature with the part name', () => {
    setResults({
      'common-features-homology': {
        pluginId: 'common-features-homology', pluginName: 'Common features',
        regions: [{
          id: 'pp', name: 'AmpR_part_10-100', type: 'CDS',
          start: 10, end: 100, strand: 1, level: 'region', predicted: true, confidence: 0.95,
        }],
      },
    });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    // one feature (the partial absorbed into the confirmed), shown with part name
    expect(screen.getByTestId('mock-ann-count').textContent).toBe('1');
    expect(screen.getByTestId('mock-ann-c1').textContent).toBe('AmpR_part_10-100');
  });

  // V136 — «Show duplicates» ON must reveal the Level-1 hit on the track: the
  // reconcile (which collapses confirmed + partial into one) is gated to OFF.
  it('Show duplicates ON: confirmed + overlapping predicted partial both render (no reconcile)', () => {
    setResults({
      'common-features-homology': {
        pluginId: 'common-features-homology', pluginName: 'Common features',
        regions: [{
          id: 'pp', name: 'AmpR_part_10-100', type: 'CDS',
          start: 10, end: 100, strand: 1, level: 'region', predicted: true, confidence: 0.95,
        }],
      },
    });
    useStore.setState((s) => { s.annotator.showDuplicates = true; });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    // both on the track: confirmed (name NOT upgraded) + the Level-1 ghost.
    expect(screen.getByTestId('mock-ann-count').textContent).toBe('2');
    expect(screen.getByTestId('mock-ann-c1').textContent).toBe('AmpR');
    expect(screen.getByTestId('mock-ann-pp')).toBeTruthy();
  });

  it('respects threshold — ghosts below threshold are filtered out', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [
          { ...ghost('g1'), confidence: 0.85 },
          { ...ghost('g2'), confidence: 0.50 },
        ],
      },
    });
    useStore.setState((state) => { state.annotator.threshold = 0.7; });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    // 1 confirmed + 1 ghost (g1 above threshold; g2 below — dropped).
    expect(screen.getByTestId('mock-ann-count').textContent).toBe('2');
    expect(screen.queryByTestId('mock-ann-g1')).toBeTruthy();
    expect(screen.queryByTestId('mock-ann-g2')).toBeNull();
  });

  it('clicking a ghost opens the drill-in panel', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [ghost('g1', 'σ70 hit')],
      },
    });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    expect(screen.queryByTestId('annotator-ghost-drill-in')).toBeNull();
    fireEvent.click(screen.getByTestId('mock-ann-g1'));
    expect(useStore.getState().annotator.selectedGhostId).toBe('g1');
    expect(screen.getByTestId('annotator-ghost-drill-in')).toBeTruthy();
  });

  it('clicking a confirmed annotation does NOT open the drill-in', () => {
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    fireEvent.click(screen.getByTestId('mock-ann-c1'));
    expect(useStore.getState().annotator.selectedGhostId).toBeNull();
    expect(screen.queryByTestId('annotator-ghost-drill-in')).toBeNull();
  });

  it('drill-in Accept button calls acceptRegion and closes the panel', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [ghost('g1', 'σ70 hit')],
      },
    });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    fireEvent.click(screen.getByTestId('mock-ann-g1'));
    fireEvent.click(screen.getByTestId('annotator-ghost-accept'));
    const a = useStore.getState().annotator;
    expect(a.acceptedRegionIds.g1).toBe(true);
    expect(a.selectedGhostId).toBeNull();
    expect(screen.queryByTestId('annotator-ghost-drill-in')).toBeNull();
  });

  it('drill-in Reject button calls rejectRegion and closes the panel', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [ghost('g1', 'σ70 hit')],
      },
    });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    fireEvent.click(screen.getByTestId('mock-ann-g1'));
    fireEvent.click(screen.getByTestId('annotator-ghost-reject'));
    const a = useStore.getState().annotator;
    expect(a.rejectedRegionIds.g1).toBe(true);
    expect(a.selectedGhostId).toBeNull();
  });

  it('drill-in BLAST / Re-run-predictors run the real annotator levels (A35)', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70', regions: [ghost('g1', 'σ70 hit')],
      },
    });
    const onRunLevel = vi.fn();
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" onRunLevel={onRunLevel} />,
    );
    fireEvent.click(screen.getByTestId('mock-ann-g1')); // select the ghost
    fireEvent.click(screen.getByTestId('annotator-ghost-blast'));
    expect(onRunLevel).toHaveBeenCalledWith('L3', expect.objectContaining({
      region: expect.objectContaining({ id: 'g1' }),
    }));
    fireEvent.click(screen.getByTestId('annotator-ghost-predictors'));
    expect(onRunLevel).toHaveBeenCalledWith('L2');
  });

  // Sprint M-X.3 follow-up — biolog: «надо дать возможность
  // растягивать сжимать фичи, редачить двойным кликом и выдлять
  // последовательность - а дальше уже эту последоватность дать
  // возможность бластить». PreviewTab now forwards edit + BLAST
  // callbacks to SequenceView.
  describe('Edit + BLAST callbacks', () => {
    it('forwards onAnnotationEdit + sets SequenceView non-readOnly when wired', () => {
      const onEdit = vi.fn();
      render(
        <PreviewTab
          sequence={SEQUENCE}
          annotations={CONFIRMED}
          name="pTest"
          onAnnotationEdit={onEdit}
        />,
      );
      expect(screen.getByTestId('mock-sequence-view').dataset.readonly).toBe('false');
      fireEvent.click(screen.getByTestId('mock-trigger-edit'));
      expect(onEdit).toHaveBeenCalledWith({ kind: 'delete', id: 'c1' });
    });

    it('SequenceView stays readOnly when onAnnotationEdit is NOT wired', () => {
      render(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />,
      );
      expect(screen.getByTestId('mock-sequence-view').dataset.readonly).toBe('true');
    });

    it('forwards onOpenFeatureEditor', () => {
      const onOpen = vi.fn();
      render(
        <PreviewTab
          sequence={SEQUENCE}
          annotations={CONFIRMED}
          name="pTest"
          onOpenFeatureEditor={onOpen}
        />,
      );
      fireEvent.click(screen.getByTestId('mock-trigger-feature-editor'));
      expect(onOpen).toHaveBeenCalledWith({ id: 'c1', name: 'AmpR' });
    });

    it('forwards onBlastSelection with the selection range', () => {
      const onBlast = vi.fn();
      render(
        <PreviewTab
          sequence={SEQUENCE}
          annotations={CONFIRMED}
          name="pTest"
          onBlastSelection={onBlast}
        />,
      );
      fireEvent.click(screen.getByTestId('mock-trigger-blast'));
      expect(onBlast).toHaveBeenCalledWith({ start: 100, end: 200 });
    });

    // 18.05.2026 (Игорь) — primers are base functionality on EVERY
    // sequence viewer, incl. the embedded Annotator preview ("при
    // просмотре, во всех сиквенс виверах"). Host (Library/Container)
    // → AnnotationsTab → Annotator → here → SequenceView.
    it('forwards primers + onWritePrimer to the embedded SequenceView', () => {
      const onWP = vi.fn();
      render(
        <PreviewTab
          sequence={SEQUENCE}
          annotations={CONFIRMED}
          name="pTest"
          primers={[{ name: 'p1', bindingSequence: 'ATGCATGCATGC', direction: 'forward' }]}
          onWritePrimer={onWP}
        />,
      );
      expect(screen.getByTestId('mock-primer-count').textContent).toBe('1');
      fireEvent.click(screen.getByTestId('mock-trigger-writeprimer'));
      expect(onWP).toHaveBeenCalledWith({
        direction: 'forward', start: 1, end: 20, name: 'p', sequence: 'ATGC',
      });
    });

    it('no primers prop ⇒ empty list forwarded (back-compat)', () => {
      render(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />,
      );
      expect(screen.getByTestId('mock-primer-count').textContent).toBe('0');
      expect(screen.queryByTestId('mock-trigger-writeprimer')).toBeNull();
    });
  });

  it('drill-in Close button clears selectedGhost without verdict', () => {
    setResults({
      'sigma70-promoter': {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [ghost('g1', 'σ70 hit')],
      },
    });
    render(
      <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
    );
    fireEvent.click(screen.getByTestId('mock-ann-g1'));
    fireEvent.click(screen.getByTestId('annotator-ghost-close'));
    const a = useStore.getState().annotator;
    expect(a.selectedGhostId).toBeNull();
    expect(a.acceptedRegionIds.g1).toBeUndefined();
    expect(a.rejectedRegionIds.g1).toBeUndefined();
  });

  // Sprint M-X.3 follow-up (05.05.2026) — biolog: «после нажатия
  // ассепт на превью аннотатора фича должна явно появлятся перестая
  // быть призрачной». Verdicts have to flow back into the merged
  // fragment immediately:
  //   - Accept → region stays in the list but `predicted: false`
  //     (AnnotationTrack renders solid + non-italic label).
  //   - Reject → region disappears from the merged list entirely
  //     (no ghost, no solid).
  //   - No verdict → unchanged ghost rendering.
  describe('verdict feedback in preview', () => {
    it('accepted ghost re-renders without the predicted flag (becomes solid)', () => {
      setResults({
        'sigma70-promoter': {
          pluginId: 'sigma70-promoter', pluginName: 'σ70',
          regions: [ghost('g1', 'σ70 hit')],
        },
      });
      const { rerender } = render(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // Pre-accept: the region IS predicted.
      expect(
        screen.getByTestId('mock-ann-g1').getAttribute('data-region-predicted')
      ).toBe('true');
      // Accept it.
      fireEvent.click(screen.getByTestId('mock-ann-g1'));
      fireEvent.click(screen.getByTestId('annotator-ghost-accept'));
      rerender(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // Post-accept: still in the list, but no longer a ghost.
      expect(screen.getByTestId('mock-ann-g1')).toBeTruthy();
      expect(
        screen.getByTestId('mock-ann-g1').getAttribute('data-region-predicted')
      ).toBeNull();
    });

    it('rejected ghost disappears from the merged fragment', () => {
      setResults({
        'sigma70-promoter': {
          pluginId: 'sigma70-promoter', pluginName: 'σ70',
          regions: [ghost('g1', 'σ70 hit'), ghost('g2', 'σ70 hit 2')],
        },
      });
      const { rerender } = render(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // Pre-reject: 1 confirmed + 2 ghosts.
      expect(screen.getByTestId('mock-ann-count').textContent).toBe('3');
      // Reject g1.
      fireEvent.click(screen.getByTestId('mock-ann-g1'));
      fireEvent.click(screen.getByTestId('annotator-ghost-reject'));
      rerender(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // Post-reject: 1 confirmed + 1 ghost (g2 only).
      expect(screen.getByTestId('mock-ann-count').textContent).toBe('2');
      expect(screen.queryByTestId('mock-ann-g1')).toBeNull();
      expect(screen.queryByTestId('mock-ann-g2')).toBeTruthy();
    });

    // Sprint M-X.3 follow-up — biolog: «когда последовательность
    // аннотирована, он не должен давать поверх те же фичи что уже
    // есть на плазмиде если они совпадают». Predicted regions that
    // duplicate (>50% same-type overlap) an existing confirmed
    // annotation are filtered out of the merged fragment.
    it('hides predicted regions that overlap existing same-type annotations', () => {
      const overlapping = {
        pluginId: 'sigma70-promoter', pluginName: 'σ70',
        regions: [
          // Overlaps existing CONFIRMED `c1` AmpR CDS (10..100) >50%
          // with same type — suppressed.
          { ...ghost('dup1'), name: 'AmpR-pred', type: 'CDS', start: 20, end: 90, confidence: 0.9 },
          // Different region — visible.
          { ...ghost('keep1'), name: 'sigma70', type: 'promoter', start: 500, end: 530, confidence: 0.85 },
        ],
      };
      setResults({ 'sigma70-promoter': overlapping });
      render(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // 1 confirmed + 1 surviving predicted (the AmpR duplicate is
      // filtered out, the sigma70 promoter survives).
      expect(screen.getByTestId('mock-ann-count').textContent).toBe('2');
      expect(screen.queryByTestId('mock-ann-dup1')).toBeNull();
      expect(screen.queryByTestId('mock-ann-keep1')).toBeTruthy();
    });

    it('non-verdicted ghosts keep their predicted flag (no false positives)', () => {
      setResults({
        'sigma70-promoter': {
          pluginId: 'sigma70-promoter', pluginName: 'σ70',
          regions: [ghost('g1', 'σ70 hit'), ghost('g2', 'σ70 hit 2')],
        },
      });
      const { rerender } = render(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // Accept g1 only.
      fireEvent.click(screen.getByTestId('mock-ann-g1'));
      fireEvent.click(screen.getByTestId('annotator-ghost-accept'));
      rerender(
        <PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" />
      );
      // g2 is untouched — still predicted.
      expect(
        screen.getByTestId('mock-ann-g2').getAttribute('data-region-predicted')
      ).toBe('true');
    });
  });
});
