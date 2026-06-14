/**
 * LibraryWorkspace — annotation-edit persistence (bug-fix).
 *
 * Biolog (14.06.2026): «создал в аннотаторе ORF. после выхода из
 * аннотатора — она пропадает». In the LibraryWorkspace host the
 * inspector's `onUpdateEdits({editedAnnotations})` only wrote to the
 * transient per-entry React state — it never persisted to the library
 * entry's payload (the Importer host has had a write-through since
 * 07.05.2026, the workspace host was built without it). So an
 * annotation created in the embedded Annotator vanished on entry
 * switch / reload.
 *
 * This test drives an annotation edit through the inspector's
 * onUpdateEdits prop and asserts it lands in the persisted library
 * entry payload (entry.payload.annotations), not just transient state.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import LibraryWorkspace from '../LibraryWorkspace';

// Expose onUpdateEdits via a tiny stub so the test can fire a
// representative annotation edit without paying the SequenceView /
// Annotator render cost.
vi.mock('../inspector/LibrarySingleInspector', () => ({
  default: ({ item, onUpdateEdits }) => (
    <div data-testid="single-inspector-stub" data-item-id={item?.id || ''}>
      <button
        type="button"
        data-testid="fake-create-orf"
        onClick={() => onUpdateEdits?.({
          editedAnnotations: [
            ...(item?.annotations || []),
            { id: 'orf-1', type: 'CDS', name: 'ORF (328 aa)', start: 100, end: 1084, level: 'region', strand: -1 },
          ],
        })}
      >create</button>
    </div>
  ),
}));
vi.mock('../onboarding/OnboardingNudge', () => ({
  default: () => <div data-testid="onboarding-nudge">onboarding</div>,
}));
vi.mock('../CommonFeaturesPanel', () => ({
  default: () => <div data-testid="common-features-panel-stub">common</div>,
}));

async function freshDB() {
  const name = `bodgegene-ws-persist-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

function makeContainer(over = {}) {
  return {
    id: over.id || 'e1',
    kind: 'container',
    name: over.name || 'XynTL',
    tags: [],
    addedAt: new Date().toISOString(),
    payload: { length: 3316, topology: 'circular', annotations: [] },
    zone: 'loose',
    projectId: null,
    inLabStock: false,
    parentEntryId: null,
    parentEntryHash: null,
    origin: { kind: 'file_import' },
    ...over,
  };
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.looseFolders = [];
    s.workspace = { active: 'library', history: [], context: {} };
    s.currentProjectId = null;
    s.projects = s.projects || {};
  });
});
afterEach(cleanup);

describe('LibraryWorkspace — annotation persistence', () => {
  it('an annotation edit persists to the library entry payload (ORF survives, not transient-only)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'XynTL' }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    // Before: entry has no ORF.
    expect((useStore.getState().libraryEntries.e1.payload.annotations || []).length).toBe(0);

    fireEvent.click(screen.getByTestId('fake-create-orf'));

    // After: the write-through persisted the ORF onto the entry payload.
    await waitFor(() => {
      const anns = useStore.getState().libraryEntries.e1?.payload?.annotations || [];
      expect(anns.some((a) => a.id === 'orf-1')).toBe(true);
    });
  });
});
