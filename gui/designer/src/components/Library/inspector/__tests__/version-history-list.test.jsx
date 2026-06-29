/**
 * VersionHistoryList — inline list-first version history with row actions
 * (Phase 3+4 of the version-tree redesign). Replaces the modal-first graph
 * as the primary view; «Граф» opens the full timeline on demand.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import VersionHistoryList from '../VersionHistoryList';

async function freshDB() {
  const name = `bodgegene-vhl-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

function entry(over) {
  return {
    id: over.id, name: over.name, kind: 'container', _pendingDelete: false,
    addedAt: over.addedAt || '2026-06-16T10:00:00Z',
    parentEntryId: over.parentEntryId ?? null,
    origin: over.origin || { kind: 'file_import' },
    payload: { sequence: over.sequence || 'ACGTACGTAC', topology: 'circular', annotations: [] },
  };
}

async function seedLineage() {
  await useStore.getState().addLibraryEntry(entry({ id: 'imp', name: 'pUC19', sequence: 'ACGTACGTAC' }));
  await useStore.getState().addLibraryEntry(entry({ id: 'e1', name: 'pUC19 v2', parentEntryId: 'imp', sequence: 'ACGTACGTAA', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z', changes: 'замена 10: C→A' } }));
  await useStore.getState().addLibraryEntry(entry({ id: 'b1', name: 'pUC19-T7', parentEntryId: 'imp', sequence: 'ACGTACGTACGG', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:06:00Z', lineageRole: 'branch', changes: '+T7' } }));
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => { s.libraryEntries = {}; s.toasts = []; });
});
afterEach(cleanup);

describe('VersionHistoryList', () => {
  it('returns null for a lineage of one (no real history)', async () => {
    await useStore.getState().addLibraryEntry(entry({ id: 'solo', name: 'pET28a' }));
    const { container } = render(<VersionHistoryList focusId="solo" onSelect={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists every version + branch with a count and branch marker', async () => {
    await seedLineage();
    render(<VersionHistoryList focusId="e1" onSelect={() => {}} />);
    expect(screen.getByTestId('version-history-list')).toBeTruthy();
    expect(screen.getByTestId('version-history-list').textContent).toMatch(/История · 3/);
    expect(screen.getByTestId('version-history-branchcount')).toBeTruthy();
    expect(screen.getByTestId('version-row-imp')).toBeTruthy();
    expect(screen.getByTestId('version-row-e1')).toBeTruthy();
    expect(screen.getByTestId('version-row-b1')).toBeTruthy();
    // branch row carries the ⑂ marker
    expect(screen.getByTestId('version-row-b1').textContent).toMatch(/⑂/);
    // focused row marked current (no «Открыть» on itself)
    expect(screen.getByTestId('version-row-e1').getAttribute('data-current')).toBe('true');
    expect(screen.queryByTestId('version-open-e1')).toBeNull();
  });

  it('«Открыть» on another version calls onSelect with its id', async () => {
    await seedLineage();
    const onSelect = vi.fn();
    render(<VersionHistoryList focusId="e1" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('version-open-imp'));
    expect(onSelect).toHaveBeenCalledWith('imp');
  });

  it('«Граф» button invokes onOpenGraph', async () => {
    await seedLineage();
    const onOpenGraph = vi.fn();
    render(<VersionHistoryList focusId="e1" onSelect={() => {}} onOpenGraph={onOpenGraph} />);
    fireEvent.click(screen.getByTestId('version-history-open-graph'));
    expect(onOpenGraph).toHaveBeenCalled();
  });

  it('Diff toggles an inline panel with substitutions vs the head', async () => {
    await seedLineage();
    render(<VersionHistoryList focusId="b1" onSelect={() => {}} />);
    // head is e1 (mainline tip); diff imp (ACGTACGTAC) vs e1 (ACGTACGTAA) → 1 sub
    fireEvent.click(screen.getByTestId('version-diff-imp'));
    const panel = screen.getByTestId('version-diff-panel-imp');
    expect(panel.textContent).toMatch(/замен:\s*1/);
  });

  it('rename row dispatches renameLibraryEntry', async () => {
    await seedLineage();
    const origPrompt = window.prompt;
    window.prompt = () => 'pUC19 переименован';
    try {
      render(<VersionHistoryList focusId="e1" onSelect={() => {}} />);
      fireEvent.click(screen.getByTestId('version-rename-imp'));
      await waitFor(() => expect(useStore.getState().libraryEntries.imp.name).toBe('pUC19 переименован'));
    } finally { window.prompt = origPrompt; }
  });

  it('status select writes origin.status', async () => {
    await seedLineage();
    render(<VersionHistoryList focusId="e1" onSelect={() => {}} />);
    fireEvent.change(screen.getByTestId('version-status-imp'), { target: { value: 'release' } });
    await waitFor(() => expect(useStore.getState().libraryEntries.imp.origin.status).toBe('release'));
  });

  it('delete soft-deletes the row + re-selects a survivor when deleting the focus', async () => {
    await seedLineage();
    const onSelect = vi.fn();
    render(<VersionHistoryList focusId="e1" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('version-delete-e1'));
    await waitFor(() => expect(useStore.getState().libraryEntries.e1._pendingDelete).toBe(true));
    // onSelect fires AFTER markPendingDelete's async persist resolves — wait for
    // it rather than asserting immediately (the _pendingDelete flag is set
    // synchronously, before the Dexie write the re-select awaits).
    await waitFor(() => expect(onSelect).toHaveBeenCalled()); // re-selected a survivor
  });
});
