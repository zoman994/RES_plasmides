/**
 * LibraryWorkspace — edit-path wiring (bug-fix follow-up).
 *
 * Audit 14.06.2026 (roy): the workspace host built its inspector item as
 * `{...rawEntry, ...payload}` WITHOUT `_libraryEntryId`. Every inspector
 * feature gated on item._libraryEntryId then silently no-op'd here —
 * critically, character-level SEQUENCE edits (onSequenceEditFromView
 * early-returns) and manual-edit branching (useManualEditBranching.armed
 * false), so a sequence edit in the workspace vanished with no error.
 *
 * Fix: build the item WITH `_libraryEntryId: selectedId` (entry id ===
 * selectedId), mirroring the Importer host (useLibraryState). That re-arms
 * the sequence-edit / branch-on-edit path (persists via
 * applySequenceEditOnLibraryEntry / createManualEditBranch). Side effect:
 * useLibrarySaveFlow.visible would surface the Importer-only explicit Save
 * buttons — those are suppressed in the workspace (silent-persist UX,
 * DEC-LIB-13) via showSaveActions={false}.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import LibraryWorkspace from '../LibraryWorkspace';

// Surface the two props the fix is about so we can assert wiring without
// paying the real inspector / SequenceView render cost.
vi.mock('../inspector/LibrarySingleInspector', () => ({
  default: ({ item, showSaveActions, onUpdateTags }) => (
    <div
      data-testid="single-inspector-stub"
      data-item-id={item?.id || ''}
      data-library-entry-id={item?._libraryEntryId || ''}
      data-show-save={showSaveActions === false ? 'false' : 'true'}
    >
      inspector
      <button
        type="button"
        data-testid="fake-add-tag"
        onClick={() => onUpdateTags?.([...(item?.tags || []), 'expression'])}
      >tag</button>
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
  const name = `bodgegene-ws-wiring-${Math.random().toString(36).slice(2)}`;
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

describe('LibraryWorkspace — edit-path wiring', () => {
  it('passes _libraryEntryId to the inspector so sequence edits / branch-on-edit are reachable', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1' }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    const ins = screen.getByTestId('single-inspector-stub');
    expect(ins.getAttribute('data-library-entry-id')).toBe('e1');
  });

  it('surfaces the explicit «Перезаписать» / «Сохранить как версию» panel (Игорь — правки как в выравнивателе)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1' }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    expect(screen.getByTestId('single-inspector-stub').getAttribute('data-show-save')).toBe('true');
  });

  it('surfaces an inline version history for an entry with lineage; «Открыть» navigates; «Граф» opens the timeline', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'imp', name: 'pUC19', origin: { kind: 'file_import' } }));
    await useStore.getState().addLibraryEntry(makeContainer({
      id: 'br', name: 'pUC19 · испр.', parentEntryId: 'imp',
      origin: { kind: 'manual_edit', parentEntryId: 'imp', changes: 'замена 66: G→A' },
    }));
    render(<LibraryWorkspace />);
    // imp→br now collapse into one lineage node; its head row represents the
    // tip (br). Clicking it selects br.
    fireEvent.click(screen.getByTestId('version-lineage-imp'));
    // Inline list (list-first), not a modal button.
    const list = screen.getByTestId('version-history-list');
    expect(list.textContent).toContain('2'); // 2-node lineage
    expect(screen.getByTestId('version-row-imp')).toBeTruthy();
    expect(screen.getByTestId('version-row-br')).toBeTruthy();
    // «Открыть» on the import row → workspace navigates the inspector to it.
    fireEvent.click(screen.getByTestId('version-open-imp'));
    await waitFor(() => {
      expect(screen.getByTestId('single-inspector-stub').getAttribute('data-item-id')).toBe('imp');
    });
    // «Граф» opens the full timeline modal on demand.
    fireEvent.click(screen.getByTestId('version-history-open-graph'));
    expect(screen.getByTestId('version-timeline-modal')).toBeTruthy();
  });

  it('onUpdateTags persists to the library entry (entry.tags, store + IndexedDB)', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1' }));
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    fireEvent.click(screen.getByTestId('fake-add-tag'));
    await waitFor(() => {
      expect(useStore.getState().libraryEntries.e1.tags).toContain('expression');
    });
  });
});
