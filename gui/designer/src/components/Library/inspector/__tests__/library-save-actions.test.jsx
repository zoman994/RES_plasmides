/**
 * library-save-actions.test.jsx — version-only save (Игорь 17.06.2026).
 * «Перезаписать» removed; «Сохранить версию» commits the edited SEQUENCE
 * + annotations to a NEW branch via createManualEditBranch (source
 * untouched), with the «что изменено» list + name + reason form.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import LibrarySaveActions from '../LibrarySaveActions';
import { useStore } from '../../../../store';

afterEach(cleanup);

const base = {
  libraryEntryId: 'x1',
  hasChanges: true,
  editedSequence: 'ATGCT',
  editedAnnotations: [],
  parentName: 'pUC19',
  onAfterSaveAsVersion: () => {},
};

describe('LibrarySaveActions — version-only save + что изменено', () => {
  it('shows the «что изменено» summary chip', () => {
    render(<LibrarySaveActions {...base} changesSummary={['замена 1: A→T']} changeText="замена 1: A→T" />);
    expect(screen.getByTestId('library-changes-summary').textContent).toContain('замена 1: A→T');
  });

  it('has NO «Перезаписать» button (version-only)', () => {
    render(<LibrarySaveActions {...base} changesSummary={['вставка 5: «A»']} />);
    expect(screen.queryByTestId('library-save-overwrite')).toBeNull();
    expect(screen.getByTestId('library-save-as-version')).toBeTruthy();
  });

  it('version modal lists «что изменено» + has name + reason fields', () => {
    render(<LibrarySaveActions {...base} changesSummary={['замена 1: A→T', 'вставка 5: «A»']} changeText="замена 1: A→T; вставка 5: «A»" />);
    fireEvent.click(screen.getByTestId('library-save-as-version'));
    expect(screen.getByTestId('library-version-changes')).toBeTruthy();
    expect(screen.getByTestId('library-save-version-name')).toBeTruthy();
    expect(screen.getByTestId('library-save-version-reason')).toBeTruthy();
    expect(screen.getByTestId('library-version-changes').textContent).toContain('вставка 5');
  });

  it('offers a version/branch choice (default = версия)', () => {
    render(<LibrarySaveActions {...base} />);
    fireEvent.click(screen.getByTestId('library-save-as-version'));
    const version = screen.getByTestId('library-save-role-version');
    const branch = screen.getByTestId('library-save-role-branch');
    expect(version.checked).toBe(true);
    expect(branch.checked).toBe(false);
  });
});

describe('LibrarySaveActions — createManualEditBranch dispatch', () => {
  beforeEach(() => {
    useStore.setState({
      libraryEntries: { x1: { id: 'x1', kind: 'container', name: 'pUC19', payload: { sequence: 'ATGC', topology: 'linear', annotations: [] } } },
    });
  });

  it('«Сохранить версию» commits edited SEQUENCE to a new branch, source untouched', async () => {
    const onAfter = vi.fn();
    render(
      <LibrarySaveActions
        {...base}
        editedSequence="ATGCTT"
        changesSummary={['вставка 5–6: «TT»']}
        changeText="вставка 5–6: «TT»"
        onAfterSaveAsVersion={onAfter}
      />,
    );
    fireEvent.click(screen.getByTestId('library-save-as-version'));
    fireEvent.change(screen.getByTestId('library-save-version-name'), { target: { value: 'pUC19 · испр.' } });
    fireEvent.click(screen.getByTestId('library-save-version-submit'));

    await waitFor(() => expect(onAfter).toHaveBeenCalled());
    const entries = Object.values(useStore.getState().libraryEntries);
    // parent untouched
    expect(useStore.getState().libraryEntries.x1.payload.sequence).toBe('ATGC');
    // a NEW branch with the edited sequence + provenance
    const branch = entries.find((e) => e.id !== 'x1' && e.parentEntryId === 'x1');
    expect(branch).toBeTruthy();
    expect(branch.payload.sequence).toBe('ATGCTT');
    expect(branch.origin.kind).toBe('manual_edit');
    expect(branch.origin.changes).toContain('вставка');
    // default role = версия → mainline
    expect(branch.origin.lineageRole).toBe('version');
  });

  it('choosing «ветка» stamps origin.lineageRole = branch', async () => {
    const onAfter = vi.fn();
    render(
      <LibrarySaveActions
        {...base}
        editedSequence="ATGCAA"
        changeText="вставка"
        onAfterSaveAsVersion={onAfter}
      />,
    );
    fireEvent.click(screen.getByTestId('library-save-as-version'));
    fireEvent.click(screen.getByTestId('library-save-role-branch'));
    fireEvent.change(screen.getByTestId('library-save-version-name'), { target: { value: 'pUC19 · вариант' } });
    fireEvent.click(screen.getByTestId('library-save-version-submit'));
    await waitFor(() => expect(onAfter).toHaveBeenCalled());
    const branch = Object.values(useStore.getState().libraryEntries).find((e) => e.id !== 'x1' && e.parentEntryId === 'x1' && e.origin?.lineageRole === 'branch');
    expect(branch).toBeTruthy();
  });
});
