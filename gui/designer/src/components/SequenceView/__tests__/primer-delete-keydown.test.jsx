/**
 * primer-delete-keydown.test.jsx — выделенный праймер: Del удаляет ПРАЙМЕР,
 * а не нуклеотид; каретка гаснет, пока праймер выделен (Игорь 24.05.2026).
 *
 * Wiring (5-file change):
 *  - PrimerTrack hit carries `id` (via useAssemblyPrimerWriting viewerPrimers);
 *  - SequenceView `onPrimerDeleteKeyDown` runs FIRST in `onRootKeyDown` — with
 *    a primer selected, Delete/Backspace call `onDeletePrimer(hit)` and the
 *    event never reaches the annotation / sequence edit path;
 *  - read-only viewers (no `onDeletePrimer`) still swallow the key (the
 *    nucleotide is never edited);
 *  - CaretOverlay gains `hidden` → returns null while a primer is selected.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

// Unique binding region flanked by repeats so each primer matches EXACTLY
// once (the surrounding 'ATGGCC' tract is fully periodic).
const SEQ = 'ATGGCC'.repeat(20) + 'TTAGCATCGATTGCACTAGT' + 'ATGGCC'.repeat(20); // 260 nt
const FRAGMENT = {
  id: 'frag-1', name: 'demo', type: 'CDS', sequence: SEQ, strand: 1,
  annotations: [
    { id: 'region:0:99:CDS:lacZ', type: 'CDS', name: 'lacZ', start: 0, end: 99, level: 'region', strand: 1 },
  ],
};
const PRIMER1 = { id: 'asmprm-1', name: 'p1', direction: 'forward', bindingSequence: 'TTAGCATCGATT' }; // [120,132)
const PRIMER2 = { id: 'asmprm-2', name: 'p2', direction: 'forward', bindingSequence: 'CGATTGCACTAG' }; // [127,139)

function resetSettings() {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: 'auto',
      autoThreshold: 0.8,
      primerStyle: 'filled',
      reOrientation: 'horizontal',
      visibleFrames: {
        '1': true, '2': true, '3': true, '-1': true, '-2': true, '-3': true,
      },
      predictions: {},
    },
  });
}
beforeEach(() => {
  resetSettings();
  // happy-dom returns 0/undefined for offset* by default, so the
  // CaretOverlay box never measures → caret absent. Stub the prototype
  // getters (same trick as overlay-layout-epoch-v96 / wrap-bridge-caret)
  // so the caret renders and its hide-on-primer-select is observable.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', { configurable: true, get() { return 100; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', { configurable: true, get() { return 0; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 18; } });
});
afterEach(() => { cleanup(); });

const root = () => screen.getByTestId('sequence-view-root');

describe('SequenceView — Del on a selected primer deletes the primer, not the nucleotide', () => {
  it('primer selected → Delete calls onDeletePrimer(hit) with its id; annotation/sequence untouched', () => {
    const onDeletePrimer = vi.fn();
    const onAnnotationEdit = vi.fn();
    const onSequenceEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        primers={[PRIMER1]}
        onDeletePrimer={onDeletePrimer}
        onAnnotationEdit={onAnnotationEdit}
        onSequenceEdit={onSequenceEdit}
        editable
      />,
    );
    fireEvent.click(screen.getByTestId('sequence-view-primer')); // select the primer
    fireEvent.keyDown(root(), { key: 'Delete' });
    expect(onDeletePrimer).toHaveBeenCalledTimes(1);
    expect(onDeletePrimer.mock.calls[0][0].id).toBe('asmprm-1');
    // selection covered the lacZ region — but the primer-delete handler
    // intercepts FIRST, so the annotation / sequence path never runs.
    expect(onAnnotationEdit).not.toHaveBeenCalled();
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });

  it('Backspace behaves the same as Delete', () => {
    const onDeletePrimer = vi.fn();
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        primers={[PRIMER1]}
        onDeletePrimer={onDeletePrimer}
        onAnnotationEdit={onAnnotationEdit}
      />,
    );
    fireEvent.click(screen.getByTestId('sequence-view-primer'));
    fireEvent.keyDown(root(), { key: 'Backspace' });
    expect(onDeletePrimer).toHaveBeenCalledTimes(1);
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });

  it('no primer selected → Delete still runs the annotation/sequence edit path (unchanged)', () => {
    const onDeletePrimer = vi.fn();
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        primers={[PRIMER1]}
        onDeletePrimer={onDeletePrimer}
        onAnnotationEdit={onAnnotationEdit}
      />,
    );
    fireEvent.keyDown(root(), { key: 'Delete' }); // nothing selected
    expect(onDeletePrimer).not.toHaveBeenCalled();
    expect(onAnnotationEdit).toHaveBeenCalledWith({ kind: 'delete', id: 'region:0:99:CDS:lacZ' });
  });

  it('read-only viewer (no onDeletePrimer): Delete with a selected primer is swallowed, nucleotide untouched', () => {
    const onAnnotationEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={99}
        caretAnchor={0}
        primers={[PRIMER1]}
        onAnnotationEdit={onAnnotationEdit}
      />,
    );
    fireEvent.click(screen.getByTestId('sequence-view-primer'));
    fireEvent.keyDown(root(), { key: 'Delete' });
    // event consumed by the primer-delete guard → no annotation/sequence edit
    expect(onAnnotationEdit).not.toHaveBeenCalled();
  });

  it('two primers selected → Delete removes BOTH («удаляется то, что выделено»)', () => {
    const onDeletePrimer = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={50}
        caretAnchor={50}
        primers={[PRIMER1, PRIMER2]}
        onDeletePrimer={onDeletePrimer}
      />,
    );
    fireEvent.click(screen.getAllByTestId('sequence-view-primer')[0]);
    fireEvent.click(screen.getAllByTestId('sequence-view-primer')[1]);
    fireEvent.keyDown(root(), { key: 'Delete' });
    expect(onDeletePrimer).toHaveBeenCalledTimes(2);
    const ids = onDeletePrimer.mock.calls.map((c) => c[0].id).sort();
    expect(ids).toEqual(['asmprm-1', 'asmprm-2']);
  });

  it('selecting a primer hides the caret; deselecting restores it (read-only viewer)', () => {
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={50}
        caretAnchor={50}
        primers={[PRIMER1]}
        onDeletePrimer={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('sequence-view-caret')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sequence-view-primer'));
    expect(screen.queryByTestId('sequence-view-caret')).toBeNull(); // hidden while selected
    fireEvent.click(screen.getByTestId('sequence-view-primer')); // toggle off
    expect(screen.queryByTestId('sequence-view-caret')).toBeTruthy(); // restored
  });

  // V143 (Игорь 12.06, screenshot) — in an EDITABLE view (the assembly editor),
  // the caret must stay visible even with a primer selected: you're typing into
  // the sequence, so «курсор исчезает» reads as broken. Del still targets the
  // primer (the keydown guard keys off selectedPrimers, not the caret), so the
  // read-only hide-on-select behaviour above is unchanged — only editable flips.
  it('editable view: the caret stays visible even with a primer selected (V143)', () => {
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        caretPos={50}
        caretAnchor={50}
        primers={[PRIMER1]}
        onDeletePrimer={vi.fn()}
        editable
      />,
    );
    expect(screen.queryByTestId('sequence-view-caret')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sequence-view-primer'));
    expect(screen.queryByTestId('sequence-view-caret')).toBeTruthy(); // still visible — editing
  });
});
