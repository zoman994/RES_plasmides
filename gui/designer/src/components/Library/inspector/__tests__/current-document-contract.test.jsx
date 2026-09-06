/**
 * current-document-contract.test.jsx — ANN-INTEGRITY seam BG-026 (A1a).
 *
 * The observable contract: the REAL LibrarySingleInspector must build ONE
 * `currentDocument = buildCurrentDocument(item, edits, docEpoch)` and every
 * surface (title/subtitle, Overview, Sequence, feature strip, AnnotationsTab)
 * must read the SAME sequence / annotations / topology / length from it.
 *
 * The prior version of this file rendered fake inline OverviewView /
 * SequenceView / AnnotatorView mini-components and only proved the pure helper —
 * it could never catch a stale subtitle. This mounts the actual inspector and
 * mocks its heavy children ONLY as prop-observers, so a same-length edited
 * sequence + edited annotations + a topology flip cannot leave the subtitle (or
 * any pane) showing the stale saved document.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SingleInspector from '../LibrarySingleInspector';

// --- Heavy children reduced to prop-observers ------------------------------
vi.mock('../LibraryInspectorTitleRow', () => ({
  default: ({ length, topology, regionCount }) => (
    <div
      data-testid="obs-title"
      data-length={String(length)}
      data-topology={String(topology)}
      data-region-count={String(regionCount)}
    />
  ),
}));
vi.mock('../ProteinEffectBadge', () => ({ default: () => null }));
vi.mock('../FeatureEditorModal', () => ({
  default: ({ feature, seqLength, neighbours, onSave }) => (
    <div
      data-testid="obs-feature-editor"
      data-seq-length={String(seqLength)}
      data-neighbours={(neighbours || []).map((a) => a.name || a.id).join(',')}
    >
      {feature && (
        <button
          type="button"
          data-testid="obs-feature-save"
          onClick={() => onSave?.({
            patch: {
              id: feature.id,
              name: 'tail-renamed',
              type: feature.type,
              start: 10,
              end: 12,
              strand: 1,
            },
            subFeatures: [],
          })}
        >save feature</button>
      )}
    </div>
  ),
}));
vi.mock('../../../SequenceView/SettingsPopover', () => ({
  default: () => null,
  SEQUENCE_VIEW_DEFAULTS: {},
}));
vi.mock('../tabs/LinearFeatureBar', () => ({
  default: ({ seqLength }) => <div data-testid="obs-strip" data-seq-length={String(seqLength)} />,
}));
vi.mock('../tabs/OverviewTab', () => ({
  default: ({ item }) => (
    <div
      data-testid="obs-overview"
      data-seq-len={String(item?.sequence?.length ?? 0)}
      data-length={String(item?.length ?? 0)}
      data-topology={String(item?.topology)}
      data-ann={(item?.annotations || []).map((a) => a.name || a.id).join(',')}
    />
  ),
}));
vi.mock('../tabs/SequenceTab', () => ({
  default: ({ sequence, topology, annotations, onAnnotationEdit, onOpenFeatureEditor }) => (
    <div
      data-testid="obs-sequence"
      data-seq={String(sequence)}
      data-topology={String(topology)}
      data-ann={(annotations || []).map((a) => a.name || a.id).join(',')}
    >
      <button
        type="button"
        data-testid="obs-create-at-tail"
        onClick={() => onAnnotationEdit?.({
          kind: 'create',
          payload: {
            id: 'tail-created',
            name: 'tail-created',
            type: 'misc_feature',
            start: 10,
            end: 12,
            strand: 1,
            level: 'region',
          },
        })}
      >create at tail</button>
      <button
        type="button"
        data-testid="obs-open-tail-feature"
        onClick={() => onOpenFeatureEditor?.((annotations || []).find((a) => a.id === 'r2'))}
      >open tail feature</button>
    </div>
  ),
}));
vi.mock('../tabs/AnnotationsTab', () => ({
  default: ({ sequence, annotations, topology, docEpoch, entryId }) => (
    <div
      data-testid="obs-annotations"
      data-seq={String(sequence)}
      data-topology={String(topology)}
      data-doc-epoch={String(docEpoch)}
      data-entry-id={String(entryId)}
      data-ann={(annotations || []).map((a) => a.name || a.id).join(',')}
    />
  ),
}));

const ITEM = {
  _libraryEntryId: 'e1',
  _fileName: 'pUC19.gb',
  name: 'pUC19',
  id: 'e1',
  sequence: 'ACGTACGTAC', // length 10
  length: 10,
  topology: 'circular',
  annotations: [{ id: 'r1', name: 'saved-CDS', type: 'CDS', start: 0, end: 6, level: 'region' }],
};

// A same-LENGTH substitution (10→10) with an ADDED region and a topology flip.
// Length alone cannot reveal the bug; topology + region-count + the derived
// sequence must all follow the buffer.
const EDITS_SAMELEN = {
  editedSequence: 'TTTTACGTAC', // still 10 nt, different bases
  editedTopology: 'linear',
  editedAnnotations: [
    { id: 'r1', name: 'edited-CDS', type: 'CDS', start: 0, end: 6, level: 'region' },
    { id: 'r2', name: 'new-region', type: 'promoter', start: 6, end: 10, level: 'region' },
  ],
};

function renderInspector({ activeTab = 'sequence', edits = {}, docEpoch = 0, onUpdateEdits = vi.fn() } = {}) {
  render(
    <SingleInspector
      item={ITEM}
      flags={{ autoAnnotate: true }}
      edits={edits}
      docEpoch={docEpoch}
      activeTab={activeTab}
      onActiveTabChange={() => {}}
      onUpdateFlags={() => {}}
      onUpdateEdits={onUpdateEdits}
      onAppendAdded={() => {}}
      onRenameItem={() => {}}
    />,
  );
  return onUpdateEdits;
}

afterEach(cleanup);

describe('A1a — real Inspector reads one currentDocument on every surface', () => {
  it('subtitle follows the EDITED topology + region-count on a same-length substitution', () => {
    renderInspector({ activeTab: 'sequence', edits: EDITS_SAMELEN, docEpoch: 'e1+b3' });
    const title = screen.getByTestId('obs-title');
    // The bug: subtitle read item.topology / item.annotations (the saved payload).
    expect(title.getAttribute('data-topology')).toBe('linear'); // NOT stale 'circular'
    expect(title.getAttribute('data-region-count')).toBe('2'); // NOT stale 1
    expect(title.getAttribute('data-length')).toBe('10');
    // Cross-view coherence: the length the subtitle shows == the sequence pane's.
    const seq = screen.getByTestId('obs-sequence');
    expect(seq.getAttribute('data-seq')).toBe('TTTTACGTAC');
    expect(seq.getAttribute('data-topology')).toBe('linear');
    expect(title.getAttribute('data-length')).toBe(String(seq.getAttribute('data-seq').length));
    // feature strip length also derived from the same document.
    expect(screen.getByTestId('obs-strip').getAttribute('data-seq-length')).toBe('10');
  });

  it('Overview reads the edited sequence/topology/annotations, never the stale saved payload', () => {
    renderInspector({
      activeTab: 'overview',
      edits: { editedSequence: 'ACGT', editedTopology: 'linear', editedAnnotations: EDITS_SAMELEN.editedAnnotations },
    });
    const ov = screen.getByTestId('obs-overview');
    expect(ov.getAttribute('data-seq-len')).toBe('4'); // NOT stale 10
    expect(ov.getAttribute('data-length')).toBe('4'); // derived, NOT stale saved 10
    expect(ov.getAttribute('data-topology')).toBe('linear'); // NOT stale 'circular'
    expect(ov.getAttribute('data-ann')).toBe('edited-CDS,new-region');
  });

  it('AnnotationsTab receives the coherent sequence + stable entryId/docEpoch/topology (A2 prep)', () => {
    renderInspector({ activeTab: 'annotations', edits: EDITS_SAMELEN, docEpoch: 'e1+b3' });
    const ann = screen.getByTestId('obs-annotations');
    expect(ann.getAttribute('data-seq')).toBe('TTTTACGTAC');
    expect(ann.getAttribute('data-topology')).toBe('linear');
    expect(ann.getAttribute('data-doc-epoch')).toBe('e1+b3');
    expect(ann.getAttribute('data-entry-id')).toBe('e1');
    expect(ann.getAttribute('data-ann')).toBe('edited-CDS,new-region');
  });

  it('annotation validators and FeatureEditor use the edited sequence length, not the saved length', () => {
    const edits = {
      editedSequence: 'TTTTACGTACGG', // 12 nt; the saved source is only 10 nt
      editedTopology: 'linear',
      editedAnnotations: [
        { id: 'r1', name: 'edited-CDS', type: 'CDS', start: 0, end: 6, level: 'region' },
        { id: 'r2', name: 'tail-feature', type: 'promoter', start: 10, end: 12, level: 'region' },
      ],
    };
    const onUpdateEdits = renderInspector({ edits, docEpoch: 'e1+b4' });

    expect(screen.getByTestId('obs-feature-editor').getAttribute('data-seq-length')).toBe('12');
    expect(screen.getByTestId('obs-feature-editor').getAttribute('data-neighbours'))
      .toBe('edited-CDS,tail-feature');

    // Sequence-view annotation validation must accept a feature in bases 11..12
    // of the edited document even though those bases do not exist in the source.
    fireEvent.click(screen.getByTestId('obs-create-at-tail'));
    expect(onUpdateEdits).toHaveBeenCalledWith(expect.objectContaining({
      editedAnnotations: expect.arrayContaining([
        expect.objectContaining({ id: 'tail-created', start: 10, end: 12 }),
      ]),
    }));

    onUpdateEdits.mockClear();
    fireEvent.click(screen.getByTestId('obs-open-tail-feature'));
    fireEvent.click(screen.getByTestId('obs-feature-save'));
    expect(onUpdateEdits).toHaveBeenCalledWith(expect.objectContaining({
      editedAnnotations: expect.arrayContaining([
        expect.objectContaining({ id: 'r2', name: 'tail-renamed', start: 10, end: 12 }),
      ]),
    }));
  });

  it('with no edit buffer every surface shows the saved document (saved stays saved)', () => {
    renderInspector({ activeTab: 'sequence', edits: {}, docEpoch: 'e1' });
    expect(screen.getByTestId('obs-title').getAttribute('data-topology')).toBe('circular');
    expect(screen.getByTestId('obs-title').getAttribute('data-region-count')).toBe('1');
    expect(screen.getByTestId('obs-sequence').getAttribute('data-seq')).toBe('ACGTACGTAC');
  });
});
