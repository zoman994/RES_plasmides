/**
 * library-workspace-paste-autoannotate.test.jsx — Звено 25.05.2026.
 *
 * Bug: AddModal's «Авто-аннотация» checkbox was decorative on the LIVE import
 * host (LibraryWorkspace). `onLaunchPreImport` dropped `preset.autoAnnotate`
 * (and name/topology), and `importFiles(files, projectId)` never ran
 * `enrichAnnotations`. So a pasted sequence landed with zero features.
 *
 * Fix: importFiles(files, projectId, opts) runs enrichAnnotations when
 * autoAnnotate !== false, and applies name/topology overrides;
 * onLaunchPreImport forwards the preset to both file & paste branches.
 *
 * Pattern mirrors library-tree-host-import-v104 (the sibling host), adapted:
 * LibraryWorkspace calls buildLibraryEntry POSITIONALLY (parsed, name, null),
 * and also imports extractItemName. The heavy children are stubbed; AddModal
 * is real (it produces the preset); file-import + build-library-entry are
 * mocked so we assert the resulting entry handed to addLibraryEntry.
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

// Heavy children stubbed — LibraryTreeRoot exposes the +Add entry point.
vi.mock('../LibraryTopBar', () => ({ default: () => null }));
vi.mock('../tree/LibraryTreeRoot', () => ({
  default: ({ onAddClick }) => (
    <button type="button" data-testid="stub-add-click" onClick={onAddClick}>add</button>
  ),
}));
vi.mock('../inspector/LibrarySingleInspector', () => ({ default: () => null }));
vi.mock('../inspector/LibraryActionRow', () => ({ default: () => null }));
vi.mock('../onboarding/OnboardingNudge', () => ({ default: () => null }));
vi.mock('../../SequenceSearchPopover', () => ({ default: () => null }));

// file-import: parseFile yields a headerless ACGT item with NO annotations;
// enrichAnnotations adds one (homology hit) only when autoAnnotate !== false.
vi.mock('../../../file-import', () => ({
  ACCEPT_STRING: '.fasta',
  parseFile: vi.fn(async () => ({
    name: 'F', sequence: 'ACGTACGTACGT', length: 12, topology: 'linear', annotations: [],
  })),
  extractItemName: vi.fn(() => 'F'),
  enrichAnnotations: vi.fn(async (item, opts) => (
    opts && opts.autoAnnotate === false
      ? item
      : { ...item, annotations: [{ name: 'kanR', type: 'CDS', start: 0, end: 100, strand: 1 }] }
  )),
}));
// buildLibraryEntry is called POSITIONALLY in LibraryWorkspace: (parsed, name, null).
vi.mock('../lib/build-library-entry', () => ({
  buildLibraryEntry: vi.fn((parsed, name) => ({
    id: 'e1',
    name: name || parsed.name,
    payload: { annotations: parsed.annotations || [], topology: parsed.topology, length: parsed.length },
  })),
}));

import LibraryWorkspace from '../LibraryWorkspace';
import { parseFile, enrichAnnotations } from '../../../file-import';
import { buildLibraryEntry } from '../lib/build-library-entry';

let added;
beforeEach(() => {
  added = [];
  useStore.setState((s) => {
    s.addLibraryEntry = vi.fn(async (entry) => { added.push(entry); });
    s.addLibraryEntriesBulk = vi.fn(async () => {});
    s.showToast = vi.fn();
    s.currentProjectId = null;
    s.pinnedProjectIds = [];
    s.projects = {};
    s.libraryEntries = {};
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

describe('LibraryWorkspace paste import — «Авто-аннотация» actually enriches', () => {
  it('autoAnnotate ON (default) → enrichAnnotations runs, entry carries features', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntry).toHaveBeenCalledTimes(1));
    expect(enrichAnnotations).toHaveBeenCalledTimes(1);
    expect(enrichAnnotations.mock.calls[0][1]).toEqual({ autoAnnotate: true });
    // the created entry has the enriched feature, not the bare empty list
    expect(added[0].payload.annotations.length).toBeGreaterThan(0);
  });

  it('autoAnnotate OFF → enrichAnnotations is skipped, entry has no features', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-auto-annotate')); // toggle off
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntry).toHaveBeenCalledTimes(1));
    expect(enrichAnnotations).not.toHaveBeenCalled();
    expect(added[0].payload.annotations.length).toBe(0);
  });

  it('paste name + circular topology overrides land on the entry', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.change(screen.getByTestId('add-modal-paste-name'), { target: { value: 'pKanR' } });
    fireEvent.click(screen.getByTestId('add-modal-topology-circular'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntry).toHaveBeenCalledTimes(1));
    expect(added[0].name).toBe('pKanR');
    expect(added[0].payload.topology).toBe('circular');
  });

  it('regression: default paste (no name) keeps parseFile name + still creates the entry', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntry).toHaveBeenCalledTimes(1));
    expect(added[0].name).toBe('F');
    expect(buildLibraryEntry).toHaveBeenCalledTimes(1);
  });
});
