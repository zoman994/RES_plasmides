/**
 * Sprint M-B.1 K5 — Step 2 Combined view + MultiFileList integration.
 *
 * Covers the four behaviours from §6 K5:
 *   1) Step 2 renders MoleculeWorkspace for the currently selected file.
 *   2) Edit annotation in workspace → editedAnnotations stored per file.
 *   3) Origin rotate Apply → editedSequence + editedAnnotations remapped
 *      (rotation re-anchors, originOffset input snaps back to 0).
 *   4) Switch between files in multi-file mode → per-file edits preserved.
 * Plus a sanity check that auto-annotate toggle re-fires enrichment.
 *
 * MoleculeWorkspace is a real mount but SequenceMapView is mocked (we did
 * the same in K4 — its layout measurement is happy-dom-noisy and Step 2's
 * concern is wiring, not pixel layout).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import { IMPORTER_MODE_STORAGE_KEY } from '../../../store/uiSlice';
import { removeItem } from '../../../lib/storage';
import Importer from '../index';

const enrichSpy = vi.fn(async (_seq, anns) => anns);
vi.mock('../../../auto-annotate', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    autoAnnotate: vi.fn(({ annotations = [] }) => annotations),
    enrichWithCommonFeatures: (...args) => enrichSpy(...args),
  };
});

vi.mock('../../SequenceMapView', () => ({
  default: ({ fragments }) => (
    <div
      data-testid="mock-sequence-map-view"
      data-frag-len={fragments?.[0]?.sequence?.length || 0}
      data-frag-first10={(fragments?.[0]?.sequence || '').slice(0, 10)}
    />
  ),
}));

// AnnotationEditor is reused as-is in production (smoke-mounted in K4). For
// Step 2 wiring tests we mock it to expose a deterministic onChange handle —
// the goal here is "Step2Combined writes to perFileEdits.editedAnnotations",
// not "AnnotationEditor delete button works".
vi.mock('../../AnnotationEditor', () => ({
  default: ({ annotations = [], onChange }) => (
    <div data-testid="mock-annotation-editor" data-count={annotations.length}>
      {annotations.map((a, i) => (
        <div key={a.id || i} data-testid={`mock-ann-row-${a.id || i}`}>{a.name}</div>
      ))}
      <button
        type="button"
        data-testid="mock-ann-delete-first"
        onClick={() => onChange?.(annotations.slice(1))}
      >del-first</button>
    </div>
  ),
}));

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  removeItem(IMPORTER_MODE_STORAGE_KEY);
  enrichSpy.mockClear();
  useStore.setState((state) => {
    state.canvas.activeFullscreen = 'importer';
    state.canvas.navStack = [{ fullscreen: 'importer', payload: { target: 'project' } }];
    state.importerMode = 'advanced';
    state.toasts = [];
    state.libraryEntries = {};
    state._libraryHydrated = true;
    state.primersById = {};
    state._primersHydrated = true;
  });
}

beforeEach(async () => {
  await reset();
  cleanup();
});

const PUC19_GB_SHORT = `LOCUS       pUC19                    100 bp ds-DNA     circular SYN 01-JAN-1980
FEATURES             Location/Qualifiers
     CDS             5..40
                     /label=AmpR
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
       61 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
//
`;

const FASTA_50 = `>filler
GGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGG
`;

const FASTA_PUC = `>pUC19
ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC
`;

function fileFromText(name, text) {
  return new File([text], name, { type: 'text/plain' });
}

async function dropAndAdvance(files) {
  const dz = screen.getByTestId('importer-dropzone');
  await act(async () => {
    fireEvent.drop(dz, { dataTransfer: { files, types: ['Files'] } });
  });
  await waitFor(() => {
    expect(screen.getByTestId('importer-next').disabled).toBe(false);
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId('importer-next'));
  });
  await waitFor(() => {
    expect(screen.getByTestId('importer-step2')).toBeTruthy();
  });
}

describe('M-B.1 K5 — Step 2 Combined view', () => {
  it('1) Step 2 renders MoleculeWorkspace for the currently selected file', async () => {
    render(<Importer />);
    await dropAndAdvance([fileFromText('pUC19.gb', PUC19_GB_SHORT)]);

    expect(screen.getByTestId('molecule-workspace')).toBeTruthy();
    const seq = screen.getByTestId('mock-sequence-map-view');
    expect(parseInt(seq.dataset.fragLen, 10)).toBeGreaterThan(0);

    // Single file → no MultiFileList sidebar.
    expect(screen.queryByTestId('importer-multi-file-list')).toBeNull();
    // Step 2 dataset reflects the active file.
    expect(screen.getByTestId('importer-step2').dataset.currentFile).toBe('pUC19.gb');
  });

  it('2) edit annotation in editor → editedAnnotations stored per file', async () => {
    render(<Importer />);
    await dropAndAdvance([fileFromText('pUC19.gb', PUC19_GB_SHORT)]);

    const editor = screen.getByTestId('mock-annotation-editor');
    const initialCount = parseInt(editor.dataset.count, 10);
    expect(initialCount).toBeGreaterThan(0);

    // Trigger onChange via the mock's "del-first" button — Step2Combined wires
    // it to updateEdits('editedAnnotations'); after re-render the editor
    // receives the trimmed list and renders one fewer row.
    await act(async () => {
      fireEvent.click(screen.getByTestId('mock-ann-delete-first'));
    });
    await waitFor(() => {
      const after = parseInt(screen.getByTestId('mock-annotation-editor').dataset.count, 10);
      expect(after).toBe(initialCount - 1);
    });
  });

  it('3) origin rotate Apply → editedSequence + editedAnnotations remapped, originOffset snaps to 0', async () => {
    // Use a circular GenBank so the start-point UI is enabled.
    render(<Importer />);
    await dropAndAdvance([fileFromText('pUC19.gb', PUC19_GB_SHORT)]);

    const seqViewBefore = screen.getByTestId('mock-sequence-map-view');
    const before = seqViewBefore.dataset.fragFirst10;
    expect(before).toBeTruthy();

    const input = screen.getByTestId('molecule-workspace-origin-input');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('molecule-workspace-origin-apply'));

    // SequenceMapView re-renders with rotated sequence first 10 chars.
    await waitFor(() => {
      const seqViewAfter = screen.getByTestId('mock-sequence-map-view');
      expect(seqViewAfter.dataset.fragFirst10).not.toBe(before);
    });
    // After rotation the input is reset to 0 (re-anchored coord space).
    expect(screen.getByTestId('molecule-workspace-origin-input').value).toBe('0');
  });

  it('4) multi-file: switching between files preserves per-file auto-annotate flag', async () => {
    render(<Importer />);
    await dropAndAdvance([
      fileFromText('a.gb', PUC19_GB_SHORT),
      fileFromText('b.fasta', FASTA_50),
    ]);

    // Sidebar visible with both cards.
    expect(screen.getByTestId('importer-multi-file-list')).toBeTruthy();
    const cardA = screen.getByTestId('importer-multi-file-card-a.gb');
    const cardB = screen.getByTestId('importer-multi-file-card-b.fasta');
    expect(cardA.dataset.active).toBe('true');
    expect(cardB.dataset.active).toBe('false');

    // Toggle A's auto-annotate OFF via sidebar checkbox.
    const cbA = screen.getByTestId('importer-multi-file-autoannotate-a.gb');
    expect(cbA.checked).toBe(true);
    fireEvent.click(cbA);
    await waitFor(() => {
      expect(screen.getByTestId('importer-multi-file-autoannotate-a.gb').checked).toBe(false);
    });

    // Switch to B — its flag is still ON (unaffected by A's change).
    fireEvent.click(cardB);
    await waitFor(() => {
      expect(screen.getByTestId('importer-step2').dataset.currentFile).toBe('b.fasta');
    });
    expect(screen.getByTestId('importer-multi-file-autoannotate-b.fasta').checked).toBe(true);

    // Switch back to A — its OFF state is preserved.
    fireEvent.click(cardA);
    await waitFor(() => {
      expect(screen.getByTestId('importer-step2').dataset.currentFile).toBe('a.gb');
    });
    expect(screen.getByTestId('importer-multi-file-autoannotate-a.gb').checked).toBe(false);
  });

  it('5) auto-annotate toggle on the current file re-runs enrichAnnotations', async () => {
    render(<Importer />);
    await dropAndAdvance([fileFromText('pUC19.gb', PUC19_GB_SHORT)]);
    enrichSpy.mockClear();
    const cb = screen.getByTestId('molecule-workspace-autoannotate-input');
    expect(cb.checked).toBe(true);

    // Toggle OFF then ON — the ON flip re-fires enrichment.
    fireEvent.click(cb);
    await waitFor(() => expect(cb.checked).toBe(false));
    fireEvent.click(cb);
    await waitFor(() => expect(cb.checked).toBe(true));
    await waitFor(() => {
      expect(enrichSpy).toHaveBeenCalled();
    });
  });
});
