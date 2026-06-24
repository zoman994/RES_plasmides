/**
 * LibrarySearchBar — inline file-import affordance (Игорь «нужна
 * возможность импортировать файл прямо в пикере сборки, иначе человек
 * обязан идти в библиотеку»). Opt-in via `onImportFiles`: a button +
 * hidden file input + a drop zone on the list. The component stays
 * presentational — it only surfaces the picked File[] to the consumer
 * (AssemblyShellBody parses + adds to the library). No file-import
 * import here (keeps the align lazy chunk light).
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LibrarySearchBar from '../LibrarySearchBar';
import { _clearAllPrefs } from '../picker-prefs';

beforeEach(() => { _clearAllPrefs(); });
afterEach(() => { cleanup(); _clearAllPrefs(); });

const baseProps = {
  libraryEntries: {},
  projectsById: {},
  currentProjectId: null,
  inline: true,
  testId: 'pk',
};

function file(name, content = '>x\nACGT') {
  return new File([content], name, { type: 'text/plain' });
}

describe('LibrarySearchBar — onImportFiles affordance', () => {
  it('does NOT render the import button when onImportFiles is absent', () => {
    render(<LibrarySearchBar {...baseProps} />);
    expect(screen.queryByTestId('pk-import-btn')).toBeNull();
  });

  it('renders the import button + hidden input when onImportFiles is provided', () => {
    render(<LibrarySearchBar {...baseProps} onImportFiles={vi.fn()} />);
    expect(screen.getByTestId('pk-import-btn')).toBeTruthy();
    expect(screen.getByTestId('pk-import-input')).toBeTruthy();
  });

  it('selecting files via the input calls onImportFiles with a File array', () => {
    const onImportFiles = vi.fn();
    render(<LibrarySearchBar {...baseProps} onImportFiles={onImportFiles} />);
    const input = screen.getByTestId('pk-import-input');
    const f1 = file('a.gb');
    const f2 = file('b.fasta');
    fireEvent.change(input, { target: { files: [f1, f2] } });
    expect(onImportFiles).toHaveBeenCalledTimes(1);
    const arg = onImportFiles.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg.map((f) => f.name)).toEqual(['a.gb', 'b.fasta']);
  });

  it('dropping files on the list calls onImportFiles', () => {
    const onImportFiles = vi.fn();
    render(<LibrarySearchBar {...baseProps} onImportFiles={onImportFiles} />);
    const list = screen.getByTestId('pk-list');
    fireEvent.drop(list, { dataTransfer: { files: [file('dropped.dna')] } });
    expect(onImportFiles).toHaveBeenCalledTimes(1);
    expect(onImportFiles.mock.calls[0][0][0].name).toBe('dropped.dna');
  });

  it('a drop with NO files (e.g. an entry drag) does not call onImportFiles', () => {
    const onImportFiles = vi.fn();
    render(<LibrarySearchBar {...baseProps} onImportFiles={onImportFiles} />);
    const list = screen.getByTestId('pk-list');
    fireEvent.drop(list, { dataTransfer: { files: [], getData: () => 'some-entry-id' } });
    expect(onImportFiles).not.toHaveBeenCalled();
  });

  it('empty selection is a no-op', () => {
    const onImportFiles = vi.fn();
    render(<LibrarySearchBar {...baseProps} onImportFiles={onImportFiles} />);
    fireEvent.change(screen.getByTestId('pk-import-input'), { target: { files: [] } });
    expect(onImportFiles).not.toHaveBeenCalled();
  });
});
