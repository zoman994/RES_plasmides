/**
 * library-tree-host-import-v104.test.jsx — V104 + WT-D-2.
 *
 * V104: LibraryTreeHost.importFiles previously called bare parseFile, so the
 * canvas import path (file picker AND paste) skipped common-feature homology
 * enrichment that the production importer runs. Now importFiles routes
 * parseFile → enrichAnnotations → buildLibraryEntry, unifying the path.
 *
 * WT-D-2: AddModal carries an «Авто-аннотация» toggle (default on) whose value
 * rides the preset → onLaunchPreImport → importFiles opts → enrichAnnotations.
 *
 * The heavy LibraryTreeRoot / RestrictionPanel are stubbed; AddModal is real
 * (it produces the preset). file-import + build-library-entry are mocked so we
 * can assert the call wiring (enrichment ran, and got the right flag).
 */
import 'fake-indexeddb/auto';
import React from 'react';
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  render, screen, fireEvent, cleanup, waitFor,
} from '@testing-library/react';
import { useStore } from '../../../store';

vi.mock('../../Library/tree/LibraryTreeRoot', () => ({
  default: ({ onAddClick }) => (
    <button type="button" data-testid="stub-add-click" onClick={onAddClick}>add</button>
  ),
}));
vi.mock('../RestrictionPanel', () => ({ default: () => null }));
vi.mock('../../../file-import', () => ({
  ACCEPT_STRING: '.fasta',
  parseFile: vi.fn(async () => ({
    name: 'F', sequence: 'ACGTACGT', length: 8, topology: 'linear',
    annotations: [], _fromFileCount: 0, _ext: '.fasta', _metadata: null,
  })),
  enrichAnnotations: vi.fn(async (item) => ({ ...item, _enriched: true })),
}));
vi.mock('../../Library/lib/build-library-entry', () => ({
  buildLibraryEntry: vi.fn(({ parsed }) => ({ id: 'e1', name: parsed.name || 'F' })),
}));

import LibraryTreeHost from '../LibraryTreeHost';
import { parseFile, enrichAnnotations } from '../../../file-import';
import { buildLibraryEntry } from '../../Library/lib/build-library-entry';

beforeEach(() => {
  useStore.setState((s) => {
    s.addLibraryEntry = vi.fn(async () => {});
    s.addLibraryEntriesBulk = vi.fn(async () => {});
    s.showToast = vi.fn();
    s.currentProjectId = null;
    s.pinnedProjectIds = [];
    s.projects = {};
  });
  parseFile.mockClear();
  enrichAnnotations.mockClear();
  buildLibraryEntry.mockClear();
});
afterEach(cleanup);

function openPasteAndType(text) {
  fireEvent.click(screen.getByTestId('stub-add-click'));
  fireEvent.click(screen.getByTestId('add-modal-source-paste'));
  fireEvent.change(screen.getByTestId('add-modal-paste-textarea'), { target: { value: text } });
}

describe('V104 — LibraryTreeHost.importFiles runs enrichAnnotations', () => {
  it('paste import path goes parseFile → enrichAnnotations → buildLibraryEntry', async () => {
    render(<LibraryTreeHost />);
    openPasteAndType('>F1 ACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(enrichAnnotations).toHaveBeenCalledTimes(1));
    expect(parseFile).toHaveBeenCalledTimes(1);
    // buildLibraryEntry receives the ENRICHED item, not the bare parseFile output.
    await waitFor(() => expect(buildLibraryEntry).toHaveBeenCalledTimes(1));
    expect(buildLibraryEntry.mock.calls[0][0].parsed._enriched).toBe(true);
  });

  it('default (toggle untouched) enriches with autoAnnotate !== false', async () => {
    render(<LibraryTreeHost />);
    openPasteAndType('>F1 ACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(enrichAnnotations).toHaveBeenCalledTimes(1));
    expect(enrichAnnotations.mock.calls[0][1]).toEqual({ autoAnnotate: true });
  });
});

describe('WT-D-2 — AddModal autoAnnotate toggle flows to enrichAnnotations', () => {
  it('toggling «Авто-аннотация» off → importFiles calls enrichAnnotations with {autoAnnotate:false}', async () => {
    render(<LibraryTreeHost />);
    openPasteAndType('>F1 ACGTACGT');
    // Turn the toggle off before submitting.
    fireEvent.click(screen.getByTestId('add-modal-auto-annotate'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(enrichAnnotations).toHaveBeenCalledTimes(1));
    expect(enrichAnnotations.mock.calls[0][1]).toEqual({ autoAnnotate: false });
  });
});

describe('WT-UX-8/7 — LibraryTreeHost applies paste name/topology to the entry', () => {
  it('paste name → parsed.name is overridden before buildLibraryEntry', async () => {
    render(<LibraryTreeHost />);
    openPasteAndType('ACGTACGT');
    fireEvent.change(screen.getByTestId('add-modal-paste-name'), { target: { value: 'pMyName' } });
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(buildLibraryEntry).toHaveBeenCalledTimes(1));
    expect(buildLibraryEntry.mock.calls[0][0].parsed.name).toBe('pMyName');
  });

  it('topology toggle = circular → parsed.topology set to circular', async () => {
    render(<LibraryTreeHost />);
    openPasteAndType('ACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-topology-circular'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(buildLibraryEntry).toHaveBeenCalledTimes(1));
    expect(buildLibraryEntry.mock.calls[0][0].parsed.topology).toBe('circular');
  });

  it('no name + linear (defaults) → keeps parseFile name/topology (Batch-1 behaviour)', async () => {
    render(<LibraryTreeHost />);
    openPasteAndType('ACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(buildLibraryEntry).toHaveBeenCalledTimes(1));
    expect(buildLibraryEntry.mock.calls[0][0].parsed.name).toBe('F');
    expect(buildLibraryEntry.mock.calls[0][0].parsed.topology).toBe('linear');
  });
});
