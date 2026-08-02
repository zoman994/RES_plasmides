/**
 * STAGE 1 — the transient buffer has exactly ONE writer, so it has exactly one place to be counted.
 *
 * `LibraryWorkspace.onUpdateEdits` is that place: every surface that changes the edit buffer
 * (SequenceTab, the Annotator, undo/redo) funnels through it. Bumping the per-entry generation here
 * is what makes `displayedDocEpoch` able to tell two buffers apart at all — and the cases that matter are
 * exactly the ones the old edit-count/length token could not see:
 *   • a SAME-LENGTH substitution (both numbers stand still);
 *   • an undo followed by a different edit (`restore()` rewrites the buffer without growing editLog,
 *     and `mergeCorrection` collapses consecutive corrections into one record);
 *   • a topology flip (never in the token at all).
 *
 * The counter must NOT move for an annotation-only patch: annotations are not coordinates in the
 * sequence, and inflating the generation there would throw away a perfectly valid jump.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import LibraryWorkspace from '../LibraryWorkspace';

// The real inspector mounts SequenceView + the Annotator under lazy tabs. What this file needs from
// it is the ONE prop under test, so the stub exposes `onUpdateEdits` as clickable patches.
vi.mock('../inspector/LibrarySingleInspector', () => ({
  default: ({ item, onUpdateEdits }) => (
    <div data-testid="single-inspector-stub" data-item-id={item?.id || ''}>
      <button type="button" data-testid="patch-seq-a" onClick={() => onUpdateEdits({ editedSequence: 'AAAACCCC', editLog: [{ op: 'sub' }] })}>a</button>
      {/* same length, same editLog length — a substitution, the case the old token could not see */}
      <button type="button" data-testid="patch-seq-b" onClick={() => onUpdateEdits({ editedSequence: 'AAAAGGGG', editLog: [{ op: 'sub' }] })}>b</button>
      <button type="button" data-testid="patch-topology" onClick={() => onUpdateEdits({ editedTopology: 'linear' })}>t</button>
      <button type="button" data-testid="patch-annotations" onClick={() => onUpdateEdits({ editedAnnotations: [{ id: 'a1', name: 'orf', type: 'CDS', start: 0, end: 6 }] })}>ann</button>
    </div>
  ),
}));
vi.mock('../onboarding/OnboardingNudge', () => ({ default: () => <div data-testid="onboarding-nudge" /> }));
vi.mock('../CommonFeaturesPanel', () => ({ default: () => <div data-testid="common-features-panel-stub" /> }));

async function freshDB() {
  const db = resetDBForTests(`bodgegene-bufgen-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
}

const container = (id, name) => ({
  id,
  kind: 'container',
  name,
  tags: [],
  addedAt: new Date().toISOString(),
  payload: { sequence: 'ACGTACGTACGTACGT', length: 16, topology: 'circular', annotations: [] },
  zone: 'loose',
  projectId: null,
  inLabStock: false,
  parentEntryId: null,
  parentEntryHash: null,
  version: 1,
  origin: { kind: 'file_import' },
});

const genOf = (id) => useStore.getState().bufferGenerations?.[id];

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.looseFolders = [];
    s.workspace = { active: 'library', history: [], context: {} };
    s.currentProjectId = null;
    s.projects = s.projects || {};
    s.bufferGenerations = {};
  });
});
afterEach(cleanup);

async function openEntry(id, name = 'pUC19') {
  await useStore.getState().addLibraryEntry(container(id, name));
  render(<LibraryWorkspace />);
  fireEvent.click(screen.getByTestId(`tree-item-loose-${id}`));
  expect(screen.getByTestId('single-inspector-stub').getAttribute('data-item-id')).toBe(id);
}

describe('STAGE 1 — onUpdateEdits is the one point where the buffer generation moves', () => {
  it('a sequence edit bumps the generation of the entry being edited', async () => {
    await openEntry('e1');
    expect(genOf('e1')).toBeUndefined();
    fireEvent.click(screen.getByTestId('patch-seq-a'));
    expect(genOf('e1')).toBe(1);
  });

  it('a SAME-LENGTH substitution bumps it again — length and editLog length stand still', async () => {
    await openEntry('e1');
    fireEvent.click(screen.getByTestId('patch-seq-a'));
    fireEvent.click(screen.getByTestId('patch-seq-b'));
    expect(genOf('e1')).toBe(2);
  });

  it('re-applying the IDENTICAL buffer still bumps — an undo/redo round trip is a new document', async () => {
    // Undo restores a buffer byte-for-byte. A counter that deduplicated on content would hand back
    // a generation it had already issued, and a jump parked against the older one would revive.
    await openEntry('e1');
    fireEvent.click(screen.getByTestId('patch-seq-a'));
    fireEvent.click(screen.getByTestId('patch-seq-b'));
    fireEvent.click(screen.getByTestId('patch-seq-a'));
    expect(genOf('e1')).toBe(3);
  });

  it('a TOPOLOGY change bumps it — circular↔linear is a different reading of the same bases', async () => {
    await openEntry('e1');
    fireEvent.click(screen.getByTestId('patch-topology'));
    expect(genOf('e1')).toBe(1);
  });

  it('an annotation-only edit does NOT bump — no coordinate moved', async () => {
    await openEntry('e1');
    fireEvent.click(screen.getByTestId('patch-annotations'));
    expect(genOf('e1')).toBeUndefined();
  });

  it('the bump is PER-ENTRY — editing one molecule does not age the other', async () => {
    await useStore.getState().addLibraryEntry(container('e1', 'pUC19'));
    await useStore.getState().addLibraryEntry(container('e2', 'pET28'));
    render(<LibraryWorkspace />);

    fireEvent.click(screen.getByTestId('tree-item-loose-e1'));
    fireEvent.click(screen.getByTestId('patch-seq-a'));
    fireEvent.click(screen.getByTestId('patch-seq-b'));
    fireEvent.click(screen.getByTestId('tree-item-loose-e2'));
    fireEvent.click(screen.getByTestId('patch-seq-a'));

    expect(genOf('e1')).toBe(2);
    expect(genOf('e2')).toBe(1);
  });
});
