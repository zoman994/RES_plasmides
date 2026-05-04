/**
 * annotator-entry-points.test.jsx — Sprint M-X.2 K9 coverage.
 *
 * Tests the three entry points that fire `openAnnotator`:
 *  1) AnnotationsTab `🔍 Аннотатор` button → openAnnotator({kind:'full'})
 *  2) SelectionContextMenu «Annotate selection...» item →
 *     openAnnotator({kind:'region', region}) + closes the menu.
 *  3) CreateAnnotationPopup [Найти в Аннотаторе] →
 *     openAnnotator({kind:'region'}) + closes the popup.
 *  4) CreateAnnotationPopup [Создать] → applyAnnotationEdit fires
 *     instead of openAnnotator.
 *  5) Context menu item is disabled when selection is empty (no entry).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AnnotationsTab from '../../Importer/inspector/tabs/AnnotationsTab';
import SequenceView from '../../SequenceView';
import { useStore } from '../../../store';

const FRAGMENT = {
  id: 'frag-1',
  name: 'demo',
  type: 'CDS',
  sequence: 'ATGGCC'.repeat(50),
  strand: 1,
  annotations: [
    { id: 'r1', name: 'lacZ', type: 'CDS', start: 0, end: 99, level: 'region', strand: 1 },
  ],
};

function resetSettings() {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: 'auto',
      autoThreshold: 0.8,
      primerStyle: 'filled',
      reOrientation: 'horizontal',
      visibleFrames: { '1': true, '2': true, '3': true, '-1': true, '-2': true, '-3': true },
      predictions: {},
    },
  });
}

beforeEach(() => { resetSettings(); });
afterEach(() => { cleanup(); });

describe('K9 entry points', () => {
  it('AnnotationsTab Аннотатор button → onOpenAnnotator(full)', () => {
    const onOpenAnnotator = vi.fn();
    render(
      <AnnotationsTab
        annotations={FRAGMENT.annotations}
        seqLength={FRAGMENT.sequence.length}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    fireEvent.click(screen.getByTestId('annotations-open-annotator'));
    expect(onOpenAnnotator).toHaveBeenCalledWith({ kind: 'full' });
  });

  it('AnnotationsTab Аннотатор button disabled when no callback', () => {
    render(
      <AnnotationsTab
        annotations={FRAGMENT.annotations}
        seqLength={FRAGMENT.sequence.length}
      />
    );
    expect(screen.getByTestId('annotations-open-annotator').disabled).toBe(true);
  });

  it('SequenceView context menu has «Annotate selection...» entry when selection + onOpenAnnotator wired', () => {
    const onOpenAnnotator = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={vi.fn()}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.contextMenu(root, { clientX: 100, clientY: 100 });
    const menu = screen.getByTestId('sequence-view-context-menu');
    // The annotate entry is the last extraItem when matchedRegion=false.
    const annotateEntry = Array.from(menu.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.includes('Annotate selection')
    );
    expect(annotateEntry).toBeTruthy();
  });

  it('SequenceView Аннотировать item → openAnnotator(region) + close menu', () => {
    const onOpenAnnotator = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={vi.fn()}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.contextMenu(root, { clientX: 100, clientY: 100 });
    const annotateBtn = Array.from(screen.getByTestId('sequence-view-context-menu').querySelectorAll('button'))
      .find((b) => b.textContent && b.textContent.includes('Annotate selection'));
    fireEvent.click(annotateBtn);
    expect(onOpenAnnotator).toHaveBeenCalledWith({
      kind: 'region',
      region: { start: 100, end: 150 },
    });
    expect(screen.queryByTestId('sequence-view-context-menu')).toBeNull();
  });

  it('CreateAnnotationPopup [Найти в Аннотаторе] → onOpenAnnotator(region) + closes popup', () => {
    const onOpenAnnotator = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={vi.fn()}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    fireEvent.click(screen.getByTestId('sequence-view-create-annotation-open-annotator'));
    expect(onOpenAnnotator).toHaveBeenCalledWith({
      kind: 'region',
      region: { start: 100, end: 150 },
    });
    expect(screen.queryByTestId('sequence-view-create-annotation-popup')).toBeNull();
  });

  it('CreateAnnotationPopup [Создать] does NOT open Annotator (dispatches applyAnnotationEdit)', () => {
    const onAnnotationEdit = vi.fn();
    const onOpenAnnotator = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={150}
        caretAnchor={100}
        onAnnotationEdit={onAnnotationEdit}
        onOpenAnnotator={onOpenAnnotator}
      />
    );
    const root = screen.getByTestId('sequence-view-root');
    fireEvent.keyDown(root, { key: 'h' });
    fireEvent.click(screen.getByTestId('sequence-view-create-annotation-submit'));
    expect(onOpenAnnotator).not.toHaveBeenCalled();
    expect(onAnnotationEdit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'create' }));
  });
});
