/**
 * PlasmidViewer — bug-rush #25 coverage.
 *
 * Biolog: «после линеаризации плазмиды и сохранения в библиотеку, при
 * открытии фрагмента у него нет колбасы аннотации и фичи не удаляются».
 *
 * The legacy modal viewer (used for parts opened from the right-rail
 * library / canvas double-click) used to:
 *   1. NOT render a LinearFeatureBar at all — the only feature
 *      visualisation was inside the circular PlasmidMap, useless for a
 *      linearized backbone.
 *   2. Mount AnnotationEditor in `readOnly` mode — biolog literally
 *      could not delete a feature once it was saved as a Part.
 *
 * Both are fixed: bar is rendered above the main split when the part
 * has annotations, and the editor is editable; deleting a row pushes
 * the new annotations array up via `onAnnotationsChange` so ModalStack
 * can persist the change via store.updatePart.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlasmidViewer from '../PlasmidViewer';

afterEach(cleanup);

const SEQ = 'ATGC'.repeat(80); // 320 nt — short enough that the inline view path
                                // doesn't matter; circular map renders for ≥100 bp.

const ANN = [
  {
    id: 'r1', level: 'region', type: 'CDS', name: 'AmpR',
    start: 10, end: 100, strand: 1,
  },
  {
    id: 'r2', level: 'region', type: 'promoter', name: 'lac',
    start: 120, end: 180, strand: 1,
  },
];

function buildPart(overrides = {}) {
  return {
    id: 'p1',
    name: 'pTest_lin',
    type: 'plasmid',
    sequence: SEQ,
    topology: 'linear',
    annotations: ANN,
    ...overrides,
  };
}

describe('PlasmidViewer — bug-rush #25 (linearised library entries)', () => {
  it('renders the LinearFeatureBar when the part has annotations', () => {
    render(<PlasmidViewer part={buildPart()} onClose={() => {}} />);
    expect(
      screen.queryByTestId('importer-linear-feature-bar')
    ).toBeTruthy();
  });

  it('does NOT render the LinearFeatureBar for parts with zero annotations', () => {
    render(<PlasmidViewer part={buildPart({ annotations: [] })} onClose={() => {}} />);
    expect(
      screen.queryByTestId('importer-linear-feature-bar')
    ).toBeNull();
  });

  it('clicking the × delete button on a region calls onAnnotationsChange with the row removed', () => {
    const onAnnotationsChange = vi.fn();
    render(
      <PlasmidViewer
        part={buildPart()}
        onClose={() => {}}
        onAnnotationsChange={onAnnotationsChange}
      />
    );
    // AnnotationEditor places one × button per row with
    // title=t('ann.delete') ("Удалить" in RU / "Delete" in EN).
    // The modal's own close button uses the same ✕ glyph but has no
    // title — filter by title to skip it.
    const deleteButtons = Array.from(document.querySelectorAll('button'))
      .filter((b) => /удалить|delete/i.test(b.getAttribute('title') || ''));
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(deleteButtons[0]);
    expect(onAnnotationsChange).toHaveBeenCalledTimes(1);
    const next = onAnnotationsChange.mock.calls[0][0];
    expect(Array.isArray(next)).toBe(true);
    expect(next).toHaveLength(1);
  });
});
