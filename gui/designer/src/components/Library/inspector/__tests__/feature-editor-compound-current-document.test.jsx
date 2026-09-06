/**
 * feature-editor-compound-current-document.test.jsx — B1-ui integration.
 *
 * Both hosts (Library inspector + Container editor) must resolve ONE
 * currentDocument DTO and feed the feature-editor flow the transient/pending
 * sequence, annotations AND topology. The proof: an origin-crossing (JOIN wrap)
 * save only survives when topology='circular' travels as the FOURTH
 * applyAnnotationEdit argument, and its result must land in the active edit
 * buffer of each host.
 *
 * If the fourth argument is dropped, the core coherence gate treats the document
 * as linear and rejects the wrap, so the buffer never receives the join — that
 * is the RED for this seam in both hosts.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';

// The canonical origin-crossing location the mocked modal emits on save.
const WRAP = { kind: 'join', segments: [{ start: 900, end: 1000 }, { start: 0, end: 50 }] };
const SEQ_1000 = 'ATGC'.repeat(250); // 1000 nt
const WRAPPER = { id: 'wrapper', name: 'oriT', type: 'misc_feature', start: 900, end: 1000, strand: 1, level: 'region' };

// --- Shared leaf mocks (apply to BOTH hosts — same underlying modules) --------
vi.mock('../FeatureEditorModal', () => ({
  default: ({ feature, topology, onSave }) => (
    <div data-testid="obs-modal" data-topology={String(topology)}>
      {feature && (
        <button
          type="button"
          data-testid="obs-modal-save-wrap"
          onClick={() => onSave?.({ patch: { location: WRAP }, subFeatures: [] })}
        >save wrap</button>
      )}
    </div>
  ),
}));
vi.mock('../tabs/SequenceTab', () => ({
  default: ({ annotations, onOpenFeatureEditor, documentHash }) => (
    <div data-testid="obs-seq" data-document-hash={documentHash || ''}>
      <button
        type="button"
        data-testid="obs-open-wrapper"
        onClick={() => onOpenFeatureEditor?.((annotations || []).find((a) => a.id === 'wrapper'))}
      >open wrapper</button>
    </div>
  ),
}));
// Library-only heavy children reduced to no-ops / observers.
vi.mock('../LibraryInspectorTitleRow', () => ({ default: () => null }));
vi.mock('../ProteinEffectBadge', () => ({ default: () => null }));
vi.mock('../../../SequenceView/SettingsPopover', () => ({ default: () => null, SEQUENCE_VIEW_DEFAULTS: {} }));
vi.mock('../tabs/LinearFeatureBar', () => ({ default: () => null }));
vi.mock('../tabs/OverviewTab', () => ({ default: () => null }));
vi.mock('../tabs/AnnotationsTab', () => ({ default: () => null }));

import SingleInspector from '../LibrarySingleInspector';
import {
  SkeletonProvider,
  useSkeletonActions,
  useSkeletonState,
} from '../../../CanvasSkeleton/store/skeleton-context';
import ContainerEditorSkeleton from '../../../CanvasSkeleton/editor/ContainerEditorSkeleton';
import { useStore, bootstrapStore } from '../../../../store';
import { documentIdentityOf } from '../../../../lib/primer-live-workflow';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

describe('B1-ui — Library host: transient circular buffer + fourth-arg origin save', () => {
  const ITEM = {
    _libraryEntryId: 'e1', _fileName: 'p.gb', id: 'e1', name: 'p',
    sequence: 'ACGT', topology: 'linear', annotations: [],
  };
  const EDITS = {
    editedSequence: SEQ_1000,
    editedTopology: 'circular',
    editedAnnotations: [WRAPPER],
  };

  it('modal sees circular topology and an origin-crossing save lands in the edit buffer', () => {
    const onUpdateEdits = vi.fn();
    render(
      <SingleInspector
        item={ITEM} flags={{}} edits={EDITS} docEpoch="e1+b1"
        activeTab="sequence" onActiveTabChange={() => {}}
        onUpdateFlags={() => {}} onUpdateEdits={onUpdateEdits}
        onAppendAdded={() => {}} onRenameItem={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('obs-open-wrapper'));
    // The transient circular topology reached the modal via the currentDocument DTO.
    expect(screen.getByTestId('obs-modal').getAttribute('data-topology')).toBe('circular');
    fireEvent.click(screen.getByTestId('obs-modal-save-wrap'));
    // The wrap survived only because topology travelled as the 4th arg.
    expect(onUpdateEdits).toHaveBeenCalled();
    const lastCall = onUpdateEdits.mock.calls[onUpdateEdits.mock.calls.length - 1][0];
    const w = (lastCall.editedAnnotations || []).find((a) => a.id === 'wrapper');
    expect(w).toBeTruthy();
    expect(w.location).toEqual(WRAP);
  });
});

describe('B1-ui — Container host: pending circular buffer + fourth-arg origin save', () => {
  let harnessActions = null;
  let harnessState = null;
  function HarnessAccess() {
    harnessActions = useSkeletonActions();
    harnessState = useSkeletonState();
    return null;
  }
  function HarnessOpen({ containerId, pendingPatch = null }) {
    const actions = useSkeletonActions();
    useEffect(() => {
      actions.fillPlaceholder(containerId, {
        id: 'lib-fill', kind: 'container', name: 'circ',
        payload: {
          sequence: SEQ_1000, length: 1000, topology: 'circular', annotations: [],
          resourceHash: 'saved-resource-hash', ends: null,
        },
      });
      actions.setPendingEdits(containerId, pendingPatch || { editedAnnotations: [WRAPPER] });
      actions.openEditorViewOnly(containerId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerId]);
    return null;
  }

  it('pending annotations + circular topology reach the flow; origin save lands in pending buffer', () => {
    render(
      <SkeletonProvider>
        <HarnessAccess />
        <HarnessOpen containerId="c-placeholder-1" />
        <ContainerEditorSkeleton />
      </SkeletonProvider>,
    );
    fireEvent.click(screen.getByTestId('obs-open-wrapper'));
    expect(screen.getByTestId('obs-modal').getAttribute('data-topology')).toBe('circular');
    act(() => { fireEvent.click(screen.getByTestId('obs-modal-save-wrap')); });
    const pending = harnessState.pendingEditsByContainer['c-placeholder-1'];
    const w = (pending?.editedAnnotations || []).find((a) => a.id === 'wrapper');
    expect(w).toBeTruthy();
    expect(w.location).toEqual(WRAP);
    void harnessActions;
    void useStore;
  });

  it('documentHash follows the pending sequence/topology rather than saved bytes/resourceHash', () => {
    const pendingSequence = 'G'.repeat(1000);
    render(
      <SkeletonProvider>
        <HarnessAccess />
        <HarnessOpen
          containerId="c-placeholder-1"
          pendingPatch={{
            editedSequence: pendingSequence,
            editedTopology: 'linear',
            editedAnnotations: [WRAPPER],
          }}
        />
        <ContainerEditorSkeleton />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('obs-seq').getAttribute('data-document-hash')).toBe(
      documentIdentityOf({ sequence: pendingSequence, topology: 'linear' }),
    );
  });
});
