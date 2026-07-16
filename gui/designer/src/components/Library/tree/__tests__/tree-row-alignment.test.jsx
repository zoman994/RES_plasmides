/**
 * Tree-row alignment invariants (library tree «visual order» fix, BUGS V190).
 *
 * Биолог: «в библиотеке вразнобой — ветки и плазмиды визуальный беспорядок»
 * + «слева слишком большое пустое место около иконок».
 *
 * Root cause: a VersionLineageNode head row rendered a 12px chevron BEFORE its
 * mini-icon, while a plain TreeItemRow had none, so at the same indent a head's
 * icon sat ~20px right of a plain-plasmid icon — columns never lined up.
 *
 * Fix (this version): plain rows have NO disclosure gutter (icon sits right at
 * the indent — no wasted left margin); the head row pulls its chevron INTO the
 * indentation gutter (paddingLeft − (TWIST_W + GAP)) so the head icon lands at
 * the SAME x as a plain-row icon at the same indent. Version badges render on
 * the RIGHT (one column with the head), and the head is decluttered like a
 * folder (no redundant right-side vN chip).
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TreeItemRow from '../TreeItemRow';
import VersionLineageNode from '../VersionLineageNode';
import { groupVisibleLineages } from '../../lib/version-lineage';

afterEach(cleanup);

// Mirror of the disclosure-column constants in VersionLineageNode.
const TWIST_W = 12;
const GAP = 8;

const plasmid = {
  id: 'p1', kind: 'container', name: 'pUC18',
  payload: { length: 2686, topology: 'circular', annotations: [{}, {}] },
  origin: { kind: 'file_import' },
};

function chainGroup() {
  const a = { id: 'a', kind: 'container', name: 'pUC18', payload: { length: 2686, topology: 'circular', annotations: [] }, parentEntryId: null, origin: { kind: 'file_import' } };
  const b = { id: 'b', kind: 'container', name: 'pUC18 v2', payload: { length: 2686, topology: 'circular', annotations: [] }, parentEntryId: 'a', origin: { kind: 'manual_edit', parentEntryId: 'a', editedAt: '2026-06-16T10:05:00Z' } };
  return groupVisibleLineages({ a, b }, [a, b]).find((g) => g.count > 1);
}

const px = (s) => parseInt(String(s || '0'), 10);

describe('tree row alignment — no wasted gutter, icons aligned', () => {
  it('a plain TreeItemRow has NO twist gutter — the mini-icon is its first child', () => {
    render(<TreeItemRow entry={plasmid} testId="row" indent={2} />);
    const row = screen.getByTestId('row');
    const first = row.firstChild;
    // first child is the 20px mini-icon wrapper, not a spacer
    expect(first.tagName).toBe('SPAN');
    expect(first.style.width).toBe('20px');
  });

  it('head icon aligns with a plain-row icon at the same indent (chevron pulled into the indent)', () => {
    render(<TreeItemRow entry={plasmid} testId="row" indent={2} />);
    const plainPad = px(screen.getByTestId('row').style.paddingLeft);
    cleanup();
    render(<VersionLineageNode group={chainGroup()} expanded={false} onToggle={() => {}} indent={2} testId="vl" />);
    const headPad = px(screen.getByTestId('vl').style.paddingLeft);
    // head pulls chevron (TWIST_W) + GAP into the indent → icon x identical
    expect(headPad).toBe(plainPad - TWIST_W - GAP);
    expect(headPad + TWIST_W + GAP).toBe(plainPad);
  });
});

describe('tree row alignment — badge side + head declutter', () => {
  it('a version badge renders on the RIGHT, after the name body', () => {
    render(<TreeItemRow entry={plasmid} testId="row" badge={<span data-testid="vbadge">v2</span>} />);
    const name = screen.getByText('pUC18');
    const badge = screen.getByTestId('vbadge');
    expect(name.compareDocumentPosition(badge) & 4 /* FOLLOWING */).toBeTruthy();
  });

  it('the collapsed head shows the member count but no redundant right-side vN chip', () => {
    render(<VersionLineageNode group={chainGroup()} expanded={false} onToggle={() => {}} testId="vl" />);
    expect(screen.getByTestId('vl-count').textContent).toBe('2');
    expect(screen.getByTestId('vl').textContent).toMatch(/2 версий/);
  });
});
