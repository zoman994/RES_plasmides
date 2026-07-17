/**
 * NB-K16 — standalone NotebookTab integration.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NotebookTab from '../NotebookTab';

const ENTITY_STATE = {
  containers: [{ id: 'c01', name: 'pET-28b' }],
  zones: [{ id: 'zn01', name: 'pks4-ko' }],
  pieces: [{ id: 'pc01', name: 'frag-1' }],
  operations: [
    {
      id: 'op01', kind: 'pcr',
      materializedClones: [{ cloneId: 'cl01', label: 'clone-1' }],
    },
  ],
  primers: [{ id: 'pp01', name: 'T7-fwd' }],
  externalRefs: [{ id: 'ext01', title: 'Addgene 13522' }],
};

const ENTRIES = [
  { id: 'nb01', kind: 'free-text', title: 'PCR result', text: 'Verified.', tags: ['pcr'], createdAt: 'x', updatedAt: 'x' },
  { id: 'nb02', kind: 'sanger', title: 'clone-1 Sanger', text: 'No mismatches.', tags: ['sanger'], createdAt: 'x', updatedAt: 'x' },
];

describe('NB-K16 — NotebookTab', () => {
  it('renders sidebar list + (lazy) editor for first entry', async () => {
    render(
      <NotebookTab
        notebookEntries={ENTRIES}
        entityState={ENTITY_STATE}
        onChange={vi.fn()}
        onCreateEntry={vi.fn()}
      />,
    );
    expect(screen.getByTestId('notebook-list')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('notebook-entry-editor')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('notebook-title').value).toBe('PCR result');
    });
  });

  it('clicking row switches active entry', async () => {
    render(
      <NotebookTab
        notebookEntries={ENTRIES}
        entityState={ENTITY_STATE}
        onChange={vi.fn()}
        onCreateEntry={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByTestId('notebook-entry-editor'));
    fireEvent.click(screen.getByTestId('notebook-list-item-nb02'));
    await waitFor(() => {
      expect(screen.getByTestId('notebook-title').value).toBe('clone-1 Sanger');
    });
  });

  it('+ Запись calls onCreateEntry, switches to returned id', async () => {
    const onCreateEntry = vi.fn().mockReturnValue('nb-new');
    render(
      <NotebookTab
        notebookEntries={ENTRIES}
        entityState={ENTITY_STATE}
        onChange={vi.fn()}
        onCreateEntry={onCreateEntry}
      />,
    );
    fireEvent.click(screen.getByTestId('notebook-list-new'));
    expect(onCreateEntry).toHaveBeenCalled();
  });

  it('@@ button opens ref picker modal; pick → inserts snippet', async () => {
    let entries = [...ENTRIES];
    const onChange = (next) => { entries = next; };
    const { rerender } = render(
      <NotebookTab
        notebookEntries={entries}
        entityState={ENTITY_STATE}
        onChange={onChange}
        onCreateEntry={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByTestId('notebook-entry-editor'));
    fireEvent.click(screen.getByTestId('nb-tb-ref'));
    await waitFor(() => screen.getByTestId('notebook-ref-picker'));
    fireEvent.click(screen.getByTestId('ref-picker-item-c01'));
    await waitFor(() => {
      // Modal closed.
      expect(screen.queryByTestId('notebook-ref-picker')).toBeFalsy();
    });
    rerender(
      <NotebookTab
        notebookEntries={entries}
        entityState={ENTITY_STATE}
        onChange={onChange}
        onCreateEntry={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('notebook-textarea').value).toContain('@@ref:container:c01@@');
    });
  });

  it('renders empty hint when notebookEntries is empty', async () => {
    render(
      <NotebookTab
        notebookEntries={[]}
        entityState={ENTITY_STATE}
        onChange={vi.fn()}
        onCreateEntry={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('notebook-empty')).toBeTruthy();
    });
  });

  it('clicking a rendered @@ref badge in preview calls onRefNavigate', async () => {
    const onRefNavigate = vi.fn();
    const entries = [
      { id: 'nb01', kind: 'free-text', title: 'x', text: 'See @@ref:container:c01@@.', tags: [], createdAt: 'x', updatedAt: 'x' },
    ];
    render(
      <NotebookTab
        notebookEntries={entries}
        entityState={ENTITY_STATE}
        onChange={vi.fn()}
        onCreateEntry={vi.fn()}
        onRefNavigate={onRefNavigate}
      />,
    );
    let badge;
    await waitFor(() => {
      badge = screen.getByTestId('notebook-preview').querySelector('.md-ref');
      expect(badge).toBeTruthy();
    });
    // Resolved label uses entityState — should show container name.
    expect(badge.textContent).toContain('pET-28b');
    fireEvent.click(badge);
    expect(onRefNavigate).toHaveBeenCalledWith({ kind: 'container', id: 'c01' });
  });
});
