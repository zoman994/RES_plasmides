/**
 * NB-K14 — NotebookRefPickerModal.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotebookRefPickerModal, { collectItems } from '../NotebookRefPickerModal';

const STATE = {
  containers: [
    { id: 'c01', name: 'pET-28b' },
    { id: 'c02', name: 'pUC19' },
  ],
  zones: [
    { id: 'zn01', name: 'pks4-ko' },
  ],
  pieces: [
    { id: 'pc01', name: 'frag-1' },
  ],
  operations: [
    {
      id: 'op01', kind: 'pcr',
      materializedClones: [
        { cloneId: 'cl01', label: 'clone-1', sangerVerified: 'verified' },
        { cloneId: 'cl02', label: 'clone-2', sangerVerified: 'failed' },
      ],
    },
  ],
  primers: [
    { id: 'pp01', name: 'T7-fwd' },
  ],
  externalRefs: [
    { id: 'ext01', kind: 'addgene', accession: '13522', title: 'pET-28b(+) Addgene' },
  ],
};

describe('NB-K14 — collectItems (pure)', () => {
  it('containers tab → list of {id, label}', () => {
    const items = collectItems(STATE, { key: 'container', sourceKey: 'containers', refKind: 'container' });
    expect(items).toEqual([
      { id: 'c01', label: 'pET-28b' },
      { id: 'c02', label: 'pUC19' },
    ]);
  });

  it('clones tab → flat array from operations[].materializedClones', () => {
    const items = collectItems(STATE, { key: 'clone' });
    expect(items.map(i => i.id).sort()).toEqual(['cl01', 'cl02']);
  });

  it('external tab → maps title/accession to label', () => {
    const items = collectItems(STATE, { key: 'external' });
    expect(items[0].label).toBe('pET-28b(+) Addgene');
  });

  it('empty source → empty array (no throw)', () => {
    expect(collectItems({}, { key: 'container', sourceKey: 'containers' })).toEqual([]);
  });
});

describe('NB-K14 — NotebookRefPickerModal UI', () => {
  it('renders 7 tabs', () => {
    render(<NotebookRefPickerModal state={STATE} onPick={vi.fn()} onCancel={vi.fn()} />);
    for (const k of ['container', 'zone', 'piece', 'operation', 'primer', 'clone', 'external']) {
      expect(screen.getByTestId(`ref-picker-tab-${k}`)).toBeTruthy();
    }
  });

  it('default tab "container" shows containers list', () => {
    render(<NotebookRefPickerModal state={STATE} onPick={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('ref-picker-item-c01')).toBeTruthy();
    expect(screen.getByTestId('ref-picker-item-c02')).toBeTruthy();
  });

  it('switching to zones tab shows zone entries', () => {
    render(<NotebookRefPickerModal state={STATE} onPick={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ref-picker-tab-zone'));
    expect(screen.getByTestId('ref-picker-item-zn01')).toBeTruthy();
  });

  it('clicking item → onPick({kind, id})', () => {
    const onPick = vi.fn();
    render(<NotebookRefPickerModal state={STATE} onPick={onPick} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ref-picker-item-c01'));
    expect(onPick).toHaveBeenCalledWith({ kind: 'container', id: 'c01' });
  });

  it('search filter narrows the list', () => {
    render(<NotebookRefPickerModal state={STATE} onPick={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('ref-picker-search'), { target: { value: 'pUC' } });
    expect(screen.queryByTestId('ref-picker-item-c01')).toBeFalsy();
    expect(screen.getByTestId('ref-picker-item-c02')).toBeTruthy();
  });

  it('Cancel button + Esc key both call onCancel', () => {
    const onCancel = vi.fn();
    render(<NotebookRefPickerModal state={STATE} onPick={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('notebook-ref-picker-cancel'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('empty tab shows hint', () => {
    const state = { containers: [], operations: [], externalRefs: [] };
    render(<NotebookRefPickerModal state={state} onPick={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('ref-picker-empty')).toBeTruthy();
  });
});
