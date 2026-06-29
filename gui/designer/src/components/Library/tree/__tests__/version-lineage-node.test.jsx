/**
 * VersionLineageNode + ProjectZone collapse — Phase 2 of the version-tree
 * redesign. A version lineage must render as ONE collapsible tree node
 * (head + count) instead of N flat sibling rows; expanding reveals the
 * version stack + branches.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import { groupVisibleLineages } from '../../lib/version-lineage';
import VersionLineageNode from '../VersionLineageNode';
import ProjectZone from '../ProjectZone';

async function freshDB() {
  const name = `bodgegene-vln-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

function makeContainer(over = {}) {
  return {
    id: over.id || `c-${Math.random().toString(36).slice(2)}`,
    kind: 'container', name: over.name || 'pUC19',
    tags: over.tags || [],
    addedAt: over.addedAt || new Date().toISOString(),
    payload: over.payload || { length: 2686, topology: 'circular', annotations: [] },
    zone: over.zone ?? 'loose',
    projectId: over.projectId ?? null,
    parentEntryId: over.parentEntryId ?? null,
    origin: over.origin || { kind: 'file_import' },
    ...over,
  };
}

const LIN = {
  imp: makeContainer({ id: 'imp', name: 'pUC19', addedAt: '2026-06-16T10:02:00Z', origin: { kind: 'file_import' } }),
  e1: makeContainer({ id: 'e1', name: 'pUC19 v2', addedAt: '2026-06-16T10:05:00Z', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z' } }),
  e2: makeContainer({ id: 'e2', name: 'pUC19 v3', addedAt: '2026-06-16T10:06:00Z', parentEntryId: 'e1', origin: { kind: 'manual_edit', parentEntryId: 'e1', editedAt: '2026-06-16T10:06:00Z' } }),
  v1: makeContainer({ id: 'v1', name: 'pUC19-T7', addedAt: '2026-06-16T10:05:30Z', parentEntryId: 'imp', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:05:30Z' } }),
};

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => { s.libraryEntries = {}; s.currentProjectId = null; });
});
afterEach(cleanup);

describe('VersionLineageNode', () => {
  function lineageGroup() {
    const map = { imp: LIN.imp, e1: LIN.e1, e2: LIN.e2, v1: LIN.v1 };
    return groupVisibleLineages(map, [LIN.e2, LIN.v1, LIN.e1, LIN.imp]).find((g) => g.rootId === 'imp');
  }

  it('collapsed → one head row with the member count + branch marker, no member rows', () => {
    render(<VersionLineageNode group={lineageGroup()} expanded={false} onToggle={() => {}} testId="vl-imp" />);
    expect(screen.getByTestId('vl-imp')).toBeTruthy();
    expect(screen.getByTestId('vl-imp-count').textContent).toBe('4');
    expect(screen.getByTestId('vl-imp-branches')).toBeTruthy(); // 1 ⑂
    // head = structural tip (e2)
    expect(screen.getByTestId('vl-imp').textContent).toMatch(/pUC19 v3/);
    // members are hidden while collapsed
    expect(screen.queryByTestId('tree-item-version-e1')).toBeNull();
    expect(screen.queryByTestId('tree-item-version-v1')).toBeNull();
  });

  it('expanded → version stack (mainline) + branch row appear', () => {
    render(<VersionLineageNode group={lineageGroup()} expanded onToggle={() => {}} testId="vl-imp" />);
    expect(screen.getByTestId('tree-item-version-imp')).toBeTruthy();
    expect(screen.getByTestId('tree-item-version-e1')).toBeTruthy();
    expect(screen.getByTestId('tree-item-version-e2')).toBeTruthy();
    // branch v1 rendered with a ⑂ badge
    const branchRow = screen.getByTestId('tree-item-version-v1');
    expect(branchRow.textContent).toMatch(/⑂/);
  });

  it('twist click toggles; head-row body click selects the head entry', () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    render(<VersionLineageNode group={lineageGroup()} expanded={false} onToggle={onToggle} onSelectEntry={onSelect} testId="vl-imp" />);
    fireEvent.click(screen.getByTestId('vl-imp-twist'));
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('vl-imp'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
  });

  it('a single-entry group still renders (count 1, no branches)', () => {
    const solo = makeContainer({ id: 'solo', name: 'pET28a' });
    const g = groupVisibleLineages({ solo }, [solo])[0];
    render(<VersionLineageNode group={g} expanded testId="vl-solo" />);
    expect(screen.getByTestId('vl-solo-count').textContent).toBe('1');
    expect(screen.queryByTestId('vl-solo-branches')).toBeNull();
  });
});

describe('ProjectZone — lineage collapse', () => {
  it('a 3-version chain collapses to ONE node; flat sibling rows are gone', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'imp', name: 'pUC19', projectId: 'pa', origin: { kind: 'file_import' } }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e1', name: 'pUC19 v2', projectId: 'pa', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z' } }));
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'e2', name: 'pUC19 v3', projectId: 'pa', parentEntryId: 'e1', origin: { kind: 'manual_edit', parentEntryId: 'e1', editedAt: '2026-06-16T10:06:00Z' } }));
    render(<ProjectZone project={{ id: 'pa', name: 'X' }} />);
    // ONE collapsed lineage node, NOT three flat rows.
    expect(screen.getByTestId('version-lineage-imp')).toBeTruthy();
    expect(screen.getByTestId('version-lineage-imp-count').textContent).toBe('3');
    expect(screen.queryByTestId('tree-item-project-e1')).toBeNull();
    // Expand → the three versions surface.
    fireEvent.click(screen.getByTestId('version-lineage-imp-twist'));
    expect(screen.getByTestId('tree-item-version-imp')).toBeTruthy();
    expect(screen.getByTestId('tree-item-version-e1')).toBeTruthy();
    expect(screen.getByTestId('tree-item-version-e2')).toBeTruthy();
  });

  it('a standalone entry (no versions) renders as a plain row, not a lineage node', async () => {
    await useStore.getState().addLibraryEntry(makeContainer({ id: 'solo', name: 'pET28a', projectId: 'pa' }));
    render(<ProjectZone project={{ id: 'pa', name: 'X' }} />);
    expect(screen.getByTestId('tree-item-project-solo')).toBeTruthy();
    expect(screen.queryByTestId('version-lineage-solo')).toBeNull();
  });
});
